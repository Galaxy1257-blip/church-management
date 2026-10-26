# 001 — Implementation Plan: role-based visibility (superuser/pastor vs leaders/members)

Status: **approved** (owner request 2026-10-26: "superuser and pastor .etc see all but
lower leaders and members only see what they are allowed to see").
Author: Cline. Gate: artifact-gates §1.

## 1. Problem statement (evidence)

| Observation | Evidence |
|---|---|
| The API is already default-deny RBAC | `apps/api/src/common/guards.ts:92` PermissionsGuard; `common/boot-check.ts:23` fails boot when a route lacks `@RequirePermissions`/`@Public` |
| Role presets exist for 8 roles, **no PASTOR** | `packages/shared/src/permissions.ts:53`; `packages/shared/src/enums.ts:7`; `schema.prisma:24` `enum RoleKey` |
| Web nav shows **every** module to **every** signed-in user | `apps/web/src/app/(app)/layout.tsx:10` `NAV_GROUPS` is a static list; only Usher Mode narrows it, and that is a *user toggle* |
| No route-level guard in the web app | `apps/web/src/app/(app)/layout.tsx:224` renders `{children}` unconditionally |
| Member (`MEMBER: []`) cannot even load the shell | `/auth/me` requires `church:read` (`apps/api/src/auth/auth.controller.ts:82`), MEMBER has zero permissions |
| Dashboard 500s for low-privilege roles | `dashboard/page.tsx:27` `Promise.all([... '/sms/wallet', '/finance/reports/by-fund' ...])` — USHER lacks `sms:read`/`reports:read`, so the whole page errors instead of degrading |
| JWT carries roles+permissions but no data scope | `auth.service.ts:80` `AccessClaims` |

## 2. Design decisions

1. **Three visible tiers**, encoded in `@chms/shared` so api/web/worker agree:
   - `PLATFORM` → `SUPER_ADMIN` (wildcard `*`, future permissions included).
   - `CHURCH` → `PASTOR` (new; every church permission, explicit list — "sees all").
   - `DEPARTMENT` → FINANCE_ADMIN, LEADER, ELDER, SECRETARY, FOLLOWUP_TEAM, USHER
     (only the modules their preset grants).
   - `SELF` → MEMBER (no staff app; companion `/portal` only).
2. **Data scope** derived from roles × branch assignments:
   `ALL` (platform/church tier, or department user with no branch rows) ·
   `BRANCH` (department user assigned to branches) · `SELF` · `NONE`.
   Shipped in the access token and `/auth/me` so the UI can state the scope honestly.
3. **PASTOR gets `[...PERMISSIONS]`**, not `*`: full church visibility today, while
   `*` stays reserved for the platform superuser (future/platform-only permissions).
4. **`@Authenticated()` decorator**: authenticated-but-no-permission routes. Needed for
   `/auth/me` so a MEMBER account can read its own identity and the shell can tell them
   to use `/portal`. Default-deny is preserved (boot check + guard must accept it explicitly).
5. **Web gating is add-on, not the security boundary.** The API already returns 403;
   the web layer only stops users *seeing* modules they cannot use. Single source of
   truth for the web: `apps/web/src/lib/access.ts` (web intentionally does not import
   `@chms/shared` — see `lib/shared-constants.ts:1` "eliminate workspace build dependency").
6. **Dashboard degrades per permission** instead of `Promise.all` on permissions the
   viewer may not hold.

## 3. Files to change

| # | File | Change |
|---|---|---|
| 1 | `packages/shared/src/enums.ts` | add `PASTOR` to `RoleKey` + `ROLE_KEYS` |
| 2 | `packages/shared/src/permissions.ts` | `PASTOR` preset = all permissions; `ROLE_TIERS`, `RoleTier`, `DataScope`, `resolveDataScope()`, `isChurchWide()`; defensive unknown-role handling |
| 3 | `packages/shared/src/permissions.test.ts` | tests for PASTOR breadth, tiers, scope resolution |
| 4 | `schema.prisma` | `PASTOR` in `enum RoleKey` |
| 5 | `migrations/1_pastor_role/migration.sql` | `ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'PASTOR'` |
| 6 | `packages/db/src/seed-constants.ts` | seed `PASTOR` role (name "Pastor") |
| 7 | `packages/db/src/seed-church.ts` | keep default-role permission sets in sync (so existing churches gain PASTOR + refreshed presets) |
| 8 | `apps/api/src/common/decorators.ts` | `AUTHENTICATED_KEY`, `Authenticated()` |
| 9 | `apps/api/src/common/guards.ts` | `scope` on `AuthUser`; claim + derived fallback; `@Authenticated` branch in PermissionsGuard |
| 10 | `apps/api/src/common/boot-check.ts` | accept `@Authenticated` as a declared policy |
| 11 | `apps/api/src/auth/auth.service.ts` | `scope` in claims + `me()` |
| 12 | `apps/api/src/auth/auth.controller.ts` | `/auth/me` → `@Authenticated()` |
| 13 | `apps/api/src/common/guards.spec.ts` | `@Authenticated` + scope tests |
| 14 | `apps/web/src/lib/access.ts` | **new**: nav model + page→permission map + `hasPermission`/`canAccessPath`/`visibleNavGroups` |
| 15 | `apps/web/src/app/(app)/layout.tsx` | permission-filtered nav, route guard, member screen, role/scope chip, usher toggle only for ushers |
| 16 | `apps/web/src/app/(app)/dashboard/page.tsx` | permission-aware data loading + conditional cards |
| 17 | `STATE.md`, `LOGS.md` | session handoff (§10 protocol) |


## 4. Verification plan (Gate 3)

- `npx prisma generate --schema schema.prisma` (generated client must know `PASTOR`).
- `npm run typecheck` (shared/db/api/worker/web).
- `npm run test` (shared + api + worker vitest).
- `npx eslint .`
- `npm run check:secrets`.
- Boot-check reasoning: no new unprotected route (only a new decorator).
- Migration is additive (`ADD VALUE IF NOT EXISTS`) — safe on `chms` and `chms_test`;
  applying it to the live DB is an operator step (`npm run db:migrate:deploy`).

## 5. Explicitly NOT covered (honest limits)

- **Custom roles / user management UI**: there is no `/users` endpoint today
  (`users:read|write` are unused), so assigning PASTOR to a person needs SQL/seed.
- **Branch-level row filtering beyond `Transaction`**: `extras.sql:62` `branch_scope`
  is RESTRICTIVE on `Transaction` only. A branch-limited leader still sees church-wide
  members/visitors lists. `scope=BRANCH` is surfaced in the UI but not enforced on
  those tables — that is a separate RLS task.
- **Portal (`/portal`)** is a separate OTP token surface and is untouched.
- **Token revocation on role change**: unchanged — permissions are baked into the
  access token, so a role change takes effect on the next login/refresh.
