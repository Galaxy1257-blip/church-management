'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime, ghs } from '../../../lib/format';

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
  const [report, setReport] = useState<FundReport[]>([]);
  const [txs, setTxs] = useState<TransactionRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        api<FundReport[]>('/finance/reports/by-fund'),
        api<TransactionRow[]>('/giving/transactions?limit=50'),
      ]);
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

  const totalGiven = report.reduce((a, r) => a + r.totalMinor, 0);

  return (
    <div>
      <h1>Offerings</h1>
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <h2>By category</h2>
        <table>
          <tbody>
            {report.map((r) => (
              <tr key={r.fund}>
                <td>{r.fund}</td>
                <td className="muted">{r.count} entries</td>
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
        {report.length === 0 ? <p className="muted">No offerings recorded yet.</p> : null}
      </div>

      <div className="card">
        <h2>Recent offerings</h2>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Category</th>
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
        {txs.length === 0 ? <p className="muted">Nothing here yet — online offerings and MOBILE MONEY transfers appear automatically.</p> : null}
      </div>
    </div>
  );
}
