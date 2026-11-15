import { describe, expect, it } from 'vitest';
import {
  MODULE_DEFAULTS,
  MODULE_GROUPS,
  MODULE_KEYS,
  effectiveModules,
  givingStopsWithBooks,
  isModuleKey,
  resolveModules,
  type ModuleKey,
} from './modules';

const defaults = {
  people: true,
  worship: false,
  money: true,
  reach: true,
  bible: true,
  care: false,
  roster: false,
  events: false,
  children: false,
  groups: false,
  followup: false,
  programs: false,
  special_offerings: false,
  expenses: false,
  sms: false,
  departments: false,
  branches: false,
  organization: true,
  outreach: false,
  audit: false,
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
    expect(flags.worship).toBe(false);
  });

  it('starts a new church with the areas that carry the week', () => {
    const flags = resolveModules(undefined);
    expect(Object.keys(flags).filter((key) => flags[key as ModuleKey])).toEqual([
      'people',
      'money',
      'reach',
      'bible',
      'organization',
    ]);
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

  it('lets a church switch one of the areas it starts with off', () => {
    const flags = resolveModules({ modules: { people: false } });
    expect(flags.people).toBe(false);
    expect(flags.money).toBe(true);
  });

  it('turns the Services area on when the church ticks it', () => {
    expect(resolveModules({ modules: { worship: true } }).worship).toBe(true);
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

describe('effectiveModules (group master switches)', () => {
  it('keeps a child on when its group master is on', () => {
    const flags = resolveModules({ modules: { organization: true, departments: true, branches: true } });
    const eff = effectiveModules(flags);
    expect(eff.departments).toBe(true);
    expect(eff.branches).toBe(true);
  });

  it('hides every child when the group master is off, without touching the stored value', () => {
    const flags = resolveModules({ modules: { organization: false, departments: true, branches: true, audit: true } });
    const eff = effectiveModules(flags);
    expect(eff.departments).toBe(false);
    expect(eff.branches).toBe(false);
    expect(eff.audit).toBe(false);
    // resolveModules keeps the raw child flags so Settings can show what is ticked.
    expect(flags.departments).toBe(true);
    expect(flags.branches).toBe(true);
  });

  it('lets one child stay on and another off while the master is on', () => {
    const eff = effectiveModules(resolveModules({ modules: { organization: true, departments: false, branches: true } }));
    expect(eff.departments).toBe(false);
    expect(eff.branches).toBe(true);
  });

  it('forces children off across every group whose master is off', () => {
    const eff = effectiveModules(
      resolveModules({ modules: { money: false, special_offerings: true, expenses: true, worship: false, roster: true, events: true } }),
    );
    expect(eff.special_offerings).toBe(false);
    expect(eff.expenses).toBe(false);
    expect(eff.roster).toBe(false);
    expect(eff.events).toBe(false);
    // A master that is on keeps its children governed by their own switches.
    const eff2 = effectiveModules(resolveModules({ modules: { people: true, care: true, children: false, groups: true } }));
    expect(eff2.care).toBe(true);
    expect(eff2.children).toBe(false);
    expect(eff2.groups).toBe(true);
  });

  it('lists every master and child in exactly one group', () => {
    const seen = new Set<string>();
    for (const g of MODULE_GROUPS) {
      expect(seen.has(g.key)).toBe(false);
      seen.add(g.key);
      for (const child of g.children) {
        expect(seen.has(child), `child '${child}' appears twice`).toBe(false);
        seen.add(child);
      }
    }
    // Every module key (except a pure standalone like bible) is governed by a group.
    for (const key of MODULE_KEYS) {
      if (key === 'bible') continue;
      expect(seen.has(key), `module '${key}' is in no group`).toBe(true);
    }
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

// Settings asks this question only at the moment Offerings is switched off, so
// the absent answer must mean the door the church has always had: open.
describe('givingStopsWithBooks', () => {
  it('keeps online giving open until the church says otherwise', () => {
    expect(givingStopsWithBooks(undefined)).toBe(false);
    expect(givingStopsWithBooks({})).toBe(false);
    expect(givingStopsWithBooks({ moneyOffStopsGiving: 'yes' })).toBe(false);
  });

  it('is true only when that was the answer', () => {
    expect(givingStopsWithBooks({ moneyOffStopsGiving: true })).toBe(true);
    expect(givingStopsWithBooks({ modules: { money: false }, moneyOffStopsGiving: true })).toBe(true);
  });
});
