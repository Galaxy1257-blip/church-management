'use client';
// One church as the office sees it: subscription, app sections, staff users,
// payments to confirm and the audit trail of everything staff changed.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { MODULE_KEYS, MODULE_LABELS } from '../../../../lib/access';
import { STATE_COPY, monthLabel, type BillingState } from '../../../../lib/billing';
import { fmtDate, fmtDateTime, ghs, toPesewas } from '../../../../lib/format';
import {
  platformApi,
  platformUser,
  type CustomFeature,
  type ImportPreview,
  type PlatformChurchDetail,
  type PlatformChurchUser,
  type PlatformPayment,
} from '../../../../lib/platform';

const TONE: Record<string, string> = { good: 'ok', warn: 'warn', bad: 'err', muted: 'mute' };
const ROLE_OPTIONS = [
  { key: 'SUPER_ADMIN', label: 'Super admin' },
  { key: 'PASTOR', label: 'Pastor' },
  { key: 'FINANCE_ADMIN', label: 'Finance admin' },
  { key: 'SECRETARY', label: 'Secretary' },
  { key: 'ELDER', label: 'Elder' },
  { key: 'LEADER', label: 'Leader' },
  { key: 'FOLLOWUP_TEAM', label: 'Follow-up team' },
  { key: 'USHER', label: 'Usher' },
  { key: 'MEMBER', label: 'Member' },
];
const METHOD_LABEL: Record<string, string> = {
  PAYSTACK: 'Paystack',
  CASH: 'Cash',
  TRANSFER: 'Bank transfer',
};
const PAYMENT_TONE: Record<string, string> = {
  PAID: 'ok',
  PENDING: 'warn',
  FAILED: 'err',
  CANCELLED: 'mute',
};

function stateLabel(state: string): string {
  return STATE_COPY[state as BillingState]?.label ?? state;
}

export default function PlatformChurchPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const isOwner = platformUser()?.role === 'OWNER';

  const [data, setData] = useState<PlatformChurchDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await platformApi<PlatformChurchDetail>(`/platform/churches/${id}`);
      setData(detail);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not load the church');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/platform/churches" className="small-link">
            ← Churches
          </Link>
          <h1 style={{ marginTop: '0.2rem' }}>{data?.church.name ?? 'Church'}</h1>
          {data ? (
            <p className="muted" style={{ margin: 0 }}>
              {data.church.slug} · added {fmtDate(data.church.createdAt)} · {data.members} people
            </p>
          ) : null}
        </div>
        {data ? (
          <span
            className={`badge ${TONE[STATE_COPY[data.church.billing.state]?.tone ?? 'muted']}`}
          >
            {stateLabel(data.church.billing.state)}
          </span>
        ) : null}
      </div>

      {notice ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          {notice}
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
      {!data ? <p className="muted">{error ? '' : 'Loading…'}</p> : null}

      {data ? (
        <>
          <BillingCard
            data={data}
            isOwner={isOwner}
            busy={busy}
            onSave={(body, message) =>
              run(() => platformApi(`/platform/churches/${id}`, { method: 'PATCH', body }), message)
            }
          />

          <ModulesCard
            data={data}
            busy={busy}
            onSave={(modules, message) =>
              run(() => platformApi(`/platform/churches/${id}`, { method: 'PATCH', body: { modules } }), message)
            }
          />

          <ExtrasCard
            features={data.church.customFeatures}
            busy={busy}
            onSave={(features, message) =>
              run(
                () => platformApi(`/platform/churches/${id}`, { method: 'PATCH', body: { customFeatures: features } }),
                message,
              )
            }
          />

          <MembersImportCard churchId={id} busy={busy} run={run} />

          <UsersCard
            churchId={id}
            users={data.users}
            busy={busy}
            run={run}
          />

          <PaymentsCard payments={data.payments} busy={busy} run={run} />

          <AuditCard rows={data.audit} />
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ billing
function BillingCard({
  data,
  isOwner,
  busy,
  onSave,
}: {
  data: PlatformChurchDetail;
  isOwner: boolean;
  busy: boolean;
  onSave: (body: Record<string, unknown>, message: string) => Promise<void>;
}) {
  const billing = data.church.billing;
  const [fee, setFee] = useState((billing.amountMinor / 100).toFixed(2));
  const [day, setDay] = useState(billing.billingDay);
  const [grace, setGrace] = useState(billing.graceDays);
  const [exempt, setExempt] = useState(billing.plan === 'exempt');
  const [paused, setPaused] = useState(billing.billingLocked);
  const [email, setEmail] = useState(data.church.billingEmail ?? '');
  const [phone, setPhone] = useState(data.church.billingPhone ?? '');
  const [note, setNote] = useState(data.church.billingNote ?? '');
  const [localError, setLocalError] = useState('');

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const minor = toPesewas(fee);
    if (minor === null) {
      setLocalError('Enter the fee as cedis, e.g. 100 or 100.00');
      return;
    }
    setLocalError('');
    await onSave(
      {
        monthlyFeeMinor: minor,
        billingDay: day,
        graceDays: grace,
        billingExempt: exempt,
        billingLocked: paused,
        billingEmail: email.trim() || null,
        billingPhone: phone.trim() || null,
        billingNote: note.trim() || null,
      },
      'Subscription settings saved.',
    );
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Subscription</h2>
        <div className="stack">
          <div className="spread">
            <span className="muted">State</span>
            <span className={`badge ${TONE[STATE_COPY[billing.state]?.tone ?? 'muted']}`}>
              {stateLabel(billing.state)}
            </span>
          </div>
          <div className="spread">
            <span className="muted">Monthly fee</span>
            <strong>{billing.amountLabel}</strong>
          </div>
          <div className="spread">
            <span className="muted">Paid day of the month</span>
            <span>{billing.billingDay}</span>
          </div>
          <div className="spread">
            <span className="muted">Covered until</span>
            <span>{fmtDate(billing.coveredUntil)}</span>
          </div>
          <div className="spread">
            <span className="muted">Pauses on</span>
            <span>{fmtDate(billing.locksAt)}</span>
          </div>
          <div className="spread">
            <span className="muted">Grace days</span>
            <span>{billing.graceDays}</span>
          </div>
          {billing.billingLocked ? (
            <p className="muted" style={{ margin: 0 }}>
              Support lock is on. Paying does not resume the workspace; switch the lock off below.
            </p>
          ) : null}
          {data.church.billingEmail || data.church.billingPhone ? (
            <p className="muted" style={{ margin: 0 }}>
              Billing contact: {[data.church.billingEmail, data.church.billingPhone].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {data.church.billingNote ? (
            <p className="muted" style={{ margin: 0 }}>Note: {data.church.billingNote}</p>
          ) : null}
        </div>
      </div>

      {isOwner ? (
        <form className="card stack" onSubmit={submit}>
          <h2 style={{ margin: 0 }}>Change billing</h2>
          <label>
            Monthly fee (GHS)
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" required />
          </label>
          <div className="row">
            <label style={{ flex: 1 }}>
              Paid day (1–28)
              <input
                type="number"
                min={1}
                max={28}
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
              />
            </label>
            <label style={{ flex: 1 }}>
              Grace days
              <input
                type="number"
                min={0}
                max={60}
                value={grace}
                onChange={(e) => setGrace(Number(e.target.value))}
              />
            </label>
          </div>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={exempt} onChange={(e) => setExempt(e.target.checked)} />
            No monthly fee for this church
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
            Pause the workspace (support lock)
          </label>
          <label>
            Billing email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
          <label>
            Billing phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </label>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. agreed 50% discount" />
          </label>
          {localError ? <div className="error">{localError}</div> : null}
          <button disabled={busy}>{busy ? 'Saving…' : 'Save billing'}</button>
        </form>
      ) : (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Change billing</h2>
          <p className="muted">Only an owner can change fees, dates, exemptions or the support lock.</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ modules
function ModulesCard({
  data,
  busy,
  onSave,
}: {
  data: PlatformChurchDetail;
  busy: boolean;
  onSave: (modules: Record<string, boolean>, message: string) => Promise<void>;
}) {
  const [modules, setModules] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const key of MODULE_KEYS) next[key] = data.church.modules[key] ?? data.church.moduleDefaults[key] ?? false;
    return next;
  });

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>App sections</h2>
      <p className="muted">
        Switch whole areas on or off for this church. Nothing is deleted; members can switch them back on themselves.
      </p>
      <div className="grid cols-3">
        {MODULE_KEYS.map((key) => (
          <label key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <input
              type="checkbox"
              checked={modules[key] !== false}
              onChange={(e) => setModules({ ...modules, [key]: e.target.checked })}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>{MODULE_LABELS[key].label}</strong>
              <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                {MODULE_LABELS[key].hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: '0.7rem' }}>
        <button disabled={busy} onClick={() => void onSave(modules, 'App sections saved.')}>
          Save app sections
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ extras
function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return base.length >= 2 ? base : 'extra';
}

function uniqueKey(label: string, taken: Set<string>): string {
  const base = slugify(label);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 50; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now() % 1000}`;
}

/**
 * The "one church asked for this" switch. Adds a small named extra (a page, a
 * link, a marker) to THIS church only; nothing changes for anyone else.
 */
function ExtrasCard({
  features,
  busy,
  onSave,
}: {
  features: CustomFeature[];
  busy: boolean;
  onSave: (features: CustomFeature[], message: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<CustomFeature[]>(features);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [href, setHref] = useState('');

  function add(): void {
    if (!label.trim()) return;
    const key = uniqueKey(label, new Set(rows.map((r) => r.key)));
    setRows([
      ...rows,
      {
        key,
        label: label.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(href.trim() ? { href: href.trim() } : {}),
        enabled: true,
      },
    ]);
    setLabel('');
    setDescription('');
    setHref('');
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Extras for this church</h2>
      <p className="muted">
        Something only this church asked for: a named page, a link to another tool, or a note. It appears under
        Extras in their menu; every other church is untouched.
      </p>

      {rows.length === 0 ? (
        <p className="muted">No extras yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>On</th>
                <th>Name</th>
                <th>Link</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Show ${row.label}`}
                      checked={row.enabled}
                      onChange={(e) =>
                        setRows(rows.map((r) => (r.key === row.key ? { ...r, enabled: e.target.checked } : r)))
                      }
                    />
                  </td>
                  <td>
                    <strong>{row.label}</strong>
                    <div className="muted" style={{ fontSize: '0.72rem' }}>{row.key}</div>
                    {row.description ? (
                      <div className="muted" style={{ fontSize: '0.78rem' }}>{row.description}</div>
                    ) : null}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{row.href ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="small secondary"
                      onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="stack" style={{ marginTop: '0.8rem' }}>
        <div className="row">
          <label style={{ flex: 1 }}>
            Name they will see
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Youth camp sign-up" />
          </label>
          <label style={{ flex: 1 }}>
            Link (optional)
            <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/extras/... or https://..." />
          </label>
        </div>
        <label>
          Short note (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line telling them what it is for"
          />
        </label>
        <div className="row">
          <button type="button" className="secondary" disabled={!label.trim()} onClick={add}>
            Add to the list
          </button>
          <button type="button" disabled={busy} onClick={() => void onSave(rows, 'Extras saved for this church.')}>
            Save extras
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ member import
function MembersImportCard({
  churchId,
  busy,
  run,
}: {
  churchId: string;
  busy: boolean;
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function check(): Promise<void> {
    setChecking(true);
    setError('');
    setResult(null);
    try {
      const next = await platformApi<ImportPreview>(`/platform/churches/${churchId}/members/preview`, {
        method: 'POST',
        body: { csvText: csv },
      });
      setPreview(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not read that list');
    } finally {
      setChecking(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!preview) return;
    const rows = preview.rows
      .filter((row) => row.errors.length === 0 && !row.duplicateOfExisting)
      .map((row) => row.input);
    if (rows.length === 0) {
      setError('Nothing on this list can be imported yet. Fix the rows marked in red.');
      return;
    }
    await run(async () => {
      const done = await platformApi<{ imported: number; failed: number }>(
        `/platform/churches/${churchId}/members/confirm`,
        { method: 'POST', body: { rows } },
      );
      setResult(done);
      setPreview(null);
      setCsv('');
    }, `Imported ${rows.length} people.`);
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Import members</h2>
      <p className="muted">
        Paste a list from Excel or Google Sheets. Columns: <strong>firstName, lastName</strong> (required), then
        phone, email, gender, dob (YYYY-MM-DD) and memberNo. The check step writes nothing.
      </p>
      <label>
        The list
        <textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setPreview(null);
            setResult(null);
          }}
          rows={6}
          placeholder={'firstName,lastName,phone\nAma,Mensah,+233240000001\nKofi,Owusu,0244000002'}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
        />
      </label>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <button type="button" className="secondary" disabled={checking || !csv.trim()} onClick={() => void check()}>
          {checking ? 'Checking…' : 'Check the list'}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {result ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Imported {result.imported} people{result.failed ? `; ${result.failed} rows were skipped` : ''}.
        </p>
      ) : null}

      {preview ? (
        <div style={{ marginTop: '0.8rem' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            {preview.totalRows} rows: {preview.validRows} ready, {preview.errorRows} with mistakes,{' '}
            {preview.duplicatesExisting} already in the church.
          </p>
          <div style={{ overflowX: 'auto', maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((row) => {
                  const ok = row.errors.length === 0 && !row.duplicateOfExisting;
                  return (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>
                        {row.input.firstName} {row.input.lastName}
                      </td>
                      <td>{row.normalizedPhone ?? row.input.phoneE164 ?? '—'}</td>
                      <td>
                        {ok ? (
                          <span className="badge ok">Ready</span>
                        ) : (
                          <span className="badge warn">
                            {row.duplicateOfExisting ? 'Already here' : row.errors.join('; ') || 'Skipped'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <button type="button" disabled={busy || preview.validRows === 0} onClick={() => void confirm()}>
              Import {preview.validRows} people
            </button>
            <button type="button" className="secondary" onClick={() => setPreview(null)}>
              Start over
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ users
function UsersCard({
  churchId,
  users,
  busy,
  run,
}: {
  churchId: string;
  users: PlatformChurchUser[];
  busy: boolean;
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<PlatformChurchUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phoneE164: '', password: '' });
  const [addRoles, setAddRoles] = useState<string[]>(['MEMBER']);

  function toggleRole(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  async function createUser(e: FormEvent): Promise<void> {
    e.preventDefault();
    await run(
      () =>
        platformApi('/platform/users', {
          method: 'POST',
          body: { churchId, ...addForm, roleKeys: addRoles.length ? addRoles : ['MEMBER'] },
        }),
      'User created. Give them the temporary password in person.',
    );
    setAddForm({ name: '', phoneE164: '', password: '' });
    setAddRoles(['MEMBER']);
    setAdding(false);
  }

  async function impersonate(user: PlatformChurchUser): Promise<void> {
    const tab = window.open('', '_blank');
    try {
      const result = await platformApi<{ url: string; name: string }>(
        `/platform/users/${user.id}/impersonate`,
        { method: 'POST' },
      );
      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    } catch (e) {
      tab?.close();
      alert(e instanceof Error ? e.message : 'could not open the church');
    }
  }

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: '0.6rem' }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <button type="button" className="secondary small" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          {adding ? 'Close' : 'Add a user'}
        </button>
      </div>

      {adding ? (
        <form className="stack" onSubmit={createUser} style={{ marginBottom: '0.9rem' }}>
          <div className="row">
            <label style={{ flex: 1 }}>
              Name
              <input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                required
              />
            </label>
            <label style={{ flex: 1 }}>
              Phone
              <input
                value={addForm.phoneE164}
                onChange={(e) => setAddForm({ ...addForm, phoneE164: e.target.value })}
                required
                inputMode="tel"
                placeholder="+233240000000"
              />
            </label>
          </div>
          <label>
            Temporary password
            <input
              type="password"
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              required
              minLength={6}
            />
          </label>
          <div className="row">
            {ROLE_OPTIONS.map((role) => (
              <label key={role.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={addRoles.includes(role.key)}
                  onChange={() => setAddRoles(toggleRole(addRoles, role.key))}
                />
                {role.label}
              </label>
            ))}
          </div>
          <div className="row">
            <button disabled={busy}>Create user</button>
            <button type="button" className="secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {users.length === 0 ? (
        <p className="muted">No users in this church yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Roles</th>
                <th>Last sign-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    {user.isActive ? null : (
                      <span className="badge err" style={{ marginLeft: 6 }}>
                        Off
                      </span>
                    )}
                    {user.email ? <div className="muted" style={{ fontSize: '0.75rem' }}>{user.email}</div> : null}
                  </td>
                  <td>{user.phoneE164}</td>
                  <td style={{ fontSize: '0.82rem' }}>{user.roles.map((r) => r.name).join(', ') || '—'}</td>
                  <td>{user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : 'Never'}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button
                        type="button"
                        className="small secondary"
                        disabled={!user.isActive}
                        onClick={() => void impersonate(user)}
                      >
                        Open as
                      </button>
                      <button type="button" className="small secondary" onClick={() => setSelected(user)}>
                        Manage
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <UserEditor user={selected} busy={busy} run={run} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function UserEditor({
  user,
  busy,
  run,
  onClose,
}: {
  user: PlatformChurchUser;
  busy: boolean;
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [roles, setRoles] = useState<string[]>(user.roles.map((r) => r.key));
  const [password, setPassword] = useState('');

  function toggleRole(key: string): void {
    setRoles(roles.includes(key) ? roles.filter((k) => k !== key) : [...roles, key]);
  }

  return (
    <div className="card" style={{ marginTop: '0.9rem', background: 'var(--bg)' }}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>Working on {user.name}</h3>
        <button type="button" className="small secondary" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="grid cols-2" style={{ marginTop: '0.7rem' }}>
        <div className="stack">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  platformApi(`/platform/users/${user.id}`, {
                    method: 'PATCH',
                    body: { name: name.trim(), email: email.trim() || null },
                  }),
                'Profile saved.',
              )
            }
          >
            Save profile
          </button>
          <button
            type="button"
            className={user.isActive ? 'danger' : 'secondary'}
            disabled={busy}
            onClick={() => {
              if (user.isActive && !window.confirm(`Turn off ${user.name}? They will be signed out.`)) return;
              void run(
                () =>
                  platformApi(`/platform/users/${user.id}`, {
                    method: 'PATCH',
                    body: { isActive: !user.isActive },
                  }),
                user.isActive ? 'User turned off and signed out.' : 'User turned back on.',
              );
            }}
          >
            {user.isActive ? 'Turn off this user' : 'Turn this user back on'}
          </button>
        </div>

        <div className="stack">
          <div>
            <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Roles</div>
            <div className="row" style={{ marginTop: '0.3rem' }}>
              {ROLE_OPTIONS.map((role) => (
                <label key={role.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={roles.includes(role.key)} onChange={() => toggleRole(role.key)} />
                  {role.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="secondary"
              style={{ marginTop: '0.5rem' }}
              disabled={busy || roles.length === 0}
              onClick={() =>
                void run(
                  () => platformApi(`/platform/users/${user.id}/roles`, { method: 'POST', body: { roleKeys: roles } }),
                  'Roles saved.',
                )
              }
            >
              Save roles
            </button>
          </div>

          <label>
            New password (they are signed out everywhere)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              placeholder="At least 6 characters"
            />
          </label>
          <button
            type="button"
            disabled={busy || password.length < 6}
            onClick={() =>
              void run(async () => {
                await platformApi(`/platform/users/${user.id}/password`, {
                  method: 'POST',
                  body: { password },
                });
                setPassword('');
              }, 'Password changed. Give the new one to the user in person.')
            }
          >
            Set new password
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ payments
function PaymentsCard({
  payments,
  busy,
  run,
}: {
  payments: PlatformPayment[];
  busy: boolean;
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Payments</h2>
      {payments.length === 0 ? (
        <p className="muted">No subscription payments yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Amount</th>
                <th>How</th>
                <th>Status</th>
                <th>Recorded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{monthLabel(p.period)}</td>
                  <td>{ghs(p.amountMinor)}</td>
                  <td>{METHOD_LABEL[p.method]}</td>
                  <td>
                    <span className={`badge ${PAYMENT_TONE[p.status]}`}>{p.status}</span>
                    {p.note ? <div className="muted" style={{ fontSize: '0.75rem' }}>{p.note}</div> : null}
                  </td>
                  <td>{fmtDate(p.paidAt ?? p.createdAt)}</td>
                  <td>
                    {p.status === 'PENDING' ? (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        {p.method !== 'PAYSTACK' ? (
                          <button
                            type="button"
                            className="small"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`Confirm ${ghs(p.amountMinor)} for ${monthLabel(p.period)}?`)) return;
                              void run(
                                () => platformApi(`/platform/payments/${p.id}/confirm`, { method: 'POST' }),
                                'Cash payment confirmed and the church unlocked.',
                              );
                            }}
                          >
                            Confirm cash
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="small secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => platformApi(`/platform/payments/${p.id}/cancel`, { method: 'POST' }),
                              'Payment cancelled.',
                            )
                          }
                        >
                          Cancel
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
  );
}

// ------------------------------------------------------------------ audit
function AuditCard({ rows }: { rows: PlatformChurchDetail['audit'] }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Recent changes</h2>
      {rows.length === 0 ? (
        <p className="muted">Nothing recorded yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{fmtDateTime(row.created_at)}</td>
                  <td>{row.action}</td>
                  <td>
                    {row.entity ?? '—'}
                    {row.entity_id ? (
                      <span className="muted" style={{ fontSize: '0.74rem' }}> · {row.entity_id.slice(0, 8)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
