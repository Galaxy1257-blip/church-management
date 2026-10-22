'use client';
// Bible reader: multi-translation (English + Ghana local languages as they
// are licensed in), chapter reading, ref jump, search. Click verse to copy.
import { FormEvent, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface Translation { code: string; translation: string; language: string; license: string }
interface Index { defaultTranslation: string | null; translations: Translation[]; books: { name: string; chapters: number }[] }
interface Verse { n: number; text: string }

export default function BiblePage() {
  const [index, setIndex] = useState<Index | null>(null);
  const [translation, setTranslation] = useState('');
  const [book, setBook] = useState('John');
  const [chapter, setChapter] = useState(3);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [ref, setRef] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ book: string; chapter: number; verse: number; text: string }[]>([]);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch(`${API}/bible`).then((r) => r.json()).then((d: Index) => {
      setIndex(d);
      if (d.defaultTranslation) setTranslation(d.defaultTranslation);
      if (d.books[0]) setBook(d.books[0].name);
    }).catch(() => setError('Bible bundles missing — run npm run bible:fetch'));
  }, []);

  async function loadChapter(t: string, b: string, c: number): Promise<void> {
    try {
      const res = await fetch(`${API}/bible/chapter?book=${encodeURIComponent(b)}&chapter=${c}&translation=${encodeURIComponent(t)}`);
      if (!res.ok) throw new Error('chapter not found');
      const d = (await res.json()) as { verses: Verse[]; book: string; chapter: number };
      setVerses(d.verses); setBook(d.book); setChapter(d.chapter); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }

  function pickTranslation(code: string): void {
    setTranslation(code);
    setResults([]);
    void fetch(`${API}/bible`).then((r) => r.json()).then((d: Index) => {
      if (d.books[0]) {
        setBook(d.books[0].name);
        void loadChapter(code, d.books[0].name, 1);
      }
    });
  }

  useEffect(() => {
    if (translation) void loadChapter(translation, book, chapter);
  }, [translation, book, chapter]);

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
      const d = (await res.json()) as { results: typeof results };
      setResults(d.results);
    } catch { /* empty */ }
  }

  function copy(v: Verse): void {
    void navigator.clipboard?.writeText(`"${v.text}" — ${book} ${chapter}:${v.n}`);
    setCopied(`${book} ${chapter}:${v.n}`);
    setTimeout(() => setCopied(''), 1500);
  }

  const bookInfo = index?.books.find((b) => b.name === book);
  const active = index?.translations.find((t) => t.code === translation);

  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: '3vh' }}>
      <div className="card">
        <div className="spread">
          <h1 style={{ margin: 0 }}>Bible</h1>
          {active ? <span className="badge mute">{active.language} · {active.translation}</span> : null}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {index?.translations.map((t) => (
            <button key={t.code} className={`small ${t.code === translation ? '' : 'secondary'}`} onClick={() => pickTranslation(t.code)} title={t.license}>
              {t.language === 'English' ? t.translation : `${t.language} (${t.translation})`}
            </button>
          ))}
        </div>
        {index && index.translations.length === 1 ? (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Licensed translations &amp; Ghana local languages (Twi, Fante, Ewe, Ga…) appear here once their files are dropped into apps/api/data/bible/
          </p>
        ) : null}
        <div className="row" style={{ marginTop: 8 }}>
          <select style={{ flex: 2 }} value={book} onChange={(e) => { setChapter(1); setBook(e.target.value); }}>
            {index?.books.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
          <select style={{ flex: 1 }} value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>
            {Array.from({ length: bookInfo?.chapters ?? 1 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
        <form className="row" style={{ marginTop: 8 }} onSubmit={gotoRef}>
          <input placeholder="Jump to ref, e.g. John 3:16" value={ref} onChange={(e) => setRef(e.target.value)} style={{ flex: 1 }} />
          <button className="secondary">Go</button>
        </form>
        <form className="row" style={{ marginTop: 6 }} onSubmit={search}>
          <input placeholder="Search this translation…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
          <button className="secondary">Search</button>
        </form>
        {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}
        {copied ? <div className="muted" style={{ marginTop: 6 }}>Copied {copied} ✓</div> : null}
      </div>
      {results.length > 0 ? (
        <div className="card">
          <h2>Search results</h2>
          {results.map((r, i) => (
            <p key={i} style={{ margin: '6px 0' }}><b>{r.book} {r.chapter}:{r.verse}</b> — {r.text}</p>
          ))}
        </div>
      ) : null}
      <div className="card">
        <h2>{book} {chapter}</h2>
        {verses.map((v) => (
          <p key={v.n} style={{ margin: '6px 0', cursor: 'pointer' }} onClick={() => copy(v)} title="Click to copy">
            <sup><b>{v.n}</b></sup> {v.text}
          </p>
        ))}
      </div>

    </div>
  );
}
