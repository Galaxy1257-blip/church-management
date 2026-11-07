'use client';
// Member companion: OTP login (member phone, no staff account) with tabs —
// Home, My giving + statement, Volunteer shifts, Events/RSVP, Prayer.
import { FormEvent, useEffect, useState } from 'react';
import { fmtDate, fmtDateTime, ghs } from '../../lib/format';
import type { PdfBlock, PdfDoc } from '../../lib/pdf';
import { buildPdfFile, saveFile } from '../../lib/share';
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
/** GET /portal/export — everything the church holds about this one person. */
interface MyData {
  exportedAt: string;
  member: Record<string, string | number | boolean | null>;
  attendance: Array<{ checkedInAt: string; method: string }>;
  transactions: Array<{ reference: string; giftMinor: number; status: string; createdAt: string }>;
  groups: Array<{ groupId: string }>;
  prayerRequests: Array<{ body: string; isAnonymous: boolean; createdAt: string }>;
  pastoralActions: Array<{ type: string; actionDate: string | null; note: string | null }>;
}

/**
 * The field names a database uses are not the words a person reads. Anything not
 * listed still prints, with the underscore turned into a space, so a column
 * added later is never silently missing from somebody's legal copy of their data.
 */
const MY_DATA_LABELS: Record<string, string> = {
  firstName: 'First name', lastName: 'Last name', phoneE164: 'Phone', memberNo: 'Member number',
  email: 'Email', birthDate: 'Date of birth', gender: 'Gender', address: 'Address',
  occupation: 'Occupation', maritalStatus: 'Marital status', savedAt: 'Born again',
  baptizedAt: 'Baptised', joinedAt: 'Joined', status: 'Status', note: 'Note',
};

/** One stored field as a label and a readable value, or nothing if it is internal. */
function myDataField(key: string, value: unknown): { label: string; value: string } | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object' || typeof value === 'function') return null;
  if (key === 'id' || key.endsWith('Id') || key === 'photoUrl' || key === 'photoDataUrl') return null;
  if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) return null;
  const words = MY_DATA_LABELS[key] ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  const label = words[0].toUpperCase() + words.slice(1);
  if (typeof value === 'boolean') return { label, value: value ? 'Yes' : 'No' };
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { label, value: fmtDate(value) };
  if (typeof value === 'string' && value.startsWith('data:image')) return null;
  return { label, value: String(value) };
}

/**
 * A person's own data as one readable document: what the church holds about
 * them, in the four groups the Act asks about — who they are, where they were
 * counted, what they gave, and what was prayed or done for them.
 */
function myDataDoc(data: MyData): PdfDoc {
  const personal = Object.entries(data.member ?? {})
    .map(([key, value]) => myDataField(key, value))
    .filter((row): row is { label: string; value: string } => row !== null);
  const blocks: PdfBlock[] = [
    { kind: 'heading', text: 'Who you are on the book' },
    { kind: 'fields', rows: personal.length ? personal : [{ label: 'Record', value: 'No personal fields were returned.' }] },
    {
      kind: 'heading',
      text: 'Attendance',
      spaceBefore: 12,
    },
    {
      kind: 'table',
      columns: [{ label: 'When', grow: 2 }, { label: 'How it was recorded', grow: 3 }],
      rows: (data.attendance ?? []).map((a) => [fmtDateTime(a.checkedInAt), a.method]),
    },
    { kind: 'heading', text: 'What you gave', spaceBefore: 12 },
    {
      kind: 'table',
      columns: [
        { label: 'When', grow: 1.6 },
        { label: 'Reference', grow: 2 },
        { label: 'Amount', grow: 1.4, align: 'right' },
        { label: 'Status', grow: 1.4 },
      ],
      rows: (data.transactions ?? []).map((t) => [fmtDate(t.createdAt), t.reference, ghs(t.giftMinor), t.status]),
    },
    { kind: 'heading', text: 'Prayer requests you sent', spaceBefore: 12 },
    {
      kind: 'table',
      columns: [{ label: 'When', grow: 1.4 }, { label: 'What you wrote', grow: 5 }],
      rows: (data.prayerRequests ?? []).map((p) => [fmtDate(p.createdAt), p.isAnonymous ? 'Sent without your name on it' : p.body]),
    },
    { kind: 'heading', text: 'Pastoral care recorded', spaceBefore: 12 },
    {
      kind: 'table',
      columns: [{ label: 'When', grow: 1.4 }, { label: 'What', grow: 2 }, { label: 'Note', grow: 4 }],
      rows: (data.pastoralActions ?? []).map((a) => [a.actionDate ? fmtDate(a.actionDate) : '-', a.type, a.note ?? '']),
    },
    {
      kind: 'text',
      muted: true,
      size: 9,
      spaceBefore: 14,
      text:
        `You are listed in ${(data.groups ?? []).length} class or ministry group(s). ` +
        'This is everything the app holds about you as well as the full file in JSON form. To have any of it corrected or removed, ask your church office.',
    },
  ];
  return {
    title: 'My personal data',
    subtitle: `Prepared for your Act 843 request · ${fmtDateTime(data.exportedAt)}`,
    blocks,
    footnote: 'A copy of the personal data a church app holds about you.',
  };
}


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
  const [confirmErase, setConfirmErase] = useState(false);
  const [erasing, setErasing] = useState(false);

  const auth = () => ({ Authorization: `Bearer ${token}` });

  // The person's own erasure right (Privacy Policy §5). Two taps so a stray
  // click cannot delete a life's record; the server anonymises, it does not
  // pretend: amounts stay in the church's books without the name.
  async function eraseAccount(): Promise<void> {
    setErasing(true);
    try {
      const res = await fetch(`${API}/auth/me`, { method: 'DELETE', headers: auth() });
      if (!res.ok) {
        setError('Could not delete your account. Ask the church office, or write to app.omnilabs.dev@gmail.com.');
        setConfirmErase(false);
        return;
      }
      forgetToken();
      setToken('');
      setHome(null);
      setConfirmErase(false);
      setStep('phone');
      setNotice('Your account and personal data have been deleted.');
    } catch {
      setError('Could not reach the server. Try again, or write to app.omnilabs.dev@gmail.com.');
    } finally {
      setErasing(false);
    }
  }

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
   * The annual statement as a real PDF — the same writer the expense summary
   * uses, so a member away from Ghana can download one file for their records
   * instead of printing a screen.
   */
  function statementDoc(s: Statement): PdfDoc {
    const contact = home?.church?.contact;
    const where = [contact?.phone, contact?.address].filter(Boolean).join(' · ');
    return {
      title: 'Statement of Giving',
      subtitle: home ? `${home.member.firstName} ${home.member.lastName} · ${s.year}` : `Year ${s.year}`,
      blocks: [
        {
          kind: 'fields',
          rows: [
            { label: 'Year', value: String(s.year) },
            { label: 'Total given', value: ghs(s.totalMinor), bold: true },
            { label: 'Number of offerings', value: String(s.rows.length) },
            { label: 'Issued', value: fmtDate(new Date()) },
          ],
        },
        {
          kind: 'table',
          spaceBefore: 8,
          columns: [
            { label: 'Date', grow: 1.4 },
            { label: 'What for', grow: 2.6 },
            { label: 'Amount', grow: 1.6, align: 'right' },
            { label: 'Reference', grow: 2 },
          ],
          rows: s.rows.map((g) => [g.date ? fmtDate(g.date) : '-', g.fund, ghs(g.amountMinor), g.reference]),
        },
        {
          kind: 'text',
          muted: true,
          size: 9,
          spaceBefore: 14,
          text: "This statement is a record of what was given to the church's own funds.",
        },
      ],
      footnote: where || undefined,
    };
  }

  async function downloadStatement(): Promise<void> {
    if (!statement || statement.rows.length === 0) { setError('There is nothing to put in the statement yet.'); return; }
    try {
      const file = await buildPdfFile(home?.church, statementDoc(statement), `statement-${statement.year}.pdf`);
      saveFile(file);
      setNotice(`Statement for ${statement.year} downloaded as a PDF.`);
    } catch {
      setError('Could not build the statement PDF.');
    }
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
  // The JSON is the legal copy — it holds every field exactly as stored — and
  // the PDF beside it is the copy a person can actually read.
  async function loadMyData(): Promise<MyData> {
    const res = await fetch(`${API}/portal/export`, { headers: auth() });
    if (!res.ok) throw new Error('export failed');
    return (await res.json()) as MyData;
  }

  async function exportMyData(): Promise<void> {
    try {
      const data = await loadMyData();
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

  async function printMyData(): Promise<void> {
    try {
      const data = await loadMyData();
      const file = await buildPdfFile(home?.church, myDataDoc(data), `chms-my-data-${new Date().toISOString().slice(0, 10)}.pdf`);
      saveFile(file);
      setNotice('A readable copy of your data downloaded as a PDF. The button next to it gives the full machine-readable file.');
    } catch {
      setNotice('Could not build the readable copy — try again.');
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
              <button className="small secondary" onClick={() => void printMyData()}>Readable copy</button>
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
          <div className="card">
            <h2>My account</h2>
            <p className="muted">
              You can delete your account and personal data at any time. Your name, phone, photo and care notes are
              removed; offering amounts stay in the church&rsquo;s books without your name, as the law requires.{' '}
              <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            </p>
            {confirmErase ? (
              <div className="row">
                <button type="button" className="danger" disabled={erasing} onClick={() => void eraseAccount()}>
                  {erasing ? 'Deleting…' : 'Yes, delete my account and data'}
                </button>
                <button type="button" className="secondary" disabled={erasing} onClick={() => setConfirmErase(false)}>
                  Keep my account
                </button>
              </div>
            ) : (
              <button type="button" className="secondary" onClick={() => setConfirmErase(true)}>
                Delete my account and data
              </button>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'giving' ? (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>My offerings</h2>
            <div className="row">
              <input aria-label="Statement year" style={{ width: 70 }} value={year} onChange={(e) => setYear(e.target.value)} />
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
            <textarea aria-label="Prayer request" value={prayerBody} onChange={(e) => setPrayerBody(e.target.value)} placeholder="How can we pray for you?" required />
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
