'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { fmtDateTime, ghs } from '../../../lib/format';
import { hasPermission, moduleEnabled, type ModuleFlags, type ModuleKey } from '../../../lib/access';
import { getSession } from '../../../lib/session';

interface DashboardData {
  wallet: { balanceUnits: number; reservedUnits: number } | null;
  services: { id: string; name: string; startsAt: string; status: string }[];
  totals: { totals: { segmentKey: string; label: string; net: number }[]; netTotal: number } | null;
  byFund: { fund: string; totalMinor: number; count: number }[];
  visitors: { id: string; firstName: string; createdAt: string }[];
  bySunday: { date: string; totalMinor: number; count: number }[];
  churn: { memberId: string; name: string; risk: string; lastCheckIn: string | null }[];
  tasks: { id: string; type: string; status: string; dueAt: string; note?: string | null }[];
  events: { id: string; title: string; startsAt: string; venue?: string | null }[];
  announcements: { id: string; title: string; body: string; category: string; publishAt: string }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [modules, setModules] = useState<ModuleFlags | undefined>(undefined);
  const [error, setError] = useState('');

  // Only ask for what this role may read: one 403 anywhere used to blank the
  // whole dashboard because Promise.all rejects on the first failure.
  useEffect(() => {
    (async () => {
      try {
        // Shared, cached: the shell already fetched this on the same page load.
        const session = await getSession();
        const granted = session.permissions;
        setPerms(granted);
        setModules(session.modules);
        const can = (perm: string) => hasPermission(granted, perm);
        const [wallet, services, byFund, visitors, bySunday, churn, tasks, events, announcements] = await Promise.all([
          can('sms:read') ? api<NonNullable<DashboardData['wallet']>>('/sms/wallet').catch(() => null) : Promise.resolve(null),
          can('services:read') ? api<DashboardData['services']>('/services').catch(() => []) : Promise.resolve([]),
          can('reports:read') ? api<DashboardData['byFund']>('/finance/reports/by-fund').catch(() => []) : Promise.resolve([]),
          can('visitors:read') ? api<DashboardData['visitors']>('/visitors').catch(() => []) : Promise.resolve([]),
          can('reports:read') ? api<DashboardData['bySunday']>('/finance/reports/by-sunday').catch(() => []) : Promise.resolve([]),
          can('members:read') ? api<DashboardData['churn']>('/members/meta/churn').catch(() => []) : Promise.resolve([]),
          can('care:read') ? api<DashboardData['tasks']>('/tasks').catch(() => []) : Promise.resolve([]),
          can('services:read') ? api<DashboardData['events']>('/events').catch(() => []) : Promise.resolve([]),
          can('campaigns:read') ? api<DashboardData['announcements']>('/announcements').catch(() => []) : Promise.resolve([]),
        ]);
        const open = services.find((s) => s.status === 'OPEN') ?? services[0] ?? null;
        const totals = open
          ? await api<NonNullable<DashboardData['totals']>>(`/headcount/totals?serviceId=${open.id}`).catch(() => null)
          : null;
        setData({ wallet, services, totals, byFund, visitors, bySunday, churn, tasks, events, announcements });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed to load');
      }
    })();
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div>Loading dashboard…</div>;

  const has = (perm: string) => hasPermission(perms, perm);
  // A module switched off in Settings must hide its cards here too, not just its
  // nav entry — otherwise the dashboard becomes the back door to a hidden area.
  const mod = (key: ModuleKey) => moduleEnabled(modules, key);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="grid cols-3">
        {has('services:read') && mod('worship') ? (
          <div className="card stat">
            <div className="value">{data.totals?.netTotal ?? '-'}</div>
            <div className="label">Headcount (latest service)</div>
          </div>
        ) : null}
        {has('reports:read') && mod('money') ? (
          <div className="card stat">
            <div className="value">{ghs(data.bySunday[0]?.totalMinor ?? 0)}</div>
            <div className="label">Giving last Sunday ({data.bySunday[0]?.count ?? 0} gifts)</div>
          </div>
        ) : null}
        {has('members:read') && mod('people') ? (
          <div className="card stat">
            <div className="value">{data.churn.length}</div>
            <div className="label">At-risk members (60-day)</div>
          </div>
        ) : null}
      </div>

      {/*
        Three ways to record what happened today: the reason anyone opens this
        page. The numbers that used to fill the top row (all-time giving, SMS
        credits, visitor count) already live in their own area one tab away, so
        they no longer compete with the actions for the first screen.
      */}
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Today</h2>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}
          </span>
        </div>
        <div className="row" style={{ marginTop: '0.5rem' }}>
          {has('services:read') && mod('worship') ? <Link href="/checkin">Check someone in</Link> : null}
          {has('finance:read') && mod('money') ? <Link href="/finance">Record giving</Link> : null}
          {has('visitors:read') && mod('people') ? <Link href="/visitors">Register a visitor</Link> : null}
          {has('members:read') && mod('people') ? <Link href="/members">Add a member</Link> : null}
        </div>
      </div>

      <div className="grid cols-2">
        {has('services:read') && mod('worship') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Sunday demographics</h2>
              <Link href="/media">Projection →</Link>
            </div>
          {data.totals && data.totals.totals.filter((t) => t.segmentKey !== 'LIVESTREAM').length > 0 ? (
            <>
              <div className="demo-bar">
                {data.totals.totals
                  .filter((t) => t.segmentKey !== 'LIVESTREAM' && t.net > 0)
                  .map((t, i) => (
                    <div
                      key={t.segmentKey}
                      style={{ flexGrow: Math.max(t.net, 1), background: ['#1e3a5f', '#2f7d4f', '#9a6b00', '#b3392f', '#5b2f8a', '#0f766e'][i % 6] }}
                    >
                      {t.net}
                    </div>
                  ))}
              </div>
              <div className="demo-legend">
                {data.totals.totals
                  .filter((t) => t.segmentKey !== 'LIVESTREAM')
                  .map((t) => (
                    <span key={t.segmentKey}>{t.label}: {t.net}</span>
                  ))}
              </div>
            </>
          ) : (
            <p className="muted">No auto-sorted headcount yet — check members in and their bracket sections fill automatically.</p>
          )}
          </div>
        ) : null}
        {has('services:read') && mod('worship') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Latest service</h2>
              <Link href="/services">All services →</Link>
            </div>
            {data.services[0] ? (
              <div style={{ marginTop: '0.5rem' }}>
                <strong>{data.services[0].name}</strong>
                <div className="muted">{fmtDateTime(data.services[0].startsAt)}</div>
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <Link href={`/services/${data.services[0].id}`}>Headcount</Link>
                  <Link href="/checkin">Check-in</Link>
                </div>
              </div>
            ) : (
              <p className="muted">No services scheduled yet.</p>
            )}
          </div>
        ) : null}
        {has('reports:read') && mod('money') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Giving by fund</h2>
              <Link href="/finance">Finance →</Link>
            </div>
          <table>
            <tbody>
              {data.byFund.map((f) => (
                <tr key={f.fund}>
                  <td>{f.fund}</td>
                  <td style={{ textAlign: 'right' }}>{ghs(f.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : null}

        {has('reports:read') && mod('money') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Giving trend (last 8 Sundays)</h2>
              <Link href="/finance">Finance →</Link>
            </div>
          {data.bySunday.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: '0.5rem' }}>
              {data.bySunday.slice(0, 8).map((s) => {
                const max = Math.max(...data.bySunday.map((x) => x.totalMinor), 1);
                return (
                  <div key={s.date} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <span className="muted" style={{ minWidth: '4.5rem', fontSize: '0.8rem' }}>
                      {new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                    <div style={{ flex: 1, background: '#e8edf2', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((s.totalMinor / max) * 100)}%`, height: '100%', background: 'var(--brand)' }} />
                    </div>
                    <span style={{ minWidth: '5.5rem', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{ghs(s.totalMinor)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No giving history yet.</p>
          )}
        </div>
        ) : null}

        {has('care:read') && mod('people') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Care queue</h2>
              <Link href="/care">Care →</Link>
            </div>
          {data.tasks.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length ? (
            <div style={{ marginTop: '0.4rem' }}>
              {data.tasks
                .filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS')
                .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                .slice(0, 5)
                .map((t) => (
                  <div key={t.id} className="counter" style={{ paddingBottom: '0.3rem' }}>
                    <span className={`badge ${t.type.startsWith('VISIT_HOSP') || t.type === 'VISIT_BEREAVEMENT' ? 'err' : t.type === 'MISSING_MEMBER' ? 'warn' : 'mute'}`}>
                      {t.type.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="name" style={{ fontWeight: 500, fontSize: '0.9rem' }}>{t.note ?? 'Task'}</span>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>{new Date(t.dueAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted">Queue empty — every task closed.</p>
          )}
        </div>
        ) : null}

        {has('services:read') && mod('worship') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Upcoming events</h2>
              <Link href="/events">Events →</Link>
            </div>
          {data.events.filter((e) => new Date(e.startsAt).getTime() >= Date.now() - 864e5).length ? (
            <div style={{ marginTop: '0.4rem' }}>
              {data.events
                .filter((e) => new Date(e.startsAt).getTime() >= Date.now() - 864e5)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                .slice(0, 4)
                .map((e) => (
                  <div key={e.id} className="counter" style={{ paddingBottom: '0.3rem' }}>
                    <span className="name" style={{ fontWeight: 600, fontSize: '0.92rem' }}>{e.title}</span>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>
                      {new Date(e.startsAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{' '}
                      {new Date(e.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted">Nothing scheduled — create one on Events.</p>
          )}
        </div>
        ) : null}

        {has('members:read') && mod('people') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>At-risk members</h2>
              <Link href="/members">Members →</Link>
            </div>
          {data.churn.length ? (
            <div style={{ marginTop: '0.4rem' }}>
              {data.churn.slice(0, 5).map((m) => (
                <div key={m.memberId} className="counter" style={{ paddingBottom: '0.3rem' }}>
                  <span className={`badge ${m.risk === 'NEVER_SEEN' ? 'err' : 'warn'}`}>
                    {m.risk.replace(/_/g, ' ').toLowerCase()}
                  </span>
                  <span className="name" style={{ fontWeight: 500, fontSize: '0.92rem' }}>{m.name}</span>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    last seen {m.lastCheckIn ? new Date(m.lastCheckIn).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'never'}
                  </span>
                </div>
              ))}
              <p className="muted" style={{ marginBottom: 0 }}>
                {data.churn.length} member{data.churn.length === 1 ? '' : 's'} missed 3+ Sundays (60 days).
              </p>
            </div>
          ) : (
            <p className="muted">Everyone has checked in recently.</p>
          )}
        </div>
        ) : null}

        {has('campaigns:read') && mod('reach') ? (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Announcements</h2>
              <Link href="/announcements">News →</Link>
            </div>
          {data.announcements.length ? (
            <div style={{ marginTop: '0.4rem' }}>
              {data.announcements
                .slice()
                .sort((a, b) => b.publishAt.localeCompare(a.publishAt))
                .slice(0, 3)
                .map((a) => (
                  <div key={a.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--line)' }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`badge ${a.category === 'FUNERAL' || a.category === 'ALERT' ? 'err' : a.category === 'OUTDOORING' ? 'ok' : 'mute'}`}>
                        {a.category.toLowerCase()}
                      </span>
                      <strong style={{ fontSize: '0.92rem' }}>{a.title}</strong>
                    </div>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      {a.body.length > 110 ? `${a.body.slice(0, 110)}…` : a.body}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted">No announcements yet.</p>
          )}
        </div>
        ) : null}
      </div>
    </div>
  );
}
