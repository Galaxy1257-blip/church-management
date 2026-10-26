# 010 — Test Validation (Gate 3), Session M

**Task:** `artifacts/005-implementation-plan.md` (track A = audit fixes, track B = nav/module consolidation).
**Date:** 26 Oct 2026. **Machine:** Windows 10, Node 24.21, npm workspaces monorepo.

> **Numbering note:** two work lines ran in parallel on this tree. `006`/`008` belong to the
> shared-module and deploy lines (`007`/`009`); this file was first written as `006` and renamed to
> `010` on commit so artifact numbers never repeat. It validates 005 only.

Every command below was run from `C:\Users\HP\Desktop\church`. Long-running commands were
started with `Start-Process cmd.exe /c "... > .ecc/<name>.log 2>&1"` and polled, because the
agent's foreground command limit is 30 s; the log files named here are the evidence.

## 1. Expected vs actual

| # | Command | Expected | Actual | Verdict | Log |
|---|---|---|---|---|---|
| 1 | `npm run build -w @chms/shared` | rebuild `dist` so api/web typecheck sees `modules.ts` | exit 0 | PASS | `.ecc/shared-build.log` |
| 2 | `npm run typecheck` (5 workspaces) | 0 errors | exit 0, no diagnostics in shared / db / api / worker / web | PASS | `.ecc/tc-final.log` |
| 3 | `npm run test -w @chms/shared` | all pass, +6 for `modules.test.ts` | `Test Files 10 passed (10)`, `Tests 68 passed (68)` (was 62) | PASS | `.ecc/shared-test.log` |
| 4 | `npm run test -w @chms/api` | all pass, +19 unit for `env.spec` + `rate-limit.spec`, **and** the live-DB integration file must run (root `.env` line 11 sets `TEST_DATABASE_URL` at `chms_test`) | `Test Files 6 passed (6)`, `Tests 55 passed (55)` = 46 unit (31 + 19 added + 3 `payment-provider.spec` from Session N) + 9 integration (7 pre-existing + 2 added in the close-out, §5) | PASS | `.ecc/g-api-test.log` |
| 5 | `npx eslint .` | 0 errors | exit 0, 0 problems | PASS | `.ecc/g-lint.log`, `.ecc/g-lint.exit` |
| 6 | `node scripts/check-secrets.mjs` | clean on the real tree | exit 0 — "check:secrets clean" | PASS | `.ecc/g-secrets.log`, `.ecc/secrets-final3.log` |
| 7 | negative control: plant a credentialed DSN, an `npg_` password, a cSMS token and a generic `SMS_PASSWORD = '…'` in `.ecc/negative-secret2.md`, re-run #6, delete it | exit 1 and **all four** patterns named | exit 1, four findings: `[cSMS token]`, `[DSN with password]`, `[Neon password]`, `[hardcoded secret]`; file deleted, #6 clean again | PASS | `.ecc/neg3.err` |
| 8 | `npx tsx .ecc/access-smoke.mts` | `ALL CHECKS PASSED`, incl. the new area/module assertions | `ALL CHECKS PASSED` | PASS | terminal output quoted in §3 |
| 9 | `npm run build -w @chms/web` | production build completes | see §4 — first run failed at trace collection, retry result there | see §4 | `.ecc/web-build.log`, `.ecc/web-build2.log` |

## 2. Failure → fix pairs (this session)

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `npx eslint .` → `2 problems (2 errors)`: `'process' is not defined` ×2 in `apps/web/next.config.mjs` | that file is ESM executed by node, but the flat config only granted node globals to `scripts/**` | added an `eslint.config.js` block: `files: ['**/next.config.mjs']`, `globals: { process: 'readonly' }` |
| 2 | Denied page said *"X needs a permission your role does not have"* even when the area was merely switched off in Settings → Modules | `canAccessPath` merges two reasons, the copy hard-coded one | `(app)/layout.tsx` now derives `areaOff` and shows "Area switched off … Settings → Modules", keeping the permission copy for the real 403 case |
| 3 | Dashboard "Latest service" card rendered even without `services:read` and with the worship module off — a back door into a hidden area, contradicting the comment above the cards | the other 8 cards were gated, this one was not | card wrapped in `has('services:read') && mod('worship')`, indentation normalised (`.ecc/gate-latest-service.mjs`, deleted after use) |
| 4 | First `gate-latest-service.mjs` run threw `unexpected card start: <div className="spread">` | off-by-one (a `spread` div sits between the card and the `<h2>`) and CRLF lines kept a trailing `\r` | `start = titleAt - 2`, split on `/\r?\n/`, rejoin with the detected EOL; re-ran → "replaced lines 148-165 with 20 gated lines (CRLF)" |
| 5 | `npm run typecheck` exceeded the 30 s foreground limit (no output, exit unknown) | tool timeout, not a type error | runner script `.ecc/run-gates.ps1` writes `*.exit` files; both reads came back 0 |
| 6 | `npm run build -w @chms/web` failed: `ENOENT … .next\server\app\_not-found\page.js.nft.json` | a second build was writing the same `.next` directory at the same time (the file existed milliseconds later); not a code defect | rebuilt with no concurrent writer — result in §4 |
| 7 | New `it()` blocks landed at the wrong line offset and vitest reported *"Calling the test function inside another test function is not allowed"* (7 tests, 1 failed) | the insert went before the finance test's closing `});` instead of after it | moved the closing brace above the new block; re-ran → `Test Files 1 passed (1)`, `Tests 9 passed (9)` |
| 8 | Negative secret control reported only 3 of 4 planted secrets — `SMS_PASSWORD = '…'` was **not** caught | the generic rule used `\b(?:SECRET|PASSWORD|…)`, and `\b` does not match after `_`, so every real-world `*_PASSWORD` / `*_SECRET_KEY` name was invisible to it | rule now allows a prefix: `[A-Za-z0-9_]*(?:SECRET|PASSWORD|…)`; `ignore` extended with `integration\|fixture\|stub`; planted file → 4 findings, real tree → still clean |
| 9 | While re-reading `churches.service.ts` for the verification report: the platform-signup key was compared with `!==` | non-constant-time compare on a secret (timing oracle), while `webhooks` already used the helper for the same job | replaced with `timingSafeEqualStr` (`common/crypto.ts`) + import; `tsc` 0, eslint 0, api suite still 55/55 |

## 3. Smoke test output (excerpt)

```
LEADER   perms=14 staff=true nav=13/18 groups=[People|Worship|Money|Reach|Organisation] usherLinks=4
MEMBER   perms= 0 staff=false nav=0/18 groups=[] usherLinks=0
PASS  every module key has an area
PASS  money area renders its 3 tabs
PASS  module off hides the area from the nav
PASS  module off closes its routes
PASS  module off still allows /settings
PASS  permission still wins over module
ALL CHECKS PASSED
```


## 4. Web production build

| Attempt | Command | Result |
|---|---|---|
| 1 | `npm run build -w @chms/web` | `✓ Compiled successfully in 6.1s`, `✓ Generating static pages (29/29)`, then **failed** during "Collecting build traces" with the ENOENT above (concurrent `.next` writer) |
| 2 | same, no concurrent writer | exit 0 — `✓ Compiled successfully in 5.9s`, `✓ Generating static pages (29/29)`, full route table printed (29 routes: 26 static `○`, 3 dynamic `ƒ` = `/flyers/[slug]`, `/give/[slug]`, `/services/[id]`) |

So the ENOENT was an environment collision, not a defect in the new code: identical sources built
cleanly on the retry. Evidence: `.ecc/web-build2.log`.

## 5. New tests added (and what they pin)

| File | Tests | Pins |
|---|---|---|
| `packages/shared/src/modules.test.ts` | 6 | absent key = enabled, explicit `false` = off, unknown keys dropped, `MODULE_KEYS` completeness |
| `apps/api/src/env.spec.ts` | 9 | `parseTtl` units + rejection; production refuses the three documented dev secrets and a <32-char `JWT_SECRET`; real secrets accepted |
| `apps/api/src/common/rate-limit.spec.ts` | 10 | fixed-window allow/deny + `retryAfterSec`, bucket independence, window expiry, guard passthrough, 429, per-phone bucketing, **every** bucket in an array enforced, `timingSafeEqualStr` (equal / same-length-different / length-mismatch / empty / undefined) |
| `apps/api/test/integration.spec.ts` | 2 (added in close-out) | **A5** OTP attempt cap: a live challenge + correct code signs in (positive control), then 5 wrong codes bump `attempts` 1→5 and the challenge is burnt — the *correct* code is refused afterwards; **A6** allocator: 5 concurrent `members.create()` in one tick produce 5 distinct `M\d{5}` numbers, and soft-deleting the highest never hands that number out again |

**Counts reconcile.** Session M proper added 25 tests: shared 68 − 62 = 6 (`modules.test.ts`),
api 50 − 31 = 19 (`env.spec` 9 + `rate-limit.spec` 10). The api file then grew twice more,
in different sessions: `payment-provider.spec.ts` +3 (Session N) and the close-out +2 integration
→ 31 + 19 + 3 + 2 = **55**, of which 9 are the live-Postgres integration cases.

**How strong are the two new integration tests?** The OTP test is deterministic against the old
bug: the pre-fix lookup filtered on `codeHash`, so a wrong code matched no row and `attempts`
stayed at 0 — the `expect(row.attempts).toBe(i)` loop cannot pass under that code. The
member-number half is split: the deleted-number assertion is deterministic (`count()+1` reuses
the freed number, `MAX+1` does not), while the 5-way concurrency case is probabilistic — it needs
the two transactions to interleave, which is why the deleted-number assertion carries the fix's
regression weight.

## 6. NOT covered (honest gaps)

1. **A5/A6 are now covered, but only via the failure modes named above.** The OTP test asserts the
   cap + burn; it does not exercise `requestOtp`'s SMS send, the resend cooldown, or expiry. The
   allocator test covers 5-way concurrency on one church; a 50-way burst would exhaust the Prisma
   pool (default 10) and is untested.
2. **No browser pass.** Everything web-side is verified by typecheck, lint, `next build` and the
   headless `access-smoke.mts` module test — nobody has clicked the new nav in a browser.
3. **The negative secret test is a manual step**, not a CI job: planted, caught, removed by hand.
   Nothing stops the pattern list from regressing (item 8 in §2 is exactly that happening).
4. **The integration suite needs a local Postgres** (`TEST_DATABASE_URL` in the root `.env` →
   `chms_test`). It ran here; a machine without that database silently skips all 9 cases and the
   suite still reports green — the skip is not surfaced as a failure.
5. `next build` was **not** run for a Render-like environment (`RENDER=true`, no
   `NEXT_PUBLIC_API_URL`), so the new fail-fast guard in `apps/web/next.config.mjs` is unexercised.
