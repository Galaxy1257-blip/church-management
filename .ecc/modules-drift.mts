// Drift check for the app-section switches.
//
// apps/web cannot import @chms/shared, so lib/access.ts carries its own copy of
// MODULE_KEYS / MODULE_DEFAULTS / MODULE_LABELS. This script compares the two
// copies and fails if a switch exists on one side only, or if a hint the church
// reads in Settings differs from the one the API exposes.
//
// Run: node_modules/.bin/tsx .ecc/modules-drift.mts
import {
  MODULE_DEFAULTS as SHARED_DEFAULTS,
  MODULE_KEYS as SHARED_KEYS,
  MODULE_LABELS as SHARED_LABELS,
} from '@chms/shared';
import {
  MODULE_DEFAULTS,
  MODULE_KEYS,
  MODULE_LABELS,
  NAV_AREAS,
  moduleEnabled,
  moduleForItem,
} from '../apps/web/src/lib/access.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const json = (value: unknown) => JSON.stringify(value);

// 1) The mirrors must be identical.
check('web MODULE_KEYS equals shared', json([...MODULE_KEYS]) === json([...SHARED_KEYS]));
const sortedDefaults = (obj: Record<string, boolean>) =>
  json(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
check(
  'web MODULE_DEFAULTS equals shared',
  sortedDefaults(MODULE_DEFAULTS) === sortedDefaults(SHARED_DEFAULTS),
  `${sortedDefaults(MODULE_DEFAULTS)} vs ${sortedDefaults(SHARED_DEFAULTS)}`,
);
check(
  'web MODULE_LABELS equals shared',
  json(MODULE_LABELS) === json(SHARED_LABELS),
);

// 2) Every switch has to control at least one page, and every page-level switch
//    has to be a real key — otherwise Settings offers a box that does nothing.
const navModules = new Set<string>();
for (const area of NAV_AREAS) {
  navModules.add(area.module);
  for (const item of area.items) if (item.module) navModules.add(item.module);
}
const orphaned = MODULE_KEYS.filter((key: string) => !navModules.has(key));
check('every switch shows at least one page', orphaned.length === 0, orphaned.join(', '));

// 3) The four areas a church starts with, and the rest opt-in.
check('a new church starts with people, services, offerings, news', json(MODULE_KEYS.filter((k: string) => MODULE_DEFAULTS[k as keyof typeof MODULE_DEFAULTS])) === json(['people', 'worship', 'money', 'reach']));
const optIn = MODULE_KEYS.filter((key: string) => !MODULE_DEFAULTS[key as keyof typeof MODULE_DEFAULTS]);
check('everything else starts off', optIn.length === 11, optIn.join(', '));

// 4) A child page inherits its own switch, not its area's.
const overrides: Array<[string, string]> = [
  ['/children', 'children'],
  ['/groups', 'groups'],
  ['/drip', 'followup'],
  ['/events', 'events'],
  ['/campaigns', 'special_offerings'],
  ['/expenses', 'expenses'],
  ['/sms', 'sms'],
  ['/care', 'care'],
  ['/roster', 'roster'],
];
for (const [href, key] of overrides) {
  check(`${href} is gated by its own switch`, moduleForItem(href) === key, `got ${String(moduleForItem(href))}`);
}

// 5) Turning one page off hides that page alone.
for (const [, key] of overrides) {
  const allOn = Object.fromEntries(MODULE_KEYS.map((k: string) => [k, true]));
  const oneOff = { ...allOn, [key]: false };
  check(
    `${key}: off closes only itself`,
    moduleEnabled(allOn, key as never) && !moduleEnabled(oneOff, key as never) && MODULE_KEYS.every((other: string) => moduleEnabled(oneOff, other as never) || other === key),
  );
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
