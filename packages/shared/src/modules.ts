// Per-church module switches (the "my church doesn't use that" feature).
//
// Stored in Church.settings.modules (existing Json column) so switching a module
// off needs no migration. A missing key means ENABLED, which keeps every existing
// church exactly as it is today.
//
// This is a visibility switch for the web shell, not an authorisation boundary:
// the API still enforces permissions, so a hand-typed URL never returns data the
// role could not otherwise read — it just stops showing whole areas of the app.
export const MODULE_KEYS = ['people', 'worship', 'money', 'reach', 'org'] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleFlags = Record<ModuleKey, boolean>;

/**
 * Areas a new church starts with. Worship is off by default — most churches
 * only need people, money, reach and organisation — and a church that runs
 * services can tick it back on in Settings → App sections.
 */
export const MODULE_DEFAULTS: ModuleFlags = {
  people: true,
  worship: false,
  money: true,
  reach: true,
  org: true,
};

export const MODULE_LABELS: Record<ModuleKey, { label: string; hint: string }> = {
  people: { label: 'People', hint: 'Members, visitors, children, groups, care and follow-up' },
  worship: { label: 'Worship', hint: 'Services, check-in, serving roster, media and events' },
  money: { label: 'Money', hint: 'Giving, funds, expenses and finance reports' },
  reach: { label: 'Reach', hint: 'SMS campaigns and announcements' },
  org: { label: 'Organisation', hint: 'Departments, branches and HQ remittances' },
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
