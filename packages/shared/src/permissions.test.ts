import { describe, expect, it } from 'vitest';
import {
  hasChurchWideAccess,
  hasPermission,
  hasStaffAccess,
  PERMISSIONS,
  permissionsForRoles,
  Permission,
  resolveDataScope,
  ROLE_TIERS,
} from './permissions';
import { inQuietHours, isValidHhMm, localHourIn, minutesSinceMidnight } from './datetime';
import { matchOptKeyword, ROLE_KEYS } from './enums';

describe('permissions', () => {
  it('super admin gets the wildcard', () => {
    expect(permissionsForRoles(['SUPER_ADMIN'])).toEqual(['*']);
  });

  it('pastor sees every church permission without the platform wildcard', () => {
    const pastor = permissionsForRoles(['PASTOR']);
    expect(pastor).not.toContain('*');
    expect(pastor.length).toBe(PERMISSIONS.length);
    for (const perm of PERMISSIONS) expect(hasPermission(pastor, perm)).toBe(true);
  });

  it('merges role permissions and de-dupes', () => {
    const perms = permissionsForRoles(['USHER', 'FOLLOWUP_TEAM']);
    expect(perms).toContain('headcount:write');
    expect(perms).toContain('visitors:write');
    expect(new Set(perms).size).toBe(perms.length);
  });

  it('member role has no permissions (portal is phase 2)', () => {
    expect(permissionsForRoles(['MEMBER'])).toEqual([]);
    expect(hasStaffAccess(permissionsForRoles(['MEMBER']))).toBe(false);
  });

  it('sunday school teachers get their class queue and the children’s desk', () => {
    const teacher = permissionsForRoles(['SUNDAY_SCHOOL']);
    expect(hasPermission(teacher, 'care:read')).toBe(true);
    expect(hasPermission(teacher, 'care:write')).toBe(true);
    // The desk: pick the service, check a child of their class in and out.
    expect(hasPermission(teacher, 'services:read')).toBe(true);
    expect(hasPermission(teacher, 'children:write')).toBe(true);
    // Not checkin:write — that is the door register for the whole service, and
    // the children's desk is a smaller job than that.
    expect(hasPermission(teacher, 'checkin:write')).toBe(false);
    // No directory, no publishing to the wall, no welfare or money. The class
    // scope is what keeps the desk safe, not a wider grant.
    expect(hasPermission(teacher, 'members:read')).toBe(false);
    expect(hasPermission(teacher, 'members:write')).toBe(false);
    expect(hasPermission(teacher, 'visitors:read')).toBe(false);
    expect(hasPermission(teacher, 'care:moderate')).toBe(false);
    expect(hasPermission(teacher, 'welfare:read')).toBe(false);
    expect(hasPermission(teacher, 'finance:read')).toBe(false);
    expect(hasPermission(teacher, 'settings:write')).toBe(false);
  });

  it('the door team keeps the service register but not the children’s desk', () => {
    const usher = permissionsForRoles(['USHER']);
    expect(hasPermission(usher, 'checkin:write')).toBe(true);
    // The pickup list is the office's and the class teacher's; check-in rights
    // for the Sunday door do not hand over who may collect somebody's child.
    expect(hasPermission(usher, 'children:write')).toBe(false);
  });

  it('ushers can run the care queue they are allowed to see, but not welfare', () => {
    const usher = permissionsForRoles(['USHER']);
    expect(hasPermission(usher, 'care:read')).toBe(true);
    expect(hasPermission(usher, 'care:write')).toBe(true);
    expect(hasPermission(usher, 'care:moderate')).toBe(true);
    expect(hasPermission(usher, 'welfare:read')).toBe(false);
    expect(hasPermission(usher, 'welfare:write')).toBe(false);
  });

  it('welfare stays with follow-up, elders, finance and the pastor', () => {
    for (const role of ['FOLLOWUP_TEAM', 'ELDER', 'FINANCE_ADMIN', 'PASTOR'] as const) {
      const perms = permissionsForRoles([role]);
      expect(hasPermission(perms, 'welfare:read')).toBe(true);
      expect(hasPermission(perms, 'welfare:write')).toBe(true);
    }
  });

  it('Care is opened by care:read, and these six roles hold it', () => {
    // The app used to keep its own list of who may see Care
    // (apps/web/src/lib/access.ts#CARE_ROLES, audit round 5 point 6). It drifted:
    // elders and the follow-up team held the permission and no screen, and so did
    // the pastor and this office. The permission is now the only rule, here.
    const holders = ROLE_KEYS.filter((role) =>
      hasPermission(permissionsForRoles([role]), 'care:read'),
    ).sort();
    expect(holders).toEqual(['ELDER', 'FOLLOWUP_TEAM', 'PASTOR', 'SUNDAY_SCHOOL', 'SUPER_ADMIN', 'USHER']);
    // Nobody else reaches the care queue: a leader, secretary, treasurer or member
    // has no care:read, so the nav hides it and the API 403s.
    for (const role of ['LEADER', 'SECRETARY', 'FINANCE_ADMIN', 'MEMBER'] as const) {
      expect(hasPermission(permissionsForRoles([role]), 'care:read')).toBe(false);
    }
  });

  it('lower leaders only get their own modules', () => {
    const usher = permissionsForRoles(['USHER']);
    expect(hasPermission(usher, 'headcount:write')).toBe(true);
    expect(hasPermission(usher, 'members:read')).toBe(true);
    expect(hasPermission(usher, 'finance:read')).toBe(false);
    expect(hasPermission(usher, 'settings:write')).toBe(false);
    expect(hasChurchWideAccess(['USHER'])).toBe(false);
  });

  it('hasPermission is wildcard and prefix aware', () => {
    const usher: Permission[] = permissionsForRoles(['USHER']);
    expect(hasPermission(usher, 'headcount:write')).toBe(true);
    expect(hasPermission(usher, 'finance:approve')).toBe(false);
    expect(hasPermission(['*'], 'finance:approve')).toBe(true);
    expect(hasPermission(['members:*'], 'members:write')).toBe(true);
  });

  it('declares a tier for every role key', () => {
    for (const role of ROLE_KEYS) expect(ROLE_TIERS[role]).toBeTruthy();
  });
});

describe('role scopes', () => {
  it('platform and church tiers see the whole church', () => {
    expect(resolveDataScope(['SUPER_ADMIN'])).toBe('ALL');
    expect(resolveDataScope(['PASTOR'])).toBe('ALL');
    expect(hasChurchWideAccess(['PASTOR'])).toBe(true);
  });

  it('department tiers are branch-scoped only when assigned to branches', () => {
    expect(resolveDataScope(['LEADER'])).toBe('ALL');
    expect(resolveDataScope(['LEADER'], ['b1'])).toBe('BRANCH');
    expect(resolveDataScope(['USHER'], ['b1', 'b2'])).toBe('BRANCH');
  });

  it('members are self-scoped and role-less users get nothing', () => {
    expect(resolveDataScope(['MEMBER'])).toBe('SELF');
    expect(resolveDataScope([])).toBe('NONE');
  });

  it('a church-tier role widens a mixed set', () => {
    expect(resolveDataScope(['MEMBER', 'PASTOR'], ['b1'])).toBe('ALL');
  });
});

describe('datetime helpers', () => {
  it('parses HH:MM', () => {
    expect(isValidHhMm('09:30')).toBe(true);
    expect(isValidHhMm('23:59')).toBe(true);
    expect(isValidHhMm('24:00')).toBe(false);
    expect(isValidHhMm('9:30')).toBe(false);
    expect(minutesSinceMidnight('09:30')).toBe(570);
  });

  it('handles quiet hours including midnight wrap', () => {
    expect(inQuietHours(22, 20, 8)).toBe(true);
    expect(inQuietHours(3, 20, 8)).toBe(true);
    expect(inQuietHours(12, 20, 8)).toBe(false);
    expect(inQuietHours(10, 9, 17)).toBe(true);
    expect(inQuietHours(18, 9, 17)).toBe(false);
    expect(inQuietHours(12, 8, 8)).toBe(false); // equal = disabled
  });

  it('reads current hour in a timezone', () => {
    // Accra is UTC+0 year-round
    const h = localHourIn('Africa/Accra', new Date('2026-01-01T13:45:00Z'));
    expect(h).toBe(13);
  });
});

describe('opt keywords', () => {
  it('matches stop/start case-insensitively, whole message only', () => {
    expect(matchOptKeyword('STOP')).toEqual({ kind: 'OUT', keyword: 'STOP' });
    expect(matchOptKeyword(' stop ')).toEqual({ kind: 'OUT', keyword: 'STOP' });
    expect(matchOptKeyword('Start')).toEqual({ kind: 'IN', keyword: 'START' });
    expect(matchOptKeyword('please STOP spamming')).toBeNull();
  });
});
