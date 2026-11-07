'use client';
// Public self-join: the church's code is the gate, so a stranger who finds the
// link still cannot add themselves. The person becomes a member immediately and
// can sign in to the companion with that phone number.
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Notice from '../../../components/notice';
import BackBar from '../../../components/back-bar';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function JoinPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [church, setChurch] = useState<{ name: string; enabled: boolean } | null>(null);
  const [form, setForm] = useState({ code: '', firstName: '', lastName: '', phoneE164: '', dob: '' });
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`${API}/churches/join/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setChurch)
      .catch(() => setChurch(null));
  }, [slug]);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/churches/join/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? 'Could not add you — check the code and try again.');
        return;
      }
      setDone(`You are on the list (${data.memberNo}). Sign in with this phone number to open your church app.`);
      setForm({ code: '', firstName: '', lastName: '', phoneE164: '', dob: '' });
    } catch {
      setError('Could not reach the church right now — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 460, paddingTop: '8vh' }}>
      <BackBar />
      <div className="card">
        <h1>{church?.name ?? 'Join your church'}</h1>
        <p className="muted">
          Type the code your church gave you. The office can see the code on their Settings page.
        </p>
        {church && !church.enabled ? (
          <p className="muted">This church is not taking sign-ups from the app yet — ask the church office to add you.</p>
        ) : (
          <>
            {done ? <Notice text={done} onDone={() => setDone('')} /> : null}
            {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
            <form className="stack" onSubmit={submit}>
              <label>Church code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} autoCapitalize="characters" required /></label>
              <label>First name<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
              <label>Last name<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
              <label>Phone<input value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })} inputMode="tel" placeholder="024 123 4567" required /></label>
              <label>Date of birth (optional)<input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></label>
              <button disabled={busy}>{busy ? 'Adding you…' : 'Add me to the church'}</button>
            </form>
          </>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          <a href="/login">Already on the list? Sign in</a>
        </p>
      </div>
    </div>
  );
}
