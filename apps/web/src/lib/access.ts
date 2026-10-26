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

/** Shape of GET /auth/me as consumed by the shell (see auth.service#me). */
export interface SessionUser {
  name: string;
  roles: string[];
  permissions: string[];
  scope?: DataScope;
  /** Which areas this church has switched on (settings.modules). */
  modules?: ModuleFlags;
  church: { name: string; slug?: string; branding?: { logoDataUrl?: string | null; primaryColor?: string } | null };
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
  permission: Permission;
}

export interface NavGroup {
  label: string;
  hint: string;
  items: NavItem[];
}


// One app, five areas. The top bar shows Home + the five areas + Settings, and
// each area renders its own tab strip (components/area-tabs.tsx). That keeps all
// ~18 screens reachable while the top-level nav stays 7 destinations instead of
// 20 — the bloat complaint — and no route had to be deleted.
//
// Mirrors packages/shared/src/modules.ts (this app does not import the workspace
// package; the access smoke test is what catches drift).
export const MODULE_KEYS = ['people', 'worship', 'money', 'reach', 'org'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleFlags = Partial<Record<ModuleKey, boolean>>;

export const MODULE_LABELS: Record<ModuleKey, { label: string; hint: string }> = {
  people: { label: 'People', hint: 'Members, visitors, children, groups, care and follow-up' },
  worship: { label: 'Worship', hint: 'Services, check-in, serving roster, media and events' },
  money: { label: 'Money', hint: 'Giving, funds, expenses and finance reports' },
  reach: { label: 'Reach', hint: 'SMS campaigns and announcements' },
  org: { label: 'Organisation', hint: 'Departments, branches and HQ remittances' },
};

export interface NavArea {
  /** Which church-level switch hides this whole area (Settings → Modules). */
  module: ModuleKey;
  label: string;
  hint: string;
  items: NavItem[];
}

export const NAV_AREAS: NavArea[] = [
  {
    module: 'people',
    label: 'People',
    hint: 'Members, visitors, children, groups, care and follow-up',
    items: [
      { href: '/members', label: 'Members', permission: 'members:read' },
      { href: '/visitors', label: 'Visitors', permission: 'visitors:read' },
      { href: '/children', label: 'Children', permission: 'members:read' },
      { href: '/groups', label: 'Groups', permission: 'members:read' },
      { href: '/care', label: 'Care', permission: 'care:read' },
      { href: '/drip', label: 'Follow-up', permission: 'care:read' },
    ],
  },
  {
    module: 'worship',
    label: 'Worship',
    hint: 'Services, check-in, serving roster, media and events',
    items: [
      { href: '/services', label: 'Services', permission: 'services:read' },
      { href: '/checkin', label: 'Check-in', permission: 'services:read' },
      { href: '/roster', label: 'Roster', permission: 'services:read' },
      { href: '/media', label: 'Media', permission: 'media:read' },
      { href: '/events', label: 'Events', permission: 'services:read' },
    ],
  },
  {
    module: 'money',
    label: 'Money',
    hint: 'Giving, pledges, expenses and finance reports',
    items: [
      { href: '/finance', label: 'Giving', permission: 'finance:read' },
      { href: '/campaigns', label: 'Pledges', permission: 'giving:read' },
      { href: '/expenses', label: 'Expenses', permission: 'expenses:read' },
    ],
  },
  {
    module: 'reach',
    label: 'Reach',
    hint: 'SMS campaigns and announcements',
    items: [
      { href: '/sms', label: 'SMS', permission: 'sms:read' },
      { href: '/announcements', label: 'News', permission: 'campaigns:read' },
    ],
  },
  {
    module: 'org',
    label: 'Organisation',
    hint: 'Departments, branches and HQ remittances',
    items: [
      { href: '/org', label: 'Departments', permission: 'church:read' },
      { href: '/branches', label: 'Branches', permission: 'church:read' },
    ],
  },
];

/** Back-compat view for callers that only need label + hint + items. */
export const NAV_GROUPS: NavGroup[] = NAV_AREAS.map(({ label, hint, items }) => ({ label, hint, items }));

// Usher Mode: ONE app, role-scoped shell. Ushers get a mobile-first subset
// (Today / Check-in / Visitors) with big touch targets; leaders toggle it off.
export const USHER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Today', permission: 'church:read' },
  { href: '/checkin', label: 'Check-in', permission: 'services:read' },
  { href: '/services', label: 'Headcount', permission: 'services:read' },
  { href: '/visitors', label: 'Visitors', permission: 'visitors:read' },
];

/** Route → permission. Longest matching prefix wins (see routeAccess). */
export const ROUTE_ACCESS: { prefix: string; permission: Permission; label: string }[] = [
  { prefix: '/dashboard', permission: 'church:read', label: 'Dashboard' },
  { prefix: '/members', permission: 'members:read', label: 'Members' },
  { prefix: '/visitors', permission: 'visitors:read', label: 'Visitors' },
  { prefix: '/children', permission: 'members:read', label: 'Children' },
  { prefix: '/care', permission: 'care:read', label: 'Care' },
  { prefix: '/groups', permission: 'members:read', label: 'Groups' },
  { prefix: '/services', permission: 'services:read', label: 'Services' },
  { prefix: '/checkin', permission: 'services:read', label: 'Check-in' },
  { prefix: '/roster', permission: 'services:read', label: 'Roster' },
  { prefix: '/media', permission: 'media:read', label: 'Media' },
  { prefix: '/finance', permission: 'finance:read', label: 'Finance' },
  { prefix: '/campaigns', permission: 'giving:read', label: 'Pledges' },
  { prefix: '/expenses', permission: 'expenses:read', label: 'Expenses' },
  { prefix: '/events', permission: 'services:read', label: 'Events' },
  { prefix: '/drip', permission: 'care:read', label: 'Drip' },
  { prefix: '/sms', permission: 'sms:read', label: 'SMS' },
  { prefix: '/announcements', permission: 'campaigns:read', label: 'News' },
  { prefix: '/org', permission: 'church:read', label: 'Org' },
  { prefix: '/branches', permission: 'church:read', label: 'Branches' },
  { prefix: '/settings', permission: 'settings:write', label: 'Settings' },
];

/** The access rule for a pathname, or null when the path is ungated. */
export function routeAccess(pathname: string): { prefix: string; permission: Permission; label: string } | null {
  let match: { prefix: string; permission: Permission; label: string } | null = null;
  for (const rule of ROUTE_ACCESS) {
    const hit = pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
    if (hit && (!match || rule.prefix.length > match.prefix.length)) match = rule;
  }
  return match;
}

/** A church can switch an area off; absent flags mean "on" (the default today). */
export function moduleEnabled(modules: ModuleFlags | undefined, key: ModuleKey | undefined): boolean {
  if (!key) return true;
  return modules?.[key] !== false;
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

/**
 * Tabs for the current page: permission- and module-filtered, and null when there
 * is nothing to choose (a one-tab strip is noise).
 */
export function visibleAreaTabs(
  pathname: string,
  granted: readonly string[],
  modules?: ModuleFlags,
): { area: NavArea; items: NavItem[] } | null {
  const hit = areaForPath(pathname);
  if (!hit || !moduleEnabled(modules, hit.area.module)) return null;
  const items = hit.items.filter((item) => hasPermission(granted, item.permission));
  return items.length > 1 ? { area: hit.area, items } : null;
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
  if (!hasPermission(granted, rule.permission)) return false;
  if (rule.prefix === '/settings') return true;
  return moduleEnabled(modules, areaForItem(rule.prefix)?.module);
}

/** Nav groups with inaccessible items and switched-off areas removed. */
export function visibleNavGroups(granted: readonly string[], modules?: ModuleFlags): NavGroup[] {
  return NAV_AREAS.filter((area) => moduleEnabled(modules, area.module))
    .map((area) => ({
      label: area.label,
      hint: area.hint,
      items: area.items.filter((item) => hasPermission(granted, item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Usher-mode links this user may open. */
export function visibleUsherNav(granted: readonly string[]): NavItem[] {
  return USHER_NAV.filter((item) => hasPermission(granted, item.permission));
}
