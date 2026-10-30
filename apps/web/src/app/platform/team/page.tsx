'use client';
// The office team. Only the owner sees this page: it is where onboarder logins
// are created, turned off and given a new password. Onboarders never see it.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { fmtDate, fmtDateTime } from '../../../lib/format';
import {
  platformApi,
  platformUser,
  type PlatformRole,
  type PlatformStaff,
} from '../../../lib/platform';

const ROLE_LABEL: Record<PlatformRole, string> = {
  OWNER: 'Owner',
  ONBOARDER: 'Onboarder',
  SUPPORT: 'Support',
};

const ROLE_HINT: Record<PlatformRole, string> = {
  OWNER: 'Everything, including money, new churches and this team page.',
  ONBOARDER: 'Sets up and supports churches: people, sections, imports and extras. No money or church creation.',
  SUPPORT: 'Same as an onboarder.',
};

export default function PlatformTeamPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [staff, setStaff] = useState<PlatformStaff[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ONBOARDER' as 'ONBOARDER' | 'SUPPORT' });
  const [selected, setSelected] = useState<PlatformStaff | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    setIsOwner(platformUser()?.role === 'OWNER');
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await platformApi<PlatformStaff[]>('/platform/staff');
      setStaff(rows);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load the team');
    }
  }, []);

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

  async function run(fn: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'that did not work');
    } finally {
      setBusy(false);
    }
  }

  async function createStaff(e: FormEvent): Promise<void> {
    e.preventDefault();
    await run(
      () => platformApi('/platform/staff', { method: 'POST', body: form }),
      `${form.name.trim()} can now sign in to the office. Give them the password in person.`,
    );
    setForm({ name: '', email: '', password: '', role: 'ONBOARDER' });
    setAdding(false);
  }

  if (isOwner === false) {
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Team</h1>
        <p className="muted" style={{ margin: 0 }}>
          Only an owner can see or change office logins. Ask the owner if you need access changed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>Team</h1>
          <p className="muted" style={{ margin: 0 }}>
            Office logins. Onboarders set up and support churches; only owners touch money.
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          {adding ? 'Close' : 'Add an onboarder'}
        </button>
      </div>

      {notice ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {notice}
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      {adding ? (
        <form className="card stack" onSubmit={createStaff}>
          <h2 style={{ margin: 0 }}>New office login</h2>
          <p className="muted" style={{ margin: 0 }}>
            This is not a church account. They sign in at the office page with this email and password.
          </p>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Password (at least 10 characters)
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={10}
              autoComplete="new-password"
            />
          </label>
          <div>
            <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Role</div>
            <div className="row" style={{ marginTop: '0.3rem' }}>
              {(['ONBOARDER', 'SUPPORT'] as const).map((role) => (
                <label key={role} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="staff-role"
                    checked={form.role === role}
                    onChange={() => setForm({ ...form, role })}
                  />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
            <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.8rem' }}>
              {ROLE_HINT[form.role]}
            </p>
          </div>
          <div className="row">
            <button disabled={busy}>{busy ? 'Creating…' : 'Create login'}</button>
            <button type="button" className="secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Office logins</h2>
        {staff.length === 0 ? (
          <p className="muted">No office logins yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>{row.email}</div>
                      <div className="muted" style={{ fontSize: '0.72rem' }}>added {fmtDate(row.createdAt)}</div>
                    </td>
                    <td>{ROLE_LABEL[row.role]}</td>
                    <td>
                      <span className={`badge ${row.isActive ? 'ok' : 'err'}`}>
                        {row.isActive ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td>{row.lastLoginAt ? fmtDateTime(row.lastLoginAt) : 'Never'}</td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button
                          type="button"
                          className="small secondary"
                          onClick={() => {
                            setSelected(selected?.id === row.id ? null : row);
                            setNewPassword('');
                          }}
                        >
                          Password
                        </button>
                        <button
                          type="button"
                          className={row.isActive ? 'small danger' : 'small secondary'}
                          disabled={busy}
                          onClick={() => {
                            if (row.isActive && !window.confirm(`Turn off ${row.name}? They lose office access immediately.`)) {
                              return;
                            }
                            void run(
                              () =>
                                platformApi(`/platform/staff/${row.id}`, {
                                  method: 'PATCH',
                                  body: { isActive: !row.isActive },
                                }),
                              row.isActive ? `${row.name} is turned off.` : `${row.name} is back on.`,
                            );
                          }}
                        >
                          {row.isActive ? 'Turn off' : 'Turn on'}
                        </button>
                      </div>
                      {selected?.id === row.id ? (
                        <div className="row" style={{ marginTop: '0.4rem' }}>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New password (10+)"
                            minLength={10}
                            autoComplete="new-password"
                            style={{ minWidth: 170 }}
                          />
                          <button
                            type="button"
                            className="small"
                            disabled={busy || newPassword.length < 10}
                            onClick={() =>
                              void run(async () => {
                                await platformApi(`/platform/staff/${row.id}/password`, {
                                  method: 'POST',
                                  body: { password: newPassword },
                                });
                                setNewPassword('');
                                setSelected(null);
                              }, `Password changed for ${row.name}. Give it to them in person.`)
                            }
                          >
                            Save
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What each role can do</h2>
        <table>
          <tbody>
            {(Object.keys(ROLE_LABEL) as PlatformRole[]).map((role) => (
              <tr key={role}>
                <th style={{ width: 110 }}>{ROLE_LABEL[role]}</th>
                <td className="muted">{ROLE_HINT[role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
