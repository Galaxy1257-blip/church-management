import { describe, expect, it } from 'vitest';
import {
  deriveBilling,
  extendCoverage,
  nextBillingInstant,
  periodEnd,
  periodForCoverage,
} from './billing.logic';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('deriveBilling', () => {
  const now = day('2026-10-20');

  it('never locks an exempt church', () => {
    const snap = deriveBilling({ billingExempt: true, trialEndsAt: day('2020-01-01') }, now);
    expect(snap).toMatchObject({ state: 'exempt', locked: false });
  });

  it('applies a support lock even when paid up or exempt', () => {
    const paid = deriveBilling(
      { billingLocked: true, paidUntil: day('2026-12-01'), trialEndsAt: day('2026-12-01'), graceDays: 7 },
      now,
    );
    expect(paid).toMatchObject({ state: 'paused', locked: true });
    const exempt = deriveBilling({ billingLocked: true, billingExempt: true }, now);
    expect(exempt.locked).toBe(true);
  });

  it('treats churches that predate billing as grandfathered', () => {
    const snap = deriveBilling({ graceDays: 7 }, now);
    expect(snap).toMatchObject({ state: 'grandfathered', locked: false, coveredUntil: null });
  });

  it('counts down the 14-day trial', () => {
    const snap = deriveBilling({ trialEndsAt: day('2026-10-27'), graceDays: 7 }, now);
    expect(snap.state).toBe('trial');
    expect(snap.locked).toBe(false);
    expect(snap.daysLeft).toBe(7);
  });

  it('keeps full access during the 7-day grace after the trial', () => {
    const snap = deriveBilling({ trialEndsAt: day('2026-10-17'), graceDays: 7 }, now);
    expect(snap.state).toBe('grace');
    expect(snap.locked).toBe(false);
    expect(snap.graceDaysLeft).toBe(4);
    expect(snap.locksAt).toEqual(day('2026-10-24'));
  });

  it('pauses once grace is over', () => {
    const snap = deriveBilling({ trialEndsAt: day('2026-10-10'), graceDays: 7 }, now);
    expect(snap.state).toBe('paused');
    expect(snap.locked).toBe(true);
    expect(snap.graceDaysLeft).toBe(0);
  });

  it('locks exactly at the grace boundary', () => {
    const snap = deriveBilling({ trialEndsAt: day('2026-10-13'), graceDays: 7 }, now);
    expect(snap.state).toBe('paused');
    expect(snap.locked).toBe(true);
  });

  it('prefers the later of paid-until and trial end', () => {
    const snap = deriveBilling(
      { trialEndsAt: day('2026-10-21'), paidUntil: day('2026-11-01'), graceDays: 7 },
      now,
    );
    expect(snap.state).toBe('active');
    expect(snap.locked).toBe(false);
  });

  it('stays on trial when the trial outlasts a short payment', () => {
    const snap = deriveBilling(
      { trialEndsAt: day('2026-11-01'), paidUntil: day('2026-10-21'), graceDays: 7 },
      now,
    );
    expect(snap.state).toBe('trial');
  });
});

describe('billing dates', () => {
  it('moves to next month when paying after the billing day', () => {
    expect(nextBillingInstant(day('2026-10-20'), 1)).toEqual(day('2026-11-01'));
  });

  it('moves a full month when paying exactly on the billing day', () => {
    expect(nextBillingInstant(day('2026-11-01'), 1)).toEqual(day('2026-12-01'));
  });

  it('honours a custom billing day', () => {
    expect(nextBillingInstant(day('2026-10-02'), 5)).toEqual(day('2026-10-05'));
    expect(nextBillingInstant(day('2026-10-06'), 5)).toEqual(day('2026-11-05'));
  });

  it('clamps billing day to 28 so every month exists', () => {
    expect(nextBillingInstant(day('2026-01-29'), 31)).toEqual(day('2026-02-28'));
  });

  it('extends from already-paid time instead of from today', () => {
    expect(extendCoverage(day('2026-12-01'), day('2026-10-20'), 1)).toEqual(day('2027-01-01'));
  });

  it('extends from today when the last payment has lapsed', () => {
    expect(extendCoverage(day('2026-09-01'), day('2026-10-20'), 1)).toEqual(day('2026-11-01'));
  });

  it('names the month the coverage belongs to', () => {
    expect(periodForCoverage(day('2026-11-01'))).toBe('2026-10');
    expect(periodEnd('2026-10')).toEqual(day('2026-11-01'));
    expect(periodEnd('2026-12')).toEqual(day('2027-01-01'));
  });
});
