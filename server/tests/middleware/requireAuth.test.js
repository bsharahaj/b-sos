import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../../src/middleware/requireAuth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/utils/tokens.js';

// Throwaway app with one protected route, so the middleware is tested without any real feature routes.
const app = express();
app.get('/protected', requireAuth, (req, res) => res.json({ user: req.user }));
app.use(errorHandler);

const user = { id: '7f0c1f5e-2d4b-4e8e-9a51-0c8f1b2f6a11', role: 'USER' };
const get = (authorization) => {
  const req = request(app).get('/protected');
  return authorization ? req.set('Authorization', authorization) : req;
};

describe('requireAuth', () => {
  it('lets a valid Bearer token through and sets req.user', async () => {
    const res = await get(`Bearer ${signAccessToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(user);
  });

  it('rejects a missing Authorization header with 401 AUTH_REQUIRED', async () => {
    const res = await get();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a non-Bearer scheme with 401 AUTH_REQUIRED', async () => {
    const res = await get(`Basic ${signAccessToken(user)}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects an expired token with 401 TOKEN_EXPIRED', async () => {
    const expired = jwt.sign(
      { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_ACCESS_SECRET,
    );
    const res = await get(`Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a malformed token with 401 INVALID_TOKEN', async () => {
    const res = await get('Bearer not.a.jwt');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token signed with another secret (e.g. a refresh token) with 401 INVALID_TOKEN', async () => {
    const forged = jwt.sign({ sub: user.id, role: 'ADMIN' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '15m' });
    const res = await get(`Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});
