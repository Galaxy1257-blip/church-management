import { describe, expect, it } from 'vitest';
import { loadEnv, parseTtl } from './env';

// Minimum valid environment: the schema needs a DSN and a JWT secret.
const base = {
  DATABASE_URL: 'postgresql://app_user:pw@localhost:5432/chms',
  JWT_SECRET: 'a'.repeat(40),
};

describe('parseTtl', () => {
  it('parses s/m/h/d', () => {
    expect(parseTtl('45s')).toBe(45);
    expect(parseTtl('15m')).toBe(900);
    expect(parseTtl('2h')).toBe(7200);
    expect(parseTtl('30d')).toBe(2_592_000);
  });

  it('rejects garbage', () => {
    expect(() => parseTtl('15 minutes')).toThrow(/invalid TTL/);
  });
});

describe('loadEnv in development', () => {
  it('accepts the documented dev defaults', () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: 'development',
      JWT_SECRET: 'dev-only-change-me-32chars-min-secret!!',
    } as NodeJS.ProcessEnv);
    expect(env.SMS_WEBHOOK_SECRET).toBe('dev-sms-webhook-secret');
    expect(env.PLATFORM_SIGNUP_KEY).toBe('dev-platform-signup-key');
  });

  it('derives the numeric TTLs', () => {
    const env = loadEnv({ ...base, ACCESS_TOKEN_TTL: '15m', REFRESH_TOKEN_TTL: '30d' } as NodeJS.ProcessEnv);
    expect(env.ACCESS_TOKEN_TTL_SEC).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_SEC).toBe(2_592_000);
  });
});

describe('loadEnv in production', () => {
  const prod = (overrides: Record<string, string> = {}) =>
    loadEnv({ ...base, NODE_ENV: 'production', ...overrides } as NodeJS.ProcessEnv);

  it('refuses the documented dev JWT secret', () => {
    expect(() => prod({ JWT_SECRET: 'dev-only-change-me-32chars-min-secret!!' })).toThrow(/JWT_SECRET/);
  });

  it('refuses a JWT secret under 32 chars (the dev default was 37 before)', () => {
    expect(() => prod({ JWT_SECRET: 'short-but-over-16-chars' })).toThrow(/at least 32 chars/);
  });

  it('refuses the dev SMS webhook secret', () => {
    expect(() => prod({ SMS_WEBHOOK_SECRET: 'dev-sms-webhook-secret' })).toThrow(/SMS_WEBHOOK_SECRET/);
  });

  it('refuses the dev platform signup key', () => {
    expect(() => prod({ PLATFORM_SIGNUP_KEY: 'dev-platform-signup-key' })).toThrow(/PLATFORM_SIGNUP_KEY/);
  });

  it('accepts real secrets', () => {
    expect(() =>
      prod({
        JWT_SECRET: 'b'.repeat(48),
        SMS_WEBHOOK_SECRET: 'c'.repeat(32),
        PLATFORM_SIGNUP_KEY: 'd'.repeat(32),
      }),
    ).not.toThrow();
  });
});
