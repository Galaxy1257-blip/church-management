'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, fmtDateTime, ghs, toPesewas } from '../../../lib/format';

interface Batch {
  id: string;
  label: string;
  serviceId: string;
  status: string;
  countedMinor: number | null;
  countedBy1: string | null;
  countedBy2: string | null;
  approvedBy: string | null;
  createdAt: string;
}

interface Service {
  id: string;
  name: string;
}

interface Fund {
  id: string;
  name: string;
}

interface FundReport {
  fund: string;
  totalMinor: number;
  count: number;
}

interface TransactionRow {
  id: string;
  reference: string;
  giftMinor: number;
  status: string;
  channel: string | null;
  paidAt: string | null;
  fund?: { name: string };
}

export default function FinancePage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [report, setReport] = useState<FundReport[]>([]);
  const [txs, setTxs] = useState<TransactionRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createFor, setCreateFor] = useState('');
  const [label, setLabel] = useState('');
  const [entryBatch, setEntryBatch] = useState<string | null>(null);
  const [entry, setEntry] = useState({ fundId: '', amount: '', channel: 'CASH', bankRef: '' });
  const [countInput, setCountInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [b, s, f, r, t] = await Promise.all([
        api<Batch[]>('/finance/batches'),
        api<Service[]>('/services'),
        api<Fund[]>('/giving/funds'),
        api<FundReport[]>('/finance/reports/by-fund'),
        api<TransactionRow[]>('/giving/transactions?limit=50'),
      ]);
      setBatches(b);
      setServices(s);
      setFunds(f);
      setReport(r);
      setTxs(t);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body?: unknown, msg?: string): Promise<void> {
    try {
      await api(path, { method: 'POST', body });
      setNotice(msg ?? 'done');
      setError('');
      await load();
    } catch (e) {
      setNotice('');
      setError(e instanceof Error ? e.message : 'action failed');
    }
  }

  async function createBatch(e: FormEvent): Promise<void> {
    e.preventDefault();
    await act('/finance/batches', { serviceId: createFor, label: label || 'Collection' }, 'Batch created');
    setLabel('');
  }

  async function addEntry(e: FormEvent): Promise<void> {
    e.preventDefault();
    const pesewas = toPesewas(entry.amount);
    if (!pesewas || pesewas <= 0) {
      setError('enter a valid amount');
      return;
    }
    await act(
      `/finance/batches/${entryBatch}/entries`,
      { entries: [{ fundId: entry.fundId, amountMinor: pesewas, channel: entry.channel, bankRef: entry.bankRef || undefined }] },
      'Entry added',
    );
    setEntry({ fundId: '', amount: '', channel: 'CASH', bankRef: '' });
  }

  const totalGiven = report.reduce((a, r) => a + r.totalMinor, 0);

  return (
    <div>
      <h1>Finance</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="grid cols-2">
        <div className="card">
          <h2>By fund</h2>
          <table>
            <tbody>
              {report.map((r) => (
                <tr key={r.fund}>
                  <td>{r.fund}</td>
                  <td className="muted">{r.count} gifts</td>
                  <td style={{ textAlign: 'right' }}>{ghs(r.totalMinor)}</td>
                </tr>
              ))}
              <tr>
                <td><strong>Total</strong></td>
                <td />
                <td style={{ textAlign: 'right' }}><strong>{ghs(totalGiven)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>New cash/cheque batch</h2>
          <form className="stack" onSubmit={createBatch}>
            <label>
              Service
              <select value={createFor} onChange={(e) => setCreateFor(e.target.value)} required>
                <option value="">— choose —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label>
              Label
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Sunday offering" />
            </label>
            <button>Create batch</button>
          </form>
        </div>
      </div>
      <div className="card">
        <h2>Batches (two counters → separate approver)</h2>
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Created</th>
              <th>Counted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td>
                <td>{fmtDate(b.createdAt)}</td>
                <td>{b.countedMinor !== null ? ghs(b.countedMinor) : '—'}</td>
                <td>
                  <span
                    className={`badge ${
                      b.status === 'APPROVED' || b.status === 'DEPOSITED'
                        ? 'ok'
                        : b.status === 'COUNTED'
                          ? 'warn'
                          : 'mute'
                    }`}
                  >
                    {b.status}
                  </span>
                </td>
                <td className="row">
                  {b.status === 'OPEN' ? (
                    <>
                      <button className="small secondary" onClick={() => setEntryBatch(entryBatch === b.id ? null : b.id)}>
                        Entries
                      </button>
                      <input
                        style={{ width: 110 }}
                        placeholder="123.45"
                        value={countInput[b.id] ?? ''}
                        onChange={(e) => setCountInput({ ...countInput, [b.id]: e.target.value })}
                      />
                      <button
                        className="small"
                        onClick={() => {
                          const v = toPesewas(countInput[b.id] ?? '');
                          if (v === null) {
                            setError('bad count amount');
                            return;
                          }
                          void act(`/finance/batches/${b.id}/count`, { countedMinor: v }, 'Count recorded');
                        }}
                      >
                        Record count
                      </button>
                    </>
                  ) : null}
                  {b.status === 'COUNTED' ? (
                    <>
                      <span className="muted">2 counts in</span>
                      <button
                        className="small"
                        onClick={() =>
                          void act(`/finance/batches/${b.id}/approve`, undefined, 'Approved — cash marked SUCCESS')
                        }
                      >
                        Approve
                      </button>
                    </>
                  ) : null}
                  {b.status === 'APPROVED' ? (
                    <button
                      className="small"
                      onClick={() => {
                        const ref = prompt('Deposit reference?');
                        if (ref) void act(`/finance/batches/${b.id}/deposit`, { depositRef: ref }, 'Marked deposited');
                      }}
                    >
                      Mark deposited
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {batches.length === 0 ? <p className="muted">No batches yet.</p> : null}

        {entryBatch ? (
          <form className="stack" onSubmit={addEntry} style={{ marginTop: '0.8rem' }}>
            <h3 style={{ margin: 0 }}>Add entry to batch</h3>
            <div className="row">
              <select value={entry.fundId} onChange={(e) => setEntry({ ...entry, fundId: e.target.value })} required>
                <option value="">Fund…</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <input
                placeholder="amount e.g. 50.00"
                value={entry.amount}
                onChange={(e) => setEntry({ ...entry, amount: e.target.value })}
                required
              />
              <select value={entry.channel} onChange={(e) => setEntry({ ...entry, channel: e.target.value })}>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="MOBILE_MONEY">MoMo transfer (manual)</option>
              </select>
              <input
                placeholder={entry.channel === 'CASH' ? 'bank ref (optional)' : 'ref # required (cheque no. / MoMo txn id)'}
                value={entry.bankRef}
                onChange={(e) => setEntry({ ...entry, bankRef: e.target.value })}
                required={entry.channel !== 'CASH'}
              />
              <button>Add</button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="card">
        <h2>Recent transactions</h2>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Fund</th>
              <th>Amount</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td className="muted">{t.reference.slice(0, 18)}…</td>
                <td>{t.fund?.name ?? '—'}</td>
                <td>{ghs(t.giftMinor)}</td>
                <td>{t.channel ?? '—'}</td>
                <td>
                  <span className={`badge ${t.status === 'SUCCESS' ? 'ok' : t.status === 'PENDING' ? 'warn' : 'err'}`}>
                    {t.status}
                  </span>
                </td>
                <td>{fmtDateTime(t.paidAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
