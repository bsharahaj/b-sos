import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

// Only variables the server uses today are validated; add each new one here when a feature needs it.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // The logger depends on env, so report on stderr before anything else boots.
  process.stderr.write(`Invalid environment variables:\n${z.prettifyError(parsed.error)}\n`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
