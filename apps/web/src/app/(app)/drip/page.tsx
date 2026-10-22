'use client';
// Drip builder: create follow-up workflows with ordered steps, publish
// versions (the worker engine runs published versions; enrolments pin).
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Step { position: number; type: string; delayMinutes: number; template: string }
interface Workflow { id: string; name: string; trigger: string; isActive: boolean; versions: { version: number; isPublished: boolean; steps: Step[] }[] }

const fmtDelay = (m: number): string => (m === 0 ? 'Day 0' : m >= 1440 ? `Day ${Math.round(m / 1440)}` : `${m}m`);

export default function DripPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Step[]>([
    { position: 0, type: 'SMS', delayMinutes: 0, template: 'Hi {firstName}! Great having you at {churchName} today.' },
    { position: 1, type: 'SMS', delayMinutes: 4320, template: "Hi {firstName}, we're praying for you. Anything we can join you in?" },
    { position: 2, type: 'TASK', delayMinutes: 10080, template: '', },
  ]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try { setWorkflows(await api<Workflow[]>('/followup/workflows')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  function upd(i: number, patch: Partial<Step>): void {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/followup/workflows', {
        method: 'POST',
        body: { name, trigger: 'VISITOR_REGISTERED', publish: true, steps: steps.map((s, i) => ({ ...s, position: i })) },
      });
      setName('');
      setNotice('Workflow created & published — new visitors enrol automatically');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Drip follow-up builder</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="card">
        <h2>New workflow</h2>
        <form className="stack" onSubmit={create}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="First-time visitor drip" required /></label>
          <h2>Steps (SMS uses {'{firstName} {churchName} {pastorName}'})</h2>
          {steps.map((s, i) => (
            <div className="row" key={i}>
              <select style={{ width: 90 }} value={s.type} onChange={(e) => upd(i, { type: e.target.value })}>
                <option value="SMS">SMS</option><option value="TASK">Task</option><option value="PROMPT">Prompt</option>
              </select>
              <select style={{ width: 110 }} value={s.delayMinutes} onChange={(e) => upd(i, { delayMinutes: Number(e.target.value) })}>
                <option value={0}>Day 0</option><option value={1440}>Day 1</option><option value={4320}>Day 3</option>
                <option value={10080}>Day 7</option><option value={20160}>Day 14</option>
              </select>
              {s.type === 'SMS' ? (
                <input style={{ flex: 1 }} value={s.template} onChange={(e) => upd(i, { template: e.target.value })} placeholder="Message template" />
              ) : (
                <input style={{ flex: 1 }} value={s.template} onChange={(e) => upd(i, { template: e.target.value })} placeholder={s.type === 'TASK' ? 'Task title' : 'Question'} />
              )}
              <button className="sm secondary" type="button" onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <button className="secondary" type="button" onClick={() => setSteps([...steps, { position: steps.length, type: 'SMS', delayMinutes: 10080, template: '' }])}>
            + Add step
          </button>
          <button>Create &amp; publish workflow</button>
        </form>
      </div>
      <div className="card">
        <h2>Workflows</h2>
        {workflows.map((w) => {
          const v = w.versions[0];
          return (
            <div key={w.id} className="card" style={{ marginTop: 8, background: 'var(--bg)' }}>
              <div className="spread">
                <strong>{w.name}</strong>
                <span className="row">
                  <span className="badge mute">{w.trigger}</span>
                  <span className={`badge ${v?.isPublished ? 'ok' : 'warn'}`}>{v ? (v.isPublished ? `v${v.version} published` : `v${v.version} draft`) : 'no version'}</span>
                </span>
              </div>
              {v ? (
                <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {v.steps.map((s) => (
                    <li key={s.position} className="muted">
                      <b>{fmtDelay(s.delayMinutes)}</b> · {s.type} · {s.template.slice(0, 60) || '(task)'}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
