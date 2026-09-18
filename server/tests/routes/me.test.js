import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';

const app = createApp();

let user;
let auth;

beforeEach(async () => {
  await resetDb();
  ({ user, token: auth } = await createUser({ phone: '+972501111111' }));
  auth = `Bearer ${auth}`;
});
afterAll(() => prisma.$disconnect());

const getMe = () => request(app).get('/me').set('Authorization', auth);
const patchMe = (body) => request(app).patch('/me').set('Authorization', auth).send(body);
const patchHelper = (body) => request(app).patch('/me/helper').set('Authorization', auth).send(body);

describe('auth on /me routes', () => {
  it.each([
    ['GET', '/me'],
    ['PATCH', '/me'],
    ['PATCH', '/me/helper'],
  ])('%s %s without a token returns 401 AUTH_REQUIRED', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path).send({ name: 'X' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('returns 401 INVALID_TOKEN when the account behind a valid token was deleted', async () => {
    await prisma.user.delete({ where: { id: user.id } });
    const res = await getMe();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('GET /me', () => {
  it('returns the current user without secrets and a null helper profile', async () => {
    const res = await getMe();

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email, phone: '+972501111111', trustedContactPhone: null });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('fcmToken');
    expect(res.body.helperProfile).toBeNull();
  });

  it('includes the helper profile once it exists, without location fields', async () => {
    await patchHelper({ skills: ['DRIVER'] });
    const res = await getMe();

    expect(res.body.helperProfile).toMatchObject({ skills: ['DRIVER'], isAvailable: false, verificationStatus: 'NONE' });
    expect(res.body.helperProfile).not.toHaveProperty('lat');
    expect(res.body.helperProfile).not.toHaveProperty('lastSeenAt');
  });
});

describe('PATCH /me', () => {
  it('updates name, photoUrl and trustedContactPhone', async () => {
    const res = await patchMe({
      name: '  Rana Haddad ',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/rana.jpg',
      trustedContactPhone: '+972502222222',
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Rana Haddad',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/rana.jpg',
      trustedContactPhone: '+972502222222',
    });
  });

  it('updates only the fields sent', async () => {
    await patchMe({ trustedContactPhone: '+972502222222' });
    const res = await patchMe({ name: 'New Name' });

    expect(res.body.user).toMatchObject({ name: 'New Name', trustedContactPhone: '+972502222222' });
  });

  it('clears photoUrl and trustedContactPhone with null', async () => {
    await patchMe({ photoUrl: 'https://example.com/a.jpg', trustedContactPhone: '+972502222222' });
    const res = await patchMe({ photoUrl: null, trustedContactPhone: null });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ photoUrl: null, trustedContactPhone: null });
  });

  it('rejects fields that are not editable here (role, email) and changes nothing', async () => {
    const res = await patchMe({ name: 'Sneaky', role: 'ADMIN', email: 'x@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details._form).toBeDefined();

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored).toMatchObject({ role: 'USER', name: user.name, email: user.email });
  });

  it.each([
    ['an empty body', {}, '_form'],
    ['a too-short name', { name: 'A' }, 'name'],
    ['a non-https photo URL', { photoUrl: 'http://example.com/a.jpg' }, 'photoUrl'],
    ['a malformed phone', { trustedContactPhone: '0501234567' }, 'trustedContactPhone'],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body, field) => {
    const res = await patchMe(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty(field);
  });
});

describe('PATCH /me/helper', () => {
  it('creates the helper profile lazily on first call', async () => {
    expect(await prisma.helperProfile.count()).toBe(0);

    const res = await patchHelper({ skills: ['MEDICAL', 'GENERAL'] });

    expect(res.status).toBe(200);
    expect(res.body.helperProfile).toMatchObject({
      skills: ['MEDICAL', 'GENERAL'],
      isAvailable: false,
      verificationStatus: 'NONE',
    });
    expect(await prisma.helperProfile.count({ where: { userId: user.id } })).toBe(1);
  });

  it('updates the same profile on later calls and keeps fields not sent', async () => {
    await patchHelper({ skills: ['MECHANIC'] });
    const res = await patchHelper({ isAvailable: true });

    expect(res.status).toBe(200);
    expect(res.body.helperProfile).toMatchObject({ skills: ['MECHANIC'], isAvailable: true });
    expect(await prisma.helperProfile.count()).toBe(1);
  });

  it('accepts skills and isAvailable together on first call', async () => {
    const res = await patchHelper({ skills: ['DRIVER'], isAvailable: true });

    expect(res.status).toBe(200);
    expect(res.body.helperProfile).toMatchObject({ skills: ['DRIVER'], isAvailable: true });
  });

  it('stamps lastSeenAt when going available', async () => {
    const before = Date.now();
    await patchHelper({ skills: ['GENERAL'], isAvailable: true });

    const stored = await prisma.helperProfile.findUnique({ where: { userId: user.id } });
    expect(stored.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 5000);
  });

  it('removes duplicate skills', async () => {
    const res = await patchHelper({ skills: ['DRIVER', 'DRIVER', 'GENERAL'] });

    expect(res.body.helperProfile.skills).toEqual(['DRIVER', 'GENERAL']);
  });

  it('rejects a skill that is not in SKILLS', async () => {
    const res = await patchHelper({ skills: ['DRIVER', 'PILOT'] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('skills');
  });

  it('rejects a non-boolean isAvailable', async () => {
    const res = await patchHelper({ isAvailable: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('isAvailable');
  });

  it('rejects an empty body and unknown fields', async () => {
    expect((await patchHelper({})).status).toBe(400);

    const res = await patchHelper({ skills: ['DRIVER'], verificationStatus: 'VERIFIED' });
    expect(res.status).toBe(400);
    expect(await prisma.helperProfile.count()).toBe(0);
  });

  it('refuses to go available with no skills (400 SKILLS_REQUIRED)', async () => {
    const res = await patchHelper({ isAvailable: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SKILLS_REQUIRED');
    expect(await prisma.helperProfile.count()).toBe(0);
  });

  it('refuses to clear all skills while available', async () => {
    await patchHelper({ skills: ['DRIVER'], isAvailable: true });
    const res = await patchHelper({ skills: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SKILLS_REQUIRED');
  });

  it('lets a suspended user edit skills but not go available (403 ACCOUNT_SUSPENDED)', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isSuspended: true } });

    expect((await patchHelper({ skills: ['GENERAL'] })).status).toBe(200);

    const res = await patchHelper({ isAvailable: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('lets a suspended user go unavailable', async () => {
    await patchHelper({ skills: ['GENERAL'], isAvailable: true });
    await prisma.user.update({ where: { id: user.id }, data: { isSuspended: true } });

    const res = await patchHelper({ isAvailable: false });

    expect(res.status).toBe(200);
    expect(res.body.helperProfile.isAvailable).toBe(false);
  });
});
