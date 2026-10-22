'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, clearTokens, hasSession } from '../../lib/api';

// Grouped nav: 20 flat links cluttered the topbar — logical groups with
// dropdowns keep one clean row (Dashboard · People · Worship · Finance ·
// Outreach · Org · Settings · Usher mode · Logout).
const NAV_GROUPS: { label: string; hint: string; items: { href: string; label: string }[] }[] = [
  {
    label: 'People',
    hint: 'Members, visitors, children, care queue and small groups',
    items: [
      { href: '/members', label: 'Members' },
      { href: '/visitors', label: 'Visitors' },
      { href: '/children', label: 'Children' },
      { href: '/care', label: 'Care' },
      { href: '/groups', label: 'Groups' },
    ],
  },
  {
    label: 'Worship',
    hint: 'Services, check-in, serving roster and media/projection',
    items: [
      { href: '/services', label: 'Services' },
      { href: '/checkin', label: 'Check-in' },
      { href: '/roster', label: 'Roster' },
      { href: '/media', label: 'Media' },
    ],
  },
  {
    label: 'Finance',
    hint: 'Giving batches & reports, pledges, expenses',
    items: [
      { href: '/finance', label: 'Finance' },
      { href: '/campaigns', label: 'Pledges' },
      { href: '/expenses', label: 'Expenses' },
    ],
  },
  {
    label: 'Outreach',
    hint: 'Events & RSVPs, follow-up drip, SMS campaigns, announcements',
    items: [
      { href: '/events', label: 'Events' },
      { href: '/drip', label: 'Drip' },
      { href: '/sms', label: 'SMS' },
      { href: '/announcements', label: 'News' },
    ],
  },
  {
    label: 'Org',
    hint: 'Structure, departments and branch → HQ remittances',
    items: [
      { href: '/org', label: 'Org' },
      { href: '/branches', label: 'Branches' },
    ],
  },
];

// Usher Mode: ONE app, role-scoped shell. Ushers get a mobile-first subset
// (Today / Check-in / Visitors) with big touch targets; leaders toggle it off.
const USHER_NAV = [
  { href: '/dashboard', label: 'Today' },
  { href: '/checkin', label: 'Check-in' },
  { href: '/services', label: 'Headcount' },
  { href: '/visitors', label: 'Visitors' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  type Me = { name: string; church: { name: string; branding?: { logoDataUrl?: string | null; primaryColor?: string } | null }; permissions: string[] };
  const [me, setMe] = useState<Me | null>(null);
  const [usherMode, setUsherMode] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover menus: open on enter, previous menu switches instantly, and the open
  // menu closes shortly after the mouse leaves it (grace period bridges the
  // button→panel gap). Click only opens — closing is hover-away / outside / Esc.
  function cancelClose(): void {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function scheduleClose(): void {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenGroup(null), 140);
  }
  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    api<Me>('/auth/me')
      .then((m) => {
        setMe(m);
        if (m.church.branding?.primaryColor) document.documentElement.style.setProperty('--brand', m.church.branding.primaryColor);
        const isUsherOnly = m.permissions.includes('headcount:write') && !m.permissions.includes('members:write');
        const stored = typeof window !== 'undefined' ? localStorage.getItem('chms.usherMode') : null;
        setUsherMode(stored === '1' || (stored === null && isUsherOnly));
      })
      .catch(() => {
        clearTokens();
        router.replace('/login');
      });
  }, [router]);

  function toggleUsher(): void {
    const next = !usherMode;
    setUsherMode(next);
    localStorage.setItem('chms.usherMode', next ? '1' : '0');
  }

  // close the open dropdown on navigation, outside click, or Escape
  useEffect(() => setOpenGroup(null), [pathname]);
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openGroup]);

  if (!ready) return <div className="container">Loading…</div>;
  const isActive = (href: string) => (pathname.startsWith(href) ? 'active' : '');

  return (
    <div>
      <nav className="topbar" ref={navRef}>
        <span className="brand" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {me?.church.branding?.logoDataUrl ? (
            <img src={me.church.branding.logoDataUrl} alt="" style={{ height: 22 }} />
          ) : null}
          ChMS{me ? ` · ${me.church.name}` : ''}
        </span>
        {usherMode ? (
          USHER_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href)}>
              {item.label}
            </Link>
          ))
        ) : (
          <>
            <Link href="/dashboard" className={isActive('/dashboard')}>
              Dashboard
            </Link>
            {NAV_GROUPS.map((group) => {
              const sectionActive = group.items.some((i) => pathname.startsWith(i.href));
              const isOpen = openGroup === group.label;
              return (
                <div
                  key={group.label}
                  className={`nav-group${sectionActive ? ' active' : ''}${isOpen ? ' open' : ''}`}
                  onMouseEnter={() => {
                    cancelClose();
                    setOpenGroup(group.label);
                  }}
                  onMouseLeave={scheduleClose}
                >
                  <button
                    type="button"
                    className="nav-group-btn"
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    title={group.hint}
                    onClick={() => setOpenGroup(group.label)}
                  >
                    {group.label}
                    <span className="caret" aria-hidden>▾</span>
                  </button>
                  {isOpen ? (
                    <div className="nav-panel" role="menu" onMouseEnter={cancelClose}>
                      {group.items.map((i) => (
                        <Link
                          key={i.href}
                          href={i.href}
                          role="menuitem"
                          className={isActive(i.href)}
                          onClick={() => setOpenGroup(null)}
                        >
                          {i.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <Link href="/settings" className={isActive('/settings')}>
              Settings
            </Link>
          </>
        )}
        <a href="#usher" onClick={(e) => { e.preventDefault(); toggleUsher(); }}>
          {usherMode ? 'Full app' : 'Usher mode'}
        </a>
        <a
          href="#logout"
          onClick={(e) => {
            e.preventDefault();
            clearTokens();
            router.replace('/login');
          }}
        >
          Logout
        </a>
      </nav>
      <main className={usherMode ? 'container usher' : 'container'}>{children}</main>
    </div>
  );
}
