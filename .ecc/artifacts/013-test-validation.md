# 013 — Test validation: master switches per App-section group

Plan: `.ecc/artifacts/012-implementation-plan.md` (approved). Date: 2026-11-15.

## Commands run (evidence logs in `.ecc/*`)

| # | Command | Expected | Actual | Verdict | Log |
|---|---|---|---|---|---|
| 1 | `npm run build -w @chms/shared` | tsc emits dist, 0 errors | exit 0, no diagnostics | PASS | — |
| 2 | `npm run test -w @chms/shared` | all pass, +5 `effectiveModules` cases | `Test Files 19 passed (19)`, `Tests 182 passed (182)` | PASS | — |
| 3 | `npm run test -w @chms/api` (via node spawn to read the true exit past the Nest stderr noise) | all pass; module-coverage honours master exemption | `Test Files 36 passed (36)`, `Tests 236 passed (236)`, EXIT=0 | PASS | `.ecc/api-test-012.log` |
| 4 | `npm run typecheck -w @chms/api` | 0 errors | tsc `--noEmit` clean | PASS | `.ecc/tc-api-012.log/.err` (err empty) |
| 5 | `npm run typecheck -w @chms/web` | 0 errors | tsc `--noEmit` clean | PASS | `.ecc/tc-web-012.log/.err` (err empty) |
| 6 | `npm run test -w @chms/web -- src/lib/access.test.ts` | 8/8 | `Tests 8 passed (8)`, EXIT=0 | PASS | — |
| 7 | `npx eslint <9 changed files>` | 0 problems | EXIT=0, no output | PASS | — |

## Failure → fix pairs

- **Web typecheck, first run:** `access.test.ts(8,91) TS2741 organization missing in ModuleFlags`. This was a
  stale-tsserver state; the file already carried `organization: true` and a clean re-run passed with no
  diagnostics. No code change was needed.
- **PowerShell stderr-as-error artifact:** the api suite logs a known `[Giving] amount mismatch expected 5000 got 5001`
  mock-gateway line on stderr, and PowerShell reports exit 1 for it even when vitest passes (the documented
  repo-wide artifact — same class as the git-push note in `.ecc/STATE.md`). Mitigated by spawning vitest from
  node and reading `status` + filtered stdout.

## NOT covered
- No browser pass (no live dev server started; static + unit gates only).
- No DB migration needed (keys live in the existing `settings.modules` Json column).
- No test exercises the Settings DOM rendering; the group layout is validated by typecheck + eslint only.