'use client';
// Organisation: branches, member transfers (2-step), households.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { hasPermission, moduleEnabled, type ModuleFlags } from '../../../lib/access';
import { getSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface Branch { id: string; name: string; code: string }
interface Household { id: string; name: string; members: { member: { firstName: string; lastName: string } }[] }
interface Transfer {
  id: string;
  memberName: string;
  memberNo: string;
  fromBranchName: string;
  toBranchName: string;
  status: string;
  requestedByName: string;
  createdAt: string;
}

export default function OrgPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [pending, setPending] = useState<Transfer[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [branchForm, setBranchForm] = useState({ name: '', code: '' });
  const [transfer, setTransfer] = useState({ memberId: '', toBranchId: '' });
  const [hhForm, setHhForm] = useState({ name: '', headMemberId: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  // Branches is its own App section, so this page must keep working — households —
  // when it is switched off. The API refuses /branches then, so do not ask.
  const [modules, setModules] = useState<ModuleFlags | undefined>(undefined);
  // Opening a branch is the office's job (settings:write). The screen also answers
  // to branches:write, which is the transfer request, so the add form is hidden for
  // someone who can transfer but cannot create rather than left there to fail.
  const [canAddBranch, setCanAddBranch] = useState(false);

  async function load(showBranches: boolean): Promise<void> {
    try {
      const [b, t, h] = await Promise.all([
        showBranches ? api<Branch[]>('/branches') : Promise.resolve<Branch[]>([]),
        showBranches ? api<Transfer[]>('/branches/transfers?status=PENDING') : Promise.resolve<Transfer[]>([]),
        api<Household[]>('/households'),
      ]);
      setBranches(b); setPending(t); setHouseholds(h);
      if (!transfer.toBranchId && b[0]) setTransfer((p) => ({ ...p, toBranchId: b[0].id }));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => {
    void (async () => {
      const session = await getSession().catch(() => null);
      const mods = session?.modules;
      setModules(mods);
      setCanAddBranch(hasPermission(session?.permissions ?? [], 'settings:write'));
      await load(moduleEnabled(mods, 'branches'));
    })();
  }, []);

  async function addBranch(e: FormEvent): Promise<void> {
    e.preventDefault();
    try { await api('/branches', { method: 'POST', body: branchForm }); setBranchForm({ name: '', code: '' }); setNotice('Branch added'); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function requestTransfer(e: FormEvent): Promise<void> {
    e.preventDefault();
    try { await api('/branches/transfers', { method: 'POST', body: transfer }); setNotice('Transfer requested — awaits approval by another leader'); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function decide(id: string, approve: boolean): Promise<void> {
    try {
      await api(`/branches/transfers/${id}/approve`, { method: 'POST', body: { approve } });
      setNotice(approve ? 'Transfer approved — the member has moved branch' : 'Transfer declined — the member stays where they are');
      await load(moduleEnabled(modules, 'branches'));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function addHousehold(e: FormEvent): Promise<void> {
    e.preventDefault();
    try { await api('/households', { method: 'POST', body: { name: hhForm.name, headMemberId: hhForm.headMemberId || undefined } }); setHhForm({ name: '', headMemberId: '' }); setNotice('Household created'); await load(moduleEnabled(modules, 'branches')); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Organisation</h1>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      <div className="grid cols-2">
        {moduleEnabled(modules, 'branches') ? (
        <div className="card">
          <h2>Branches</h2>
          {canAddBranch ? (
            <form className="row" onSubmit={addBranch}>
              <input aria-label="Branch name" placeholder="Name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required style={{ flex: 1 }} />
              <input aria-label="Branch code" placeholder="Code" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} required style={{ width: 90 }} />
              <button>Add</button>
            </form>
          ) : null}
          <table><tbody>{branches.map((b) => <tr key={b.id}><td>{b.name}</td><td><span className="badge mute">{b.code}</span></td></tr>)}</tbody></table>
          <h2>Transfer member</h2>
          <form className="stack" onSubmit={requestTransfer}>
            <input aria-label="Member ID to transfer" placeholder="Member ID" value={transfer.memberId} onChange={(e) => setTransfer({ ...transfer, memberId: e.target.value })} required />
            <select aria-label="Transfer to branch" value={transfer.toBranchId} onChange={(e) => setTransfer({ ...transfer, toBranchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button>Request transfer (needs 2nd approval)</button>
          </form>
          <h2>Waiting for approval ({pending.length})</h2>
          {pending.length === 0 ? <p className="muted">No transfer is waiting.</p> : null}
          <table><tbody>
            {pending.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.memberName}</strong> <span className="muted">({t.memberNo})</span>
                  <br />
                  <span className="muted">{t.fromBranchName} → {t.toBranchName} · asked by {t.requestedByName}</span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="small" onClick={() => void decide(t.id, true)}>Approve</button>{' '}
                  <button className="small secondary" onClick={() => void decide(t.id, false)}>Decline</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
        ) : null}
        <div className="card">
          <h2>Households</h2>
          <form className="row" onSubmit={addHousehold}>
            <input aria-label="Household name" placeholder="Household name" value={hhForm.name} onChange={(e) => setHhForm({ ...hhForm, name: e.target.value })} required style={{ flex: 1 }} />
            <input aria-label="Head of household member ID" placeholder="Head member ID" value={hhForm.headMemberId} onChange={(e) => setHhForm({ ...hhForm, headMemberId: e.target.value })} style={{ flex: 1 }} />
            <button>Create</button>
          </form>
          <table><thead><tr><th>Household</th><th>Members</th></tr></thead><tbody>
            {households.map((h) => (
              <tr key={h.id}><td>{h.name}</td><td>{h.members.map((m) => `${m.member.firstName} ${m.member.lastName}`).join(', ') || '—'}</td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
