'use client';
// The Bible button that stays on screen wherever you are in the app, and the
// reading panel behind it: language, book and chapter, search, tap-a-verse
// notes in colours, and the same verse in the other bundled translations.
//
// Mounted once in the app shell (and once in the member companion), so opening
// it never leaves the page you were working on — the panel belongs to the shell,
// not the page. Nothing here needs a permission: reading the Bible is not staff
// work, and a note is private to whoever wrote it.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { translationLabel } from '../lib/bible';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const POSITION_KEY = 'chms.bibleDock';

interface Translation { code: string; translation: string; language: string }
interface Index {
  defaultTranslation: string | null;
  translations: Translation[];
  books: { name: string; localName: string; chapters: number }[];
}
interface Verse { n: number; text: string }
interface Hit { book: string; bookLocal: string; chapter: number; verse: number; text: string }
interface Note { id: string; ref: string; text: string; colour: string }

const COLOURS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;

export default function BibleDock({ token, on = true }: { token?: string | null; on?: boolean }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<Index | null>(null);
  const [translation, setTranslation] = useState('');
  const [book, setBook] = useState('Genesis');
  const [bookLocal, setBookLocal] = useState('Genesis');
  const [chapter, setChapter] = useState(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [selected, setSelected] = useState<Verse | null>(null);
  const [draft, setDraft] = useState('');
  const [colour, setColour] = useState<string>('yellow');
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [compare, setCompare] = useState<{ code: string; text: string }[] | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  const notesPath = token ? '/portal/bible-notes' : '/bible/notes';

  const call = useCallback(
    async <T,>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> => {
      if (!token) return api<T>(path, opts);
      const res = await fetch(`${API}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      if (!res.ok) {
        let message = `request failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          /* not json */
        }
        throw new Error(message);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [token],
  );

  const loadChapter = useCallback(
    async (t: string, b: string, c: number): Promise<void> => {
      try {
        const q = new URLSearchParams({ book: b, chapter: String(c), translation: t });
        const d = await call<{ verses: Verse[]; book: string; bookLocal: string; chapter: number }>(`/bible/chapter?${q}`);
        setVerses(d.verses);
        setBook(d.book);
        setBookLocal(d.bookLocal);
        setChapter(d.chapter);
        setHits(null);
        setSelected(null);
        setCompare(null);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'could not open that chapter');
      }
    },
    [call],
  );

  // The panel only asks for the bundles when it is first opened, so no page in
  // the app pays for it until somebody taps the button.
  useEffect(() => {
    if (!open || index) return;
    void (async () => {
      try {
        const remembered = JSON.parse(localStorage.getItem(POSITION_KEY) ?? '{}') as {
          translation?: string;
          book?: string;
          chapter?: number;
        };
        const pre = await call<Index>('/bible');
        const t =
          remembered.translation && pre.translations.some((x) => x.code === remembered.translation)
            ? remembered.translation
            : (pre.defaultTranslation ?? pre.translations[0]?.code ?? '');
        // The book list is per translation, so ask for it in the language the
        // reader is actually going to open.
        const d = t === pre.defaultTranslation ? pre : await call<Index>(`/bible?translation=${encodeURIComponent(t)}`);
        setIndex(d);
        const b = remembered.book && d.books.some((x) => x.name === remembered.book) ? remembered.book : 'Genesis';
        const c = remembered.chapter ?? 1;
        setTranslation(t);
        await Promise.all([
          loadChapter(t, b, c),
          call<Note[]>(notesPath).then(setNotes).catch(() => setNotes([])),
        ]);
      } catch {
        setError('The Bible files are not on this server yet.');
      }
    })();
  }, [open, index, call, loadChapter, notesPath]);

  useEffect(() => {
    if (!open || !translation) return;
    localStorage.setItem(POSITION_KEY, JSON.stringify({ translation, book, chapter }));
  }, [open, translation, book, chapter]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!on) return null;

  const active = index?.translations.find((t) => t.code === translation);
  const bookInfo = index?.books.find((b) => b.name === book);
  const selectedRef = selected ? `${book} ${chapter}:${selected.n}` : '';

  async function search(e: FormEvent): Promise<void> {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setError('Type at least three letters to search.');
      return;
    }
    try {
      const d = await call<{ results: Hit[] }>(
        `/bible/search?q=${encodeURIComponent(q)}&limit=25&translation=${encodeURIComponent(translation)}`,
      );
      setHits(d.results);
      setSelected(null);
      setError('');
    } catch {
      setError('Search needs at least three letters.');
    }
  }

  function pickVerse(v: Verse): void {
    if (selected?.n === v.n) {
      setSelected(null);
      return;
    }
    setSelected(v);
    setDraft('');
    setCompare(null);
    setNotice('');
    setError('');
    setTimeout(() => draftRef.current?.focus(), 60);
  }

  async function saveNote(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!selected) return;
    try {
      const created = await call<Note>(notesPath, { method: 'POST', body: { ref: selectedRef, text: draft, colour } });
      setNotes((prev) => [created, ...prev]);
      setDraft('');
      setNotice(`Note on ${created.ref} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the note did not save');
    }
  }

  async function dropNote(id: string): Promise<void> {
    try {
      await call(`${notesPath}/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setNotice('Note deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the note did not delete');
    }
  }

  /** A saved note opens the chapter it came from. */
  function openNote(ref: string): void {
    const m = /^(.+?)\s+(\d+):(\d+)$/.exec(ref);
    if (!m) return;
    setShowNotes(false);
    void loadChapter(translation, m[1], Number(m[2]));
  }

  async function readInOtherLanguages(): Promise<void> {
    if (!selected || !index) return;
    const rows = await Promise.all(
      index.translations
        .filter((t) => t.code !== translation)
        .map(async (t) => {
          try {
            const d = await call<{ verses: Verse[] }>(
              `/bible/verse?ref=${encodeURIComponent(selectedRef)}&translation=${encodeURIComponent(t.code)}`,
            );
            return { code: t.code, text: d.verses.map((v) => v.text).join(' ') };
          } catch {
            return null;
          }
        }),
    );
    setCompare(rows.filter((r): r is { code: string; text: string } => r !== null));
  }

  function copyVerse(): void {
    if (!selected) return;
    void navigator.clipboard?.writeText(`"${selected.text}" — ${selectedRef}`);
    setNotice(`Copied ${selectedRef}.`);
  }

  return (
    <>
      <button
        type="button"
        className="bible-fab"
        aria-expanded={open}
        aria-controls={open ? 'bible-panel' : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        Bible
      </button>

      {open ? (
        <>
          <button type="button" className="drawer-scrim" aria-label="Close the Bible" onClick={() => setOpen(false)} />
          <section id="bible-panel" className="drawer bible-drawer" role="dialog" aria-modal="true" aria-label="Bible">
            <header className="drawer-head">
              <h2 className="bible-title">Bible</h2>
              <select
                className="bible-lang"
                value={translation}
                aria-label="Bible language and version"
                onChange={(e) => {
                  const t = e.target.value;
                  setTranslation(t);
                  void call<Index>(`/bible?translation=${encodeURIComponent(t)}`).then((d) => {
                    const first = d.books.find((b) => b.name === book) ?? d.books[0];
                    if (!first) return;
                    const nextChapter = Math.min(chapter, first.chapters);
                    setIndex(d);
                    setBook(first.name);
                    setBookLocal(first.localName);
                    setChapter(nextChapter);
                    void loadChapter(t, first.name, nextChapter);
                  });
                }}
              >
                {index?.translations.map((t) => (
                  <option key={t.code} value={t.code}>
                    {translationLabel(t)}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn" aria-label="Close the Bible" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>

            <div className="drawer-body">
              <div className="row bible-controls">
                <select value={book} aria-label="Book" onChange={(e) => void loadChapter(translation, e.target.value, 1)}>
                  {index?.books.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.localName}
                    </option>
                  ))}
                </select>
                <select
                  value={chapter}
                  aria-label="Chapter"
                  onChange={(e) => void loadChapter(translation, book, Number(e.target.value))}
                >
                  {Array.from({ length: bookInfo?.chapters ?? 1 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`small secondary${showNotes ? ' on' : ''}`}
                  aria-pressed={showNotes}
                  onClick={() => setShowNotes((v) => !v)}
                >
                  My notes
                </button>
              </div>

              <form className="row bible-search" onSubmit={(e) => void search(e)}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search these words…"
                  aria-label="Search the Bible"
                />
                <button className="secondary" type="submit">
                  Search
                </button>
              </form>

              {error ? <p className="error">{error}</p> : null}
              {notice ? <p className="muted">{notice}</p> : null}

              {showNotes ? (
                <div className="bible-notes">
                  {notes.length === 0 ? (
                    <p className="muted">You have no notes yet. Tap any verse to write one — notes are yours alone.</p>
                  ) : null}
                  {notes.map((n) => (
                    <div key={n.id} className={`note-row note-${n.colour}`}>
                      <button type="button" className="link-button" onClick={() => openNote(n.ref)}>
                        {n.ref}
                      </button>
                      <span>{n.text}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Delete the note on ${n.ref}`}
                        onClick={() => void dropNote(n.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {hits ? (
                <div className="bible-verses">
                  <div className="spread bible-listhead">
                    <h3>{hits.length} verses say it</h3>
                    <button type="button" className="small secondary" onClick={() => void loadChapter(translation, book, chapter)}>
                      Back to {bookLocal} {chapter}
                    </button>
                  </div>
                  {hits.length === 0 ? <p className="muted">Nothing in this translation matches.</p> : null}
                  {hits.map((h, i) => (
                    <button
                      type="button"
                      key={`${h.book}-${h.chapter}-${h.verse}-${i}`}
                      className="bible-verse"
                      onClick={() => void loadChapter(translation, h.book, h.chapter)}
                    >
                      <b>
                        {h.bookLocal} {h.chapter}:{h.verse}
                      </b>{' '}
                      {h.text}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bible-verses">
                  <h3>
                    {bookLocal} {chapter}
                    {active ? <span className="muted"> · {active.language}</span> : null}
                  </h3>
                  {verses.map((v) => (
                    <button
                      type="button"
                      key={v.n}
                      className={`bible-verse${selected?.n === v.n ? ' on' : ''}`}
                      onClick={() => pickVerse(v)}
                    >
                      <sup>{v.n}</sup> {v.text}
                      {notes.some((n) => n.ref === `${book} ${chapter}:${v.n}`) ? (
                        <span className="note-mark" title="You have a note on this verse" />
                      ) : null}
                    </button>
                  ))}
                </div>
              )}

              {selected && !hits ? (
                <div className="bible-notebox">
                  <div className="spread bible-listhead">
                    <b>{selectedRef}</b>
                    <span className="row">
                      <button type="button" className="small secondary" onClick={copyVerse}>
                        Copy
                      </button>
                      <button type="button" className="small secondary" onClick={() => void readInOtherLanguages()}>
                        Other languages
                      </button>
                    </span>
                  </div>
                  <form onSubmit={(e) => void saveNote(e)}>
                    <textarea
                      ref={draftRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Your note…"
                      rows={2}
                      maxLength={500}
                      aria-label={`Note on ${selectedRef}`}
                    />
                    <div className="row bible-colours">
                      {COLOURS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`note-dot note-${c}${colour === c ? ' on' : ''}`}
                          aria-label={`${c} note`}
                          aria-pressed={colour === c}
                          onClick={() => setColour(c)}
                        />
                      ))}
                      <button type="submit" className="small" disabled={!draft.trim()}>
                        Save note
                      </button>
                    </div>
                  </form>
                  {notes.filter((n) => n.ref === selectedRef).map((n) => (
                    <div key={n.id} className={`note-row note-${n.colour}`}>
                      <span>{n.text}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Delete this note"
                        onClick={() => void dropNote(n.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {compare ? (
                    <div className="bible-compare">
                      {compare.length === 0 ? (
                        <p className="muted">No other translation on this server has this verse.</p>
                      ) : null}
                      {compare.map((c) => (
                        <p key={c.code}>
                          <b>{translationLabel(index?.translations.find((t) => t.code === c.code) ?? { translation: c.code, language: '' })}</b>{' '}
                          {c.text}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="muted bible-foot">
                <Link href="/bible">Open the full reader</Link>
              </p>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
