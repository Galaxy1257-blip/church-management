import { describe, expect, it } from 'vitest';
import { trapTarget } from './focus';

describe('trapTarget — dialog Tab boundary', () => {
  it('wraps Tab from the last element to the first', () => {
    expect(trapTarget(3, 2, false)).toBe(0);
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    expect(trapTarget(3, 0, true)).toBe(2);
  });

  it('Shift+Tab from the container lands on the last element', () => {
    expect(trapTarget(3, -1, true)).toBe(2);
  });

  it('lets the browser handle Tab in the middle of the list', () => {
    expect(trapTarget(3, 1, false)).toBeNull();
    expect(trapTarget(3, 1, true)).toBeNull();
  });

  it('lets Tab from the container fall through to the first element', () => {
    expect(trapTarget(3, -1, false)).toBeNull();
  });

  it('does not wrap a single focusable element onto itself needlessly', () => {
    expect(trapTarget(1, 0, false)).toBe(0);
    expect(trapTarget(1, 0, true)).toBe(0);
  });

  it('signals the container when there is nothing to focus', () => {
    expect(trapTarget(0, -1, false)).toBe(-1);
    expect(trapTarget(0, -1, true)).toBe(-1);
  });
});