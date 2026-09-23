import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { MAX_SOS_PER_DAY } from '../../src/services/sos.js';
import { prisma, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';

const app = createApp();

// Tel Aviv, with enough decimals that coarsening visibly changes it.
const validSos = { type: 'MEDICAL', description: 'Fell off bike, knee bleeding', lat: 32.08534, lng: 34.78176, accuracyM: 14 };

let requester;
let requesterAuth;

beforeEach(async () => {
  await resetDb();
  const created = await createUser({ phone: '+972501111111', phoneVerified: true, photoUrl: 'https://example.com/r.jpg' });
  requester = created.user;
  requesterAuth = `Bearer ${created.token}`;
});
afterAll(() => prisma.$disconnect());

const postSos = (body = validSos, auth = requesterAuth) => request(app).post('/sos').set('Authorization', auth).send(body);
const getSos = (id, auth) => request(app).get(`/sos/${id}`).set('Authorization', auth);

async function otherUser(overrides) {
  const { user, token } = await createUser(overrides);
  return { user, auth: `Bearer ${token}` };
}

// Creates an SOS and immediately marks it RESOLVED, so the one-active-SOS rule doesn't block the next one.
async function postResolvedSos(auth = requesterAuth) {
  const res = await postSos(validSos, auth);
  expect(res.status).toBe(201);
  await prisma.sosRequest.update({ where: { id: res.body.sos.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  return res;
}

describe('POST /sos', () => {
  it('creates an OPEN SOS with the exact location for the requester', async () => {
    const res = await postSos();

    expect(res.status).toBe(201);
    expect(res.body.sos).toMatchObject({
      type: 'MEDICAL',
      description: 'Fell off bike, knee bleeding',
      status: 'OPEN',
      requester: { id: requester.id, name: requester.name },
      location: { precision: 'EXACT', lat: 32.08534, lng: 34.78176, accuracyM: 14 },
    });

    const stored = await prisma.sosRequest.findUnique({ where: { id: res.body.sos.id } });
    expect(stored).toMatchObject({ requesterId: requester.id, lat: 32.08534, lng: 34.78176, accuracyM: 14, status: 'OPEN' });
  });

  it('requires auth', async () => {
    const res = await request(app).post('/sos').send(validSos);

    expect(res.status).toBe(401);
  });

  it('refuses a user whose phone is not verified (403 PHONE_NOT_VERIFIED)', async () => {
    const { auth } = await otherUser({ phoneVerified: false });
    const res = await postSos(validSos, auth);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');
    expect(await prisma.sosRequest.count()).toBe(0);
  });

  it('refuses a suspended user (403 ACCOUNT_SUSPENDED)', async () => {
    await prisma.user.update({ where: { id: requester.id }, data: { isSuspended: true } });
    const res = await postSos();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it.each([
    ['a type not in SOS_TYPES', { type: 'FIRE' }, 'type'],
    ['latitude out of range', { lat: 91 }, 'lat'],
    ['longitude out of range', { lng: -181 }, 'lng'],
    ['a string latitude', { lat: '32.08' }, 'lat'],
    ['negative accuracy', { accuracyM: -1 }, 'accuracyM'],
    ['missing accuracy', { accuracyM: undefined }, 'accuracyM'],
    ['a description over 500 chars', { description: 'x'.repeat(501) }, 'description'],
    ['a client-chosen status', { status: 'RESOLVED' }, '_form'],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, override, field) => {
    const res = await postSos({ ...validSos, ...override });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty(field);
  });

  it(`allows ${MAX_SOS_PER_DAY} SOS per 24 h, then 429 SOS_DAILY_LIMIT`, async () => {
    for (let i = 0; i < MAX_SOS_PER_DAY; i += 1) await postResolvedSos();

    const res = await postSos();

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('SOS_DAILY_LIMIT');
    expect(res.body.error.message).toMatch(/emergency services/);
  });

  it('counts cancelled SOS towards the limit, so create/cancel cannot be used to spam', async () => {
    for (let i = 0; i < MAX_SOS_PER_DAY; i += 1) await postResolvedSos();
    await prisma.sosRequest.updateMany({ data: { status: 'CANCELLED', cancelledAt: new Date() } });

    expect((await postSos()).status).toBe(429);
  });

  it('does not count SOS older than 24 h', async () => {
    for (let i = 0; i < MAX_SOS_PER_DAY; i += 1) await postResolvedSos();
    await prisma.sosRequest.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });

    expect((await postSos()).status).toBe(201);
  });

  it("does not count other users' SOS", async () => {
    const { auth } = await otherUser({ phoneVerified: true });
    for (let i = 0; i < MAX_SOS_PER_DAY; i += 1) await postResolvedSos(auth);

    expect((await postSos()).status).toBe(201);
  });
});

describe('POST /sos — one active SOS per requester', () => {
  it.each(['OPEN', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'])(
    'refuses a new SOS while one is %s (409 ACTIVE_SOS_EXISTS with its id)',
    async (status) => {
      const first = await postSos();
      await prisma.sosRequest.update({ where: { id: first.body.sos.id }, data: { status } });

      const res = await postSos();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ACTIVE_SOS_EXISTS');
      expect(res.body.error.details).toEqual({ activeSosId: first.body.sos.id, status });
      expect(await prisma.sosRequest.count()).toBe(1);
    },
  );

  it.each(['RESOLVED', 'CANCELLED'])('allows a new SOS once the previous one is %s', async (status) => {
    const first = await postSos();
    await prisma.sosRequest.update({ where: { id: first.body.sos.id }, data: { status } });

    const res = await postSos();

    expect(res.status).toBe(201);
    expect(res.body.sos.id).not.toBe(first.body.sos.id);
  });

  it("is not blocked by another user's active SOS", async () => {
    const { auth } = await otherUser({ phoneVerified: true });
    expect((await postSos(validSos, auth)).status).toBe(201);

    expect((await postSos()).status).toBe(201);
  });

  it('reports the active SOS before the daily limit when both apply', async () => {
    await postResolvedSos();
    await postResolvedSos();
    const open = await postSos();

    const res = await postSos();

    expect(res.status).toBe(409);
    expect(res.body.error.details.activeSosId).toBe(open.body.sos.id);
  });

  // Several rounds: the first burst often runs one request at a time while Prisma is still opening
  // pool connections, which would hide a missing lock. Later rounds overlap for real.
  it('lets exactly one of several concurrent requests through', async () => {
    for (let round = 0; round < 5; round += 1) {
      await prisma.sosRequest.deleteMany();

      const results = await Promise.all(Array.from({ length: 6 }, () => postSos()));
      const statuses = results.map((r) => r.status);

      expect(statuses.filter((s) => s === 201), `round ${round}: ${statuses}`).toHaveLength(1);
      expect(statuses.filter((s) => s === 409), `round ${round}: ${statuses}`).toHaveLength(5);
      expect(await prisma.sosRequest.count()).toBe(1);

      const winnerId = results.find((r) => r.status === 201).body.sos.id;
      for (const loser of results.filter((r) => r.status === 409)) {
        expect(loser.body.error.details.activeSosId).toBe(winnerId);
      }
    }
  });
});

describe('GET /sos/:id', () => {
  let sosId;
  beforeEach(async () => {
    sosId = (await postSos()).body.sos.id;
  });

  it('shows the requester the exact location', async () => {
    const res = await getSos(sosId, requesterAuth);

    expect(res.status).toBe(200);
    expect(res.body.sos.location).toEqual({ precision: 'EXACT', lat: 32.08534, lng: 34.78176, accuracyM: 14 });
  });

  it('shows anyone else only an approximate location and the requester public fields', async () => {
    const { auth } = await otherUser();
    const res = await getSos(sosId, auth);

    expect(res.status).toBe(200);
    expect(res.body.sos.location).toEqual({ precision: 'APPROXIMATE', lat: 32.09, lng: 34.78, radiusM: 1000 });
    expect(res.body.sos.requester).toEqual({
      id: requester.id,
      name: requester.name,
      photoUrl: 'https://example.com/r.jpg',
      ratingAvg: 0,
      ratingCount: 0,
    });

    // No exact coordinates or contact details anywhere in the payload.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('32.08534');
    expect(raw).not.toContain('34.78176');
    expect(raw).not.toContain('+972501111111');
    expect(raw).not.toContain(requester.email);
  });

  it.each(['ACCEPTED', 'EN_ROUTE', 'ARRIVED'])('shows the assigned helper the exact location while %s', async (status) => {
    const { user: helper, auth } = await otherUser();
    await prisma.sosRequest.update({ where: { id: sosId }, data: { helperId: helper.id, status } });

    const res = await getSos(sosId, auth);

    expect(res.body.sos.location.precision).toBe('EXACT');
    expect(res.body.sos.location.lat).toBe(32.08534);
  });

  it.each(['RESOLVED', 'CANCELLED'])('hides the exact location from the helper once %s', async (status) => {
    const { user: helper, auth } = await otherUser();
    await prisma.sosRequest.update({ where: { id: sosId }, data: { helperId: helper.id, status } });

    const res = await getSos(sosId, auth);

    expect(res.body.sos.location.precision).toBe('APPROXIMATE');
  });

  it('still shows the requester the exact location after resolution', async () => {
    await prisma.sosRequest.update({ where: { id: sosId }, data: { status: 'RESOLVED' } });
    const res = await getSos(sosId, requesterAuth);

    expect(res.body.sos.location.precision).toBe('EXACT');
  });

  it('returns 404 SOS_NOT_FOUND for an unknown id', async () => {
    const res = await getSos('00000000-0000-4000-8000-000000000000', requesterAuth);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SOS_NOT_FOUND');
  });

  it('returns 400 for an id that is not a UUID', async () => {
    const res = await getSos('abc', requesterAuth);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('id');
  });

  it('requires auth', async () => {
    const res = await request(app).get(`/sos/${sosId}`);

    expect(res.status).toBe(401);
  });
});
