import { describe, expect, it } from 'vitest';
import { MODULE_DEFAULTS, MODULE_KEYS, isModuleKey, resolveModules } from './modules';

const defaults = { people: true, worship: false, money: true, reach: true, org: true };

describe('resolveModules', () => {
  it('uses the defaults when the church has no settings (Worship off)', () => {
    expect(resolveModules(undefined)).toEqual(defaults);
    expect(resolveModules({})).toEqual(defaults);
    expect(MODULE_DEFAULTS).toEqual(defaults);
  });

  it('treats an absent key as its default and an explicit false as off', () => {
    const flags = resolveModules({ modules: { money: false } });
    expect(flags.money).toBe(false);
    expect(flags.people).toBe(true);
    expect(flags.worship).toBe(false);
  });

  it('ignores unknown keys and non-object settings', () => {
    expect(resolveModules({ modules: { money: false, spaceship: false } })).not.toHaveProperty('spaceship');
    expect(resolveModules({ modules: 'nope' })).toEqual(defaults);
    expect(resolveModules(null)).toEqual(defaults);
  });

  it('re-enables a module when the flag is true again', () => {
    expect(resolveModules({ modules: { money: false, reach: true } }).reach).toBe(true);
    expect(resolveModules({ modules: { worship: true } }).worship).toBe(true);
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
