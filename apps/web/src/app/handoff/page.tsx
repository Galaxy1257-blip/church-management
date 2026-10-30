'use client';
// The platform office hands a staff member back to their church with a 90-second
// single-use token. This page swaps it for a normal session and opens the app.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setTokens } from '../../lib/api';
import { clearSession } from '../../lib/session';

function HandoffInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('This link is missing its sign-in token.');
      return;
    }
    let alive = true;
    api<{ accessToken: string; expiresInSec: number }>('/auth/handoff', {
      method: 'POST',
      body: { token },
      retry: false,
    })
      .then(async (result) => {
        if (!alive) return;
        setTokens({ ...result, refreshToken: '' });
        clearSession();
        const me = await api<{ permissions: string[] }>('/auth/me');
        router.replace(me.permissions.length > 0 ? '/dashboard' : '/portal');
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'this link has expired');
      });
    return () => {
      alive = false;
    };
  }, [token, router]);

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: '10vh' }}>
      <div className="card">
        <h1>Opening the workspace</h1>
        {error ? (
          <>
            <p className="error">{error}</p>
            <p className="muted">
              The link can only be used once and lasts about two minutes. Ask the platform office
              for a fresh one.
            </p>
          </>
        ) : (
          <p className="muted">Signing you in…</p>
        )}
      </div>
    </div>
  );
}

export default function HandoffPage() {
  return (
    <Suspense fallback={<div className="container">Loading…</div>}>
      <HandoffInner />
    </Suspense>
  );
}
