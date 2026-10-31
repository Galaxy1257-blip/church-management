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

interface Schedule {
  enabled: boolean;
  weekday: number;
  startTime: string;
  endTime: string;
  name: string;
  skipDates: string[];
  timezone: string;
  upcoming: { date: string; label: string; skipped: boolean }[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: 'Sunday Service', startsAt: '' });
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function load(): Promise<void> {
    try {
      setServices(await api<Service[]>('/services'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }

  async function loadSchedule(): Promise<void> {
    try {
      setSchedule(await api<Schedule>('/services/schedule'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load the schedule');
    }
  }

  useEffect(() => {
    void load();
    void loadSchedule();
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

  function patchSchedule(patch: Partial<Schedule>): void {
    if (!schedule) return;
    setSchedule({ ...schedule, ...patch });
  }

  function toggleSkip(date: string): void {
    if (!schedule) return;
    const skipped = !schedule.skipDates.includes(date);
    patchSchedule({
      skipDates: skipped ? [...schedule.skipDates, date] : schedule.skipDates.filter((d) => d !== date),
      upcoming: schedule.upcoming.map((d) => (d.date === date ? { ...d, skipped } : d)),
    });
  }

  async function saveSchedule(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!schedule) return;
    setSavingSchedule(true);
    setNotice('');
    try {
      const saved = await api<Schedule>('/services/schedule', {
        method: 'PUT',
        body: {
          enabled: schedule.enabled,
          weekday: schedule.weekday,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          name: schedule.name,
          skipDates: schedule.skipDates,
        },
      });
      setSchedule(saved);
      setNotice('Saved — church now opens and closes on its own.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save');
    } finally {
      setSavingSchedule(false);
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
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}

      {schedule ? (
        <form className="card stack" onSubmit={saveSchedule}>
          <h2 style={{ margin: 0 }}>Automatic service</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Check-in opens and closes by itself — nobody has to press Start. Tick a Sunday below to mark “no church”.
          </p>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) => patchSchedule({ enabled: e.target.checked })}
            />
            Open check-in automatically each {WEEKDAYS[schedule.weekday]}
          </label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label style={{ flex: 2, minWidth: 160 }}>
              Name
              <input value={schedule.name} onChange={(e) => patchSchedule({ name: e.target.value })} maxLength={60} />
            </label>
            <label style={{ flex: 1, minWidth: 110 }}>
              Opens
              <input type="time" value={schedule.startTime} onChange={(e) => patchSchedule({ startTime: e.target.value })} required />
            </label>
            <label style={{ flex: 1, minWidth: 110 }}>
              Closes
              <input type="time" value={schedule.endTime} onChange={(e) => patchSchedule({ endTime: e.target.value })} required />
            </label>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No church on these days</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
              {schedule.upcoming.map((day) => (
                <label key={day.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={day.skipped} onChange={() => toggleSkip(day.date)} />
                  {day.label}
                </label>
              ))}
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Ticked days stay closed — no service opens and no one is counted.
            </p>
          </div>
          <button disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save automatic service'}</button>
        </form>
      ) : null}

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
        {services.length === 0 ? <p className="muted">No services yet — the automatic Sunday service will appear here.</p> : null}
      </div>
    </div>
  );
}
