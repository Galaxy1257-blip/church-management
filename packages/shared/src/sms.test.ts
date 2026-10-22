import { describe, expect, it } from 'vitest';
import { isGsm7, maxBodyLengthForSegments, smsSegments } from './sms';

describe('smsSegments', () => {
  it('single-segment GSM-7', () => {
    expect(smsSegments('')).toBe(1);
    expect(smsSegments('Hello church!')).toBe(1);
    expect(smsSegments('x'.repeat(160))).toBe(1);
  });

  it('multi-segment GSM-7 with extension chars counting double', () => {
    expect(smsSegments('x'.repeat(161))).toBe(2);
    // each { } are 2 septets: 80 braces = 160 septets -> 1 segment
    expect(smsSegments('{'.repeat(80))).toBe(1);
    expect(smsSegments('{'.repeat(81))).toBe(2);
    expect(smsSegments('x'.repeat(153 * 2))).toBe(2);
    expect(smsSegments('x'.repeat(153 * 2 + 1))).toBe(3);
  });

  it('unicode falls back to UCS-2', () => {
    expect(isGsm7('plain')).toBe(true);
    expect(isGsm7('churché')).toBe(true); // é is in the GSM-7 basic alphabet
    expect(isGsm7('中文')).toBe(false);
    expect(smsSegments('中'.repeat(70))).toBe(1);
    expect(smsSegments('中'.repeat(71))).toBe(2);
    expect(smsSegments('中'.repeat(67 * 2))).toBe(2);
  });

  it('emoji count as 2 UTF-16 units but we count code points', () => {
    expect(smsSegments('👍'.repeat(70))).toBe(1);
    expect(smsSegments('👍'.repeat(71))).toBe(2);
  });

  it('max length helper', () => {
    expect(maxBodyLengthForSegments(1, true)).toBe(160);
    expect(maxBodyLengthForSegments(2, true)).toBe(306);
    expect(maxBodyLengthForSegments(1, false)).toBe(70);
    expect(maxBodyLengthForSegments(0, true)).toBeNull();
  });
});
