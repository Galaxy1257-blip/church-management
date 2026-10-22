'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate } from '../../../lib/format';

interface Visitor {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string;
  status: string;
  visitCount: number;
  createdAt: string;
}

interface Service {
  id: string;
  name: string;
  status: string;
}

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', phoneE164: '', firstServiceId: '' });

  async function load(filter: string): Promise<void> {
    try {
      setVisitors(await api<Visitor[]>(`/visitors${filter ? `?status=${filter}` : ''}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }

  useEffect(() => {
    void load(status);
    void api<Service[]>('/services').then(setServices).catch(() => undefined);
  }, [status]);

  async function register(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const res = await api<{ visitor: Visitor; isNew: boolean }>('/visitors/register', {
        method: 'POST',
        body: {
          firstName: form.firstName,
          lastName: form.lastName || undefined,
          phoneE164: form.phoneE164,
          firstServiceId: form.firstServiceId || undefined,
        },
      });
      setNotice(res.isNew ? `Welcome, ${res.visitor.firstName} — enrolled in follow-up` : `${res.visitor.firstName} has visited ${res.visitor.visitCount} times`);
      setForm({ firstName: '', lastName: '', phoneE164: '', firstServiceId: '' });
      await load(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'registration failed');
    }
  }

  return (
    <div>
      <h1>Visitors</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <h2>Register a visitor</h2>
        <form className="stack" onSubmit={register}>
          <div className="row">
            <label style={{ flex: 1 }}>
              First name
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </label>
            <label style={{ flex: 1 }}>
              Last name
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label style={{ flex: 1 }}>
              Phone
              <input value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })} required inputMode="tel" />
            </label>
            <label>
              At service
              <select value={form.firstServiceId} onChange={(e) => setForm({ ...form, firstServiceId: e.target.value })}>
                <option value="">—</option>
                {services
                  .filter((s) => s.status !== 'CLOSED')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <button>Register (idempotent by phone)</button>
        </form>
      </div>

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Directory</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="NEW">New</option>
            <option value="IN_FOLLOWUP">In follow-up</option>
            <option value="RETURNED">Returned</option>
            <option value="CONVERTED">Converted</option>
            <option value="OPTED_OUT">Opted out</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Visits</th>
              <th>Status</th>
              <th>First seen</th>
            </tr>
          </thead>
          <tbody>
            {visitors.map((v) => (
              <tr key={v.id}>
                <td>
                  {v.firstName} {v.lastName ?? ''}
                </td>
                <td>{v.phoneE164}</td>
                <td>{v.visitCount}</td>
                <td>
                  <span
                    className={`badge ${v.status === 'CONVERTED' ? 'ok' : v.status === 'OPTED_OUT' ? 'err' : 'warn'}`}
                  >
                    {v.status}
                  </span>
                </td>
                <td>{fmtDate(v.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visitors.length === 0 ? <p className="muted">No visitors yet.</p> : null}
      </div>
    </div>
  );
}
