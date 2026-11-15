'use client';
// Outreach: the record of an evangelism or visitation outing, and the people
// met there. The office logs what happened, and anyone with outreach:read sees
// the history; only outreach:write may add an outing or a contact.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { hasPermission } from '../../../lib/access';
import { getSession, peekSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface Activity {
  id: string;
  dateKey: string;
  kind: string;
  place: string;
  leaderName: string | null;
  peopleReached: number;
  notes: string | null;
  createdAt: string;
  contactCount: number;
}

// Mirror of packages/shared/src/outreach.ts — the web bundle cannot import it.
const KIND_LABELS: Record<string, string> = {
  EVANGELISM: 'Evangelism',
  VISIT: 'Home or hospital visit',
  COMMUNITY: 'Community service',
  OTHER: 'Other',
};
const KIND_KEYS = ['EVANGELISM', 'VISIT', 'COMMUNITY', 'OTHER'] as const;
const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind;

const todayKey = (): string => new Date().toISOString().slice(0, 10);
const showDate = (key: string): string =>
  new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function OutreachPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [form, setForm] = useState({ dateKey: todayKey(), kind: 'EVANGELISM', place: '', leaderName: '', peopleReached: '', notes: '' });
  const [open, setOpen] = useState<string | null>(null);
  const [contact, setContact] = useState({ firstName: '', lastName: '', phoneE164: '', note: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try { setActivities(await api<Activity[]>('/outreach')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }

  useEffect(() => {
    (async () => {
      try {
        const session = peekSession() ?? (await getSession());
        setCanWrite(hasPermission(session.permissions, 'outreach:write'));
      } catch { /* the route guard already let them in */ }
    })();
    void load();
  }, []);

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/outreach', {
        method: 'POST',
        body: {
          ...(form.dateKey ? { dateKey: form.dateKey } : {}),
          kind: form.kind,
          place: form.place,
          ...(form.leaderName ? { leaderName: form.leaderName } : {}),
          ...(form.peopleReached ? { peopleReached: form.peopleReached } : {}),
          ...(form.notes ? { notes: form.notes } : {}),
        },
      });
      setForm({ dateKey: todayKey(), kind: 'EVANGELISM', place: '', leaderName: '', peopleReached: '', notes: '' });
      setNotice('Outing recorded.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function addContact(activityId: string, e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api(`/outreach/${activityId}/contacts`, { method: 'POST', body: contact });
      setContact({ firstName: '', lastName: '', phoneE164: '', note: '' });
      setNotice('Person added to the outing.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Outreach</h1>
      <p className="muted">Community outreach and evangelism outings, and the people you met there.</p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      {canWrite ? (
        <div className="card">
          <h2>Record an outing</h2>
          <form className="stack" onSubmit={create}>
            <label>When<input type="date" value={form.dateKey} onChange={(e) => setForm({ ...form, dateKey: e.target.value })} /></label>
            <div>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>What kind of outing?</span>
              <div className="chip-scroll">
                {KIND_KEYS.map((k) => (
                  <button key={k} type="button" className={form.kind === k ? 'small chip-on' : 'small'} onClick={() => setForm({ ...form, kind: k })}>
                    {kindLabel(k)}
                  </button>
                ))}
              </div>
            </div>
            <label>Where<input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Market, hospital, a housing estate…" required /></label>
            <label>Who led it<input value={form.leaderName} onChange={(e) => setForm({ ...form, leaderName: e.target.value })} placeholder="Optional" /></label>
            <label>People reached<input type="number" min={0} inputMode="numeric" value={form.peopleReached} onChange={(e) => setForm({ ...form, peopleReached: e.target.value })} placeholder="How many heard or were helped" /></label>
            <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything worth remembering" /></label>
            <button>Save</button>
          </form>
        </div>
      ) : null}

      <div className="card">
        <h2>Outings</h2>
        {activities.length === 0 ? (
          <p className="muted">No outings recorded yet.{canWrite ? ' Record the first one above.' : ''}</p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="card" style={{ marginTop: 8, background: 'var(--bg)' }}>
              <div className="spread" style={{ alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{a.place}</strong>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>
                    {showDate(a.dateKey)} · {kindLabel(a.kind)}
                    {a.leaderName ? ` · led by ${a.leaderName}` : ''}
                  </div>
                  {a.notes ? <div className="muted" style={{ fontSize: '0.82rem' }}>{a.notes}</div> : null}
                </div>
                <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className="badge mute">{a.peopleReached} reached</span>
                  <span className="badge ok">{a.contactCount} met</span>
                </div>
              </div>
              {canWrite ? (
                <button className="small secondary" type="button" style={{ marginTop: 8 }} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  {open === a.id ? 'Close' : 'Add someone they met'}
                </button>
              ) : null}
              {open === a.id && canWrite ? (
                <form className="stack" style={{ marginTop: 8 }} onSubmit={(e) => addContact(a.id, e)}>
                  <div className="twocol">
                    <label>First name<input value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} required /></label>
                    <label>Last name<input value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} /></label>
                  </div>
                  <label>Phone<input type="tel" inputMode="tel" value={contact.phoneE164} onChange={(e) => setContact({ ...contact, phoneE164: e.target.value })} placeholder="For a follow-up call" /></label>
                  <label>Note<input value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} placeholder="Anything useful later" /></label>
                  <button className="secondary">Add person</button>
                </form>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}