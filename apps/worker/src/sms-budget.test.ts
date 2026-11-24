import { describe, expect, it } from 'vitest';
import { smsHourlyBudgetAllows } from './sms-budget';

describe('SMS hourly budget', () => {
  it('allows a message that exactly reaches the cap', () => {
    expect(smsHourlyBudgetAllows(4_996, 4, 5_000)).toBe(true);
  });

  it('blocks a message that would exceed the cap', () => {
    expect(smsHourlyBudgetAllows(4_997, 4, 5_000)).toBe(false);
  });
});
