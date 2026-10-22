'use client';
// R4.5 branch → HQ remittances: submit (branch finance), 2-step approval
// (trustee approve → finance mark remitted), per-branch/region report.
// Also branch directory + create (region field for denomination reports).
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, ghs, toPesewas } from '../../../lib/format';

interface Branch { id: string; name: string; code: string; address: string | null; region: string | null; isHq: boolean; isActive: boolean }
interface Remittance {
  id: string; amountMinor: number; reference: string; note: string | null; status: string; createdAt: string;
  fromBranch?: { name: string; code: string } | null; fromBranchId: string;
}
interface ReportRow { branchId: string; name: string; code: string; region: string | null; submittedMinor: number; approvedMinor: number; remittedMinor: number; rejectedMinor: number; count: number }

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<Remittance[]>([]);
  const [report, setReport] = useState<{ byBranch: ReportRow[]; totals: { remittedMinor: number; inFlightMinor: number } } | null>(null);
  // R4.10 denomination terms (Branch / Society / Parish / Area…)
  const [unitPlural, setUnitPlural] = useState('Branches');
  const [newBranch, setNewBranch] = useState({ name: '', code: '', region: '', address: '' });
  const [form, setForm] = useState({ fromBranchId: '', amount: '', reference: '', note: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const [b, r, rep] = await Promise.all([
        api<Branch[]>('/branches'),
        api<Remittance[]>('/branches/remittances'),
        api<{ byBranch: ReportRow[]; totals: { remittedMinor: number; inFlightMinor: number } }>('/branches/remittances/report'),
      ]);
      setBranches(b);
      setRows(r);
      setReport(rep);
      setForm((f) => (f.fromBranchId ? f : { ...f, fromBranchId: b[0]?.id ?? '' }));
    } catch (err) { setError(err instanceof Error ? err.message : 'load failed'); }
  }

  useEffect(() => {
    void load();
    void api<{ key: string; terms: { unitPlural: string } }>('/churches/me/terminology')
      .then((t) => setUnitPlural(t.terms?.unitPlural ?? 'Branches'))
      .catch(() => undefined);
  }, []);

  async function createBranch(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/branches', { method: 'POST', body: { name: newBranch.name, code: newBranch.code, region: newBranch.region || undefined, address: newBranch.address || undefined } });
      setNewBranch({ name: '', code: '', region: '', address: '' });
      setNotice('Branch created.');
      setError('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'create failed'); }
  }

  async function submitRemittance(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const amountMinor = toPesewas(form.amount);
      if (!amountMinor || amountMinor <= 0) throw new Error('Enter a valid amount');
      await api('/branches/remittances', {
        method: 'POST',
        body: { fromBranchId: form.fromBranchId, amountMinor, reference: form.reference, note: form.note || undefined },
      });
      setForm({ ...form, amount: '', reference: '', note: '' });
      setNotice('Remittance submitted — awaits trustee approval.');
      setError('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'submit failed'); }
  }

  async function act(id: string, action: 'approve' | 'remit' | 'reject'): Promise<void> {
    try {
      await api(`/branches/remittances/${id}/${action}`, { method: 'POST', body: {} });
      setNotice(action === 'approve' ? 'Approved — step 2: mark remitted once the HQ deposit lands.' : action === 'remit' ? 'Marked REMITTED ✓' : 'Rejected.');
      setError('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'action failed'); }
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  return (
    <div>
      <h1>{unitPlural} &amp; remittances</h1>
      <p className="muted">{unitPlural.slice(0, -1) || 'Branch'} → HQ transfers with 2-step approval (submit → approve → remit). Reports roll up per {unitPlural.slice(0, -1).toLowerCase()}/region.</p>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {report ? (
        <div className="card">
          <div className="spread">
            <h2>Remittance report</h2>
            <span className="badge ok">Remitted {ghs(report.totals.remittedMinor)}</span>
            <span className="badge warn">In flight {ghs(report.totals.inFlightMinor)}</span>
          </div>
          <table>
            <thead><tr><th>Branch</th><th>Region</th><th>Submitted</th><th>Approved</th><th>Remitted</th><th>Rejected</th><th>#</th></tr></thead>
            <tbody>
              {report.byBranch.map((r) => (
                <tr key={r.branchId}>
                  <td><b>{r.name}</b> <span className="muted">{r.code}</span></td>
                  <td>{r.region ?? '—'}</td>
                  <td>{ghs(r.submittedMinor)}</td>
                  <td>{ghs(r.approvedMinor)}</td>
                  <td>{ghs(r.remittedMinor)}</td>
                  <td>{r.rejectedMinor ? <span style={{ color: 'var(--danger)' }}>{ghs(r.rejectedMinor)}</span> : '—'}</td>
                  <td className="muted">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.byBranch.length === 0 ? <p className="muted">No branches yet — add one below.</p> : null}
        </div>
      ) : null}

      <div className="card">
        <h2>Submit remittance</h2>
        <form className="stack" onSubmit={submitRemittance}>
          <div className="row">
            <label style={{ flex: 2 }}>
              From {unitPlural.slice(0, -1).toLowerCase() || 'branch'}
              <select value={form.fromBranchId} onChange={(e) => setForm({ ...form, fromBranchId: e.target.value })} required>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </label>
            <label>
              Amount (GHS)
              <input inputMode="decimal" placeholder="2500.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </label>
            <label style={{ flex: 1 }}>
              Bank/MoMo deposit ref
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required />
            </label>
          </div>
          <label>
            Note (optional)
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Sunday aggregate for week of…" />
          </label>
          <button disabled={branches.length === 0}>Submit to HQ</button>
        </form>
      </div>

      <div className="card">
        <h2>Approval queue</h2>
        {rows.filter((r) => r.status !== 'REMITTED').map((r) => (
          <div className="spread" key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <div>
              <b>{ghs(r.amountMinor)}</b> · {branchName(r.fromBranchId)} <span className="muted">{r.reference}</span>
              <div className="muted">{fmtDate(r.createdAt)}{r.note ? ` — ${r.note}` : ''}</div>
            </div>
            <div className="row">
              <span className={`badge ${r.status === 'REJECTED' ? 'err' : r.status === 'SUBMITTED' ? 'warn' : 'ok'}`}>{r.status}</span>
              {r.status === 'SUBMITTED' ? (
                <>
                  <button className="small" onClick={() => void act(r.id, 'approve')}>Approve</button>
                  <button className="small danger" onClick={() => void act(r.id, 'reject')}>Reject</button>
                </>
              ) : null}
              {r.status === 'APPROVED' ? (
                <button className="small" onClick={() => void act(r.id, 'remit')}>Mark remitted</button>
              ) : null}
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="muted">No remittances submitted yet.</p> : null}
      </div>

      <form className="card stack" onSubmit={createBranch}>
          <h2>{unitPlural} directory</h2>
        <div className="row">
          {branches.slice(0, 6).map((b) => (
            <span key={b.id} className="badge mute">{b.name} · {b.code}{b.region ? ` · ${b.region}` : ''}{b.isHq ? ' · HQ' : ''}</span>
          ))}
        </div>
        <div className="row">
          <label>Name<input value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} required /></label>
          <label>Code<input value={newBranch.code} onChange={(e) => setNewBranch({ ...newBranch, code: e.target.value })} placeholder="ACC-CENTRAL" required /></label>
          <label>Region<input value={newBranch.region} onChange={(e) => setNewBranch({ ...newBranch, region: e.target.value })} placeholder="Greater Accra" /></label>
          <label style={{ flex: 1 }}>Address<input value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} /></label>
        </div>
        <button>Add branch</button>
      </form>
    </div>
  );
}

