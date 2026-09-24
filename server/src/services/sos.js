import { STATUSES } from '../../../shared/constants.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { HttpError } from '../utils/httpError.js';
import { COARSE_RADIUS_M, coarsen, haversineM } from '../utils/geo.js';
import { alertHelpersForSos } from './notifications.js';
import { positions } from './positions.js';

export const MAX_SOS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Non-final statuses: a requester may have at most one SOS in any of these.
const ACTIVE_STATUSES = [STATUSES.OPEN, STATUSES.ACCEPTED, STATUSES.EN_ROUTE, STATUSES.ARRIVED];

// The assigned helper sees the exact point only while the SOS is in progress (CLAUDE.md §4 privacy).
const HELPER_EXACT_STATUSES = [STATUSES.ACCEPTED, STATUSES.EN_ROUTE, STATUSES.ARRIVED];

// What anyone viewing an SOS may learn about its requester.
const REQUESTER_PUBLIC_SELECT = { id: true, name: true, photoUrl: true, ratingAvg: true, ratingCount: true };

const SOS_SELECT = {
  id: true,
  requesterId: true,
  helperId: true,
  type: true,
  description: true,
  photoUrl: true,
  lat: true,
  lng: true,
  accuracyM: true,
  status: true,
  createdAt: true,
  acceptedAt: true,
  enRouteAt: true,
  arrivedAt: true,
  resolvedAt: true,
  cancelledAt: true,
  requester: { select: REQUESTER_PUBLIC_SELECT },
};

export async function createSos(userId, input) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneVerified: true, isBanned: true, isSuspended: true },
  });
  if (!user) throw new HttpError(401, 'INVALID_TOKEN', 'Your account no longer exists. Please log in again.');
  if (user.isBanned || user.isSuspended) {
    throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'Your account is under review. In an emergency, call emergency services.');
  }
  if (!user.phoneVerified) {
    throw new HttpError(403, 'PHONE_NOT_VERIFIED', 'Verify your phone number before sending an SOS.');
  }

  // Checks + insert must be atomic, or parallel requests could all see "no active SOS" and all insert.
  // A transaction-scoped advisory lock keyed on the user serialises this block per user only;
  // Postgres releases it automatically at commit/rollback.
  const sos = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const active = await tx.sosRequest.findFirst({
      where: { requesterId: userId, status: { in: ACTIVE_STATUSES } },
      select: { id: true, status: true },
    });
    if (active) {
      throw new HttpError(409, 'ACTIVE_SOS_EXISTS', 'You already have an SOS in progress. Open it, or cancel it before sending a new one.', {
        activeSosId: active.id,
        status: active.status,
      });
    }

    const sentToday = await tx.sosRequest.count({
      where: { requesterId: userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (sentToday >= MAX_SOS_PER_DAY) {
      throw new HttpError(
        429,
        'SOS_DAILY_LIMIT',
        `You can send up to ${MAX_SOS_PER_DAY} SOS requests in 24 hours. In an emergency, call emergency services.`,
      );
    }

    return tx.sosRequest.create({
      data: { ...input, requesterId: userId, status: STATUSES.OPEN },
      select: SOS_SELECT,
    });
  });

  // The SOS exists from here on; a failure while alerting must not turn into an error for the requester.
  try {
    await alertHelpersForSos(sos, { round: 1 });
  } catch (err) {
    logger.error({ err, sosId: sos.id }, 'Alerting helpers failed');
  }

  return { sos: toSosView(sos, userId) };
}

// Readable by the requester, the assigned helper, and helpers who were alerted about it.
// Everyone else gets the same 404 as an unknown id, so the endpoint can't be used to probe for SOS.
// TODO(admin): allow ADMIN role when the admin API lands.
export async function getSos(sosId, viewerId) {
  const sos = await prisma.sosRequest.findUnique({
    where: { id: sosId },
    select: { ...SOS_SELECT, notifications: { where: { helperId: viewerId }, select: { id: true }, take: 1 } },
  });
  const involved = sos && (sos.requesterId === viewerId || sos.helperId === viewerId || sos.notifications.length > 0);
  if (!involved) throw new HttpError(404, 'SOS_NOT_FOUND', 'This SOS does not exist.');

  const { notifications, ...record } = sos;
  return { sos: toSosView(record, viewerId) };
}

// Open SOS this helper was alerted about and hasn't answered yet, newest first, with the distance from
// the helper's last known position (live store first, then the persisted profile position).
export async function listAlerts(helperId) {
  const notes = await prisma.sosNotification.findMany({
    where: { helperId, response: 'NONE', sos: { status: STATUSES.OPEN } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true, sos: { select: SOS_SELECT } },
  });

  let me = positions.get(helperId);
  if (!me && notes.length > 0) {
    const profile = await prisma.helperProfile.findUnique({ where: { userId: helperId }, select: { lat: true, lng: true } });
    if (profile?.lat != null) me = profile;
  }

  return {
    alerts: notes.map(({ sentAt, sos }) => ({
      sentAt,
      distanceM: me ? Math.round(haversineM(me, sos)) : null,
      sos: toSosView(sos, helperId),
    })),
  };
}

function canSeeExactLocation(sos, viewerId) {
  if (sos.requesterId === viewerId) return true;
  return sos.helperId === viewerId && HELPER_EXACT_STATUSES.includes(sos.status);
}

// Shapes an SOS for one viewer. The raw lat/lng never leave this function for other viewers.
function toSosView(sos, viewerId) {
  const { lat, lng, accuracyM, requesterId, helperId, ...rest } = sos;

  const location = canSeeExactLocation(sos, viewerId)
    ? { precision: 'EXACT', lat, lng, accuracyM }
    : { precision: 'APPROXIMATE', ...coarsen(lat, lng), radiusM: COARSE_RADIUS_M };

  return { ...rest, location };
}
