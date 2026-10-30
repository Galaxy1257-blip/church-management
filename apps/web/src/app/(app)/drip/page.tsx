'use client';
// Follow-up plans: welcome new visitors automatically — a text on the day,
// then later messages and tasks. The worker runs the published version.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Step { position: number; type: string; delayMinutes: number; template: string }
interface Workflow { id: string; name: string; trigger: string; isActive: boolean; versions: { version: number; isPublished: boolean; steps: Step[] }[] }

const TYPE_LABEL: Record<string, string> = {
  SMS: 'Text message',
  TASK: 'Leader task',
  PROMPT: 'Question',
};

const dayLabel = (minutes: number): string => {
  if (minutes === 0) return 'Same day';
  if (minutes === 1440) return 'Next day';
  if (minutes >= 10080) return `Week ${Math.round(minutes / 10080)}`;
  return `Day ${Math.round(minutes / 1440)}`;
};

export default function FollowUpPage() {
  const [plans, setPlans] = useState<Workflow[]>([]);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Step[]>([
    { position: 0, type: 'SMS', delayMinutes: 0, template: 'Hi {firstName}! Great having you at {churchName} today.' },
    { position: 1, type: 'SMS', delayMinutes: 4320, template: "Hi {firstName}, we're praying for you. Anything we can join you in?" },
    { position: 2, type: 'TASK', delayMinutes: 10080, template: '' },
  ]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try { setPlans(await api<Workflow[]>('/followup/workflows')); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
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
      setNotice('Saved. New visitors will start getting these messages.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Follow-up messages</h1>
      <p className="muted">Welcome new visitors automatically — a text on the day they visit, then a few friendly follow-ups.</p>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <h2>Create a plan</h2>
        <form className="stack" onSubmit={create}>
          <label>Plan name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="First-time visitor welcome" required /></label>

          <h3 style={{ margin: '0.4rem 0 0' }}>Messages in this plan</h3>
          <p className="muted" style={{ margin: 0 }}>
            Use {'{firstName}'}, {'{churchName}'} or {'{pastorName}'} to personalise a message.
          </p>
          <div className="stack">
            {steps.map((s, i) => (
              <div className="plan-step" key={i}>
                <div className="plan-step-top">
                  <select value={s.type} onChange={(e) => upd(i, { type: e.target.value })} aria-label="What happens">
                    <option value="SMS">Text message</option>
                    <option value="TASK">Leader task</option>
                    <option value="PROMPT">Question</option>
                  </select>
                  <select value={s.delayMinutes} onChange={(e) => upd(i, { delayMinutes: Number(e.target.value) })} aria-label="When">
                    <option value={0}>Same day</option>
                    <option value={1440}>Next day</option>
                    <option value={4320}>Day 3</option>
                    <option value={10080}>Week 1</option>
                    <option value={20160}>Week 2</option>
                  </select>
                  <button
                    className="small secondary step-remove"
                    type="button"
                    aria-label="Remove this message"
                    onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </div>
                <input
                  value={s.template}
                  onChange={(e) => upd(i, { template: e.target.value })}
                  placeholder={s.type === 'SMS' ? 'Message…' : s.type === 'TASK' ? 'What should the leader do?' : 'Question to ask'}
                />
              </div>
            ))}
          </div>

          <button className="secondary" type="button" onClick={() => setSteps([...steps, { position: steps.length, type: 'SMS', delayMinutes: 10080, template: '' }])}>
            + Add another message
          </button>
          <button>Save &amp; start</button>
        </form>
      </div>

      <div className="card">
        <h2>Saved plans</h2>
        {plans.map((w) => {
          const v = w.versions[0];
          return (
            <div key={w.id} className="card" style={{ marginTop: 8, background: 'var(--bg)' }}>
              <div className="spread">
                <strong>{w.name}</strong>
                <span className="row">
                  <span className="badge mute">New visitors</span>
                  <span className={`badge ${v?.isPublished ? 'ok' : 'warn'}`}>
                    {v ? (v.isPublished ? 'Live' : 'Draft') : 'No messages'}
                  </span>
                </span>
              </div>
              {v ? (
                <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {v.steps.map((s) => (
                    <li key={s.position} className="muted">
                      <b>{dayLabel(s.delayMinutes)}</b> · {TYPE_LABEL[s.type] ?? s.type}
                      {s.template ? ` — ${s.template.slice(0, 60)}` : ''}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          );
        })}
        {plans.length === 0 ? <p className="muted">No plans yet. Create one above and new visitors will start getting it.</p> : null}
      </div>
    </div>
  );
}
