import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { HttpError } from '../utils/httpError.js';

// Real SMS delivery arrives in Tier 2. Until then:
// - development/test: log the message instead of sending it
// - production: refuse, so nobody is told "code sent" when it wasn't
export function createSmsProvider({ nodeEnv }) {
  if (nodeEnv === 'production') {
    return {
      name: 'unavailable',
      async send() {
        throw new HttpError(503, 'SMS_UNAVAILABLE', 'Text messages are not available yet. Please try again later.');
      },
    };
  }

  return {
    name: 'dev-log',
    async send(to, body) {
      logger.info({ to, body }, '[SMS stub] not sent, logged instead');
    },
  };
}

// Mutable object on purpose: tests replace `send` with a spy to read the code.
export const smsProvider = createSmsProvider({ nodeEnv: env.NODE_ENV });
