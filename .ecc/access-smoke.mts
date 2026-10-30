// Access-model smoke test (Gate 3 evidence): run the REAL shared role presets
// through the web access helpers and assert the tier behaviour end to end.
// Run: node_modules/.bin/tsx .ecc/access-smoke.mts
import { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRoles } from '@chms/shared';
import {
  CARE_ROLES,
  MODULE_DEFAULTS,
  MODULE_KEYS,
  NAV_AREAS,
  ROUTE_ACCESS,
  areaForPath,
  canAccessPath,
  describeRoles,
  hasStaffAccess,
  isCareRole,
  moduleEnabled,
  moduleForPath,
  visibleNavGroups,
  visibleUsherNav,
} from '../apps/web/src/lib/access.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Every section switched on: used when the point is the role, not the switch. */
const ALL_ON = Object.fromEntries(MODULE_KEYS.map((key) => [key, true]));

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
check('media page is gone from nav and routes', !navHrefs.includes('/media') && !ROUTE_ACCESS.some((r) => r.prefix === '/media'));

// 3) Per-role visibility, using the presets the API actually ships.
for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
  const perms = permissionsForRoles([role]) as unknown as string[];
  const roles = [role as string];
  const groups = visibleNavGroups(perms, ALL_ON, roles);
  const items = groups.reduce((n, g) => n + g.items.length, 0);
  const usher = visibleUsherNav(perms);
  console.log(
    `\n${role.padEnd(14)} perms=${String(perms.length).padStart(2)} staff=${hasStaffAccess(perms)} ` +
      `nav=${items}/${allItems} groups=[${groups.map((g) => g.label).join('|')}] usherLinks=${usher.length}`,
  );
  console.log(
    '  routes: ' +
      ['/dashboard', '/members', '/checkin', '/care', '/finance', '/settings', '/org', '/branches']
        .map((p) => `${p}=${canAccessPath(perms, p, ALL_ON, roles) ? 'y' : 'n'}`)
        .join(' '),
  );

  if (role === 'SUPER_ADMIN' || role === 'PASTOR') {
    // Care is the one page that names roles, so even a wildcard does not show it.
    check(`${role}: care is role-gated`, !canAccessPath(perms, '/care', ALL_ON, roles));
  }
  if (role === 'MEMBER') {
    check('MEMBER: no staff access', hasStaffAccess(perms) === false);
    check('MEMBER: empty nav', items === 0 && groups.length === 0);
    check(
      'MEMBER: blocked from every gated route',
      ROUTE_ACCESS.every((r) => !canAccessPath(perms, r.prefix, ALL_ON, roles)),
    );
    check('MEMBER: role chip reads Member', describeRoles(['MEMBER']) === 'Member');
  }
  if (role === 'USHER') {
    check('USHER: check-in reachable', canAccessPath(perms, '/checkin', ALL_ON, roles));
    check(
      'USHER: finance + settings blocked',
      !canAccessPath(perms, '/finance', ALL_ON, roles) && !canAccessPath(perms, '/settings', ALL_ON, roles),
    );
    check(
      'USHER: cannot reach groups, roster or departments',
      !canAccessPath(perms, '/groups', ALL_ON, roles) &&
        !canAccessPath(perms, '/roster', ALL_ON, roles) &&
        !canAccessPath(perms, '/org', ALL_ON, roles),
    );
    check('USHER: rides the usher rail', usher.length > 0);
    check('USHER: sees Care when it is switched on', canAccessPath(perms, '/care', ALL_ON, roles));
  }
  if (role === 'SUNDAY_SCHOOL') {
    check('SUNDAY_SCHOOL: sees Care when switched on', canAccessPath(perms, '/care', ALL_ON, roles));
    check('SUNDAY_SCHOOL: check-in reachable', canAccessPath(perms, '/checkin', ALL_ON, roles));
    check('SUNDAY_SCHOOL: finance blocked', !canAccessPath(perms, '/finance', ALL_ON, roles));
  }
  if (role === 'ELDER' || role === 'FOLLOWUP_TEAM') {
    check(`${role}: Care hidden even with care:read`, !canAccessPath(perms, '/care', ALL_ON, roles));
  }
  if (role === 'LEADER') {
    check(
      'LEADER: members reachable, finance/settings blocked',
      canAccessPath(perms, '/members', ALL_ON, roles) &&
        !canAccessPath(perms, '/finance', ALL_ON, roles) &&
        !canAccessPath(perms, '/settings', ALL_ON, roles),
    );
  }
  if (role === 'FINANCE_ADMIN') {
    check(
      'FINANCE_ADMIN: finance reachable, settings blocked',
      canAccessPath(perms, '/finance', ALL_ON, roles) && !canAccessPath(perms, '/settings', ALL_ON, roles),
    );
  }
}

check('care roles are ushers + Sunday School teachers', CARE_ROLES.join(',') === 'USHER,SUNDAY_SCHOOL');
check('isCareRole reads a session role list', isCareRole(['SUNDAY_SCHOOL']) && !isCareRole(['PASTOR']));

// 4) Longest-prefix guard behaviour on nested routes.
const su = ['*'];
check('nested path inherits its module rule', canAccessPath(su, '/members/abc-123'));
check('unknown path stays ungated', canAccessPath(['church:read'], '/portal'));
const noFinance = permissionsForRoles(['USHER']) as unknown as string[];
check('nested denied path is denied', !canAccessPath(noFinance, '/finance/batches/42'));

// 5) Role chip label formatting.
check('chip: multi-role join', describeRoles(['FINANCE_ADMIN', 'LEADER']) === 'Finance admin · Leader');

// 6) Area consolidation + per-church module switches (the nav-bloat fix).
check('nav is 5 areas + dashboard + settings, not 20 flat links', NAV_AREAS.length === 5 && allItems === 17);
check('no area is empty', NAV_AREAS.every((a) => a.items.length > 0));
check('areaForPath resolves a module', areaForPath('/expenses')?.area.module === 'money');
check('per-item switches resolve', moduleForPath('/care') === 'care' && moduleForPath('/roster') === 'roster');
check('departments and branches are separate switches', moduleForPath('/org') === 'departments' && moduleForPath('/branches') === 'branches');

// New sections start off; ticking one reveals only that page.
for (const key of ['care', 'roster', 'departments', 'branches'] as const) {
  check(`${key} defaults off`, MODULE_DEFAULTS[key] === false && !moduleEnabled(undefined, key));
}
check('care off closes its route', !canAccessPath(su, '/care', { ...ALL_ON, care: false }, ['USHER']));
check('care on opens it for ushers', canAccessPath(su, '/care', { ...ALL_ON, care: true }, ['USHER']));
check('roster on opens it', canAccessPath(su, '/roster', { ...ALL_ON, roster: true }, ['LEADER']));
check('departments off closes /org', !canAccessPath(su, '/org', { ...ALL_ON, departments: false }, ['PASTOR']));
check('branches stay open when departments are off', canAccessPath(su, '/branches', { ...ALL_ON, departments: false, branches: true }, ['PASTOR']));

// A church switching an area off: hidden from nav, route guard and dashboard,
// but Settings stays reachable so the switch can be undone.
const noMoney = { money: false };
check('module off hides the area from the nav', visibleNavGroups(su, noMoney).every((g) => g.label !== 'Money'));
check('module off closes its routes', !canAccessPath(su, '/finance', noMoney) && !canAccessPath(su, '/expenses/x', noMoney));
check('module off leaves other areas alone', canAccessPath(su, '/members', noMoney));
check('module off still allows /settings', canAccessPath(su, '/settings', { ...ALL_ON, ...noMoney }));
check('absent flag uses the church default', moduleEnabled(undefined, 'money') && moduleEnabled({}, 'money'));
check('explicit false means disabled', !moduleEnabled({ money: false }, 'money'));
check('no module key means always on', moduleEnabled({ money: false }, undefined));

// Defaults: people/money/reach on, the four owner-requested sections off.
check('default keepers stay on', MODULE_DEFAULTS.people && MODULE_DEFAULTS.money && MODULE_DEFAULTS.reach);
check('all opt-in sections can be switched back on', MODULE_KEYS.every((key) => moduleEnabled({ [key]: true }, key)));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
