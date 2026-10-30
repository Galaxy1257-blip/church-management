// ============================================================
// Permission model. Default-deny: every API route must declare
// @RequirePermissions(...) or @Public(); the boot check fails the
// API when a handler declares neither (BUILD_ORDER Phase 0).
// ============================================================

import type { RoleKey } from './enums';

export const PERMISSIONS = [
  'church:read',
  'church:write',
  'users:read',
  'users:write',
  'members:read',
  'members:write',
  'members:import',
  'services:read',
  'services:write',
  'headcount:write',
  'checkin:write',
  'visitors:read',
  'visitors:write',
  'giving:read',
  'giving:write',
  'finance:read',
  'finance:approve',
  'expenses:read',
  'expenses:write',
  'expenses:approve',
  'sms:read',
  'sms:send',
  'sms:purchase',
  'campaigns:read',
  'campaigns:write',
  'reports:read',
  'audit:read',
  'settings:write',
  'care:read',
  'care:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS];

/** Wildcard understood by the guard: matches any single resource prefix. */
export const SUPER_ADMIN_PERMISSION = '*';

const READ_ONLY: Permission[] = ['church:read', 'services:read'];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[] | typeof SUPER_ADMIN_PERMISSION> = {
  SUPER_ADMIN: SUPER_ADMIN_PERMISSION,
  // Pastor: the head of the church sees every module. An explicit list (not '*')
  // keeps the platform wildcard exclusive to SUPER_ADMIN/future platform-only
  // permissions while still granting full church visibility today.
  PASTOR: [...PERMISSIONS],
  FINANCE_ADMIN: [
    ...READ_ONLY,
    'members:read',
    'users:read',
    'giving:read',
    'giving:write',
    'finance:read',
    'finance:approve',
    'expenses:read',
    'expenses:write',
    'expenses:approve',
    'sms:read',
    'sms:send',
    'sms:purchase',
    'campaigns:read',
    'campaigns:write',
    'reports:read',
    'audit:read',
  ],
  USHER: [
    ...READ_ONLY,
    'members:read',
    'headcount:write',
    'checkin:write',
    'visitors:read',
    'visitors:write',
    // Ushers run welfare and the care queue alongside the door.
    'care:read',
    'care:write',
  ],
  FOLLOWUP_TEAM: [
    ...READ_ONLY,
    'members:read',
    'visitors:read',
    'visitors:write',
    'sms:read',
    'sms:send',
    'care:read',
    'care:write',
  ],
  LEADER: [
    ...READ_ONLY,
    'members:read',
    'members:write',
    'members:import',
    'headcount:write',
    'checkin:write',
    'visitors:read',
    'visitors:write',
    'giving:read',
    'campaigns:read',
    'reports:read',
  ],
  MEMBER: [],
  // R4.7 Ghana church roles: Elder (pastoral care + services) and
  // Secretary (records: members, events, announcements).
  ELDER: [
    ...READ_ONLY,
    'members:read',
    'visitors:read',
    'visitors:write',
    'care:read',
    'care:write',
    'sms:read',
    'sms:send',
    'campaigns:read',
  ],
  SECRETARY: [
    ...READ_ONLY,
    'members:read',
    'members:write',
    'members:import',
    'services:write',
    'visitors:read',
    'campaigns:read',
    'campaigns:write',
    'reports:read',
  ],
  // Sunday School teachers look after children: records, check-in and the care
  // queue. They hold no finance or settings permissions.
  SUNDAY_SCHOOL: [
    ...READ_ONLY,
    'members:read',
    'members:write',
    'headcount:write',
    'checkin:write',
    'visitors:read',
    'visitors:write',
    'care:read',
    'care:write',
  ],
};

export function permissionsForRoles(roles: readonly RoleKey[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) continue; // unknown/legacy role key: grant nothing (default-deny)
    if (perms === SUPER_ADMIN_PERMISSION) return [SUPER_ADMIN_PERMISSION as unknown as Permission];
    for (const p of perms) set.add(p);
  }
  return [...set];
}

/** True when a permission set satisfies a required permission (wildcard aware). */
export function hasPermission(granted: readonly string[], required: Permission): boolean {
  if (granted.includes(SUPER_ADMIN_PERMISSION)) return true;
  if (granted.includes(required)) return true;
  const resource = required.split(':')[0];
  return granted.includes(`${resource}:*`);
}

// ============================================================
// Visibility tiers. The API enforces permissions; the tier answers
// "should this person see the whole church, only their modules, or
// nothing in the staff app?" so api/web/worker agree on the answer.
// ============================================================

export type RoleTier = 'PLATFORM' | 'CHURCH' | 'DEPARTMENT' | 'SELF';

export const ROLE_TIERS: Record<RoleKey, RoleTier> = {
  SUPER_ADMIN: 'PLATFORM',
  PASTOR: 'CHURCH',
  FINANCE_ADMIN: 'DEPARTMENT',
  USHER: 'DEPARTMENT',
  FOLLOWUP_TEAM: 'DEPARTMENT',
  LEADER: 'DEPARTMENT',
  ELDER: 'DEPARTMENT',
  SECRETARY: 'DEPARTMENT',
  SUNDAY_SCHOOL: 'DEPARTMENT',
  MEMBER: 'SELF',
};

/** How much of the church a user may see. */
export type DataScope = 'ALL' | 'BRANCH' | 'SELF' | 'NONE';

/**
 * Widest scope across the user's roles:
 *  - PLATFORM/CHURCH tier → ALL (superuser, pastor)
 *  - DEPARTMENT tier → BRANCH when the user has branch assignments,
 *    otherwise ALL (schema: no UserBranch rows = church-wide access)
 *  - SELF only (member) → SELF; no roles at all → NONE
 */
export function resolveDataScope(roles: readonly RoleKey[], branchIds: readonly string[] = []): DataScope {
  if (roles.length === 0) return 'NONE';
  let scope: DataScope = 'SELF';
  for (const role of roles) {
    const tier = ROLE_TIERS[role];
    if (tier === 'PLATFORM' || tier === 'CHURCH') return 'ALL';
    if (tier === 'DEPARTMENT') scope = branchIds.length > 0 ? 'BRANCH' : 'ALL';
  }
  return scope;
}

/** True when any role the user holds is allowed to see the whole church. */
export function hasChurchWideAccess(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => {
    const tier = ROLE_TIERS[role];
    return tier === 'PLATFORM' || tier === 'CHURCH';
  });
}

/** True when the user may use the staff app at all (members use /portal). */
export function hasStaffAccess(permissions: readonly string[]): boolean {
  return permissions.length > 0;
}
