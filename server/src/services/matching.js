import { RADII, SOS_TYPES, STATUSES, TYPE_TO_SKILLS, VERIFICATION } from '../../../shared/constants.js';
import { prisma } from '../config/prisma.js';
import { boundingBox, haversineM } from '../utils/geo.js';

export const MAX_HELPERS_PER_ROUND = 15;
export const HELPER_FRESH_MS = 10 * 60 * 1000;

// A helper already assigned to one of these is busy and is not alerted about new SOS.
const BUSY_STATUSES = [STATUSES.ACCEPTED, STATUSES.EN_ROUTE, STATUSES.ARRIVED];

// Finds the helpers to alert for an SOS in a given escalation round (CLAUDE.md §4 "Matching").
// Returns [{ helperId, distanceM, verified }], best first, at most MAX_HELPERS_PER_ROUND.
// Helpers already notified about this SOS (earlier rounds) are skipped.
export async function findMatchingHelpers(sos, { round = 1, now = new Date() } = {}) {
  const radiusKm = RADII[round];
  if (!radiusKm) throw new Error(`Unknown matching round: ${round}`);
  const radiusM = radiusKm * 1000;
  const box = boundingBox(sos.lat, sos.lng, radiusM);

  const candidates = await prisma.helperProfile.findMany({
    where: {
      isAvailable: true,
      lastSeenAt: { gte: new Date(now.getTime() - HELPER_FRESH_MS) },
      skills: { hasSome: [...TYPE_TO_SKILLS[sos.type]] },
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
      user: {
        id: { not: sos.requesterId },
        isBanned: false,
        isSuspended: false,
        notifications: { none: { sosId: sos.id } },
        sosHelped: { none: { status: { in: BUSY_STATUSES } } },
      },
    },
    select: { userId: true, lat: true, lng: true, verificationStatus: true },
  });

  return rankHelpers(sos, candidates, radiusM).slice(0, MAX_HELPERS_PER_ROUND);
}

// Pure: exact distance filter + ordering. Verified professionals go first for MEDICAL only.
export function rankHelpers(sos, candidates, radiusM) {
  const verifiedFirst = sos.type === SOS_TYPES.MEDICAL;

  return candidates
    .map((c) => ({
      helperId: c.userId,
      distanceM: Math.round(haversineM(sos, c)),
      verified: c.verificationStatus === VERIFICATION.VERIFIED,
    }))
    .filter((h) => h.distanceM <= radiusM)
    .sort((a, b) => {
      if (verifiedFirst && a.verified !== b.verified) return a.verified ? -1 : 1;
      return a.distanceM - b.distanceM;
    });
}
