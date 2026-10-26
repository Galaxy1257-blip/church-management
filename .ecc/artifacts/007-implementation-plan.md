# 007 — Implementation plan: deploy the staff web app (Render)

**Status:** approved (owner said "yes" to the proposal in chat, 26 Oct 2026)
**Author:** Cline · **Session:** N · **Risk:** medium (adds a second production service; touches build/start wiring)

## 1. Problem

`render.yaml` declares only `chms-api` (web, node) and `chms-redis`. Nothing deploys
`apps/web`, so the role-aware shell (usher mode, denied panel, nav gating) shipped in
`3c9b4d0`…`1453b69` exists only on developer machines. Pushing to `main` updates the API
and stops there.

## 2. Options considered

| Option | Verdict |
|---|---|
| **Static export** (`output: 'export'` + Render static site) | **Rejected.** `apps/web` still has three dynamic segments — `(app)/services/[id]`, `give/[slug]`, `flyers/[slug]`. Static export needs `generateStaticParams`, i.e. the list of church slugs at build time. `give/[slug]` is the public giving link sent to congregants; 404ing it is unacceptable collateral. |
| **Node SSR web service** (`next start`) | **Chosen.** Zero application restructuring. Same runtime the app is developed against. One extra Render service. |
| Single service serving both API and web | Rejected: changes the API's routing, CORS assumption and health path — far more risk than a second service. |

## 3. Change set

| # | File | Change | Why |
|---|---|---|---|
| 1 | `render.yaml` | New `chms-web` service: `type: web`, `runtime: node`, `plan: free`, `region: oregon`, build `npm install && npm run build -w @chms/web`, start `npm run start -w @chms/web`, `healthCheckPath: /login`, env `NEXT_PUBLIC_API_URL` (`sync: false`), `NEXT_TELEMETRY_DISABLED=1`, `NODE_ENV=production` | This is the missing deploy target |
| 2 | `apps/web/package.json` | `"start": "next start"` (was `next start -p 3000`) | Render routes traffic to `$PORT`; a hardcoded `-p 3000` would fail its port check. `next start` reads `PORT`, defaults to 3000 locally |
| 3 | `apps/web/next.config.mjs` | Throw at build time when `process.env.RENDER` is set and `NEXT_PUBLIC_API_URL` is missing | `NEXT_PUBLIC_*` is inlined at build time. Without the guard a misconfigured deploy ships a bundle that calls `localhost:4000` and looks "deployed but broken" |
| 4 | `apps/api/src/platform/payment-provider.ts` | Build the mock-payment link from the **first** entry of `WEB_URL` | `main.ts` treats `WEB_URL` as a comma-separated CORS allowlist, but this line assumed a single value. With the new origin the operator will want `https://chms-web.onrender.com,http://localhost:3000`; that would have produced `https://chms-web.onrender.com,http://localhost:3000/give/mock-pay?ref=…` |
| 5 | `apps/api/src/platform/payment-provider.spec.ts` | New vitest spec (3 cases) | Proves #4 without a database |

## 4. Non-goals

- No `output: 'export'`, no SPA rewrite, no `generateStaticParams` (§2).
- No change to `WEB_URL` parsing in `main.ts`; the comma list stays authoritative for CORS.
- No new health endpoint; `/login` is a client page that renders 200 without a session.
- No CI deploy job — Render deploys from the GitHub branch. CI keeps testing only.
- Not touching `scripts/tmp-demo-accounts.js` (owner-side rotation guide covers it).

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Second free service doubles cold starts | Documented; `chms-api` is already free-tier with spin-down |
| `NEXT_PUBLIC_API_URL` left unset → broken bundle | Guard #3 fails the build instead |
| Render Free instance-hours (750/month) shared by two services | Both are Free and spin down after 15 min idle; noted in LOGS so it is a known cost, not a surprise |
| `next start` default port regression for local runs | Next defaults to 3000 when `PORT` is unset — same behaviour as before |
| Blueprint out of sync with dashboard | `render.yaml` is the source of truth; new service documented in the operator notes |

## 6. Acceptance criteria

1. `python -c "import yaml; yaml.safe_load(open('render.yaml'))"` parses, and the parsed
   document contains exactly one `chms-web` service with the keys above.
2. `npm run typecheck -w @chms/web` passes.
3. `npm run build -w @chms/web` succeeds locally (proves the Render build command).
4. `PORT=3999 npm run start -w @chms/web` serves `GET /login` → 200 and `GET /` → 200
   (proves the Render start command and `$PORT` handling).
5. `npm run test -w @chms/api -- payment-provider` passes (3 cases).
6. `npm run check:secrets` stays clean; commit + push; `git ls-remote` matches `HEAD`.

## 7. Rollback

`git revert` of the single commit, or delete the `chms-web` service in the Render
dashboard. Nothing in the repository depends on it: `WEB_URL` stays operator-set, so the
API keeps working with the old value if the web service is removed.

## 8. Not covered by this plan

- Setting `NEXT_PUBLIC_API_URL` / `WEB_URL` in the Render dashboard — owner action, needs the
  real hostnames after first deploy.
- The browser pass (Track B of the Desktop runbook) — unchanged, still manual.
