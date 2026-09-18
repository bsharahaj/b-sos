import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/tokens.js';
import { HttpError } from '../utils/httpError.js';

// Sets req.user = { id, role } from a valid `Authorization: Bearer <access>` header.
// TOKEN_EXPIRED is distinct from INVALID_TOKEN so the client knows to call /auth/refresh.
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Please log in to continue.');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new HttpError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please refresh.');
    }
    throw new HttpError(401, 'INVALID_TOKEN', 'Your session is invalid. Please log in again.');
  }

  req.user = { id: payload.sub, role: payload.role };
  next();
}
