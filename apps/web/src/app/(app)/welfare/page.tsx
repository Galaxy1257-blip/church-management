'use client';
// Welfare: money the church gives to a member in need. The situation behind each
// request is stored encrypted, and the API decrypts it for this screen only —
// whoever approves a payout has to be able to read what they are approving.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, ghs, toPesewas } from '../../../lib/format';
import { hasPermission } from '../../../lib/access';
import { peekSession } from '../../../lib/session';
import MemberDrawer from '../../../components/member-drawer';
import Notice from '../../../components/notice';

interface Welfare {
  id: string;
  memberId: string | null;
  category: string;
  status: string;
  amountRequestedMinor: number | null;
  createdAt: string;
  /** null when the stored note cannot be opened (written before the tag was kept). */
  description: string | null;
  /** null = the leaders handle it. */
  assignedToMemberId?: string | null;
  member?: { firstName: string; lastName: string } | null;
}
interface MemberOption {
  id: string;
  firstName: string;
  lastName: string;
}

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'FUNERAL', label: 'Funeral' },
  { value: 'SCHOOL_FEES', label: 'School fees' },
  { value: 'RENT', label: 'Rent' },
  { value: 'OTHER', label: 'Other need' },
];

/** The ledger stores status codes; people read words. */
function statusLabel(status: string): string {
  if (status === 'SUBMITTED') return 'Waiting';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'DECLINED') return 'Declined';
  return status.toLowerCase();
}

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value.toLowerCase();
}

export default function WelfarePage() {
  const [rows, setRows] = useState<Welfare[]>([]);
  const [people, setPeople] = useState<MemberOption[]>([]);
  const [perms, setPerms] = useState<string[]>([]);
  const [form, setForm] = useState({ memberId: '', category: 'MEDICAL', description: '', amount: '', assignedTo: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const granted = peekSession()?.permissions ?? [];
      setPerms(granted);
      const [list, found] = await Promise.all([
        api<Welfare[]>('/welfare'),
        hasPermission(granted, 'members:read')
          ? api<{ items: MemberOption[] }>('/members?pageSize=200').then((r) => r.items).catch(() => [])
          : Promise.resolve([]),
      ]);
      setRows(list);
      setPeople(found);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load the welfare list');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const amountMinor = form.amount ? toPesewas(form.amount) : null;
    if (form.amount && amountMinor === null) {
      setError('Write the amount as a number, like 400 or 400.50.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/welfare', {
        method: 'POST',
        body: {
          memberId: form.memberId,
          category: form.category,
          description: form.description,
          amountRequestedMinor: amountMinor ?? undefined,
          assignedToMemberId: form.assignedTo || undefined,
        },
      });
      setForm({ memberId: '', category: form.category, description: '', amount: '', assignedTo: '' });
      setNotice('Request recorded. The situation is stored encrypted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save the request');
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: 'APPROVED' | 'DECLINED'): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await api(`/welfare/${id}/decide`, { method: 'POST', body: { status } });
      setNotice(status === 'APPROVED' ? 'Approved.' : 'Declined.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not record the decision');
    } finally {
      setBusy(false);
    }
  }

  const waiting = rows.filter((r) => r.status === 'SUBMITTED');
  const canDecide = hasPermission(perms, 'welfare:write');

  return (
    <div>
      <h1>Welfare</h1>
      <p className="muted">
        Help given to members in need — rent, a hospital bill, school fees. Write down what is going on, then
        approve or decline it. The situation is kept secret in the database and shown here so you know what you
        are deciding.
      </p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      {canDecide ? (
        <div className="card">
          <h2>New request</h2>
          <form className="stack" onSubmit={submit}>
            <label>
              Who is asking
              <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} required>
                <option value="">Choose a member</option>
                {people.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What it is for
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What is going on
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Two months of rent behind; the family is keeping it quiet."
                required
              />
            </label>
            <label>
              Amount asked for (GHS)
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" placeholder="400" />
            </label>
            <label>
              Who handles it
              <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                <option value="">The leaders</option>
                {people.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
              The leaders always see every request. Pick a member and it also shows in their own app to follow up.
            </p>
            <button disabled={busy || !form.memberId || !form.description}>Submit request</button>
          </form>
        </div>
      ) : null}

      <div className="card">
        <h2>{waiting.length > 0 ? `Waiting for a decision (${waiting.length})` : 'Requests'}</h2>
        {rows.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>For</th>
                <th>Situation</th>
                <th>Amount</th>
                <th>Asked on</th>
                <th>Status</th>
                {canDecide ? <th>Decide</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    {w.member ? (
                      <button type="button" className="link-button" onClick={() => setOpenMemberId(w.memberId)}>
                        {w.member.firstName} {w.member.lastName}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{categoryLabel(w.category)}</td>
                  <td style={{ maxWidth: 260 }}>
                    {w.description ?? <span className="muted">Not readable — written before we kept the code</span>}
                  </td>
                  <td>{w.amountRequestedMinor != null ? ghs(w.amountRequestedMinor) : <span className="muted">no amount</span>}</td>
                  <td>{fmtDate(w.createdAt)}</td>
                  <td>
                    <span className={`badge ${w.status === 'APPROVED' ? 'ok' : w.status === 'DECLINED' ? 'err' : 'warn'}`}>
                      {statusLabel(w.status)}
                    </span>
                    <div className="muted" style={{ fontSize: '0.78rem' }}>
                      {w.assignedToMemberId
                        ? `With ${people.find((p) => p.id === w.assignedToMemberId)?.firstName ?? 'a member'}`
                        : 'With the leaders'}
                    </div>
                  </td>
                  {canDecide ? (
                    <td className="row">
                      {w.status === 'SUBMITTED' ? (
                        <>
                          <button className="small" disabled={busy} onClick={() => void decide(w.id, 'APPROVED')}>
                            Approve
                          </button>
                          <button className="small danger" disabled={busy} onClick={() => void decide(w.id, 'DECLINED')}>
                            Decline
                          </button>
                        </>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openMemberId ? <MemberDrawer memberId={openMemberId} onClose={() => setOpenMemberId(null)} /> : null}
    </div>
  );
}
