'use client';
// Bible reader: multi-translation (English + Ghana local languages as they
// are licensed in), chapter reading, ref jump, search, side-by-side compare.
// Click a verse to copy it.
import { FormEvent, useEffect, useState } from 'react';
import { translationLabel } from '../../lib/bible';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface Translation { code: string; translation: string; language: string; license: string }
interface Index {
  defaultTranslation: string | null;
  translations: Translation[];
  books: { name: string; localName: string; chapters: number }[];
}
interface Verse { n: number; text: string }
interface Chapter { verses: Verse[]; book: string; bookLocal: string; chapter: number }
interface Hit { book: string; bookLocal: string; chapter: number; verse: number; text: string }

export default function BiblePage() {
  const [index, setIndex] = useState<Index | null>(null);
  const [translation, setTranslation] = useState('');
  const [book, setBook] = useState('John');
  const [bookLocal, setBookLocal] = useState('John');
  const [chapter, setChapter] = useState(3);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [ref, setRef] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Hit[]>([]);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  // '' = read one translation; otherwise the code shown alongside it.
  const [compare, setCompare] = useState('');
  const [compareVerses, setCompareVerses] = useState<Verse[]>([]);
  const [compareBookLocal, setCompareBookLocal] = useState('');

  useEffect(() => {
    void fetch(`${API}/bible`).then((r) => r.json()).then((d: Index) => {
      setIndex(d);
      if (d.defaultTranslation) setTranslation(d.defaultTranslation);
      if (d.books[0]) { setBook(d.books[0].name); setBookLocal(d.books[0].localName); }
    }).catch(() => setError('Bible bundles missing — run npm run bible:fetch'));
  }, []);

  async function loadChapter(t: string, b: string, c: number): Promise<void> {
    try {
      const res = await fetch(`${API}/bible/chapter?book=${encodeURIComponent(b)}&chapter=${c}&translation=${encodeURIComponent(t)}`);
      if (!res.ok) throw new Error('chapter not found');
      const d = (await res.json()) as Chapter;
      setVerses(d.verses); setBook(d.book); setBookLocal(d.bookLocal); setChapter(d.chapter); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }

  // The second column reads the same canonical book/chapter in another bundle.
  // A missing chapter there (different canon) clears the column, not the reader.
  async function loadCompare(t: string, b: string, c: number): Promise<void> {
    if (!t) { setCompareVerses([]); setCompareBookLocal(''); return; }
    try {
      const res = await fetch(`${API}/bible/chapter?book=${encodeURIComponent(b)}&chapter=${c}&translation=${encodeURIComponent(t)}`);
      if (!res.ok) throw new Error('not in this translation');
      const d = (await res.json()) as Chapter;
      setCompareVerses(d.verses); setCompareBookLocal(d.bookLocal);
    } catch { setCompareVerses([]); setCompareBookLocal(''); }
  }

  function pickTranslation(code: string): void {
    setTranslation(code);
    setResults([]);
    // The book list belongs to the translation, so refetch it. Keep the reader
    // on the book they were in when that translation has it too.
    void fetch(`${API}/bible?translation=${encodeURIComponent(code)}`).then((r) => r.json()).then((d: Index) => {
      if (!d.books[0]) return;
      setIndex(d);
      const target = d.books.find((b) => b.name === book) ?? d.books[0];
      setBook(target.name);
      setBookLocal(target.localName);
      setChapter(Math.min(chapter, target.chapters));
    });
  }

  useEffect(() => {
    if (translation) void loadChapter(translation, book, chapter);
  }, [translation, book, chapter]);

  useEffect(() => {
    void loadCompare(compare, book, chapter);
  }, [compare, book, chapter]);

  async function gotoRef(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/bible/verse?ref=${encodeURIComponent(ref)}&translation=${encodeURIComponent(translation)}`);
      if (!res.ok) throw new Error('reference not found');
      const d = (await res.json()) as { book: string; chapter: number };
      void loadChapter(translation, d.book, d.chapter);
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function search(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/bible/search?q=${encodeURIComponent(query)}&limit=25&translation=${encodeURIComponent(translation)}`);
      const d = (await res.json()) as { results: Hit[] };
      setResults(d.results);
    } catch { /* empty */ }
  }

  function copyVerse(text: string, label: string): void {
    void navigator.clipboard?.writeText(`"${text}" — ${label}`);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  const bookInfo = index?.books.find((b) => b.name === book);
  const active = index?.translations.find((t) => t.code === translation);
  const compareInfo = index?.translations.find((t) => t.code === compare);
  const comparing = Boolean(compare && compareInfo);
  const verseCount = Math.max(verses.length, compareVerses.length);

  return (
    <div className="container" style={{ maxWidth: comparing ? 960 : 720, paddingTop: '3vh' }}>
      <div className="card">
        <div className="spread">
          <h1 style={{ margin: 0 }}>Bible</h1>
          {active ? <span className="badge mute">{translationLabel(active)}{comparing && compareInfo ? ` ↔ ${translationLabel(compareInfo)}` : ''}</span> : null}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {index?.translations.map((t) => (
            <button key={t.code} className={`small ${t.code === translation ? '' : 'secondary'}`} onClick={() => pickTranslation(t.code)} title={t.license}>
              {translationLabel(t)}
            </button>
          ))}
        </div>
        {index && index.translations.length > 1 ? (
          <div className="row" style={{ marginTop: 8 }}>
            <label htmlFor="bible-compare" className="muted" style={{ margin: 0 }}>Read alongside</label>
            <select id="bible-compare" aria-label="Read alongside another translation" style={{ flex: 1 }} value={compare} onChange={(e) => setCompare(e.target.value)}>
              <option value="">Off — one translation</option>
              {index.translations.filter((t) => t.code !== translation).map((t) => (
                <option key={t.code} value={t.code}>{translationLabel(t)}</option>
              ))}
            </select>
          </div>
        ) : null}
        {index && index.translations.length === 1 ? (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Licensed translations &amp; Ghana local languages (Twi, Fante, Ewe, Ga…) appear here once their files are dropped into apps/api/data/bible/
          </p>
        ) : null}
        <div className="row" style={{ marginTop: 8 }}>
          <select aria-label="Book" style={{ flex: 2 }} value={book} onChange={(e) => { setChapter(1); setBook(e.target.value); }}>
            {index?.books.map((b) => <option key={b.name} value={b.name}>{b.localName}</option>)}
          </select>
          <select aria-label="Chapter" style={{ flex: 1 }} value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>
            {Array.from({ length: bookInfo?.chapters ?? 1 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
        <form className="row" style={{ marginTop: 8 }} onSubmit={gotoRef}>
          <input aria-label="Jump to Bible reference" placeholder="Jump to ref, e.g. John 3:16" value={ref} onChange={(e) => setRef(e.target.value)} style={{ flex: 1 }} />
          <button className="secondary">Go</button>
        </form>
        <form className="row" style={{ marginTop: 6 }} onSubmit={search}>
          <input aria-label="Search this translation" placeholder="Search this translation…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
          <button className="secondary">Search</button>
        </form>
        {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}
        {copied ? <div className="muted" style={{ marginTop: 6 }}>Copied {copied} ✓</div> : null}
      </div>
      {results.length > 0 ? (
        <div className="card">
          <h2>Search results</h2>
          {results.map((r, i) => (
            <p key={i} style={{ margin: '6px 0' }}><b>{r.bookLocal} {r.chapter}:{r.verse}</b> — {r.text}</p>
          ))}
        </div>
      ) : null}
      <div className="card">
        <h2>{bookLocal} {chapter}{comparing && compareBookLocal ? ` · ${compareBookLocal} ${chapter}` : ''}</h2>
        {comparing ? (
          <>
            <div className="bible-pair-head">
              <span className="badge mute">{active ? translationLabel(active) : ''}</span>
              <span className="badge mute">{compareInfo ? translationLabel(compareInfo) : ''}</span>
            </div>
            {compareVerses.length === 0 ? (
              <p className="muted" style={{ margin: '6px 0' }}>This translation does not have {bookLocal} {chapter}.</p>
            ) : null}
            {Array.from({ length: verseCount }, (_, i) => {
              const n = i + 1;
              const p = verses[i];
              const s = compareVerses[i];
              return (
                <div className="bible-pair" key={n}>
                  {p ? (
                    <p className="bible-col" onClick={() => copyVerse(p.text, `${bookLocal} ${chapter}:${n}`)} title="Click to copy">
                      <sup><b>{n}</b></sup> {p.text}
                    </p>
                  ) : <span />}
                  {s ? (
                    <p className="bible-col secondary" onClick={() => copyVerse(s.text, `${compareBookLocal} ${chapter}:${n}`)} title="Click to copy">
                      <sup><b>{n}</b></sup> {s.text}
                    </p>
                  ) : <span />}
                </div>
              );
            })}
          </>
        ) : (
          verses.map((v) => (
            <p key={v.n} style={{ margin: '6px 0', cursor: 'pointer' }} onClick={() => copyVerse(v.text, `${bookLocal} ${chapter}:${v.n}`)} title="Click to copy">
              <sup><b>{v.n}</b></sup> {v.text}
            </p>
          ))
        )}
      </div>

    </div>
  );
}
