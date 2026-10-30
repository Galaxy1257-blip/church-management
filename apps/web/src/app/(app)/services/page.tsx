'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';

interface Service {
  id: string;
  name: string;
  startsAt: string;
  status: string;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: 'Sunday Service', startsAt: '' });

  async function load(): Promise<void> {
    try {
      setServices(await api<Service[]>('/services'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/services', { method: 'POST', body: { name: form.name, startsAt: new Date(form.startsAt).toISOString() } });
      setShowCreate(false);
      setForm({ name: 'Sunday Service', startsAt: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create');
    }
  }

  async function setStatus(id: string, action: 'open' | 'close'): Promise<void> {
    try {
      await api(`/services/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Services</h1>
        <div className="head-actions">
          <button onClick={() => setShowCreate((v) => !v)}>+ Create service</button>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}

      {showCreate ? (
        <div className="card">
          <form className="stack" onSubmit={create}>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Starts at
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                required
              />
            </label>
            <button>Create service</button>
          </form>
        </div>
      ) : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Starts</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/services/${s.id}`}>{s.name}</Link>
                </td>
                <td>{fmtDateTime(s.startsAt)}</td>
                <td>
                  <span
                    className={`badge ${s.status === 'OPEN' ? 'ok' : s.status === 'CLOSED' ? 'mute' : 'warn'}`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="row">
                  <Link href={`/services/${s.id}`}>Open →</Link>
                  {s.status === 'SCHEDULED' ? (
                    <button className="small" onClick={() => void setStatus(s.id, 'open')}>
                      Start
                    </button>
                  ) : null}
                  {s.status === 'OPEN' ? (
                    <button className="small danger" onClick={() => void setStatus(s.id, 'close')}>
                      Close
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {services.length === 0 ? <p className="muted">No services yet. The worker creates weekly instances from templates; or create one manually.</p> : null}
      </div>
    </div>
  );
}
