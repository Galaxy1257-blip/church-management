'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api, hasSession } from '../../../lib/api';
import { finishLogin, useChurchLookup, type Tokens } from '../auth-shared';

const LAST_CHURCH_KEY = 'chms.lastChurch';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hasSession()) router.replace('/dashboard');
  }, [router]);

  useEffect(() => {
    const fromLink = params.get('church');
    if (fromLink) {
      setSlug(fromLink);
      return;
    }
    // Re-opening sign-in on the same phone should not mean retyping the church id.
    const last = localStorage.getItem(LAST_CHURCH_KEY);
    if (last) setSlug(last);
  }, [params]);

  const church = useChurchLookup(slug);

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
        localStorage.setItem(LAST_CHURCH_KEY, slug.trim().toLowerCase());
        await finishLogin(router, tokens);
      } else if (!otpSent) {
        await api('/auth/otp/request', { method: 'POST', body: { churchSlug: slug, phoneE164: phone } });
        setOtpSent(true);
      } else {
        const tokens = await api<Tokens>('/auth/otp/verify', {
          method: 'POST',
          body: { churchSlug: slug, phoneE164: phone, code },
        });
        await finishLogin(router, tokens);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many tries. Please wait a minute and try again.');
      } else if (err instanceof ApiError && err.code === 'INVALID_PHONE') {
        setError(err.message);
      } else if (mode === 'password') {
        // The church ID is remembered between visits, so name the church the
        // form is pointing at — a stale ID otherwise looks like a bad password.
        setError(
          church
            ? `We could not sign you in to ${church.name}. Check your phone number and password.`
            : 'We could not find that church. Check the Church ID.',
        );
      } else {
        setError('That code did not work. Ask for a new one.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pub-auth">
      <div className="pub-inner">
        <div className="card auth-card">
          <h2>Welcome back</h2>
          <p className="auth-sub">Sign in to your church workspace.</p>

          {church ? (
            <div className="auth-preview">
              {church.branding?.logoDataUrl ? (
                <img src={church.branding.logoDataUrl} alt="" />
              ) : (
                <span className="avatar avatar-lg">{church.name.slice(0, 2).toUpperCase()}</span>
              )}
              <b>{church.name}</b>
              {church.branding?.tagline ? <span className="muted">{church.branding.tagline}</span> : null}
            </div>
          ) : null}

          <form className="stack" onSubmit={onSubmit}>
            <label>
              Church ID
              <input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setOtpSent(false);
                }}
                required
                placeholder="e.g. demo"
                autoComplete="organization"
              />
            </label>

            <label>
              Phone number
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setOtpSent(false);
                }}
                required
                inputMode="tel"
                placeholder="+233 24 000 0000"
                autoComplete="tel"
              />
            </label>

            {mode === 'password' ? (
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
            ) : otpSent ? (
              <label>
                6-digit code from the SMS
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required />
              </label>
            ) : (
              <div className="auth-hint">
                <b>Use your SMS code</b>
                We text a 6-digit code to the phone number your church has for you. It works for 5 minutes.
              </div>
            )}

            {mode === 'password' ? (
              <div className="auth-row">
                <span />
                <Link href="/forgot-password" className="link">
                  Forgot password?
                </Link>
              </div>
            ) : null}

            {error ? <div className="error">{error}</div> : null}

            <button type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'password' ? 'Sign in' : otpSent ? 'Verify code' : 'Send code'}
            </button>
          </form>

          <div className="auth-or">or</div>
          <button
            type="button"
            className="secondary"
            style={{ width: '100%' }}
            onClick={() => {
              setMode(mode === 'password' ? 'otp' : 'password');
              setOtpSent(false);
              setError('');
            }}
          >
            {mode === 'password' ? 'Use a 6-digit SMS code' : 'Use your password'}
          </button>

          <p className="auth-foot">
            New here? <Link href="/signup">Create an account</Link>
          </p>
        </div>

        <p className="muted" style={{ maxWidth: 430, margin: '0.9rem auto 0', textAlign: 'center' }}>
          Staff and members use the same sign-in. Each person sees only what their role allows.
        </p>
      </div>
    </div>
  );
}
