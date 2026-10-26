# 009 — Verification report: chms-web deploy target

**Commit:** `90223d0` — `chore(deploy): add chms-web Render service (SSR)`
**Remote:** `origin/main` = `90223d0a5c28b884255a892da364f528369e983f` (matches `HEAD`)
**Session:** N · **Plan:** `artifacts/007` · **Validation:** `artifacts/008`

## 1. What was verified, and how

| # | Claim | Method (command) | Result |
|---|---|---|---|
| V1 | The blueprint is valid YAML and declares the service Render needs | `python -c "import yaml; yaml.safe_load(open('render.yaml'))"` + key assertions | 3 services: `chms-api`, **`chms-web`**, `chms-redis`; all chms-web keys present |
| V2 | Render's build command actually builds the app | `npm run build -w @chms/web` (`%TEMP%\web-build.log`) | `BUILD_EXIT=0`, 31 routes |
| V3 | Render's start command actually serves, on Render's `$PORT` | `$env:PORT=3999; npm run start -w @chms/web` (`%TEMP%\web-start.log`) | bound to **3999**, `Ready in 1129ms` |
| V4 | The health check path returns 200 unauthenticated | `GET http://localhost:3999/login` | `200` (also `/`, `/dashboard`, `/give/demo` → 200) |
| V5 | A missing `NEXT_PUBLIC_API_URL` cannot ship silently | `RENDER=true` build with the var unset (`%TEMP%\guard-neg2.log`) | `exit=1`, `Error: NEXT_PUBLIC_API_URL is required on Render…` at `next.config.mjs:12` |
| V6 | The guard's positive branch still builds | `RENDER=true NEXT_PUBLIC_API_URL=… node -e "import('./apps/web/next.config.mjs')"` | `config loaded ok; keys= reactStrictMode,outputFileTracingRoot` |
| V7 | The `WEB_URL` change is correct and regression-free | `npx vitest run src/platform/payment-provider.spec.ts`, then `npm test -w @chms/api` | 3/3 new cases; whole suite **53/53**, 6 files, exit 0 |
| V8 | Types are clean | `npm run typecheck -w @chms/web` | `TYPECHECK_EXIT=0` |
| V9 | No credential leaked into the commit | `npm run check:secrets`; `git --no-pager diff --cached --stat` | clean, exit 0; staged set = the 10 intended files, `scripts/tmp-demo-accounts.js` **not** staged |
| V10 | The work reached the remote | `git ls-remote origin refs/heads/main` vs `git rev-parse HEAD` | both `90223d0a5c28b884255a892da364f528369e983f` |

Design decision V11: static export was rejected because `next build` marks `/flyers/[slug]`,
`/give/[slug]` and `/services/[id]` as `ƒ (Dynamic)`. Export would require
`generateStaticParams` (every church slug at build time) and would 404 the public giving link.

## 2. Independent cross-checks (not just "the build said OK")

- Route table inspected line by line rather than trusting the exit code — that is what exposed
  the three dynamic routes and settled the SSR-vs-static question with evidence.
- The guard was tested in **both** directions (fails without the var, loads with it) so a typo in
  the condition could not pass unnoticed.
- `start` was run with `PORT=3999`, not 3000, so a leftover hardcoded port could not hide.
- A dynamic route (`/give/demo`) was requested under `next start` to confirm dynamic segments
  really do render in the production server, not only in `next dev`.

## 3. Residual risks (honest list)

| Risk | Severity | Note |
|---|---|---|
| `NEXT_PUBLIC_API_URL` must be set in the Render dashboard **before** the first sync | medium | The guard turns this into a failed build with a clear message, not a broken deploy |
| `WEB_URL` on the API must gain the web origin or the browser will be CORS-blocked | medium | Comma list allowed (`https://chms-web.onrender.com,http://localhost:3000`); links now use the first entry |
| `chms-web` will serve the **`HEAD`** UI, not Session M's uncommitted nav work | high (for the goal) | Session M's 30 files are still in the working tree; see §5 |
| Two free services share 750 instance-hours/month and both spin down after 15 min | low | Cold starts, no data loss |
| Blueprint drift if the service is renamed in the dashboard | low | `render.yaml` remains the source of truth |

## 4. Verification NOT performed (declared, not forgotten)

- No Render deploy was triggered from this machine; runtime behaviour on Render (build cache,
  spin-down, region latency) is unobserved.
- No browser pass over the role-gated UI (runbook Track B).
- No load test of the second service; no measurement of cold-start time.
- `NEXT_PUBLIC_API_URL`/`WEB_URL` values themselves are owner-supplied and were not exercised.

## 5. What the owner must do next

1. Render → Blueprint → sync: confirm `chms-web` appears.
2. Set `NEXT_PUBLIC_API_URL = https://<chms-api-host>/api/v1` on `chms-web`, then deploy.
3. Set `chms-api`'s `WEB_URL = https://<chms-web-host>,http://localhost:3000` and restart it.
4. Open `https://<chms-web-host>/login`, sign in, and run Track B of the Desktop runbook.
5. Commit + push Session M's working tree (excluding `scripts/tmp-demo-accounts.js`) so the
   deployed UI is the newest one — the deploy target is now ready to receive it.

## 6. Verdict

Gate 3 and Gate 4 pass for the deploy-wiring unit: the blueprint is valid, the exact Render
build and start commands work locally, the health path answers 200, the misconfiguration guard
fails loudly, tests and typecheck are green, no secret was staged, and the commit is on
`origin/main`. The reason this does **not** yet mean "the new UI is live" is recorded in §3/§5:
Session M's code is still uncommitted.
