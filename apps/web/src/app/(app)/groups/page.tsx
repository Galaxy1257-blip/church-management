'use client';
// Groups/cells: create groups, record weekly meetings, take attendance.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Group { id: string; type: string; name: string; _count?: { members: number } }
interface Meeting { id: string; groupId: string; heldAt: string; topic: string | null; offeringMinor: number | null; attendance: unknown[] }

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeGroup, setActiveGroup] = useState('');
  const [form, setForm] = useState({ type: 'CELL', name: '' });
  const [meeting, setMeeting] = useState({ topic: '', offering: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const g = await api<Group[]>('/groups');
      setGroups(g);
      if (!activeGroup && g[0]) setActiveGroup(g[0].id);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (activeGroup) void api<Meeting[]>(`/groups/${activeGroup}/meetings`).then(setMeetings).catch(() => undefined);
  }, [activeGroup]);

  async function createGroup(e: FormEvent): Promise<void> {
    e.preventDefault();
    try { await api('/groups', { method: 'POST', body: form }); setForm({ type: 'CELL', name: '' }); setNotice('Group created'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function recordMeeting(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/groups/meetings', {
        method: 'POST',
        body: { groupId: activeGroup, heldAt: new Date().toISOString(), topic: meeting.topic || undefined, offeringMinor: meeting.offering ? Math.round(Number(meeting.offering) * 100) : undefined },
      });
      setMeeting({ topic: '', offering: '' });
      setNotice('Meeting recorded (offline-safe)');
      if (activeGroup) setMeetings(await api<Meeting[]>(`/groups/${activeGroup}/meetings`));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Groups &amp; Cells</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="grid cols-2">
        <div className="card">
          <h2>Create group</h2>
          <form className="stack" onSubmit={createGroup}>
            <label>Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="CELL">Cell</option><option value="DEPARTMENT">Department</option><option value="MINISTRY">Ministry</option>
              </select>
            </label>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <button>Create</button>
          </form>
          <h2>All groups</h2>
          <table><tbody>
            {groups.map((g) => (
              <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => setActiveGroup(g.id)}>
                <td>{activeGroup === g.id ? '▸ ' : ''}{g.name}</td>
                <td><span className="badge mute">{g.type}</span></td>
                <td className="muted">{g._count?.members ?? 0} members</td>
              </tr>
            ))}
          </tbody></table>
          {groups.length === 0 ? <p className="muted">No groups yet.</p> : null}
        </div>
        <div className="card">
          <h2>Weekly meeting report</h2>
          <form className="stack" onSubmit={recordMeeting}>
            <label>Topic<input value={meeting.topic} onChange={(e) => setMeeting({ ...meeting, topic: e.target.value })} placeholder="Faithfulness (Rom 4)" /></label>
            <label>Offering (GHS)<input value={meeting.offering} onChange={(e) => setMeeting({ ...meeting, offering: e.target.value })} inputMode="decimal" /></label>
            <button>Record meeting</button>
          </form>
          <h2>Recent meetings</h2>
          <table><thead><tr><th>Date</th><th>Topic</th><th>Offering</th><th>Present</th></tr></thead><tbody>
            {meetings.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.heldAt).toLocaleDateString()}</td>
                <td>{m.topic ?? '—'}</td>
                <td>{m.offeringMinor != null ? `GHS ${(m.offeringMinor / 100).toFixed(2)}` : '—'}</td>
                <td>{m.attendance.length}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
