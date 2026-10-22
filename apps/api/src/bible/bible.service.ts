// Bible reader API (Phase 2.5): multi-translation, multi-language.
// Every bundle in apps/api/data/bible/*.json is served — drop a file in and
// it appears (KJV via `npm run bible:fetch`; Ghana local languages arrive as
// licensed drops — licence checklist in BUILD_ORDER R2.1).
import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BibleBundle {
  translation: string;
  language: string;
  languageCode: string;
  license: string;
  publicDomain: boolean;
  source?: string;
  books: { name: string; chapters: Record<string, string[]> }[];
}

export interface TranslationInfo {
  code: string;
  translation: string;
  language: string;
  languageCode: string;
  license: string;
  publicDomain: boolean;
  bookCount: number;
}

// NOTE: this file sits at src/bible/ and dist/bible/ — TWO levels below
// apps/api, so the bundle dir is ../../data/bible (an extra ../ escapes to apps/).
const DATA_DIR = resolve(__dirname, '../../data/bible');

@Injectable()
export class BibleService {
  private cache: Map<string, BibleBundle> | null = null;

  private load(): Map<string, BibleBundle> {
    if (this.cache) return this.cache;
    const map = new Map<string, BibleBundle>();
    if (existsSync(DATA_DIR)) {
      for (const file of readdirSync(DATA_DIR)) {
        if (!file.endsWith('.json')) continue;
        try {
          const bundle = JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf8')) as BibleBundle;
          if (Array.isArray(bundle.books) && bundle.books.length > 0) {
            map.set(file.replace(/\.json$/, ''), bundle);
          }
        } catch {
          /* skip malformed drops; keep serving the rest */
        }
      }
    }
    this.cache = map;
    return map;
  }

  private defaultCode(bundles: Map<string, BibleBundle>): string {
    const codes = [...bundles.keys()];
    if (codes.length === 0) throw new NotFoundException('No Bible bundles — run `npm run bible:fetch`');
    // KJV explicitly first (reader-expectation default), then any other public-domain bundle.
    const kjv = codes.includes('kjv') && bundles.get('kjv')?.publicDomain;
    if (kjv) return 'kjv';
    return codes.find((c) => bundles.get(c)?.publicDomain) ?? codes[0];
  }

  private bundleFor(translation?: string): { code: string; bundle: BibleBundle } {
    const bundles = this.load();
    const code = translation ? translation.toLowerCase() : this.defaultCode(bundles);
    const bundle = bundles.get(code);
    if (!bundle) {
      throw new NotFoundException(`unknown translation "${code}" (available: ${[...bundles.keys()].join(', ') || 'none'})`);
    }
    return { code, bundle };
  }

  private findBook(bundle: BibleBundle, name: string) {
    const q = name.trim().toLowerCase();
    return bundle.books.find((b) => b.name.toLowerCase() === q) ?? bundle.books.find((b) => b.name.toLowerCase().startsWith(q)) ?? null;
  }

  index() {
    const bundles = this.load();
    const translations: TranslationInfo[] = [...bundles.entries()].map(([code, b]) => ({
      code,
      translation: b.translation,
      language: b.language ?? 'English',
      languageCode: b.languageCode ?? 'en',
      license: b.license ?? 'see source',
      publicDomain: b.publicDomain !== false,
      bookCount: b.books.length,
    }));
    const { code, bundle } = this.bundleFor();
    return {
      defaultTranslation: code,
      translations,
      books: bundle.books.map((x) => ({ name: x.name, chapters: Object.keys(x.chapters).length })),
    };
  }

  chapter(book: string, chapter: number, translation?: string) {
    const { code, bundle } = this.bundleFor(translation);
    const b = this.findBook(bundle, book);
    if (!b) throw new NotFoundException(`unknown book "${book}" in ${code}`);
    const verses = b.chapters[String(chapter)];
    if (!verses) throw new NotFoundException(`no ${b.name} chapter ${chapter} in ${code}`);
    return {
      translation: code,
      language: bundle.language ?? 'English',
      book: b.name,
      chapter,
      verses: verses.map((text, i) => ({ n: i + 1, text })),
    };
  }

  verse(ref: string, translation?: string) {
    const m = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
    if (!m) throw new NotFoundException('use a reference like "John 3:16"');
    const [, book, ch, v1, v2] = m;
    const data = this.chapter(book, Number(ch), translation);
    const from = Number(v1);
    const to = v2 ? Number(v2) : from;
    const verses = data.verses.filter((v) => v.n >= from && v.n <= to);
    if (verses.length === 0) throw new NotFoundException(`no verses at ${ref}`);
    return { ...data, verses, ref: `${data.book} ${ch}:${from}${v2 ? `-${to}` : ''}` };
  }

  search(q: string, limit = 20, translation?: string) {
    const needle = q.trim().toLowerCase();
    if (needle.length < 3) throw new NotFoundException('search needs at least 3 characters');
    const { code, bundle } = this.bundleFor(translation);
    const out: { book: string; chapter: number; verse: number; text: string }[] = [];
    for (const book of bundle.books) {
      for (const [ch, verses] of Object.entries(book.chapters)) {
        for (let i = 0; i < verses.length; i++) {
          if (verses[i].toLowerCase().includes(needle)) {
            out.push({ book: book.name, chapter: Number(ch), verse: i + 1, text: verses[i] });
            if (out.length >= limit) return { translation: code, results: out };
          }
        }
      }
    }
    return { translation: code, results: out };
  }
}
