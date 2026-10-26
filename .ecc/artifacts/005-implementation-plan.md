# 005 — Implementation Plan (Gate 1)

**Task (owner request, 26 Oct 2026):** *"implement the changes you recommended for the supposed
bloated features and fix issues you found when scanning the codebase"* → two tracks: (A) the
audit findings, (B) the nav/feature consolidation.

**Status:** `approved` — the owner asked for the implementation of the audit that precedes this
file, in the same session.

## Correction to the audit (verified before planning)

The audit said the Neon DSN might be on `origin` (public). Re-checked, and that was **wrong**:

| Check | Result |
|---|---|
| `git grep -l npg_ HEAD -- scripts/*` | nothing — HEAD is clean |
| `git merge-base --is-ancestor {e17e875,a74342a,6c74a45} origin/main` | exit 1 for all three → never pushed |
| working tree | 6 files still carry the DSN |

So: not a live public leak. Rotation is still correct (the password is on this disk and in 3
local-only commits), but the urgency claim in the audit was overstated. The scanner gap is real:
`check-secrets.mjs` cannot see a Postgres DSN with an embedded password, or Neon's `npg_` values, at all.

## Track A — audit fixes

| # | Finding | File | Change |
|---|---|---|---|
| A1 | scanner blind to DB DSNs + generic secrets | `scripts/check-secrets.mjs` | detect a Postgres/Redis/Mongo DSN **with an embedded password** (dev localhost and doc placeholders exempt), `npg_…` Neon passwords, and generic `SECRET`/`PASSWORD`/`TOKEN` assignments |
| A2 | 6 credential-bearing scratch scripts | `scripts/tmp-demo-*.js`, `check-neon.mjs`, `seed-neon.mjs`, `check-users.cjs` | delete; `.gitignore` the `tmp-*`/`*neon*`/`check-users` patterns so they cannot come back |
| A3 | `JWT_SECRET` dev default passes prod validation | `apps/api/src/env.ts` | `superRefine`: in production reject the 3 known dev defaults, require ≥32 chars |
| A4 | no auth rate limiting; OTP endpoint bills SMS | new `common/rate-limit.ts`, `auth.controller.ts` | in-memory token buckets (no new dependency) via `@RateLimit()` + `RateLimitGuard` |
| A5 | `OTP_MAX_ATTEMPTS` unreachable (lookup filtered on `codeHash`) | `auth.service.ts#verifyOtp` | look up newest open challenge **by phone**, compare hash, increment attempts on mismatch |
| A6 | `memberNo = count+1` races → P2002 in front of users | new `common/member-no.ts` | `pg_advisory_xact_lock(hashtext(church))` + `MAX(M…)+1`; used by create, import, signup |
| A7 | CORS `else` branch allows every origin + `*.vercel.app` | `main.ts` | deny by default, allowlist from `WEB_URL`, keep `*` opt-in |
| A8 | 500 handler returns `exception.message` | `http-exception.filter.ts` | generic body for 5xx, detail to the log |
| A9 | JSON body limit 100kb vs 400kb logo ceiling | `main.ts`, `churches.service.ts` | `useBodyParser('json', {limit:'1mb'})` (verified rawBody is preserved) + ceiling 300k |
| A10 | plain `!==` secret + `throw new Error` → 500 | `webhooks.service.ts`, `churches.service.ts` | `timingSafeEqualStr` helper; `BadRequestException` for validation |

## Track B — feature consolidation (5 areas + tabs, no route deleted)

| # | Change | File |
|---|---|---|
| B1 | `MODULE_KEYS`/`resolveModules` (people, worship, money, reach, org) | new `packages/shared/src/modules.ts` + `index.ts` |
| B2 | `/auth/me` returns `modules`; `saveProfile` accepts `modules` | `auth.service.ts`, `churches.service.ts` |
| B3 | `NAV_AREAS` (5 areas) replaces loose groups; `visibleNavGroups`, `canAccessPath`, `areaTabsForPath` become module-aware | `apps/web/src/lib/access.ts` |
| B4 | one `<AreaTabs />`, rendered in the layout keyed off the pathname (no per-page edits) | new `components/area-tabs.tsx`, `(app)/layout.tsx` |
| B5 | Modules tab in Settings — 5 checkboxes, disabled modules can always be re-enabled | `(app)/settings/page.tsx` |
| B6 | dashboard: 3 KPIs + 3 actions above the fold, module-gated cards | `(app)/dashboard/page.tsx` |
| B7 | `/auth/me` deduped (layout + dashboard were both calling it) | new `lib/session.ts` + both callers |
| B8 | `getApiBase()` wrote to localStorage on **every** request | `apps/web/src/lib/api.ts` |
| B9 | smoke test covers areas, tabs and module flags | `.ecc/access-smoke.mts` |

## Deliberately NOT done

- **Not rotating the Neon password** — needs the Neon console; operator action.
- **Not rewriting git history** — the DSN is not on `origin`; the operator decides.
- **No `@nestjs/throttler`** — new dependency for something 40 lines of code covers on a
  single instance; documented as the multi-instance upgrade path.
- **No `/dashboard/summary` endpoint** — a new API surface plus a web rewrite is a bigger change
  than the fan-out fix is worth this pass; the session dedupe removes the duplicate call and the
  fan-out is already permission-gated.
- **Branch-scope RLS on 7 tables (audit #9)** — needs a DB migration and a per-request
  `app.branch_ids` setting; tracked, not attempted blind.
- **No CSP/headers (audit #10)** — separate change; noted for the next pass.
- **Not touching** the uncommitted work in the tree from the previous session.

## Acceptance criteria

1. `npm run typecheck`, `npm run test`, `npx eslint .`, `npm run check:secrets` green.
2. `npx tsx .ecc/access-smoke.mts` → `ALL CHECKS PASSED`, including new area/module assertions.
3. `npm run check:secrets` now **fails** on a planted Postgres DSN that carries a password (negative test, deleted afterwards).
4. No route file deleted; every `ROUTE_ACCESS` prefix still resolvable.
5. Evidence recorded in `006-test-validation.md` / `007-verification-report.md`.
