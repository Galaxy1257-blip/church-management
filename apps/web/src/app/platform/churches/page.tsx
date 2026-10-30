'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { STATE_COPY, type BillingState } from '../../../lib/billing';
import { fmtDate, ghs } from '../../../lib/format';
import {
  platformApi,
  platformUser,
  type PlatformChurchRow,
} from '../../../lib/platform';

const TONE: Record<string, string> = { good: 'ok', warn: 'warn', bad: 'err', muted: 'mute' };

function stateLabel(state: string): string {
  return STATE_COPY[state as BillingState]?.label ?? state;
}

const BLANK = { name: '', slug: '', adminName: '', adminPhoneE164: '', adminPassword: '' };

export default function PlatformChurchesPage() {
  const [rows, setRows] = useState<PlatformChurchRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const isOwner = platformUser()?.role === 'OWNER';

  const load = useCallback(async (q: string) => {
    try {
      const list = await platformApi<PlatformChurchRow[]>(
        `/platform/churches${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
      );
      setRows(list);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load churches');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  async function createChurch(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await platformApi<{ churchId: string; slug: string }>('/platform/churches', {
        method: 'POST',
        body: form,
      });
      setForm(BLANK);
      setAdding(false);
      setNotice(`Church "${created.slug}" created. Its admin can sign in with the church id.`);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not create the church');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Churches</h1>
          <p className="muted" style={{ margin: 0 }}>
            Open a church to work on its users, sections or subscription.
          </p>
        </div>
        {isOwner ? (
          <div className="head-actions">
            <button type="button" className="secondary" onClick={() => setAdding(!adding)} aria-expanded={adding}>
              {adding ? 'Close' : 'Add a church'}
            </button>
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {notice}
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      {adding && isOwner ? (
        <form className="card stack" onSubmit={createChurch} style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>New church</h2>
          <p className="muted" style={{ margin: 0 }}>
            This creates the workspace, its first admin and the 14-day trial.
          </p>
          <label>
            Church name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Grace Chapel"
            />
          </label>
          <label>
            Church id (the short name people type to sign in)
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              required
              placeholder="e.g. gracechapel"
            />
          </label>
          <label>
            Admin name
            <input
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              required
            />
          </label>
          <label>
            Admin phone
            <input
              value={form.adminPhoneE164}
              onChange={(e) => setForm({ ...form, adminPhoneE164: e.target.value })}
              required
              inputMode="tel"
              placeholder="+233240000000"
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              required
              minLength={6}
            />
          </label>
          <div className="row">
            <button disabled={busy}>{busy ? 'Creating…' : 'Create church'}</button>
            <button type="button" className="secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="card">
        <label style={{ maxWidth: 380 }}>
          Find a church
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or church id"
          />
        </label>

        {rows === null ? (
          <p className="muted" style={{ marginTop: '0.8rem' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted" style={{ marginTop: '0.8rem' }}>No church matches “{query.trim()}”.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '0.8rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Church</th>
                  <th>Subscription</th>
                  <th>People</th>
                  <th>Users</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/platform/churches/${row.id}`}>
                        <strong>{row.name}</strong>
                      </Link>
                      <div className="muted" style={{ fontSize: '0.78rem' }}>{row.slug}</div>
                    </td>
                    <td>
                      <span className={`badge ${TONE[STATE_COPY[row.billing.state as BillingState]?.tone ?? 'muted']}`}>
                        {stateLabel(row.billing.state)}
                      </span>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {ghs(row.billing.amountMinor)} · day {row.billing.billingDay ?? '—'}
                      </div>
                    </td>
                    <td>{row.members}</td>
                    <td>{row.users}</td>
                    <td>{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
