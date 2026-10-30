'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api, hasSession } from '../../../lib/api';
import { finishLogin, useChurchLookup, type Tokens } from '../auth-shared';

/** "Grace Chapel!" → "grace-chapel" — the ID the church will sign in with. */
function suggestId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

const MIN_PASSWORD = 6;

export default function SignupPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'new' | 'join'>('new');
  const [churchName, setChurchName] = useState('');
  const [slug, setSlug] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hasSession()) router.replace('/dashboard');
  }, [router]);

  const joinChurch = useChurchLookup(tab === 'join' ? slug : '');
  const shownId = useMemo(() => (tab === 'new' && !idTouched ? suggestId(churchName) : slug), [tab, idTouched, churchName, slug]);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) {
      setError('Please choose a password with at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      const tokens =
        tab === 'new'
          ? await api<Tokens>('/auth/register-church', {
              method: 'POST',
              body: {
                churchName,
                churchSlug: shownId,
                name,
                phoneE164: phone,
                password,
              },
            })
          : await api<Tokens>('/auth/signup', {
              method: 'POST',
              body: { churchSlug: slug, name, phoneE164: phone, password },
            });
      await finishLogin(router, tokens);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many accounts from here. Please try again in an hour.');
      } else if (err instanceof ApiError && err.status === 403 && tab === 'new') {
        setError('That church ID is taken. Try another, like a short name for your church.');
      } else if (err instanceof ApiError && tab === 'join' && err.status === 400) {
        setError('We could not find that church ID. Ask your church office for the exact ID.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not create the account. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pub-auth">
      <div className="pub-inner">
        <div className="card auth-card">
          <h2>Create your account</h2>
          <p className="auth-sub">Start a new church workspace, or join the one you already attend.</p>

          <div className="auth-tabs">
            <button type="button" className={tab === 'new' ? 'on' : 'secondary'} onClick={() => setTab('new')}>
              New church
            </button>
            <button type="button" className={tab === 'join' ? 'on' : 'secondary'} onClick={() => setTab('join')}>
              Join a church
            </button>
          </div>

          {tab === 'new' ? (
            <div className="auth-hint">
              <b>14 days free, no card</b>
              After the trial it is GHS 100 a month for the whole church — pay by MoMo, card, or cash with your
              onboarding agent.
            </div>
          ) : (
            <div className="auth-hint">
              <b>Joining as a member</b>
              You will see your own profile, giving history and the church announcements. Staff access is given by
              your church office.
            </div>
          )}

          <form className="stack" onSubmit={onSubmit}>
            {tab === 'new' ? (
              <label>
                Church name
                <input
                  value={churchName}
                  onChange={(e) => setChurchName(e.target.value)}
                  required
                  placeholder="e.g. Grace Chapel"
                />
              </label>
            ) : null}

            <label>
              Church ID
              {tab === 'new' ? (
                <input
                  value={shownId}
                  onChange={(e) => {
                    setIdTouched(true);
                    setSlug(e.target.value);
                  }}
                  required
                  placeholder="e.g. grace-chapel"
                />
              ) : (
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  placeholder="e.g. demo"
                />
              )}
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                {tab === 'new'
                  ? 'The short name people type to reach your church. Letters, numbers and dashes.'
                  : 'The ID your church office gave you.'}
              </span>
            </label>

            {tab === 'join' && joinChurch ? (
              <div className="auth-preview" style={{ marginTop: 0 }}>
                <b>{joinChurch.name}</b>
                {joinChurch.branding?.tagline ? <span className="muted">{joinChurch.branding.tagline}</span> : null}
              </div>
            ) : null}

            <label>
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Rev. Kwame Mensah"
                autoComplete="name"
              />
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

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
              />
            </label>

            {error ? <div className="error">{error}</div> : null}

            <button type="submit" disabled={busy}>
              {busy ? 'Setting up…' : tab === 'new' ? 'Create church workspace' : 'Create my account'}
            </button>
          </form>

          <p className="auth-foot">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
