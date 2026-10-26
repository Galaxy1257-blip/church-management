'use client';
// The tab strip that turns the five areas into their individual screens.
// Rendered once from the app layout (keyed off the pathname), so consolidating
// the nav did not require touching any of the ~18 page components.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { visibleAreaTabs, type ModuleFlags } from '../lib/access';

export default function AreaTabs({
  permissions,
  modules,
}: {
  permissions: readonly string[];
  modules?: ModuleFlags;
}) {
  const pathname = usePathname() ?? '';
  const active = visibleAreaTabs(pathname, permissions, modules);
  if (!active) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav className="area-tabs" aria-label={`${active.area.label} sections`}>
      {active.items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={isActive(item.href) ? 'on' : undefined}
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
