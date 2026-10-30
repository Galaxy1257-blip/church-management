'use client';
// Groups & cells: every group is a card. Opening one shows its leader, its
// members (each opens the shared profile drawer) and its meetings/events, and
// lets you add people or change the leader without leaving the page.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate } from '../../../lib/format';
import MemberDrawer from '../../../components/member-drawer';

interface Leader {
  id: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  photoDataUrl?: string | null;
}

interface Group {
  id: string;
  type: string;
  name: string;
  leaderId: string | null;
  leader?: Leader | null;
  _count?: { members: number };
}

interface GroupMember extends Leader {
  memberNo: string;
  email?: string | null;
  address?: string | null;
  status: string;
  groupRole: string;
}

interface Meeting {
  id: string;
  heldAt: string;
  topic: string | null;
  offeringMinor: number | null;
  presentCount?: number;
  attendance: unknown[];
}

interface GroupDetail extends Group {
  leader: Leader | null;
  members: GroupMember[];
  meetings: Meeting[];
}

interface MemberOption {
  id: string;
  memberNo: string;
  firstName: string;
  lastName: string;
}

const TYPE_LABEL: Record<string, string> = {
  CELL: 'Cell group',
  DEPARTMENT: 'Department',
  MINISTRY: 'Ministry',
  CHOIR: 'Choir',
  YOUTH: 'Youth',
  WOMEN: "Women's fellowship",
  MEN: "Men's fellowship",
  OTHER: 'Group',
};

const typeLabel = (type: string) => TYPE_LABEL[type] ?? type.charAt(0) + type.slice(1).toLowerCase();

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeId, setActiveId] = useState('');
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [newGroup, setNewGroup] = useState({ type: 'CELL', name: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [rename, setRename] = useState('');
  const [meeting, setMeeting] = useState({ topic: '', offering: '' });
  const [addMemberId, setAddMemberId] = useState('');
  const [addRole, setAddRole] = useState('MEMBER');
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    try {
      setGroups(await api<Group[]>('/groups'));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }, []);

  const loadDetail = useCallback(async (id: string): Promise<void> => {
    try {
      const d = await api<GroupDetail>(`/groups/${id}`);
      setDetail(d);
      setRename(d.name);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }, []);

  useEffect(() => {
    void load();
    void api<{ items: MemberOption[] }>('/members?pageSize=200')
      .then((r) => setMemberOptions(r.items))
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (activeId) void loadDetail(activeId);
  }, [activeId, loadDetail]);

  async function createGroup(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const g = await api<Group>('/groups', { method: 'POST', body: newGroup });
      setNewGroup({ type: 'CELL', name: '' });
      setShowCreate(false);
      setNotice(`${g.name} created — add people below.`);
      await load();
      setActiveId(g.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function saveGroup(patch: { name?: string; leaderId?: string | null }): Promise<void> {
    if (!detail) return;
    try {
      await api(`/groups/${detail.id}`, { method: 'PATCH', body: patch });
      await load();
      await loadDetail(detail.id);
      setNotice('Group updated.');
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function addMember(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!detail || !addMemberId) return;
    try {
      await api(`/groups/${detail.id}/members`, { method: 'POST', body: { memberId: addMemberId, role: addRole } });
      setAddMemberId('');
      await load();
      await loadDetail(detail.id);
      setNotice('Person added to the group.');
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function removeMember(memberId: string): Promise<void> {
    if (!detail) return;
    try {
      await api(`/groups/${detail.id}/members/${memberId}`, { method: 'DELETE' });
      await load();
      await loadDetail(detail.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function recordMeeting(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!detail) return;
    try {
      await api('/groups/meetings', {
        method: 'POST',
        body: {
          groupId: detail.id,
          heldAt: new Date().toISOString(),
          topic: meeting.topic || undefined,
          offeringMinor: meeting.offering ? Math.round(Number(meeting.offering) * 100) : undefined,
        },
      });
      setMeeting({ topic: '', offering: '' });
      setNotice('Meeting recorded.');
      await loadDetail(detail.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  const memberChoices = detail
    ? memberOptions.filter((m) => !detail.members.some((dm) => dm.id === m.id))
    : memberOptions;

  return (
    <div>
      <div className="page-head">
        <h1>Groups &amp; cells</h1>
        <div className="head-actions">
          <button onClick={() => setShowCreate((v) => !v)}>+ New group</button>
        </div>
      </div>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {showCreate ? (
        <form className="card stack" onSubmit={createGroup}>
          <h2>New group</h2>
          <div className="row">
            <label>Type
              <select value={newGroup.type} onChange={(e) => setNewGroup({ ...newGroup, type: e.target.value })}>
                <option value="CELL">Cell group</option>
                <option value="DEPARTMENT">Department</option>
                <option value="MINISTRY">Ministry</option>
                <option value="CHOIR">Choir</option>
                <option value="YOUTH">Youth</option>
                <option value="WOMEN">Women&apos;s fellowship</option>
                <option value="MEN">Men&apos;s fellowship</option>
              </select>
            </label>
            <label style={{ flex: 2 }}>Name
              <input value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} placeholder="e.g. Adenta Cell" required />
            </label>
            <button>Create group</button>
          </div>
        </form>
      ) : null}

      <div className="group-grid">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`group-card${activeId === g.id ? ' active' : ''}`}
            onClick={() => setActiveId(g.id)}
            aria-pressed={activeId === g.id}
          >
            <span className="group-avatar" aria-hidden>{g.name.charAt(0).toUpperCase()}</span>
            <span className="group-body">
              <span className="group-name">{g.name}</span>
              <span className="muted" style={{ fontSize: '0.8rem' }}>{typeLabel(g.type)}</span>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                {g._count?.members ?? 0} member{(g._count?.members ?? 0) === 1 ? '' : 's'}
                {g.leader ? ` · led by ${g.leader.firstName} ${g.leader.lastName}` : ''}
              </span>
            </span>
          </button>
        ))}
        {groups.length === 0 ? <p className="muted">No groups yet — create your first one.</p> : null}
      </div>

      {detail ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="spread">
            <div>
              <h2 style={{ margin: 0 }}>{detail.name}</h2>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {typeLabel(detail.type)} · {detail.members.length} member{detail.members.length === 1 ? '' : 's'}
              </div>
            </div>
            <span className="badge mute">{typeLabel(detail.type)}</span>
          </div>

          <div className="row" style={{ marginTop: '0.7rem', alignItems: 'flex-end' }}>
            <label style={{ flex: 1 }}>
              Rename
              <input value={rename} onChange={(e) => setRename(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Leader
              <select
                value={detail.leaderId ?? ''}
                onChange={(e) => void saveGroup({ leaderId: e.target.value || null })}
              >
                <option value="">No leader yet</option>
                {detail.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                ))}
              </select>
            </label>
            <button className="small" type="button" onClick={() => void saveGroup({ name: rename.trim() })} disabled={!rename.trim() || rename === detail.name}>
              Save name
            </button>
          </div>

          {detail.leader ? (
            <p style={{ marginTop: '0.6rem' }}>
              Leader:{' '}
              <button type="button" className="link-button" onClick={() => setOpenMemberId(detail.leader!.id)}>
                {detail.leader.firstName} {detail.leader.lastName}
              </button>
              {detail.leader.phoneE164 ? <span className="muted"> · {detail.leader.phoneE164}</span> : null}
            </p>
          ) : null}

          <h3 style={{ marginTop: '1rem' }}>Members</h3>
          <form className="row" onSubmit={addMember} style={{ marginBottom: '0.4rem' }}>
            <select style={{ flex: 1 }} value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)}>
              <option value="">Choose a person…</option>
              {memberChoices.map((m) => (
                <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberNo})</option>
              ))}
            </select>
            <select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
              <option value="MEMBER">Member</option>
              <option value="LEADER">Leader</option>
              <option value="ASSISTANT">Assistant</option>
            </select>
            <button className="small" disabled={!addMemberId}>Add to group</button>
          </form>
          {memberChoices.length === 0 ? <p className="muted" style={{ fontSize: '0.85rem' }}>Everyone is already in this group.</p> : null}

          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Role</th><th /></tr>
            </thead>
            <tbody>
              {detail.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <button type="button" className="link-button" onClick={() => setOpenMemberId(m.id)}>
                      {m.firstName} {m.lastName}
                    </button>
                  </td>
                  <td>{m.phoneE164 ?? <span className="muted">—</span>}</td>
                  <td><span className="badge mute">{m.groupRole.toLowerCase()}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="small secondary" onClick={() => void removeMember(m.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.members.length === 0 ? <p className="muted">No one in this group yet — add the first person above.</p> : null}

          <h3 style={{ marginTop: '1.2rem' }}>Meetings &amp; events</h3>
          <form className="row" onSubmit={recordMeeting}>
            <input style={{ flex: 2 }} placeholder="What was the meeting about?" value={meeting.topic} onChange={(e) => setMeeting({ ...meeting, topic: e.target.value })} />
            <input style={{ width: 130 }} placeholder="Offering GHS" inputMode="decimal" value={meeting.offering} onChange={(e) => setMeeting({ ...meeting, offering: e.target.value })} />
            <button className="small">Record meeting</button>
          </form>
          <table style={{ marginTop: '0.5rem' }}>
            <thead><tr><th>Date</th><th>Topic</th><th>Offering</th><th>Present</th></tr></thead>
            <tbody>
              {detail.meetings.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDate(m.heldAt)}</td>
                  <td>{m.topic ?? <span className="muted">—</span>}</td>
                  <td>{m.offeringMinor != null ? `GHS ${(m.offeringMinor / 100).toFixed(2)}` : '—'}</td>
                  <td>{m.presentCount ?? m.attendance.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.meetings.length === 0 ? <p className="muted">No meetings recorded yet.</p> : null}
        </div>
      ) : null}

      {openMemberId ? <MemberDrawer memberId={openMemberId} onClose={() => setOpenMemberId(null)} /> : null}
    </div>
  );
}
