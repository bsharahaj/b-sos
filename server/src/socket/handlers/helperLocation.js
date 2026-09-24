import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { positions, shouldPersist } from '../../services/positions.js';

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(100_000).optional(),
});

// `helper:location` { lat, lng, accuracy } every 3–5 s from an available helper.
// 1. Keep the latest sample in the live store (every ping).
// 2. Occasionally copy it to HelperProfile so matching (which queries Postgres) sees a fresh position.
//    Only while the profile is available: an unavailable helper must not become matchable by mistake.
// 3. Forwarding to the requester of an active SOS is added with live tracking.
// The optional ack tells the client whether the sample was accepted ({ ok } or { ok: false, code }).
export function registerHelperLocationHandler(io, socket) {
  const { userId } = socket.data;

  socket.on('helper:location', async (payload, ack) => {
    const parsed = locationSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, code: 'INVALID_LOCATION' });
      return;
    }

    const now = Date.now();
    const entry = positions.set(userId, parsed.data, now);

    if (shouldPersist(entry, now)) {
      try {
        const { count } = await prisma.helperProfile.updateMany({
          where: { userId, isAvailable: true },
          data: { lat: parsed.data.lat, lng: parsed.data.lng, lastSeenAt: new Date(now) },
        });
        if (count > 0) positions.markPersisted(userId, now);
      } catch (err) {
        // Losing one persisted sample is harmless; the next ping retries. Don't drop the socket for it.
        logger.warn({ err, userId }, 'Could not persist helper position');
      }
    }

    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    // Other sockets of the same user may still be sending; only forget the position when the last one leaves.
    const stillConnected = io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0;
    if (stillConnected === 0) positions.delete(userId);
  });
}
