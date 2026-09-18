import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { REFRESH_TOKEN_TTL_SEC, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

const SALT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;

// Compared against when the email is unknown, so "no such user" takes as long as "wrong password".
const DUMMY_HASH = await bcrypt.hash('timing-equaliser', SALT_ROUNDS);

// Never return passwordHash or tokens stored on the user.
export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  phoneVerified: true,
  photoUrl: true,
  role: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
};

const invalidCredentials = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const invalidRefresh = () => new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Your session has ended. Please log in again.');
const banned = () => new HttpError(403, 'ACCOUNT_BANNED', 'This account has been banned.');

export async function register({ email, password, name, phone }) {
  await assertUnique({ email, phone });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, name, phone },
      select: PUBLIC_USER_SELECT,
    });
  } catch (err) {
    // Two registrations raced past assertUnique; the DB unique index is the real guard.
    if (isUniqueViolation(err)) throw duplicateError(err.meta?.target);
    throw err;
  }

  return { user, ...(await issueTokens(user)) };
}

export async function login({ email, password }) {
  const found = await prisma.user.findUnique({
    where: { email },
    select: { ...PUBLIC_USER_SELECT, passwordHash: true, isBanned: true },
  });

  const passwordOk = await bcrypt.compare(password, found?.passwordHash ?? DUMMY_HASH);
  if (!found || !passwordOk) throw invalidCredentials();
  if (found.isBanned) throw banned();

  const { passwordHash, isBanned, ...user } = found;
  return { user, ...(await issueTokens(user)) };
}

// Rotation: the presented token's session is revoked and a new one issued.
// Presenting an already-revoked token means it was copied, so every session of that user is revoked.
export async function refresh(refreshToken) {
  const payload = decodeRefreshToken(refreshToken);

  const session = await prisma.refreshSession.findUnique({
    where: { id: payload.jti },
    select: { userId: true, revokedAt: true, user: { select: { ...PUBLIC_USER_SELECT, isBanned: true } } },
  });

  if (!session || session.userId !== payload.sub) throw invalidRefresh();

  if (session.revokedAt) {
    await revokeAllSessions(session.userId);
    throw invalidRefresh();
  }

  const { isBanned, ...user } = session.user;
  if (isBanned) {
    await revokeAllSessions(user.id);
    throw banned();
  }

  // Conditional update so two concurrent refreshes with the same token can't both succeed.
  const { count } = await prisma.refreshSession.updateMany({
    where: { id: payload.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw invalidRefresh();

  return { user, ...(await issueTokens(user)) };
}

// Idempotent: an unknown, expired or already-revoked token is not an error.
export async function logout(refreshToken) {
  if (!refreshToken) return;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return; // nothing valid to revoke
  }

  await prisma.refreshSession.updateMany({
    where: { id: payload.jti, userId: payload.sub, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueTokens(user) {
  const session = await prisma.refreshSession.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000) },
    select: { id: true },
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user.id, session.id),
  };
}

function decodeRefreshToken(token) {
  if (!token) throw invalidRefresh();
  try {
    return verifyRefreshToken(token);
  } catch {
    throw invalidRefresh();
  }
}

function revokeAllSessions(userId) {
  return prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function assertUnique({ email, phone }) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    select: { email: true },
  });
  if (!existing) return;
  throw duplicateError(existing.email === email ? ['email'] : ['phone']);
}

function isUniqueViolation(err) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function duplicateError(target = []) {
  const fields = Array.isArray(target) ? target.join(',') : String(target);
  return fields.includes('phone')
    ? new HttpError(409, 'PHONE_TAKEN', 'An account with this phone number already exists.')
    : new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
}
