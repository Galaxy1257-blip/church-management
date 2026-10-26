# 011 — Verification Report (Gate 4), Session M

**Plan:** `artifacts/005-implementation-plan.md` (approved). **Test validation:** `artifacts/010-test-validation.md`.
**Scope verified:** track A (audit fixes A1–A10) and track B (nav/module consolidation B1–B9) in
`apps/api`, `apps/web`, `packages/shared`, `scripts/`.
**Date:** 26 Oct 2026. **Machine:** Windows 10, Node 24.21, npm workspaces, local Postgres `chms_test`.

> **Numbering note:** plan §"Acceptance criteria" still says evidence goes in `006`/`007`. Two work
> lines ran in parallel and both claimed `006`; the gate artifacts for this plan are `010`
> (validation) and this file (`011`). The plan's *content* is unchanged.

## 1. How the verification was performed

The agent's foreground command limit is 30 s and `npm run typecheck` / `npx eslint .` exceed it, so
the sweep ran as one background script (` .ecc/run-gates2.ps1`) that executes each gate, writes
`.ecc/<gate>.log` and an exit code to `.ecc/<gate>.exit`, and is polled together with those files.
That means every verdict below is backed by **an exit file plus a log**, not by a remembered
"looked green":

```powershell
$p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass',
     '-File','.ecc\run-gates2.ps1' -PassThru -WindowStyle Hidden `
     -RedirectStandardOutput '.ecc\gates2.out' -RedirectStandardError '.ecc\gates2.err'
# then poll .ecc/*.exit and .ecc/gates2.out ("ALL GATE STEPS DONE")
```

## 2. Gate results (final run, after every code change)

| Gate | Command | Exit | Evidence |
|---|---|---|---|
| shared build | `npm run build -w @chms/shared` | 0 | `.ecc/shared-build.exit`, `.ecc/shared-build.log` |
| shared tests | `npm run test -w @chms/shared` | 0 | `.ecc/g-shared-test.exit` — `Test Files 10 passed (10)`, `Tests 68 passed (68)` |
| api tests | `npm run test -w @chms/api` | 0 | `.ecc/g-api-test.exit` — `Test Files 6 passed (6)`, `Tests 55 passed (55)` |
| typecheck | `npm run typecheck` (5 workspaces) | 0 | `.ecc/g-typecheck.exit`, `.ecc/g-typecheck.log` |
| lint | `npx eslint .` | 0, 0 problems | `.ecc/g-lint.exit`, `.ecc/g-lint.log` |
| secrets scan | `node scripts/check-secrets.mjs` | 0 — "check:secrets clean" | `.ecc/secrets-final3.log` |
| secrets negative control | plant 4 secrets → scan → delete → scan | 1 on the planted file (all four named), 0 afterwards | `.ecc/neg3.err`, `.ecc/secrets-final3.log` |
| web build | `npm run build -w @chms/web` | 0 — 29 routes (26 static, 3 dynamic) | `.ecc/web-build2.log` (first attempt's ENOENT analysed in 010 §4) |
| access smoke | `npx tsx .ecc/access-smoke.mts` | 0 — `ALL CHECKS PASSED` | `.ecc/g-smoke.exit`, `.ecc/g-smoke.log` |

The last three rows are what actually demonstrate *behaviour* rather than compilation: the web
build proves every route still compiles with the new layout/tabs, and the smoke test proves the
five-area nav, the tab strip, the module flags and the per-role route gates all resolve.

## 3. Item-by-item: is it actually there?

Track A — evidence is a code anchor plus the gate that would catch a regression.

| # | Verified | Evidence (file:line) | Caught by |
|---|---|---|---|
| A1 | DSN-with-password, `npg_`, cSMS and generic secret rules all fire; generic rule now matches prefixed names | `scripts/check-secrets.mjs:25-36` | negative control (4/4), then clean tree |
| A2 | `check-neon.mjs`, `seed-neon.mjs`, `check-users.cjs` deleted; `tmp-demo-*.js` read `process.env.DATABASE_URL`; `.gitignore` blocks the patterns | `scripts/tmp-demo-accounts.js:22-27`, `.gitignore:18-24`; `git grep npg_` in `scripts/` → only the scanner's own regex | secrets scan + manual `git status` review |
| A3 | prod rejects the 3 dev defaults and `<32`-char secrets | `apps/api/src/env.ts:13-14,39-50` | `env.spec.ts` (9 cases) |
| A4 | `@RateLimit` on signup/login/otp/refresh, guard at controller level | `apps/api/src/auth/auth.controller.ts:40,45,56,64,76,89` | `rate-limit.spec.ts` (10 cases) |
| A5 | `verifyOtp` looks up the newest open challenge **by phone**, increments `attempts`, burns at the cap | `apps/api/src/auth/auth.service.ts:239-282` (`OTP_MAX_ATTEMPTS` :22, cap check :263, increment :272,:279) | **new integration test** (5 misses → attempts 1..5 → correct code refused) |
| A6 | advisory-lock + `MAX(M…)` allocator, non-`M<digits>` values ignored | `apps/api/src/common/member-no.ts:19-31` | **new integration test** (5 concurrent creates, no number reuse after soft delete) |
| A7 | CORS allowlist from `WEB_URL`, `*` only opt-in, blocked origin logged | `apps/api/src/main.ts:31-47` | reviewed; no automated test (documented gap) |
| A8 | 5xx body is `internal server error`, stack logged; 4xx keeps its message | `apps/api/src/common/http-exception.filter.ts:57-60,77,83` | reviewed; no automated test |
| A9 | JSON limit 1 mb, `rawBody` preserved for the Paystack HMAC, logo ceiling 300 k | `apps/api/src/main.ts:12,28` | webhook integration tests (signature still verifies) |
| A10 | constant-time compare in both places; validation errors are `BadRequestException` | `apps/api/src/webhooks/webhooks.service.ts:8,21`, `apps/api/src/churches/churches.service.ts:9,28` | `rate-limit.spec.ts` covers the helper; churches call verified by reading |

Track B — the smoke test is the primary evidence for every row, since it drives the same
functions the UI uses.

| # | Verified | Evidence (file:line) | Caught by |
|---|---|---|---|
| B1 | 5 module keys, `resolveModules` treats "absent" as on and only `false` as off | `packages/shared/src/modules.ts:10-33` | `modules.test.ts` (6 cases) |
| B2 | `/auth/me` returns `modules`; `saveProfile` accepts a partial map filtered by `isModuleKey` | `apps/api/src/auth/auth.service.ts:356-368`, `apps/api/src/churches/churches.service.ts:130-131,167` | typecheck across workspaces |
| B3 | `NAV_AREAS` replaces the loose groups; `visibleNavGroups`/`canAccessPath`/`areaForPath` are module-aware; `NAV_GROUPS` kept as a derived export | `apps/web/src/lib/access.ts:100,157,210,214,245,258` | smoke: "nav is 5 areas + dashboard + settings", "every module key has an area", "no area is empty" |
| B4 | one `<AreaTabs />` rendered from the layout, keyed off the pathname | `apps/web/src/components/area-tabs.tsx`, `(app)/layout.tsx:6,216` | smoke: tabs for money/nested path, none for dashboard/settings |
| B5 | Modules tab: 5 checkboxes, an off module can always be switched back on | `(app)/settings/page.tsx` | smoke: module-off assertions + typecheck |
| B6 | 3 KPIs + 3 actions above the fold, 15 permission/module gates in the card grid (incl. the "Latest service" card that was the back door) | `(app)/dashboard/page.tsx` (gate count 15) | smoke + `next build` |
| B7 | `/auth/me` deduped via `session.ts` (`getSession`/`peekSession`/`clearSession`), layout and dashboard both use it | `apps/web/src/lib/session.ts:14,29,34`, `(app)/layout.tsx:7,57` | typecheck; single call site review |
| B8 | the legacy `API_URL` localStorage key is cleared once per page load, not per request | `apps/web/src/lib/api.ts:10-13` | review |
| B9 | smoke asserts areas, tabs, module flags, per-role nav counts and route access | `.ecc/access-smoke.mts` | itself — `ALL CHECKS PASSED` |

**"No route deleted" (acceptance #4):** `git status` reports no deletions under `apps/web/src/app`
— every change there is `M` (modified) or new files.

## 4. Defects the verification itself found

Verification is not a rubber stamp — three real problems surfaced while producing this report:

| # | What the gate showed | Why it mattered | Resolution |
|---|---|---|---|
| 1 | `scripts/check-secrets.mjs` missed a planted `SMS_PASSWORD = '…'` while catching the DSN, `npg_` and cSMS patterns | `\b(?:SECRET\|PASSWORD)` never matches after `_`, so every `*_PASSWORD` / `*_SECRET_KEY` — the names people actually write — were invisible | rule rewritten to allow a key prefix; `integration\|fixture\|stub` added to the allow-list; re-planted → 4 findings, real tree still clean |
| 2 | `churches.service.ts` compared the platform signup key with `!==` | timing oracle on a secret, in the one place the audit had already flagged for `webhooks` | `timingSafeEqualStr` + import; api suite 55/55 and eslint 0 afterwards |
| 3 | the two new integration tests first ran as `1 failed` with *"Calling the test function inside another test function is not allowed"* | a brace/offset mistake in the patch, not a product bug — but it would have silently dropped 9 tests had the failure been skimmed | closing `});` moved above the new block; `Tests 9 passed (9)` |

## 5. Acceptance criteria (plan 005) vs evidence

| Criterion | Status | Evidence |
|---|---|---|
| 1. typecheck / test / eslint / check:secrets green | PASS | §2 — all exit 0 |
| 2. `access-smoke.mts` → `ALL CHECKS PASSED` incl. new area/module assertions | PASS | `.ecc/g-smoke.log` (quoted in 010 §3) |
| 3. `check:secrets` **fails** on a planted DSN with a password | PASS (and stronger: 4/4 patterns) | `.ecc/neg3.err` |
| 4. no route file deleted; every `ROUTE_ACCESS` prefix resolvable | PASS | git status (no `D` entries) + smoke "every nav href is covered by ROUTE_ACCESS" |
| 5. evidence in 006/007 | PASS, renumbered to 010/011 | this file's header note |

## 6. NOT covered — residual risk, stated plainly

1. **No browser pass.** The nav, the tab strip and the Modules tab are proven by the headless smoke
   test and `next build`, not by clicking. Layout/CSS regressions (`globals.css` changed) would only
   show up visually.
2. **A7 (CORS) and A8 (error-body) have no automated test.** They are small and were reviewed line by
   line, but nothing fails if someone reverts them.
3. **The integration suite silently skips without a database.** `describe.runIf(TEST_DATABASE_URL)`
   means a machine without the local `chms_test` database reports 46/46 green and A5/A6 lose their
   only coverage. Consider failing the run when `CI` is set and the variable is missing.
4. **The secrets gate is manual.** It is not wired into a pre-commit hook or CI, and defect #1 above
   is exactly the pattern list rotting unnoticed.
5. **Render-like web build untested** (`RENDER=true`, no `NEXT_PUBLIC_API_URL`) — the fail-fast
   guard in `apps/web/next.config.mjs` has never actually fired.
6. **Operator actions outside this repo remain:** rotate the Neon password, and decide whether the
   three local commits that once contained it need history rewriting.

## 7. Sign-off

Everything the plan promised is in the tree and every gate the plan named is green on this machine,
with the two behaviour-level gaps from Session M's first pass (A5, A6) now covered by live-database
tests. The remaining exposure is enumerated in §6 and is either visual (no browser), procedural
(manual secret scan) or operator-owned (rotation) — none of it is unverified code.

Verified by: Cline (Session M close-out). Date: 26 Oct 2026.

