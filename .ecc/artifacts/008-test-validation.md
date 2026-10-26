# 008 — Test validation: Render web deploy wiring (artifacts/007)

**Date:** 26 Oct 2026 · **Unit:** commit "chore(deploy): add the chms-web Render service"
**Every command below was run in this session; logs are referenced by path.**

## T1. Blueprint parses and contains the new service

```
python -c "import yaml; yaml.safe_load(open('render.yaml'))"   # via inline script
```

| Expected | Actual |
|---|---|
| 3 services: `web/chms-api/node/free`, `web/chms-web/node/free`, `redis/chms-redis/free` | `('web','chms-api','node','free')`, `('web','chms-web','node','free')`, `('redis','chms-redis',None,'free')` — PASS |
| `chms-web` keys present | `buildCommand, envVars, healthCheckPath, name, plan, region, rootDir, runtime, startCommand, type` — PASS |
| build = `npm install && npm run build -w @chms/web` | exact match — PASS |
| start = `npm run start -w @chms/web` | exact match — PASS |
| health = `/login` | exact match — PASS |
| `NEXT_PUBLIC_API_URL` declared `sync: false` | env list `[('NODE_ENV','production'), ('NEXT_TELEMETRY_DISABLED','1'), ('NEXT_PUBLIC_API_URL', False)]` (False = `sync: false`) — PASS |

## T2. Unit specs for the WEB_URL change

```
cd apps/api && npx vitest run src/platform/payment-provider.spec.ts
```

| Expected | Actual |
|---|---|
| 3 tests pass | `Test Files 1 passed (1) · Tests 3 passed (3) · 1.11s` — PASS |
| case 1 single origin | `https://chms-web.onrender.com/give/mock-pay?ref=chms_1` — PASS |
| case 2 comma list → first origin, no comma in URL | PASS |
| case 3 trailing slash stripped + `ref` URL-encoded (`chms%20a%2Fb`) | PASS |

## T3. Full API regression suite

```
npm test -w @chms/api        # log: %TEMP%\api-test.log
```

| Expected | Actual |
|---|---|
| exit 0 | `API_TEST_EXIT=0` — PASS |
| no regressions | `Test Files 6 passed (6) · Tests 53 passed (53) · 5.96s` — PASS |

(The `ERROR [Giving] giving amount mismatch` line in the log is an asserted negative case, not a failure.)

## T4. Web typecheck + production build (proves the Render build command)

```
npm run typecheck -w @chms/web    # log: %TEMP%\web-build.log
npm run build -w @chms/web
```

| Expected | Actual |
|---|---|
| typecheck exit 0 | `TYPECHECK_EXIT=0` — PASS |
| build exit 0 | `BUILD_EXIT=0` — PASS |
| 31 routes emitted | Route table lists 31 entries incl. `ƒ /flyers/[slug]`, `ƒ /give/[slug]`, `ƒ /services/[id]` — PASS |
| dynamic routes really are dynamic | `ƒ (Dynamic) server-rendered on demand` on exactly those three — confirms SSR is required and static export would 404 them (rejects option A of the plan with evidence) |

## T5. Production start honours `$PORT` (proves the Render start command)

```
$env:PORT=3999; npm run start -w @chms/web     # log: %TEMP%\web-start.log
```

| Request | Expected | Actual |
|---|---|---|
| server banner | listens on 3999, not 3000 | `- Local: http://localhost:3999`, `Ready in 1129ms` — PASS |
| `GET /login` | 200 (healthCheckPath) | `200` — PASS |
| `GET /` | 200 | `200` — PASS |
| `GET /dashboard` | 200 | `200` — PASS |
| `GET /give/demo` | 200 (dynamic segment under `next start`) | `200` — PASS |

## T6. Build guard fails loudly when the API URL is missing (negative test)

```
$env:RENDER='true'; Remove-Item Env:NEXT_PUBLIC_API_URL
cmd /c "npm run build -w @chms/web > %TEMP%\guard-neg2.log 2>&1"
```

| Expected | Actual |
|---|---|
| exit 1 (no silent localhost bundle) | `exit=1` — PASS |
| our message, not a generic crash | `Error: NEXT_PUBLIC_API_URL is required on Render, e.g. https://<chms-api-host>/api/v1 …` at `next.config.mjs:12` — PASS |
| positive control: guard allows the build when the var is set | `config loaded ok; keys= reactStrictMode,outputFileTracingRoot` — PASS |

## T7. Secret scan

```
npm run check:secrets
```

| Expected | Actual |
|---|---|
| clean | `check:secrets clean — no API keys or credentialed DSNs found in the tree.` exit 0 — PASS |

## NOT covered (declared)

- No real Render deploy was triggered; blueprint semantics were validated by YAML parsing and by reproducing the exact build/start commands locally.
- Cold-start behaviour, free-tier spin-down and instance-hour accounting are untested (cannot be tested outside Render).
- `WEB_URL` / `NEXT_PUBLIC_API_URL` values in the Render dashboard are owner-set; not exercised here.
- Browser pass over the role-gated UI (runbook Track B) remains outstanding.
- The uncommitted Session M working tree was deliberately **not** part of this unit, so the deployed UI is whatever `HEAD` contains.
