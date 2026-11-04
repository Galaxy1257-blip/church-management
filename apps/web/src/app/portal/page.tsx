'use client';
// Member companion: OTP login (member phone, no staff account) with tabs —
// Home, My giving + statement, Volunteer shifts, Events/RSVP, Prayer.
import { FormEvent, useEffect, useState } from 'react';
import { fmtDateTime, ghs } from '../../lib/format';
import { pdfBlob } from '../../lib/pdf';
import BibleDock from '../../components/bible-dock';

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
  announcements: { id: string; title: string; body: string; publishAt: string }[];
  /** False when the church switched the Bible area off in its settings. */
  bibleOn?: boolean;
  links: { give: string; bible: string };
}
interface Shift { id: string; duty: string; status: string; service: { name: string; startsAt: string } | null }
interface EventRow { id: string; title: string; startsAt: string; venue: string | null; capacity: number | null }

type Tab = 'home' | 'giving' | 'shifts' | 'events' | 'prayer';

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
    const [g, sh, ev] = await Promise.all([
      fetch(`${API}/portal/my-giving`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/shifts`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/events`, { headers }).then((r) => r.json()),
    ]);
    setHome(h); setGiving(g); setShifts(sh); setEvents(ev);
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
    const res = await fetch(`${API}/portal/prayer`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: prayerBody, anonymous }),
    });
    if (res.ok) {
      setPrayerBody('');
      setNotice('Prayer request sent to the care team (appears on the wall after moderation) ✓');
    }
  }

  async function respondShift(id: string, status: 'CONFIRMED' | 'DECLINED'): Promise<void> {
    await fetch(`${API}/portal/shifts/${id}/respond`, {
      method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => undefined);
    setShifts(await fetch(`${API}/portal/shifts`, { headers: auth() }).then((r) => r.json()));
  }

  // R4.11 export-my-data (Act 843): download everything the church holds about you.
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
              {error ? <div className="error">{error}</div> : null}
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
              {error ? <div className="error">{error}</div> : null}
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
              <span className="badge mute">{home?.member?.memberNo}</span>
              <button className="small secondary" onClick={() => void signOut()}>Sign out</button>
            </span>
          </div>
        <p style={{ margin: '4px 0' }}>Welcome, <b>{home?.member?.firstName} {home?.member?.lastName}</b></p>
        <nav className="portal-tabs" aria-label="Member sections">
          {(['home', 'giving', 'shifts', 'events', 'prayer'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'on' : undefined}
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => setTab(t)}
            >
              {t === 'home' ? 'Home' : t === 'giving' ? 'Offerings' : t === 'shifts' ? 'Shifts' : t === 'events' ? 'Events' : 'Prayer'}
            </button>
          ))}
        </nav>
      </div>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {/* The signed-in view had no error banner at all, so a failed statement or
          prayer simply looked like nothing had happened. */}
      {error ? <div className="error">{error}</div> : null}
      {tab === 'home' ? (
        <div>
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
          <div className="card">
            <h2>Announcements</h2>
            {home?.announcements.map((a) => (
              <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <b>{a.title}</b>
                <div className="muted">{a.body}</div>
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

      {tab === 'prayer' ? (
        <div className="card">
          <h2>Prayer request</h2>
          <form className="stack" onSubmit={submitPrayer}>
            <textarea value={prayerBody} onChange={(e) => setPrayerBody(e.target.value)} placeholder="How can we pray for you?" required />
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Submit anonymously
            </label>
            <button>Send to care team</button>
          </form>
          <p className="muted">Requests are reviewed before appearing on the church wall. Replies arrive by SMS.</p>
        </div>
      ) : null}

      <BibleDock token={token} on={home?.bibleOn !== false} />
    </div>
  );
}
