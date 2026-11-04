'use client';
// Reminders: one message from a leader to the whole church, shown in the
// companion's notification pane. Can be sent now or scheduled off a program
// date (1 week / 3 days / 1 day before). The API refuses the same words twice,
// whichever leader sends them.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';
import Notice from '../../../components/notice';

interface Reminder {
  id: string;
  kind: string;
  title: string;
  body: string;
  scheduledFor: string;
  sentAt: string | null;
}

const OFFSETS = [
  { days: 7, label: '1 week before' },
  { days: 3, label: '3 days before' },
  { days: 1, label: '1 day before' },
];

export default function RemindersPage() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [form, setForm] = useState({ title: '', body: '', programAt: '', offsets: [] as number[] });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      setItems(await api<Reminder[]>('/reminders'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load reminders');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function send(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await api<{ created: number }>('/reminders', {
        method: 'POST',
        body: {
          title: form.title,
          body: form.body,
          programAt: form.programAt ? new Date(`${form.programAt}T09:00:00`).toISOString() : null,
          offsets: form.programAt ? form.offsets : [],
        },
      });
      setNotice(
        form.programAt && form.offsets.length
          ? `Scheduled ${res.created} reminder${res.created === 1 ? '' : 's'} before ${form.programAt}.`
          : 'Sent — it is in everybody’s notification pane now.',
      );
      setForm({ title: '', body: '', programAt: '', offsets: [] });
      await load();
    } catch (err) {
      // The duplicate line from the API names when and by whom it went out.
      setError(err instanceof Error ? err.message : 'could not send the reminder');
    } finally {
      setBusy(false);
    }
  }

  function toggleOffset(days: number): void {
    setForm((f) => ({
      ...f,
      offsets: f.offsets.includes(days) ? f.offsets.filter((d) => d !== days) : [...f.offsets, days],
    }));
  }

  const now = Date.now();

  return (
    <div>
      <h1>Reminders</h1>
      <p className="muted">
        One message to the whole church. It appears in the notification pane in the member app — now, or before a
        program. If another leader has already sent the same words, you will be told instead of the church getting it
        twice.
      </p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="card">
        <h2>New reminder</h2>
        <form className="stack" onSubmit={send}>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} required /></label>
          <label>Message<textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={500} required /></label>
          <label>
            Program date (optional — leaves it for now if empty)
            <input type="date" value={form.programAt} onChange={(e) => setForm({ ...form, programAt: e.target.value })} />
          </label>
          {form.programAt ? (
            <div className="stack">
              <span className="muted" style={{ fontSize: '0.85rem' }}>Remind people:</span>
              {OFFSETS.map((o) => (
                <label key={o.days} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.offsets.includes(o.days)} onChange={() => toggleOffset(o.days)} style={{ width: 'auto' }} />
                  {o.label}
                </label>
              ))}
            </div>
          ) : null}
          <button disabled={busy || !form.title.trim() || !form.body.trim()}>Send reminder</button>
        </form>
      </div>

      <div className="card">
        <h2>Sent and scheduled</h2>
        {items.length === 0 ? <p className="muted">Nothing sent yet.</p> : null}
        {items.map((r) => {
          const when = new Date(r.scheduledFor).getTime();
          const waiting = when > now;
          return (
            <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="spread">
                <b>{r.title}</b>
                <span className={`badge ${waiting ? 'warn' : 'ok'}`}>{waiting ? 'Scheduled' : 'Sent'}</span>
              </div>
              <div className="muted">{r.body}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {waiting ? 'Goes out' : 'Went out'} {fmtDateTime(r.scheduledFor)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
