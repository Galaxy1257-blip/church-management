// Permission-gated navigation + route guard for the staff app.
//
// The API is the security boundary (every route declares @RequirePermissions and
// returns 403 otherwise); this module only decides what a signed-in person is
// SHOWN. It mirrors packages/shared/src/permissions.ts — the web app does not
// import the workspace package (same reason as lib/shared-constants.ts), so the
// permission strings below must stay in sync with PERMISSIONS there.

export type Permission = string;

/** Wildcard- and prefix-aware check, identical to shared `hasPermission`. */
export function hasPermission(granted: readonly string[], required: Permission): boolean {
  if (granted.includes('*') || granted.includes(required)) return true;
  const resource = required.split(':')[0];
  return granted.includes(`${resource}:*`);
}

/** True when the user holds at least one of the listed permissions. */
export function hasAnyPermission(granted: readonly string[], required: readonly Permission[]): boolean {
  return required.some((p) => hasPermission(granted, p));
}

/** MEMBER holds no staff permission and belongs in /portal, not the modules. */
export function hasStaffAccess(granted: readonly string[]): boolean {
  return granted.length > 0;
}

export type DataScope = 'ALL' | 'BRANCH' | 'SELF' | 'NONE';

export const SCOPE_LABEL: Record<DataScope, string> = {
  ALL: 'Whole church',
  BRANCH: 'Assigned branches',
  SELF: 'Own records',
  NONE: 'No access',
};

/** Per-church extras set up by the office (settings.customFeatures). */
export interface CustomFeature {
  key: string;
  label: string;
  description?: string;
  href?: string;
  enabled: boolean;
}

/** Shape of GET /auth/me as consumed by the shell (see auth.service#me). */
export interface SessionUser {
  name: string;
  roles: string[];
  permissions: string[];
  scope?: DataScope;
  /** Which areas this church has switched on (settings.modules). */
  modules?: ModuleFlags;
  /** Extras the platform office added for this church alone. */
  extras?: CustomFeature[];
  church: { name: string; slug?: string; branding?: { logoDataUrl?: string | null; primaryColor?: string } | null };
  /** Subscription state (see api billing.logic) — the shell shows the lock screen from it. */
  billing?: {
    state: string;
    locked: boolean;
    coveredUntil: string | null;
    locksAt: string | null;
    amountMinor: number;
  };
}

/** Human label for the role chip: FINANCE_ADMIN → "Finance admin". */
export function describeRoles(roles: readonly string[]): string {
  if (roles.length === 0) return 'Member';
  return roles
    .map((role) => {
      const words = role.toLowerCase().split('_');
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
      return words.join(' ');
    })
    .join(' · ');
}

export interface NavItem {
  href: string;
  label: string;
  /** Any one of these permissions opens the page (and shows the link). */
  permissions: Permission[];
  /** Which app-section switch hides this page (absent = the area's switch). */
  module?: ModuleKey;
  /** When set, only these role keys may see/open the page. */
  roles?: readonly string[];
}

export interface NavGroup {
  label: string;
  hint: string;
  items: NavItem[];
}

// One app, five areas. The sidebar lists every permitted page once, grouped by
// area (components/app-nav.tsx); usher mode swaps it for a labelled rail and
// phones get the same list as a drawer. No route was deleted to get there.
//
// Mirrors packages/shared/src/modules.ts (this app does not import the workspace
// package; the access smoke test is what catches drift).
export const MODULE_KEYS = [
  'people',
  'worship',
  'money',
  'reach',
  'care',
  'roster',
  'events',
  'children',
  'groups',
  'followup',
  'special_offerings',
  'expenses',
  'sms',
  'departments',
  'branches',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleFlags = Partial<Record<ModuleKey, boolean>>;

/**
 * Must match packages/shared MODULE_DEFAULTS. The first four carry the week —
 * directory, service, offering, news — and everything after them is opt-in.
 */
export const MODULE_DEFAULTS: Record<ModuleKey, boolean> = {
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

export const MODULE_LABELS: Record<ModuleKey, { label: string; hint: string }> = {
  people: { label: 'Members & visitors', hint: 'The directory, visitors and giving history' },
  worship: { label: 'Services', hint: 'The service list and Sunday attendance' },
  money: { label: 'Offerings', hint: 'Sunday giving and the money reports' },
  reach: { label: 'News', hint: 'Announcements the congregation sees' },
  care: {
    label: 'Care',
    hint: 'Prayer requests and people to look after. Ushers see the whole queue; a Sunday School teacher sees only their class.',
  },
  roster: { label: 'Serving team', hint: 'Who serves on the rota each service' },
  events: { label: 'Events', hint: 'Event pages and the people who say they are coming' },
  children: { label: 'Children', hint: 'Child records, plus check-in and pickup codes. Sunday School teachers use this.' },
  groups: { label: 'Groups & cells', hint: 'Cell groups and ministries, with the people in each' },
  followup: { label: 'Follow-up', hint: 'Automatic messages to visitors after a service' },
  special_offerings: { label: 'Special offerings', hint: 'Harvest, building fund and other one-off appeals' },
  expenses: { label: 'Expenses', hint: 'Record spending, see the month total, send a summary as a PDF' },
  sms: { label: 'SMS campaigns', hint: 'Paid texts sent to many numbers at once' },
  departments: { label: 'Departments', hint: 'Church departments and their leaders' },
  branches: { label: 'Branches', hint: 'Branches and money sent to HQ' },
};

/** Care is for the people who look after the congregation week to week. */
export const CARE_ROLES: readonly string[] = ['USHER', 'SUNDAY_SCHOOL'];

export function isCareRole(roles: readonly string[] | undefined): boolean {
  return !!roles && roles.some((role) => CARE_ROLES.includes(role));
}

export interface NavArea {
  /** Which church-level switch hides this whole area (Settings → App sections). */
  module: ModuleKey;
  label: string;
  hint: string;
  items: NavItem[];
}

// Each link names the permission that actually fits the job. Broad read
// permissions (services:read, church:read) are not enough on their own: an usher
// can count attendance without also seeing groups, events or HQ departments.
export const NAV_AREAS: NavArea[] = [
  {
    module: 'people',
    label: 'People',
    hint: 'Members, visitors and the people pages this church switched on',
    items: [
      { href: '/members', label: 'Members', permissions: ['members:read'] },
      { href: '/visitors', label: 'Visitors', permissions: ['visitors:read'] },
      { href: '/children', label: 'Children', permissions: ['members:write'], module: 'children' },
      { href: '/groups', label: 'Groups', permissions: ['members:write'], module: 'groups' },
      { href: '/care', label: 'Care', permissions: ['care:read'], module: 'care', roles: CARE_ROLES },
      // Follow-up plans are for the visitor team, not a care-only teacher.
      { href: '/drip', label: 'Follow-up', permissions: ['visitors:read'], module: 'followup' },
    ],
  },
  {
    module: 'worship',
    label: 'Worship',
    hint: 'Services and the attendance count',
    items: [
      { href: '/services', label: 'Services', permissions: ['services:read'] },
      { href: '/checkin', label: 'Check-in', permissions: ['checkin:write'] },
      { href: '/roster', label: 'Serving team', permissions: ['members:write'], module: 'roster' },
      { href: '/events', label: 'Events', permissions: ['services:write', 'members:write'], module: 'events' },
    ],
  },
  {
    module: 'money',
    label: 'Money',
    hint: 'Offerings and the money pages this church switched on',
    items: [
      { href: '/finance', label: 'Offerings', permissions: ['finance:read'] },
      { href: '/campaigns', label: 'Special offerings', permissions: ['giving:read'], module: 'special_offerings' },
      { href: '/expenses', label: 'Expenses', permissions: ['expenses:read'], module: 'expenses' },
    ],
  },
  {
    module: 'reach',
    label: 'Reach',
    hint: 'News to the congregation',
    items: [
      { href: '/sms', label: 'SMS', permissions: ['sms:read'], module: 'sms' },
      { href: '/announcements', label: 'News', permissions: ['campaigns:read'] },
    ],
  },
  {
    module: 'departments',
    label: 'Organisation',
    hint: 'Departments, branches and money sent to HQ',
    items: [
      { href: '/org', label: 'Departments', permissions: ['church:write', 'settings:write'], module: 'departments' },
      { href: '/branches', label: 'Branches', permissions: ['church:write', 'settings:write', 'finance:read'], module: 'branches' },
    ],
  },
];

/** Back-compat view for callers that only need label + hint + items. */
export const NAV_GROUPS: NavGroup[] = NAV_AREAS.map(({ label, hint, items }) => ({ label, hint, items }));

// Usher Mode: ONE app, role-scoped shell. Ushers get a mobile-first subset
// (Today / Check-in / Visitors) with big touch targets; leaders toggle it off.
export const USHER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Today', permissions: ['church:read'] },
  { href: '/checkin', label: 'Check-in', permissions: ['checkin:write'] },
  { href: '/services', label: 'Attendance', permissions: ['services:read'] },
  { href: '/visitors', label: 'Visitors', permissions: ['visitors:read'] },
];

export interface AccessRule {
  prefix: string;
  permissions: Permission[];
  label: string;
  /** When set, only these role keys may open the route. */
  roles?: readonly string[];
}

/** Route → permissions (any one opens it). Longest matching prefix wins. */
export const ROUTE_ACCESS: AccessRule[] = [
  { prefix: '/dashboard', permissions: ['church:read'], label: 'Dashboard' },
  { prefix: '/members', permissions: ['members:read'], label: 'Members' },
  { prefix: '/visitors', permissions: ['visitors:read'], label: 'Visitors' },
  { prefix: '/children', permissions: ['members:write'], label: 'Children' },
  { prefix: '/care', permissions: ['care:read'], roles: CARE_ROLES, label: 'Care' },
  { prefix: '/groups', permissions: ['members:write'], label: 'Groups' },
  { prefix: '/services', permissions: ['services:read'], label: 'Services' },
  { prefix: '/checkin', permissions: ['checkin:write'], label: 'Check-in' },
  { prefix: '/roster', permissions: ['members:write'], label: 'Serving team' },
  { prefix: '/finance', permissions: ['finance:read'], label: 'Offerings' },
  { prefix: '/campaigns', permissions: ['giving:read'], label: 'Special offerings' },
  { prefix: '/expenses', permissions: ['expenses:read'], label: 'Expenses' },
  { prefix: '/events', permissions: ['services:write', 'members:write'], label: 'Events' },
  { prefix: '/drip', permissions: ['visitors:read'], label: 'Follow-up' },
  { prefix: '/sms', permissions: ['sms:read'], label: 'SMS' },
  { prefix: '/announcements', permissions: ['campaigns:read'], label: 'News' },
  { prefix: '/org', permissions: ['church:write', 'settings:write'], label: 'Departments' },
  { prefix: '/branches', permissions: ['church:write', 'settings:write', 'finance:read'], label: 'Branches' },
  { prefix: '/settings', permissions: ['settings:write'], label: 'Settings' },
  // Custom features the office delivered for this church (settings.customFeatures).
  { prefix: '/extras', permissions: ['church:read'], label: 'Extras' },
  // Not in the sidebar: reached from Settings and from the paused-workspace screen.
  { prefix: '/billing', permissions: ['settings:write'], label: 'Subscription' },
];

/** The access rule for a pathname, or null when the path is ungated. */
export function routeAccess(pathname: string): AccessRule | null {
  let match: AccessRule | null = null;
  for (const rule of ROUTE_ACCESS) {
    const hit = pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
    if (hit && (!match || rule.prefix.length > match.prefix.length)) match = rule;
  }
  return match;
}

/** A church can switch an area off; absent flags use the church defaults. */
export function moduleEnabled(modules: ModuleFlags | undefined, key: ModuleKey | undefined): boolean {
  if (!key) return true;
  return modules?.[key] ?? MODULE_DEFAULTS[key];
}

/** The area a nav href belongs to (maps a route rule back to its module). */
export function areaForItem(href: string): NavArea | null {
  return NAV_AREAS.find((area) => area.items.some((item) => item.href === href)) ?? null;
}

/** The switch that hides this page: its own override, else its area's module. */
export function moduleForItem(href: string): ModuleKey | undefined {
  for (const area of NAV_AREAS) {
    const item = area.items.find((candidate) => candidate.href === href);
    if (item) return item.module ?? area.module;
  }
  return undefined;
}

/** The module switch for the current pathname (longest matching item wins). */
export function moduleForPath(pathname: string): ModuleKey | undefined {
  let match: { href: string; module: ModuleKey } | null = null;
  for (const area of NAV_AREAS) {
    for (const item of area.items) {
      const hit = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit && (!match || item.href.length > match.href.length)) {
        match = { href: item.href, module: item.module ?? area.module };
      }
    }
  }
  return match?.module;
}

/** The area the current pathname lives in, with its full item list. */
export function areaForPath(pathname: string): { area: NavArea; items: NavItem[] } | null {
  for (const area of NAV_AREAS) {
    for (const item of area.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return { area, items: area.items };
      }
    }
  }
  return null;
}

function mayOpen(granted: readonly string[], item: NavItem, roles?: readonly string[]): boolean {
  if (!hasAnyPermission(granted, item.permissions)) return false;
  if (item.roles && !item.roles.some((role) => roles?.includes(role))) return false;
  return true;
}

/**
 * True when the permission set may open this route. `modules` is the church's
 * switch set: a disabled section counts as unavailable, except /settings — that
 * is where the switches live, so it must stay reachable to switch them back on.
 * `roles` is the signed-in role-key list, used by the few pages that name roles.
 */
export function canAccessPath(
  granted: readonly string[],
  pathname: string,
  modules?: ModuleFlags,
  roles?: readonly string[],
): boolean {
  const rule = routeAccess(pathname);
  if (!rule) return true;
  if (!hasAnyPermission(granted, rule.permissions)) return false;
  if (rule.roles && !rule.roles.some((role) => roles?.includes(role))) return false;
  if (rule.prefix === '/settings') return true;
  return moduleEnabled(modules, moduleForPath(pathname));
}

/** Nav groups with inaccessible items and switched-off sections removed. */
export function visibleNavGroups(
  granted: readonly string[],
  modules?: ModuleFlags,
  roles?: readonly string[],
): NavGroup[] {
  return NAV_AREAS.map((area) => ({
    label: area.label,
    hint: area.hint,
    items: area.items.filter(
      (item) =>
        moduleEnabled(modules, item.module ?? area.module) && mayOpen(granted, item, roles),
    ),
  })).filter((group) => group.items.length > 0);
}

/** Usher-mode links this user may open. */
export function visibleUsherNav(granted: readonly string[]): NavItem[] {
  return USHER_NAV.filter((item) => mayOpen(granted, item));
}
