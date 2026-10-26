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


// Grouped nav: one clean topbar row (Dashboard · People · Worship · Finance ·
// Outreach · Org · Settings). Every item declares the permission its data needs,
// so a leader never sees a module the API would 403.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'People',
    hint: 'Members, visitors, children, care queue and small groups',
    items: [
      { href: '/members', label: 'Members', permission: 'members:read' },
      { href: '/visitors', label: 'Visitors', permission: 'visitors:read' },
      { href: '/children', label: 'Children', permission: 'members:read' },
      { href: '/care', label: 'Care', permission: 'care:read' },
      { href: '/groups', label: 'Groups', permission: 'members:read' },
    ],
  },
  {
    label: 'Worship',
    hint: 'Services, check-in, serving roster and media/projection',
    items: [
      { href: '/services', label: 'Services', permission: 'services:read' },
      { href: '/checkin', label: 'Check-in', permission: 'services:read' },
      { href: '/roster', label: 'Roster', permission: 'services:read' },
      { href: '/media', label: 'Media', permission: 'media:read' },
    ],
  },
  {
    label: 'Finance',
    hint: 'Giving batches & reports, pledges, expenses',
    items: [
      { href: '/finance', label: 'Finance', permission: 'finance:read' },
      { href: '/campaigns', label: 'Pledges', permission: 'giving:read' },
      { href: '/expenses', label: 'Expenses', permission: 'expenses:read' },
    ],
  },
  {
    label: 'Outreach',
    hint: 'Events & RSVPs, follow-up drip, SMS campaigns, announcements',
    items: [
      { href: '/events', label: 'Events', permission: 'services:read' },
      { href: '/drip', label: 'Drip', permission: 'care:read' },
      { href: '/sms', label: 'SMS', permission: 'sms:read' },
      { href: '/announcements', label: 'News', permission: 'campaigns:read' },
    ],
  },
  {
    label: 'Org',
    hint: 'Structure, departments and branch → HQ remittances',
    items: [
      { href: '/org', label: 'Org', permission: 'church:read' },
      { href: '/branches', label: 'Branches', permission: 'church:read' },
    ],
  },
];

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

/** True when the permission set may open this route. */
export function canAccessPath(granted: readonly string[], pathname: string): boolean {
  const rule = routeAccess(pathname);
  return !rule || hasPermission(granted, rule.permission);
}

/** Nav groups with every inaccessible item removed (empty groups dropped). */
export function visibleNavGroups(granted: readonly string[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(granted, item.permission)),
  })).filter((group) => group.items.length > 0);
}

/** Usher-mode links this user may open. */
export function visibleUsherNav(granted: readonly string[]): NavItem[] {
  return USHER_NAV.filter((item) => hasPermission(granted, item.permission));
}

