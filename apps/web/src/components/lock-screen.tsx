'use client';
// Full-page screen shown by the app shell when billing has paused the church.
// Nothing is lost: every area opens again as soon as the month is paid.
import { ghs } from '../lib/format';

export default function LockScreen({
  churchName,
  amountMinor,
  canPay,
  onPay,
  onLogout,
}: {
  churchName: string;
  amountMinor: number;
  canPay: boolean;
  onPay: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="container" style={{ maxWidth: 460, paddingTop: '10vh' }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <span className="badge err">Paused</span>
        <h1 style={{ margin: '0.6rem 0 0.2rem' }}>Workspace paused</h1>
        <p className="muted" style={{ marginTop: 0 }}>{churchName}</p>
        <p>
          The monthly subscription has not been paid, so this workspace is resting. Everything is
          saved — {ghs(amountMinor)} opens every area again.
        </p>
        {canPay ? (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <button type="button" onClick={onPay}>
              Pay subscription
            </button>
            <button type="button" className="secondary" onClick={onLogout}>
              Log out
            </button>
          </div>
        ) : (
          <>
            <p className="muted">
              Ask a church admin to pay the subscription, or contact the platform office if you
              think this is a mistake.
            </p>
            <button type="button" className="secondary" onClick={onLogout}>
              Log out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
