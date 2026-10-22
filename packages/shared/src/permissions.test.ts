import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsForRoles, Permission } from './permissions';
import { inQuietHours, isValidHhMm, localHourIn, minutesSinceMidnight } from './datetime';
import { matchOptKeyword } from './enums';

describe('permissions', () => {
  it('super admin gets the wildcard', () => {
    expect(permissionsForRoles(['SUPER_ADMIN'])).toEqual(['*']);
  });

  it('merges role permissions and de-dupes', () => {
    const perms = permissionsForRoles(['USHER', 'FOLLOWUP_TEAM']);
    expect(perms).toContain('headcount:write');
    expect(perms).toContain('visitors:write');
    expect(new Set(perms).size).toBe(perms.length);
  });

  it('member role has no permissions (portal is phase 2)', () => {
    expect(permissionsForRoles(['MEMBER'])).toEqual([]);
  });

  it('hasPermission is wildcard and prefix aware', () => {
    const usher: Permission[] = permissionsForRoles(['USHER']);
    expect(hasPermission(usher, 'headcount:write')).toBe(true);
    expect(hasPermission(usher, 'finance:approve')).toBe(false);
    expect(hasPermission(['*'], 'finance:approve')).toBe(true);
    expect(hasPermission(['members:*'], 'members:write')).toBe(true);
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
