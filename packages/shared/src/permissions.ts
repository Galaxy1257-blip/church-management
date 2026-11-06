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
  // Two jobs that used to ride on editing a member and change far more than the
  // one person named in the form: the bulk age-group promotion run (moves every
  // child who has had a birthday) and a transfer between branches (needs a second
  // leader to approve it). Split out so a church can hand one of these to a worker
  // without opening the member record itself.
  'demographics:write',
  'branches:write',
  'services:read',
  'services:write',
  'headcount:write',
  'checkin:write',
  // The children's desk (check a child in, release them on a pickup code) is its
  // own job: a Sunday School teacher runs it for their class without being handed
  // checkin:write, which is the door register for the whole service.
  'children:write',
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
  // Approving a request onto the public prayer wall is a separate job from
  // writing one: Sunday School teachers log requests but do not publish them.
  'care:moderate',
  // Welfare carries money, so it is not part of the care queue. Follow-up,
  // elders, finance and the pastor handle it; ushers and teachers do not.
  'welfare:read',
  'welfare:write',
  // A door worker records the cash they counted; see finance.recordCollection.
  'collection:write',
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
    // Finance approves welfare payments, so it can read and decide them.
    'welfare:read',
    'welfare:write',
  ],
  USHER: [
    ...READ_ONLY,
    'members:read',
    'headcount:write',
    'checkin:write',
    // The door team enters the money they counted at the service — the amount
    // only. Reading the finance sheet/reports stays with the treasurer.
    'collection:write',
    'visitors:read',
    'visitors:write',
    // Ushers run the care queue and the prayer wall alongside the door.
    'care:read',
    'care:write',
    'care:moderate',
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
    'care:moderate',
    'welfare:read',
    'welfare:write',
  ],
  LEADER: [
    ...READ_ONLY,
    'members:read',
    'members:write',
    'members:import',
    'demographics:write',
    'branches:write',
    'headcount:write',
    'checkin:write',
    // The door team enters the money they counted at the service — the amount
    // only. Reading the finance sheet/reports stays with the treasurer.
    'collection:write',
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
    'care:moderate',
    'welfare:read',
    'welfare:write',
    'sms:read',
    'sms:send',
    'campaigns:read',
  ],
  SECRETARY: [
    ...READ_ONLY,
    'members:read',
    'members:write',
    'members:import',
    'demographics:write',
    'branches:write',
    'services:write',
    'visitors:read',
    'campaigns:read',
    'campaigns:write',
    'reports:read',
  ],
  // Sunday School teachers run two things: the care queue for the class the
  // office assigned and the children's check-in desk for that same class. The
  // desk has its own permission rather than checkin:write, because that one is
  // the door register for the whole service. Nothing here opens the member
  // directory, welfare, the wall or money — the class scope is applied in the API
  // (apps/api/src/common/class-scope.ts), not by a wider grant. The Care and
  // Children sections are opt-in switches, so a new church has to turn them on
  // before this role is useful.
  SUNDAY_SCHOOL: ['church:read', 'services:read', 'care:read', 'care:write', 'children:write'],
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

// What a permission actually is, in the words a church office uses. A refusal
// that prints "members:write" is only readable by whoever wrote the code.
const JOB_AREAS: Record<string, string> = {
  church: 'church details',
  users: 'staff accounts',
  members: 'the member register',
  demographics: 'age groups',
  branches: 'branches',
  services: 'services',
  headcount: 'the attendance count',
  checkin: 'the door register',
  children: "the children's desk",
  visitors: 'visitor cards',
  giving: 'offerings',
  finance: 'the books',
  expenses: 'expenses',
  sms: 'text messages',
  campaigns: 'campaigns',
  reports: 'reports',
  audit: 'the audit log',
  settings: 'settings',
  care: 'care requests',
  welfare: 'welfare help',
  collection: 'the offering count',
};

const JOB_VERBS: Record<string, string> = {
  read: 'see',
  write: 'change',
  import: 'import',
  approve: 'approve',
  moderate: 'approve',
  send: 'send',
  purchase: 'buy credits for',
};

// Some jobs are not well described by "change the door register": the work has
// a name in the office, so say that instead of assembling a phrase.
const JOB_PHRASES: Record<string, string> = {
  'checkin:write': 'take the door register',
  'children:write': "run the children's desk",
  'collection:write': 'count the offering',
  'headcount:write': 'record the attendance',
  'giving:write': 'record offerings',
  'expenses:write': 'record expenses',
  'sms:purchase': 'buy text credits',
  'sms:send': 'send texts',
  'users:write': 'manage staff accounts',
  'church:write': 'change church details',
  'settings:write': 'change the settings',
  'members:import': 'import a member list',
  'demographics:write': 'update age groups',
  'branches:write': 'move a member between branches',
  'care:moderate': 'approve prayer requests',
};

/** "expenses:approve" -> "approve expenses". Unknown jobs come back unchanged. */
export function permissionLabel(permission: string): string {
  const phrase = JOB_PHRASES[permission];
  if (phrase) return phrase;
  const [area, action] = permission.split(':');
  const noun = JOB_AREAS[area];
  const verb = JOB_VERBS[action ?? ''];
  if (!noun || !verb) return permission;
  return `${verb} ${noun}`;
}
