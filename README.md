# ChMS — Church Management System

A multi-tenant church management platform for Ghana: members, services & offline-first headcount, check-in, visitor follow-up, giving (Paystack), cash/cheque finance with a two-person rule, and SMS (wallet, campaigns, opt-out) — all money in integer pesewas.

Built from `BUILD_ORDER.md` + `schema.prisma` (source of truth) + `extras.sql` (RLS, triggers, audit chain).

## What's implemented (Phase 0 + Phase 1 core)

| Area | Status |
| --- | --- |
| Monorepo (npm workspaces): `packages/shared`, `packages/db`, `apps/api`, `apps/worker`, `apps/web` | done |
| Postgres schema + `FORCE` RLS + hash-chained audit log + immutability triggers | done |
| `withTenant` (interactive tx + `set_config`); platform role for cross-tenant jobs | done |
| Auth: password + phone OTP, JWT access, one-time-use refresh rotation (reuse revokes family) | done |
| RBAC default-deny: every route needs `@RequirePermissions` or `@Public`; **boot check refuses to start otherwise** | done |
| `normalizeGhPhone`, template engine, fee `quote`/`grossUp`, SMS segments, CSV — unit tested | done |
| Church onboarding (platform-key) + seeds: roles, funds, segments, visitor workflow, service template | done |
| Members CRUD + QR tokens (sha256-hashed) + CSV import (preview, dedupe, errors file) | done |
| Services + worker-materialised weekly instances; open/close lifecycle | done |
| **Offline-first headcount**: IndexedDB outbox → `POST /sync/batch` (client uuidv7 = idempotency) | done |
| Check-in (phone lookup + QR token); visitor registration (idempotent by phone, drip enrolment) | done |
| Single SMS dispatcher (normalise → opt-out → wallet reserve → unique `SmsLog` → queue) | done |
| Giving: quote → initialize → **HMAC SHA512 webhook** (raw body) → CAS settle → receipt SMS | done |
| Stuck-PENDING sweeper + failed/abandoned nudge; amount-mismatch hold in PROCESSING | done |
| Finance: cash/cheque batches, **two counters + separate approver**, deposit, by-fund/by-day reports | done |
| Campaigns: audience filter, cost preview, idempotent per-recipient logs; STOP/START handling | done |
| Worker reconciler (rebuilds every job from DB rows) + nightly audit-chain verification | done |
| Web PWA: login, dashboard, members+import, services, offline headcount, check-in, visitors, finance, SMS, public give page | done |

**Deferred (Phase 2/3 per BUILD_ORDER):** drip builder UI, groups/rosters, branch transfer, pledges, member portal + statement PDF, prayer/counseling, events/RSVP, children's check-in, announcements + web push, WhatsApp, USSD, multi-currency, SSE screens.

## Stack

- **apps/api** — NestJS 11 + Prisma 6 + JWT + BullMQ producer
- **apps/worker** — plain Node + BullMQ consumers (sms-send, giving-settle, campaign-send, verify-pending, maintenance)
- **apps/web** — Next.js 15 PWA (App Router)
- **packages/shared** — pure utils (money, phone, templates, fees, sms, csv, permissions)
- **packages/db** — Prisma clients (app + platform), `withTenant`, audit, seed, role setup
- Postgres 16 + Redis 7 via `docker-compose.yml`

## Quick start (Docker Desktop required for Postgres/Redis)

```bash
npm install
cp .env.example .env

docker compose up -d            # postgres + redis; init script creates app_user/platform_user
npm run db:generate             # prisma client
npm run db:setup                # migrate deploy + extras.sql + grants + seed (demo church)

npm run dev:api                 # http://localhost:4000/api/v1
npm run dev:worker              # mock SMS sends, gift settlement, reconciler
npm run dev:web                 # http://localhost:3000
```

Demo login: slug `demo`, phone `0240000000`, password `admin1234`.
Public give page: http://localhost:3000/give/demo — with `PAYSTACK_MODE=mock` the checkout lands on a local mock page that fires a **signed** webhook through the production code path.

### Database roles (important)

RLS uses `FORCE`, which still exempts superusers — so the **runtime connects as `app_user`** (see `.env.example`). Migrations/extras run as the owner (`OWNER_DATABASE_URL`); worker/webhook cross-tenant lookups use `platform_user` (`PLATFORM_DATABASE_URL`, `BYPASSRLS`). The compose init script and `npm run db:appuser` create both roles with grants.

## Testing

```bash
npm run test -w @chms/shared    # pure-logic unit tests (no infra needed)
npm run test -w @chms/api       # guard/HMAC unit tests; integration suite skips without TEST_DATABASE_URL

# full integration suite (Postgres with schema+extras+roles required):
TEST_DATABASE_URL=postgresql://app_user:app_dev_password@localhost:5432/chms npm run test -w @chms/api
```

The integration suite covers the Phase 1 release gates: tenant isolation, duplicate-webhook concurrency (one SUCCESS, one receipt), headcount replay idempotency, opt-out suppression, and the two-counter/separate-approver rules. CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, the Postgres-backed integration suite, and a production web build.

## Ground rules encoded in the code

1. **Money is integer pesewas** — validated at every boundary; the fund is credited `giftMinor`, the gateway charges `chargedMinor`.
2. **Idempotency everywhere** — `SmsLog.idempotencyKey`, client-generated Headcount/Attendance ids, `ProcessedWebhookEvent`, compare-and-set status flips, append-only `SmsLedger.idempotencyKey` (trigger-enforced).
3. **All tenant DB access goes through `withTenant`** — feature modules use `TenantService`; never the bare client.
4. **One SMS dispatcher** — nothing else touches the gateway, and only the worker calls it.
5. **Postgres is the source of truth** — the worker reconciler re-enqueues from DB rows at boot and nightly.
6. **Verify-before-build** — the CSMS adapter refuses to run until `CSMS_VERIFIED=true` (no guessed API fields); Paystack stays in `mock` mode until sandbox keys are configured.

## API sketch (prefix `/api/v1`)

- `POST /churches` (platform key) · `GET /churches/:slug` (public funds)
- `POST /auth/login` · `POST /auth/otp/request|verify` · `POST /auth/refresh|logout` · `GET /auth/me`
- `GET|POST /members` · `POST /members/import/preview|confirm` · `POST /members/:id/qr`
- `GET|POST /services` · `POST /services/:id/open|close` · `GET /services/templates`
- `POST /sync/batch` (offline headcount) · `GET /headcount/totals|recent`
- `POST /checkin` · `GET /checkin?serviceId=`
- `POST /visitors/register` · `GET /visitors` · `POST /visitors/:id/assign|convert`
- `POST /giving/quote|initialize` · `GET /giving/funds|transactions` · `POST /giving/webhooks/paystack`
- `GET|POST /finance/batches` · `.../entries|count` · `.../approve|deposit` · `GET /finance/reports/by-fund|by-sunday`
- `GET /sms/wallet|logs|ledger|opt-outs|campaigns|packages` · `POST /sms/campaigns/preview` · `POST /sms/campaigns/:id/send`
- `POST /webhooks/sms/dlr|inbound` (shared-secret) · `POST /dev/mock-paystack/complete` (dev only)

## Operations notes

- **Nightly reconciler (02:20):** requeues stuck SMS, verifies pending gifts, re-sends missing receipts, materialises next week's services from templates, and verifies each church's audit chain (breaks raise `audit.chain.broken`).
- **Hourly sweep (xx:15):** PENDING gifts older than 30 min are verified against the provider; mock mode abandons after 24 h and the giver is nudged exactly once.
- Receipts and nudges flow: webhook/worker → `giving-settle` queue → dispatcher (unique `receipt:{txId}` / `nudge:{txId}` keys make replays no-ops).
- Backups, restore drills and alert channels are operational tasks — see BUILD_ORDER Phase 1 hardening.
