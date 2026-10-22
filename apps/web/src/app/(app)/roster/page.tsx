'use client';
// Volunteer roster: assign shifts per service, confirm/decline.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Shift { id: string; serviceId: string; memberId: string; duty: string; status: string }
interface Service { id: string; name: string; startsAt: string }

export default function RosterPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [form, setForm] = useState({ memberId: '', duty: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void api<Service[]>('/services').then((s) => {
      setServices(s);
      if (s[0]) setServiceId(s[0].id);
    });
  }, []);
  useEffect(() => {
    if (serviceId) void api<Shift[]>(`/roster?serviceId=${serviceId}`).then(setShifts).catch(() => undefined);
  }, [serviceId]);

  async function assign(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/roster', { method: 'POST', body: { serviceId, ...form } });
      setNotice('Shift assigned');
      setForm({ memberId: '', duty: '' });
      setShifts(await api<Shift[]>(`/roster?serviceId=${serviceId}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function respond(id: string, status: 'CONFIRMED' | 'DECLINED'): Promise<void> {
    try {
      await api(`/roster/${id}/respond`, { method: 'POST', body: { status } });
      setShifts(await api<Shift[]>(`/roster?serviceId=${serviceId}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Volunteer roster</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="card">
        <label>Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {new Date(s.startsAt).toLocaleDateString()}</option>)}
          </select>
        </label>
        <form className="row" onSubmit={assign}>
          <input placeholder="Member ID" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} required style={{ flex: 1 }} />
          <input placeholder="Duty (e.g. Ushering)" value={form.duty} onChange={(e) => setForm({ ...form, duty: e.target.value })} required style={{ flex: 1 }} />
          <button>Assign</button>
        </form>
      </div>
      <div className="card">
        <h2>Shifts</h2>
        <table><thead><tr><th>Duty</th><th>Member</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {shifts.map((s) => (
            <tr key={s.id}>
              <td>{s.duty}</td>
              <td className="muted">{s.memberId.slice(0, 8)}…</td>
              <td><span className={`badge ${s.status === 'CONFIRMED' ? 'ok' : s.status === 'DECLINED' ? 'err' : 'warn'}`}>{s.status}</span></td>
              <td className="row">
                <button className="sm" onClick={() => void respond(s.id, 'CONFIRMED')}>YES</button>
                <button className="sm danger" onClick={() => void respond(s.id, 'DECLINED')}>NO</button>
              </td>
            </tr>
          ))}
        </tbody></table>
        {shifts.length === 0 ? <p className="muted">No shifts for this service.</p> : null}
      </div>
    </div>
  );
}
