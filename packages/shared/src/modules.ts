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
  'care',
  'worship',
  'roster',
  'money',
  'reach',
  'departments',
  'branches',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleFlags = Record<ModuleKey, boolean>;

/**
 * Areas a new church starts with. Care, the serving rota, departments and
 * branches are opt-in: most churches do not run all four, so they stay hidden
 * until the church ticks them in Settings → App sections. Worship has always
 * started off for the same reason.
 */
export const MODULE_DEFAULTS: ModuleFlags = {
  people: true,
  care: false,
  worship: false,
  roster: false,
  money: true,
  reach: true,
  departments: false,
  branches: false,
};

export const MODULE_LABELS: Record<ModuleKey, { label: string; hint: string }> = {
  people: { label: 'People', hint: 'Members, visitors, children, groups and follow-up' },
  care: { label: 'Care', hint: 'Care queue, prayer and welfare — only for ushers and Sunday School teachers' },
  worship: { label: 'Worship', hint: 'Services, check-in and events' },
  roster: { label: 'Serving team', hint: 'The serving rota for each service' },
  money: { label: 'Money', hint: 'Giving, funds, expenses and finance reports' },
  reach: { label: 'Reach', hint: 'SMS campaigns and announcements' },
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
