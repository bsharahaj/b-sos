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

  it('shows an alerted helper only an approximate location and the requester public fields', async () => {
    const { user: helper, auth } = await otherUser();
    await prisma.sosNotification.create({ data: { sosId, helperId: helper.id, channel: 'SOCKET', round: 1 } });
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

  it('returns the same 404 to a user who was never involved', async () => {
    const { auth } = await otherUser();
    const res = await getSos(sosId, auth);

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

describe('POST /sos/:id/cancel', () => {
  const cancel = (id, auth = requesterAuth, body = {}) => request(app).post(`/sos/${id}/cancel`).set('Authorization', auth).send(body);

  it('lets the requester cancel an OPEN SOS with a reason', async () => {
    const { body: created } = await postSos();

    const res = await cancel(created.sos.id, requesterAuth, { reason: 'Got help another way' });

    expect(res.status).toBe(200);
    expect(res.body.sos).toMatchObject({ id: created.sos.id, status: 'CANCELLED', cancelledBy: 'REQUESTER' });
    expect(res.body.sos.cancelledAt).toBeTruthy();

    const stored = await prisma.sosRequest.findUnique({ where: { id: created.sos.id } });
    expect(stored).toMatchObject({ status: 'CANCELLED', cancelledBy: requester.id, cancelReason: 'Got help another way' });
  });

  it('frees the requester to send a new SOS afterwards', async () => {
    const { body: created } = await postSos();
    await cancel(created.sos.id);

    const res = await postSos();
    expect(res.status).toBe(201);
  });

  it('lets the requester cancel while ACCEPTED but not once the helper is EN_ROUTE', async () => {
    const helper = await otherUser({ phone: '+972502222222' });
    const { body: created } = await postSos();
    await prisma.sosRequest.update({ where: { id: created.sos.id }, data: { status: 'ACCEPTED', helperId: helper.user.id, acceptedAt: new Date() } });

    expect((await cancel(created.sos.id)).status).toBe(200);

    const { body: second } = await postSos();
    await prisma.sosRequest.update({ where: { id: second.sos.id }, data: { status: 'EN_ROUTE', helperId: helper.user.id } });
    const res = await cancel(second.sos.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOS_NOT_CANCELLABLE');
  });

  it('lets the assigned helper cancel while EN_ROUTE and records them as HELPER', async () => {
    const helper = await otherUser({ phone: '+972502222222' });
    const { body: created } = await postSos();
    await prisma.sosRequest.update({ where: { id: created.sos.id }, data: { status: 'EN_ROUTE', helperId: helper.user.id } });

    const res = await cancel(created.sos.id, helper.auth);

    expect(res.status).toBe(200);
    expect(res.body.sos.cancelledBy).toBe('HELPER');
  });

  it('rejects anyone who is neither the requester nor the assigned helper', async () => {
    const stranger = await otherUser({ phone: '+972503333333' });
    const { body: created } = await postSos();

    const res = await cancel(created.sos.id, stranger.auth);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_YOUR_SOS');
    expect((await prisma.sosRequest.findUnique({ where: { id: created.sos.id } })).status).toBe('OPEN');
  });

  it('refuses to cancel a resolved or already-cancelled SOS', async () => {
    const { body: resolved } = await postResolvedSos();
    expect((await cancel(resolved.sos.id)).body.error.code).toBe('SOS_NOT_CANCELLABLE');

    const { body: created } = await postSos();
    await cancel(created.sos.id);
    const again = await cancel(created.sos.id);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already cancelled/i);
  });

  it('validates the reason length and the id', async () => {
    const { body: created } = await postSos();
    expect((await cancel(created.sos.id, requesterAuth, { reason: 'x'.repeat(201) })).status).toBe(400);
    expect((await cancel('not-a-uuid')).status).toBe(400);
    expect((await cancel('00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('GET /sos/alerts', () => {
  const getAlerts = (auth) => request(app).get('/sos/alerts').set('Authorization', auth);

  // A helper 200 m north of the SOS, available with a matching skill, so createSos alerts them.
  async function nearbyHelper() {
    const { user, auth } = await otherUser({ phone: '+972504444444' });
    await prisma.helperProfile.create({
      data: { userId: user.id, skills: ['GENERAL'], isAvailable: true, lat: validSos.lat + 0.0018, lng: validSos.lng, lastSeenAt: new Date() },
    });
    return { user, auth };
  }

  it('lists open SOS the helper was alerted about, with the distance', async () => {
    const helper = await nearbyHelper();
    const { body: created } = await postSos();

    const res = await getAlerts(helper.auth);

    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0]).toMatchObject({
      distanceM: expect.any(Number),
      sos: { id: created.sos.id, type: 'MEDICAL', status: 'OPEN', location: { precision: 'APPROXIMATE' } },
    });
    expect(res.body.alerts[0].distanceM).toBeGreaterThan(150);
    expect(res.body.alerts[0].distanceM).toBeLessThan(250);
  });

  it('drops alerts once the SOS is no longer open', async () => {
    const helper = await nearbyHelper();
    const { body: created } = await postSos();
    await request(app).post(`/sos/${created.sos.id}/cancel`).set('Authorization', requesterAuth).send({});

    const res = await getAlerts(helper.auth);

    expect(res.body.alerts).toEqual([]);
  });

  it('is empty for a user who was never alerted', async () => {
    const stranger = await otherUser({ phone: '+972505555555' });
    await postSos();

    expect((await getAlerts(stranger.auth)).body.alerts).toEqual([]);
  });
});

describe('POST /sos/:id/accept and /decline', () => {
  const accept = (id, auth) => request(app).post(`/sos/${id}/accept`).set('Authorization', auth).send();
  const decline = (id, auth) => request(app).post(`/sos/${id}/decline`).set('Authorization', auth).send();

  let emitted;
  beforeEach(async () => {
    emitted = [];
    const { setIo } = await import('../../src/socket/emitter.js');
    setIo({
      to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
      in: () => ({ socketsJoin: () => {} }),
    });
  });

  // n available GENERAL helpers 200–400 m away, so createSos alerts all of them.
  async function alertedHelpers(n) {
    const helpers = [];
    for (let i = 0; i < n; i += 1) {
      const h = await otherUser({ phone: `+97250600000${i}` });
      await prisma.helperProfile.create({
        data: { userId: h.user.id, skills: ['GENERAL'], isAvailable: true, lat: validSos.lat + 0.0018 + i * 0.0003, lng: validSos.lng, lastSeenAt: new Date() },
      });
      helpers.push(h);
    }
    return helpers;
  }

  it('assigns the helper, reveals the exact location and notifies everyone involved', async () => {
    const [winner, loser] = await alertedHelpers(2);
    const { body: created } = await postSos();
    emitted = [];

    const res = await accept(created.sos.id, winner.auth);

    expect(res.status).toBe(200);
    expect(res.body.sos).toMatchObject({ status: 'ACCEPTED', location: { precision: 'EXACT', lat: 32.08534 } });
    expect(res.body.sos.helper).toMatchObject({ id: winner.user.id, name: winner.user.name, verified: false });
    expect(res.body.etaMin).toBeGreaterThanOrEqual(1);

    const stored = await prisma.sosRequest.findUnique({ where: { id: created.sos.id } });
    expect(stored).toMatchObject({ status: 'ACCEPTED', helperId: winner.user.id });
    expect(stored.acceptedAt).toBeTruthy();

    const notes = await prisma.sosNotification.findMany({ where: { sosId: created.sos.id }, orderBy: { helperId: 'asc' } });
    expect(notes.find((n) => n.helperId === winner.user.id).response).toBe('ACCEPT');
    expect(notes.find((n) => n.helperId === loser.user.id).response).toBe('NONE');

    expect(emitted).toEqual(
      expect.arrayContaining([
        { room: `user:${requester.id}`, event: 'sos:accepted', payload: expect.objectContaining({ sosId: created.sos.id, helper: expect.objectContaining({ id: winner.user.id }) }) },
        { room: `user:${loser.user.id}`, event: 'sos:taken', payload: { sosId: created.sos.id } },
        { room: `sos:${created.sos.id}`, event: 'sos:status', payload: expect.objectContaining({ status: 'ACCEPTED' }) },
      ]),
    );
    // The requester sees the helper card too.
    const view = await getSos(created.sos.id, requesterAuth);
    expect(view.body.sos.helper.id).toBe(winner.user.id);
  });

  it('lets exactly one of several simultaneous accepts through (409 SOS_TAKEN for the rest)', async () => {
    const helpers = await alertedHelpers(5);
    const { body: created } = await postSos();

    const results = await Promise.all(helpers.map((h) => accept(created.sos.id, h.auth)));
    const statuses = results.map((r) => r.status);

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'SOS_TAKEN')).toBe(true);
    const stored = await prisma.sosRequest.findUnique({ where: { id: created.sos.id } });
    expect(stored.helperId).toBe(results.find((r) => r.status === 200).body.sos.helper.id);
  });

  it('answers 404 to a helper who was never alerted', async () => {
    const stranger = await otherUser({ phone: '+972507777777' });
    const { body: created } = await postSos();

    const res = await accept(created.sos.id, stranger.auth);

    expect(res.status).toBe(404);
    expect((await prisma.sosRequest.findUnique({ where: { id: created.sos.id } })).status).toBe('OPEN');
  });

  it('refuses a helper already busy with another SOS (409 HELPER_BUSY)', async () => {
    const [helper] = await alertedHelpers(1);
    const { body: first } = await postSos();
    expect((await accept(first.sos.id, helper.auth)).status).toBe(200);

    const second = await otherUser({ phone: '+972508888888', phoneVerified: true });
    const { body: other } = await postSos(validSos, second.auth);
    const res = await accept(other.sos.id, helper.auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HELPER_BUSY');
    expect(res.body.error.details.activeSosId).toBe(first.sos.id);
  });

  it('refuses to accept a cancelled SOS (409 SOS_NOT_OPEN)', async () => {
    const [helper] = await alertedHelpers(1);
    const { body: created } = await postSos();
    await request(app).post(`/sos/${created.sos.id}/cancel`).set('Authorization', requesterAuth).send({});

    const res = await accept(created.sos.id, helper.auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOS_NOT_OPEN');
  });

  it('decline records the answer, removes the alert from the list and cannot be repeated', async () => {
    const [helper] = await alertedHelpers(1);
    const { body: created } = await postSos();

    expect((await decline(created.sos.id, helper.auth)).status).toBe(200);
    const note = await prisma.sosNotification.findFirst({ where: { sosId: created.sos.id, helperId: helper.user.id } });
    expect(note.response).toBe('DECLINE');
    expect((await request(app).get('/sos/alerts').set('Authorization', helper.auth)).body.alerts).toEqual([]);

    const again = await decline(created.sos.id, helper.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ANSWERED');
  });

  it('cancelling an OPEN SOS tells pending helpers it is taken', async () => {
    const [helper] = await alertedHelpers(1);
    const { body: created } = await postSos();
    emitted = [];

    await request(app).post(`/sos/${created.sos.id}/cancel`).set('Authorization', requesterAuth).send({});

    expect(emitted).toEqual(
      expect.arrayContaining([{ room: `user:${helper.user.id}`, event: 'sos:taken', payload: { sosId: created.sos.id } }]),
    );
  });
});
