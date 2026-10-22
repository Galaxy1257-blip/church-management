'use client';
// Organisation: branches, member transfers (2-step), households.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Branch { id: string; name: string; code: string }
interface Household { id: string; name: string; members: { member: { firstName: string; lastName: string } }[] }

export default function OrgPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [branchForm, setBranchForm] = useState({ name: '', code: '' });
  const [transfer, setTransfer] = useState({ memberId: '', toBranchId: '' });
  const [hhForm, setHhForm] = useState({ name: '', headMemberId: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const [b, h] = await Promise.all([api<Branch[]>('/branches'), api<Household[]>('/households')]);
      setBranches(b); setHouseholds(h);
      if (!transfer.toBranchId && b[0]) setTransfer((p) => ({ ...p, toBranchId: b[0].id }));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  async function addBranch(e: FormEvent): Promise<void> {
    e.preventDefault();
    try { await api('/branches', { method: 'POST', body: branchForm }); setBranchForm({ name: '', code: '' }); setNotice('Branch added'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function requestTransfer(e: FormEvent): Promise<void> {
    e.preventDefault();
    try { await api('/branches/transfers', { method: 'POST', body: transfer }); setNotice('Transfer requested — awaits approval by another leader'); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function addHousehold(e: FormEvent): Promise<void> {
    e.preventDefault();
    try { await api('/households', { method: 'POST', body: { name: hhForm.name, headMemberId: hhForm.headMemberId || undefined } }); setHhForm({ name: '', headMemberId: '' }); setNotice('Household created'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Organisation</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="grid cols-2">
        <div className="card">
          <h2>Branches</h2>
          <form className="row" onSubmit={addBranch}>
            <input placeholder="Name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required style={{ flex: 1 }} />
            <input placeholder="Code" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} required style={{ width: 90 }} />
            <button>Add</button>
          </form>
          <table><tbody>{branches.map((b) => <tr key={b.id}><td>{b.name}</td><td><span className="badge mute">{b.code}</span></td></tr>)}</tbody></table>
          <h2>Transfer member</h2>
          <form className="stack" onSubmit={requestTransfer}>
            <input placeholder="Member ID" value={transfer.memberId} onChange={(e) => setTransfer({ ...transfer, memberId: e.target.value })} required />
            <select value={transfer.toBranchId} onChange={(e) => setTransfer({ ...transfer, toBranchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button>Request transfer (needs 2nd approval)</button>
          </form>
        </div>
        <div className="card">
          <h2>Households</h2>
          <form className="row" onSubmit={addHousehold}>
            <input placeholder="Household name" value={hhForm.name} onChange={(e) => setHhForm({ ...hhForm, name: e.target.value })} required style={{ flex: 1 }} />
            <input placeholder="Head member ID" value={hhForm.headMemberId} onChange={(e) => setHhForm({ ...hhForm, headMemberId: e.target.value })} style={{ flex: 1 }} />
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
