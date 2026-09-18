import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { prisma, resetDb } from '../helpers/db.js';

const app = createApp();

const validUser = {
  email: 'Rana@Example.com',
  password: 'correct-horse-battery',
  name: 'Rana Haddad',
  phone: '+972501234567',
};

const register = (overrides = {}) => request(app).post('/auth/register').send({ ...validUser, ...overrides });
const login = (body) => request(app).post('/auth/login').send(body);
const refresh = (cookie) => {
  const req = request(app).post('/auth/refresh');
  return cookie ? req.set('Cookie', cookie) : req;
};

// "refresh_token=<jwt>" from the Set-Cookie header, ready to send back.
function refreshCookieFrom(res) {
  const header = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='));
  return header?.split(';')[0];
}

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /auth/register', () => {
  it('creates the user, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'rana@example.com', name: 'Rana Haddad', role: 'USER' });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const setCookie = res.headers['set-cookie'].find((c) => c.startsWith('refresh_token='));
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Path=\/auth/);
    expect(setCookie).toMatch(/Max-Age=604800/);

    const stored = await prisma.user.findUnique({ where: { email: 'rana@example.com' } });
    expect(stored.passwordHash).not.toBe(validUser.password);
  });

  it('rejects a duplicate email regardless of case with 409 EMAIL_TAKEN', async () => {
    await register();
    const res = await register({ email: 'RANA@example.COM', phone: undefined });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a duplicate phone with 409 PHONE_TAKEN', async () => {
    await register();
    const res = await register({ email: 'other@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('rejects invalid input with 400 VALIDATION_ERROR and per-field details', async () => {
    const res = await register({ email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('email');
    expect(res.body.error.details).toHaveProperty('password');
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => register());

  it('logs in with the right password', async () => {
    const res = await login({ email: 'rana@example.com', password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('rana@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(refreshCookieFrom(res)).toBeDefined();
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await login({ email: 'rana@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(refreshCookieFrom(res)).toBeUndefined();
  });

  it('gives an unknown email the same response as a wrong password', async () => {
    const wrongPassword = await login({ email: 'rana@example.com', password: 'wrong-password' });
    const unknownEmail = await login({ email: 'nobody@example.com', password: 'wrong-password' });

    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('rejects a banned user with 403 ACCOUNT_BANNED', async () => {
    await prisma.user.update({ where: { email: 'rana@example.com' }, data: { isBanned: true } });
    const res = await login({ email: 'rana@example.com', password: validUser.password });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_BANNED');
  });

  it('rejects a missing password with 400 VALIDATION_ERROR', async () => {
    const res = await login({ email: 'rana@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/refresh', () => {
  let cookie;
  beforeEach(async () => {
    cookie = refreshCookieFrom(await register());
  });

  it('returns a new access token and rotates the refresh cookie', async () => {
    const res = await refresh(cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('rana@example.com');
    const rotated = refreshCookieFrom(res);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(cookie);
  });

  it('treats reuse of a rotated token as theft: 401 and every session is revoked', async () => {
    const rotated = refreshCookieFrom(await refresh(cookie));

    const reuse = await refresh(cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');

    const afterTheft = await refresh(rotated);
    expect(afterTheft.status).toBe(401);
  });

  it('rejects a missing cookie with 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await refresh();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a malformed token and clears the cookie', async () => {
    const res = await refresh('refresh_token=not-a-jwt');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(res.headers['set-cookie'].join()).toMatch(/refresh_token=;/);
  });

  it('rejects an expired refresh token', async () => {
    const { sub, jti } = jwt.decode(cookie.split('=')[1]);
    const expired = jwt.sign({ sub, jti, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_REFRESH_SECRET);
    const res = await refresh(`refresh_token=${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects an access token presented as a refresh token', async () => {
    const { body } = await login({ email: 'rana@example.com', password: validUser.password });
    const res = await refresh(`refresh_token=${body.accessToken}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const cookie = refreshCookieFrom(await register());

    const res = await request(app).post('/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'].join()).toMatch(/refresh_token=;/);

    const after = await refresh(cookie);
    expect(after.status).toBe(401);
  });

  it('succeeds with no cookie (idempotent)', async () => {
    const res = await request(app).post('/auth/logout');

    expect(res.status).toBe(204);
  });
});
