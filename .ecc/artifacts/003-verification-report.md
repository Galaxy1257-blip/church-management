# 003 — Verification Report (Gate 4)

Task: role-aware staff web app — superuser/pastor see every module; department leaders and
members only see what their permissions allow. Date: 2026-10-26.
Plan: `.ecc/artifacts/001-implementation-plan.md` · Test evidence: `.ecc/artifacts/002-test-validation.md`.

Status: **verified for typecheck, unit/integration tests, lint, secret scan and the access
model**; **not** verified in a browser (see §4).

## 1. How verification was performed

| Layer | Method | Result |
|---|---|---|
| Types | `npm run typecheck` across 5 workspaces (tsc `--noEmit`) | exit 0 |
| Unit + integration | `npm run test` (shared 62, api 31 incl. 7 live-Postgres integration, worker 0 with `--passWithNoTests`) | all green |
| Style | `npx eslint .` | exit 0 |
| Secrets | `npm run check:secrets` | clean |
| Behaviour | `tsx .ecc/access-smoke.mts` — real role presets → `lib/access.ts` helpers | `ALL CHECKS PASSED` |
| Contract drift | same script asserts every permission string used by the web exists in shared `PERMISSIONS`, and every nav href has a `ROUTE_ACCESS` rule | PASS |
| Read-through review | `layout.tsx` (guard/redirect/usher gating), `dashboard/page.tsx` (permission-scoped fetch), `lib/access.ts` (single source of truth), `auth.controller.ts` (`@Authenticated` on `/auth/me`) | reviewed |

No command was assumed: every row above has a saved log under `.ecc/` (`gen.log`,
`tc-all.log`, `test.log`, `lint.log`, `secrets.log`, `access-smoke.log`).

## 2. Behaviour matrix (from the smoke run, per logged-in role)

| Role | Perms | Nav items (of 18) | Groups shown | `/finance` | `/settings` | Usher toggle |
|---|---|---|---|---|---|---|
| SUPER_ADMIN | `*` | 18 | People·Worship·Finance·Outreach·Org | yes | yes | offered |
| PASTOR | 32 | 18 | People·Worship·Finance·Outreach·Org | yes | yes | offered |
| FINANCE_ADMIN | 18 | 14 | People·Worship·Finance·Outreach·Org | yes | no | not offered |
| LEADER | 14 | 13 | People·Worship·Finance·Outreach·Org | no | no | offered |
| ELDER | 10 | 14 | People·Worship·Outreach·Org | no | no | not offered |
| SECRETARY | 11 | 12 | People·Worship·Outreach·Org | no | no | not offered |
| FOLLOWUP_TEAM | 9 | 13 | People·Worship·Outreach·Org | no | no | not offered |
| USHER | 7 | 10 | People·Worship·Outreach·Org | no | no | offered, **default on** |
| MEMBER | 0 | 0 | — (redirected to `/portal`) | no | no | — |

Usher toggle = `headcount:write` **and** `services:read` (layout `canUsherMode`); it defaults to
on only for users who write headcount but cannot write members (USHER). `LEADER`/`FINANCE_ADMIN`
see a *Finance group* holding only the items their permissions allow (e.g. `LEADER` → Pledges via
`giving:read`), while the `/finance` route itself needs `finance:read` — the route guard, not the
group label, decides route access.

## 3. What changed and why it is safe

- `apps/web/src/lib/access.ts` (new, ~190 lines) — one source of truth: `hasPermission`,
  `NAV_GROUPS`, `USHER_NAV`, `ROUTE_ACCESS`, longest-prefix `routeAccess`, `canAccessPath`,
  `visibleNavGroups`, `visibleUsherNav`, `SCOPE_LABEL`, `describeRoles`.
- `apps/web/src/app/(app)/layout.tsx` — imports the above, redirects a zero-permission session
  to `/portal`, filters nav by permission, renders a "Not available for your role" panel when
  `canAccessPath` fails, offers the usher toggle only when the user holds `headcount:write` +
  `services:read`, and shows `role · scope`.
- `apps/web/src/app/(app)/dashboard/page.tsx` — reads `/auth/me` first, then fetches each
  endpoint **only** if the permission is held (each call `.catch()`-guarded), and renders every
  card behind its own `has(...)` check; `wallet` is nullable.
- API remains the enforcement point (`@RequirePermissions` + `PermissionsGuard` + boot check);
  the web layer only hides what the API would 403.
- Supporting fixes found while verifying: `apps/worker/package.json` (`--passWithNoTests`),
  `eslint.config.js` (`.ecc/**` ignore + node globals for `scripts/*.{js,cjs}`),
  `apps/api/test/integration.spec.ts` (per-run webhook event ids/phone, role count 8→9),

## 4. Residual risks / gaps (not black-box claims)

1. **No browser verification.** `next build`, `next dev` and Playwright were not run. JSX balance
   and props are proven by `tsc`; the visual result (grouped topbar vs usher row, denied panel) is
   not. Recommend one manual pass: log in as USHER (should default to usher mode) and as LEADER
   (should see no Finance link) after `npm run dev:web`.
2. **Two permission sources.** The web mirrors permission strings by hand (`lib/access.ts` header
   comment explains why). `.ecc/access-smoke.mts` asserts they all exist in shared `PERMISSIONS`,
   but it is a manual check — a future string typo will not fail `tsc`. Adding the smoke script to
   CI (or importing `@chms/shared` in the web app) would close this.
3. **`ROUTE_ACCESS` covers 20 prefixes.** Any new `/module` page added later is *ungated* until a
   rule is added (`canAccessPath` returns true for unknown paths). The nav-href coverage assertion
   only protects links that come from `NAV_GROUPS`.
4. **`scope=BRANCH` is display-only** on members/visitors (`extras.sql` restricts `Transaction`
   only). A branch-limited leader still reads church-wide lists. Separate RLS task.
5. **`home` fallback** in the denied panel is `groups[0]?.items[0]?.href ?? '/dashboard'`; for a
   user whose only permission is `settings:write` the fallback `/dashboard` is itself denied, so
   the panel could re-render itself. Cosmetic dead-end, no data leak, not fixed here.
6. Integration tests now depend on a per-run clock suffix; two suites started inside the same
   millisecond could still collide (negligible, documented rather than engineered around).

## 5. Operator steps before this is live

1. `npm run db:migrate:deploy` (or run `migrations/1_pastor_role/migration.sql`) against every
   database — **additive only**, `ADD VALUE IF NOT EXISTS 'PASTOR'`, already applied locally to
   `chms` and `chms_test` (`.ecc/apply-migration.mjs` output: enum now ends `…,SECRETARY,PASTOR`).
2. `npm run build -w @chms/shared && npm run build -w @chms/db` before deploying api/worker —
   they consume `dist`, and a stale build hides `PASTOR` (this exact failure was hit in §1/3 of
   the test-validation artifact).
3. Re-seed or re-run `seedChurch` for existing churches so the PASTOR role row appears; the seed
   now also refreshes default presets (`packages/db/src/seed-church.ts`).
4. Assign the role to a person (no user-management UI yet) — one row pair:
   ```sql
   INSERT INTO "UserRole" ("userId","roleId")
   SELECT u.id, r.id FROM "User" u JOIN "Role" r
     ON r."churchId" = u."churchId" AND r.key = 'PASTOR'
   WHERE u."phoneE164" = '+233…';
   ```
5. Existing sessions keep their old token until refresh/logout (permissions are in the JWT).

## 6. Sign-off

- Gate 0 (pre-flight/journal): `.ecc/journal.jsonl`
- Gate 1 (plan, approved): `001-implementation-plan.md`
- Gate 3 (tests): `002-test-validation.md` — 5/5 gate commands green, 8 failures diagnosed & fixed
- Gate 4 (this report): evidence tables above, limits stated in §4

Verdict: **ready for a manual browser pass**, not for a claim of "fully verified UI".

  `apps/api/src/auth/auth.controller.ts` (unused import).

## 7. End-of-session re-run (after writing the artifacts)

| Command | Exit | Log | Note |
|---|---|---|---|
| `npx eslint .` | **0** | `.ecc/lint-final.txt` (empty) / `.ecc/lint-final.err` | PowerShell reported exit 1 only because Node prints `MODULE_TYPELESS_PACKAGE_JSON` on **stderr**, which PowerShell surfaces as a native-command error; run with `>file 2>file` and eslint's own code is 0, zero findings |
| `npm run typecheck` | **0** | `.ecc/tc-final.log` | 5 workspaces `tsc --noEmit` |
| `npm run test` | **0** | `.ecc/test-final.txt` | shared `9 files / 62 tests passed`, api `3 files / 31 tests passed`, worker `No test files found, exiting with code 0` |
| `npm run check:secrets` | **0** | `.ecc/secrets-final.log` | `check:secrets clean` |
| `npx tsx .ecc/access-smoke.mts` | **0** | `.ecc/access-smoke.log` | `ALL CHECKS PASSED`, per-role nav counts as in §2 |

That caveat matters for CI: a pipeline that treats PowerShell stderr as failure will report a false
"lint failed" on this repo until `eslint.config.js` is renamed to `.mjs` or the package gets
`"type": "module"`. Recorded here instead of silently ignored.

