import { z } from 'zod';
import { STATUSES } from '../../../../shared/constants.js';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { positions, shouldPersist } from '../../services/positions.js';

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(100_000).optional(),
});

const HELPING_STATUSES = [STATUSES.ACCEPTED, STATUSES.EN_ROUTE, STATUSES.ARRIVED];
// How long to trust the cached "which SOS is this helper assigned to" answer before asking Postgres again.
const ASSIGNMENT_CACHE_MS = 10 * 1000;

// `helper:location` { lat, lng, accuracy } every 3–5 s from an available helper.
// 1. Keep the latest sample in the live store (every ping).
// 2. Occasionally copy it to HelperProfile so matching (which queries Postgres) sees a fresh position.
//    Only while the profile is available: an unavailable helper must not become matchable by mistake.
// 3. If the helper is assigned to an active SOS, forward the sample to that SOS's room as
//    `sos:helper-location` — the requester is in that room, nobody else (CLAUDE.md §4 privacy).
// The optional ack tells the client whether the sample was accepted ({ ok } or { ok: false, code }).
export function registerHelperLocationHandler(io, socket) {
  const { userId } = socket.data;
  let assignment = { sosId: null, checkedAt: 0 };

  const activeSosId = async (now) => {
    if (now - assignment.checkedAt < ASSIGNMENT_CACHE_MS) return assignment.sosId;
    const sos = await prisma.sosRequest.findFirst({
      where: { helperId: userId, status: { in: HELPING_STATUSES } },
      select: { id: true },
    });
    assignment = { sosId: sos?.id ?? null, checkedAt: now };
    return assignment.sosId;
  };

  socket.on('helper:location', async (payload, ack) => {
    const parsed = locationSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, code: 'INVALID_LOCATION' });
      return;
    }

    const now = Date.now();
    const { lat, lng } = parsed.data;
    const entry = positions.set(userId, parsed.data, now);

    try {
      if (shouldPersist(entry, now)) {
        const { count } = await prisma.helperProfile.updateMany({
          where: { userId, isAvailable: true },
          data: { lat, lng, lastSeenAt: new Date(now) },
        });
        if (count > 0) positions.markPersisted(userId, now);
      }

      const sosId = await activeSosId(now);
      if (sosId) io.to(`sos:${sosId}`).emit('sos:helper-location', { sosId, lat, lng, at: new Date(now) });
    } catch (err) {
      // Losing one sample is harmless; the next ping retries. Don't drop the socket for it.
      logger.warn({ err, userId }, 'Could not process helper position');
    }

    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    // Other sockets of the same user may still be sending; only forget the position when the last one leaves.
    const stillConnected = io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0;
    if (stillConnected === 0) positions.delete(userId);
  });
}
