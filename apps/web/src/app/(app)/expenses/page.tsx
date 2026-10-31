'use client';
// Expenses: submit receipts; approver decides (submitter can't approve own).
// The month summary is totalled by the API, then sent as a PDF.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, ghs } from '../../../lib/format';
import { canShareFiles, pdfBlob, type PdfLine } from '../../../lib/pdf';
import { peekSession } from '../../../lib/session';

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
  categories: Array<{ name: string; approvedMinor: number; pendingMinor: number; count: number }>;
  items: Array<{ spentOn: string; category: string; payee: string; amountMinor: number; note: string | null }>;
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

  /** The pages a treasurer actually reads out: heading, totals, then each payment. */
  function summaryLines(s: Summary): PdfLine[] {
    const church = peekSession()?.church?.name ?? 'Church expenses';
    const lines: PdfLine[] = [
      { text: church, bold: true, size: 16 },
      { text: `Expenses - ${s.label}`, size: 12, spaceBefore: 6 },
      { text: `Total approved: ${ghs(s.approvedMinor)}`, bold: true, spaceBefore: 10 },
      { text: `Waiting for approval: ${ghs(s.pendingMinor)}`, spaceBefore: 2 },
      { text: 'Where the money went', bold: true, size: 13, spaceBefore: 14 },
    ];
    for (const c of s.categories) {
      lines.push({ text: `- ${c.name}: ${ghs(c.approvedMinor)} (${c.count} item${c.count === 1 ? '' : 's'})` });
    }
    lines.push({ text: 'Each payment', bold: true, size: 13, spaceBefore: 14 });
    for (const item of s.items) {
      lines.push({ text: `${fmtDate(item.spentOn)}  ${ghs(item.amountMinor)}  ${item.category} - ${item.payee}${item.note ? ` (${item.note})` : ''}` });
    }
    if (s.items.length === 0) lines.push({ text: 'No approved expense in this month yet.' });
    lines.push({ text: `Prepared ${fmtDate(new Date())} in the church app.`, spaceBefore: 16 });
    return lines;
  }

  function saveToPhone(file: File): void {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share(): Promise<void> {
    if (!summary) return;
    setBusy(true);
    setNotice('');
    setError('');
    const file = new File([pdfBlob(summaryLines(summary))], `expenses-${summary.month}.pdf`, { type: 'application/pdf' });
    try {
      if (canShareFiles(file)) {
        try {
          await navigator.share({
            files: [file],
            title: `Expenses - ${summary.label}`,
            text: `${summary.label}: ${ghs(summary.approvedMinor)}`,
          });
          setNotice('Done - the PDF went to WhatsApp from your phone.');
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          saveToPhone(file);
          setNotice('Your browser would not share the file, so it saved to your phone. Open WhatsApp and attach it from there.');
        }
      } else {
        saveToPhone(file);
        setNotice('This phone does not allow the app to open WhatsApp with a file attached. The PDF is in your downloads - attach it to the chat yourself.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not build the PDF');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Expenses</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

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
