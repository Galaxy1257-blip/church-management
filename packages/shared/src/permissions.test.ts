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
