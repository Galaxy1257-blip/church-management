'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { monthLabel } from '../../../lib/billing';
import { fmtDate, ghs } from '../../../lib/format';
import { platformApi, type PlatformPayment } from '../../../lib/platform';

const METHOD_LABEL: Record<string, string> = {
  PAYSTACK: 'Paystack',
  CASH: 'Cash',
  TRANSFER: 'Bank transfer',
};
const TONE: Record<string, string> = { PAID: 'ok', PENDING: 'warn', FAILED: 'err', CANCELLED: 'mute' };

const FILTERS = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'PAID', label: 'Paid' },
  { key: '', label: 'All' },
] as const;

export default function PlatformPaymentsPage() {
  const [status, setStatus] = useState<string>('PENDING');
  const [rows, setRows] = useState<PlatformPayment[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await platformApi<PlatformPayment[]>(
        `/platform/payments${status ? `?status=${status}` : ''}`,
      );
      setRows(list);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load payments');
    }
  }, [status]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  async function act(path: string, message: string): Promise<void> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await platformApi(path, { method: 'POST' });
      setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'that did not work');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="muted" style={{ margin: 0 }}>
            Confirm money that came in by cash or bank transfer, and keep an eye on Paystack.
          </p>
        </div>
      </div>

      {notice ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {notice}
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="seg-toggle" style={{ marginBottom: '0.8rem' }} role="tablist" aria-label="Payment filter">
        {FILTERS.map((filter) => (
          <button
            key={filter.key || 'all'}
            type="button"
            role="tab"
            aria-selected={status === filter.key}
            className={status === filter.key ? 'on' : 'secondary'}
            onClick={() => setStatus(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="card">
        {rows === null ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">
            {status === 'PENDING' ? 'Nothing is waiting for confirmation.' : 'No payments here yet.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Church</th>
                  <th>Month</th>
                  <th>Amount</th>
                  <th>How</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.church ? (
                        <Link href={`/platform/churches/${p.churchId}`}>{p.church.name}</Link>
                      ) : (
                        p.churchId.slice(0, 8)
                      )}
                    </td>
                    <td>{monthLabel(p.period)}</td>
                    <td>{ghs(p.amountMinor)}</td>
                    <td>{METHOD_LABEL[p.method]}</td>
                    <td>
                      <span className={`badge ${TONE[p.status]}`}>{p.status}</span>
                      {p.recordedByName ? (
                        <div className="muted" style={{ fontSize: '0.74rem' }}>by {p.recordedByName}</div>
                      ) : null}
                      {p.note ? <div className="muted" style={{ fontSize: '0.74rem' }}>{p.note}</div> : null}
                    </td>
                    <td>{fmtDate(p.paidAt ?? p.createdAt)}</td>
                    <td>
                      {p.status === 'PENDING' ? (
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          {p.method !== 'PAYSTACK' ? (
                            <button
                              type="button"
                              className="small"
                              disabled={busy}
                              onClick={() => {
                                if (!window.confirm(`Confirm ${ghs(p.amountMinor)} for ${monthLabel(p.period)}?`)) return;
                                void act(
                                  `/platform/payments/${p.id}/confirm`,
                                  'Cash payment confirmed and the church unlocked.',
                                );
                              }}
                            >
                              Confirm cash
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="small secondary"
                            disabled={busy}
                            onClick={() =>
                              void act(`/platform/payments/${p.id}/cancel`, 'Payment cancelled.')
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
