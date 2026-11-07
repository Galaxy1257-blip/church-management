import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BibleService } from './bible.service';

// Reads the committed bundles in apps/api/data/bible (no DB). Guards the WEB
// multi-block join: the source splits many verses into several blocks, and an
// early version of scripts/fetch-web-bible.mjs kept only the last fragment.
describe('BibleService bundles', () => {
  const svc = new BibleService();

  it('WEB Genesis 3:16 is the whole verse, not a trailing fragment', () => {
    const { verses } = svc.chapter('Genesis', 3, 'web');
    const v16 = verses[15].text;
    expect(v16).toContain('childbirth');
    expect(v16).toContain('rule over you');
    expect(v16.length).toBeGreaterThan(150);
    expect(v16.startsWith('To the woman')).toBe(true);
  });

  it('KJV and WEB align verse-for-verse on John 3', () => {
    const kjv = svc.chapter('John', 3, 'kjv').verses;
    const web = svc.chapter('John', 3, 'web').verses;
    expect(kjv).toHaveLength(36);
    expect(web).toHaveLength(36);
    expect(kjv.map((v) => v.n)).toEqual(web.map((v) => v.n));
  });

  it('WEB leaves its critical-text omissions empty rather than inventing text', () => {
    // These verses are absent from the WEB (NU) text; the hole-fill keeps the
    // verse slot empty so numbering still lines up with the KJV column.
    const acts8 = svc.chapter('Acts', 8, 'web').verses;
    expect(acts8[36].text).toBe('');
  });
});