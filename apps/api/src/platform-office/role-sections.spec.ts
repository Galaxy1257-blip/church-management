import { describe, expect, it } from 'vitest';
import { MODULE_LABELS } from '@chms/shared';
import { sectionsNeededForRoles } from './role-sections';

const keys = (roles: string[], settings: unknown) => sectionsNeededForRoles(roles, settings).map((s) => s.key).sort();

describe('sectionsNeededForRoles (prompt only, never auto-enable)', () => {
  it('asks for Services when adding an usher to a church that has it off', () => {
    expect(keys(['USHER'], { modules: {} })).toEqual(['worship']);
  });

  it('asks for nothing when the section is already on', () => {
    expect(sectionsNeededForRoles(['USHER'], { modules: { worship: true } })).toEqual([]);
  });

  it('asks for Children + Services for a Sunday School teacher', () => {
    expect(keys(['SUNDAY_SCHOOL'], { modules: {} })).toEqual(['children', 'worship']);
  });

  it('asks for the money area for finance when it is off', () => {
    expect(keys(['FINANCE_ADMIN'], { modules: { money: false } })).toEqual(['expenses', 'money']);
  });

  it('asks for Care for an elder', () => {
    expect(keys(['ELDER'], { modules: {} })).toEqual(['care']);
  });

  it('never asks for anything for a member or an unknown role', () => {
    expect(sectionsNeededForRoles(['MEMBER'], { modules: {} })).toEqual([]);
    expect(sectionsNeededForRoles(['NOPE'], { modules: {} })).toEqual([]);
  });

  it('returns the shared human label for the prompt', () => {
    const [first] = sectionsNeededForRoles(['USHER'], { modules: {} });
    expect(first.label).toBe(MODULE_LABELS.worship.label);
  });
});
