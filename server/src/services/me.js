import { prisma } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { PUBLIC_USER_SELECT } from './auth.js';

// The owner may see a few more of their own fields than other users would.
const ME_SELECT = {
  ...PUBLIC_USER_SELECT,
  trustedContactPhone: true,
  isSuspended: true,
};

// lat/lng/lastSeenAt are internal matching data, not part of the profile.
const HELPER_PROFILE_SELECT = {
  skills: true,
  isAvailable: true,
  verificationStatus: true,
  updatedAt: true,
};

// The access token can outlive the account (e.g. deleted user); treat that like a bad token.
const accountGone = () => new HttpError(401, 'INVALID_TOKEN', 'Your account no longer exists. Please log in again.');

export async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...ME_SELECT, helperProfile: { select: HELPER_PROFILE_SELECT } },
  });
  if (!user) throw accountGone();

  const { helperProfile, ...rest } = user;
  return { user: rest, helperProfile };
}

export async function updateMe(userId, changes) {
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw accountGone();

  const user = await prisma.user.update({ where: { id: userId }, data: changes, select: ME_SELECT });
  return { user };
}

// Creates the HelperProfile on first call. Rules checked against the merged result:
// - going available needs at least one skill (matching filters on skill overlap)
// - suspended/banned users can edit skills but can't go available
export async function updateHelperProfile(userId, changes) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isBanned: true, isSuspended: true, helperProfile: { select: { skills: true, isAvailable: true } } },
  });
  if (!user) throw accountGone();

  const current = user.helperProfile ?? { skills: [], isAvailable: false };
  const next = { ...current, ...changes };

  if (next.isAvailable && next.skills.length === 0) {
    throw new HttpError(400, 'SKILLS_REQUIRED', 'Choose at least one skill before going available.');
  }
  if (changes.isAvailable && (user.isBanned || user.isSuspended)) {
    throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'Your account is under review, so you cannot help right now.');
  }

  // Going available counts as "seen now", otherwise matching's 10-minute freshness check would skip the helper.
  const data = { ...changes, ...(changes.isAvailable && { lastSeenAt: new Date() }) };

  const helperProfile = await prisma.helperProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: HELPER_PROFILE_SELECT,
  });
  return { helperProfile };
}
