import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SEC });
}

// jti = RefreshSession id, so the server can revoke or rotate a specific token.
export function signRefreshToken(userId, sessionId) {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL_SEC, jwtid: sessionId });
}

// Both throw jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on failure.
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
