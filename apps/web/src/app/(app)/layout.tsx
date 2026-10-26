'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, clearTokens, hasSession } from '../../lib/api';
import {
  SCOPE_LABEL,
  canAccessPath,
  describeRoles,
  hasPermission,
  hasStaffAccess,
  routeAccess,
  visibleNavGroups,
  visibleUsherNav,
  type SessionUser,
} from '../../lib/access';


// Grouped nav lives in lib/access.ts so the permission-gated nav, the route
// guard and the dashboard cards all read ONE source of truth.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<SessionUser | null>(null);
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
    api<SessionUser>('/auth/me')
      .then((m) => {
        // Members hold no staff permission: the staff shell is not theirs.
        if (!hasStaffAccess(m.permissions)) {
          router.replace('/portal');
          return;
        }
        setMe(m);
        if (m.church.branding?.primaryColor) document.documentElement.style.setProperty('--brand', m.church.branding.primaryColor);
        // Usher mode is only offered to people who can actually run a service.
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
  if (!me) return <div className="container">Loading…</div>;

  // Everything the shell shows is derived from the permission set the API
  // returned for this session — never from a hardcoded role name.
  const perms = me.permissions;
  const groups = visibleNavGroups(perms);
  const usherNav = visibleUsherNav(perms);
  const canUsherMode = hasPermission(perms, 'headcount:write') && hasPermission(perms, 'services:read');
  const showUsher = usherMode && canUsherMode;
  const rule = routeAccess(pathname);
  const denied = !canAccessPath(perms, pathname);
  const home = groups[0]?.items[0]?.href ?? '/dashboard';
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
        {showUsher ? (
          usherNav.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href)}>
              {item.label}
            </Link>
          ))
        ) : (
          <>
            {hasPermission(perms, 'church:read') ? (
              <Link href="/dashboard" className={isActive('/dashboard')}>
                Dashboard
              </Link>
            ) : null}
            {groups.map((group) => {
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
            {hasPermission(perms, 'settings:write') ? (
              <Link href="/settings" className={isActive('/settings')}>
                Settings
              </Link>
            ) : null}
          </>
        )}
        <span className="badge mute" title={`Data scope: ${SCOPE_LABEL[me.scope ?? 'ALL']}`}>
          {describeRoles(me.roles)} · {SCOPE_LABEL[me.scope ?? 'ALL']}
        </span>
        {canUsherMode ? (
          <a href="#usher" onClick={(e) => { e.preventDefault(); toggleUsher(); }}>
            {showUsher ? 'Full app' : 'Usher mode'}
          </a>
        ) : null}
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
      <main className={showUsher ? 'container usher' : 'container'}>
        {denied ? (
          <div className="card">
            <h1>Not available for your role</h1>
            <p className="muted">
              {rule ? `${rule.label} needs a permission your role does not have.` : 'This page needs a permission your role does not have.'}{' '}
              Ask a church admin if you should have it.
            </p>
            <Link href={home}>Go to an area you can use</Link>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
