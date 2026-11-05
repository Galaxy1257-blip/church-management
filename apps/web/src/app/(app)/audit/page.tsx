'use client';
// The activity log: who changed what in this church, and when. Everything here is
// read-only, and not because the screen leaves the buttons out — the database
// refuses an UPDATE, DELETE or TRUNCATE on these rows, so a pastor, a treasurer or
// the platform office cannot quietly rewrite history either.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';
import { actionLabel, groupLabel } from '../../../lib/audit-labels';
import Notice from '../../../components/notice';

interface AuditEvent {
  seq: number;
  action: string;
  entity: string | null;
  entityId: string | null;
  at: string;
  /** null when no one was signed in: the give page, a webhook, an automatic job. */
  actor: string | null;
  ip: string | null;
}
interface AuditPage {
  items: AuditEvent[];
  olderThan: number | null;
  more: boolean;
}
interface AuditSummary {
  rows: number;
  today: number;
  brokenAtSeq: number | null;
}

/**
 * A row with no name behind it is not missing data — the give page, a payment
 * callback and the nightly jobs all act with no one signed in. The log keeps the
 * action and the address, and this says which of the two kinds of line it is.
 */
function actorText(actor: string | null): string {
  if (actor) return actor;
  return 'No one signed in';
}

export default function AuditPageView() {
  const [page, setPage] = useState<AuditPage>({ items: [], olderThan: null, more: false });
  const [groups, setGroups] = useState<string[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (before?: number | null): Promise<void> => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (group) params.set('group', group);
        if (before) params.set('before', String(before));
        const next = await api<AuditPage>(`/audit/events?${params.toString()}`);
        setPage((prev) =>
          before
            ? { items: [...prev.items, ...next.items], olderThan: next.olderThan, more: next.more }
            : next,
        );
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'could not read the log');
      } finally {
        setLoading(false);
      }
    },
    [q, group],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    void api<string[]>('/audit/groups').then(setGroups).catch(() => setGroups([]));
  }, []);

  async function checkChain(): Promise<void> {
    setChecking(true);
    try {
      setSummary(await api<AuditSummary>('/audit/summary'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not check the log');
    } finally {
      setChecking(false);
    }
  }

  const known = page.items.filter((e) => actionLabel(e.action).known).length;
  const unknown = page.items.length - known;

  return (
    <div>
      <h1>Activity log</h1>
      <p className="muted">
        Every change made in this church app, newest first — who did it, what they did, when, and from where.
        Nobody can edit or remove a line here, not the pastor and not us: the database turns that attempt away.
        It says what happened to a record, not what the whole record contains.
      </p>

      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="card">
        <div className="spread">
          <div>
            <b>{summary ? `${summary.rows} lines` : 'The log'}</b>
            {summary ? <div className="muted">{summary.today} of them today</div> : null}
          </div>
          <button className="small" onClick={() => void checkChain()} disabled={checking}>
            {checking ? 'Checking…' : 'Check nothing was changed'}
          </button>
        </div>
        {summary ? (
          summary.brokenAtSeq === null ? (
            <p className="muted" role="status" style={{ marginBottom: 0 }}>
              Checked just now: every line still matches the one before it. Nothing has been rewritten or
              removed.
            </p>
          ) : (
            <p className="error" role="alert" style={{ marginBottom: 0 }}>
              Line {summary.brokenAtSeq} does not match the line before it. Tell us — this should not happen,
              and the app has recorded the fact.
            </p>
          )
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>
            Each line is sealed with the line before it, so a changed or missing line shows up. Checking reads
            the whole log, so it is a button and not automatic.
          </p>
        )}
      </div>

      <div className="card">
        <form
          className="row"
          style={{ gap: '0.5rem', flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            void load(null);
          }}
        >
          <label style={{ flex: '1 1 220px', margin: 0 }}>
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="A name, or what happened — e.g. offering"
            />
          </label>
          <label style={{ flex: '0 1 180px', margin: 0 }}>
            Which part of the app
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Every part</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {groupLabel(g)}
                </option>
              ))}
            </select>
          </label>
          <button className="small" type="submit" style={{ alignSelf: 'flex-end' }}>
            Search
          </button>
        </form>

        {loading && page.items.length === 0 ? (
          <p className="muted">Loading…</p>
        ) : page.items.length === 0 ? (
          <p className="muted">Nothing matches that. Try a different word, or clear the filter.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>From</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((e) => {
                const label = actionLabel(e.action);
                return (
                  <tr key={e.seq}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
                    <td>{actorText(e.actor)}</td>
                    <td>
                      {label.text}
                      {!label.known ? (
                        <div className="muted" style={{ fontSize: '0.78rem' }}>
                          No plain-English name for this one yet — shown as recorded
                        </div>
                      ) : null}
                    </td>
                    <td className="muted">{e.ip ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {unknown > 0 ? (
          <p className="muted" style={{ fontSize: '0.78rem' }}>
            {unknown} {unknown === 1 ? 'line uses' : 'lines use'} a wording this screen has not been taught, so
            it is printed exactly as the app recorded it.
          </p>
        ) : null}

        {page.more ? (
          <button className="small" disabled={loading} onClick={() => void load(page.olderThan)}>
            {loading ? 'Loading…' : 'Show the ones before these'}
          </button>
        ) : page.items.length > 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            That is the whole log for this church.
          </p>
        ) : null}
      </div>
    </div>
  );
}
