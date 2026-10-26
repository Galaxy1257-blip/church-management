import { describe, expect, it } from 'vitest';
import { MODULE_KEYS, isModuleKey, resolveModules } from './modules';

describe('resolveModules', () => {
  it('enables every module when the church has no settings', () => {
    expect(resolveModules(undefined)).toEqual({ people: true, worship: true, money: true, reach: true, org: true });
    expect(resolveModules({})).toEqual({ people: true, worship: true, money: true, reach: true, org: true });
  });

  it('treats an absent key as enabled and an explicit false as off', () => {
    const flags = resolveModules({ modules: { money: false } });
    expect(flags.money).toBe(false);
    expect(flags.people).toBe(true);
  });

  it('ignores unknown keys and non-object settings', () => {
    expect(resolveModules({ modules: { money: false, spaceship: false } })).not.toHaveProperty('spaceship');
    expect(resolveModules({ modules: 'nope' })).toEqual({ people: true, worship: true, money: true, reach: true, org: true });
    expect(resolveModules(null)).toEqual({ people: true, worship: true, money: true, reach: true, org: true });
  });

  it('re-enables a module when the flag is true again', () => {
    expect(resolveModules({ modules: { money: false, reach: true } }).reach).toBe(true);
  });

  it('always returns every known key', () => {
    expect(Object.keys(resolveModules({ modules: {} })).sort()).toEqual([...MODULE_KEYS].sort());
  });
});

describe('isModuleKey', () => {
  it('accepts known keys only', () => {
    for (const key of MODULE_KEYS) expect(isModuleKey(key)).toBe(true);
    expect(isModuleKey('spaceship')).toBe(false);
    expect(isModuleKey(42)).toBe(false);
    expect(isModuleKey(undefined)).toBe(false);
  });
});
