'use client';
// Member companion: OTP login (member phone, no staff account) with tabs —
// Home, My giving + statement, Volunteer shifts, Events/RSVP, Prayer.
import { FormEvent, useEffect, useState } from 'react';
import { fmtDateTime, ghs } from '../../lib/format';
import { pdfBlob } from '../../lib/pdf';
import { fileToPhotoDataUrl } from '../../lib/photo';
import { cardPayload } from '../../lib/card';
import QRCode from 'qrcode';
import BibleDock from '../../components/bible-dock';
import Notice from '../../components/notice';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// The member token lasts 30 days, so a companion that forgets it on every reload
// asks for a new SMS code every time — a text costs the church money. "Keep me
// signed in" writes it to this phone's storage; without the tick it is kept for
// the open tab only (sessionStorage) and the next visit asks again.
const KEEP_KEY = 'chms.portal.token';

function readStoredToken(): string {
  try {
    return localStorage.getItem(KEEP_KEY) ?? sessionStorage.getItem(KEEP_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeToken(token: string, keep: boolean): void {
  try {
    localStorage.removeItem(KEEP_KEY);
    sessionStorage.removeItem(KEEP_KEY);
    (keep ? localStorage : sessionStorage).setItem(KEEP_KEY, token);
  } catch {
    // Private mode / storage full: the session still works, it just is not kept.
  }
}

function forgetToken(): void {
  try {
    localStorage.removeItem(KEEP_KEY);
    sessionStorage.removeItem(KEEP_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

interface GiftRow { date: string | null; fund: string; amountMinor: number; reference: string; channel: string | null }
interface Statement { year: number; rows: GiftRow[]; totalMinor: number }
interface HomeData {
  member: { firstName: string; lastName: string; memberNo: string };
  church: {
    name: string;
    slug: string;
    pastorDisplayName: string | null;
    branding?: { logoDataUrl?: string | null; tagline?: string; primaryColor?: string } | null;
    givingInstructions?: { momoMerchant?: string; momoNumber?: string; ussd?: string; bankName?: string; bankAccount?: string } | null;
    contact?: { phone?: string; email?: string; address?: string } | null;
  } | null;
  services: { id: string; name: string; startsAt: string; status: string }[];
  announcements: { id: string; title: string; body: string; publishAt: string; photoDataUrl?: string | null }[];
  /** False when the church switched the Bible area off in its settings. */
  bibleOn?: boolean;
  /** Members may send notices and prayer requests with photos. */
  memberPostsOn?: boolean;
  links: { give: string; bible: string };
}
interface Shift { id: string; duty: string; status: string; service: { name: string; startsAt: string } | null }
interface EventRow { id: string; title: string; startsAt: string; venue: string | null; capacity: number | null }
interface Reminder { id: string; kind: string; title: string; body: string; scheduledFor: string; readAt: string | null }
interface AssignedWelfare { id: string; category: string; status: string; amountRequestedMinor: number | null; createdAt: string; description: string | null; member: { firstName: string; lastName: string } | null }
interface MyPost { id: string; title: string; body: string; moderation: string; publishAt: string; photoDataUrl?: string | null }

type Tab = 'home' | 'giving' | 'shifts' | 'events' | 'prayer' | 'notices';

export default function PortalPage() {
  const [step, setStep] = useState<'phone' | 'code' | 'in'>('phone');
  const [slug, setSlug] = useState('demo');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [keep, setKeep] = useState(true);
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<Tab>('home');
  const [home, setHome] = useState<HomeData | null>(null);
  const [giving, setGiving] = useState<GiftRow[]>([]);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [prayerBody, setPrayerBody] = useState('');
  const [prayerPhoto, setPrayerPhoto] = useState<string | null>(null);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [unread, setUnread] = useState(0);
  const [paneOpen, setPaneOpen] = useState(false);
  const [assigned, setAssigned] = useState<AssignedWelfare[]>([]);
  const [checkinQr, setCheckinQr] = useState('');
  const [postForm, setPostForm] = useState({ title: '', body: '' });
  const [postPhoto, setPostPhoto] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Everything the companion shows, for one token. False when the token is dead. */
  async function loadAll(t: string): Promise<boolean> {
    const headers = { Authorization: `Bearer ${t}` };
    const first = await fetch(`${API}/portal/home`, { headers });
    if (!first.ok) return false;
    const h = (await first.json()) as HomeData;
    const [g, sh, ev, myPosts] = await Promise.all([
      fetch(`${API}/portal/my-giving`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/shifts`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/events`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/posts`, { headers }).then((r) => (r.ok ? r.json() : [])),
    ]);
    const [notes, help] = await Promise.all([
      fetch(`${API}/portal/notifications`, { headers }).then((r) => (r.ok ? r.json() : { items: [], unread: 0 })),
      fetch(`${API}/portal/welfare-assigned`, { headers }).then((r) => (r.ok ? r.json() : [])),
    ]);
    setHome(h); setGiving(g); setShifts(sh); setEvents(ev); setPosts(myPosts);
    setReminders(notes.items ?? []); setUnread(notes.unread ?? 0); setAssigned(help);
    // The door scans this: it carries this church's id plus the member number,
    // so a card printed here cannot be read as somebody else's down the road.
    if (h?.member?.memberNo && h?.church?.slug) {
      void QRCode.toDataURL(cardPayload(h.church.slug, h.member.memberNo), { width: 240, margin: 1, color: { dark: '#1f2a24', light: '#fffdf8' } })
        .then(setCheckinQr)
        .catch(() => setCheckinQr(''));
    }
    if (h?.church?.branding?.primaryColor) document.documentElement.style.setProperty('--brand', h.church.branding.primaryColor);
    return true;
  }

  // A kept session comes back on its own. A token the church has since revoked
  // (member deleted, secret rotated) lands on the sign-in form, not an error.
  useEffect(() => {
    const saved = readStoredToken();
    if (!saved) { setRestoring(false); return; }
    void loadAll(saved)
      .then((ok) => {
        if (ok) { setToken(saved); setStep('in'); }
        else forgetToken();
      })
      .catch(() => forgetToken())
      .finally(() => setRestoring(false));
    // Runs once: the stored token is the only input.
  }, []);

  async function requestOtp(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    await fetch(`${API}/portal/otp/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ churchSlug: slug, phoneE164: phone }),
    });
    setStep('code');
  }

  async function verify(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    const res = await fetch(`${API}/portal/otp/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ churchSlug: slug, phoneE164: phone, code }),
    });
    if (!res.ok) { setError('Invalid code'); return; }
    const { token: t } = (await res.json()) as { token: string };
    storeToken(t, keep);
    setToken(t);
    setNotice('');
    await loadAll(t);
    setStep('in');
  }

  async function loadStatement(): Promise<void> {
    const res = await fetch(`${API}/portal/statement?year=${year}`, { headers: auth() });
    if (!res.ok) { setError('Could not load the statement for that year.'); return; }
    const data = (await res.json()) as Statement;
    setStatement(data);
    setGiving(data.rows);
    setError('');
  }

  /**
   * The annual statement as a real PDF — the same dependency-free writer the
   * expense summary uses, so a member away from Ghana can download one file for
   * their records instead of printing a screen.
   */
  function downloadStatement(): void {
    if (!statement || statement.rows.length === 0) { setError('There is nothing to put in the statement yet.'); return; }
    const churchName = home?.church?.name ?? '';
    const who = home ? `${home.member.firstName} ${home.member.lastName}` : '';
    const lines = [
      { text: churchName ? `${churchName} - Statement of Giving` : 'Statement of Giving', bold: true, size: 16 },
      { text: `Year: ${statement.year}`, bold: true },
      ...(who ? [{ text: `Member: ${who}` }] : []),
      { text: `Total given: ${ghs(statement.totalMinor)}`, bold: true },
      { text: `Issued: ${new Date().toISOString().slice(0, 10)}` },
      { text: '' },
      ...statement.rows.map((g) => ({
        text: `${g.date ? g.date.slice(0, 10) : '-'}  ${g.fund}  ${ghs(g.amountMinor)}  ref ${g.reference}`,
      })),
      { text: '' },
      { text: `${statement.rows.length} gift(s). This statement is a record of what was given to the church's own funds.` },
    ];
    const file = new File([pdfBlob(lines)], `statement-${statement.year}.pdf`, { type: 'application/pdf' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Statement for ${statement.year} downloaded as a PDF.`);
  }

  async function rsvp(eventId: string, partySize = 1): Promise<void> {
    const res = await fetch(`${API}/portal/events/${eventId}/rsvp`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ partySize }),
    });
    const data = (await res.json()) as { status?: string };
    setNotice(data.status === 'WAITLIST' ? 'Event full — you are on the waitlist ✓' : 'RSVP confirmed ✓');
    setEvents(await fetch(`${API}/portal/events`, { headers: auth() }).then((r) => r.json()));
  }

  async function submitPrayer(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    const res = await fetch(`${API}/portal/prayer`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: prayerBody, anonymous, ...(prayerPhoto ? { photoDataUrl: prayerPhoto } : {}) }),
    });
    if (res.ok) {
      setPrayerBody(''); setPrayerPhoto(null);
      setNotice('Prayer request sent to the care team (appears on the wall after moderation) ✓');
    } else {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? 'Could not send the prayer request.');
    }
  }

  async function submitPost(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    const res = await fetch(`${API}/portal/posts`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...postForm, ...(postPhoto ? { photoDataUrl: postPhoto } : {}) }),
    });
    if (res.ok) {
      setPostForm({ title: '', body: '' }); setPostPhoto(null);
      setNotice('Notice sent to the church leaders. It appears to everybody once they approve it.');
      setPosts(await fetch(`${API}/portal/posts`, { headers: auth() }).then((r) => r.json()));
    } else {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? 'Could not send the notice.');
    }
  }

  async function respondShift(id: string, status: 'CONFIRMED' | 'DECLINED'): Promise<void> {
    await fetch(`${API}/portal/shifts/${id}/respond`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => undefined);
    setShifts(await fetch(`${API}/portal/shifts`, { headers: auth() }).then((r) => r.json()));
  }

  // export-my-data (Act 843): download everything the church holds about you.
  async function exportMyData(): Promise<void> {
    try {
      const res = await fetch(`${API}/portal/export`, { headers: auth() });
      if (!res.ok) throw new Error('export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chms-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice('Could not download your data — try again.');
    }
  }

  // The pane is the church's message board; a light poll keeps it current while
  // the app is open. (OS-level push still needs VAPID keys the church has not set.)
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      void fetch(`${API}/portal/notifications`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setReminders(d.items ?? []);
          setUnread(d.unread ?? 0);
        })
        .catch(() => undefined);
    }, 45_000);
    return () => clearInterval(id);
  }, [token]);

  async function openPane(): Promise<void> {
    setPaneOpen((open) => !open);
    if (paneOpen || unread === 0) return;
    await fetch(`${API}/portal/notifications/read`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => undefined);
    setUnread(0);
    setReminders((rows) => rows.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
  }

  async function signOut(): Promise<void> {
    forgetToken();
    setToken('');
    setStep('phone');
    setCode('');
    setHome(null);
    setGiving([]); setStatement(null); setShifts([]); setEvents([]);
    setTab('home');
    setNotice('Signed out on this phone.');
  }

  if (step !== 'in') {
    return (
      <div className="container" style={{ maxWidth: 420, paddingTop: '8vh' }}>
        <div className="card">
          <h1>Member companion</h1>
          {restoring ? (
            <p className="muted" style={{ marginBottom: 0 }}>Checking this phone for a saved sign-in…</p>
          ) : (
            <>
          <p className="muted">Sign in with the phone number you registered with your church.</p>
          {notice ? <p className="muted" style={{ marginTop: 0 }}>{notice}</p> : null}
          {step === 'phone' ? (
            <form className="stack" onSubmit={requestOtp}>
              <label>Church slug<input value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
              <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required /></label>
              {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
              <button>Send login code</button>
            </form>
          ) : (
            <form className="stack" onSubmit={verify}>
              <label>6-digit code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required /></label>
              <label className="row" style={{ alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={keep}
                  onChange={(e) => setKeep(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Keep me signed in on this phone
              </label>
              <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
                {keep
                  ? 'You will not need a new code the next time you open this page on this phone.'
                  : 'This phone signs out when you close the page.'}
              </p>
              {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
              <button>Sign in</button>
            </form>
          )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container portal-page" style={{ maxWidth: 640, paddingTop: '3.6rem' }}>
      <div className="card">
          <div className="spread" style={{ alignItems: 'center' }}>
            <h1 style={{ margin: 0 }}>
              {home?.church?.branding?.logoDataUrl ? (
                <img src={home.church.branding.logoDataUrl} alt="" style={{ height: 32, verticalAlign: 'middle', marginRight: 8 }} />
              ) : null}
              {home?.church?.name ?? 'Church'}
            </h1>
            <span className="row" style={{ alignItems: 'center', gap: 8 }}>
              <button className="small secondary" onClick={() => void openPane()} aria-label="Notifications">
                🔔{unread > 0 ? ` ${unread}` : ''}
              </button>
              <span className="badge mute">{home?.member?.memberNo}</span>
              <button className="small secondary" onClick={() => void signOut()}>Sign out</button>
            </span>
          </div>
        <p style={{ margin: '4px 0' }}>Welcome, <b>{home?.member?.firstName} {home?.member?.lastName}</b></p>
        <nav className="portal-tabs" aria-label="Member sections">
          {([...(['home', 'giving', 'shifts', 'events', 'prayer'] as Tab[]), ...(home?.memberPostsOn ? (['notices'] as Tab[]) : [])]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'on' : undefined}
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => setTab(t)}
            >
              {t === 'home' ? 'Home' : t === 'giving' ? 'Offerings' : t === 'shifts' ? 'Shifts' : t === 'events' ? 'Events' : t === 'notices' ? 'Notices' : 'Prayer'}
            </button>
          ))}
        </nav>
      </div>
      {paneOpen ? (
        <div className="card">
          <h2>Notifications</h2>
          {reminders.length === 0 ? <p className="muted">Nothing from the church yet.</p> : null}
          {reminders.map((r) => (
            <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="spread">
                <b>{r.title}</b>
                <span className="muted" style={{ fontSize: '0.78rem' }}>{fmtDateTime(r.scheduledFor)}</span>
              </div>
              <div className="muted">{r.body}</div>
            </div>
          ))}
        </div>
      ) : null}
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {/* The signed-in view had no error banner at all, so a failed statement or
          prayer simply looked like nothing had happened. */}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      {tab === 'home' ? (
        <div>
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Your check-in code</h2>
            {checkinQr ? (
              <img src={checkinQr} alt={`Check-in QR for ${home?.member?.memberNo ?? 'you'}`} style={{ width: '100%', maxWidth: 220 }} />
            ) : null}
            <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', letterSpacing: '0.1em' }}>{home?.member?.memberNo}</div>
            <p className="muted" style={{ marginBottom: 0, fontSize: '.85rem' }}>Show this at the door — the usher scans it or types the number.</p>
          </div>
          <div className="card">
            <h2>Upcoming services</h2>
            {home?.services.map((s) => (
              <div className="spread" key={s.id} style={{ padding: '4px 0' }}>
                <span><b>{s.name}</b></span>
                <span className="muted">{fmtDateTime(s.startsAt)}</span>
              </div>
            ))}
            {home && home.services.length === 0 ? <p className="muted">No upcoming services scheduled.</p> : null}
            <div className="row" style={{ marginTop: 8 }}>
              <a className="badge ok" href={home?.links.give}>Give an offering →</a>
              <a className="badge mute" href="/bible">Read the Bible →</a>
              <button className="small secondary" onClick={() => void exportMyData()}>Download my data</button>
            </div>
          </div>
          {assigned.length > 0 ? (
            <div className="card">
              <h2>Help you were asked to follow up</h2>
              {assigned.map((w) => (
                <div key={w.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="spread">
                    <b>{w.member ? `${w.member.firstName} ${w.member.lastName}` : 'A member'} — {w.category.toLowerCase()}</b>
                    <span className="badge warn">{w.status === 'SUBMITTED' ? 'Waiting' : 'Being looked at'}</span>
                  </div>
                  <div className="muted">{w.description ?? 'The situation could not be read.'}</div>
                  {w.amountRequestedMinor != null ? <div className="muted">{ghs(w.amountRequestedMinor)}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="card">
            <h2>Announcements</h2>
            {home?.announcements.map((a) => (
              <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <b>{a.title}</b>
                <div className="muted">{a.body}</div>
                {a.photoDataUrl ? (
                  <img src={a.photoDataUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 6 }} />
                ) : null}
              </div>
            ))}
            {home && home.announcements.length === 0 ? <p className="muted">Nothing new.</p> : null}
          </div>
          {home?.church?.givingInstructions && (home.church.givingInstructions.momoNumber || home.church.givingInstructions.bankAccount) ? (
            <div className="card">
              <h2>Other ways to give an offering</h2>
              {home.church.givingInstructions.momoNumber ? (
                <p style={{ margin: '4px 0' }}>
                  <strong>MoMo{home.church.givingInstructions.momoMerchant ? ` (${home.church.givingInstructions.momoMerchant})` : ''}:</strong>{' '}
                  {home.church.givingInstructions.momoNumber}
                  {home.church.givingInstructions.ussd ? ` · ${home.church.givingInstructions.ussd}` : ''}
                </p>
              ) : null}
              {home.church.givingInstructions.bankAccount ? (
                <p style={{ margin: '4px 0' }}>
                  <strong>Bank{home.church.givingInstructions.bankName ? ` — ${home.church.givingInstructions.bankName}` : ''}:</strong>{' '}
                  {home.church.givingInstructions.bankAccount}
                </p>
              ) : null}
              <p className="muted" style={{ marginBottom: 0 }}>Write your name and what the offering is for when you transfer.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'giving' ? (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>My offerings</h2>
            <div className="row">
              <input style={{ width: 70 }} value={year} onChange={(e) => setYear(e.target.value)} />
              <button className="small secondary" onClick={() => void loadStatement()}>Statement {year}</button>
              {statement && statement.year === Number(year) && statement.rows.length > 0 ? (
                <button className="small" onClick={downloadStatement}>Download PDF</button>
              ) : null}
              <button className="small secondary" onClick={() => window.print()}>Print</button>
            </div>
          </div>
          {statement ? (
            <p className="muted" style={{ fontSize: '.85rem' }}>
              {statement.rows.length} offering{statement.rows.length === 1 ? '' : 's'} in {statement.year}, total {ghs(statement.totalMinor)}.
            </p>
          ) : (
            <p className="muted" style={{ fontSize: '.85rem' }}>
              Choose a year and ask for the statement to see what you gave in it.
            </p>
          )}
          <table>
            <thead><tr><th>Date</th><th>What for</th><th>Amount</th><th>Ref</th></tr></thead>
            <tbody>
              {giving.map((g) => (
                <tr key={g.reference}>
                  <td>{g.date ? new Date(g.date).toLocaleDateString() : '—'}</td>
                  <td>{g.fund}</td>
                  <td>{ghs(g.amountMinor)}</td>
                  <td className="muted">{g.reference.slice(0, 14)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
          {giving.length === 0 ? <p className="muted">No offerings recorded yet.</p> : null}
        </div>
      ) : null}
      {tab === 'shifts' ? (
        <div className="card">
          <h2>My volunteer shifts</h2>
          {shifts.map((s) => (
            <div className="spread" key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <b>{s.duty}</b>
                <div className="muted">{s.service ? `${s.service.name} · ${fmtDateTime(s.service.startsAt)}` : 'Service TBD'}</div>
              </div>
              <div className="row">
                <span className={`badge ${s.status === 'CONFIRMED' ? 'ok' : s.status === 'DECLINED' ? 'err' : 'warn'}`}>{s.status}</span>
                {s.status === 'ASSIGNED' ? (
                  <>
                    <button className="small" onClick={() => void respondShift(s.id, 'CONFIRMED')}>YES</button>
                    <button className="small danger" onClick={() => void respondShift(s.id, 'DECLINED')}>NO</button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          {shifts.length === 0 ? <p className="muted">No shifts assigned — your leader can assign you from the staff app.</p> : null}
        </div>
      ) : null}

      {tab === 'events' ? (
        <div className="card">
          <h2>Events</h2>
          {events.map((ev) => (
            <div className="spread" key={ev.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <b>{ev.title}</b>
                <div className="muted">{fmtDateTime(ev.startsAt)}{ev.venue ? ` · ${ev.venue}` : ''}{ev.capacity ? ` · capacity ${ev.capacity}` : ''}</div>
              </div>
              <button className="small" onClick={() => void rsvp(ev.id)}>RSVP</button>
            </div>
          ))}
          {events.length === 0 ? <p className="muted">No upcoming events.</p> : null}
        </div>
      ) : null}

      {tab === 'notices' && home?.memberPostsOn ? (
        <div className="card">
          <h2>Send a notice</h2>
          <p className="muted">Funerals, outdooring, a church event — write it here. It goes to the church leaders, and everybody sees it once they approve it.</p>
          <form className="stack" onSubmit={submitPost}>
            <label>Title<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} maxLength={120} required /></label>
            <label>What should people know?<textarea value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })} maxLength={2000} required /></label>
            <label>
              Photo (optional)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) { setPostPhoto(null); return; }
                  void fileToPhotoDataUrl(f).then(setPostPhoto).catch((err: Error) => setError(err.message));
                }}
              />
            </label>
            {postPhoto ? <img src={postPhoto} alt="The photo you chose" style={{ maxWidth: '100%', borderRadius: 8 }} /> : null}
            <button>Send to the leaders</button>
          </form>
          <h2 style={{ marginTop: 16 }}>My notices</h2>
          {posts.length === 0 ? <p className="muted">You have not sent a notice yet.</p> : null}
          {posts.map((p) => (
            <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="spread">
                <b>{p.title}</b>
                <span className={`badge ${p.moderation === 'APPROVED' ? 'ok' : p.moderation === 'REJECTED' ? 'err' : 'warn'}`}>
                  {p.moderation === 'APPROVED' ? 'Approved' : p.moderation === 'REJECTED' ? 'Not approved' : 'Waiting for a leader'}
                </span>
              </div>
              <div className="muted">{p.body}</div>
              {p.photoDataUrl ? <img src={p.photoDataUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 6 }} /> : null}
            </div>
          ))}
        </div>
      ) : null}
      {tab === 'prayer' ? (
        <div className="card">
          <h2>Prayer request</h2>
          <form className="stack" onSubmit={submitPrayer}>
            <textarea value={prayerBody} onChange={(e) => setPrayerBody(e.target.value)} placeholder="How can we pray for you?" required />
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Submit anonymously
            </label>
            {home?.memberPostsOn ? (
              <>
                <label>
                  Photo (optional)
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) { setPrayerPhoto(null); return; }
                      void fileToPhotoDataUrl(f).then(setPrayerPhoto).catch((err: Error) => setError(err.message));
                    }}
                  />
                </label>
                {prayerPhoto ? <img src={prayerPhoto} alt="The photo you chose" style={{ maxWidth: '100%', borderRadius: 8 }} /> : null}
              </>
            ) : null}
            <button>Send to care team</button>
          </form>
          <p className="muted">Requests are reviewed before appearing on the church wall. Replies arrive by SMS.</p>
        </div>
      ) : null}

      <BibleDock token={token} on={home?.bibleOn !== false} />
    </div>
  );
}
