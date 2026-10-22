import { describe, expect, it } from 'vitest';
import { formatGhs, fromMinor, MoneyError, sumMinor, toMinor } from './money';

describe('money', () => {
  it('parses strings to pesewas', () => {
    expect(toMinor('12.34')).toBe(1234);
    expect(toMinor('12')).toBe(1200);
    expect(toMinor('0.05')).toBe(5);
    expect(toMinor(' 7.5 ')).toBe(750);
  });

  it('parses numbers to pesewas', () => {
    expect(toMinor(12.34)).toBe(1234);
    expect(toMinor(0.1)).toBe(10);
    expect(toMinor(100)).toBe(10000);
  });

  it('rejects bad input', () => {
    expect(() => toMinor('12.345')).toThrow(MoneyError);
    expect(() => toMinor('-5')).toThrow(MoneyError);
    expect(() => toMinor('abc')).toThrow(MoneyError);
    expect(() => toMinor('')).toThrow(MoneyError);
  });

  it('formats for display', () => {
    expect(formatGhs(1234)).toBe('GHS 12.34');
    expect(formatGhs(5)).toBe('GHS 0.05');
    expect(formatGhs(0)).toBe('GHS 0.00');
    expect(formatGhs(-250)).toBe('-GHS 2.50');
  });

  it('round-trips', () => {
    expect(toMinor(formatGhs(98765).replace('GHS ', ''))).toBe(98765);
    expect(fromMinor(1234)).toBe(12.34);
  });

  it('sums safely and rejects unsafe totals', () => {
    expect(sumMinor([1, 2, 3])).toBe(6);
    expect(sumMinor([])).toBe(0);
    expect(() => sumMinor([1.5])).toThrow(MoneyError);
  });
});
