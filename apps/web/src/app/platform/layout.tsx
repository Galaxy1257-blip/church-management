'use client';
// Platform Office shell. Login lives under /platform/login and renders without
// the bar; everything else needs a staff token or goes back to that page.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  clearPlatformSession,
  platformApi,
  platformToken,
  platformUser,
  type PlatformUser,
} from '../../lib/platform';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const isLogin = pathname === '/platform/login';
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<PlatformUser | null>(null);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    if (!platformToken()) {
      router.replace('/platform/login');
      return;
    }
    setStaff(platformUser());
    setReady(true);
    platformApi<PlatformUser>('/platform/auth/me')
      .then((me) => {
        setStaff(me);
        sessionStorage.setItem('chms.platform.user', JSON.stringify(me));
      })
      .catch(() => {
        /* the wrapper already sent a 401 back to sign-in */
      });
  }, [isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (!ready) return <div className="container">Loading…</div>;

  function logout(): void {
    clearPlatformSession();
    router.replace('/platform/login');
  }

  const active = (href: string) => (href === '/platform' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="office-shell">
      <header className="office-bar">
        <Link href="/platform" className="office-brand">
          ChMS Office
        </Link>
        <nav className="office-links" aria-label="Platform sections">
          <Link href="/platform" className={`office-link${active('/platform') ? ' active' : ''}`}>
            Overview
          </Link>
          <Link href="/platform/churches" className={`office-link${active('/platform/churches') ? ' active' : ''}`}>
            Churches
          </Link>
          <Link href="/platform/payments" className={`office-link${active('/platform/payments') ? ' active' : ''}`}>
            Payments
          </Link>
          {staff?.role === 'OWNER' ? (
            <Link href="/platform/team" className={`office-link${active('/platform/team') ? ' active' : ''}`}>
              Team
            </Link>
          ) : null}
        </nav>
        <span className="office-spacer" />
        <span className="office-user">{staff ? `${staff.name} · ${staff.role}` : ''}</span>
        <button type="button" className="secondary small" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
