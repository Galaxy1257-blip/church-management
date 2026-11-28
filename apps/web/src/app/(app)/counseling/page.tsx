'use client';
// Counselling notes: encrypted at rest, readable only by the author or someone
// the note is shared with. Pick a member, see their notes, add one. A Sunday
// School teacher sees only their class; everyone else searches the member list.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { hasPermission } from '../../../lib/access';
import { getSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface MemberLite { id: string; firstName: string; lastName: string; memberNo: string }
interface Colleague { id: string; name: string }
interface Note { id: string; authorId: string; createdAt: string; body: string }
interface CareClass { className: string | null; members: MemberLite[] }

export default function CounselingPage() {
  const [perms, setPerms] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemberLite[]>([]);
  const [classMembers, setClassMembers] = useState<MemberLite[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [subject, setSubject] = useState<MemberLite | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');
  const [sharedWithIds, setSharedWithIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const session = await getSession();
      setPerms(session.permissions);
      // A teacher has no member directory; their world is one class.
      if (!hasPermission(session.permissions, 'members:read')) {
        const c = await api<CareClass>('/care/class').catch(() => null);
        if (c) setClassMembers(c.members ?? []);
      } else {
        const cols = await api<Colleague[]>('/counseling/colleagues').catch(() => []);
        setColleagues(cols);
      }
    })();
  }, []);

  async function search(e: FormEvent): Promise<void> {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) { setError('Type at least two letters to find a member.'); return; }
    try {
      const r = await api<{ items: MemberLite[] }>(`/members?q=${encodeURIComponent(q)}&pageSize=20`);
      setResults(r.items);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'member search failed'); }
  }

  async function openSubject(m: MemberLite): Promise<void> {
    setSubject(m);
    setNotes([]);
    setDraft('');
    setSharedWithIds([]);
    setError('');
    try {
      setNotes(await api<Note[]>(`/counseling/${m.id}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'could not open these notes'); }
  }

  function toggleColleague(id: string): void {
    setSharedWithIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function addNote(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!subject || draft.trim().length < 3) return;
    try {
      await api('/counseling', {
        method: 'POST',
        body: {
          subjectId: subject.id,
          body: draft.trim(),
          sharedWith: sharedWithIds.length > 0 ? sharedWithIds.join(',') : undefined,
        },
      });
      setNotice(`Note saved for ${subject.firstName} — encrypted, only you and anyone you shared it with can read it.`);
      setDraft('');
      setSharedWithIds([]);
      setNotes(await api<Note[]>(`/counseling/${subject.id}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'the note did not save'); }
  }

  const classScoped = !hasPermission(perms, 'members:read');
  const canSearch = !classScoped;

  return (
    <div>
      <h1>Counselling notes</h1>
      <p className="muted">
        Notes are encrypted and only visible to the person who wrote them and anyone they shared them with.
        {classScoped ? ' You can write notes for the children in your class.' : ''}
      </p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      {canSearch ? (
        <form className="card stack" onSubmit={(e) => void search(e)}>
          <h2>Find a member</h2>
          <div className="row">
            <input
              aria-label="Search members for counselling notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or member number..."
            />
            <button className="secondary" type="submit">Search</button>
          </div>
          {results.map((m) => (
            <button key={m.id} type="button" className="counter" onClick={() => void openSubject(m)}>
              <span className="name">{m.firstName} {m.lastName}</span>
              <span className="muted" style={{ fontSize: '0.8rem' }}>No. {m.memberNo}</span>
            </button>
          ))}
          {query.trim().length >= 2 && results.length === 0 ? <p className="muted">No member matches.</p> : null}
        </form>
      ) : (
        <div className="card stack">
          <h2>Your class</h2>
          {classMembers.length === 0 ? (
            <p className="muted">Ask your church office to assign your Sunday School class.</p>
          ) : (
            classMembers.map((m) => (
              <button key={m.id} type="button" className="counter" onClick={() => void openSubject(m)}>
                <span className="name">{m.firstName} {m.lastName}</span>
                <span className="muted" style={{ fontSize: '0.8rem' }}>No. {m.memberNo}</span>
              </button>
            ))
          )}
        </div>
      )}

      {subject ? (
        <div className="card stack">
          <h2>Notes — {subject.firstName} {subject.lastName}</h2>
          {notes.length === 0 ? <p className="muted">No notes yet for this member.</p> : null}
          {notes.map((n) => (
            <div key={n.id} className="card" style={{ background: 'var(--bg)' }}>
              <div className="muted" style={{ fontSize: '0.8rem' }}>{new Date(n.createdAt).toLocaleString()}</div>
              <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{n.body}</p>
            </div>
          ))}
          <form className="stack" onSubmit={(e) => void addNote(e)}>
            <h3>Add a note</h3>
            <textarea
              aria-label={`Counselling note about ${subject.firstName} ${subject.lastName}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What to remember from the conversation..."
              rows={4}
              required
            />
            {colleagues.length > 0 ? (
              <div className="stack" style={{ gap: '0.35rem' }}>
                <span className="muted" style={{ fontSize: '0.85rem' }}>Share with staff colleagues (optional):</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                  {colleagues.map((c) => {
                    const checked = sharedWithIds.includes(c.id);
                    return (
                      <label key={c.id} className="row" style={{ gap: '0.3rem', fontSize: '0.85rem', padding: '0.2rem 0.5rem', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleColleague(c.id)} />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <button disabled={draft.trim().length < 3}>Save note</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
