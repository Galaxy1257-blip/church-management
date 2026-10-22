'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

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

  useEffect(() => {
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
    await checkIn({ qrToken: qrToken.trim(), method: 'QR' });
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
      {error ? <div className="error">{error}</div> : null}

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
          <h2>Scan QR token</h2>
          <form className="stack" onSubmit={onQr}>
            <input value={qrToken} onChange={(e) => setQrToken(e.target.value)} placeholder="paste scanned token" />
            <button>Check in</button>
          </form>
          <p className="muted">Camera scanning ships with the mobile build; paste the member&apos;s token here.</p>
        </div>
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
