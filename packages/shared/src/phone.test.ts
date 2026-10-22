import { describe, expect, it } from 'vitest';
import { formatGhPhoneDisplay, isValidGhPhone, maskPhone, normalizeGhPhone, PhoneError } from './phone';

describe('normalizeGhPhone', () => {
  it('accepts the many shapes users type', () => {
    expect(normalizeGhPhone('0241234567')).toBe('+233241234567');
    expect(normalizeGhPhone('241234567')).toBe('+233241234567');
    expect(normalizeGhPhone('233241234567')).toBe('+233241234567');
    expect(normalizeGhPhone('+233241234567')).toBe('+233241234567');
    expect(normalizeGhPhone('+233 24 123 4567')).toBe('+233241234567');
    expect(normalizeGhPhone('00233241234567')).toBe('+233241234567');
    expect(normalizeGhPhone('(0) 24 123 4567')).toBe('+233241234567');
    expect(normalizeGhPhone('055 123 4567')).toBe('+233551234567');
    expect(normalizeGhPhone(' 024-123-4567 ')).toBe('+233241234567');
  });

  it('rejects invalid numbers', () => {
    expect(() => normalizeGhPhone('')).toThrow(PhoneError);
    expect(() => normalizeGhPhone('02412345')).toThrow(PhoneError); // too short
    expect(() => normalizeGhPhone('0141234567')).toThrow(PhoneError); // not mobile prefix (1x)
    expect(() => normalizeGhPhone('0301234567')).toThrow(PhoneError); // landline
    expect(() => normalizeGhPhone('+1 555 123 4567')).toThrow(PhoneError); // US
    expect(() => normalizeGhPhone('not a phone')).toThrow(PhoneError);
    expect(() => normalizeGhPhone('+2332412345678')).toThrow(PhoneError); // too long
  });

  it('validates without throwing', () => {
    expect(isValidGhPhone('0241234567')).toBe(true);
    expect(isValidGhPhone('12345')).toBe(false);
  });

  it('masks and formats', () => {
    expect(maskPhone('+233241234567')).toBe('024***4567');
    expect(formatGhPhoneDisplay('+233241234567')).toBe('024 123 4567');
    expect(maskPhone('bad')).toBe('***');
  });
});
