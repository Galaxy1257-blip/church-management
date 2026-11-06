'use client';
// Expenses: submit receipts; approver decides (submitter can't approve own).
// The month summary is totalled by the API, then sent as a PDF on the church's
// own letterhead.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, ghs } from '../../../lib/format';
import type { PdfBlock, PdfDoc } from '../../../lib/pdf';
import { sharePdf } from '../../../lib/share';
import { peekSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface Expense {
  id: string;
  amountMinor: number;
  payee: string;
  spentOn: string;
  status: string;
  category?: { name: string };
}
interface Category {
  id: string;
  name: string;
}
interface Summary {
  month: string;
  label: string;
  approvedMinor: number;
  pendingMinor: number;
  signOffBy: string[];
  categories: Array<{ name: string; approvedMinor: number; pendingMinor: number; count: number }>;
  items: Array<{ spentOn: string; category: string; payee: string; amountMinor: number; note: string | null; startedByName: string; approvedByName: string }>;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The ledger stores status codes; people read words. */
function statusLabel(status: string): string {
  if (status === 'SUBMITTED') return 'Waiting';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return status;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [month, setMonth] = useState(thisMonth);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState({ categoryId: '', amount: '', payee: '', spentOn: '', note: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      const [e, c, s] = await Promise.all([
        api<Expense[]>('/expenses'),
        api<Category[]>('/expenses/categories'),
        api<Summary>(`/expenses/summary?month=${month}`),
      ]);
      setExpenses(e);
      setCategories(c);
      setSummary(s);
      if (!form.categoryId && c[0]) setForm((p) => ({ ...p, categoryId: c[0].id }));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    }
  }
  useEffect(() => {
    void load();
  }, [month]);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/expenses', {
        method: 'POST',
        body: {
          categoryId: form.categoryId,
          amountMinor: Math.round(Number(form.amount) * 100),
          payee: form.payee,
          spentOn: new Date(form.spentOn).toISOString(),
          note: form.note || undefined,
        },
      });
      setForm({ ...form, amount: '', payee: '', note: '' });
      setNotice('Expense submitted for approval');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    }
  }

  async function decide(id: string, approve: boolean): Promise<void> {
    try {
      await api(`/expenses/${id}/decide`, { method: 'POST', body: { approve } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    }
  }

  /** What a treasurer actually hands to the board: the totals, then every payment. */
  function summaryDoc(s: Summary): PdfDoc {
    const blocks: PdfBlock[] = [
      {
        kind: 'fields',
        rows: [
          { label: 'Total approved', value: ghs(s.approvedMinor), bold: true },
          { label: 'Waiting for approval', value: ghs(s.pendingMinor) },
          { label: 'Payments in the month', value: String(s.items.length) },
          { label: 'Signed off by', value: s.signOffBy.length ? s.signOffBy.join(', ') : 'No payment signed off yet' },
        ],
      },
      { kind: 'heading', text: 'Where the money went', spaceBefore: 8 },
      {
        kind: 'table',
        columns: [{ label: 'Category', grow: 3 }, { label: 'Approved', grow: 2, align: 'right' }, { label: 'Items', grow: 1, align: 'right' }],
        rows: s.categories.map((c) => [c.name, ghs(c.approvedMinor), String(c.count)]),
      },
      { kind: 'heading', text: 'Each payment', spaceBefore: 10 },
      {
        kind: 'table',
        columns: [
          { label: 'Date', grow: 1.3 },
          { label: 'Paid to', grow: 2.2 },
          { label: 'Amount', grow: 1.3, align: 'right' },
          { label: 'Started by', grow: 1.9 },
          { label: 'Approved by', grow: 1.9 },
        ],
        rows: s.items.map((item) => [
          fmtDate(item.spentOn),
          item.note ? `${item.payee} (${item.note})` : item.payee,
          ghs(item.amountMinor),
          item.startedByName,
          item.approvedByName,
        ]),
      },
    ];
    return {
      title: `Expenses - ${s.label}`,
      subtitle: `Approved and paid out in ${s.label}.`,
      blocks,
      footnote: `Prepared ${fmtDate(new Date())} in the church app. Figures come from the expense ledger. Each payment was started by one leader and approved by a second, as recorded in the app.`,
    };
  }

  async function share(): Promise<void> {
    if (!summary) return;
    setBusy(true);
    setNotice('');
    setError('');
    const result = await sharePdf({
      church: peekSession()?.church,
      doc: summaryDoc(summary),
      filename: `expenses-${summary.month}.pdf`,
      title: `Expenses - ${summary.label}`,
      text: `${summary.label}: ${ghs(summary.approvedMinor)}`,
    });
    if (result.kind === 'failed') setError(result.message);
    else if (result.message) setNotice(result.message);
    setBusy(false);
  }

  return (
    <div>
      <h1>Expenses</h1>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="card">
        <h2>Month total</h2>
        <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
          <label>For which month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} />
          </label>
        </div>
        {summary ? (
          <>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{ghs(summary.approvedMinor)}</div>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              approved and paid out in {summary.label}
              {summary.pendingMinor > 0 ? ` - another ${ghs(summary.pendingMinor)} is waiting for approval` : ''}
            </p>
            {summary.categories.length > 0 ? (
              <table>
                <thead>
                  <tr><th>Category</th><th>Total</th><th>Items</th></tr>
                </thead>
                <tbody>
                  {summary.categories.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td>{ghs(c.approvedMinor)}</td>
                      <td className="muted">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Nothing was spent in {summary.label} yet.</p>
            )}
            <button onClick={() => void share()} disabled={busy}>
              {busy ? 'Preparing...' : 'Send summary as PDF'}
            </button>
            <p className="muted" style={{ fontSize: '0.85rem', margin: '6px 0 0' }}>
              Opens WhatsApp on your phone with the month as a PDF, so the board can read it. Nothing is sent without you
              picking the chat.
            </p>
          </>
        ) : (
          <p className="muted">Loading the totals...</p>
        )}
      </div>

      <div className="card">
        <h2>Submit expense</h2>
        <form className="stack" onSubmit={submit}>
          <div className="row">
            <label style={{ flex: 1 }}>Category
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>Amount (GHS)<input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" required /></label>
          </div>
          <div className="row">
            <label style={{ flex: 1 }}>Payee<input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} required /></label>
            <label>Spent on<input type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} required /></label>
          </div>
          <label>Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button>Submit</button>
        </form>
      </div>
      <div className="card">
        <h2>Recent entries</h2>
        <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
          The newest {expenses.length} submissions for this church, of every month. Use the month above for a total.
        </p>
        <table><thead><tr><th>Date</th><th>Category</th><th>Payee</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {expenses.map((x) => (
            <tr key={x.id}>
              <td>{fmtDate(x.spentOn)}</td><td>{x.category?.name ?? '—'}</td><td>{x.payee}</td><td>{ghs(x.amountMinor)}</td>
              <td><span className={`badge ${x.status === 'APPROVED' ? 'ok' : x.status === 'REJECTED' ? 'err' : 'warn'}`}>{statusLabel(x.status)}</span></td>
              <td className="row">
                {x.status === 'SUBMITTED' ? (<>
                  <button className="small" onClick={() => void decide(x.id, true)}>Approve</button>
                  <button className="small danger" onClick={() => void decide(x.id, false)}>Reject</button>
                </>) : null}
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
