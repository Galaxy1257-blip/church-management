'use client';
// branch → HQ remittances: submit (branch finance), 2-step approval
// (trustee approve → finance mark remitted), per-branch/region report.
// Also branch directory + create (region field for denomination reports).
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, ghs, toPesewas } from '../../../lib/format';
import type { PdfDoc } from '../../../lib/pdf';
import { sharePdf } from '../../../lib/share';
import { peekSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface Branch { id: string; name: string; code: string; address: string | null; region: string | null; isHq: boolean; isActive: boolean }
interface Remittance {
  id: string; amountMinor: number; reference: string; note: string | null; status: string; createdAt: string;
  fromBranch?: { name: string; code: string } | null; fromBranchId: string;
  submittedByName?: string; approvedByName?: string | null;
}
interface ReportRow { branchId: string; name: string; code: string; region: string | null; submittedMinor: number; approvedMinor: number; remittedMinor: number; rejectedMinor: number; count: number }
interface Report { byBranch: ReportRow[]; totals: { remittedMinor: number; inFlightMinor: number } }

/** The status codes the queue keeps are not the words a board minute uses. */
function remittanceStatus(status: string): string {
  if (status === 'SUBMITTED') return 'Waiting for approval';
  if (status === 'APPROVED') return 'Approved, not yet banked at HQ';
  if (status === 'REMITTED') return 'Reached HQ';
  if (status === 'REJECTED') return 'Sent back';
  return status;
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<Remittance[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  // denomination terms (Branch / Society / Parish / Area…)
  const [unitPlural, setUnitPlural] = useState('Branches');
  const [newBranch, setNewBranch] = useState({ name: '', code: '', region: '', address: '' });
  const [form, setForm] = useState({ fromBranchId: '', amount: '', reference: '', note: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  /**
   * The report the finance team already reads on screen, as one file the board
   * can be handed — per branch, and then every transfer still moving.
   */
  function reportDoc(rep: Report, open: Remittance[]): PdfDoc {
    const blocks = [
      {
        kind: 'fields',
        rows: [
          { label: 'Reached HQ', value: ghs(rep.totals.remittedMinor), bold: true },
          { label: 'Still in flight', value: ghs(rep.totals.inFlightMinor) },
          { label: rep.byBranch.length === 1 ? 'Branch' : 'Branches', value: String(rep.byBranch.length) },
        ],
      },
      {
        kind: 'table',
        spaceBefore: 10,
        columns: [
          { label: 'Branch', grow: 2.4 },
          { label: 'Region', grow: 1.6 },
          { label: 'Sent', grow: 1.4, align: 'right' },
          { label: 'Approved', grow: 1.5, align: 'right' },
          { label: 'Reached HQ', grow: 1.6, align: 'right' },
          { label: 'Sent back', grow: 1.4, align: 'right' },
        ],
        rows: rep.byBranch.map((r) => [
          r.code ? `${r.name} (${r.code})` : r.name,
          r.region ?? '-',
          ghs(r.submittedMinor),
          ghs(r.approvedMinor),
          ghs(r.remittedMinor),
          r.rejectedMinor ? ghs(r.rejectedMinor) : '-',
        ]),
      },
      { kind: 'heading', text: 'Every transfer still moving', spaceBefore: 12 },
      {
        kind: 'table',
        columns: [
          { label: 'Date', grow: 1.2 },
          { label: 'From', grow: 1.6 },
          { label: 'Amount', grow: 1.3, align: 'right' },
          { label: 'Deposit ref', grow: 1.5 },
          { label: 'Sent by', grow: 1.5 },
          { label: 'Approved by', grow: 1.5 },
          { label: 'Where it stands', grow: 2 },
        ],
        rows: open.map((r) => [
          fmtDate(r.createdAt),
          r.fromBranch?.name ?? branchName(r.fromBranchId),
          ghs(r.amountMinor),
          r.reference,
          r.submittedByName ?? '-',
          r.approvedByName ?? 'Not approved yet',
          `${remittanceStatus(r.status)}${r.note ? ` - ${r.note}` : ''}`,
        ]),
      },
      {
        kind: 'text',
        muted: true,
        size: 9,
        spaceBefore: 14,
        text: 'A transfer counts as reached HQ only once the deposit has been checked against the account. Nothing moves here without a second leader approving it.',
      },
    ] satisfies PdfDoc['blocks'];
    return {
      title: 'Branch remittances',
      subtitle: `What each branch sent to the head office · prepared ${fmtDate(new Date())}`,
      blocks,
      footnote: 'Two steps: the branch submits, a leader approves, and finance marks it banked.',
    };
  }

  async function shareReport(): Promise<void> {
    if (!report) return;
    setBusy(true);
    setNotice('');
    setError('');
    const result = await sharePdf({
      church: peekSession()?.church,
      doc: reportDoc(report, rows.filter((r) => r.status !== 'REMITTED')),
      filename: `remittances-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: 'Branch remittances',
      text: `Remitted ${ghs(report.totals.remittedMinor)}, in flight ${ghs(report.totals.inFlightMinor)}`,
    });
    if (result.kind === 'failed') setError(result.message);
    else if (result.message) setNotice(result.message);
    setBusy(false);
  }

  return (
    <div>
      <h1>{unitPlural} &amp; remittances</h1>
      <p className="muted">{unitPlural.slice(0, -1) || 'Branch'} → HQ transfers with 2-step approval (submit → approve → remit). Reports roll up per {unitPlural.slice(0, -1).toLowerCase()}/region.</p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      {report ? (
        <div className="card">
          <div className="spread">
            <h2>Remittance report</h2>
            <div className="row">
              <span className="badge ok">Remitted {ghs(report.totals.remittedMinor)}</span>
              <span className="badge warn">In flight {ghs(report.totals.inFlightMinor)}</span>
              <button className="small" onClick={() => void shareReport()} disabled={busy}>
                {busy ? 'Preparing...' : 'Send the report'}
              </button>
            </div>
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
              Amount (GH₵)
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

