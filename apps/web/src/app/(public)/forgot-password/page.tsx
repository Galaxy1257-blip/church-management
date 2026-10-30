'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '../../../lib/api';
import { useChurchLookup } from '../auth-shared';

const MIN_PASSWORD = 6;
const RESEND_WAIT = 60;

const STEPS = ['Your phone', 'Code', 'New password'];

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [wait, setWait] = useState(0);

  const church = useChurchLookup(slug);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode(showError: boolean): Promise<void> {
    setError('');
    setBusy(true);
    try {
      // 202 even when the account is unknown, so this page cannot be used to
      // check which phone numbers have accounts.
      await api('/auth/password/forgot', { method: 'POST', body: { churchSlug: slug, phoneE164: phone } });
      setStep(1);
      setWait(RESEND_WAIT);
      if (showError) setCode('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many codes requested. Please wait an hour and try again.');
      } else {
        setError('Could not send the code right now. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    if (step === 0) {
      await sendCode(false);
      return;
    }
    if (step === 1) {
      if (code.trim().length < 6) {
        setError('Enter the 6-digit code from the SMS.');
        return;
      }
      setStep(2);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError('Please choose a password with at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/password/reset', {
        method: 'POST',
        body: { churchSlug: slug, phoneE164: phone, code: code.trim(), password },
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('That code is wrong or has expired. Ask for a new one.');
        setStep(1);
        setCode('');
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many tries. Please wait a while and start again.');
      } else {
        setError('Could not change the password. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pub-auth">
      <div className="pub-inner">
        <div className="card auth-card">
          {done ? (
            <>
              <h2>Password changed</h2>
              <p className="auth-sub">
                Your password is set. For safety, every other device signed in to this account was signed out.
              </p>
              <Link
                href={`/login?church=${encodeURIComponent(slug.trim().toLowerCase())}`}
                className="pub-btn full"
              >
                Sign in now
              </Link>
            </>
          ) : (
            <>
              <h2>Forgot your password?</h2>
              <p className="auth-sub">We text a 6-digit code to the phone number on your account.</p>

              <div className="auth-steps">
                {STEPS.map((label, i) => (
                  <div key={label} className={`auth-step ${i === step ? 'on' : i < step ? 'done' : ''}`}>
                    {i + 1} · {label}
                  </div>
                ))}
              </div>

              {church && step > 0 ? (
                <div className="auth-preview">
                  <b>{church.name}</b>
                </div>
              ) : null}

              <form className="stack" onSubmit={onSubmit}>
                {step === 0 ? (
                  <>
                    <label>
                      Church ID
                      <input value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="e.g. demo" />
                    </label>
                    <label>
                      Phone number
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        inputMode="tel"
                        placeholder="+233 24 000 0000"
                        autoComplete="tel"
                      />
                    </label>
                  </>
                ) : null}

                {step === 1 ? (
                  <>
                    <label>
                      6-digit code
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        inputMode="numeric"
                        required
                        placeholder="000000"
                      />
                    </label>
                    <div className="auth-hint">
                      <b>Did not get it?</b>
                      Check that the number matches the one your church office has. You can ask for a new code{' '}
                      {wait > 0 ? `in ${wait} seconds` : 'now'}.
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      style={{ width: '100%' }}
                      disabled={wait > 0 || busy}
                      onClick={() => sendCode(true)}
                    >
                      Send a new code
                    </button>
                  </>
                ) : null}

                {step === 2 ? (
                  <label>
                    New password
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={MIN_PASSWORD}
                      autoComplete="new-password"
                    />
                  </label>
                ) : null}

                {error ? <div className="error">{error}</div> : null}

                <button type="submit" disabled={busy}>
                  {busy
                    ? 'Working…'
                    : step === 0
                      ? 'Send code'
                      : step === 1
                        ? 'Next'
                        : 'Change my password'}
                </button>
              </form>

              <p className="auth-foot">
                <Link href="/login" className="link">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="muted" style={{ maxWidth: 430, margin: '0.9rem auto 0', textAlign: 'center' }}>
          Cannot receive the SMS? Call your church office — a leader or our support desk can set a new password for
          you.
        </p>
      </div>
    </div>
  );
}
