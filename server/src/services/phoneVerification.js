import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { smsProvider } from './sms.js';
import { ME_SELECT } from './me.js';

export const CODE_TTL_SEC = 10 * 60;
export const RESEND_COOLDOWN_SEC = 60;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

export async function sendCode(userId, phone) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, phoneVerified: true } });
  if (!user) throw new HttpError(401, 'INVALID_TOKEN', 'Your account no longer exists. Please log in again.');

  if (user.phone === phone && user.phoneVerified) {
    throw new HttpError(409, 'PHONE_ALREADY_VERIFIED', 'This phone number is already verified.');
  }
  await assertPhoneNotVerifiedByOther(userId, phone);
  await assertSendAllowed(userId);

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const id = crypto.randomUUID();

  await prisma.phoneVerification.create({
    data: { id, userId, phone, codeHash: hashCode(id, code), expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000) },
  });
  await smsProvider.send(phone, `Your B SOS verification code is ${code}. It expires in 10 minutes.`);

  return { sentTo: phone, expiresInSec: CODE_TTL_SEC, resendAfterSec: RESEND_COOLDOWN_SEC };
}

export async function verifyCode(userId, phone, code) {
  const record = await prisma.phoneVerification.findFirst({
    where: { userId, phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new HttpError(400, 'NO_ACTIVE_CODE', 'No code is waiting for this number. Please request a new one.');
  if (record.expiresAt < new Date()) throw new HttpError(400, 'CODE_EXPIRED', 'This code has expired. Please request a new one.');

  // Reserve an attempt before comparing, so parallel guesses can't exceed MAX_ATTEMPTS.
  const { count } = await prisma.phoneVerification.updateMany({
    where: { id: record.id, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (count === 0) throw tooManyAttempts();

  if (!codesMatch(hashCode(record.id, code), record.codeHash)) {
    const attemptsLeft = MAX_ATTEMPTS - (record.attempts + 1);
    if (attemptsLeft <= 0) throw tooManyAttempts();
    throw new HttpError(400, 'INVALID_CODE', 'That code is not correct.', { attemptsLeft });
  }

  return claimPhone(userId, phone, record.id);
}

// Proving ownership wins over someone who merely typed this number without verifying it.
async function claimPhone(userId, phone, verificationId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.phoneVerification.updateMany({
        where: { id: verificationId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (count === 0) throw new HttpError(400, 'NO_ACTIVE_CODE', 'This code was already used. Please request a new one.');

      await tx.user.updateMany({
        where: { phone, phoneVerified: false, id: { not: userId } },
        data: { phone: null },
      });
      const user = await tx.user.update({
        where: { id: userId },
        data: { phone, phoneVerified: true },
        select: ME_SELECT,
      });
      return { user };
    });
  } catch (err) {
    // Another account verified this number between our send-code check and now.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw phoneTaken();
    throw err;
  }
}

async function assertPhoneNotVerifiedByOther(userId, phone) {
  const owner = await prisma.user.findFirst({
    where: { phone, phoneVerified: true, id: { not: userId } },
    select: { id: true },
  });
  if (owner) throw phoneTaken();
}

async function assertSendAllowed(userId) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.phoneVerification.findMany({
    where: { userId, createdAt: { gte: hourAgo } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (recent.length >= MAX_CODES_PER_HOUR) {
    throw new HttpError(429, 'TOO_MANY_CODES', 'Too many codes requested. Please try again in an hour.');
  }

  const sinceLastSec = recent[0] ? (Date.now() - recent[0].createdAt.getTime()) / 1000 : Infinity;
  if (sinceLastSec < RESEND_COOLDOWN_SEC) {
    const retryAfterSec = Math.ceil(RESEND_COOLDOWN_SEC - sinceLastSec);
    throw new HttpError(429, 'CODE_RECENTLY_SENT', `Please wait ${retryAfterSec} seconds before requesting another code.`, {
      retryAfterSec,
    });
  }
}

// HMAC with a server secret: a leaked table can't be brute-forced offline (there are only 10^6 codes).
// Keyed per row so identical codes produce different hashes.
function hashCode(verificationId, code) {
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`phone-code:${verificationId}:${code}`).digest('hex');
}

function codesMatch(a, b) {
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

const tooManyAttempts = () =>
  new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes. Please request a new one.');
const phoneTaken = () => new HttpError(409, 'PHONE_TAKEN', 'This phone number is already verified on another account.');
