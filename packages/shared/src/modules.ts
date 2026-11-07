// Per-church module switches (the "my church doesn't use that" feature).
//
// Stored in Church.settings.modules (existing Json column) so switching a module
// off needs no migration. A missing key means the key's default below, which
// keeps every existing church working without a data backfill.
//
// The switch hides the area in the web shell AND gates the API: a route tagged
// @ForModule(key) returns 403 while the flag is off, so a hand-typed URL cannot
// read a section the church turned off. Public intake (the give link, webhooks)
// is a separate question, answered in Settings when Offerings is switched off —
// see givingStopsWithBooks.
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
  'programs',
  'special_offerings',
  'expenses',
  'sms',
  'departments',
  'branches',
  'audit',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleFlags = Record<ModuleKey, boolean>;

/**
 * What a new church starts with. The four above the line carry the week: the
 * directory, the offering, the news and the Bible. Everything below it is
 * opt-in, because most churches do not run all of it — they tick what they use
 * in Settings → App sections and the rest never appears.
 *
 * These values are the ONLY defaults in the app. The API resolves them into
 * `GET /auth/me` and `/churches/me/profile`, and the web shell reads that
 * resolved set instead of keeping its own copy, so a switch cannot mean one
 * thing to the menu and another to the API.
 */
export const MODULE_DEFAULTS: ModuleFlags = {
  people: true,
  worship: false,
  money: true,
  reach: true,
  bible: true,
  care: false,
  roster: false,
  events: false,
  children: false,
  groups: false,
  followup: false,
  programs: false,
  special_offerings: false,
  expenses: false,
  sms: false,
  departments: false,
  branches: false,
  audit: false,
};

/**
 * `hint` is what the church reads in Settings, so it has to say what appears
 * when the box is ticked — in the words a treasurer or a pastor would use.
 */
export const MODULE_LABELS: Record<ModuleKey, { label: string; hint: string }> = {
  people: { label: 'Members & visitors', hint: 'The directory, visitors and giving history' },
  worship: { label: 'Services', hint: 'The service list and Sunday attendance' },
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
  programs: {
    label: 'Programs & milestones',
    hint: 'Anniversary and celebration reminders — leaders see whose day is coming, and approve a push to the whole church',
  },
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

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === 'string' && (MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * What the office answered when Settings asked them to switch Offerings off:
 * "keep the give link open" or "stop online giving too". Absent means keep —
 * that is what a church has always had, and the question is only ever asked at
 * the moment the switch is turned off.
 */
export function givingStopsWithBooks(settings: unknown): boolean {
  const s = (settings ?? {}) as { moneyOffStopsGiving?: unknown };
  return s.moneyOffStopsGiving === true;
}

/** Stored flags merged over the defaults; unknown/absent keys use MODULE_DEFAULTS. */
export function resolveModules(settings: unknown): ModuleFlags {
  const stored = ((settings ?? {}) as { modules?: unknown }).modules;
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const flags = {} as ModuleFlags;
  for (const key of MODULE_KEYS) flags[key] = raw[key] === undefined ? MODULE_DEFAULTS[key] : raw[key] !== false;
  return flags;
}
