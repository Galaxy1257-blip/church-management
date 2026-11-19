// Sections a role cannot work without. Used ONLY to offer a one-tap prompt when
// the office adds a leader — never to switch a section on by itself. The church
// owns its App-section switches; the office only asks.
import { MODULE_LABELS, resolveModules, type ModuleKey } from '@chms/shared';

export const ROLE_SECTIONS: Record<string, ModuleKey[]> = {
  USHER: ['worship'],
  SUNDAY_SCHOOL: ['children', 'worship'],
  FINANCE_ADMIN: ['money', 'expenses'],
  ELDER: ['care'],
};

export interface NeededSection {
  key: ModuleKey;
  label: string;
}

/** The sections the given roles need that are currently switched OFF (raw stored state). */
export function sectionsNeededForRoles(roleKeys: readonly string[], settings: unknown): NeededSection[] {
  const flags = resolveModules(settings);
  const needed = new Set<ModuleKey>();
  for (const role of roleKeys) for (const key of ROLE_SECTIONS[role] ?? []) needed.add(key);
  return [...needed].filter((key) => !flags[key]).map((key) => ({ key, label: MODULE_LABELS[key].label }));
}
