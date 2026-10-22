'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setTokens } from '../../lib/api';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [slug, setSlug] = useState('demo');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function finishLogin(tokens: Tokens): Promise<void> {
    setTokens(tokens);
    router.replace('/dashboard');
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'password') {
        const tokens = await api<Tokens>('/auth/login', {
          method: 'POST',
          body: { churchSlug: slug, phoneE164: phone, password },
        });
        await finishLogin(tokens);
      } else if (!otpSent) {
        await api('/auth/otp/request', { method: 'POST', body: { churchSlug: slug, phoneE164: phone } });
        setOtpSent(true);
      } else {
        const tokens = await api<Tokens>('/auth/otp/verify', {
          method: 'POST',
          body: { churchSlug: slug, phoneE164: phone, code },
        });
        await finishLogin(tokens);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: '8vh' }}>
      <div className="card">
        <h1>ChMS</h1>
        <p className="muted">Sign in to your church workspace</p>
        <div className="seg-toggle" style={{ marginBottom: '0.8rem' }}>
          <button type="button" className={mode === 'password' ? 'on' : 'secondary'} onClick={() => setMode('password')}>
            Password
          </button>
          <button type="button" className={mode === 'otp' ? 'on' : 'secondary'} onClick={() => { setMode('otp'); setOtpSent(false); }}>
            SMS code
          </button>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Church URL slug
            <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </label>
          <label>
            Phone (e.g. 0241234567)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" />
          </label>
          {mode === 'password' ? (
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          ) : otpSent ? (
            <label>
              6-digit code
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required />
            </label>
          ) : null}
          {error ? <div className="error">{error}</div> : null}
          <button disabled={busy}>
            {busy ? 'Working…' : mode === 'password' ? 'Sign in' : otpSent ? 'Verify code' : 'Send code'}
          </button>
        </form>
      </div>
    </div>
  );
}
