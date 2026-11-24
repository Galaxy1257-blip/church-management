'use client';
// Announcements: publish now or schedule in-app and phone delivery.
// Clicking a notice opens it in full — including the photo published with it
// (e.g. a deceased parent) and the member it is about, with their contact card.
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';
import { fileToPhotoDataUrl } from '../../../lib/photo';
import MemberDrawer from '../../../components/member-drawer';
import Notice from '../../../components/notice';
import { useDialogFocus } from '../../../components/use-dialog-focus';

interface MemberLite {
  id: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  address: string | null;
  status: string;
  photoDataUrl: string | null;
}

interface Delivery {
  id: string;
  channel: string;
  status: string;
  dueAt: string;
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  category?: string;
  channels: string[];
  publishAt: string;
  expiresAt?: string | null;
  cancelledAt?: string | null;
  deliveries?: Delivery[];
  memberId?: string | null;
  member?: MemberLite | null;
}

interface AnnouncementDetail extends Announcement {
  photoDataUrl: string | null;
  deliveries: Delivery[];
}

const CHANNEL_LABELS: Record<string, string> = {
  INAPP: 'In-app',
  PUSH: 'Phone notification',
  SMS: 'Text message',
};

const DELIVERY_LABELS: Record<string, string> = {
  PENDING: 'Waiting',
  PROCESSING: 'Sending',
  SENT: 'Sent',
  PARTIAL: 'Partly sent',
  FAILED: 'Needs attention',
  SKIPPED: 'Not sent',
  CANCELLED: 'Cancelled',
};

function localDateTime(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function announcementState(a: Announcement): string {
  if (a.cancelledAt) return 'Cancelled';
  if (new Date(a.publishAt).getTime() > Date.now()) return 'Scheduled';
  const statuses = (a.deliveries ?? []).map((d) => d.status);
  if (statuses.includes('FAILED')) return 'Needs attention';
  if (statuses.includes('PARTIAL')) return 'Partly delivered';
  if (statuses.includes('PROCESSING')) return 'Sending';
  if (statuses.length && statuses.every((s) => s === 'SENT')) return 'Delivered';
  if (statuses.some((s) => s === 'SKIPPED')) return 'Not fully sent';
  return statuses.length ? 'Queued' : 'Published';
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState({
    title: '',
    body: '',
    channels: ['INAPP'],
    publishAt: '',
    category: 'GENERAL',
    memberId: '',
    photoDataUrl: '',
  });
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnnouncementDetail | null>(null);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  // Notices members sent in from the companion, waiting for a leader.
  const [pending, setPending] = useState<Announcement[]>([]);
  const dialogRef = useRef<HTMLElement>(null);
  // When the member drawer opens on top, it owns focus; this trap stands down.
  useDialogFocus(dialogRef, !!openId && !openMemberId);

  async function load(cat = filter): Promise<void> {
    try {
      setItems(await api<Announcement[]>(`/announcements${cat && cat !== 'ALL' ? `?category=${cat}` : ''}`));
      setPending(await api<Announcement[]>('/announcements?pending=true').catch(() => []));
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
      const loaded = await api<AnnouncementDetail>(`/announcements/${id}`);
      setDetail(loaded);
      setRescheduleAt(localDateTime(loaded.publishAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not open this notice');
    }
  }

  async function post(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const publishAt = form.publishAt ? new Date(form.publishAt) : new Date();
      await api('/announcements', {
        method: 'POST',
        body: {
          title: form.title,
          body: form.body,
          channels: form.channels,
          publishAt: form.publishAt ? publishAt.toISOString() : undefined,
          category: form.category,
          memberId: form.memberId || undefined,
          photoDataUrl: form.photoDataUrl || undefined,
        },
      });
      setForm({ title: '', body: '', channels: ['INAPP'], publishAt: '', category: 'GENERAL', memberId: '', photoDataUrl: '' });
      setNotice(publishAt.getTime() > Date.now() ? `Scheduled for ${fmtDateTime(publishAt)}.` : 'Saved — delivery is queued.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not save the announcement'); }
    finally { setBusy(false); }
  }

  function toggleChannel(channel: string): void {
    setForm((f) => {
      if (f.channels.includes(channel) && f.channels.length === 1) return f;
      return { ...f, channels: f.channels.includes(channel) ? f.channels.filter((c) => c !== channel) : [...f.channels, channel] };
    });
  }

  async function reschedule(): Promise<void> {
    if (!detail) return;
    const next = new Date(rescheduleAt);
    if (!rescheduleAt || Number.isNaN(next.getTime())) {
      setError('Choose a valid publishing time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await api<AnnouncementDetail>(`/announcements/${detail.id}/reschedule`, {
        method: 'POST',
        body: { publishAt: next.toISOString() },
      });
      setDetail(updated);
      setRescheduleAt(localDateTime(updated.publishAt));
      setNotice(`New publishing time saved: ${fmtDateTime(updated.publishAt)}.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not change the publishing time'); }
    finally { setBusy(false); }
  }

  async function cancel(): Promise<void> {
    if (!detail || !window.confirm('Cancel this scheduled announcement? It will not be sent.')) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<AnnouncementDetail>(`/announcements/${detail.id}/cancel`, { method: 'POST' });
      setDetail(updated);
      setNotice('Announcement cancelled. It will not be sent.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not cancel the announcement'); }
    finally { setBusy(false); }
  }

  async function decide(id: string, approve: boolean): Promise<void> {
    try {
      await api(`/announcements/${id}/moderate`, { method: 'POST', body: { approve } });
      setNotice(approve ? 'Approved — delivery is queued.' : 'Not approved — the member sees that it was declined.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not record the decision'); }
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
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      {pending.length > 0 ? (
        <div className="card">
          <h2>Waiting for a leader ({pending.length})</h2>
          <p className="muted">Sent in by members from their companion app. Nothing here is visible to the congregation yet.</p>
          {pending.map((a) => (
            <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <div>
                  <b>{a.title}</b>
                  <div className="muted">{a.body}</div>
                </div>
                <span className="row">
                  <button className="small" onClick={() => void decide(a.id, true)}>Approve</button>
                  <button className="small danger" onClick={() => void decide(a.id, false)}>Decline</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
            <fieldset>
              <legend>Where it goes</legend>
              <div className="row">
                <label className="row"><input type="checkbox" checked={form.channels.includes('INAPP')} onChange={() => toggleChannel('INAPP')} /> In-app</label>
                <label className="row"><input type="checkbox" checked={form.channels.includes('PUSH')} onChange={() => toggleChannel('PUSH')} /> Phone notification</label>
                <label className="row"><input type="checkbox" checked={form.channels.includes('SMS')} onChange={() => toggleChannel('SMS')} /> SMS</label>
              </div>
              {form.channels.includes('SMS') ? (
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                  Uses your SMS credits. Only active members who agreed to texts and have not opted out will receive it. Quiet hours still apply.
                </p>
              ) : null}
            </fieldset>
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
            Publishing time (optional)
            <input type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
            <span className="muted">Leave blank to queue it now. Phone delivery needs the church’s push keys switched on.</span>
          </label>
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
          <button disabled={busy}>{busy ? 'Saving…' : form.publishAt ? 'Schedule announcement' : 'Publish now'}</button>
        </form>
      </div>
      <div className="card">
        <div className="spread">
          <h2>Announcements</h2>
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
            style={{ marginTop: 8, width: '100%', textAlign: 'left', cursor: 'pointer' }}
          >
            <div className="spread"><strong>{a.title}</strong><span className="muted">{fmtDateTime(a.publishAt)}</span></div>
            <p style={{ margin: '4px 0 0' }}>{a.body}</p>
            <div className="row">
              <span className={`badge ${announcementState(a) === 'Cancelled' || announcementState(a) === 'Needs attention' ? 'warn' : 'mute'}`}>
                {announcementState(a)}
              </span>
              {a.category && a.category !== 'GENERAL' ? <span className="badge warn">{a.category}</span> : null}
              {a.member ? <span className="badge ok">{a.member.firstName} {a.member.lastName}</span> : null}
              {a.channels.map((c) => <span key={c} className="badge mute">{CHANNEL_LABELS[c] ?? c}</span>)}
              <span className="muted" style={{ fontSize: '0.8rem' }}>Tap to read →</span>
            </div>
          </button>
        ))}
        {items.length === 0 ? <p className="muted">No announcements yet.</p> : null}
      </div>

      {openId ? (
        <>
          <button type="button" className="drawer-scrim" aria-label="Close announcement" onClick={() => { setOpenId(null); setDetail(null); }} />
          <aside ref={dialogRef} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label="Announcement">
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

                  <div className="drawer-section">
                    <h3>Delivery</h3>
                    {detail.deliveries.length ? detail.deliveries.map((delivery) => (
                      <div key={delivery.id} className="spread" style={{ padding: '6px 0' }}>
                        <span>{CHANNEL_LABELS[delivery.channel] ?? delivery.channel}</span>
                        <span className="badge mute">{DELIVERY_LABELS[delivery.status] ?? delivery.status}</span>
                      </div>
                    )) : <p className="muted">No delivery record for this older announcement.</p>}
                    {detail.deliveries.map((delivery) => delivery.lastError ? (
                      <p key={`${delivery.id}-error`} className="muted" style={{ fontSize: '0.85rem' }}>{delivery.lastError}</p>
                    ) : null)}
                  </div>

                  {!detail.cancelledAt && new Date(detail.publishAt).getTime() > Date.now() ? (
                    <div className="drawer-section">
                      <h3>Scheduled announcement</h3>
                      <label>
                        New publishing time
                        <input
                          type="datetime-local"
                          value={rescheduleAt}
                          min={localDateTime(new Date().toISOString())}
                          onChange={(e) => setRescheduleAt(e.target.value)}
                        />
                      </label>
                      <div className="row">
                        <button type="button" className="small" disabled={busy} onClick={() => void reschedule()}>Save new time</button>
                        <button type="button" className="small danger" disabled={busy} onClick={() => void cancel()}>Cancel announcement</button>
                      </div>
                    </div>
                  ) : null}

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
