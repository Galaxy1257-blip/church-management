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
export const MODULE_KEYS = ['people', 'worship', 'money', 'reach', 'org'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleFlags = Partial<Record<ModuleKey, boolean>>;

/** Must match packages/shared MODULE_DEFAULTS. Worship starts switched off. */
export const MODULE_DEFAULTS: Record<ModuleKey, boolean> = {
  people: true,
  worship: false,
  money: true,
  reach: true,
  org: true,
};

export const MODULE_LABELS: Record<ModuleKey, { label: string; hint: string }> = {
  people: { label: 'People', hint: 'Members, visitors, children, groups, care and follow-up' },
  worship: { label: 'Worship', hint: 'Services, check-in, serving team, media and events' },
  money: { label: 'Money', hint: 'Offerings, special events, expenses and money reports' },
  reach: { label: 'Reach', hint: 'SMS campaigns and announcements' },
  org: { label: 'Organisation', hint: 'Departments, branches and money sent to HQ' },
};

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
    hint: 'Members, visitors, children, groups, care and follow-up',
    items: [
      { href: '/members', label: 'Members', permissions: ['members:read'] },
      { href: '/visitors', label: 'Visitors', permissions: ['visitors:read'] },
      { href: '/children', label: 'Children', permissions: ['members:write'] },
      { href: '/groups', label: 'Groups', permissions: ['members:write'] },
      { href: '/care', label: 'Care', permissions: ['care:read'] },
      { href: '/drip', label: 'Follow-up', permissions: ['care:read'] },
    ],
  },
  {
    module: 'worship',
    label: 'Worship',
    hint: 'Services, check-in, serving team, media and events',
    items: [
      { href: '/services', label: 'Services', permissions: ['services:read'] },
      { href: '/checkin', label: 'Check-in', permissions: ['checkin:write'] },
      { href: '/roster', label: 'Serving team', permissions: ['members:write'] },
      { href: '/media', label: 'Media', permissions: ['media:read'] },
      { href: '/events', label: 'Events', permissions: ['services:write', 'members:write'] },
    ],
  },
  {
    module: 'money',
    label: 'Money',
    hint: 'Offerings, special events, expenses and reports',
    items: [
      { href: '/finance', label: 'Offerings', permissions: ['finance:read'] },
      { href: '/campaigns', label: 'Special offerings', permissions: ['giving:read'] },
      { href: '/expenses', label: 'Expenses', permissions: ['expenses:read'] },
    ],
  },
  {
    module: 'reach',
    label: 'Reach',
    hint: 'SMS campaigns and announcements',
    items: [
      { href: '/sms', label: 'SMS', permissions: ['sms:read'] },
      { href: '/announcements', label: 'News', permissions: ['campaigns:read'] },
    ],
  },
  {
    module: 'org',
    label: 'Organisation',
    hint: 'Departments, branches and money sent to HQ',
    items: [
      { href: '/org', label: 'Departments', permissions: ['church:write', 'settings:write'] },
      { href: '/branches', label: 'Branches', permissions: ['church:write', 'settings:write', 'finance:read'] },
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
}

/** Route → permissions (any one opens it). Longest matching prefix wins. */
export const ROUTE_ACCESS: AccessRule[] = [
  { prefix: '/dashboard', permissions: ['church:read'], label: 'Dashboard' },
  { prefix: '/members', permissions: ['members:read'], label: 'Members' },
  { prefix: '/visitors', permissions: ['visitors:read'], label: 'Visitors' },
  { prefix: '/children', permissions: ['members:write'], label: 'Children' },
  { prefix: '/care', permissions: ['care:read'], label: 'Care' },
  { prefix: '/groups', permissions: ['members:write'], label: 'Groups' },
  { prefix: '/services', permissions: ['services:read'], label: 'Services' },
  { prefix: '/checkin', permissions: ['checkin:write'], label: 'Check-in' },
  { prefix: '/roster', permissions: ['members:write'], label: 'Serving team' },
  { prefix: '/media', permissions: ['media:read'], label: 'Media' },
  { prefix: '/finance', permissions: ['finance:read'], label: 'Offerings' },
  { prefix: '/campaigns', permissions: ['giving:read'], label: 'Special offerings' },
  { prefix: '/expenses', permissions: ['expenses:read'], label: 'Expenses' },
  { prefix: '/events', permissions: ['services:write', 'members:write'], label: 'Events' },
  { prefix: '/drip', permissions: ['care:read'], label: 'Follow-up' },
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

function mayOpen(granted: readonly string[], item: NavItem): boolean {
  return hasAnyPermission(granted, item.permissions);
}

/**
 * True when the permission set may open this route. `modules` is the church's
 * switch set: a disabled area counts as unavailable, except /settings — that is
 * where the switches live, so it must stay reachable to switch them back on.
 */
export function canAccessPath(
  granted: readonly string[],
  pathname: string,
  modules?: ModuleFlags,
): boolean {
  const rule = routeAccess(pathname);
  if (!rule) return true;
  if (!hasAnyPermission(granted, rule.permissions)) return false;
  if (rule.prefix === '/settings') return true;
  return moduleEnabled(modules, areaForItem(rule.prefix)?.module);
}

/** Nav groups with inaccessible items and switched-off areas removed. */
export function visibleNavGroups(granted: readonly string[], modules?: ModuleFlags): NavGroup[] {
  return NAV_AREAS.filter((area) => moduleEnabled(modules, area.module))
    .map((area) => ({
      label: area.label,
      hint: area.hint,
      items: area.items.filter((item) => mayOpen(granted, item)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Usher-mode links this user may open. */
export function visibleUsherNav(granted: readonly string[]): NavItem[] {
  return USHER_NAV.filter((item) => mayOpen(granted, item));
}
