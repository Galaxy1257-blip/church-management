import { describe, expect, it } from 'vitest';
import { MODULE_DEFAULTS, MODULE_KEYS, isModuleKey, resolveModules } from './modules';

const defaults = {
  people: true,
  worship: true,
  money: true,
  reach: true,
  care: false,
  roster: false,
  events: false,
  children: false,
  groups: false,
  followup: false,
  special_offerings: false,
  expenses: false,
  sms: false,
  departments: false,
  branches: false,
};

describe('resolveModules', () => {
  it('uses the defaults when the church has no settings (opt-in areas off)', () => {
    expect(resolveModules(undefined)).toEqual(defaults);
    expect(resolveModules({})).toEqual(defaults);
    expect(MODULE_DEFAULTS).toEqual(defaults);
  });

  it('treats an absent key as its default and an explicit false as off', () => {
    const flags = resolveModules({ modules: { money: false } });
    expect(flags.money).toBe(false);
    expect(flags.people).toBe(true);
    expect(flags.care).toBe(false);
    expect(flags.worship).toBe(true);
  });

  it('turns opt-in sections on when the church ticks them', () => {
    const flags = resolveModules({
      modules: {
        care: true,
        roster: true,
        events: true,
        children: true,
        groups: true,
        followup: true,
        special_offerings: true,
        expenses: true,
        sms: true,
        departments: true,
        branches: true,
      },
    });
    for (const key of MODULE_KEYS) {
      if (MODULE_DEFAULTS[key]) expect(flags[key]).toBe(true);
    }
    expect(flags.children).toBe(true);
    expect(flags.expenses).toBe(true);
  });

  it('lets a church switch one of the always-on areas off', () => {
    const flags = resolveModules({ modules: { worship: false } });
    expect(flags.worship).toBe(false);
    expect(flags.people).toBe(true);
  });

  it('ignores unknown keys and non-object settings', () => {
    expect(resolveModules({ modules: { money: false, spaceship: false } })).not.toHaveProperty('spaceship');
    expect(resolveModules({ modules: 'nope' })).toEqual(defaults);
    expect(resolveModules(null)).toEqual(defaults);
  });

  it('re-enables a module when the flag is true again', () => {
    expect(resolveModules({ modules: { money: false, reach: true } }).reach).toBe(true);
    expect(resolveModules({ modules: { expenses: true } }).expenses).toBe(true);
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
