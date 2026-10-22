'use client';
// Pastoral care: prayer wall (moderated), counseling (encrypted server-side),
// welfare requests.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Prayer { id: string; body: string; isAnonymous: boolean; moderation: string; status: string }
interface Welfare { id: string; category: string; amountRequestedMinor: number | null; status: string }
interface CareTask { id: string; type: string; status: string; note: string | null; dueAt: string; memberId?: string | null }

export default function CarePage() {
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [welfare, setWelfare] = useState<Welfare[]>([]);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [taskForm, setTaskForm] = useState({ type: 'VISIT_HOME', memberId: '', note: '' });
  const [prayerBody, setPrayerBody] = useState('');
  const [welfareForm, setWelfareForm] = useState({ memberId: '', category: 'MEDICAL', description: '', amount: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const [p, w, t] = await Promise.all([api<Prayer[]>('/prayer'), api<Welfare[]>('/welfare'), api<CareTask[]>('/tasks').catch(() => [])]);
      setPrayers(p); setWelfare(w); setTasks(t); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  async function addPrayer(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/prayer', { method: 'POST', body: { body: prayerBody, shareToWall: true, isAnonymous: false } });
      setPrayerBody(''); setNotice('Submitted for moderation before the wall');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function moderate(id: string, approve: boolean): Promise<void> {
    try { await api(`/prayer/${id}/moderate`, { method: 'POST', body: { approve } }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }

  async function submitWelfare(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/welfare', { method: 'POST', body: { memberId: welfareForm.memberId, category: welfareForm.category, description: welfareForm.description, amountRequestedMinor: welfareForm.amount ? Math.round(Number(welfareForm.amount) * 100) : undefined } });
      setWelfareForm({ ...welfareForm, description: '', amount: '' });
      setNotice('Welfare request submitted (encrypted at rest)');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Pastoral care</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="grid cols-2">
        <div className="card">
          <h2>Prayer wall</h2>
          <form className="stack" onSubmit={addPrayer}>
            <textarea value={prayerBody} onChange={(e) => setPrayerBody(e.target.value)} placeholder="Prayer request…" required />
            <button>Submit request</button>
          </form>
          {prayers.map((p) => (
            <div key={p.id} className="card" style={{ marginTop: 8, background: 'var(--bg)' }}>
              <div className="spread">
                <span className={`badge ${p.moderation === 'APPROVED' ? 'ok' : 'warn'}`}>{p.moderation}</span>
                {p.moderation === 'PENDING' ? (
                  <span className="row">
                    <button className="sm" onClick={() => void moderate(p.id, true)}>Approve</button>
                    <button className="sm danger" onClick={() => void moderate(p.id, false)}>Reject</button>
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '6px 0 0' }}>{p.isAnonymous ? 'Anonymous: ' : ''}{p.body}</p>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Welfare requests</h2>
          <form className="stack" onSubmit={submitWelfare}>
            <input placeholder="Member ID" value={welfareForm.memberId} onChange={(e) => setWelfareForm({ ...welfareForm, memberId: e.target.value })} required />
            <select value={welfareForm.category} onChange={(e) => setWelfareForm({ ...welfareForm, category: e.target.value })}>
              <option value="MEDICAL">Medical</option><option value="FUNERAL">Funeral</option><option value="SCHOOL_FEES">School fees</option><option value="RENT">Rent</option><option value="OTHER">Other</option>
            </select>
            <textarea value={welfareForm.description} onChange={(e) => setWelfareForm({ ...welfareForm, description: e.target.value })} placeholder="Situation (AES-encrypted at rest)" required />
            <input placeholder="Amount requested GHS" value={welfareForm.amount} onChange={(e) => setWelfareForm({ ...welfareForm, amount: e.target.value })} inputMode="decimal" />
            <button>Submit request</button>
          </form>
          <table><thead><tr><th>Category</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {welfare.map((w) => (
              <tr key={w.id}>
                <td>{w.category}</td>
                <td>{w.amountRequestedMinor != null ? ghsLocal(w.amountRequestedMinor) : '—'}</td>
                <td><span className={`badge ${w.status === 'APPROVED' ? 'ok' : w.status === 'DECLINED' ? 'err' : 'warn'}`}>{w.status}</span></td>
                <td className="row">
                  {w.status === 'SUBMITTED' ? (<>
                    <button className="sm" onClick={() => void api(`/welfare/${w.id}/decide`, { method: 'POST', body: { status: 'APPROVED' } }).then(load)}>Approve</button>
                    <button className="sm danger" onClick={() => void api(`/welfare/${w.id}/decide`, { method: 'POST', body: { status: 'DECLINED' } }).then(load)}>Decline</button>
                  </>) : null}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>

      <div className="card">
        <h2>Care queue (R4.9 — visits &amp; follow-ups)</h2>
        <p className="muted">Missing-member alerts land here automatically (nightly). Log hospital/bereavement/home visits and funeral support, then work them OPEN → IN PROGRESS → DONE.</p>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/tasks', { method: 'POST', body: { type: taskForm.type, memberId: taskForm.memberId || undefined, note: taskForm.note || undefined } });
            setTaskForm({ type: 'VISIT_HOME', memberId: '', note: '' });
            setNotice('Care task created ✓');
            await load();
          } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
        }}>
          <div className="row">
            <select value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}>
              <option value="VISIT_HOME">Home visit</option>
              <option value="VISIT_HOSPITAL">Hospital visit</option>
              <option value="VISIT_BEREAVEMENT">Bereavement visit</option>
              <option value="FUNERAL_SUPPORT">Funeral / one-week support</option>
            </select>
            <input placeholder="Member ID (optional)" value={taskForm.memberId} onChange={(e) => setTaskForm({ ...taskForm, memberId: e.target.value })} />
            <input style={{ flex: 2 }} placeholder="Note (who / where / when)" value={taskForm.note} onChange={(e) => setTaskForm({ ...taskForm, note: e.target.value })} />
            <button className="small">Add</button>
          </div>
        </form>
        {tasks.slice(0, 50).map((t) => (
          <div className="spread" key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <div>
              <span className="badge mute">{t.type}</span> {t.note ?? <span className="muted">no note</span>}
              <div className="muted">due {new Date(t.dueAt).toLocaleDateString()}</div>
            </div>
            <div className="row">
              <span className={`badge ${t.status === 'DONE' ? 'ok' : t.status === 'CANCELLED' ? 'mute' : 'warn'}`}>{t.status}</span>
              {t.status === 'OPEN' ? <button className="small" onClick={() => void api(`/tasks/${t.id}`, { method: 'POST', body: { status: 'IN_PROGRESS' } }).then(load)}>Start</button> : null}
              {t.status === 'OPEN' || t.status === 'IN_PROGRESS' ? <button className="small" onClick={() => void api(`/tasks/${t.id}`, { method: 'POST', body: { status: 'DONE' } }).then(load)}>Done</button> : null}
            </div>
          </div>
        ))}
        {tasks.length === 0 ? <p className="muted">Queue is empty.</p> : null}
      </div>
    </div>
  );
}

function ghsLocal(minor: number): string {
  return `GHS ${(minor / 100).toFixed(2)}`;
}
