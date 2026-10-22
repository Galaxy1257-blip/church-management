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
  'media:read',
  'media:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS];

/** Wildcard understood by the guard: matches any single resource prefix. */
export const SUPER_ADMIN_PERMISSION = '*';

const READ_ONLY: Permission[] = ['church:read', 'services:read'];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[] | typeof SUPER_ADMIN_PERMISSION> = {
  SUPER_ADMIN: SUPER_ADMIN_PERMISSION,
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
    'media:read',
    'media:write',
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
    'media:read',
    'reports:read',
  ],
};

export function permissionsForRoles(roles: readonly RoleKey[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
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
