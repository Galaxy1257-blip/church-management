'use client';
// Pastoral care: prayer wall (moderated), welfare (finance/follow-up only) and
// the care queue. A Sunday School teacher sees only their class: no welfare,
// no member directory, and a picker limited to the children in that class.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { hasPermission } from '../../../lib/access';
import { getSession } from '../../../lib/session';
import MemberDrawer from '../../../components/member-drawer';

interface Prayer { id: string; body: string; isAnonymous: boolean; moderation: string; status: string }
interface Welfare { id: string; category: string; amountRequestedMinor: number | null; status: string; memberId: string; member?: { firstName: string; lastName: string } | null }
interface CareTask {
  id: string;
  type: string;
  status: string;
  note: string | null;
  dueAt: string;
  memberId?: string | null;
  member?: { id: string; firstName: string; lastName: string; phoneE164: string | null; address: string | null } | null;
}
interface ClassMember { id: string; firstName: string; lastName: string }
interface CareClass { className: string | null; members: ClassMember[] }

export default function CarePage() {
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [welfare, setWelfare] = useState<Welfare[]>([]);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [careClass, setCareClass] = useState<CareClass | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [taskForm, setTaskForm] = useState({ type: 'VISIT_HOME', memberId: '', note: '' });
  const [prayerBody, setPrayerBody] = useState('');
  const [welfareForm, setWelfareForm] = useState({ memberId: '', category: 'MEDICAL', description: '', amount: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      // Shared, cached session: which cards this person may actually read.
      const session = await getSession();
      const granted = session.permissions;
      setPerms(granted);
      const canWelfare = hasPermission(granted, 'welfare:read');
      // A teacher has no member directory; their care world is one class.
      const needsClass = !hasPermission(granted, 'members:read');
      const [p, t, w, c] = await Promise.all([
        api<Prayer[]>('/prayer'),
        api<CareTask[]>('/tasks').catch(() => []),
        canWelfare ? api<Welfare[]>('/welfare').catch(() => []) : Promise.resolve([]),
        needsClass ? api<CareClass>('/care/class').catch(() => null) : Promise.resolve(null),
      ]);
      setPrayers(p); setTasks(t); setWelfare(w); setCareClass(c); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  const canWelfare = hasPermission(perms, 'welfare:read');
  const canModerate = hasPermission(perms, 'care:moderate');
  const canOpenProfile = hasPermission(perms, 'members:read');
  const classScoped = !canOpenProfile;
  const classMembers = careClass?.members ?? [];

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
      {careClass?.className ? <p className="muted">Care for {careClass.className}.</p> : null}
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className={canWelfare ? 'grid cols-2' : undefined}>
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
                {canModerate && p.moderation === 'PENDING' ? (
                  <span className="row">
                    <button className="small" onClick={() => void moderate(p.id, true)}>Approve</button>
                    <button className="small danger" onClick={() => void moderate(p.id, false)}>Reject</button>
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '6px 0 0' }}>{p.isAnonymous ? 'Anonymous: ' : ''}{p.body}</p>
            </div>
          ))}
        </div>

        {canWelfare ? (
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
            <table><thead><tr><th>Member</th><th>Category</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
              {welfare.map((w) => (
                <tr key={w.id}>
                  <td>
                    {w.member ? (
                      <button type="button" className="link-button" onClick={() => setOpenMemberId(w.memberId)}>
                        {w.member.firstName} {w.member.lastName}
                      </button>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td>{w.category}</td>
                  <td>{w.amountRequestedMinor != null ? ghsLocal(w.amountRequestedMinor) : '—'}</td>
                  <td><span className={`badge ${w.status === 'APPROVED' ? 'ok' : w.status === 'DECLINED' ? 'err' : 'warn'}`}>{w.status}</span></td>
                  <td className="row">
                    {w.status === 'SUBMITTED' ? (<>
                      <button className="small" onClick={() => void api(`/welfare/${w.id}/decide`, { method: 'POST', body: { status: 'APPROVED' } }).then(load)}>Approve</button>
                      <button className="small danger" onClick={() => void api(`/welfare/${w.id}/decide`, { method: 'POST', body: { status: 'DECLINED' } }).then(load)}>Decline</button>
                    </>) : null}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Visits &amp; follow-ups</h2>
        <p className="muted">
          {classScoped
            ? 'Log a visit to a child in your class. Open a name to see their phone and where they live.'
            : 'People who missed church and visits to log (hospital, bereavement, home). Open a name to see their phone and where they live.'}
        </p>
        {classScoped && classMembers.length === 0 ? (
          <p className="muted">Ask your church office to assign your Sunday School class.</p>
        ) : (
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
              {classScoped ? (
                <select value={taskForm.memberId} onChange={(e) => setTaskForm({ ...taskForm, memberId: e.target.value })} required>
                  <option value="">Choose a child</option>
                  {classMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                  ))}
                </select>
              ) : (
                <input placeholder="Member ID (optional)" value={taskForm.memberId} onChange={(e) => setTaskForm({ ...taskForm, memberId: e.target.value })} />
              )}
              <input style={{ flex: 2 }} placeholder="Note (who / where / when)" value={taskForm.note} onChange={(e) => setTaskForm({ ...taskForm, note: e.target.value })} />
              <button className="small" disabled={classScoped && !taskForm.memberId}>Add</button>
            </div>
          </form>
        )}
        {tasks.slice(0, 50).map((t) => (
          <div className="spread" key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <div>
              <span className="badge mute">{t.type.replace(/_/g, ' ').toLowerCase()}</span>{' '}
              {t.memberId ? (
                canOpenProfile ? (
                  <button type="button" className="link-button" onClick={() => setOpenMemberId(t.memberId!)}>
                    {t.member ? `${t.member.firstName} ${t.member.lastName}` : 'Open member'}
                  </button>
                ) : (
                  <span>{t.member ? `${t.member.firstName} ${t.member.lastName}` : 'A child in your class'}</span>
                )
              ) : (
                <span className="muted">no member attached</span>
              )}
              <div className="muted">{t.note ?? <span>no note</span>} · due {new Date(t.dueAt).toLocaleDateString()}</div>
              {t.member?.phoneE164 || t.member?.address ? (
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {t.member.phoneE164 ?? ''}
                  {t.member.phoneE164 && t.member.address ? ' · ' : ''}
                  {t.member.address ?? ''}
                </div>
              ) : null}
            </div>
            <div className="row">
              <span className={`badge ${t.status === 'DONE' ? 'ok' : t.status === 'CANCELLED' ? 'mute' : 'warn'}`}>{t.status.replace(/_/g, ' ').toLowerCase()}</span>
              {t.status === 'OPEN' ? <button className="small" onClick={() => void api(`/tasks/${t.id}`, { method: 'POST', body: { status: 'IN_PROGRESS' } }).then(load)}>Start</button> : null}
              {t.status === 'OPEN' || t.status === 'IN_PROGRESS' ? <button className="small" onClick={() => void api(`/tasks/${t.id}`, { method: 'POST', body: { status: 'DONE' } }).then(load)}>Done</button> : null}
            </div>
          </div>
        ))}
        {tasks.length === 0 ? <p className="muted">Queue is empty.</p> : null}
      </div>
      {canOpenProfile && openMemberId ? <MemberDrawer memberId={openMemberId} onClose={() => setOpenMemberId(null)} /> : null}
    </div>
  );
}

function ghsLocal(minor: number): string {
  return `GHS ${(minor / 100).toFixed(2)}`;
}
