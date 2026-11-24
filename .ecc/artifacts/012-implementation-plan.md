# 012 — Implementation plan: master switches per App-section group

**Status:** approved (owner chose "master switch per group, in addition to the
independent per-sub-section switches")
**Date:** 2026-11-15
**Task:** let a church turn a whole group of sub-sections off at once, while still
turning each sub-section off independently. Owner's example was "Organisation" →
departments / branches, but the model is general.

## Semantics (one rule)

A **group** = a master module key + a list of child (leaf) module keys. A child is
*effectively on* only when **its own switch AND its group's master switch** are on.

- Master **off** → every child in that group is hidden at once (nav, tabs, dashboard,
  API 403) regardless of the child's stored value.
- Master **on** → each child is governed by its own switch (departments off, branches on
  → only branches shows).
- Raw stored values are never mutated; `effectiveModules()` derives visibility. The
  Settings screen keeps showing the *stored* value of each child even when its master
  is off (so the office sees what is actually ticked).

## Groups

| master (key) | label | children |
|---|---|---|
| people | People | care, children, groups |
| worship | Services | roster, events |
| money | Offerings | special_offerings, expenses |
| reach | News & follow-up | followup, programs, sms, outreach |
| organization (new) | Organisation | departments, branches, audit |

`bible` stays standalone. New `organization` master defaults **on**, so a new church's
opt-in children (departments/branches/audit, all default off) behave exactly as before;
the master only matters when someone turns it off.

## Changes

| # | Change | File |
|---|---|---|
| M1 | add `organization` to MODULE_KEYS / MODULE_DEFAULTS (true) / MODULE_LABELS; add `MODULE_GROUPS` + `moduleGroupFor()` + `effectiveModules()` | packages/shared/src/modules.ts |
| M2 | `flagsFor()` returns **effective** flags (master gating) so `ModuleGuard` 403s a hidden child | apps/api/src/common/module-flags.ts |
| M3 | `/auth/me` `modules` returns **effective** flags (shell hides children when master off) | apps/api/src/auth/auth.service.ts |
| M4 | `module-coverage.spec.ts` requires a `@ForModule` only for non-master keys (masters are group toggles, no page of their own) | apps/api/src/common/module-coverage.spec.ts |
| M5 | mirror `organization` key/label + `MODULE_GROUPS` in the web switch table | apps/web/src/lib/access.ts |
| M6 | Settings → App sections renders each group: master toggle + indented children (children disabled while master off), preserving the "on for a new church" / "add when you run it" badges | apps/web/src/app/(app)/settings/page.tsx |
| M7 | platform console App sections card renders the same grouped master/child layout | apps/web/src/app/platform/churches/[id]/page.tsx |
| M8 | fix the example gap: gate the Households (Departments) card on the `departments` switch so "turn off only departments" really hides it | apps/web/src/app/(app)/org/page.tsx |
| M9 | update modules.test.ts (new default + effectiveModules cases); rebuild shared dist | packages/shared/src/modules.test.ts |

## Verification

- `npm run build -w @chms/shared` (rebuild dist for api/web)
- `npm run typecheck` (5 workspaces) → 0
- `npm run test -w @chms/shared` → new effectiveModules cases green
- `npm run test -w @chms/api` → module-coverage + guards still green
- `npx eslint .` → 0