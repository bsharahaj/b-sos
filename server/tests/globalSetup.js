import { execSync } from 'node:child_process';

// Runs once before all test files: bring the test database schema up to date.
export default function setup({ config }) {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.env.DATABASE_URL },
    stdio: 'pipe',
  });
}
