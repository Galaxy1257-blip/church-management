'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { STATE_COPY, type BillingState } from '../../lib/billing';
import { ghs } from '../../lib/format';
import { platformApi, type PlatformOverview } from '../../lib/platform';

const TONE: Record<string, string> = { good: 'ok', warn: 'warn', bad: 'err', muted: 'mute' };

function stateLabel(state: string): string {
  return STATE_COPY[state as BillingState]?.label ?? state;
}

export default function PlatformOverviewPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    platformApi<PlatformOverview>('/platform/overview')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'could not load the office summary'));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const states = Object.entries(data.states).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted" style={{ margin: 0 }}>
            Every church, every subscription, one screen.
          </p>
        </div>
        <div className="head-actions">
          <Link href="/platform/churches">All churches</Link>
          <Link href="/platform/payments">Payments</Link>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <div className="card stat">
          <div className="value">{data.churches}</div>
          <div className="label">Churches</div>
        </div>
        <div className="card stat">
          <div className="value">{ghs(data.mrrMinor)}</div>
          <div className="label">Monthly recurring</div>
        </div>
        <div className="card stat">
          <div className="value">{data.trialsEndingSoon}</div>
          <div className="label">Trials ending this week</div>
        </div>
        <div className="card stat">
          <div className="value">{data.awaitingConfirmation}</div>
          <div className="label">Cash waiting to confirm</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Subscription states</h2>
          {states.length === 0 ? (
            <p className="muted">No churches yet.</p>
          ) : (
            <div className="row">
              {states.map(([state, count]) => (
                <span key={state} className={`badge ${TONE[STATE_COPY[state as BillingState]?.tone ?? 'muted']}`}>
                  {stateLabel(state)} · {count}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Newest churches</h2>
          {data.recent.length === 0 ? (
            <p className="muted">No churches yet.</p>
          ) : (
            <div className="stack">
              {data.recent.map((church) => (
                <div key={church.id} className="spread">
                  <Link href={`/platform/churches/${church.id}`}>{church.name}</Link>
                  <span className={`badge ${TONE[STATE_COPY[church.state as BillingState]?.tone ?? 'muted']}`}>
                    {stateLabel(church.state)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
