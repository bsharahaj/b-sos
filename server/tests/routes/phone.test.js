import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { smsProvider } from '../../src/services/sms.js';
import { MAX_ATTEMPTS } from '../../src/services/phoneVerification.js';
import { prisma, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';

const app = createApp();
const PHONE = '+972501234567';

let user;
let auth;
let sendSpy;

beforeEach(async () => {
  await resetDb();
  ({ user, token: auth } = await createUser());
  auth = `Bearer ${auth}`;
  sendSpy = vi.spyOn(smsProvider, 'send').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const sendCode = (phone = PHONE, authHeader = auth) =>
  request(app).post('/auth/phone/send-code').set('Authorization', authHeader).send({ phone });
const verify = (code, phone = PHONE, authHeader = auth) =>
  request(app).post('/auth/phone/verify').set('Authorization', authHeader).send({ phone, code });

// The 6-digit code from the most recent (stubbed) SMS.
const lastCode = () => sendSpy.mock.lastCall[1].match(/\d{6}/)[0];
const wrongCodeFor = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

// Push the latest code's createdAt back so the resend cooldown doesn't block the next send.
const ageLatestCode = (seconds) =>
  prisma.$executeRaw`UPDATE phone_verifications SET created_at = created_at - make_interval(secs => ${seconds})`;

describe('POST /auth/phone/send-code', () => {
  it('sends a 6-digit code through the SMS provider and stores only a hash', async () => {
    const res = await sendCode();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sentTo: PHONE, expiresInSec: 600, resendAfterSec: 60 });
    expect(sendSpy).toHaveBeenCalledWith(PHONE, expect.stringMatching(/\b\d{6}\b/));

    const stored = await prisma.phoneVerification.findFirst({ where: { userId: user.id } });
    expect(stored.codeHash).not.toContain(lastCode());
    expect(stored.codeHash).toHaveLength(64);
  });

  it('requires auth', async () => {
    const res = await request(app).post('/auth/phone/send-code').send({ phone: PHONE });

    expect(res.status).toBe(401);
  });

  it('rejects a number not in international format', async () => {
    const res = await sendCode('0501234567');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('phone');
  });

  it('enforces a 60 s resend cooldown (429 CODE_RECENTLY_SENT)', async () => {
    await sendCode();
    const res = await sendCode();

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('CODE_RECENTLY_SENT');
    expect(res.body.error.details.retryAfterSec).toBeGreaterThan(0);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('caps codes at 5 per hour (429 TOO_MANY_CODES)', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await sendCode()).status).toBe(200);
      await ageLatestCode(61);
    }
    const res = await sendCode();

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_CODES');
  });

  it('refuses a number already verified on another account (409 PHONE_TAKEN)', async () => {
    await createUser({ phone: PHONE, phoneVerified: true });
    const res = await sendCode();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('refuses re-verifying your own verified number (409 PHONE_ALREADY_VERIFIED)', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { phone: PHONE, phoneVerified: true } });
    const res = await sendCode();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_ALREADY_VERIFIED');
  });
});

describe('POST /auth/phone/verify', () => {
  it('verifies the phone with the right code', async () => {
    await sendCode();
    const res = await verify(lastCode());

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, phone: PHONE, phoneVerified: true });
  });

  it('rejects a wrong code and reports attempts left (400 INVALID_CODE)', async () => {
    await sendCode();
    const res = await verify(wrongCodeFor(lastCode()));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CODE');
    expect(res.body.error.details.attemptsLeft).toBe(MAX_ATTEMPTS - 1);
  });

  it(`locks the code after ${MAX_ATTEMPTS} wrong attempts, even if the right code comes next`, async () => {
    await sendCode();
    const code = lastCode();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await verify(wrongCodeFor(code));

    const res = await verify(code);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect((await prisma.user.findUnique({ where: { id: user.id } })).phoneVerified).toBe(false);
  });

  it('rejects an expired code (400 CODE_EXPIRED)', async () => {
    await sendCode();
    await prisma.phoneVerification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await verify(lastCode());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CODE_EXPIRED');
  });

  it('only accepts the latest code after a resend', async () => {
    await sendCode();
    const firstCode = lastCode();
    await ageLatestCode(61);
    await sendCode();
    const secondCode = lastCode();

    if (firstCode !== secondCode) expect((await verify(firstCode)).status).toBe(400);
    expect((await verify(secondCode)).status).toBe(200);
  });

  it('does not accept the same code twice (400 NO_ACTIVE_CODE)', async () => {
    await sendCode();
    const code = lastCode();
    await verify(code);
    const res = await verify(code);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_ACTIVE_CODE');
  });

  it('rejects a code for a different number than the one it was sent to', async () => {
    await sendCode();
    const res = await verify(lastCode(), '+972509999999');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_ACTIVE_CODE');
  });

  it("takes the number from another account that entered it but never verified it", async () => {
    const { user: squatter } = await createUser({ phone: PHONE, phoneVerified: false });
    await sendCode();
    const res = await verify(lastCode());

    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: squatter.id } })).phone).toBeNull();
  });

  it('rejects a malformed code with 400 VALIDATION_ERROR', async () => {
    const res = await verify('12ab');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('code');
  });

  it('requires auth', async () => {
    const res = await request(app).post('/auth/phone/verify').send({ phone: PHONE, code: '123456' });

    expect(res.status).toBe(401);
  });
});

describe('end to end: register -> verify phone -> send SOS', () => {
  it('lets a brand-new user send an SOS only after verifying their phone', async () => {
    const reg = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User', phone: '+972507777777' });
    const newAuth = `Bearer ${reg.body.accessToken}`;
    const sos = { type: 'VEHICLE', lat: 32.0853, lng: 34.7818, accuracyM: 12 };

    const blocked = await request(app).post('/sos').set('Authorization', newAuth).send(sos);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PHONE_NOT_VERIFIED');

    await sendCode('+972507777777', newAuth);
    expect((await verify(lastCode(), '+972507777777', newAuth)).status).toBe(200);

    const created = await request(app).post('/sos').set('Authorization', newAuth).send(sos);
    expect(created.status).toBe(201);
    expect(created.body.sos.status).toBe('OPEN');
  });
});
