import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { paystackSecret, verifyPaystackSignature } from './giving.service';

const RAW = JSON.stringify({ event: 'charge.success', data: { reference: 'chms_x', amount: 1000 } });

describe('verifyPaystackSignature (HMAC SHA512, constant-time)', () => {
  it('accepts a correctly signed body', () => {
    const sig = createHmac('sha512', 'secret').update(RAW).digest('hex');
    expect(verifyPaystackSignature(RAW, sig, 'secret')).toBe(true);
  });

  it('accepts a Buffer body identically', () => {
    const sig = createHmac('sha512', 'secret').update(Buffer.from(RAW)).digest('hex');
    expect(verifyPaystackSignature(Buffer.from(RAW), sig, 'secret')).toBe(true);
  });

  it('rejects a wrong secret', () => {
    const sig = createHmac('sha512', 'other').update(RAW).digest('hex');
    expect(verifyPaystackSignature(RAW, sig, 'secret')).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = createHmac('sha512', 'secret').update(RAW).digest('hex');
    expect(verifyPaystackSignature(RAW.replace('1000', '9999'), sig, 'secret')).toBe(false);
  });

  it('rejects missing signature/secret without throwing', () => {
    expect(verifyPaystackSignature(RAW, undefined, 'secret')).toBe(false);
    expect(verifyPaystackSignature(RAW, 'x', '')).toBe(false);
  });

  it('rejects a truncated signature (no timingSafeEqual throw)', () => {
    expect(verifyPaystackSignature(RAW, 'abc', 'secret')).toBe(false);
  });
});

describe('paystackSecret', () => {
  it('uses the real key when set', () => {
    expect(paystackSecret({ PAYSTACK_MODE: 'mock', PAYSTACK_SECRET_KEY: 'k' })).toBe('k');
    expect(paystackSecret({ PAYSTACK_MODE: 'live', PAYSTACK_SECRET_KEY: 'k' })).toBe('k');
  });
  it('falls back to dev-secret in mock mode only', () => {
    expect(paystackSecret({ PAYSTACK_MODE: 'mock', PAYSTACK_SECRET_KEY: '' })).toBe('dev-secret');
    expect(paystackSecret({ PAYSTACK_MODE: 'live', PAYSTACK_SECRET_KEY: '' })).toBe('');
  });
});
