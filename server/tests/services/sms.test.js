import { describe, it, expect } from 'vitest';
import { createSmsProvider } from '../../src/services/sms.js';

describe('createSmsProvider', () => {
  it('uses the logging stub outside production', async () => {
    const provider = createSmsProvider({ nodeEnv: 'development' });

    expect(provider.name).toBe('dev-log');
    await expect(provider.send('+972501234567', 'hi')).resolves.toBeUndefined();
  });

  it('refuses to pretend in production (503 SMS_UNAVAILABLE)', async () => {
    const provider = createSmsProvider({ nodeEnv: 'production' });

    await expect(provider.send('+972501234567', 'hi')).rejects.toMatchObject({ status: 503, code: 'SMS_UNAVAILABLE' });
  });
});
