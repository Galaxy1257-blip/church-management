'use client';
// Announcements: post church-wide notices (in-app now; SMS via campaigns).
// Clicking a notice opens it in full — including the photo published with it
// (e.g. a deceased parent) and the member it is about, with their contact card.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';
import { fileToPhotoDataUrl } from '../../../lib/photo';
import MemberDrawer from '../../../components/member-drawer';

interface MemberLite {
  id: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  address: string | null;
  status: string;
  photoDataUrl: string | null;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  category?: string;
  channels: string[];
  publishAt: string;
  memberId?: string | null;
  member?: MemberLite | null;
}

interface AnnouncementDetail extends Announcement {
  photoDataUrl: string | null;
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: '', body: '', channel: 'INAPP', category: 'GENERAL', memberId: '', photoDataUrl: '' });
  const [filter, setFilter] = useState('ALL');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnnouncementDetail | null>(null);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  async function load(cat = filter): Promise<void> {
    try {
      setItems(await api<Announcement[]>(`/announcements${cat && cat !== 'ALL' ? `?category=${cat}` : ''}`));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => {
    void load();
    void api<{ items: MemberLite[] }>('/members?pageSize=200')
      .then((r) => setMembers(r.items))
      .catch(() => undefined);
  }, []);

  // Deep link from the dashboard: /announcements?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open');
    if (id) void openAnnouncement(id);
  }, []);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openMemberId) setOpenMemberId(null);
      else setOpenId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, openMemberId]);

  async function openAnnouncement(id: string): Promise<void> {
    setOpenId(id);
    setDetail(null);
    try {
      setDetail(await api<AnnouncementDetail>(`/announcements/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not open this notice');
    }
  }

  async function post(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/announcements', {
        method: 'POST',
        body: {
          title: form.title,
          body: form.body,
          channels: [form.channel],
          category: form.category,
          memberId: form.memberId || undefined,
          photoDataUrl: form.photoDataUrl || undefined,
        },
      });
      setForm({ title: '', body: '', channel: 'INAPP', category: 'GENERAL', memberId: '', photoDataUrl: '' });
      setNotice('Announcement published');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function pickPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      setForm((f) => ({ ...f, photoDataUrl: '' }));
      const url = await fileToPhotoDataUrl(file, 720);
      setForm((f) => ({ ...f, photoDataUrl: url }));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'could not read photo'); }
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
            <label style={{ flex: 1 }}>
              About a member (optional)
              <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Photo (optional — for a funeral, you can add a picture of the person)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          </label>
          {form.photoDataUrl ? (
            <div className="row">
              <img src={form.photoDataUrl} alt="Chosen photo" style={{ height: 110, borderRadius: 10, border: '1px solid var(--line)' }} />
              <button type="button" className="small secondary" onClick={() => setForm({ ...form, photoDataUrl: '' })}>Remove photo</button>
            </div>
          ) : null}
          <button>Publish</button>
        </form>
      </div>
      <div className="card">
        <div className="spread">
          <h2>Published</h2>
          <span className="chip-scroll">
            {['ALL', 'GENERAL', 'FUNERAL', 'OUTDOORING', 'EVENT', 'ALERT'].map((c) => (
              <button key={c} className={`small ${filter === c ? '' : 'secondary'}`} onClick={() => { setFilter(c); void load(c); }}>{c}</button>
            ))}
          </span>
        </div>
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            className="card notice-card"
            onClick={() => void openAnnouncement(a.id)}
            style={{ marginTop: 8, background: 'var(--bg)', width: '100%', textAlign: 'left', cursor: 'pointer' }}
          >
            <div className="spread"><strong>{a.title}</strong><span className="muted">{fmtDateTime(a.publishAt)}</span></div>
            <p style={{ margin: '4px 0 0' }}>{a.body}</p>
            <div className="row">
              {a.category && a.category !== 'GENERAL' ? <span className="badge warn">{a.category}</span> : null}
              {a.member ? <span className="badge ok">{a.member.firstName} {a.member.lastName}</span> : null}
              {a.channels.map((c) => <span key={c} className="badge mute">{c}</span>)}
              <span className="muted" style={{ fontSize: '0.8rem' }}>Tap to read →</span>
            </div>
          </button>
        ))}
        {items.length === 0 ? <p className="muted">No announcements yet.</p> : null}
      </div>

      {openId ? (
        <>
          <button type="button" className="drawer-scrim" aria-label="Close announcement" onClick={() => { setOpenId(null); setDetail(null); }} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Announcement">
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0 }}>{detail?.title ?? 'Announcement'}</h2>
                {detail ? <div className="muted" style={{ fontSize: '0.82rem' }}>{fmtDateTime(detail.publishAt)}</div> : null}
              </div>
              <button type="button" className="small secondary" onClick={() => { setOpenId(null); setDetail(null); }} aria-label="Close">×</button>
            </div>
            <div className="drawer-body">
              {!detail ? <p className="muted">Loading…</p> : (
                <>
                  {detail.category && detail.category !== 'GENERAL' ? <span className="badge warn">{detail.category}</span> : null}
                  {detail.photoDataUrl ? (
                    <figure style={{ margin: '0.8rem 0' }}>
                      <img src={detail.photoDataUrl} alt="Photo published with this notice" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)' }} />
                    </figure>
                  ) : null}
                  <p style={{ whiteSpace: 'pre-wrap' }}>{detail.body}</p>

                  {detail.member ? (
                    <div className="drawer-section">
                      <h3>Member this notice is about</h3>
                      <div className="row" style={{ alignItems: 'center', gap: '0.6rem' }}>
                        {detail.member.photoDataUrl ? (
                          <img className="avatar avatar-lg" src={detail.member.photoDataUrl} alt={`${detail.member.firstName} ${detail.member.lastName}`} />
                        ) : (
                          <span className="avatar avatar-lg" aria-hidden>
                            {`${detail.member.firstName[0] ?? ''}${detail.member.lastName[0] ?? ''}`.toUpperCase()}
                          </span>
                        )}
                        <div>
                          <strong>{detail.member.firstName} {detail.member.lastName}</strong>
                          <div className="muted" style={{ fontSize: '0.85rem' }}>{detail.member.status.toLowerCase()}</div>
                        </div>
                      </div>
                      <p style={{ marginTop: '0.5rem' }}>
                        {detail.member.phoneE164 ? <a href={`tel:${detail.member.phoneE164}`}>{detail.member.phoneE164}</a> : <span className="muted">No phone on file</span>}
                        {detail.member.address ? <span className="muted"> · {detail.member.address}</span> : null}
                      </p>
                      <button className="small" type="button" onClick={() => setOpenMemberId(detail.member!.id)}>
                        Open full profile
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </>
      ) : null}

      {openMemberId ? <MemberDrawer memberId={openMemberId} onClose={() => setOpenMemberId(null)} /> : null}
    </div>
  );
}
