import { describe, expect, it } from 'vitest';
import { dashboardQuickLinks, moduleEnabled, type ModuleFlags } from './access';

// The dashboard's "Today" card must not show a link the church switched off, and
// must disappear entirely when no link survives — a card of dead ends reads as
// "the app is broken" (issue #78).
describe('dashboardQuickLinks', () => {
  const allOn: ModuleFlags = {
    people: true,
    worship: true,
    money: true,
    reach: true,
    bible: true,
    care: true,
    roster: true,
    events: true,
    children: true,
    groups: true,
    followup: true,
    programs: true,
    special_offerings: true,
    expenses: true,
    sms: true,
    departments: true,
    branches: true,
    outreach: true,
    audit: true,
    organization: true,
  };

  const allOff: ModuleFlags = { ...allOn, ...(Object.fromEntries(
    Object.keys(allOn).map((k) => [k, false]),
  ) as ModuleFlags) };

  const staffPerms = ['checkin:write', 'finance:read', 'visitors:write', 'members:write', 'campaigns:write'];

  it('shows every link a fully-permissioned role may use', () => {
    expect(dashboardQuickLinks(staffPerms, allOn).map((l) => l.href)).toEqual([
      '/checkin',
      '/finance',
      '/visitors',
      '/members',
      '/reminders',
    ]);
  });

  it('returns nothing when every section is switched off', () => {
    expect(dashboardQuickLinks(staffPerms, allOff)).toEqual([]);
  });

  it('drops only the links whose own section is off', () => {
    const off: ModuleFlags = { ...allOn, money: false, reach: false };
    expect(dashboardQuickLinks(staffPerms, off).map((l) => l.href)).toEqual([
      '/checkin',
      '/visitors',
      '/members',
    ]);
  });

  it('keeps the door open for the check-in desk even with Services off', () => {
    // The usher stands at the door whatever the office hid; headcount:write is
    // what lets the count carry on, so /checkin survives a worship switch-off.
    const worshipOff: ModuleFlags = { ...allOn, worship: false };
    const usher = ['checkin:write', 'headcount:write', 'collection:write'];
    expect(dashboardQuickLinks(usher, worshipOff).map((l) => l.href)).toEqual(['/checkin']);
  });

  it('hides the check-in link when the role cannot count anyone', () => {
    const worshipOff: ModuleFlags = { ...allOn, worship: false };
    const deskClerk = ['checkin:write'];
    expect(dashboardQuickLinks(deskClerk, worshipOff)).toEqual([]);
  });

  it('shows nothing for a role with no staff permissions', () => {
    expect(dashboardQuickLinks([], allOn)).toEqual([]);
  });
});

describe('moduleEnabled', () => {
  it('treats an absent flag as on, so an old session still opens', () => {
    expect(moduleEnabled(undefined, 'money')).toBe(true);
    expect(moduleEnabled(undefined, undefined)).toBe(true);
  });

  it('honours an explicit off', () => {
    expect(moduleEnabled({ ...allOnFixture(), money: false }, 'money')).toBe(false);
    expect(moduleEnabled(allOnFixture(), 'money')).toBe(true);
  });
});

function allOnFixture(): ModuleFlags {
  return {
    people: true,
    worship: true,
    money: true,
    reach: true,
    bible: true,
    care: true,
    roster: true,
    events: true,
    children: true,
    groups: true,
    followup: true,
    programs: true,
    special_offerings: true,
    expenses: true,
    sms: true,
    departments: true,
    branches: true,
    outreach: true,
    audit: true,
    organization: true,
  };
}
