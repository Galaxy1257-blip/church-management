// Access-model smoke test (Gate 3 evidence): run the REAL shared role presets
// through the web access helpers and assert the tier behaviour end to end.
// Run: node_modules/.bin/tsx .ecc/access-smoke.mts
import { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRoles } from '@chms/shared';
import {
  MODULE_DEFAULTS,
  MODULE_KEYS,
  NAV_AREAS,
  ROUTE_ACCESS,
  areaForPath,
  canAccessPath,
  describeRoles,
  hasStaffAccess,
  moduleEnabled,
  visibleNavGroups,
  visibleUsherNav,
} from '../apps/web/src/lib/access.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Every area switched on: used when the point is the role, not the switch. */
const ALL_ON = { people: true, worship: true, money: true, reach: true, org: true };

// 1) Contract sync: every permission string the web layer names must exist in shared.
const named = new Set<string>([
  ...NAV_AREAS.flatMap((g) => g.items.flatMap((i) => i.permissions)),
  ...ROUTE_ACCESS.flatMap((r) => r.permissions),
]);
const unknown = [...named].filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
check('web permission strings exist in shared PERMISSIONS', unknown.length === 0, unknown.join(', '));

// 2) Every nav item must have a route rule, so nav and guard cannot disagree.
const navHrefs = NAV_AREAS.flatMap((g) => g.items.map((i) => i.href));
const unrouted = navHrefs.filter((href) => !ROUTE_ACCESS.some((r) => r.prefix === href));
check('every nav href is covered by ROUTE_ACCESS', unrouted.length === 0, unrouted.join(', '));

const allItems = NAV_AREAS.reduce((n, g) => n + g.items.length, 0);

// 3) Per-role visibility, using the presets the API actually ships.
for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
  const perms = permissionsForRoles([role]) as unknown as string[];
  const groups = visibleNavGroups(perms, ALL_ON);
  const items = groups.reduce((n, g) => n + g.items.length, 0);
  const usher = visibleUsherNav(perms);
  console.log(
    `\n${role.padEnd(14)} perms=${String(perms.length).padStart(2)} staff=${hasStaffAccess(perms)} ` +
      `nav=${items}/${allItems} groups=[${groups.map((g) => g.label).join('|')}] usherLinks=${usher.length}`,
  );
  console.log(
    '  routes: ' +
      ['/dashboard', '/members', '/checkin', '/finance', '/settings', '/org']
        .map((p) => `${p}=${canAccessPath(perms, p, ALL_ON) ? 'y' : 'n'}`)
        .join(' '),
  );

  if (role === 'SUPER_ADMIN' || role === 'PASTOR') {
    check(`${role}: sees every nav item`, items === allItems);
    check(
      `${role}: opens every gated route`,
      ROUTE_ACCESS.every((r) => canAccessPath(perms, r.prefix, ALL_ON)),
    );
  }
  if (role === 'MEMBER') {
    check('MEMBER: no staff access', hasStaffAccess(perms) === false);
    check('MEMBER: empty nav', items === 0 && groups.length === 0);
    check(
      'MEMBER: blocked from every gated route',
      ROUTE_ACCESS.every((r) => !canAccessPath(perms, r.prefix, ALL_ON)),
    );
    check('MEMBER: role chip reads Member', describeRoles(['MEMBER']) === 'Member');
  }
  if (role === 'USHER') {
    check('USHER: check-in reachable', canAccessPath(perms, '/checkin', ALL_ON));
    check(
      'USHER: finance + settings blocked',
      !canAccessPath(perms, '/finance', ALL_ON) && !canAccessPath(perms, '/settings', ALL_ON),
    );
    check(
      'USHER: cannot reach groups, roster or departments',
      !canAccessPath(perms, '/groups', ALL_ON) &&
        !canAccessPath(perms, '/roster', ALL_ON) &&
        !canAccessPath(perms, '/org', ALL_ON),
    );
    check('USHER: usher-mode links present', usher.length > 0);
  }
  if (role === 'LEADER') {
    check(
      'LEADER: members reachable, finance/settings blocked',
      canAccessPath(perms, '/members', ALL_ON) &&
        !canAccessPath(perms, '/finance', ALL_ON) &&
        !canAccessPath(perms, '/settings', ALL_ON),
    );
  }
  if (role === 'FINANCE_ADMIN') {
    check(
      'FINANCE_ADMIN: finance reachable, settings blocked',
      canAccessPath(perms, '/finance', ALL_ON) && !canAccessPath(perms, '/settings', ALL_ON),
    );
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

// 6) Area consolidation + per-church module switches (the nav-bloat fix).
check('nav is 5 areas + dashboard + settings, not 20 flat links', NAV_AREAS.length === 5 && allItems === 18);
check('every module key has an area', MODULE_KEYS.every((k) => NAV_AREAS.some((a) => a.module === k)));
check('no area is empty', NAV_AREAS.every((a) => a.items.length > 0));
check('areaForPath resolves a module', areaForPath('/expenses')?.area.module === 'money');

// A church switching an area off: hidden from nav, route guard and dashboard,
// but Settings stays reachable so the switch can be undone.
const noMoney = { money: false };
check('module off hides the area from the nav', visibleNavGroups(su, noMoney).every((g) => g.label !== 'Money'));
check('module off closes its routes', !canAccessPath(su, '/finance', noMoney) && !canAccessPath(su, '/expenses/x', noMoney));
check('module off leaves other areas alone', canAccessPath(su, '/members', noMoney));
check('module off still allows /settings', canAccessPath(su, '/settings', { org: false, money: false, people: false }));
check('absent flag uses the church default', moduleEnabled(undefined, 'money') && moduleEnabled({}, 'money'));
check('explicit false means disabled', !moduleEnabled({ money: false }, 'money'));
check('no module key means always on', moduleEnabled({ money: false }, undefined));

// Worship starts switched off; Settings can tick it back on.
check('worship defaults off', MODULE_DEFAULTS.worship === false && !moduleEnabled(undefined, 'worship'));
check('worship off hides its area from the nav', visibleNavGroups(su).every((g) => g.label !== 'Worship'));
check('worship off closes its routes', !canAccessPath(su, '/services') && !canAccessPath(su, '/checkin'));
check(
  'worship can be switched back on',
  moduleEnabled({ worship: true }, 'worship') && canAccessPath(su, '/checkin', { worship: true }),
);
check(
  'all five off still leaves /settings and /dashboard',
  canAccessPath(su, '/settings', { people: false, worship: false, money: false, reach: false, org: false }),
);
check(
  'permission still wins over module',
  !canAccessPath(noFinance, '/finance', { money: true }),
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
