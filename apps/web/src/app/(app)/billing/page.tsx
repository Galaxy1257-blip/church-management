'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import BillingPanel from '../../../components/billing-panel';

function BillingInner() {
  const params = useSearchParams();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Subscription</h1>
          <p className="muted" style={{ margin: 0 }}>
            The monthly fee that keeps this workspace open.
          </p>
        </div>
        <Link href="/settings">Settings</Link>
      </div>
      <BillingPanel paidNotice={params.get('billing') === 'paid'} />
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="container">Loading…</div>}>
      <BillingInner />
    </Suspense>
  );
}
