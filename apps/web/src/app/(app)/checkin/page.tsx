'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import Notice from '../../../components/notice';
import QRCode from 'qrcode';

interface Service {
  id: string;
  name: string;
  startsAt: string;
  status: string;
}

interface DoorSetup {
  currentId: string | null;
  services: Service[];
  counted: number;
  segments: { segmentKey: string; label: string; net: number }[];
}

interface Found {
  id: string;
  firstName: string;
  lastName: string;
  memberNo: string;
  phoneE164: string | null;
  checkedIn: boolean;
}

interface CheckInResult {
  alreadyCheckedIn: boolean;
  attendance: { id: string; checkedInAt: string };
  section?: string | null;
}

export default function CheckinPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [counted, setCounted] = useState(0);
  const [segments, setSegments] = useState<{ segmentKey: string; label: string; net: number }[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [checkedIn, setCheckedIn] = useState<string[]>([]);
  // Newcomers add themselves with this: the door shows it, they scan and join.
  const [join, setJoin] = useState<{ enabled: boolean; code: string; slug: string } | null>(null);
  const [joinQr, setJoinQr] = useState('');

  // The Sunday to work, and how many are already in — one call, refreshed after
  // every check-in so the number at the top of the screen is the room.
  async function loadCount(): Promise<void> {
    const setup = await api<DoorSetup>('/checkin/setup');
    setCounted(setup.counted);
    setSegments(setup.segments.filter((s) => s.net > 0));
  }

  useEffect(() => {
    void api<{ enabled: boolean; code: string; slug: string }>('/churches/me/join-link')
      .then(async (j) => {
        setJoin(j);
        if (j.enabled && j.slug) {
          setJoinQr(await QRCode.toDataURL(`${window.location.origin}/join/${j.slug}`, { width: 260, margin: 1 }));
        }
      })
      .catch(() => undefined);
    // The door reads its own service list, so this page still works when the
    // church has switched the Services section off.
    void api<DoorSetup>('/checkin/setup')
      .then((setup) => {
        setServices(setup.services);
        setCounted(setup.counted);
        setSegments(setup.segments.filter((s) => s.net > 0));
        if (setup.currentId) setServiceId(setup.currentId);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function checkIn(body: Record<string, unknown>, who = ''): Promise<void> {
    if (!serviceId) {
      setError('choose a service first');
      return;
    }
    try {
      const res = await api<CheckInResult>('/checkin', { method: 'POST', body: { serviceId, ...body } });
      if (res.alreadyCheckedIn) {
        setNotice('Already checked in (duplicate ignored)');
      } else {
        setNotice(res.section ? `Checked in ✓ — counted in ${res.section}` : 'Checked in ✓');
        setCheckedIn((prev) => [...prev, who || String(body.code ?? '')]);
      }
      setError('');
      // Only the person just checked in — the others on the list are still outside.
      if (body.memberId) {
        const done = String(body.memberId);
        setFound((prev) => (prev ? prev.map((m) => (m.id === done ? { ...m, checkedIn: true } : m)) : prev));
      }
      void loadCount().catch(() => undefined);
    } catch (e) {
      setNotice('');
      setError(e instanceof Error ? e.message : 'check-in failed');
    }
  }

  async function onSearch(e: FormEvent): Promise<void> {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    try {
      // One box: a name, the member number or the phone number.
      const q = encodeURIComponent(term);
      const inService = serviceId ? `&serviceId=${encodeURIComponent(serviceId)}` : '';
      setFound(await api<Found[]>(`/checkin/find?q=${q}${inService}`));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'search failed');
    }
  }

  async function onQr(e: FormEvent): Promise<void> {
    e.preventDefault();
    // The same box takes a scanned card or the member number typed at the door.
    await checkIn({ code: qrToken.trim(), method: 'QR' });
    setQrToken('');
  }

  return (
    <div>
      <h1>Check-in</h1>
      <div className="card">
        <label>
          Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">— choose —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </label>
        <p style={{ fontSize: '1.6rem', margin: '0.6rem 0 0' }}>
          <strong>{counted}</strong> <span className="muted">in the room</span>
        </p>
        {segments.length ? (
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>
            {segments.map((s) => `${s.label} ${s.net}`).join(' · ')}
          </p>
        ) : null}
      </div>

      {notice ? (
        <div className="card" style={{ borderColor: 'var(--accent)', fontSize: '1.2rem', textAlign: 'center' }}>
          {notice}
        </div>
      ) : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="grid cols-2">
        <div className="card">
          <h2>Help someone check in</h2>
          <form className="stack" onSubmit={onSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="name, member number or phone"
              inputMode="search"
            />
            <button>Find</button>
          </form>
          {found ? (
            found.length ? (
              <table>
                <thead>
                  <tr><th>Who</th><th>Number</th><th></th></tr>
                </thead>
                <tbody>
                  {found.map((m) => (
                    <tr key={m.id}>
                      <td>{m.firstName} {m.lastName}</td>
                      <td className="muted">{m.memberNo}</td>
                      <td>
                        {m.checkedIn ? (
                          <span className="muted">In already</span>
                        ) : (
                          <button onClick={() => void checkIn({ memberId: m.id, method: 'MANUAL' }, `${m.firstName} ${m.lastName}`)}>
                            Check in
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Nobody on the list matches that. Ask for another spelling or their phone number.</p>
            )
          ) : null}
        </div>
        <div className="card">
          <h2>Card or code</h2>
          <form className="stack" onSubmit={onQr}>
            <input value={qrToken} onChange={(e) => setQrToken(e.target.value)} placeholder="member number, phone, or scanned card" />
            <button>Check in</button>
          </form>
          <p className="muted">Type the member number from the door, or scan the card if this phone has a camera scanner.</p>
        </div>
        {join?.enabled ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>New here?</h2>
            <p className="muted">Show them this QR — they scan it, type the code once, and they are on the church list.</p>
            {joinQr ? <img src={joinQr} alt="QR code to join this church" style={{ width: '100%', maxWidth: 240 }} /> : null}
            <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', letterSpacing: '0.12em' }}>{join.code}</div>
          </div>
        ) : null}
      </div>

      {checkedIn.length > 0 ? (
        <div className="card">
          <h2>This session ({checkedIn.length})</h2>
          <ul>
            {checkedIn.map((c, i) => (
              <li key={`${c}-${i}`}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
