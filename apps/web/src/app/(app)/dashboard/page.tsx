'use client';
// Dashboard: one calm screen that answers "what needs me now?". Three core cards
// (Needs you · Today · This week) on top; three "only if it has something" cards
// below (Coming up · Care queue · Giving trend). A card with nothing in it does
// not render, and the two secondary cards drop off on phones.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { dashboardQuickLinks, hasPermission, moduleEnabled, type ModuleFlags, type ModuleKey } from '../../../lib/access';
import { getSession } from '../../../lib/session';
import { doorView } from '../../../lib/door';

interface BySunday { date: string; totalMinor: number; count: number }
interface VisitorRow { id: string; firstName: string; createdAt: string }
interface ChurnRow { memberId: string; name: string; risk: string; lastCheckIn: string | null }
interface TaskRow {
  id: string;
  type: string;
  status: string;
  dueAt: string;
  note?: string | null;
  memberId?: string | null;
  member?: { id: string; firstName: string; lastName: string } | null;
}
interface EventRow { id: string; title: string; startsAt: string; venue?: string | null }
interface TransferRow { id: string; status: string }
interface ReadingRow { ref: string; text: string; note?: string }

interface Need {
  key: string;
  title: string;
  sub: string;
  href: string;
  tone: 'gold' | 'terra' | 'forest';
}

const DAY_MS = 86_400_000;

export default function DashboardPage() {
  const [perms, setPerms] = useState<string[]>([]);
  const [modules, setModules] = useState<ModuleFlags | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [counted, setCounted] = useState<number | null>(null);
  const [bySunday, setBySunday] = useState<BySunday[]>([]);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [churn, setChurn] = useState<ChurnRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [reading, setReading] = useState<ReadingRow | null>(null);
  const [readingNote, setReadingNote] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        const granted = session.permissions;
        setPerms(granted);
        setModules(session.modules);
        setUserName(session.name);
        const can = (p: string) => hasPermission(granted, p);
        const mod = (k: ModuleKey) => moduleEnabled(session.modules, k);

        const readingP = can('church:read')
          ? api<{ inApp: boolean; reading: ReadingRow | null }>('/churches/me/devotional/today')
              .then((r) => {
                if (!r.inApp) setReading(null);
                else if (r.reading) setReading(r.reading);
                else setReadingNote("Today's reading could not be loaded.");
              })
              .catch(() => setReadingNote("Today's reading could not be loaded."))
          : Promise.resolve();
        const doorP =
          can('services:read') || can('checkin:write')
            ? doorView(granted, session.roles, session.modules)
                .then((d) => setCounted(d.counted))
                .catch(() => setCounted(null))
            : Promise.resolve();
        const bySundayP =
          can('reports:read') && mod('money')
            ? api<BySunday[]>('/finance/reports/by-sunday').then(setBySunday).catch(() => undefined)
            : Promise.resolve();
        const visitorsP =
          can('visitors:read') && mod('people')
            ? api<VisitorRow[]>('/visitors').then(setVisitors).catch(() => undefined)
            : Promise.resolve();
        const churnP =
          can('care:read') && can('members:read') && mod('care')
            ? api<ChurnRow[]>('/members/meta/churn').then(setChurn).catch(() => undefined)
            : Promise.resolve();
        const tasksP =
          can('care:read') && mod('care')
            ? api<TaskRow[]>('/tasks').then(setTasks).catch(() => undefined)
            : Promise.resolve();
        const eventsP =
          can('services:write') && mod('events')
            ? api<EventRow[]>('/events').then(setEvents).catch(() => undefined)
            : Promise.resolve();
        // /org (where transfers are approved) is gated on Departments, so only
        // offer the transfer row when that page is actually reachable.
        const transfersP =
          mod('branches') && mod('departments') && can('members:read')
            ? api<TransferRow[]>('/branches/transfers?status=PENDING').then(setTransfers).catch(() => undefined)
            : Promise.resolve();

        await Promise.all([readingP, doorP, bySundayP, visitorsP, churnP, tasksP, eventsP, transfersP]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed to load');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const can = (p: string) => hasPermission(perms, p);
  const quick = dashboardQuickLinks(perms, modules);

  const openTasks = tasks
    .filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  const needs: Need[] = [];
  if (transfers.length) {
    needs.push({
      key: 'transfers',
      title: `${transfers.length} branch transfer${transfers.length > 1 ? 's' : ''}`,
      sub: 'Waiting for approval',
      href: '/org',
      tone: 'gold',
    });
  }
  if (openTasks[0]) {
    const t = openTasks[0];
    needs.push({
      key: `task-${t.id}`,
      title: t.member ? `${t.member.firstName} ${t.member.lastName}` : t.note ?? 'Care follow-up',
      sub: t.type.replace(/_/g, ' ').toLowerCase(),
      href: '/care',
      tone: 'terra',
    });
  }
  if (churn[0]) {
    needs.push({
      key: `churn-${churn[0].memberId}`,
      title: churn[0].name,
      sub: 'Has missed Sundays — reach out',
      href: '/care',
      tone: 'forest',
    });
  }
  const needRows = needs.slice(0, 3);

  const latestGiving = bySunday.length
    ? [...bySunday].sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;
  const weekMetrics: { label: string; value: string }[] = [];
  if (counted !== null) weekMetrics.push({ label: 'Attendance', value: String(counted) });
  if (latestGiving) {
    weekMetrics.push({
      label: 'Giving · GH₵',
      value: Math.floor(latestGiving.totalMinor / 100).toLocaleString('en-US'),
    });
  }
  if (visitors.length) weekMetrics.push({ label: 'New visitors', value: String(visitors.length) });

  const upcoming = events
    .filter((e) => new Date(e.startsAt).getTime() >= Date.now() - DAY_MS)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3);

  const trend = [...bySunday].sort((a, b) => a.date.localeCompare(b.date)).slice(-4);
  const trendMax = Math.max(...trend.map((t) => t.totalMinor), 1);
  const trendMin = Math.min(...trend.map((t) => t.totalMinor), 0);
  const sparkPoints = trend
    .map((t, i) => {
      const x = 6 + (i * 188) / Math.max(trend.length - 1, 1);
      const y = 48 - ((t.totalMinor - trendMin) / (trendMax - trendMin || 1)) * 40;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const statusLine = needRows.length
    ? `${needRows.length} thing${needRows.length > 1 ? 's' : ''} need you`
    : 'Nothing needs you right now';
  const firstName = userName.trim().split(/\s+/)[0] ?? '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const title = firstName ? `${greeting}, ${firstName}` : 'Dashboard';

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>{title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {today} · {statusLine}
          </p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {!loaded ? <p className="muted">Loading…</p> : null}

      {loaded ? (
        <>
          <div className="dash-grid">
            {needRows.length ? (
              <section className="card glass-hero">
                <div className="spread">
                  <h2 style={{ margin: 0 }}>Needs you</h2>
                  <span className="badge ok">{needRows.length}</span>
                </div>
                {needRows.map((n) => (
                  <Link key={n.key} href={n.href} className="dash-row">
                    <span className={`dash-dot ${n.tone}`} aria-hidden="true" />
                    <span className="t">
                      <b>{n.title}</b>
                      <span>{n.sub}</span>
                    </span>
                    <span className="chev" aria-hidden="true">›</span>
                  </Link>
                ))}
              </section>
            ) : null}

            {quick.length ? (
              <section className="card">
                <h2 style={{ marginTop: 0 }}>Today</h2>
                <Link href={quick[0].href} className="dash-btn primary">
                  {quick[0].label}
                </Link>
                {quick.length > 1 ? (
                  <div className="dash-btnrow">
                    {quick.slice(1, 5).map((l) => (
                      <Link key={l.href} href={l.href} className="dash-btn">
                        {l.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {weekMetrics.length ? (
              <section className="card">
                <h2 style={{ marginTop: 0 }}>This week</h2>
                <div className="dash-metrics">
                  {weekMetrics.map((m) => (
                    <div key={m.label}>
                      <div className="dash-num">{m.value}</div>
                      <div className="dash-lab">{m.label}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {upcoming.length ? (
              <section className="card dash-extra">
                <h2 style={{ marginTop: 0 }}>Coming up</h2>
                {upcoming.map((e) => {
                  const d = new Date(e.startsAt);
                  return (
                    <Link key={e.id} href="/events" className="dash-row">
                      <span className="dash-chip">
                        {d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase().slice(0, 3)}
                        <b>{d.getDate()}</b>
                      </span>
                      <span className="t">
                        <b>{e.title}</b>
                        <span>
                          {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          {e.venue ? ` · ${e.venue}` : ''}
                        </span>
                      </span>
                      <span className="chev" aria-hidden="true">›</span>
                    </Link>
                  );
                })}
              </section>
            ) : null}

            {openTasks.length && can('care:read') ? (
              <section className="card dash-extra">
                <div className="spread">
                  <h2 style={{ margin: 0 }}>Care queue</h2>
                  <span className="badge ok">{openTasks.length}</span>
                </div>
                {openTasks.slice(0, 2).map((t) => (
                  <Link key={t.id} href="/care" className="dash-row">
                    <span className="dash-dot terra" aria-hidden="true" />
                    <span className="t">
                      <b>{t.member ? `${t.member.firstName} ${t.member.lastName}` : t.note ?? 'Care task'}</b>
                      <span>{t.type.replace(/_/g, ' ').toLowerCase()}</span>
                    </span>
                    <span className="chev" aria-hidden="true">›</span>
                  </Link>
                ))}
              </section>
            ) : null}

            {trend.length >= 2 ? (
              <section className="card dash-extra">
                <div className="spread">
                  <h2 style={{ margin: 0 }}>Giving trend</h2>
                  <Link href="/finance">Offerings →</Link>
                </div>
                <svg className="dash-spark" viewBox="0 0 200 56" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={sparkPoints} />
                </svg>
                <div className="dash-trendline">
                  <span className="dash-num">
                    {latestGiving ? Math.floor(latestGiving.totalMinor / 100).toLocaleString('en-US') : '—'}
                  </span>
                  <span className="dash-lab">GH₵ · last {trend.length} giving days</span>
                </div>
              </section>
            ) : null}
          </div>

          {reading ? (
            <div className="dash-verse">
              <span className="grow">
                <b>{reading.ref}</b> · {reading.text}
              </span>
              <Link href="/bible" className="dash-read">
                Read →
              </Link>
            </div>
          ) : readingNote ? (
            <p className="muted" style={{ marginTop: '0.9rem' }}>{readingNote}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
