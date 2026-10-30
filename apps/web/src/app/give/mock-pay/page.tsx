'use client';
// Dev-only mock checkout: stands in for the Paystack hosted page when
// PAYSTACK_MODE=mock. Completes the payment through the signed dev endpoint,
// which runs the identical webhook code path used in production.
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function MockPayInner() {
  const params = useSearchParams();
  const ref = params.get('ref') ?? '';
  const isSubscription = ref.startsWith('sub_');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function complete(success: boolean): Promise<void> {
    setStatus('busy');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/dev/mock-paystack/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: ref, success }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'failed');
      setStatus('done');
      setMessage(
        success
          ? isSubscription
            ? 'Subscription payment settled.'
            : 'Payment settled — check the SMS receipt.'
          : 'Payment marked failed.',
      );
      setTimeout(() => {
        window.location.href = isSubscription
          ? `/billing?billing=${success ? 'paid' : 'failed'}`
          : '/give/demo/thanks';
      }, 1200);
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'error');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: '8vh' }}>
      <div className="card">
        <h1>Mock checkout</h1>
        <p className="muted">
          PAYSTACK_MODE=mock — this page simulates the Paystack hosted page. Reference: <code>{ref}</code>
        </p>
        {status === 'done' ? <p style={{ color: 'var(--accent)' }}>{message}</p> : null}
        {status === 'error' ? <p className="error">{message}</p> : null}
        <div className="row">
          <button disabled={!ref || status === 'busy'} onClick={() => void complete(true)}>
            Pay successfully
          </button>
          <button className="danger" disabled={!ref || status === 'busy'} onClick={() => void complete(false)}>
            Fail payment
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MockPayPage() {
  return (
    <Suspense fallback={<div className="container">Loading…</div>}>
      <MockPayInner />
    </Suspense>
  );
}
