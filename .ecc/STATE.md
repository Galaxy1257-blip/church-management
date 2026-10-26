# .ecc STATE — session continuity

**Read first in a new session.** Repo-level context lives in `../STATE.md` and
`../LOGS.md`; this file is the ECC gate journal.

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

1. Manual browser pass (`npm run dev:web`): log in as USHER (usher mode should default on) and as
   LEADER (no `/finance` link, denied panel if typed) — the only unverified layer.
2. Operator: `npm run db:migrate:deploy` on every database (additive `ADD VALUE IF NOT EXISTS
   'PASTOR'`; already applied locally to `chms`/`chms_test` via `.ecc/apply-migration.mjs`).
3. Operator: rebuild `@chms/shared` + `@chms/db` before deploying api/worker (they read `dist`;
   a stale build is what produced `TS2322 '"PASTOR"' is not assignable to 'RoleKey'`).
4. Operator: re-seed existing churches to create the PASTOR role row, then grant it (no user
   management UI yet — `INSERT INTO "UserRole"`).
5. Optional hardening: wire `.ecc/access-smoke.mts` into CI so web/shared permission drift fails
   a build instead of relying on a manual run.
6. Watch CI on the newest push (`.github/workflows/ci.yml`: lint → shared/db builds → typecheck →
   shared tests, then the integration job, which now applies `1_pastor_role` to a fresh Postgres).
7. Optional: add a `pre-commit` hook to enforce ground rule 8 mechanically (no hooks exist today,
   `core.hooksPath` unset) — deliberately not done, it would surprise contributors on this box.

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
