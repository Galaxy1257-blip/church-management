# .ecc STATE — session continuity

**Read first in a new session.** Repo-level context lives in `../STATE.md` and
`../LOGS.md`; this file is the ECC gate journal.

## Session M — CLOSED (26 Oct 2026, `38f8f9a`)

**Task:** implement the Session L audit. Plan `artifacts/005-implementation-plan.md` (approved),
validation `artifacts/010-test-validation.md`, verification `artifacts/011-verification-report.md`.

**Shipped:** one commit `38f8f9a` (74 paths: 42 code/doc files + the gate logs the artifacts cite)
carrying track A (A1–A10) and track B (B1–B9). Pushed — `git ls-remote origin refs/heads/main` =
`38f8f9aa470…`, `git rev-list --count origin/main..HEAD` = 0. `chms-web` builds from this commit,
so the consolidated 5-area nav is what Render serves once it redeploys.

**Final gate run** (`.ecc/run-gates2.ps1` — one background script, one `*.exit` per gate, because
`typecheck`/`eslint` exceed the 30 s foreground limit):

| gate | exit | result |
|---|---|---|
| `npm run build -w @chms/shared` | 0 | `dist` rebuilt |
| `npm run test -w @chms/shared` | 0 | 10 files, **68 tests** |
| `npm run test -w @chms/api` | 0 | 6 files, **55 tests** (46 unit + 9 integration) |
| `npm run typecheck` | 0 | 5 workspaces |
| `npx eslint .` | 0 | 0 problems |
| `node scripts/check-secrets.mjs` | 0 | clean; negative control 4/4 patterns, then clean again |
| `npm run build -w @chms/web` | 0 | 29 routes (26 static, 3 dynamic) |
| `npx tsx .ecc/access-smoke.mts` | 0 | `ALL CHECKS PASSED` |

**Closing-out additions (beyond the first pass):**
1. `integration.spec.ts` 7 → 9 tests — the OTP attempt cap (A5) and the member-number allocator (A6)
   now have live-Postgres coverage; both gaps named in the first pass are closed by test.
2. `churches.service.ts` platform-key compare `!==` → `timingSafeEqualStr` (timing oracle on a secret).
3. `check-secrets.mjs`: `\b(?:SECRET|PASSWORD|…)` could never match `SMS_PASSWORD` (no `\b` after
   `_`), so the commonest real-world names were invisible → prefix allowed; planted control now 4/4.
4. Artifacts renumbered `006` → `010` plus a new `011` (two parallel work lines both claimed `006`).
5. **Correction to an earlier claim in this session:** `TEST_DATABASE_URL` *is* set in the root
   `.env` (line 11 → `chms_test`), so the integration file was never skipped — the earlier 50-test
   run already contained its 7 cases. The "unverified A5/A6" note was wrong, not the code.

**Known gaps (unchanged):** no browser pass; A7 (CORS) / A8 (error body) have no automated test; the
integration suite skips silently on a machine without `chms_test`; the secrets scan is a manual step;
the Render-like `next build` guard is unexercised; Neon rotation is operator work.

**Next:** operator — rotate the Neon password, set `NEXT_PUBLIC_API_URL` on `chms-web`. Optional
code follow-ups stay as listed in plan 005 "deliberately NOT done" (CSP/headers, branch-scope RLS,
`@nestjs/throttler` if the API ever runs multi-instance).

## Session N — the missing web deploy target, 26 Oct 2026 (previous)

**Task:** owner approved adding the frontend deploy target. Plan `artifacts/007`, validation
`artifacts/008`.

**Shipped (this unit only):** `render.yaml` gains `chms-web` (`type: web`, `runtime: node`,
`plan: free`, `region: oregon`, build `npm install && npm run build -w @chms/web`, start
`npm run start -w @chms/web`, `healthCheckPath: /login`, `NEXT_PUBLIC_API_URL` `sync: false`);
`apps/web/package.json` `start` → `next start` (honours `$PORT`); `apps/web/next.config.mjs`
fails the build on Render without `NEXT_PUBLIC_API_URL`; `payment-provider.ts` builds links from
the **first** `WEB_URL` entry (+3 vitest cases in `payment-provider.spec.ts`).

**Decision (evidence, not preference):** static export rejected — `next build` marks
`/flyers/[slug]`, `/give/[slug]`, `/services/[id]` as `ƒ (Dynamic)`; export needs
`generateStaticParams` and would 404 the public giving link. Node SSR chosen.

**Gate results:** YAML parses (3 services) · vitest 3/3 · API suite 53/53 · web typecheck 0 ·
`next build` 0 · `PORT=3999 next start` → `/login` `/` `/dashboard` `/give/demo` = 200 ·
guard negative test exit 1 · `check:secrets` clean.

**Carry-over (unchanged, blocking the UI from actually reaching prod):** Session M's 30-file
working tree is still uncommitted (`access.ts`, `(app)/layout.tsx`, `lib/session.ts`,
`components/`, settings, dashboard, API audit fixes). `scripts/tmp-demo-accounts.js` still holds
the Neon DSN and must be excluded when that lands. Next session: commit + push Session M, then
run the dashboard steps from `artifacts/007` §5.

## Session M — audit fixes + nav consolidation, 26 Oct 2026

**Task:** implement Session L's audit. Plan `artifacts/005-implementation-plan.md` (approved on request).

**Shipped code (all gates green, not yet committed as of this line):**

- `packages/shared/src/modules.ts` (+ tests): `MODULE_KEYS` = people · worship · money · reach · org,
  `resolveModules(settings)` (absent key = enabled), `isModuleKey`.
- API: `common/rate-limit.ts` (`@RateLimit` + `RateLimitGuard`, in-memory buckets, several buckets per
  route), `common/member-no.ts` (advisory-lock allocator), `common/crypto.ts` (`timingSafeEqualStr`).
  `env.ts` now refuses the documented dev secrets in production. `auth.service` fixes the OTP attempt
  counter (lookup by phone, constant-time compare, burn after 5) and returns `modules` from `/auth/me`.
  `main.ts` CORS allowlist + `useBodyParser('json', {limit:'1mb'})` (rawBody preserved — verified in
  `@nestjs/platform-express`) + `trust proxy` in production. `http-exception.filter` no longer echoes
  5xx messages. `churches.service` accepts `modules` and throws `BadRequestException` for bad input.
- Web: `lib/access.ts` is now `NAV_AREAS` (5 areas, 18 items unchanged) with module-aware
  `visibleNavGroups` / `canAccessPath` / `visibleAreaTabs`; `components/area-tabs.tsx` renders the tab
  strip once from `(app)/layout.tsx`; `lib/session.ts` caches `/auth/me`; Settings has a **Modules** tab;
  dashboard is 3 KPIs + a "Today" action card with module-gated detail cards.
- Scripts: `check-secrets.mjs` now detects credentialed DSNs + `npg_` + generic secrets (negative test in
  `.ecc/neg.log`); the three Neon scratch scripts are deleted; the three demo seeders read
  `process.env.DATABASE_URL` and refuse to run without it.

**Correction to Session L's audit (important):** the Neon credential was **never pushed** —
`git grep -l npg_ HEAD` is empty and `git merge-base --is-ancestor` returns 1 for all three commits that
contain it. It was a working-tree + local-commit exposure only. Rotation is still recommended; the panic
framing in the previous audit was wrong.



## Pre-flight (Gate 0) — 2026-10-26

- Working dir: `C:\Users\HP\Desktop\church` (npm workspaces monorepo).
- Last repo journal entry: LOGS.md Addendum 6 (22 Oct) — create-account flow,
  unique church slug, sign-in branding.
- Existing uncommitted changes (not ours): `apps/api/src/auth/*`,
  `apps/api/src/churches/churches.service.ts`, `apps/api/src/public/public.controller.ts`,
  `apps/web/src/app/(app)/services/[id]/page.tsx`, `globals.css`, `extras.sql`,
  `LOGS.md`, `scripts/tmp-demo-accounts.js` (modified/untracked). We will not revert them.
- Stack: NestJS 11 api, Next 15 web, Prisma 6 + Postgres 16, shared `@chms/shared`,
  default-deny `PermissionsGuard` + `BootCheckService`.
- Gate 0 result: proceed. Task = role-based visibility (superuser/pastor see all;
  lower leaders/members see only granted modules).

## Current task

**Git discipline (owner request, 26 Oct):** "add to blueprint to update git everytime" — encoded as
`BUILD_ORDER.md` ground rule **8**, `STATE.md` §2 rule **9** + §10 handoff step **6**.
Plan: `artifacts/004-implementation-plan.md`. Everything from the RBAC task below is **shipped** to
`origin/main` (`1453b69`).

### RBAC task (shipped 26 Oct, closed)
**Status 2026-10-26 (end of session): implemented, typechecked, tested, linted, secret-scanned
and behaviour-smoke-tested. Not yet seen in a browser.** Gates:
`artifacts/001-implementation-plan.md` (approved) → `artifacts/002-test-validation.md` →
`artifacts/003-verification-report.md`.

### What is in the tree now

- `packages/shared/src/enums.ts` + `schema.prisma` + `migrations/1_pastor_role/migration.sql`:
  `PASTOR` is a role (9 total). `packages/shared/src/permissions.ts`: PASTOR preset = all 32
  permissions, `ROLE_TIERS`, `DataScope`, `resolveDataScope()`, `isChurchWide()`.
- `apps/api`: `@Authenticated()` decorator (`/auth/me` now usable by MEMBER), `scope` claim +
  derived fallback in `common/guards.ts`, boot-check accepts the new decorator.
- `apps/web/src/lib/access.ts` (new): `hasPermission`, `NAV_GROUPS` (5 groups / 18 items),
  `USHER_NAV` (4), `ROUTE_ACCESS` (20 prefixes, longest-prefix match), `canAccessPath`,
  `visibleNavGroups`, `visibleUsherNav`, `SCOPE_LABEL`, `describeRoles`.
- `(app)/layout.tsx`: permission-filtered grouped nav, MEMBER → `/portal`,
  "Not available for your role" panel on a denied route, usher toggle only with
  `headcount:write` + `services:read` (default on for usher-only users), `role · scope` chip.
- `dashboard/page.tsx`: reads `/auth/me` first, then fetches only permitted endpoints (each
  `.catch()` → empty), renders each card behind `has(...)`; wallet nullable.

### Gate evidence (all green)

`npx prisma generate` · `npm run typecheck` · `npm run test` (shared 62, api 31 incl. 7 live-DB
integration, worker 0 `--passWithNoTests`) · `npx eslint .` · `npm run check:secrets` ·
`npx tsx .ecc/access-smoke.mts` → `ALL CHECKS PASSED`. Logs: `.ecc/{gen,tc-all,test,lint,secrets,access-smoke}.log`.

## Next step

1. **Browser pass** (`npm run dev:web` + `npm run dev:api`): the only unverified layer.
   - Log in as SUPER_ADMIN → top bar shows Home + 5 areas + Settings; `/finance` shows the Money tabs.
   - Settings → Modules → untick **Money** → save → the page reloads, Money is gone from the nav and
     `/finance` shows "Not available for your role"; Settings is still reachable; tick it back on.
   - USHER: usher mode still defaults on and shows no tab strip.
   - Upload a 150 kB PNG logo in Settings → Church: it must save (this was broken).
   - Click login 9× with a wrong password: the 9th should return 429.
2. **Operator — rotate the Neon password** (Neon console → reset). Nothing on `origin` needs rewriting;
   optional: `git update-ref -d` the `refs/cline/checkpoints/*` refs that still contain it locally.
3. **Operator — set production secrets** before the next deploy, or the API will refuse to boot by design:
   `JWT_SECRET` (≥ 32 random chars), `SMS_WEBHOOK_SECRET`, `PLATFORM_SIGNUP_KEY`. See `.env.example`.
4. Operator: `npm run db:migrate:deploy` on every database (`1_pastor_role`), and rebuild `@chms/shared` +
   `@chms/db` before deploying api/worker.
5. Optional hardening, in the order I would do it: (a) branch-scope RLS on the seven tables that only
   filter by `churchId` (`extras.sql` has the TODO), (b) CSP + security headers on the Next app, (c) a
   `/dashboard/summary` endpoint to replace the 9-call fan-out, (d) wire `.ecc/access-smoke.mts` into CI,
   (e) user-management UI (still the biggest onboarding blocker: roles are still granted by SQL).


## Decisions worth keeping

- Web **still does not import `@chms/shared`** (see `lib/shared-constants.ts:1`); the permission
  strings are duplicated on purpose, and the smoke test is the guard against drift.
- Web gating is cosmetic only — the API (`RequirePermissions` + `PermissionsGuard` + boot check)
  is the security boundary.
- `scope=BRANCH` is displayed, not enforced, outside `Transaction` (`extras.sql`).
- Test DB needs the enum before integration tests pass; that is why `.ecc/apply-migration.mjs`
  exists (Docker/psql were unavailable in this environment).
- **Git is part of "done"** (owner rule, 26 Oct): blueprint ground rule 8 / `STATE.md` §2 rule 9.
  Commits are made per unit of work with explicit paths, never `git add -A`, because this tree
  permanently carries untracked 117 MB assets and credential-bearing scratch scripts.

## Shipped (26 Oct)

`main` → pushed to `origin` (`github.com/Galaxy1257-blip/church-management`), 5 commits
(remote `main` == local HEAD `1453b69`, `git diff origin/main HEAD` empty):

- `3c9b4d0` feat(rbac): PASTOR role, tiers + data scope, permission-gated staff app (21 files)
- `664e746` feat(web): type headcount numbers directly on the service detail page
- `a43903f` fix(church): normalize + enforce a unique church id, branding on public lookup
- `1defc0f` chore(ecc): gate artifacts, access smoke test, session journal
- `1453b69` chore(ecc): journal the push, flag the uncommitted Neon credential

## ⚠️ Deliberately NOT committed — leaked credential in the working tree

`scripts/tmp-demo-accounts.js` is **tracked**, and its uncommitted hunk replaces the localhost DSN with a
**Neon production DSN containing the `neondb_owner` password** (`npg_***`, redacted here). That hunk was
excluded from the push. `scripts/check-neon.mjs`, `scripts/seed-neon.mjs` and `scripts/check-users.cjs`
are **untracked** and carry the same DSN; they were never added. Also untracked and left alone:
`church-asset-kit/` (117 MB of images), `church-asset-pipeline/`, `CHURCH_UI_BRAINSTORM_GHANA.md`,
`UI_IDEAS_GHANA.md`, `scripts/*.html`.

**Leak radius (checked, not assumed):** `git grep npg_ HEAD` → nothing; the only remote ref is
`refs/remotes/origin/main` and the credential is not an ancestor of it. The DSN *is* present in the IDE's
local snapshot refs `refs/cline/checkpoints/*` ("untracked files on cline checkpoint" commits) — local
disk only, never pushed; prune individually with `git update-ref -d <ref>` if wanted.

Next for the owner: **rotate that Neon password**, rewrite those scripts to read `process.env.DATABASE_URL`
(the repo already ignores `.env`), and only then decide whether the asset kits belong in the repo or in
object storage / Git LFS.

**RESOLVED in Session M (26 Oct):** the three Neon scratch scripts are deleted, the three demo seeders now
read `process.env.DATABASE_URL` and refuse to run without it, `.gitignore` blocks new `scripts/tmp-demo-*` /
`*neon*` / `check-users.cjs` files, and `check-secrets.mjs` finally detects credentialed DSNs (it could not
see this one). Rotation is still the owner's action; **history does not need rewriting** — re-verified:
`git grep -l npg_ HEAD` is empty and none of the three commits carrying it is an ancestor of `origin/main`.
