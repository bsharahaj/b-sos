import { prisma } from '../../src/config/prisma.js';
import { signAccessToken } from '../../src/utils/tokens.js';

let counter = 0;

// Inserts a user directly (skipping bcrypt and /auth/register) and returns it with a valid access token.
export async function createUser(overrides = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `user${counter}@example.com`,
      passwordHash: 'not-a-real-hash',
      name: `Test User ${counter}`,
      ...overrides,
    },
  });
  return { user, token: signAccessToken(user) };
}
