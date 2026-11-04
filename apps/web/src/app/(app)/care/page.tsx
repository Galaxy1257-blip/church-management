'use client';
// Pastoral care, for the door team and the class teacher: the prayer wall
// (moderated) and the visit queue. A Sunday School teacher sees only their class.
// The money side — welfare requests — is its own screen at /welfare, for the
// people the API lets decide payouts.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { hasPermission } from '../../../lib/access';
import { getSession } from '../../../lib/session';
import MemberDrawer from '../../../components/member-drawer';
import Notice from '../../../components/notice';

interface Prayer { id: string; body: string; isAnonymous: boolean; moderation: string; status: string }
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
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [careClass, setCareClass] = useState<CareClass | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [taskForm, setTaskForm] = useState({ type: 'VISIT_HOME', memberId: '', note: '' });
  const [prayerBody, setPrayerBody] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      // Shared, cached session: which cards this person may actually read.
      const session = await getSession();
      const granted = session.permissions;
      setPerms(granted);
      // A teacher has no member directory; their care world is one class.
      const needsClass = !hasPermission(granted, 'members:read');
      const [p, t, c] = await Promise.all([
        api<Prayer[]>('/prayer'),
        api<CareTask[]>('/tasks').catch(() => []),
        needsClass ? api<CareClass>('/care/class').catch(() => null) : Promise.resolve(null),
      ]);
      setPrayers(p); setTasks(t); setCareClass(c); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

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

  return (
    <div>
      <h1>Pastoral care</h1>
      {careClass?.className ? <p className="muted">Care for {careClass.className}.</p> : null}
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
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
