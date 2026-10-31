'use client';
// The one navigation the app has: grouped sidebar on desktop, rail for usher
// mode, drawer on phones. Links come pre-filtered from lib/access.ts, so this
// component never decides who may see what — it only renders and searches.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SCOPE_LABEL,
  describeRoles,
  hasPermission,
  type NavGroup,
  type NavItem,
  type SessionUser,
} from '../lib/access';

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
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Navigation closes the drawer and clears the filter.
  useEffect(() => {
    setDrawerOpen(false);
    setQuery('');
  }, [pathname]);

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
        window.setTimeout(() => searchRef.current?.focus(), 40);
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

      <aside id="app-menu" className={`side-nav${drawerOpen ? ' open' : ''}`} aria-label="Main menu">
        <div className="side-head">
          <Link href={home} className="brand" title={me.church.name}>
            {logo ? <img src={logo} alt="" style={{ height: 22 }} /> : null}
            ChMS
          </Link>
          <span className="church">{me.church.name}</span>
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

            <nav className="side-groups" aria-label="Sections">
              {hasPermission(me.permissions, 'church:read') ? (
                <Link
                  href="/dashboard"
                  className={`side-link${isActive('/dashboard') ? ' active' : ''}`}
                  aria-current={isActive('/dashboard') ? 'page' : undefined}
                >
                  Dashboard
                </Link>
              ) : null}

              {filtered.map((group) => (
                <div key={group.label} className="side-group">
                  <div className="side-label">{group.label}</div>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`side-link${isActive(item.href) ? ' active' : ''}`}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}

              {filtered.length === 0 ? (
                <p className="side-empty">No page matches “{query.trim()}”.</p>
              ) : null}

              {hasPermission(me.permissions, 'settings:write') ? (
                <Link
                  href="/settings"
                  className={`side-link side-settings${isActive('/settings') ? ' active' : ''}`}
                  aria-current={isActive('/settings') ? 'page' : undefined}
                >
                  Settings
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
