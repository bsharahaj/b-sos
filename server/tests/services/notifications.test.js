import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { alertHelpersForSos } from '../../src/services/notifications.js';
import { setIo } from '../../src/socket/emitter.js';

// Tel Aviv centre; ~0.009° latitude ≈ 1 km.
const center = { lat: 32.08534, lng: 34.78176 };

let emitted;
beforeEach(async () => {
  await resetDb();
  emitted = [];
  setIo({ to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) });
});
afterAll(() => {
  setIo(null);
  return prisma.$disconnect();
});

async function helperAt(latOffsetKm, overrides = {}) {
  const { user } = await createUser({ phone: `+97250${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` });
  await prisma.helperProfile.create({
    data: { userId: user.id, skills: ['GENERAL'], isAvailable: true, lat: center.lat + latOffsetKm * 0.009, lng: center.lng, lastSeenAt: new Date(), ...overrides },
  });
  return user;
}

async function sosBy(requester, type = 'VEHICLE') {
  return prisma.sosRequest.create({
    data: { requesterId: requester.id, type, ...center, accuracyM: 10, status: 'OPEN' },
    select: { id: true, type: true, lat: true, lng: true, requesterId: true, createdAt: true, requester: { select: { ratingAvg: true } } },
  });
}

describe('alertHelpersForSos', () => {
  it('records a notification and emits sos:new to each matched helper, nearest first', async () => {
    const { user: requester } = await createUser({ phoneVerified: true, ratingAvg: 4.5 });
    const near = await helperAt(0.5);
    const nearer = await helperAt(0.2);
    await helperAt(8); // outside the 3 km first round
    await helperAt(0.3, { isAvailable: false });
    const sos = await sosBy(requester);

    const alerted = await alertHelpersForSos(sos);

    expect(alerted.map((h) => h.helperId)).toEqual([nearer.id, near.id]);
    expect(await prisma.sosNotification.count({ where: { sosId: sos.id } })).toBe(2);
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toMatchObject({
      room: `user:${nearer.id}`,
      event: 'sos:new',
      payload: { sosId: sos.id, type: 'VEHICLE', requesterRating: 4.5, distanceM: expect.any(Number) },
    });
    expect(emitted[0].payload.distanceM).toBeLessThan(emitted[1].payload.distanceM);
  });

  it('does nothing when nobody matches', async () => {
    const { user: requester } = await createUser({ phoneVerified: true });
    const sos = await sosBy(requester);

    expect(await alertHelpersForSos(sos)).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('never alerts the same helper twice for one SOS', async () => {
    const { user: requester } = await createUser({ phoneVerified: true });
    await helperAt(0.5);
    const sos = await sosBy(requester);

    await alertHelpersForSos(sos);
    const second = await alertHelpersForSos(sos, { round: 2 });

    expect(second).toEqual([]);
    expect(await prisma.sosNotification.count({ where: { sosId: sos.id } })).toBe(1);
  });
});
