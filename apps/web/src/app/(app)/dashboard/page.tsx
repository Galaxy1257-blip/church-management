'use client';
// Dashboard: the numbers and lists each role may read, arranged the way that
// person likes. Edit mode reorders and hides widgets; the layout is remembered
// in this browser (localStorage), so every signed-in user keeps their own.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { fmtDateTime, ghs } from '../../../lib/format';
import { hasPermission, isCareRole, moduleEnabled, type ModuleFlags, type ModuleKey } from '../../../lib/access';
import { getSession } from '../../../lib/session';
import MemberDrawer from '../../../components/member-drawer';

interface DashboardData {
  wallet: { balanceUnits: number; reservedUnits: number } | null;
  services: { id: string; name: string; startsAt: string; status: string }[];
  totals: { totals: { segmentKey: string; label: string; net: number }[]; netTotal: number } | null;
  byFund: { fund: string; totalMinor: number; count: number }[];
  visitors: { id: string; firstName: string; createdAt: string }[];
  bySunday: { date: string; totalMinor: number; count: number }[];
  churn: { memberId: string; name: string; risk: string; lastCheckIn: string | null }[];
  tasks: {
    id: string;
    type: string;
    status: string;
    dueAt: string;
    note?: string | null;
    memberId?: string | null;
    member?: { id: string; firstName: string; lastName: string } | null;
  }[];
  events: { id: string; title: string; startsAt: string; venue?: string | null }[];
  announcements: { id: string; title: string; body: string; category: string; publishAt: string; memberId?: string | null }[];
}

type WidgetKey =
  | 'stats'
  | 'today'
  | 'attendance'
  | 'latest-service'
  | 'funds'
  | 'trend'
  | 'care'
  | 'events'
  | 'churn'
  | 'news';

const WIDGETS: { key: WidgetKey; label: string }[] = [
  { key: 'stats', label: 'Key numbers' },
  { key: 'today', label: 'Quick actions' },
  { key: 'attendance', label: 'Sunday attendance' },
  { key: 'latest-service', label: 'Latest service' },
  { key: 'funds', label: 'Offering by category' },
  { key: 'trend', label: 'Offering trend' },
  { key: 'care', label: 'Care queue' },
  { key: 'events', label: 'Upcoming events' },
  { key: 'churn', label: 'Members to check on' },
  { key: 'news', label: 'Announcements' },
];
const DEFAULT_ORDER = WIDGETS.map((w) => w.key);
const LAYOUT_KEY = 'chms.dashboard.layout';

interface Layout {
  order: WidgetKey[];
  hidden: WidgetKey[];
}

function readLayout(): Layout {
  if (typeof window === 'undefined') return { order: DEFAULT_ORDER, hidden: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>;
    const order = (raw.order ?? []).filter((k): k is WidgetKey => DEFAULT_ORDER.includes(k as WidgetKey));
    const hidden = (raw.hidden ?? []).filter((k): k is WidgetKey => DEFAULT_ORDER.includes(k as WidgetKey));
    return { order: [...order, ...DEFAULT_ORDER.filter((k) => !order.includes(k))], hidden };
  } catch {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [modules, setModules] = useState<ModuleFlags | undefined>(undefined);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<Layout>({ order: DEFAULT_ORDER, hidden: [] });
  const [editing, setEditing] = useState(false);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  // Only ask for what this role may read: one 403 anywhere used to blank the
  // whole dashboard because Promise.all rejects on the first failure.
  useEffect(() => {
    setLayout(readLayout());
    (async () => {
      try {
        // Shared, cached: the shell already fetched this on the same page load.
        const session = await getSession();
        const granted = session.permissions;
        setPerms(granted);
        setRoles(session.roles);
        setModules(session.modules);
        const can = (perm: string) => hasPermission(granted, perm);
        const [wallet, services, byFund, visitors, bySunday, churn, tasks, events, announcements] = await Promise.all([
          can('sms:read') ? api<NonNullable<DashboardData['wallet']>>('/sms/wallet').catch(() => null) : Promise.resolve(null),
          can('services:read') ? api<DashboardData['services']>('/services').catch(() => []) : Promise.resolve([]),
          can('reports:read') ? api<DashboardData['byFund']>('/finance/reports/by-fund').catch(() => []) : Promise.resolve([]),
          can('visitors:read') ? api<DashboardData['visitors']>('/visitors').catch(() => []) : Promise.resolve([]),
          can('reports:read') ? api<DashboardData['bySunday']>('/finance/reports/by-sunday').catch(() => []) : Promise.resolve([]),
          can('care:read') ? api<DashboardData['churn']>('/members/meta/churn').catch(() => []) : Promise.resolve([]),
          can('care:read') ? api<DashboardData['tasks']>('/tasks').catch(() => []) : Promise.resolve([]),
          can('services:write') ? api<DashboardData['events']>('/events').catch(() => []) : Promise.resolve([]),
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

  const has = (perm: string) => hasPermission(perms, perm);
  const mod = (key: ModuleKey) => moduleEnabled(modules, key);
  const attendanceVisible = has('services:read') && (mod('worship') || has('headcount:write'));
  const eventsVisible = has('services:write') && mod('worship');
  const careVisible = has('care:read') && mod('care') && isCareRole(roles);

  const statCount = (attendanceVisible ? 1 : 0) + (has('reports:read') && mod('money') ? 1 : 0) + (careVisible ? 1 : 0);

  // A widget only exists for a role that can read it; the layout can never
  // surface something the permission set excludes.
  const allowed = new Set<WidgetKey>();
  if (statCount > 0) allowed.add('stats');
  if (has('checkin:write') || has('finance:read') || has('visitors:write') || has('members:write')) allowed.add('today');
  if (attendanceVisible) {
    allowed.add('attendance');
    allowed.add('latest-service');
  }
  if (has('reports:read') && mod('money')) {
    allowed.add('funds');
    allowed.add('trend');
  }
  if (careVisible) {
    allowed.add('care');
    allowed.add('churn');
  }
  if (eventsVisible) allowed.add('events');
  if (has('campaigns:read') && mod('reach')) allowed.add('news');

  function saveLayout(next: Layout): void {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      // Private mode / storage full: the dashboard still works, just not saved.
    }
  }

  function move(key: WidgetKey, direction: -1 | 1): void {
    const order = [...layout.order];
    const i = order.indexOf(key);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveLayout({ ...layout, order });
  }

  function toggleHidden(key: WidgetKey): void {
    const hidden = layout.hidden.includes(key)
      ? layout.hidden.filter((k) => k !== key)
      : [...layout.hidden, key];
    saveLayout({ ...layout, hidden });
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div>Loading dashboard…</div>;

  const visibleKeys = layout.order.filter((k) => allowed.has(k) && !layout.hidden.includes(k));

  // An arrow (not a hoisted function) so TypeScript keeps the non-null `data`
  // it just checked for inside the widget bodies.
  const widget = (key: WidgetKey) => {
    switch (key) {
      case 'stats':
        return (
          <div>
            <div className="grid cols-3">
              {attendanceVisible ? (
                <div className="card stat">
                  <div className="value">{data.totals?.netTotal ?? '-'}</div>
                  <div className="label">Attendance (last service)</div>
                </div>
              ) : null}
              {has('reports:read') && mod('money') ? (
                <div className="card stat">
                  <div className="value">{ghs(data.bySunday[0]?.totalMinor ?? 0)}</div>
                  <div className="label">Offering last Sunday ({data.bySunday[0]?.count ?? 0} entries)</div>
                </div>
              ) : null}
              {careVisible ? (
                <div className="card stat">
                  <div className="value">{data.churn.length}</div>
                  <div className="label">Members to check on (60-day)</div>
                </div>
              ) : null}
            </div>
          </div>
        );

      case 'today':
        return (
          <div className="card dash-full">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Today</h2>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}
              </span>
            </div>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              {has('checkin:write') && (mod('worship') || has('headcount:write')) ? <Link href="/checkin">Check someone in</Link> : null}
              {has('finance:read') && mod('money') ? <Link href="/finance">Record offering</Link> : null}
              {has('visitors:write') && mod('people') ? <Link href="/visitors">Register a visitor</Link> : null}
              {has('members:write') && mod('people') ? <Link href="/members">Add a member</Link> : null}
            </div>
          </div>
        );

      case 'attendance':
        return (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Sunday attendance</h2>
            </div>
            {data.totals && data.totals.totals.filter((t) => t.segmentKey !== 'LIVESTREAM').length > 0 ? (
              <>
                <div className="demo-bar">
                  {data.totals.totals
                    .filter((t) => t.segmentKey !== 'LIVESTREAM' && t.net > 0)
                    .map((t, i) => (
                      <div
                        key={t.segmentKey}
                        style={{ flexGrow: Math.max(t.net, 1), background: ['#1f4d3a', '#c08a2e', '#b4513a', '#2f6b4f', '#8a6414', '#5b6f8a'][i % 6] }}
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
              <p className="muted">No group counts yet — check people in and the Men, Women and Children sections fill automatically.</p>
            )}
          </div>
        );

      case 'latest-service':
        return (
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
                  <Link href={`/services/${data.services[0].id}`}>Attendance</Link>
                  <Link href="/checkin">Check-in</Link>
                </div>
              </div>
            ) : (
              <p className="muted">No services scheduled yet.</p>
            )}
          </div>
        );

      case 'funds':
        return (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Offering by category</h2>
              <Link href="/finance">Offerings →</Link>
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
        );

      case 'trend':
        return (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Offering trend (last 8 Sundays)</h2>
              <Link href="/finance">Offerings →</Link>
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
                      <div style={{ flex: 1, background: 'var(--bg-soft)', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round((s.totalMinor / max) * 100)}%`, height: '100%', background: 'var(--brand)' }} />
                      </div>
                      <span style={{ minWidth: '5.5rem', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{ghs(s.totalMinor)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No offerings recorded yet.</p>
            )}
          </div>
        );

      case 'care':
        return (
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
                      {t.memberId ? (
                        <button type="button" className="name link-button" style={{ fontWeight: 500, fontSize: '0.9rem', flex: 1 }} onClick={() => setOpenMemberId(t.memberId!)}>
                          {t.member ? `${t.member.firstName} ${t.member.lastName}` : t.note ?? 'Open member'}
                        </button>
                      ) : (
                        <span className="name" style={{ fontWeight: 500, fontSize: '0.9rem' }}>{t.note ?? 'Task'}</span>
                      )}
                      <span className="muted" style={{ fontSize: '0.78rem' }}>{new Date(t.dueAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="muted">Queue empty — every task closed.</p>
            )}
          </div>
        );

      case 'events':
        return (
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
        );

      case 'churn':
        return (
          <div className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Members to check on</h2>
              <Link href="/members">Members →</Link>
            </div>
            {data.churn.length ? (
              <div style={{ marginTop: '0.4rem' }}>
                {data.churn.slice(0, 5).map((m) => (
                  <div key={m.memberId} className="counter" style={{ paddingBottom: '0.3rem' }}>
                    <span className={`badge ${m.risk === 'NEVER_SEEN' ? 'err' : 'warn'}`}>
                      {m.risk.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <button type="button" className="name link-button" style={{ fontWeight: 500, fontSize: '0.92rem', flex: 1 }} onClick={() => setOpenMemberId(m.memberId)}>
                      {m.name}
                    </button>
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
        );

      case 'news':
        return (
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
                    <Link key={a.id} href={`/announcements?open=${a.id}`} className="news-row" style={{ display: 'block', color: 'inherit' }}>
                      <div className="row" style={{ gap: 6 }}>
                        <span className={`badge ${a.category === 'FUNERAL' || a.category === 'ALERT' ? 'err' : a.category === 'OUTDOORING' ? 'ok' : 'mute'}`}>
                          {a.category.toLowerCase()}
                        </span>
                        <strong style={{ fontSize: '0.92rem' }}>{a.title}</strong>
                      </div>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        {a.body.length > 110 ? `${a.body.slice(0, 110)}…` : a.body}
                      </div>
                    </Link>
                  ))}
              </div>
            ) : (
              <p className="muted">No announcements yet.</p>
            )}
          </div>
        );
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="head-actions">
          <button className="secondary" onClick={() => setEditing((v) => !v)}>{editing ? 'Done arranging' : 'Edit dashboard'}</button>
        </div>
      </div>

      {editing ? (
        <div className="card stack">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Arrange your dashboard</h2>
            <button className="small secondary" type="button" onClick={() => saveLayout({ order: DEFAULT_ORDER, hidden: [] })}>Reset</button>
          </div>
          <p className="muted" style={{ marginTop: '-0.3rem' }}>Move a card up or down, or hide the ones you do not need. This only changes what you see.</p>
          {WIDGETS.filter((w) => allowed.has(w.key)).map((w) => (
            <div key={w.key} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '0.35rem' }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <input type="checkbox" checked={!layout.hidden.includes(w.key)} onChange={() => toggleHidden(w.key)} />
                {w.label}
              </label>
              <span className="row" style={{ gap: 4 }}>
                <button className="small secondary" type="button" aria-label={`Move ${w.label} up`} onClick={() => move(w.key, -1)}>↑</button>
                <button className="small secondary" type="button" aria-label={`Move ${w.label} down`} onClick={() => move(w.key, 1)}>↓</button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="dash-grid">
        {visibleKeys.map((key) => (
          <div key={key} className={key === 'stats' || key === 'today' ? 'dash-full' : undefined}>
            {widget(key)}
          </div>
        ))}
      </div>
      {openMemberId ? <MemberDrawer memberId={openMemberId} onClose={() => setOpenMemberId(null)} /> : null}
    </div>
  );
}
