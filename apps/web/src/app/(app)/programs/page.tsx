'use client';
// Programs & milestones: a church program repeats on a member's date — a
// birthday, a wedding anniversary, a salvation day. Leaders see whose day is
// coming within the reminder window and choose which ones the whole church
// hears about. Approving a milestone posts one notification to the companion;
// each member's day is sent once a year.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import Notice from '../../../components/notice';

interface Program {
  id: string;
  name: string;
  dateField: string;
  remindDays: number;
  active: boolean;
}
interface Milestone {
  programId: string;
  programName: string;
  dateField: string;
  dateLabel: string;
  memberId: string;
  name: string;
  memberNo: string;
  nextAt: string;
  ordinal: number;
  ordinalLabel: string;
  dayLabel: string;
  approved: boolean;
}

const DATE_FIELDS = [
  { key: 'DOB', label: 'Birthday' },
  { key: 'JOINED', label: 'Joined the church' },
  { key: 'SALVATION', label: 'Salvation day' },
  { key: 'BAPTISM', label: 'Baptism day' },
  { key: 'MARRIAGE', label: 'Wedding anniversary' },
  { key: 'ORDINATION', label: 'Ordination day' },
];

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [form, setForm] = useState({ name: '', dateField: 'DOB', remindDays: 7 });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const [p, u] = await Promise.all([
        api<Program[]>('/programs'),
        api<{ items: Milestone[] }>('/programs/upcoming').then((r) => r.items),
      ]);
      setPrograms(p);
      setMilestones(u);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  async function addProgram(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (form.name.trim().length < 2) return;
    try {
      await api('/programs', {
        method: 'POST',
        body: { name: form.name.trim(), dateField: form.dateField, remindDays: Number(form.remindDays) },
      });
      setNotice(`"${form.name.trim()}" added — its upcoming days will show on this page.`);
      setForm({ name: '', dateField: 'DOB', remindDays: 7 });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not add the program'); }
  }

  async function setReminderDays(id: string, remindDays: number): Promise<void> {
    try {
      await api(`/programs/${id}`, { method: 'PUT', body: { remindDays } });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not change the reminder window'); }
  }

  async function toggleActive(id: string, active: boolean): Promise<void> {
    try {
      await api(`/programs/${id}`, { method: 'PUT', body: { active } });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not change the program'); }
  }

  async function removeProgram(id: string): Promise<void> {
    try {
      await api(`/programs/${id}`, { method: 'DELETE' });
      setNotice('Program deleted.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not delete the program'); }
  }

  async function approve(programId: string, memberId: string): Promise<void> {
    try {
      const r = await api<{ title: string }>(`/programs/${programId}/milestones/${memberId}/approve`, { method: 'POST' });
      setNotice(`"${r.title}" is on its way to the church.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'could not send this milestone'); }
  }

  return (
    <div>
      <h1>Programs &amp; milestones</h1>
      <p className="muted">
        A program repeats on a member&apos;s date — a birthday, a wedding anniversary, a salvation day.
        You see whose day is coming; the church hears only about the ones you approve.
      </p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="card stack">
        <h2>Coming up</h2>
        {milestones.length === 0 ? (
          <p className="muted">
            Nothing in the reminder window yet. Add a program below, and members&apos; dates on file will show here as
            the days get close.
          </p>
        ) : (
          milestones.map((m) => (
            <div key={`${m.programId}:${m.memberId}`} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <span className="name">{m.name}</span>{' '}
                <span className="badge mute">{m.dateLabel.toLowerCase()}</span>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {m.dayLabel} · {m.ordinalLabel} {m.programName.toLowerCase()} · member {m.memberNo}
                </div>
              </div>
              {m.approved ? (
                <span className="badge ok">sent to the church</span>
              ) : (
                <button className="small" onClick={() => void approve(m.programId, m.memberId)}>
                  Send to the church
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card stack">
        <h2>Programs</h2>
        {programs.length === 0 ? (
          <p className="muted">No programs yet. Birthdays are the usual first one.</p>
        ) : (
          programs.map((p) => (
            <div key={p.id} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <span className="name">{p.name}</span>{' '}
                <span className="badge mute">{DATE_FIELDS.find((d) => d.key === p.dateField)?.label ?? p.dateField.toLowerCase()}</span>{' '}
                {p.active ? null : <span className="badge warn">paused</span>}
              </div>
              <div className="row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem' }}>
                  remind
                  <select
                    value={p.remindDays}
                    aria-label={`Reminder window for ${p.name}`}
                    onChange={(e) => void setReminderDays(p.id, Number(e.target.value))}
                  >
                    <option value={1}>1 day before</option>
                    <option value={3}>3 days before</option>
                    <option value={7}>1 week before</option>
                    <option value={14}>2 weeks before</option>
                    <option value={30}>1 month before</option>
                  </select>
                </label>
                <button className="small secondary" onClick={() => void toggleActive(p.id, !p.active)}>
                  {p.active ? 'Pause' : 'Resume'}
                </button>
                <button className="small danger" onClick={() => void removeProgram(p.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
        <form className="stack" onSubmit={(e) => void addProgram(e)}>
          <h3>Add a program</h3>
          <div className="row">
            <input
              aria-label="Program name"
              placeholder="Name (e.g. Birthdays, Wedding anniversaries)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <select aria-label="Which date it repeats on" value={form.dateField} onChange={(e) => setForm({ ...form, dateField: e.target.value })}>
              {DATE_FIELDS.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <select aria-label="Reminder window" value={form.remindDays} onChange={(e) => setForm({ ...form, remindDays: Number(e.target.value) })}>
              <option value={1}>1 day before</option>
              <option value={3}>3 days before</option>
              <option value={7}>1 week before</option>
              <option value={14}>2 weeks before</option>
              <option value={30}>1 month before</option>
            </select>
            <button className="small" disabled={form.name.trim().length < 2}>Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
