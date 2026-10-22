'use client';
// Events + RSVP (capacity/waitlist) with QR tokens for guests.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface EventRow { id: string; title: string; startsAt: string; venue: string | null; capacity: number | null; status: string }

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [form, setForm] = useState({ title: '', startsAt: '', venue: '', capacity: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try { setEvents(await api<EventRow[]>('/events')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/events', {
        method: 'POST',
        body: { title: form.title, startsAt: new Date(form.startsAt).toISOString(), venue: form.venue || undefined, capacity: form.capacity ? Number(form.capacity) : undefined },
      });
      setForm({ title: '', startsAt: '', venue: '', capacity: '' });
      setNotice('Event published');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Events</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="card">
        <h2>Publish event</h2>
        <form className="stack" onSubmit={create}>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <div className="row">
            <label style={{ flex: 1 }}>Starts<input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required /></label>
            <label style={{ flex: 1 }}>Venue<input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label>
            <label>Capacity<input style={{ width: 90 }} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} inputMode="numeric" /></label>
          </div>
          <button>Publish</button>
        </form>
      </div>
      <div className="card">
        <h2>Upcoming &amp; past</h2>
        <table><thead><tr><th>Event</th><th>When</th><th>Venue</th><th>Capacity</th><th>Status</th></tr></thead><tbody>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td>{ev.title}</td>
              <td>{new Date(ev.startsAt).toLocaleString()}</td>
              <td>{ev.venue ?? '—'}</td>
              <td>{ev.capacity ?? '∞'}</td>
              <td><span className={`badge ${ev.status === 'PUBLISHED' ? 'ok' : 'mute'}`}>{ev.status}</span></td>
            </tr>
          ))}
        </tbody></table>
        {events.length === 0 ? <p className="muted">No events yet.</p> : null}
      </div>
    </div>
  );
}
