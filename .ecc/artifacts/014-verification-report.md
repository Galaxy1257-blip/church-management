# 014 — Verification report: master switches per App-section group

Task (plan `012`, test evidence `013`): let a church switch a whole group of sub-sections
off at once while keeping independent per-sub-section switches. Owner's example was
"Organisation → departments / branches"; the model is general (People, Services,
Offerings, News & follow-up, Organisation).

## How each requirement was verified

| # | Requirement | Evidence | Gate |
|---|---|---|---|
| M1 | `organization` key/default/label + `MODULE_GROUPS`/`effectiveModules` in shared | `packages/shared/src/modules.ts`; shared tests 182 (5 new `effectiveModules` cases) | build+unit |
| M2 | API `ModuleGuard` 403s a child when its master is off | `effectiveModules(resolveModules(...))` in `module-flags.ts` `entryFor`; api tests 236 (module-coverage + guards) | unit |
| M3 | `/auth/me` returns the effective set so the shell hides children | `auth.service.ts me()` → `effectiveModules(resolveModules(settings))`; api typecheck clean | typecheck+unit |
| M4 | master keys need no `@ForModule` of their own | `module-coverage.spec.ts` now checks `COVERED_KEYS` (leaves only) | unit |
| M5 | web switch table mirrors the new key + groups | `apps/web/src/lib/access.ts`; web typecheck clean; eslint clean | typecheck+lint |
| M6 | Settings → App sections renders master + indented children | `settings/page.tsx`; typecheck+eslint clean | static |
| M7 | platform console renders the same group layout | `platform/churches/[id]/page.tsx`; typecheck+eslint clean | static |
| M8 | "turn off only Departments" truly hides the Departments card | `org/page.tsx` gates the Households card on `moduleEnabled(modules,'departments')`; web access tests 8/8 | static+unit |

## Acceptance behaviour (semantics)
- `organization:false` → `departments`/`branches`/`audit` all hidden at once (API 403 +
  nav hidden), even when individually on. Proven by `effectiveModules` tests.
- `organization:true` + `departments:false` + `branches:true` → only Branches shows.
  Proven by the "one child on, another off" test.
- Raw stored values are untouched; Settings shows the true ticked state even under an
  off master. Proven by the "without touching the stored value" test.
- No DB migration (flags live in the existing `settings.modules` Json column).

## Residual risk (NOT covered)
- No browser pass; the Settings/platform group UIs are validated by typecheck+eslint only.
- Behaviour change for a pre-existing church that had a child on while its new master is
  off (e.g. Events on but Services off): the child is now hidden until the master is on.
  This is the intended master-gating consequence the owner chose, but worth a release note.
- `organization` defaults **on**, so new churches and existing data keep their current
  opt-in children (departments/branches/audit off) exactly as before.