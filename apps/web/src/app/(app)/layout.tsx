'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens, hasSession } from '../../lib/api';
import AppNav from '../../components/app-nav';
import { clearSession, getSession } from '../../lib/session';
import {
  areaForItem,
  canAccessPath,
  hasPermission,
  hasStaffAccess,
  moduleEnabled,
  routeAccess,
  visibleNavGroups,
  visibleUsherNav,
  type SessionUser,
} from '../../lib/access';

// Grouped nav lives in lib/access.ts so the permission-gated menu, the route
// guard and the dashboard cards all read ONE source of truth.
//
// One shell, three presentations (components/app-nav.tsx): grouped sidebar for
// staff, a labelled rail in usher mode, and an off-canvas drawer on phones.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [usherMode, setUsherMode] = useState(false);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    getSession()
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
        clearSession();
        router.replace('/login');
      });
  }, [router]);

  function toggleUsher(): void {
    const next = !usherMode;
    setUsherMode(next);
    localStorage.setItem('chms.usherMode', next ? '1' : '0');
  }

  function logout(): void {
    clearTokens();
    clearSession();
    router.replace('/login');
  }

  if (!ready) return <div className="container">Loading…</div>;
  if (!me) return <div className="container">Loading…</div>;

  // Everything the shell shows is derived from the permission set the API
  // returned for this session — never from a hardcoded role name.
  const perms = me.permissions;
  const groups = visibleNavGroups(perms, me.modules);
  const usherNav = visibleUsherNav(perms);
  const canUsherMode = hasPermission(perms, 'headcount:write') && hasPermission(perms, 'services:read');
  const showUsher = usherMode && canUsherMode;
  const rule = routeAccess(pathname);
  // Usher mode is a curated subset of screens (Today / Check-in / Attendance /
  // Visitors); the church may switch the whole Worship area off and ushers must
  // still be able to count attendance. Anything outside that subset still needs
  // the normal permission + module check.
  const usherAllowed =
    showUsher &&
    visibleUsherNav(perms).some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
  const denied = !usherAllowed && !canAccessPath(perms, pathname, me.modules);
  // Which of the two possible reasons applies: a switched-off area or a missing
  // permission. The copy below has to say the right one, or the operator will go
  // hunting for a role that was never the problem.
  const area = rule ? areaForItem(rule.prefix) : null;
  const areaOff = area ? !moduleEnabled(me.modules, area.module) : false;
  const home = groups[0]?.items[0]?.href ?? '/dashboard';

  return (
    <div className={`app-shell${showUsher ? ' usher-shell' : ''}`}>
      <AppNav
        me={me}
        groups={groups}
        usherNav={usherNav}
        usherMode={showUsher}
        canUsherMode={canUsherMode}
        home={home}
        onToggleUsher={toggleUsher}
        onLogout={logout}
      />
      <div className="app-body">
        <main className={showUsher ? 'container usher' : 'container'}>
          {denied ? (
            <div className="card">
              <h1>{areaOff ? 'Area switched off' : 'Not available for your role'}</h1>
              <p className="muted">
                {areaOff
                  ? `${area?.label ?? 'This area'} is switched off for ${me.church.name}. A church admin can turn it back on in Settings → App sections.`
                  : `${rule ? rule.label : 'This page'} needs a permission your role does not have. Ask a church admin if you should have it.`}
              </p>
              <Link href={home}>Go to an area you can use</Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
