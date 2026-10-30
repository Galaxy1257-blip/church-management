'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import {
  platformApi,
  platformToken,
  savePlatformSession,
  type PlatformUser,
} from '../../../lib/platform';

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (platformToken()) router.replace('/platform');
  }, [router]);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await platformApi<{
        accessToken: string;
        expiresInSec: number;
        user: PlatformUser;
      }>('/platform/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      savePlatformSession(result.accessToken, result.user);
      router.replace('/platform');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: '9vh' }}>
      <div className="card">
        <span className="badge mute">Platform staff</span>
        <h1 style={{ margin: '0.55rem 0 0.15rem' }}>ChMS Office</h1>
        <p className="muted">
          The support backend for every church on the platform. Church accounts sign in at the{' '}
          <Link href="/login">main app</Link>.
        </p>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
