// Access-model smoke test (Gate 3 evidence): run the REAL shared role presets
// through the web access helpers and assert the tier behaviour end to end.
// Run: node_modules/.bin/tsx .ecc/access-smoke.mts
import { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRoles } from '@chms/shared';
import {
  NAV_GROUPS,
  ROUTE_ACCESS,
  canAccessPath,
  describeRoles,
  hasStaffAccess,
  visibleNavGroups,
  visibleUsherNav,
} from '../apps/web/src/lib/access.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1) Contract sync: every permission string the web layer names must exist in shared.
const named = new Set<string>([
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.permission)),
  ...ROUTE_ACCESS.map((r) => r.permission),
]);
const unknown = [...named].filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
check('web permission strings exist in shared PERMISSIONS', unknown.length === 0, unknown.join(', '));

// 2) Every nav item must have a route rule, so nav and guard cannot disagree.
const navHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
const unrouted = navHrefs.filter((href) => !ROUTE_ACCESS.some((r) => r.prefix === href));
check('every nav href is covered by ROUTE_ACCESS', unrouted.length === 0, unrouted.join(', '));

const allItems = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);

// 3) Per-role visibility, using the presets the API actually ships.
for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
  const perms = permissionsForRoles([role]) as unknown as string[];
  const groups = visibleNavGroups(perms);
  const items = groups.reduce((n, g) => n + g.items.length, 0);
  const usher = visibleUsherNav(perms);
  console.log(
    `\n${role.padEnd(14)} perms=${String(perms.length).padStart(2)} staff=${hasStaffAccess(perms)} ` +
      `nav=${items}/${allItems} groups=[${groups.map((g) => g.label).join('|')}] usherLinks=${usher.length}`,
  );
  console.log(
    '  routes: ' +
      ['/dashboard', '/members', '/checkin', '/finance', '/settings', '/org']
        .map((p) => `${p}=${canAccessPath(perms, p) ? 'y' : 'n'}`)
        .join(' '),
  );

  if (role === 'SUPER_ADMIN' || role === 'PASTOR') {
    check(`${role}: sees every nav item`, items === allItems);
    check(
      `${role}: opens every gated route`,
      ROUTE_ACCESS.every((r) => canAccessPath(perms, r.prefix)),
    );
  }
  if (role === 'MEMBER') {
    check('MEMBER: no staff access', hasStaffAccess(perms) === false);
    check('MEMBER: empty nav', items === 0 && groups.length === 0);
    check('MEMBER: blocked from every gated route', ROUTE_ACCESS.every((r) => !canAccessPath(perms, r.prefix)));
    check('MEMBER: role chip reads Member', describeRoles(['MEMBER']) === 'Member');
  }
  if (role === 'USHER') {
    check('USHER: check-in reachable', canAccessPath(perms, '/checkin'));
    check('USHER: finance + settings blocked', !canAccessPath(perms, '/finance') && !canAccessPath(perms, '/settings'));
    check('USHER: usher-mode links present', usher.length > 0);
  }
  if (role === 'LEADER') {
    check('LEADER: members reachable, finance/settings blocked',
      canAccessPath(perms, '/members') && !canAccessPath(perms, '/finance') && !canAccessPath(perms, '/settings'));
  }
  if (role === 'FINANCE_ADMIN') {
    check('FINANCE_ADMIN: finance reachable, settings blocked',
      canAccessPath(perms, '/finance') && !canAccessPath(perms, '/settings'));
  }
}

// 4) Longest-prefix guard behaviour on nested routes.
const su = ['*'];
check('nested path inherits its module rule', canAccessPath(su, '/members/abc-123'));
check('unknown path stays ungated', canAccessPath(['church:read'], '/portal'));
const noFinance = permissionsForRoles(['USHER']) as unknown as string[];
check('nested denied path is denied', !canAccessPath(noFinance, '/finance/batches/42'));

// 5) Role chip label formatting.
check('chip: multi-role join', describeRoles(['FINANCE_ADMIN', 'LEADER']) === 'Finance admin · Leader');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
