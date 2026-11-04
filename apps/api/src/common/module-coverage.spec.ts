// Proof that no App-section switch is decorative: every key in the shared switch
// table must be claimed by at least one @ForModule() in the API, so switching a
// section off in Settings closes the endpoints and not only the menu.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULE_KEYS, type ModuleKey } from '@chms/shared';

const SRC = join(__dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist') sources(path, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      out.push(path);
    }
  }
  return out;
}

const tagged = new Map<ModuleKey, string[]>();
for (const file of sources(SRC)) {
  for (const key of MODULE_KEYS) {
    const hits = readFileSync(file, 'utf8').match(new RegExp(`@ForModule\\('${key}'\\)`, 'g'));
    if (!hits) continue;
    const list = tagged.get(key as ModuleKey) ?? [];
    tagged.set(key as ModuleKey, [...list, file.slice(SRC.length + 1)]);
  }
}

describe('App-section switches gate the API', () => {
  it.each(MODULE_KEYS.map((key) => [key, tagged.get(key) ?? []]) as [ModuleKey, string[]][])(
    '%s is enforced by at least one controller',
    (key, files) => {
      expect(files.length, `no @ForModule('${key}') anywhere in apps/api/src`).toBeGreaterThan(0);
    },
  );

  it('refuses a switch the shared table does not know about', () => {
    // A typo like @ForModule('peple') would silently leave a section open.
    const stray = sources(SRC)
      .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/@ForModule\('([^']+)'\)/g)].map((m) => m[1]))
      .filter((key) => !MODULE_KEYS.includes(key as ModuleKey));
    expect(stray).toEqual([]);
  });
});
