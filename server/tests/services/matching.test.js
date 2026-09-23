import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { findMatchingHelpers, HELPER_FRESH_MS, MAX_HELPERS_PER_ROUND, rankHelpers } from '../../src/services/matching.js';
import { prisma, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';

// Tel Aviv. 0.009° of latitude ≈ 1 km.
const CENTRE = { lat: 32.08, lng: 34.78 };
const kmNorth = (km) => ({ lat: CENTRE.lat + km * 0.009, lng: CENTRE.lng });

let requester;

beforeEach(async () => {
  await resetDb();
  ({ user: requester } = await createUser());
});
afterAll(() => prisma.$disconnect());

async function createSos(overrides = {}) {
  return prisma.sosRequest.create({
    data: { requesterId: requester.id, type: 'MEDICAL', ...CENTRE, accuracyM: 10, ...overrides },
  });
}

// An available, fresh helper at `km` north of the centre. Overrides split into profile / user fields.
async function createHelper(km, { user = {}, ...profile } = {}) {
  const { user: u } = await createUser(user);
  await prisma.helperProfile.create({
    data: { userId: u.id, skills: ['GENERAL'], isAvailable: true, lastSeenAt: new Date(), ...kmNorth(km), ...profile },
  });
  return u;
}

const ids = (matches) => matches.map((m) => m.helperId);

describe('findMatchingHelpers', () => {
  it('returns nearby available helpers with matching skills, nearest first, with distance', async () => {
    const far = await createHelper(2);
    const near = await createHelper(0.5, { skills: ['MEDICAL'] });
    const sos = await createSos();

    const matches = await findMatchingHelpers(sos);

    expect(ids(matches)).toEqual([near.id, far.id]);
    expect(matches[0].distanceM).toBeGreaterThan(450);
    expect(matches[0].distanceM).toBeLessThan(550);
  });

  it('skips helpers who are unavailable, stale, located nowhere, or lack a matching skill', async () => {
    await createHelper(1, { isAvailable: false });
    await createHelper(1, { lastSeenAt: new Date(Date.now() - HELPER_FRESH_MS - 1000) });
    await createHelper(1, { lastSeenAt: null });
    await createHelper(1, { lat: null, lng: null });
    await createHelper(1, { skills: ['MECHANIC'] }); // MEDICAL needs MEDICAL or GENERAL
    const ok = await createHelper(1);
    const sos = await createSos();

    expect(ids(await findMatchingHelpers(sos))).toEqual([ok.id]);
  });

  it('skips banned and suspended users and the requester themselves', async () => {
    await createHelper(1, { user: { isBanned: true } });
    await createHelper(1, { user: { isSuspended: true } });
    await prisma.helperProfile.create({
      data: { userId: requester.id, skills: ['GENERAL'], isAvailable: true, lastSeenAt: new Date(), ...kmNorth(1) },
    });
    const sos = await createSos();

    expect(await findMatchingHelpers(sos)).toEqual([]);
  });

  it('skips helpers already busy on another active SOS', async () => {
    const busy = await createHelper(1);
    const free = await createHelper(1.5);
    const { user: other } = await createUser();
    await prisma.sosRequest.create({
      data: { requesterId: other.id, helperId: busy.id, status: 'EN_ROUTE', type: 'OTHER', ...CENTRE },
    });
    const sos = await createSos();

    expect(ids(await findMatchingHelpers(sos))).toEqual([free.id]);
  });

  it('uses the round radius: 3 km, then 5 km, then 10 km', async () => {
    const h2 = await createHelper(2);
    const h4 = await createHelper(4);
    const h8 = await createHelper(8);
    await createHelper(12);
    const sos = await createSos();

    expect(ids(await findMatchingHelpers(sos, { round: 1 }))).toEqual([h2.id]);
    expect(ids(await findMatchingHelpers(sos, { round: 2 }))).toEqual([h2.id, h4.id]);
    expect(ids(await findMatchingHelpers(sos, { round: 3 }))).toEqual([h2.id, h4.id, h8.id]);
  });

  it('skips helpers already notified about this SOS in an earlier round', async () => {
    const notified = await createHelper(1);
    const fresh = await createHelper(4);
    const sos = await createSos();
    await prisma.sosNotification.create({ data: { sosId: sos.id, helperId: notified.id, channel: 'SOCKET', round: 1 } });

    expect(ids(await findMatchingHelpers(sos, { round: 2 }))).toEqual([fresh.id]);
  });

  it(`notifies at most ${MAX_HELPERS_PER_ROUND} helpers, keeping the nearest`, async () => {
    const helpers = [];
    for (let i = 0; i < MAX_HELPERS_PER_ROUND + 2; i += 1) helpers.push(await createHelper(0.1 * (i + 1)));
    const sos = await createSos();

    expect(ids(await findMatchingHelpers(sos))).toEqual(helpers.slice(0, MAX_HELPERS_PER_ROUND).map((h) => h.id));
  });

  it('rejects an unknown round', async () => {
    const sos = await createSos();
    await expect(findMatchingHelpers(sos, { round: 4 })).rejects.toThrow('Unknown matching round');
  });
});

describe('rankHelpers', () => {
  const candidate = (userId, km, verificationStatus = 'NONE') => ({ userId, ...kmNorth(km), verificationStatus });
  const candidates = [candidate('near', 1), candidate('verified-far', 2, 'VERIFIED'), candidate('pending', 0.5, 'PENDING')];

  it('puts verified professionals first for MEDICAL', () => {
    const ranked = rankHelpers({ type: 'MEDICAL', ...CENTRE }, candidates, 3000);
    expect(ranked.map((h) => h.helperId)).toEqual(['verified-far', 'pending', 'near']);
    expect(ranked[0].verified).toBe(true);
  });

  it('orders by distance only for other types', () => {
    const ranked = rankHelpers({ type: 'VEHICLE', ...CENTRE }, candidates, 3000);
    expect(ranked.map((h) => h.helperId)).toEqual(['pending', 'near', 'verified-far']);
  });

  it('drops candidates inside the bounding box but outside the circle', () => {
    // ~2.9 km north and ~2.9 km east: inside a 3 km box, ~4.1 km away.
    const corner = { userId: 'corner', lat: CENTRE.lat + 0.026, lng: CENTRE.lng + 0.0307, verificationStatus: 'NONE' };
    expect(rankHelpers({ type: 'OTHER', ...CENTRE }, [corner], 3000)).toEqual([]);
  });
});
