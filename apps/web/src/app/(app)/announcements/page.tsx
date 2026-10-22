'use client';
// Announcements: post church-wide notices (in-app now; SMS via campaigns).
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';

interface Announcement { id: string; title: string; body: string; category?: string; channels: string[]; publishAt: string }

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: '', body: '', channel: 'INAPP', category: 'GENERAL' });
  const [filter, setFilter] = useState('ALL');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(cat = filter): Promise<void> {
    try {
      setItems(await api<Announcement[]>(`/announcements${cat && cat !== 'ALL' ? `?category=${cat}` : ''}`));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  async function post(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/announcements', { method: 'POST', body: { title: form.title, body: form.body, channels: [form.channel], category: form.category } });
      setForm({ title: '', body: '', channel: 'INAPP', category: 'GENERAL' });
      setNotice('Announcement published');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Announcements</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="card">
        <h2>New announcement</h2>
        <form className="stack" onSubmit={post}>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>Body<textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></label>
          <div className="row">
            <label>Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="GENERAL">General</option>
                <option value="FUNERAL">Funeral / one-week</option>
                <option value="OUTDOORING">Outdooring</option>
                <option value="EVENT">Event</option>
                <option value="ALERT">Alert</option>
              </select>
            </label>
            <label>Channel
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="INAPP">In-app</option><option value="SMS">SMS (via campaign)</option><option value="PUSH">Push (needs VAPID)</option>
              </select>
            </label>
          </div>
          <button>Publish</button>
        </form>
      </div>
      <div className="card">
        <div className="spread">
          <h2>Published</h2>
          <span className="row">
            {['ALL', 'GENERAL', 'FUNERAL', 'OUTDOORING', 'EVENT', 'ALERT'].map((c) => (
              <button key={c} className={`small ${filter === c ? '' : 'secondary'}`} onClick={() => { setFilter(c); void load(c); }}>{c}</button>
            ))}
          </span>
        </div>
        {items.map((a) => (
          <div key={a.id} className="card" style={{ marginTop: 8, background: 'var(--bg)' }}>
            <div className="spread"><strong>{a.title}</strong><span className="muted">{fmtDateTime(a.publishAt)}</span></div>
            <p style={{ margin: '4px 0 0' }}>{a.body}</p>
            <div className="row">
              {a.category && a.category !== 'GENERAL' ? <span className="badge warn">{a.category}</span> : null}
              {a.channels.map((c) => <span key={c} className="badge mute">{c}</span>)}
            </div>
          </div>
        ))}
        {items.length === 0 ? <p className="muted">No announcements yet.</p> : null}
      </div>
    </div>
  );
}
