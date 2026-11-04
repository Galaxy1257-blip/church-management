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

interface CheckInResult {
  alreadyCheckedIn: boolean;
  attendance: { id: string; checkedInAt: string };
  section?: string | null;
}

export default function CheckinPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [query, setQuery] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [checkedIn, setCheckedIn] = useState<string[]>([]);
  // Newcomers add themselves with this: the door shows it, they scan and join.
  const [join, setJoin] = useState<{ enabled: boolean; code: string; slug: string } | null>(null);
  const [joinQr, setJoinQr] = useState('');

  useEffect(() => {
    void api<{ enabled: boolean; code: string; slug: string }>('/churches/me/join-link')
      .then(async (j) => {
        setJoin(j);
        if (j.enabled && j.slug) {
          setJoinQr(await QRCode.toDataURL(`${window.location.origin}/join/${j.slug}`, { width: 260, margin: 1 }));
        }
      })
      .catch(() => undefined);
    void api<Service[]>('/services')
      .then((list) => {
        setServices(list);
        const active = list.find((s) => s.status === 'OPEN') ?? list[0];
        if (active) setServiceId(active.id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function checkIn(body: Record<string, unknown>): Promise<void> {
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
        setCheckedIn((prev) => [...prev, String(body.memberId ?? body.phoneE164 ?? body.qrToken ?? '')]);
      }
      setError('');
    } catch (e) {
      setNotice('');
      setError(e instanceof Error ? e.message : 'check-in failed');
    }
  }

  async function onSearch(e: FormEvent): Promise<void> {
    e.preventDefault();
    await checkIn({ phoneE164: query, method: 'PHONE_LOOKUP' });
    setQuery('');
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
      </div>

      {notice ? (
        <div className="card" style={{ borderColor: 'var(--accent)', fontSize: '1.2rem', textAlign: 'center' }}>
          {notice}
        </div>
      ) : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="grid cols-2">
        <div className="card">
          <h2>Find by phone</h2>
          <form className="stack" onSubmit={onSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="0241234567"
              inputMode="tel"
            />
            <button>Check in</button>
          </form>
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
