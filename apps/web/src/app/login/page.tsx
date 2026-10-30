'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setTokens } from '../../lib/api';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

interface PublicChurch {
  name: string;
  pastorDisplayName?: string | null;
  branding?: { logoDataUrl?: string | null; tagline?: string | null; primaryColor?: string | null } | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'otp' | 'signup'>('password');
  const [slug, setSlug] = useState('demo');
  const [name, setName] = useState('');
  const [church, setChurch] = useState<PublicChurch | null>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = slug.trim().toLowerCase();
    if (!s) { setChurch(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      api<PublicChurch>(`/public/${encodeURIComponent(s)}`)
        .then((c) => { if (alive) setChurch(c); })
        .catch(() => { if (alive) setChurch(null); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [slug]);

  async function finishLogin(tokens: Tokens): Promise<void> {
    setTokens(tokens);
    // Members hold no staff permissions: send them to the member portal before
    // the staff shell can render anything at all.
    try {
      const me = await api<{ permissions: string[] }>('/auth/me');
      router.replace(me.permissions.length > 0 ? '/dashboard' : '/portal');
    } catch {
      router.replace('/dashboard');
    }
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const tokens = await api<Tokens>('/auth/signup', {
          method: 'POST',
          body: { churchSlug: slug, name, phoneE164: phone, password },
        });
        await finishLogin(tokens);
      } else if (mode === 'password') {
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
        {church ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '0.2rem 0 0.8rem', textAlign: 'center' }}>
            {church.branding?.logoDataUrl ? (
              <img src={church.branding.logoDataUrl} alt="" style={{ maxWidth: 72, maxHeight: 72, borderRadius: 10 }} />
            ) : null}
            <div style={{ fontWeight: 700, fontSize: '1.15rem', lineHeight: 1.3 }}>{church.name}</div>
            {church.branding?.tagline ? <div className="muted">{church.branding.tagline}</div> : null}
          </div>
        ) : (
          <p className="muted">Sign in to your church workspace</p>
        )}
        <div className="seg-toggle" style={{ marginBottom: '0.8rem' }}>
          <button type="button" className={mode === 'password' ? 'on' : 'secondary'} onClick={() => setMode('password')}>Password</button>
          <button type="button" className={mode === 'otp' ? 'on' : 'secondary'} onClick={() => { setMode('otp'); setOtpSent(false); }}>SMS code</button>
          <button type="button" className={mode === 'signup' ? 'on' : 'secondary'} onClick={() => setMode('signup')}>Create account</button>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Church id
            <input value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="e.g. demo" />
          </label>
          {mode === 'signup' ? (
            <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Kwame Mensah" /></label>
          ) : null}
          <label>
            Phone (e.g. +233240000000)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" />
          </label>
          {mode !== 'otp' ? (
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          ) : otpSent ? (
            <label>6-digit code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required /></label>
          ) : null}
          {error ? <div className="error">{error}</div> : null}
          <button disabled={busy}>
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : mode === 'password' ? 'Sign in' : otpSent ? 'Verify code' : 'Send code'}
          </button>
        </form>
      </div>
    </div>
  );
}
