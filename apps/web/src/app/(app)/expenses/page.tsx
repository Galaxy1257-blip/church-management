'use client';
// Expenses: submit receipts; approver decides (submitter can't approve own).
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, ghs } from '../../../lib/format';

interface Expense { id: string; amountMinor: number; payee: string; spentOn: string; status: string; category?: { name: string } }
interface Category { id: string; name: string }

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ categoryId: '', amount: '', payee: '', spentOn: '', note: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const [e, c] = await Promise.all([api<Expense[]>('/expenses'), api<Category[]>('/expenses/categories')]);
      setExpenses(e); setCategories(c);
      if (!form.categoryId && c[0]) setForm((p) => ({ ...p, categoryId: c[0].id }));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/expenses', { method: 'POST', body: { categoryId: form.categoryId, amountMinor: Math.round(Number(form.amount) * 100), payee: form.payee, spentOn: new Date(form.spentOn).toISOString(), note: form.note || undefined } });
      setForm({ ...form, amount: '', payee: '', note: '' });
      setNotice('Expense submitted for approval');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function decide(id: string, approve: boolean): Promise<void> {
    try { await api(`/expenses/${id}/decide`, { method: 'POST', body: { approve } }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Expenses</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
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
        <h2>Ledger</h2>
        <table><thead><tr><th>Date</th><th>Category</th><th>Payee</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {expenses.map((x) => (
            <tr key={x.id}>
              <td>{fmtDate(x.spentOn)}</td><td>{x.category?.name ?? '—'}</td><td>{x.payee}</td><td>{ghs(x.amountMinor)}</td>
              <td><span className={`badge ${x.status === 'APPROVED' ? 'ok' : x.status === 'REJECTED' ? 'err' : 'warn'}`}>{x.status}</span></td>
              <td className="row">
                {x.status === 'SUBMITTED' ? (<>
                  <button className="sm" onClick={() => void decide(x.id, true)}>Approve</button>
                  <button className="sm danger" onClick={() => void decide(x.id, false)}>Reject</button>
                </>) : null}
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
