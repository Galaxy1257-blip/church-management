'use client';
// The one navigation the app has: grouped sidebar on desktop, rail for usher
// mode, drawer on phones. Links come pre-filtered from lib/access.ts, so this
// component never decides who may see what — it only renders and searches.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Baby,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ClipboardCheck,
  DollarSign,
  Flag,
  GitBranch,
  Heart,
  HelpCircle,
  History,
  Info,
  KeyRound,
  LayoutGrid,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Receipt,
  Settings,
  Share2,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
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
  // Adjustable position for the utility bar ('bottom' default, or 'top').
  const [footPos, setFootPos] = useState<'bottom' | 'top'>('bottom');
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
      const savedPos = localStorage.getItem('chms.sideFootPos');
      if (savedPos === 'top' || savedPos === 'bottom') setFootPos(savedPos);
    } catch {
      /* private mode — default expanded */
    }
  }, []);
  function toggleFootPos(): void {
    const next = footPos === 'bottom' ? 'top' : 'bottom';
    setFootPos(next);
    try {
      localStorage.setItem('chms.sideFootPos', next);
    } catch {
      /* ignore */
    }
  }
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
  // Short, role-filtered menus don't need a visible search box. Keep it for a
  // superuser/dev (wildcard '*') and for any genuinely long menu; everyone else
  // summons it on demand with ⌘K.
  const isSuperUser = hasPermission(me.permissions, '*');
  const navCount =
    (hasPermission(me.permissions, 'church:read') ? 1 : 0) +
    groups.reduce((n, g) => n + g.items.length, 0) +
    (hasPermission(me.permissions, 'settings:write') ? 1 : 0);
  const showSearch = searchOpen || isSuperUser || navCount > 8;
  const logo = me.church.branding?.logoDataUrl;

  const utilityBar = (
    <div className={`side-foot${footPos === 'top' ? ' side-foot-top' : ''}`}>
      <div className="side-foot-head">
        <span className="side-role" title={roleLabel}>{roleLabel}</span>
        {!usherMode ? (
          <button
            type="button"
            className="side-icon-btn side-pos-btn"
            onClick={toggleFootPos}
            title={footPos === 'bottom' ? 'Move bar to top' : 'Move bar to bottom'}
            aria-label={footPos === 'bottom' ? 'Move bar to top' : 'Move bar to bottom'}
          >
            {footPos === 'bottom' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      <div className="side-foot-icons">
        {canUsherMode ? (
          <button
            type="button"
            className="side-icon-btn"
            onClick={onToggleUsher}
            title={usherMode ? 'Full app' : 'Usher mode'}
            aria-label={usherMode ? 'Full app' : 'Usher mode'}
          >
            {usherMode ? <LayoutGrid size={16} aria-hidden="true" /> : <UserCheck size={16} aria-hidden="true" />}
          </button>
        ) : null}
        <Link
          href="/about"
          className={`side-icon-btn${isActive('/about') ? ' active' : ''}`}
          title="About"
          aria-label="About"
        >
          <Info size={16} aria-hidden="true" />
        </Link>
        {me.church.slug ? (
          <Link
            href={`/flyers/${me.church.slug}`}
            className={`side-icon-btn${isActive(`/flyers/${me.church.slug}`) ? ' active' : ''}`}
            title="Share links"
            aria-label="Share links"
          >
            <Share2 size={16} aria-hidden="true" />
          </Link>
        ) : null}
        <Link
          href="/help"
          className={`side-icon-btn${isActive('/help') ? ' active' : ''}`}
          title="Help"
          aria-label="Help"
        >
          <HelpCircle size={16} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="side-icon-btn"
          onClick={onLogout}
          title="Log out"
          aria-label="Log out"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );

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
          <Menu size={20} aria-hidden="true" />
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
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="side-close"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {footPos === 'top' && !usherMode ? utilityBar : null}

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

        {footPos === 'bottom' || usherMode ? utilityBar : null}
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

const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutGrid,
  members: Users,
  visitors: UserPlus,
  'join-card': KeyRound,
  groups: UsersRound,
  children: Baby,
  checkin: ClipboardCheck,
  services: CalendarCheck,
  roster: ListChecks,
  events: Calendar,
  finance: DollarSign,
  expenses: Receipt,
  announcements: Megaphone,
  reminders: Bell,
  outreach: Flag,
  sms: MessageSquare,
  care: Heart,
  org: Building2,
  branches: GitBranch,
  audit: History,
  settings: Settings,
};

function RailIcon({ href }: { href: string }) {
  const seg = href.replace(/^\//, '').split('/')[0];
  const Icon = NAV_ICONS[seg] ?? LayoutGrid;
  return <Icon size={20} strokeWidth={1.7} aria-hidden="true" />;
}

/** Outlined Lucide icon per destination (one consistent stroke weight). */
function NavIcon({ href }: { href: string }) {
  const seg = href.replace(/^\//, '').split('/')[0];
  const Icon = NAV_ICONS[seg] ?? LayoutGrid;
  return <Icon className="nav-ic" size={18} strokeWidth={1.7} aria-hidden="true" />;
}
