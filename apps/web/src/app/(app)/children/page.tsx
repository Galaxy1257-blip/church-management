'use client';
// Children's security check-in: dual ticket (tag + guardian pickup code).
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Active { id: string; childId: string; tagNo: string; checkedInAt: string }
interface Service { id: string; name: string; status: string }

export default function ChildrenPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [active, setActive] = useState<Active[]>([]);
  const [form, setForm] = useState({ childId: '', guardianId: '' });
  const [checkout, setCheckout] = useState({ childId: '', code: '' });
  const [ticket, setTicket] = useState<{ tagNo: string; pickupCode: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api<Service[]>('/services').then((s) => {
      setServices(s);
      const open = s.find((x) => x.status === 'OPEN') ?? s[0];
      if (open) setServiceId(open.id);
    });
  }, []);
  useEffect(() => {
    if (serviceId) void api<Active[]>(`/children/active?serviceId=${serviceId}`).then(setActive).catch(() => undefined);
  }, [serviceId]);

  async function checkIn(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const res = await api<{ tagNo: string; pickupCode: string }>('/children/checkin', { method: 'POST', body: { serviceId, ...form } });
      setTicket(res); setForm({ childId: '', guardianId: '' });
      setActive(await api<Active[]>(`/children/active?serviceId=${serviceId}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function checkOut(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/children/checkout', { method: 'POST', body: { serviceId, childId: checkout.childId, code: checkout.code } });
      setCheckout({ childId: '', code: '' });
      setActive(await api<Active[]>(`/children/active?serviceId=${serviceId}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Children&apos;s check-in</h1>
      {error ? <div className="error">{error}</div> : null}
      <div className="card">
        <label>Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
          </select>
        </label>
      </div>
      {ticket ? (
        <div className="card" style={{ borderColor: 'var(--accent)', textAlign: 'center' }}>
          <h2>🎫 Dual ticket issued</h2>
          <div className="grid cols-2">
            <div><div className="muted">Child tag (keep)</div><div style={{ fontSize: 28, fontWeight: 800 }}>{ticket.tagNo}</div></div>
            <div><div className="muted">Guardian pickup code (keep secret)</div><div style={{ fontSize: 28, fontWeight: 800, color: 'var(--danger)' }}>{ticket.pickupCode}</div></div>
          </div>
          <p className="muted">Show the code only at pickup. 5 wrong attempts locks checkout.</p>
        </div>
      ) : null}
      <div className="grid cols-2">
        <div className="card">
          <h2>Drop off</h2>
          <form className="stack" onSubmit={checkIn}>
            <input placeholder="Child member ID" value={form.childId} onChange={(e) => setForm({ ...form, childId: e.target.value })} required />
            <input placeholder="Guardian member ID (authorised pickup)" value={form.guardianId} onChange={(e) => setForm({ ...form, guardianId: e.target.value })} required />
            <button>Check in child</button>
          </form>
        </div>
        <div className="card">
          <h2>Pick up</h2>
          <form className="stack" onSubmit={checkOut}>
            <input placeholder="Child member ID" value={checkout.childId} onChange={(e) => setCheckout({ ...checkout, childId: e.target.value })} required />
            <input placeholder="6-digit pickup code" value={checkout.code} onChange={(e) => setCheckout({ ...checkout, code: e.target.value })} required inputMode="numeric" />
            <button className="danger">Release child</button>
          </form>
        </div>
      </div>
      <div className="card">
        <h2>Currently checked in ({active.length})</h2>
        <table><thead><tr><th>Tag</th><th>Child ID</th><th>Since</th></tr></thead><tbody>
          {active.map((a) => <tr key={a.id}><td><b>{a.tagNo}</b></td><td className="muted">{a.childId.slice(0, 8)}…</td><td>{new Date(a.checkedInAt).toLocaleTimeString()}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}
