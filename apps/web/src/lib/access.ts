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
  /** Sunday School class this person looks after, when one is assigned. */
  careClassBracketId?: string | null;
  careClassSegment?: string | null;
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
  /**
   * For the one page whose access is not a single permission: this replaces the
   * list above with the rule the API itself applies. A menu item that promises a
   * screen the endpoint then refuses is the same lie as a switch that does nothing.
   */
  test?: (granted: readonly Permission[]) => boolean;
  /** Which app-section switch hides this page (absent = the area's switch). */
  module?: ModuleKey;
  /**
   * Other sections this page cannot work without. The rota starts by picking a
   * service, so with Services switched off it is a dead screen — the switch that
   * gates the API has to gate the link too.
   */
  requires?: readonly ModuleKey[];
  /**
   * A tool the church staff use whatever the section switches say. The door is
   * the case: people still walk in on a Sunday when the office has hidden the
   * Services screens, and a hidden check-in desk means an uncounted congregation.
   * The permission still applies — this only skips the section switch.
   */
  standalone?: boolean;
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
// The key list and the wording live here because the web app cannot import the
// workspace package (same reason as lib/shared-constants.ts). WHAT IS ON is not
// duplicated anywhere: the API resolves packages/shared MODULE_DEFAULTS into
// `GET /auth/me`, and this file only ever reads that resolved set. A switch
// therefore cannot mean one thing to the menu and another to the API.
export const MODULE_KEYS = [
  'people',
  'worship',
  'money',
  'reach',
  'bible',
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
  'audit',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
/** Always the full set, as resolved by the API for this church. */
export type ModuleFlags = Record<ModuleKey, boolean>;

export const MODULE_LABELS: Record<ModuleKey, { label: string; hint: string }> = {
  people: { label: 'Members & visitors', hint: 'The directory, visitors and giving history' },
  worship: { label: 'Services', hint: 'The service list and the attendance screen. Checking people in at the door keeps working whatever this says.' },
  money: { label: 'Offerings', hint: 'Sunday giving and the money reports' },
  reach: { label: 'News', hint: 'Announcements the congregation sees' },
  bible: {
    label: 'Bible',
    hint: 'The Bible button at the top right of every page — reading, languages, search and your own verse notes',
  },
  care: {
    label: 'Care',
    hint: 'Prayer requests and people to look after. Elders, the follow-up team and ushers see the whole queue; a Sunday School teacher sees only their class.',
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
  audit: {
    label: 'Activity log',
    hint: 'Who changed what, and when. Switching this off hides the page — the app keeps recording either way.',
  },
};

/**
 * The roles that work the door. They stand there on Sunday whatever the office
 * has switched off, so their screens keep showing which service is happening
 * even when the Services section is hidden.
 */
export const DOOR_ROLES: readonly string[] = ['USHER', 'SUNDAY_SCHOOL'];

export function isDoorRole(roles: readonly string[] | undefined): boolean {
  return !!roles && roles.some((role) => DOOR_ROLES.includes(role));
}

/**
 * Who the children's desk lets in — the same rule the API applies
 * (apps/api/src/common/class-scope.ts#deskRosterChildIds): the office
 * (members:write) gets every child, a class teacher (children:write) gets their
 * own class, and an usher with checkin:write is not given this page, because the
 * list it opens names the adults allowed to collect a child.
 */
export function canRunChildrenDesk(granted: readonly Permission[]): boolean {
  return hasPermission(granted, 'members:write') || hasPermission(granted, 'children:write');
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
      // The office runs the desk with members:write and a Sunday School teacher
      // runs their own class with children:write — the rule lives in canRunChildrenDesk.
      { href: '/children', label: 'Children', permissions: [], test: canRunChildrenDesk, module: 'children' },
      { href: '/groups', label: 'Groups', permissions: ['members:write'], module: 'groups' },
      // The door team (and the office) shows this as a QR so people can add
      // themselves to the church without anyone retyping their details.
      { href: '/join-card', label: 'Join code', permissions: ['members:read'], module: 'people' },
      { href: '/care', label: 'Care', permissions: ['care:read'], module: 'care' },
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
      { href: '/checkin', label: 'Check-in', permissions: ['checkin:write'], standalone: true },
      { href: '/roster', label: 'Serving team', permissions: ['members:write'], module: 'roster', requires: ['worship'] },
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
      // Welfare is money, so it sits with the money pages — but its endpoints are
      // part of the Care section (apps/api/src/ministry/care.module.ts is
      // @ForModule('care')), so it opens and closes with that switch, not the
      // Money one. Care and welfare both open on their permission alone, the way
      // the API enforces them; neither page keeps a second list of who may see it.
      { href: '/welfare', label: 'Welfare', permissions: ['welfare:read'], module: 'care' },
    ],
  },
  {
    module: 'reach',
    label: 'Reach',
    hint: 'News to the congregation',
    items: [
      { href: '/sms', label: 'SMS', permissions: ['sms:read'], module: 'sms' },
      { href: '/announcements', label: 'News', permissions: ['campaigns:read'] },
      { href: '/reminders', label: 'Reminders', permissions: ['campaigns:write'] },
    ],
  },
  {
    module: 'departments',
    label: 'Organisation',
    hint: 'Departments, branches and who changed what',
    items: [
      { href: '/org', label: 'Departments', permissions: ['church:write', 'settings:write'], module: 'departments' },
      { href: '/branches', label: 'Branches', permissions: ['church:write', 'settings:write', 'finance:read'], module: 'branches' },
      // Nothing here edits a record: the log is append-only in the database, and this
      // link only opens it. Its own switch, so hiding the page never stops the writing.
      { href: '/audit', label: 'Activity log', permissions: ['audit:read'], module: 'audit' },
    ],
  },
];

/** Back-compat view for callers that only need label + hint + items. */
export const NAV_GROUPS: NavGroup[] = NAV_AREAS.map(({ label, hint, items }) => ({ label, hint, items }));

// Usher Mode: ONE app, role-scoped shell. Ushers get a mobile-first subset
// (Today / Check-in / Attendance / Visitors / Collection / Care) with big touch
// targets; leaders toggle it off. Check-in names no section switch: the door
// reads its own service list, so the headcount still happens when the office has
// hidden the Services screens.
export const USHER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Today', permissions: ['church:read'] },
  { href: '/checkin', label: 'Check-in', permissions: ['checkin:write'], standalone: true },
  { href: '/services', label: 'Attendance', permissions: ['services:read'], module: 'worship' },
  { href: '/visitors', label: 'Visitors', permissions: ['visitors:read'], module: 'people' },
  // The door worker enters the amount they counted — not the finance sheet.
  { href: '/collection', label: 'Collection', permissions: ['collection:write'], module: 'money' },
  { href: '/care', label: 'Care', permissions: ['care:read'], module: 'care' },
];

/**
 * Who may put the app into usher mode. The rail is the door worker's shell and it
 * is built around Check-in, so `checkin:write` decides — the same permission the
 * `/checkin` link and `POST /checkin` both require. It used to be
 * `headcount:write`, which no nav item or route rule names, so eligibility and
 * the screens behind it could drift apart. `services:read` is not asked for
 * either: the desk reads its own service list, so the mode still works with the
 * Services section switched off.
 */
export function canEnterUsherMode(granted: readonly string[]): boolean {
  return hasPermission(granted, 'checkin:write');
}

/** True for someone whose only job is the door: the mode opens by itself. */
export function isDoorOnly(granted: readonly string[]): boolean {
  return canEnterUsherMode(granted) && !hasPermission(granted, 'members:write');
}

export interface AccessRule {
  prefix: string;
  permissions: Permission[];
  label: string;
  /** The same rule the nav item uses, so a link and its guard never disagree. */
  test?: (granted: readonly Permission[]) => boolean;
}

/** Route → permissions (any one opens it). Longest matching prefix wins. */
export const ROUTE_ACCESS: AccessRule[] = [
  { prefix: '/dashboard', permissions: ['church:read'], label: 'Dashboard' },
  { prefix: '/members', permissions: ['members:read'], label: 'Members' },
  { prefix: '/visitors', permissions: ['visitors:read'], label: 'Visitors' },
  { prefix: '/join-card', permissions: ['members:read'], label: 'Join code' },
  // The door worker's own money screen. Its section switch is the `module:'money'`
  // on the rail item above, which `itemForPath()` now resolves for this path too.
  { prefix: '/collection', permissions: ['collection:write'], label: 'Collection' },
  { prefix: '/children', permissions: [], test: canRunChildrenDesk, label: 'Children' },
  { prefix: '/care', permissions: ['care:read'], label: 'Care' },
  { prefix: '/groups', permissions: ['members:write'], label: 'Groups' },
  { prefix: '/services', permissions: ['services:read'], label: 'Services' },
  { prefix: '/checkin', permissions: ['checkin:write'], label: 'Check-in' },
  { prefix: '/roster', permissions: ['members:write'], label: 'Serving team' },
  { prefix: '/finance', permissions: ['finance:read'], label: 'Offerings' },
  { prefix: '/campaigns', permissions: ['giving:read'], label: 'Special offerings' },
  { prefix: '/expenses', permissions: ['expenses:read'], label: 'Expenses' },
  { prefix: '/welfare', permissions: ['welfare:read'], label: 'Welfare' },
  { prefix: '/events', permissions: ['services:write', 'members:write'], label: 'Events' },
  { prefix: '/drip', permissions: ['visitors:read'], label: 'Follow-up' },
  { prefix: '/sms', permissions: ['sms:read'], label: 'SMS' },
  { prefix: '/announcements', permissions: ['campaigns:read'], label: 'News' },
  { prefix: '/reminders', permissions: ['campaigns:write'], label: 'Reminders' },
  { prefix: '/org', permissions: ['church:write', 'settings:write'], label: 'Departments' },
  { prefix: '/branches', permissions: ['church:write', 'settings:write', 'finance:read'], label: 'Branches' },
  { prefix: '/audit', permissions: ['audit:read'], label: 'Activity log' },
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

/**
 * A church can switch an area off. The flags always arrive fully resolved from
 * `GET /auth/me` (the API owns the defaults), so the only case here is a session
 * payload from a server that predates the field — then nothing is hidden.
 */
export function moduleEnabled(modules: ModuleFlags | undefined, key: ModuleKey | undefined): boolean {
  if (!key) return true;
  return modules?.[key] !== false;
}

/** Every switch a page needs: its own (or its area's) plus anything it depends on. */
function itemSwitches(item: NavItem, areaModule?: ModuleKey): ModuleKey[] {
  if (item.standalone) return [...(item.requires ?? [])];
  return [item.module ?? areaModule, ...(item.requires ?? [])].filter((k): k is ModuleKey => !!k);
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

/**
 * The nav item a pathname belongs to (longest matching item wins).
 *
 * The usher rail is searched as well as the areas, because a door-only screen like
 * /collection appears in no area — and while the switch lookup missed it, the two
 * disagreed: the rail hid the link with Offerings off while a typed URL still
 * opened the page. Only the item's own `module` counts here; the rail's
 * `?? 'worship'` area default belongs to the rail, and inheriting it would have
 * put the shared Today screen behind the Services switch.
 */
function itemForPath(pathname: string): { item: NavItem; areaModule?: ModuleKey } | null {
  let match: { item: NavItem; areaModule?: ModuleKey } | null = null;
  const consider = (item: NavItem, areaModule?: ModuleKey): void => {
    const hit = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (hit && (!match || item.href.length > match.item.href.length)) match = { item, areaModule };
  };
  for (const area of NAV_AREAS) {
    for (const item of area.items) consider(item, area.module);
  }
  for (const item of USHER_NAV) consider(item, undefined);
  return match;
}

/** The module switch for the current pathname (longest matching item wins). */
export function moduleForPath(pathname: string): ModuleKey | undefined {
  const match = itemForPath(pathname);
  return match ? match.item.module ?? match.areaModule : undefined;
}

/** Every switch this pathname needs switched on to be usable at all. */
export function switchesForPath(pathname: string): ModuleKey[] {
  const match = itemForPath(pathname);
  return match ? itemSwitches(match.item, match.areaModule) : [];
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
 * Whether the permission set may open a screen. Roles are not consulted: the
 * permission table in `packages/shared/src/permissions.ts` is the one rule, and
 * the API enforces the same one. A hand-copied list of who may see a page drifts
 * the moment a role is granted that permission — which is how elders, the
 * follow-up team, the pastor and this office all ended up holding `care:read`
 * with no Care screen to spend it on.
 */
function mayOpen(granted: readonly string[], item: NavItem): boolean {
  if (item.test ? !item.test(granted) : !hasAnyPermission(granted, item.permissions)) return false;
  return true;
}

/**
 * True when the permission set may open this route. `modules` is the church's
 * switch set: a disabled section counts as unavailable, except /settings — that
 * is where the switches live, so it must stay reachable to switch them back on.
 */
export function canAccessPath(granted: readonly string[], pathname: string, modules?: ModuleFlags): boolean {
  const rule = routeAccess(pathname);
  if (!rule) return true;
  if (rule.test ? !rule.test(granted) : !hasAnyPermission(granted, rule.permissions)) return false;
  if (rule.prefix === '/settings') return true;
  return switchesForPath(pathname).every((key) => moduleEnabled(modules, key));
}

/** Nav groups with inaccessible items and switched-off sections removed. */
export function visibleNavGroups(granted: readonly string[], modules?: ModuleFlags): NavGroup[] {
  return NAV_AREAS.map((area) => ({
    label: area.label,
    hint: area.hint,
    items: area.items.filter(
      (item) =>
        itemSwitches(item, area.module).every((key) => moduleEnabled(modules, key)) && mayOpen(granted, item),
    ),
  })).filter((group) => group.items.length > 0);
}

/** Usher-mode links this user may open, with the same section switches. */
export function visibleUsherNav(granted: readonly string[], modules?: ModuleFlags): NavItem[] {
  return USHER_NAV.filter(
    (item) =>
      itemSwitches(item, item.module ?? 'worship').every((key) => moduleEnabled(modules, key)) &&
      mayOpen(granted, item),
  );
}
