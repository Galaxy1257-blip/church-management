'use client';
// The one navigation the app has: grouped sidebar on desktop, rail for usher
// mode, drawer on phones. Links come pre-filtered from lib/access.ts, so this
// component never decides who may see what — it only renders and searches.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  SCOPE_LABEL,
  describeRoles,
  hasPermission,
  type NavGroup,
  type NavItem,
  type SessionUser,
} from '../lib/access';
import { useDialogFocus } from './use-dialog-focus';

export default function AppNav({
  me,
  groups,
  usherNav,
  usherMode,
  canUsherMode,
  home,
  onToggleUsher,
  onLogout,
}: {
  me: SessionUser;
  groups: NavGroup[];
  usherNav: NavItem[];
  usherMode: boolean;
  canUsherMode: boolean;
  home: string;
  onToggleUsher: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname() ?? '';
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop: collapse the sidebar to an icon rail. Phones always use the drawer.
  const [collapsed, setCollapsed] = useState(false);
  // Search is hidden for short menus; ⌘K or the header icon opens it on demand.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  useDialogFocus(menuRef, drawerOpen);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Navigation closes the drawer and clears the filter.
  useEffect(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
    setQuery('');
  }, [pathname]);

  // Focus the filter when it is opened by ⌘K or the header icon.
  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [searchOpen]);

  // Escape dismisses the on-demand filter (the drawer's own Escape stays too).
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !drawerOpen) {
        setSearchOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen, drawerOpen]);

  // Restore the desktop collapse preference, and keep --side-w in step so the
  // content margin follows. Narrow screens ignore it (the drawer takes over).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('chms.sideCollapsed') === '1');
    } catch {
      /* private mode — default expanded */
    }
  }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const wide = window.matchMedia('(min-width: 901px)');
    const apply = () => {
      document.documentElement.style.setProperty('--side-w', collapsed && wide.matches ? '80px' : '240px');
    };
    apply();
    wide.addEventListener('change', apply);
    try {
      localStorage.setItem('chms.sideCollapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
    return () => wide.removeEventListener('change', apply);
  }, [collapsed]);

  // Drawer: Escape closes, and the page behind it does not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  // Ctrl/⌘K jumps to the page filter — the thing that replaces knowing which
  // area a screen lives in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.matchMedia('(max-width: 900px)').matches) setDrawerOpen(true);
        setCollapsed(false);
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  // A Sunday School teacher with a class sees only that class, so the chip
  // should not claim "Whole church".
  const scopeLabel =
    me.careClassBracketId && !hasPermission(me.permissions, 'members:read')
      ? 'My class'
      : SCOPE_LABEL[me.scope ?? 'ALL'];
  const roleLabel = `${describeRoles(me.roles)} · ${scopeLabel}`;
  // Short, role-filtered menus don't need a visible search box; keep it for long
  // ones (a super admin) and open it on demand everywhere via ⌘K or the icon.
  const navCount =
    (hasPermission(me.permissions, 'church:read') ? 1 : 0) +
    groups.reduce((n, g) => n + g.items.length, 0) +
    (hasPermission(me.permissions, 'settings:write') ? 1 : 0);
  const showSearch = searchOpen || navCount > 8;
  const logo = me.church.branding?.logoDataUrl;

  return (
    <>
      <div className="nav-mobilebar">
        <button
          type="button"
          className="nav-burger"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>
        <Link href={home} className="brand">
          ChMS · {me.church.name}
        </Link>
      </div>

      <aside
        ref={menuRef}
        tabIndex={-1}
        id="app-menu"
        className={`side-nav${drawerOpen ? ' open' : ''}${collapsed && !usherMode ? ' collapsed' : ''}`}
        aria-label="Main menu"
      >
        <div className="side-head">
          <Link href={home} className="brand" title={me.church.name}>
            {logo ? <img src={logo} alt="" style={{ height: 22 }} /> : null}
            <span className="side-text">ChMS</span>
          </Link>
          <span className="church">{me.church.name}</span>
          {!usherMode ? (
            <button
              type="button"
              className="side-collapse"
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="side-close"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          >
            ×
          </button>
        </div>

        {usherMode ? (
          <nav className="usher-rail" aria-label="Usher sections">
            {usherNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rail-item${isActive(item.href) ? ' active' : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                <RailIcon href={item.href} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        ) : (
          <>
            {showSearch ? (
              <div className="side-search">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages…"
                  aria-label="Search pages"
                />
                <kbd>⌘K</kbd>
              </div>
            ) : null}

            <nav className="side-groups" aria-label="Sections">
              {hasPermission(me.permissions, 'church:read') ? (
                <Link
                  href="/dashboard"
                  title="Dashboard"
                  className={`side-link${isActive('/dashboard') ? ' active' : ''}`}
                  aria-current={isActive('/dashboard') ? 'page' : undefined}
                >
                  <NavIcon href="/dashboard" />
                  <span className="side-text">Dashboard</span>
                </Link>
              ) : null}

              {filtered.map((group) => (
                <div key={group.label} className="side-group">
                  <div className="side-label">{group.label}</div>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={`side-link${isActive(item.href) ? ' active' : ''}`}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                      <NavIcon href={item.href} />
                      <span className="side-text">{item.label}</span>
                    </Link>
                  ))}
                </div>
              ))}

              {filtered.length === 0 ? (
                <p className="side-empty">
                  {query.trim()
                    ? `No page matches “${query.trim()}”.`
                    : 'Nothing is switched on for your role yet. The Dashboard is still yours, and the office can open an area in Settings → App sections.'}
                </p>
              ) : null}

              {hasPermission(me.permissions, 'settings:write') ? (
                <Link
                  href="/settings"
                  title="Settings"
                  className={`side-link side-settings${isActive('/settings') ? ' active' : ''}`}
                  aria-current={isActive('/settings') ? 'page' : undefined}
                >
                  <NavIcon href="/settings" />
                  <span className="side-text">Settings</span>
                </Link>
              ) : null}
            </nav>
          </>
        )}

        <div className="side-foot">
          <span className="side-role">{roleLabel}</span>
          {canUsherMode ? (
            <button type="button" className="side-action" onClick={onToggleUsher}>
              {usherMode ? 'Full app' : 'Usher mode'}
            </button>
          ) : null}
          <Link href="/about" className={`side-action${isActive('/about') ? ' active' : ''}`}>
            About
          </Link>
          {me.church.slug ? (
            <Link
              href={`/flyers/${me.church.slug}`}
              className={`side-action${isActive(`/flyers/${me.church.slug}`) ? ' active' : ''}`}
            >
              Share links
            </Link>
          ) : null}
          <Link href="/help" className="side-action">
            Help
          </Link>
          <button type="button" className="side-action" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      {drawerOpen ? (
        <button
          type="button"
          className="side-scrim"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}
    </>
  );
}

function RailIcon({ href }: { href: string }) {
  const common = {
    viewBox: '0 0 20 20',
    'aria-hidden': true,
  } as const;
  if (href === '/dashboard') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="6" height="6" rx="1.4" />
        <rect x="11" y="3" width="6" height="6" rx="1.4" />
        <rect x="3" y="11" width="6" height="6" rx="1.4" />
        <rect x="11" y="11" width="6" height="6" rx="1.4" />
      </svg>
    );
  }
  if (href === '/checkin') {
    return (
      <svg {...common}>
        <rect x="4.5" y="3.5" width="11" height="14" rx="2" />
        <path d="M8 3.5h4" />
        <path d="M7.5 11.2 9 12.7l3.4-3.4" />
      </svg>
    );
  }
  if (href === '/services') {
    return (
      <svg {...common}>
        <circle cx="7.5" cy="7" r="2.8" />
        <path d="M2.8 16.4c0-2.7 2.1-4.4 4.7-4.4s4.7 1.7 4.7 4.4" />
        <circle cx="14.3" cy="7.8" r="2.1" />
        <path d="M13.2 12.2c2.1.1 3.9 1.6 3.9 3.9" />
      </svg>
    );
  }
  if (href === '/visitors') {
    return (
      <svg {...common}>
        <circle cx="8" cy="7" r="2.9" />
        <path d="M3 16.4c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" />
        <path d="M16 6v4M14 8h4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="6" />
    </svg>
  );
}

/** Outlined icon per destination (Lucide-style, one stroke weight). */
function NavIcon({ href }: { href: string }) {
  const seg = href.replace(/^\//, '').split('/')[0];
  const icons: Record<string, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.6" />
        <rect x="14" y="3" width="7" height="7" rx="1.6" />
        <rect x="14" y="14" width="7" height="7" rx="1.6" />
        <rect x="3" y="14" width="7" height="7" rx="1.6" />
      </>
    ),
    members: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    visitors: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </>
    ),
    'join-card': (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="M11 12l9-9M17 6l3 3M15 8l3 3" />
      </>
    ),
    groups: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" />
        <path d="M15.5 19c0-2 1.4-3.4 3.4-3.4S22 16.9 22 19" />
      </>
    ),
    children: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 10h.01M15 10h.01" />
        <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
      </>
    ),
    checkin: (
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M9 14l2 2 4-4" />
      </>
    ),
    services: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
        <path d="M9 15l2 2 4-4" />
      </>
    ),
    roster: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    events: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </>
    ),
    finance: (
      <>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 12h.01M18 12h.01" />
      </>
    ),
    expenses: (
      <>
        <path d="M6 2h12a1 1 0 0 1 1 1v19l-2.5-1.5L14 22l-2-1.5L10 22l-2.5-1.5L5 22V3a1 1 0 0 1 1-1z" />
        <path d="M9 7h6M9 11h6M9 15h4" />
      </>
    ),
    announcements: (
      <>
        <path d="M3 11l18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </>
    ),
    reminders: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M10.3 21a2 2 0 0 0 3.4 0" />
      </>
    ),
    outreach: (
      <>
        <path d="M4 22V4" />
        <path d="M4 4h12l-2 4 2 4H4" />
      </>
    ),
    sms: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </>
    ),
    care: (
      <>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </>
    ),
    org: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M9 21v-4h6v4" />
        <path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01" />
      </>
    ),
    branches: (
      <>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="8" r="2.5" />
        <path d="M6 8.5v7" />
        <path d="M18 10.5c0 4-4 5-4 5H9" />
      </>
    ),
    audit: (
      <>
        <path d="M3 3v5h5" />
        <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
        <path d="M12 7v5l4 2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </>
    ),
  };
  return (
    <svg className="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
      {icons[seg] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  );
}
