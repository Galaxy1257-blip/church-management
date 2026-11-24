import { describe, expect, it } from 'vitest';
import { memberIdPrefix } from './member-no';

describe('church member ID prefixes', () => {
  it.each([
    ['Demo Church', 'DEMO'],
    ['Grace Bible Church', 'GB'],
    ['The River of Life Christian Centre', 'RL'],
    ['Église Baptiste Church', 'EB'],
    ['A Church', 'AC'],
    ['教会', 'CH'],
  ])('derives a readable prefix for %s', (name, expected) => {
    expect(memberIdPrefix(name)).toBe(expected);
  });
});
