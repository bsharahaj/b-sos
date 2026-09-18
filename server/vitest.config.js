import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({ quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
assertSafeTestDatabase(testDatabaseUrl, process.env.DATABASE_URL);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/globalSetup.js'],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    // Fixed values so tests never depend on (or leak) a developer's real secrets.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
      CLIENT_ORIGIN: 'http://localhost:5173',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012345678',
    },
  },
});

// Tests truncate every table, so refuse to point them at the dev database.
function assertSafeTestDatabase(testUrl, devUrl) {
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set. Add it to server/.env (see .env.example).');
  }
  if (!devUrl) return;

  const target = (url) => {
    const u = new URL(url);
    return `${u.host}${u.pathname}#${u.searchParams.get('schema') ?? 'public'}`;
  };
  if (target(testUrl) === target(devUrl)) {
    throw new Error('TEST_DATABASE_URL points at the same database + schema as DATABASE_URL. Use ?schema=test or a separate database.');
  }
}
