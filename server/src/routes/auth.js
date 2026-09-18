import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { readCookie } from '../utils/cookies.js';
import { REFRESH_TOKEN_TTL_SEC } from '../utils/tokens.js';
import { phoneSchema } from '../utils/validation.js';
import * as authService from '../services/auth.js';

// ---------- Schemas ----------

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

const registerSchema = z.object({
  email,
  // bcrypt only uses the first 72 bytes, so cap the length instead of silently truncating.
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72),
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema.optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

// ---------- Refresh cookie ----------

export const REFRESH_COOKIE = 'refresh_token';

// Client (Vercel) and API (Railway) are different sites in production, so the cookie must be
// SameSite=None + Secure there. Path=/auth keeps it off every other request.
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/auth',
};

function sendSession(res, status, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookieOptions, maxAge: REFRESH_TOKEN_TTL_SEC * 1000 });
  res.status(status).json({ user, accessToken });
}

// ---------- Routes ----------

export const authRouter = Router();

authRouter.post('/register', validate({ body: registerSchema }), async (req, res) => {
  sendSession(res, 201, await authService.register(req.body));
});

authRouter.post('/login', validate({ body: loginSchema }), async (req, res) => {
  sendSession(res, 200, await authService.login(req.body));
});

authRouter.post('/refresh', async (req, res) => {
  try {
    sendSession(res, 200, await authService.refresh(readCookie(req, REFRESH_COOKIE)));
  } catch (err) {
    // A rejected refresh cookie is useless; drop it so the client stops sending it. Error still propagates.
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    throw err;
  }
});

authRouter.post('/logout', async (req, res) => {
  await authService.logout(readCookie(req, REFRESH_COOKIE));
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.status(204).end();
});
