'use client';
// Subscription card: status, Paystack checkout, the cash claim, and history.
// Used by /billing (the link on the paused-workspace screen) and by the
// Subscription tab in Settings — one implementation, two doors.
import { useCallback, useEffect, useState } from 'react';
import {
  STATE_COPY,
  billingPayments,
  billingStatus,
  claimCash,
  monthLabel,
  startCheckout,
  type BillingPayment,
  type BillingStatus,
} from '../lib/billing';
import { fmtDate, ghs } from '../lib/format';

const METHOD_LABEL: Record<BillingPayment['method'], string> = {
  PAYSTACK: 'Paystack',
  CASH: 'Cash',
  TRANSFER: 'Bank transfer',
};

const STATUS_LABEL: Record<BillingPayment['status'], string> = {
  PAID: 'Paid',
  PENDING: 'Waiting',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

const STATUS_TONE: Record<BillingPayment['status'], string> = {
  PAID: 'ok',
  PENDING: 'warn',
  FAILED: 'err',
  CANCELLED: 'mute',
};

const TONE_CLASS = { good: 'ok', warn: 'warn', bad: 'err', muted: 'mute' } as const;

function stateLine(s: BillingStatus): string {
  switch (s.state) {
    case 'trial':
      return `Free trial — every area is open until ${fmtDate(s.coveredUntil)}.`;
    case 'active':
      return `Paid until ${fmtDate(s.coveredUntil)}.`;
    case 'grace':
      return `Payment is late. Everything still works for ${s.graceDaysLeft} more day${
        s.graceDaysLeft === 1 ? '' : 's'
      } — the workspace pauses on ${fmtDate(s.locksAt)}.`;
    case 'paused':
      return s.billingLocked
        ? 'A platform admin paused this workspace. Contact support to open it again.'
        : 'The workspace is paused until this month is paid.';
    case 'exempt':
      return 'This church does not pay a monthly subscription.';
    default:
      return 'This church is active and no monthly payment is set up.';
  }
}

export default function BillingPanel({ paidNotice = false }: { paidNotice?: boolean }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    paidNotice ? 'Payment received — the workspace opens as soon as it is confirmed.' : '',
  );
  const [busy, setBusy] = useState<'pay' | 'claim' | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [payer, setPayer] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([billingStatus(), billingPayments()]);
      setStatus(s);
      setPayments(p);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load the subscription');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pay(): Promise<void> {
    setError('');
    setNotice('');
    setBusy('pay');
    try {
      const result = await startCheckout();
      window.location.href = result.authorizationUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not start the payment');
      setBusy(null);
    }
  }

  async function submitClaim(): Promise<void> {
    setError('');
    setBusy('claim');
    try {
      await claimCash({
        method,
        payerName: payer.trim() || undefined,
        note: note.trim() || undefined,
      });
      setClaimOpen(false);
      setPayer('');
      setNote('');
      setNotice('Sent. The office will confirm it, and the workspace opens after that.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not send the cash notice');
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return (
      <div className="card">
        {error ? (
          <>
            <p className="error">{error}</p>
            <button className="secondary" type="button" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    );
  }

  const copy = STATE_COPY[status.state];
  const pending = payments.find((p) => p.status === 'PENDING');
  const needsPaying = status.state === 'paused' && !status.billingLocked;
  const canPay = !status.billingLocked && !['exempt', 'grandfathered'].includes(status.state);
  const supportLock = status.billingLocked;

  return (
    <div className="stack">
      {notice ? (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 0 }}>
          {notice}
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div>
            <span className={`badge ${TONE_CLASS[copy.tone]}`}>{copy.label}</span>
            <h2 style={{ margin: '0.45rem 0 0.15rem' }}>
              {status.state === 'exempt' ? 'No subscription' : `${status.amountLabel} a month`}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {stateLine(status)}
            </p>
          </div>
          {status.state !== 'exempt' && status.state !== 'grandfathered' ? (
            <div style={{ textAlign: 'right' }}>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                Paid day of the month
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{status.billingDay}</div>
            </div>
          ) : null}
        </div>

        {needsPaying ? (
          <div
            className="card"
            style={{ margin: '0.9rem 0 0', borderColor: 'var(--terracotta)', background: 'var(--bg)' }}
          >
            <strong>The workspace is paused.</strong>
            <p className="muted" style={{ margin: '0.2rem 0 0' }}>
              Pay {status.amountLabel} to open every area again.
            </p>
          </div>
        ) : null}

        {pending ? (
          <p className="muted" style={{ margin: '0.8rem 0 0' }}>
            A {METHOD_LABEL[pending.method].toLowerCase()} payment for {monthLabel(pending.period)} is
            waiting for the office to confirm it.
          </p>
        ) : null}

        {canPay ? (
          <div className="row" style={{ marginTop: '0.9rem' }}>
            <button type="button" disabled={busy !== null} onClick={() => void pay()}>
              {busy === 'pay'
                ? 'Opening Paystack…'
                : `Pay ${status.amountLabel} with Paystack`}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy !== null}
              onClick={() => setClaimOpen(!claimOpen)}
              aria-expanded={claimOpen}
            >
              I paid cash or by transfer
            </button>
          </div>
        ) : null}

        {canPay && status.nextPeriod && !pending ? (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
            This payment covers {monthLabel(status.nextPeriod)}.
          </p>
        ) : null}

        {supportLock ? (
          <p className="muted" style={{ margin: '0.8rem 0 0' }}>
            Payments do not open a paused workspace. The platform office has to resume it.
          </p>
        ) : null}

        {claimOpen && canPay ? (
          <form
            className="stack"
            style={{ marginTop: '0.9rem', borderTop: '1px solid var(--line)', paddingTop: '0.8rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              void submitClaim();
            }}
          >
            <p className="muted" style={{ margin: 0 }}>
              Tell the office how you paid. They will check the money and confirm it here.
            </p>
            <label>
              How did you pay?
              <select value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'TRANSFER')}>
                <option value="CASH">Cash</option>
                <option value="TRANSFER">Bank transfer</option>
              </select>
            </label>
            <label>
              Who paid? (optional)
              <input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="e.g. Grace Owusu" />
            </label>
            <label>
              Note for the office (optional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. paid at the church office on Tuesday"
              />
            </label>
            <div className="row">
              <button type="submit" disabled={busy !== null}>
                {busy === 'claim' ? 'Sending…' : 'Send to the office'}
              </button>
              <button type="button" className="secondary" onClick={() => setClaimOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Payment history</h2>
        {payments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No payments yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Amount</th>
                  <th>How</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{monthLabel(p.period)}</td>
                    <td>{ghs(p.amountMinor)}</td>
                    <td>{METHOD_LABEL[p.method]}</td>
                    <td>
                      <span className={`badge ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    </td>
                    <td>{fmtDate(p.paidAt ?? p.createdAt)}</td>
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
