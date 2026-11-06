import { describe, expect, it } from 'vitest';
import { ghs } from './format';

// One money format for the whole staff app, because a board report and a giving
// screen that print the same gift two different ways get questioned in meeting.
describe('ghs', () => {
  it('writes the sign Ghanaians use, with the pesewas', () => {
    expect(ghs(1234)).toBe('GH₵ 12.34');
    expect(ghs(5)).toBe('GH₵ 0.05');
    expect(ghs(0)).toBe('GH₵ 0.00');
  });

  it('groups thousands so a five-figure offering stays readable', () => {
    expect(ghs(123456789)).toBe('GH₵ 1,234,567.89');
    expect(ghs(49400000)).toBe('GH₵ 494,000.00');
  });

  it('keeps the sign on a negative amount, before the number', () => {
    expect(ghs(-250)).toBe('-GH₵ 2.50');
  });
});
