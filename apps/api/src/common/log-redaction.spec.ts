import { describe, expect, it } from 'vitest';
import { loggableError, redactLogText, redactLogValue, requestPath } from './log-redaction';

describe('log redaction', () => {
  it('redacts credentials and personal data from structured values', () => {
    const value = redactLogValue({
      password: 'secret',
      nested: { accessToken: 'jwt', phoneE164: '+233240000000', email: 'person@example.com' },
      event: 'login',
    });
    expect(value).toEqual({
      password: '[redacted]',
      nested: { accessToken: '[redacted]', phoneE164: '[redacted]', email: '[redacted]' },
      event: 'login',
    });
  });

  it('redacts tokens, phone numbers, email addresses and forged lines', () => {
    const jwt = `eyJ${'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(12)}`;
    const text = redactLogText(`Bearer ${jwt}\n+233240000000 person@example.com\r\nforged`);
    expect(text).not.toContain(jwt);
    expect(text).not.toContain('+233240000000');
    expect(text).not.toContain('person@example.com');
    expect(text).not.toMatch(/[\r\n]/);
  });

  it('keeps route evidence without query-string secrets', () => {
    expect(requestPath('/api/v1/auth/refresh?token=secret')).toBe('/api/v1/auth/refresh');
  });

  it('sanitises Error stacks without mutating the original error', () => {
    const error = new Error('failed for person@example.com');
    expect(loggableError(error)).toMatchObject({ message: 'failed for [redacted-email]' });
    expect(error.message).toContain('person@example.com');
  });
});
