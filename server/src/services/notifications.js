import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { findMatchingHelpers } from './matching.js';
import { emitToUser } from '../socket/emitter.js';

// Alerts the helpers matched for an SOS in one escalation round:
// 1. pick them (matching.js), 2. record a SosNotification per helper (so they're never alerted twice and
// can read the SOS), 3. emit `sos:new` to each helper's own room.
// `sos` needs id, type, lat, lng, requesterId, createdAt and requester.ratingAvg (SOS_SELECT has them).
// Returns the helpers alerted: [{ helperId, distanceM, verified }].
export async function alertHelpersForSos(sos, { round = 1 } = {}) {
  const helpers = await findMatchingHelpers(sos, { round });
  if (helpers.length === 0) {
    logger.info({ sosId: sos.id, round }, 'No helpers matched');
    return [];
  }

  await prisma.sosNotification.createMany({
    data: helpers.map((h) => ({ sosId: sos.id, helperId: h.helperId, channel: 'SOCKET', round })),
    skipDuplicates: true,
  });

  const base = { sosId: sos.id, type: sos.type, requesterRating: sos.requester?.ratingAvg ?? 0, createdAt: sos.createdAt };
  for (const h of helpers) emitToUser(h.helperId, 'sos:new', { ...base, distanceM: h.distanceM });

  logger.info({ sosId: sos.id, round, count: helpers.length }, 'Helpers alerted');
  return helpers;
}
