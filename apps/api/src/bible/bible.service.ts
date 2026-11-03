// Bible reader API (Phase 2.5): multi-translation, multi-language.
// Every bundle in apps/api/data/bible/*.json is served — drop a file in and
// it appears (KJV via `npm run bible:fetch`; Ghana local languages arrive as
// licensed drops — licence checklist in BUILD_ORDER R2.1).
import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { dailyReading, inBookOrder, localDateKey, matchBook, parseVerseRef, readVerse } from '@chms/shared';

export interface BibleBundle {
  translation: string;
  language: string;
  languageCode: string;
  license: string;
  publicDomain: boolean;
  source?: string;
  /** Where the printed book titles came from (see scripts/add-bible-local-names.mjs). */
  localNameSource?: string;
  books: { name: string; localName?: string; chapters: Record<string, string[]> }[];
}

export interface TranslationInfo {
  code: string;
  translation: string;
  language: string;
  languageCode: string;
  license: string;
  publicDomain: boolean;
  bookCount: number;
  /** False when this bundle only ever prints English book titles. */
  hasLocalNames: boolean;
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
    return matchBook(bundle.books, name);
  }

  index(translation?: string) {
    const bundles = this.load();
    const fallback = this.defaultCode(bundles);
    const translations: TranslationInfo[] = [...bundles.entries()]
      .map(([code, b]) => ({
        code,
        translation: b.translation,
        language: b.language ?? 'English',
        languageCode: b.languageCode ?? 'en',
        license: b.license ?? 'see source',
        publicDomain: b.publicDomain !== false,
        bookCount: b.books.length,
        hasLocalNames: b.books.some((x) => x.localName && x.localName !== x.name),
      }))
      .sort((a, b) => (a.code === fallback ? -1 : b.code === fallback ? 1 : 0) || a.language.localeCompare(b.language) || a.translation.localeCompare(b.translation));
    const { bundle } = this.bundleFor(translation);
    return {
      defaultTranslation: fallback,
      translations,
      books: inBookOrder(bundle.books).map((x) => ({
        name: x.name,
        localName: x.localName ?? x.name,
        chapters: Object.keys(x.chapters).length,
      })),
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
      bookLocal: b.localName ?? b.name,
      chapter,
      verses: verses.map((text, i) => ({ n: i + 1, text })),
    };
  }

  verse(ref: string, translation?: string) {
    const parsed = parseVerseRef(ref);
    if (!parsed) throw new NotFoundException('use a reference like "John 3:16"');
    const data = this.chapter(parsed.book, parsed.chapter, translation);
    const verses = data.verses.filter((v) => v.n >= parsed.from && v.n <= parsed.to);
    if (verses.length === 0) throw new NotFoundException(`no verses at ${ref}`);
    const range = parsed.to > parsed.from ? `-${parsed.to}` : '';
    return { ...data, verses, ref: `${data.book} ${parsed.chapter}:${parsed.from}${range}` };
  }

  /**
   * Today's reading: the daily-rotation passage (or a pinned reference) resolved
   * against a bundle, so the app card, a home-screen widget and the 8pm SMS all
   * quote the same words in the church's own translation.
   */
  daily(translation?: string, pinnedRef?: string) {
    const pinned = pinnedRef?.trim() ? { ref: pinnedRef.trim(), note: '' } : dailyReading();
    const { code, bundle } = this.bundleFor(translation);
    const found = readVerse(bundle.books, pinned.ref);
    if (!found) throw new NotFoundException(`${code} has no ${pinned.ref}`);
    return {
      dateKey: localDateKey('Africa/Accra'),
      translation: code,
      language: bundle.language ?? 'English',
      ref: found.ref,
      text: found.text,
      note: pinned.note,
    };
  }

  search(q: string, limit = 20, translation?: string) {
    const needle = q.trim().toLowerCase();
    if (needle.length < 3) throw new NotFoundException('search needs at least 3 characters');
    const { code, bundle } = this.bundleFor(translation);
    const out: { book: string; bookLocal: string; chapter: number; verse: number; text: string }[] = [];
    for (const book of bundle.books) {
      for (const [ch, verses] of Object.entries(book.chapters)) {
        for (let i = 0; i < verses.length; i++) {
          if (verses[i].toLowerCase().includes(needle)) {
            out.push({ book: book.name, bookLocal: book.localName ?? book.name, chapter: Number(ch), verse: i + 1, text: verses[i] });
            if (out.length >= limit) return { translation: code, results: out };
          }
        }
      }
    }
    return { translation: code, results: out };
  }
}
