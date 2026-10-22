import { describe, expect, it } from 'vitest';
import { computeFee, FeeSettings, grossUp, quote } from './fee';

const base: FeeSettings = { feeMode: 'CHURCH_ABSORBS', feeBps: 195, feeFlatMinor: 10, feeCapMinor: null };

describe('computeFee', () => {
  it('computes bps + flat with half-up rounding', () => {
    expect(computeFee(10000, base)).toBe(195 + 10); // 1.95% of GHS 100 = 195
    expect(computeFee(1000, base)).toBe(20 + 10); // 19.5 -> 20
    expect(computeFee(513, base)).toBe(10 + 10); // 10.0035 -> 10
  });

  it('applies the cap', () => {
    const capped: FeeSettings = { ...base, feeCapMinor: 100 };
    expect(computeFee(100000, capped)).toBe(100); // uncapped would be 1960
  });
});

describe('quote', () => {
  it('CHURCH_ABSORBS: giver pays gift, fund nets gift minus fee', () => {
    const q = quote(10000, base);
    expect(q.chargedMinor).toBe(10000);
    expect(q.feeCoverMinor).toBe(0);
    expect(q.netToFundMinor).toBe(10000 - 205);
  });

  it('GIVER_ABSORBS: giver pays gift + fee, fund nets gift', () => {
    const q = quote(10000, { ...base, feeMode: 'GIVER_ABSORBS' });
    expect(q.chargedMinor).toBe(10205);
    expect(q.feeCoverMinor).toBe(205);
    expect(q.netToFundMinor).toBe(10000);
  });

  it('GIVER_CHOICE honours the choice flag', () => {
    const s: FeeSettings = { ...base, feeMode: 'GIVER_CHOICE' };
    expect(quote(10000, s, { feeChoice: true }).chargedMinor).toBe(10205);
    expect(quote(10000, s, { feeChoice: false }).chargedMinor).toBe(10000);
    // default without opts: church absorbs
    expect(quote(10000, s).chargedMinor).toBe(10000);
  });

  it('rejects zero/negative gifts', () => {
    expect(() => quote(0, base)).toThrow();
    expect(() => quote(-100, base)).toThrow();
  });
});

describe('grossUp', () => {
  it('solves C - fee(C) = target (fee computed on the charge)', () => {
    const s: FeeSettings = { ...base, feeMode: 'GIVER_ABSORBS' };
    const g = grossUp(10000, s);
    // C - (round(C*1.95%)+10) should be exactly 10000 here
    const feeOnC = Math.floor(((g.chargedMinor * 195) / 10000) + 0.5) + 10;
    expect(g.chargedMinor - feeOnC).toBe(10000);
    expect(g.netToFundMinor).toBe(10000);
    expect(g.giftMinor).toBe(10000);
  });

  it('never under-credits when rounding prevents exact equality', () => {
    for (const target of [1, 7, 99, 333, 12345, 999999]) {
      const g = grossUp(target, { ...base, feeMode: 'GIVER_ABSORBS' });
      expect(g.netToFundMinor).toBeGreaterThanOrEqual(target);
      expect(g.netToFundMinor - target).toBeLessThanOrEqual(1); // minimal overshoot
    }
  });

  it('works with a cap', () => {
    const s: FeeSettings = { ...base, feeMode: 'GIVER_ABSORBS', feeCapMinor: 500 };
    const g = grossUp(50000, s);
    expect(g.netToFundMinor).toBe(50000);
    expect(g.chargedMinor).toBe(50500); // fee capped at 500
  });
});
