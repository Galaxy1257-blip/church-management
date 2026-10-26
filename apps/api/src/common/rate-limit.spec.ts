import { beforeEach, describe, expect, it } from 'vitest';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimit, RateLimitGuard, resetRateLimits, take } from './rate-limit';
import { timingSafeEqualStr } from './crypto';

describe('take (fixed-window buckets)', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit, then denies with a retry hint', () => {
    expect(take('login', 2, 60_000).allowed).toBe(true);
    expect(take('login', 2, 60_000).allowed).toBe(true);
    const third = take('login', 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  it('keeps buckets independent', () => {
    take('a', 1, 60_000);
    expect(take('a', 1, 60_000).allowed).toBe(false);
    expect(take('b', 1, 60_000).allowed).toBe(true);
  });

  it('starts a fresh window once the old one expires', async () => {
    expect(take('window', 1, 5).allowed).toBe(true);
    expect(take('window', 1, 5).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(take('window', 1, 5).allowed).toBe(true);
  });
});

describe('RateLimitGuard', () => {
  beforeEach(() => resetRateLimits());

  function context(handler: () => void, request: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    } as unknown as ExecutionContext;
  }

  const request = (phoneE164 = '+233240000001') => ({
    method: 'POST',
    ip: '203.0.113.7',
    originalUrl: '/api/v1/auth/login',
    body: { churchSlug: 'demo', phoneE164 },
  });

  it('passes through handlers with no @RateLimit', () => {
    const handler = () => undefined;
    expect(new RateLimitGuard(new Reflector()).canActivate(context(handler, request()))).toBe(true);
  });

  it('throws 429 once the bucket is exhausted', () => {
    const handler = () => undefined;
    RateLimit({ key: 'guard:basic', limit: 1, windowMs: 60_000 })(handler);
    const guard = new RateLimitGuard(new Reflector());
    expect(guard.canActivate(context(handler, request()))).toBe(true);
    let status = 0;
    try {
      guard.canActivate(context(handler, request()));
    } catch (error) {
      status = error instanceof HttpException ? error.getStatus() : 0;
    }
    expect(status).toBe(429);
  });

  it('buckets per phone when byPhone is set', () => {
    const handler = () => undefined;
    RateLimit({ key: 'guard:phone', limit: 1, windowMs: 60_000, byPhone: true })(handler);
    const guard = new RateLimitGuard(new Reflector());
    expect(guard.canActivate(context(handler, request('+233240000001')))).toBe(true);
    expect(guard.canActivate(context(handler, request('+233240000002')))).toBe(true);
    expect(() => guard.canActivate(context(handler, request('+233240000001')))).toThrow(HttpException);
  });

  it('enforces every bucket in an array (per-phone AND per-IP)', () => {
    const handler = () => undefined;
    RateLimit([
      { key: 'guard:otp:phone', limit: 5, windowMs: 60_000, byPhone: true },
      { key: 'guard:otp:ip', limit: 2, windowMs: 60_000 },
    ])(handler);
    const guard = new RateLimitGuard(new Reflector());
    expect(guard.canActivate(context(handler, request('+233240000001')))).toBe(true);
    expect(guard.canActivate(context(handler, request('+233240000002')))).toBe(true);
    // Third request from the same IP, even with a brand-new phone number.
    expect(() => guard.canActivate(context(handler, request('+233240000003')))).toThrow(HttpException);
  });
});

describe('timingSafeEqualStr', () => {
  it('compares equal values', () => {
    expect(timingSafeEqualStr('shared-secret', 'shared-secret')).toBe(true);
  });

  it('rejects different values of the same length', () => {
    expect(timingSafeEqualStr('shared-secret', 'shared-secreT')).toBe(false);
  });

  it('rejects length mismatch and missing values without throwing', () => {
    expect(timingSafeEqualStr('short', 'much-longer-value')).toBe(false);
    expect(timingSafeEqualStr(undefined, 'x')).toBe(false);
    expect(timingSafeEqualStr('', '')).toBe(false);
  });
});
