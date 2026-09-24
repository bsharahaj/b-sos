import { STATUSES, VERIFICATION } from '../../../shared/constants.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { HttpError } from '../utils/httpError.js';
import { haversineM } from '../utils/geo.js';
import { emitToSos, emitToUser, joinUserToSos } from '../socket/emitter.js';
import { positions } from './positions.js';

// Single source of truth for the SOS state machine (CLAUDE.md §4):
// OPEN -> ACCEPTED -> EN_ROUTE -> ARRIVED -> RESOLVED, or CANCELLED from any non-final state.
export const TRANSITIONS = Object.freeze({
  [STATUSES.OPEN]: [STATUSES.ACCEPTED, STATUSES.CANCELLED],
  [STATUSES.ACCEPTED]: [STATUSES.EN_ROUTE, STATUSES.CANCELLED],
  [STATUSES.EN_ROUTE]: [STATUSES.ARRIVED, STATUSES.CANCELLED],
  [STATUSES.ARRIVED]: [STATUSES.RESOLVED, STATUSES.CANCELLED],
  [STATUSES.RESOLVED]: [],
  [STATUSES.CANCELLED]: [],
});

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// Who may cancel, and from which statuses. Once the helper has arrived, cancelling makes no sense: resolve instead.
export const REQUESTER_CANCELLABLE = Object.freeze([STATUSES.OPEN, STATUSES.ACCEPTED]);
export const HELPER_CANCELLABLE = Object.freeze([STATUSES.ACCEPTED, STATUSES.EN_ROUTE]);

const BUSY_STATUSES = [STATUSES.ACCEPTED, STATUSES.EN_ROUTE, STATUSES.ARRIVED];

// Rough ETA for the requester's screen: straight-line distance at ~20 km/h (urban driving with stops).
const ETA_METRES_PER_MIN = 333;

const notFound = () => new HttpError(404, 'SOS_NOT_FOUND', 'This SOS does not exist.');

const NOT_CANCELLABLE_MESSAGE = {
  [STATUSES.RESOLVED]: 'This SOS is already resolved.',
  [STATUSES.CANCELLED]: 'This SOS was already cancelled.',
  [STATUSES.ARRIVED]: 'Your helper has already arrived. Mark the SOS as resolved instead.',
  [STATUSES.EN_ROUTE]: 'Your helper is already on the way. Please wait for them to arrive.',
};

// ---------- Accept ----------

// Exactly one helper wins (CLAUDE.md §4 "Accept"): inside a transaction the SOS row is locked with
// SELECT ... FOR UPDATE, so two helpers tapping at the same instant are serialised; the second one
// re-reads the row, sees ACCEPTED, and gets 409 SOS_TAKEN. Nothing is emitted until the commit succeeded.
export async function acceptSos(sosId, helperId) {
  const helper = await prisma.user.findUnique({
    where: { id: helperId },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      ratingAvg: true,
      isBanned: true,
      isSuspended: true,
      helperProfile: { select: { verificationStatus: true, lat: true, lng: true } },
      sosHelped: { where: { status: { in: BUSY_STATUSES } }, select: { id: true }, take: 1 },
    },
  });
  if (!helper) throw new HttpError(401, 'INVALID_TOKEN', 'Your account no longer exists. Please log in again.');
  if (helper.isBanned || helper.isSuspended) {
    throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'Your account is under review, so you cannot help right now.');
  }
  if (helper.sosHelped.length > 0) {
    throw new HttpError(409, 'HELPER_BUSY', 'Finish the SOS you are already helping with before accepting another.', {
      activeSosId: helper.sosHelped[0].id,
    });
  }

  const alerted = await prisma.sosNotification.findFirst({ where: { sosId, helperId }, select: { id: true } });
  if (!alerted) throw notFound(); // same answer as an unknown id: the helper was never told about this SOS

  const { sos, losers } = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw`SELECT id, status, requester_id AS "requesterId", lat, lng FROM sos_requests WHERE id = ${sosId} FOR UPDATE`;
    if (!locked) throw notFound();
    if (locked.status !== STATUSES.OPEN) {
      if (BUSY_STATUSES.includes(locked.status)) {
        throw new HttpError(409, 'SOS_TAKEN', 'Another helper already accepted this SOS. Thank you for responding.');
      }
      throw new HttpError(409, 'SOS_NOT_OPEN', 'This SOS is no longer open.');
    }
    if (locked.requesterId === helperId) throw new HttpError(403, 'OWN_SOS', 'You cannot accept your own SOS.');

    const now = new Date();
    const updated = await tx.sosRequest.update({
      where: { id: sosId },
      data: { status: STATUSES.ACCEPTED, helperId, acceptedAt: now },
      select: { id: true, requesterId: true, lat: true, lng: true, acceptedAt: true },
    });
    await tx.sosNotification.update({ where: { id: alerted.id }, data: { response: 'ACCEPT', seenAt: now } });
    const others = await tx.sosNotification.findMany({
      where: { sosId, helperId: { not: helperId }, response: 'NONE' },
      select: { helperId: true },
    });
    return { sos: updated, losers: others.map((n) => n.helperId) };
  });

  // Committed: tell everyone. Rooms first, so the two parties get the status events that follow.
  joinUserToSos(helperId, sosId);
  joinUserToSos(sos.requesterId, sosId);

  const helperPos = positions.get(helperId) ?? (helper.helperProfile?.lat != null ? helper.helperProfile : null);
  const etaMin = helperPos ? Math.max(1, Math.ceil(haversineM(helperPos, sos) / ETA_METRES_PER_MIN)) : null;

  emitToUser(sos.requesterId, 'sos:accepted', {
    sosId,
    helper: {
      id: helper.id,
      name: helper.name,
      photoUrl: helper.photoUrl,
      ratingAvg: helper.ratingAvg,
      verified: helper.helperProfile?.verificationStatus === VERIFICATION.VERIFIED,
    },
    etaMin,
  });
  for (const loserId of losers) emitToUser(loserId, 'sos:taken', { sosId });
  emitToSos(sosId, 'sos:status', { sosId, status: STATUSES.ACCEPTED, at: sos.acceptedAt });

  logger.info({ sosId, helperId, losers: losers.length }, 'SOS accepted');
  return { etaMin };
}

// A helper clears an alert they can't take. Nothing changes on the SOS itself.
export async function declineSos(sosId, helperId) {
  const { count } = await prisma.sosNotification.updateMany({
    where: { sosId, helperId, response: 'NONE' },
    data: { response: 'DECLINE', seenAt: new Date() },
  });
  if (count === 0) {
    const exists = await prisma.sosNotification.findFirst({ where: { sosId, helperId }, select: { response: true } });
    if (!exists) throw notFound();
    throw new HttpError(409, 'ALREADY_ANSWERED', 'You already answered this alert.');
  }
}

// ---------- Progress: EN_ROUTE -> ARRIVED -> RESOLVED ----------

// The assigned helper reports progress; either party may mark it resolved once the helper has arrived.
const HELPER_ONLY = [STATUSES.EN_ROUTE, STATUSES.ARRIVED];
const TIMESTAMP_FIELD = { [STATUSES.EN_ROUTE]: 'enRouteAt', [STATUSES.ARRIVED]: 'arrivedAt', [STATUSES.RESOLVED]: 'resolvedAt' };

export async function progressSos(sosId, userId, to) {
  const sos = await prisma.sosRequest.findUnique({
    where: { id: sosId },
    select: { id: true, status: true, requesterId: true, helperId: true },
  });
  if (!sos) throw notFound();

  const isRequester = sos.requesterId === userId;
  const isHelper = sos.helperId === userId;
  if (!isRequester && !isHelper) throw new HttpError(403, 'NOT_YOUR_SOS', 'Only the requester or the assigned helper can update this SOS.');
  if (HELPER_ONLY.includes(to) && !isHelper) throw new HttpError(403, 'HELPER_ONLY', 'Only the helper can report this step.');

  if (!canTransition(sos.status, to)) {
    throw new HttpError(409, 'INVALID_TRANSITION', progressMessage(sos.status, to), { from: sos.status, to });
  }

  // Conditional update guards against a concurrent change (e.g. a cancel racing this step).
  const at = new Date();
  const { count } = await prisma.sosRequest.updateMany({
    where: { id: sosId, status: sos.status },
    data: { status: to, [TIMESTAMP_FIELD[to]]: at },
  });
  if (count === 0) throw new HttpError(409, 'INVALID_TRANSITION', 'This SOS just changed. Please check its status.', { from: sos.status, to });

  if (to === STATUSES.RESOLVED) await recordFinalPosition(sosId, sos.helperId, at);

  emitToSos(sosId, 'sos:status', { sosId, status: to, at });
  logger.info({ sosId, userId, from: sos.status, to }, 'SOS progressed');
  return { status: to, at };
}

function progressMessage(from, to) {
  if (from === STATUSES.RESOLVED || from === STATUSES.CANCELLED) return 'This SOS is already closed.';
  if (to === STATUSES.RESOLVED) return 'Mark the SOS as resolved once the helper has arrived.';
  if (from === STATUSES.OPEN) return 'No helper has accepted this SOS yet.';
  return `You can't go from ${from.toLowerCase().replace('_', ' ')} to ${to.toLowerCase().replace('_', ' ')}.`;
}

// Live pings never touch Postgres; on resolve, one final sample of the helper's position is kept
// (CLAUDE.md §4 "Live positions"), which is what history and disputes need.
async function recordFinalPosition(sosId, helperId, recordedAt) {
  const pos = helperId ? positions.get(helperId) : null;
  if (!pos) return;
  await prisma.locationUpdate.create({ data: { sosId, userId: helperId, lat: pos.lat, lng: pos.lng, recordedAt } });
}

// ---------- Cancel ----------

export async function cancelSos(sosId, userId, reason) {
  const sos = await prisma.sosRequest.findUnique({
    where: { id: sosId },
    select: { id: true, status: true, requesterId: true, helperId: true },
  });
  if (!sos) throw notFound();

  const isRequester = sos.requesterId === userId;
  const isHelper = sos.helperId === userId;
  if (!isRequester && !isHelper) throw new HttpError(403, 'NOT_YOUR_SOS', 'Only the requester or the assigned helper can cancel this SOS.');

  const allowedFrom = isRequester ? REQUESTER_CANCELLABLE : HELPER_CANCELLABLE;
  if (!allowedFrom.includes(sos.status)) {
    throw new HttpError(409, 'SOS_NOT_CANCELLABLE', NOT_CANCELLABLE_MESSAGE[sos.status] ?? 'This SOS can no longer be cancelled.');
  }

  // Conditional update: if the status changed between our read and this write (e.g. a helper accepted
  // at the same moment), nothing is updated and we report the conflict instead of clobbering it.
  const cancelledAt = new Date();
  const { count } = await prisma.sosRequest.updateMany({
    where: { id: sosId, status: { in: allowedFrom } },
    data: { status: STATUSES.CANCELLED, cancelledAt, cancelledBy: userId, cancelReason: reason ?? null },
  });
  if (count === 0) throw new HttpError(409, 'SOS_NOT_CANCELLABLE', 'This SOS just changed. Please check its status.');

  // Alerted helpers who haven't answered lose the alert; the other party learns the status changed.
  const pending = await prisma.sosNotification.findMany({ where: { sosId, response: 'NONE' }, select: { helperId: true } });
  for (const { helperId } of pending) emitToUser(helperId, 'sos:taken', { sosId });
  emitToSos(sosId, 'sos:status', { sosId, status: STATUSES.CANCELLED, at: cancelledAt });

  return { cancelledBy: isRequester ? 'REQUESTER' : 'HELPER' };
}
