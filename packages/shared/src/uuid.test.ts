import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from './uuid';

describe('uuidv7', () => {
  it('generates valid, time-ordered uuids', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_800_000_000_000);
    expect(isUuid(a)).toBe(true);
    expect(isUuid(b)).toBe(true);
    expect(a < b).toBe(true); // lexicographic = chronological
    expect(a[14]).toBe('7'); // version nibble
    expect(['8', '9', 'a', 'b']).toContain(a[19]); // variant nibble
  });

  it('is unique across rapid calls', () => {
    const set = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(set.size).toBe(1000);
  });

  it('rejects out-of-range timestamps', () => {
    expect(() => uuidv7(-1)).toThrow();
    expect(() => uuidv7(2 ** 48)).toThrow();
    expect(() => uuidv7(1.5)).toThrow();
  });
});
