// Per-church module switches (the "my church doesn't use that" feature).
//
// Stored in Church.settings.modules (existing Json column) so switching a module
// off needs no migration. A missing key means the key's default below, which
// keeps every existing church working without a data backfill.
//
// This is a visibility switch for the web shell, not an authorisation boundary:
// the API still enforces permissions, so a hand-typed URL never returns data the
// role could not otherwise read — it just stops showing whole areas of the app.
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

export type ModuleFlags = Record<ModuleKey, boolean>;

/**
 * What a new church starts with. The four above the line carry the week: the
 * directory, the service, the offering and the news. Everything below it is
 * opt-in, because most churches do not run all of it — they tick what they use
 * in Settings → App sections and the rest never appears.
 */
export const MODULE_DEFAULTS: ModuleFlags = {
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

/**
 * `hint` is what the church reads in Settings, so it has to say what appears
 * when the box is ticked — in the words a treasurer or a pastor would use.
 */
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

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === 'string' && (MODULE_KEYS as readonly string[]).includes(value);
}

/** Stored flags merged over the defaults; unknown/absent keys use MODULE_DEFAULTS. */
export function resolveModules(settings: unknown): ModuleFlags {
  const stored = ((settings ?? {}) as { modules?: unknown }).modules;
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const flags = {} as ModuleFlags;
  for (const key of MODULE_KEYS) flags[key] = raw[key] === undefined ? MODULE_DEFAULTS[key] : raw[key] !== false;
  return flags;
}
