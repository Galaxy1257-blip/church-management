'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setTokens, getApiBase, setCustomApiUrl } from '../../lib/api';

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
  const [apiUrl, setApiUrl] = useState(() => (typeof window !== 'undefined' ? getApiBase() : ''));
  const [showConfig, setShowConfig] = useState(false);

  async function finishLogin(tokens: Tokens): Promise<void> {
    setTokens(tokens);
    router.replace('/dashboard');
  }

  function onSaveApiUrl() {
    if (!apiUrl) return;
    setCustomApiUrl(apiUrl);
    setError('');
    alert('Server URL updated to: ' + apiUrl);
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
      const msg = err instanceof Error ? err.message : 'login failed';
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
        setError(`Cannot reach API server at: ${getApiBase()}. Verify your tunnel is running or update the URL below.`);
        setShowConfig(true);
      } else {
        setError(msg);
      }
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

        <div style={{ marginTop: '1.2rem', paddingTop: '0.8rem', borderTop: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              API: {apiUrl || 'Default'}
            </span>
            <button
              type="button"
              className="secondary"
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
              onClick={() => setShowConfig(!showConfig)}
            >
              {showConfig ? 'Hide' : 'Server Settings'}
            </button>
          </div>
          {showConfig && (
            <div className="stack" style={{ marginTop: '0.6rem' }}>
              <input
                placeholder="https://...trycloudflare.com/api/v1"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
              <button
                type="button"
                className="secondary"
                style={{ fontSize: '0.82rem' }}
                onClick={onSaveApiUrl}
              >
                Save Server URL
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
