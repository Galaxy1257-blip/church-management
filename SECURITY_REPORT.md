# Security Report — ChMS

Scope: `apps/web` (Next.js 15), `apps/api` (NestJS 11), `apps/worker` (BullMQ),
`packages/db` (Prisma 6 / Postgres), `packages/shared`.
Method: black-box recon + white-box read of the security-critical paths, the
real `npm audit`, and Hallmark's `sloplint`. Findings applied in this pass are
marked **FIXED**; anything needing a breaking dependency bump, a schema change,
an auth-flow change or a provider-dashboard action is **OPEN** with a reason.

Baseline: this codebase already ships a strong posture — default-deny RBAC with
a boot check that refuses to start on an undeclared route, Postgres FORCE RLS on
every tenant table, audience-pinned JWTs, refresh-token rotation with reuse
detection, hashed OTPs with an attempt cap, parameterised raw SQL only, and
secrets clean in tree and history. This report fixes the gaps found on top of
that baseline.

---

## Fixes applied in this pass

| # | Domain | Severity | File | Issue | Fix applied | Test |
|---|--------|----------|------|-------|-------------|------|
| 1 | D | HIGH | `apps/web/next.config.mjs` | No browser security headers at all — no CSP, HSTS, nosniff, referrer policy, frame options, permissions policy, COOP/CORP | Added `headers()` emitting all eight; CSP allows only `self` + the API origin; `productionBrowserSourceMaps:false`; `poweredByHeader:false`; `images.remotePatterns:[]` | verified live via `curl -D-` |
| 2 | F | HIGH | `apps/api/src/main.ts` | No `helmet()`; `x-powered-by` leaked the framework | `helmet({ contentSecurityPolicy:false, crossOriginResourcePolicy:{policy:'cross-origin'} })` + `disable('x-powered-by')` on every API response | verified live via `curl -D-` |
| 3 | C | MEDIUM | `packages/shared/src/csv.ts` | CSV export had no spreadsheet formula-injection guard — a member named `=cmd\|…` executes in the treasurer's Excel | `toCsv()` prefixes a leading `'` on any cell starting `= + - @ \t \r` | `csv.test.ts` "neutralises spreadsheet formula injection" |
| 4 | M | HIGH | `package-lock.json` | 10 advisories (9 high, 1 moderate) in production deps | `npm audit fix` (non-breaking) → 10 down to 3 | `npm audit --omit=dev` |
| 5 | K | MEDIUM | `apps/worker/src/send.ts`, `sms-budget.ts` | No global SMS stop or hourly unit ceiling | Added `SMS_SENDING_ENABLED` kill switch and serialized `SMS_HOURLY_UNIT_CAP` (default 5,000 segments/hour); capped/disabled sends are deferred, not marked sent | 6 send-time tests + budget tests |
| 6 | J/L | MEDIUM | `apps/worker/src/send.ts` | Final campaign log could leave its campaign `SENDING` forever; cancelled or later-opted-out announcement texts could still reach the gateway | Restored campaign completion on every terminal path; recheck announcement approval, cancellation, expiry, sender permission, News switch, billing and opt-out before gateway acceptance, with atomic refund on suppression | `send.test.ts` cancellation/opt-out/campaign cases |
| 7 | K | MEDIUM | `apps/worker/src/announcements.ts`, `apps/api/src/sms/sms.service.ts` | Scheduled/manual SMS fan-out could race wallet-ledger balances | Re-read the locked wallet after atomic reservation and reconstruct per-log `balanceAfter`; stable idempotency keys, consent/opt-out filtering and honest partial outcomes | worker + API fan-out tests, including competing-reservation regressions |
| 8 | N | LOW | `apps/web/src/app/robots.ts`, `.well-known/security.txt/route.ts` | No crawler policy or security contact | Added robots rules excluding private/mock routes and a dynamic security contact | source/typecheck; live route check pending |
| 9 | O | MEDIUM | `apps/api/src/common/http-exception.filter.ts`, `log-redaction.ts` | HTTP exception logs could expose bearer tokens, JWTs, phone numbers, email addresses or control-byte log forging | Central HTTP error-log redaction, query stripping and control-byte removal; client still receives generic 5xx bodies | `log-redaction.spec.ts` |
| 10 | O | LOW | `docs/incident-response.md` | No containment/reconciliation runbook | Added SMS/push containment, wallet/ledger reconciliation and legal-update duties | document review |
| 11 | I | MEDIUM | `migrations/30_security_constraints/migration.sql` | Money columns accepted negative amounts | Idempotent nonnegative CHECK constraints; migration is part of the owner-approved hardening work and must be deployed before the matching release | migration applied to local main/test databases |

---

## Domain A — Authentication & sessions — no new findings

| Control | Evidence |
|---|---|
| JWT algorithm pinned (no `alg:none`) | `jsonwebtoken` verifies with a secret and an explicit `audience`; access `'access'`, refresh `'refresh'`, handoff `'handoff'` — audiences cannot be cross-used |
| Access TTL short | `ACCESS_TOKEN_TTL_SEC` from env |
| Refresh rotation + reuse detection | `auth.service.ts` `refresh()`: one-time-use, previous revoked; reusing a revoked token revokes the whole family and throws |
| Reset revokes all sessions | `updateMany({ revokedAt: null } → revokedAt: now)` on reset and logout |
| OTP strength | 6 digits from `randomInt` (CSPRNG), sha256-hashed with the server secret, 5-min TTL, `OTP_MAX_ATTEMPTS = 5`, consumed on success |
| Rate limiting | `RateLimitGuard` on the whole `auth` controller, `giving`, `platform-office`, `portal`; buckets by IP **and** by phone |
| Password storage | bcrypt (cost 10) — see OPEN-1 (recommend 12) |

## Domain B — Authorization & access control — no new findings

- **Default-deny**: `PermissionsGuard` throws unless the handler declares
  `@RequirePermissions`, `@AnyPermission`, `@Authenticated()` or `@Public()`;
  `BootCheckService` refuses to start if any route omits one.
- **Tenant isolation**: `withTenant()` sets `app.church_id`; `extras.sql` puts
  `FORCE ROW LEVEL SECURITY` + a `tenant_isolation` policy on every table with a
  `churchId`, plus `RESTRICTIVE` branch-scope and counselling policies. A query
  cannot read another church's rows even if a `where` is forgotten.
- **Over-exposure**: `members.list` uses `omit: { photoDataUrl: true }`; list
  endpoints cap page size (`Math.min(200, …)`, `Math.min(300, …)`).

## Domain C — Injection — FIXED-3 only

- All raw SQL is tagged-template parameterised (`$queryRaw` / `$executeRaw` /
  `Prisma.sql`) — no `Unsafe` variants in the tree.
- CSV formula injection: **FIXED-3**.

## Domain D — Browser-side (Next.js) — FIXED-1

- **FIXED-1**: security headers.
- No `dangerouslySetInnerHTML` except the static theme bootstrap (a constant
  string, no user data). No `innerHTML` / `eval` / `new Function`.
- Service worker `sw.js` explicitly skips `/api/` — authenticated responses are
  never cached.
- `target="_blank"` links carry `rel="noreferrer"`.
- **OPEN-2**: CSP `script-src` still needs `'unsafe-inline'` because Next injects
  an inline bootstrap; a nonce middleware would remove it. Tracked, not applied
  (middleware is a broader change).

## Domain E — Next.js / Vercel — OPEN-3

- No Server Actions of consequence; image optimizer unused; no debug routes.
- **OPEN-3**: the 24 Nov 2026 audit reports high-severity PostCSS advisories in
  the bundled Next dependency and a high-severity zod advisory; fixes require
  `next@16` and `zod@4`, both breaking majors.

## Domain F — API hardening — FIXED-2

- **FIXED-2**: helmet + `x-powered-by` off.
- Global `ValidationPipe({ whitelist:true, forbidNonWhitelisted:true, transform:true })`.
- CORS is an allowlist (never a mirror); `trust proxy` set in production.
- 1 MB JSON body cap; `HttpExceptionFilter` returns generic messages.
- Webhooks: Paystack HMAC-SHA512 verified over the raw body with
  `timingSafeEqual`, idempotent on `ProcessedWebhookEvent.eventKey`; SMS webhook
  verified with `timingSafeEqualStr`.
- **OPEN-4 (LOW)**: no timestamp-freshness check on the Paystack webhook —
  Paystack does not sign a timestamp, so this is a NOTE, not a fix.

## Domain G — SSRF — no new findings

No server-side fetch of user-supplied URLs. The only outbound fetch is the
Cloudflare Turnstile `siteverify` call to a fixed host.

## Domain H — File uploads — no new findings

Profile photos/logos arrive as data URLs matched against
`^data:image\/(png|jpe?g|webp);base64,…$` with a ~200 kB cap; no filesystem
writes, no user-controlled paths. **OPEN-5 (LOW)**: magic-byte verification and
EXIF stripping would harden the image path further.

## Domain I — Database — no new findings

- RLS FORCE on every tenant table; `PlatformUser` policy `USING(false)`.
- `sslmode=require` on Neon; pooled connection in serverless.
- Least-privilege app role (`app_user`, no DDL) separate from migrations.
- **FIXED-11**: `migrations/30_security_constraints` adds idempotent
  `CHECK (amount >= 0)` constraints to money and SMS-purchase columns.

## Domain J — Worker / Redis — no new findings

Jobs enqueue **ids only** (`{ logId }`, `{ txId }`) with deterministic
`jobId` (`sms:${logId}`), so a duplicate tick cannot double-send; SMS dispatch
is idempotent on `idempotencyKey` with a ledger check. Disabled/capped sends
receive delayed retries. **Residual:** recovery covers stale `QUEUED` SMS, but
not a process crash after a row is claimed as `SENDING`; see OPEN-10.

## Domain K — SMS / push abuse — controls added

Per-phone and per-IP rate limits on OTP/SMS; quiet hours gate marketing sends;
opt-out (`STOP`) is checked at fan-out and again at send time. **FIXED-5** adds a
global kill switch and serialized hourly segment ceiling. Announcement SMS uses
active-member consent, normalized/deduplicated phones, wallet reservation,
stable idempotency keys and provider-outcome-based `SENT`/`PARTIAL`/`FAILED`
results. Provider-dashboard spend alerts remain a manual action. A configured
mock gateway records attempts only; it is not evidence of delivery to a phone.

## Domain L — Money & business logic — no new findings

Integer minor units throughout (`packages/shared` money module); idempotency
keys on money endpoints; webhook dedupe at the provider level; totals computed
server-side.

## Domain M — Supply chain — FIXED-4, OPEN-3

- **FIXED-4**: `npm audit fix` removed 7 of 10 advisories.
- **OPEN-3**: the 24 Nov audit reports 10 advisories (8 moderate, 2 high):
  Next's bundled PostCSS and zod need breaking major upgrades; the ESLint
  minimatch chain is dev-only. Non-breaking `npm audit fix` has already been
  applied; forced majors are deferred deliberately.
- Secrets: `check:secrets` clean; `.env` gitignored and never in history.

## Domain N — Recon — no new findings

`x-powered-by` off (FIXED-2). No exposed `/.env`, `/.git`, backup files or API
docs. **FIXED-8**: `robots.txt` and `/.well-known/security.txt` are implemented.

## Domain O — Logging & monitoring — no new findings

`appendAudit` is called across 20+ services (auth, billing, giving, finance,
members, every ministry module). **FIXED-9/FIXED-10**: the central HTTP exception
filter redacts tokens/contact data and strips query strings/control bytes, and an
incident-response runbook is present. Other service and worker log callsites are
not yet covered by that central helper.

## Domain P/Q/R — anti-fraud / DoS / privacy

- Turnstile is wired on the public visitor intake when
  `TURNSTILE_SECRET_KEY` is set (no client-side-only protection).
- Bounded queries; large reads capped.
- Erasure (`DELETE /auth/me`) is a legal right, never behind a feature switch —
  anonymises the person, keeps the amounts, no before/after audit snapshot.

---

## OPEN items (need a decision, not auto-applied)

1. **bcrypt cost 10 → 12** + rehash-on-login (`auth.service.ts`). Low risk, but
   touches the auth path — flagged per the operating rules.
2. **CSP nonce middleware** to drop `'unsafe-inline'` from `script-src`.
3. **`next` 15 → 16** and **`zod` → 4.6.7**: breaking majors; the 24 Nov audit
   still reports two high-severity advisories (Next's bundled PostCSS and zod).
   Schedule with the upgrade train; do not force-apply without regression tests.
4. Paystack webhook timestamp-freshness (NOTE — provider signs no timestamp).
5. Image magic-byte verification + EXIF stripping.
6. **FIXED-11:** nonnegative money constraints are in migration 30; deploy it.
7. **FIXED-5:** global SMS kill switch + hourly unit cap. Provider-dashboard
   spend alerts remain a manual operator action.
8. **FIXED-8:** robots + security contact routes are implemented.
9. **FIXED-9/FIXED-10:** central HTTP exception-log redaction and the incident
   runbook are implemented; remaining service/worker log callsites are not yet
   covered centrally.
10. Stale `SENDING` SMS recovery after a worker crash; queued recovery exists,
    but blindly resending a claimed message could duplicate a provider charge.
11. Automatic dispatch of due `SmsCampaign.scheduledAt` rows. Scheduled
    announcement SMS is implemented; the older campaign scheduler remains manual.
12. Live provider acceptance/delivery and provider-dashboard spend alerts. The
    local mock records attempts only and cannot prove delivery.

## Assumptions & what could not be verified

- Render/Vercel/Neon/Redis dashboard settings (IP allowlists, PITR, spend caps,
  preview-deployment protection) are outside the repo — treat as MANUAL ACTIONS.
- No production live-fire test was run; findings are from static analysis + the
  running dev instance. The configured mock SMS gateway records attempts only.
- Verification on 24 Nov 2026: workspace typecheck and lint passed; shared 183,
  API 273 and worker 46 tests passed (502 total); secrets scan and
  `git diff --check` passed. The announcement SMS checkbox/hint was checked in
  the live DOM at 1440px and true 390px mobile emulation without horizontal
  overflow. Screenshot capture and a clean post-reload console pass were blocked
  by browser-tool failures. No production web build was run while the shared dev
  server was live.
- `npm audit --audit-level=high` still fails with 10 advisories (8 moderate,
  2 high); see OPEN-3.
- `x-middleware-subrequest` stripping is moot here: auth is enforced in the API
  guard, not in Next middleware, so the Next auth-bypass class of CVE does not
  apply to this app.
