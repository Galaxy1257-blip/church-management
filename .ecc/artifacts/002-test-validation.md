# 002 — Test Validation (Gate 3)

Task: role-based visibility (PASTOR/superuser see all; leaders/members see only granted
modules). Plan: `.ecc/artifacts/001-implementation-plan.md`. Date: 2026-10-26.
Raw command logs live at the `.ecc/*.log` paths cited below.

## 1. Failure → fix trail (what actually happened)

| # | Command | Observed (before) | Root cause | Fix |
|---|---|---|---|---|
| 1 | `npm run typecheck -w @chms/web` | `access.ts(70,14) TS1005`, `(123,14)`, `(133,14)`, `(157,1)`, `(185,18)`, `(186,1)` | The chunked writes (editor 6000-char cap) landed `hint: string;` / `items: NavItem[]; }` **outside** `interface NavGroup`, leaving stray members mid-file | Reassembled `NavGroup` (`label`/`hint`/`items`) and deleted the trailing stray block (`.ecc/patch-access.mjs`) |
| 2 | `npm run typecheck -w @chms/web` | `dashboard/page.tsx(158,11) TS2657 JSX expressions must have one parent element` | The `reports:read` ternary wrapped **two sibling cards** (by-fund + trend) | Closed the gate after the by-fund card; opened a second `{has('reports:read') ? (` before the trend card |
| 3 | `npm run typecheck` (root) | `packages/db/src/seed-constants.ts(6,5) TS2322: '"PASTOR"' is not assignable to 'RoleKey'` | `@chms/db` resolves `@chms/shared` from **dist**; shared was not rebuilt after the enum change | `npm run build -w @chms/shared` (`.ecc/build-shared.log`) |
| 4 | `npm run test` | `guards.spec.ts:191 PARSE_ERROR Unexpected token` | A duplicated `it('rejects refresh-audience …')` block sat **after** the `describe('JwtAuthGuard')` close | Truncated at the duplicate marker (`.ecc/patch-spec.mjs`); describe now ends at line 178 |
| 5 | `npm run test` | 3 api failures: `expected 'duplicate' to be 'settled'`, `expected 'duplicate' to be 'amount_mismatch'`, opt-out `Unique constraint failed` | Test-isolation bugs, not product bugs: `processedWebhookEvent` is unique on `(provider, eventKey)` **globally** while the tests hardcoded `evt_dup_1`/`evt_mismatch_1`; `SmsLog` is unique on `idempotencyKey` while the test hardcoded phone `0245556677` → a second run against the same DB looks like a replay | Per-run ids `evt_dup_${Date.now()}` (+ `${event.id}_b`, `evt_mismatch_${Date.now()}`) and clock-derived phone `055${String(Date.now()).slice(-7)}` |
| 6 | `npm run test` | all 7 integration tests failed: `invalid input value for enum "RoleKey": "PASTOR"` | Rebuilt `@chms/db` dist now seeds PASTOR, but `chms_test` still had the old enum; `expect(roles).toBe(8)` was also stale | Applied `migrations/1_pastor_role/migration.sql` to **chms** and **chms_test** (`.ecc/apply-migration.mjs`), then `expect(roles).toBe(9)` |
| 7 | `npm run test` | `apps/worker`: `No test files found, exiting with code 1` → root run failed | Worker genuinely has no spec files; plain `vitest run` errors on that | `apps/worker/package.json`: `vitest run --passWithNoTests` |
| 8 | `npx eslint .` | 74 errors | (a) my one-shot `.ecc/*.mjs` scripts, (b) `auth.controller.ts` unused `RequirePermissions` import, (c) `scripts/*.js|cjs` helpers linted without Node globals, (d) pre-existing unused `n` in `scripts/tmp-demo-data.js` | (a) `.ecc/**` ignored, (b) import removed, (c) `scripts/**/*.{js,cjs}` block with node globals + `no-require-imports: off`, (d) `n` → `_n` |

## 2. Gate commands — expected vs actual

| Command | Expected | Actual | Evidence |
|---|---|---|---|
| `npx prisma generate --schema schema.prisma` | client generated, knows `PASTOR` | `✔ Generated Prisma Client (v6.19.3)` | `.ecc/gen.log` |
| `npm run typecheck` | exit 0, 5 workspaces | exit 0 (shared, db, api, worker, web clean) | `.ecc/tc-all.log` |
| `npm run test` | all suites green | shared **62/62**, api **31/31** (incl. 7 live-DB integration tests), worker `--passWithNoTests` exit 0 | `.ecc/test.log` |
| `npx eslint .` | exit 0 | exit 0, no findings (only Node's MODULE_TYPELESS warning) | `.ecc/lint.log` |
| `npm run check:secrets` | clean | `check:secrets clean — no API keys found in the tree.` | `.ecc/secrets.log` |
| `tsx .ecc/access-smoke.mts` (added check) | every assertion PASS | `ALL CHECKS PASSED` | `.ecc/access-smoke.log` |


## 3. Access-model smoke test (behaviour, not just compile)

`.ecc/access-smoke.mts` drives the real `ROLE_PERMISSIONS` presets through
`apps/web/src/lib/access.ts` under `tsx`:

- contract sync — every permission named in `NAV_GROUPS`/`ROUTE_ACCESS` exists in shared `PERMISSIONS` (PASS)
- coverage — every nav href has a `ROUTE_ACCESS` rule, so nav and guard cannot disagree (PASS)
- SUPER_ADMIN `*` → 18/18 nav items, every gated route open (PASS)
- PASTOR (32 perms) → 18/18 nav items, every gated route open (PASS)
- FINANCE_ADMIN → `/finance` open, `/settings` blocked (PASS)
- USHER → `/checkin` open, `/finance` + `/settings` blocked, usher-mode links present (PASS)
- LEADER → `/members` open, `/finance` + `/settings` blocked (PASS)
- MEMBER (0 perms) → no staff access, empty nav, every gated route blocked, chip reads "Member" (PASS)
- nested paths (`/members/abc-123`, `/finance/batches/42`) inherit the module rule; unknown path (`/portal`) stays ungated (PASS)
- multi-role chip: `FINANCE_ADMIN, LEADER` → "Finance admin · Leader" (PASS)

## 4. NOT covered (honest limits)

- **No browser/E2E run.** `next build` and Playwright were not executed; the shell changes are
  validated by typecheck + the access-model smoke test + code review, not by clicking through
  the two nav branches (usher vs grouped) in a real browser.
- **Integration tests hit a live local Postgres** (`chms_test`); the enum migration was applied by
  `.ecc/apply-migration.mjs`. CI must run `npm run db:migrate:deploy` against its own database.
- **Branch-level row filtering** is still only enforced on `Transaction` (`extras.sql`), so a
  `scope=BRANCH` leader sees church-wide member/visitor lists. Out of scope here.
- **Role assignment UI** does not exist (`users:*` endpoints are unused); granting PASTOR is SQL/seed.
- **Token revocation on role change** is unchanged — permissions are baked into the access token.
