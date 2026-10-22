'use client';
// Member companion: OTP login (member phone, no staff account) with tabs —
// Home, My giving + statement, Volunteer shifts, Events/RSVP, Prayer.
import { FormEvent, useState } from 'react';
import { fmtDateTime, ghs } from '../../lib/format';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface GiftRow { date: string | null; fund: string; amountMinor: number; reference: string; channel: string | null }
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
  const [tab, setTab] = useState<Tab>('home');
  const [home, setHome] = useState<HomeData | null>(null);
  const [giving, setGiving] = useState<GiftRow[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [prayerBody, setPrayerBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const auth = () => ({ Authorization: `Bearer ${token}` });

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
    setToken(t);
    const headers = { Authorization: `Bearer ${t}` };
    const [h, g, sh, ev] = await Promise.all([
      fetch(`${API}/portal/home`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/my-giving`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/shifts`, { headers }).then((r) => r.json()),
      fetch(`${API}/portal/events`, { headers }).then((r) => r.json()),
    ]);
    setHome(h); setGiving(g); setShifts(sh); setEvents(ev);
    if (h?.church?.branding?.primaryColor) document.documentElement.style.setProperty('--brand', h.church.branding.primaryColor);
    setStep('in');
  }

  async function loadStatement(): Promise<void> {
    const res = await fetch(`${API}/portal/statement?year=${year}`, { headers: auth() });
    const data = (await res.json()) as { rows: GiftRow[]; totalMinor: number };
    setGiving(data.rows);
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

  if (step !== 'in') {
    return (
      <div className="container" style={{ maxWidth: 420, paddingTop: '8vh' }}>
        <div className="card">
          <h1>Member companion</h1>
          <p className="muted">Sign in with the phone number you registered with your church.</p>
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
              {error ? <div className="error">{error}</div> : null}
              <button>Sign in</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 640, paddingTop: '3vh' }}>
      <div className="card">
          <div className="spread" style={{ alignItems: 'center' }}>
            <h1 style={{ margin: 0 }}>
              {home?.church?.branding?.logoDataUrl ? (
                <img src={home.church.branding.logoDataUrl} alt="" style={{ height: 32, verticalAlign: 'middle', marginRight: 8 }} />
              ) : null}
              {home?.church?.name ?? 'Church'}
            </h1>
            <span className="badge mute">{home?.member?.memberNo}</span>
          </div>
        <p style={{ margin: '4px 0' }}>Welcome, <b>{home?.member?.firstName} {home?.member?.lastName}</b></p>
        <div className="row">
          {(['home', 'giving', 'shifts', 'events', 'prayer'] as Tab[]).map((t) => (
            <button key={t} className={`small ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>
              {t === 'home' ? 'Home' : t === 'giving' ? 'My giving' : t === 'shifts' ? 'My shifts' : t === 'events' ? 'Events' : 'Prayer'}
            </button>
          ))}
        </div>
      </div>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
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
              <a className="badge ok" href={home?.links.give}>Give online →</a>
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
              <h2>Ways to give</h2>
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
              <p className="muted" style={{ marginBottom: 0 }}>Add your name + fund as the narrative when you transfer.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'giving' ? (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>My giving</h2>
            <div className="row">
              <input style={{ width: 70 }} value={year} onChange={(e) => setYear(e.target.value)} />
              <button className="small secondary" onClick={() => void loadStatement()}>Statement {year}</button>
              <button className="small secondary" onClick={() => window.print()}>Print</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Fund</th><th>Amount</th><th>Ref</th></tr></thead>
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
          {giving.length === 0 ? <p className="muted">No gifts recorded yet.</p> : null}
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


    </div>
  );
}
