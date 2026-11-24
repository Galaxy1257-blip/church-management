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
- **OPEN-3**: `next` 15.x carries 3 moderate advisories; fix is `next@16` (major).

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
- **OPEN-6**: add `CHECK (amount >= 0)` constraints on money columns
  (schema change — proposed, not applied).

## Domain J — Worker / Redis — no new findings

Jobs enqueue **ids only** (`{ logId }`, `{ txId }`) with deterministic
`jobId` (`sms:${logId}`), so a duplicate tick cannot double-send; SMS dispatch
is idempotent on `idempotencyKey` with a ledger check.

## Domain K — SMS / push abuse — no new findings

Per-phone and per-IP rate limits on OTP/SMS; quiet hours gate marketing sends;
opt-out (`STOP`) handled. **OPEN-7 (LOW)**: a global hourly spend cap + alerts
(provider dashboard action).

## Domain L — Money & business logic — no new findings

Integer minor units throughout (`packages/shared` money module); idempotency
keys on money endpoints; webhook dedupe at the provider level; totals computed
server-side.

## Domain M — Supply chain — FIXED-4, OPEN-3

- **FIXED-4**: `npm audit fix` removed 7 of 10 advisories.
- **OPEN-1/OPEN-3**: `zod` <4.6.6 (ReDoS/memory, high) and `next` 15.x
  (moderate) both need a breaking major bump. Deferred deliberately.
- Secrets: `check:secrets` clean; `.env` gitignored and never in history.

## Domain N — Recon — no new findings

`x-powered-by` off (FIXED-2). No exposed `/.env`, `/.git`, backup files or API
docs. **OPEN-8 (LOW)**: no `robots.txt` / `security.txt`.

## Domain O — Logging & monitoring — no new findings

`appendAudit` is called across 20+ services (auth, billing, giving, finance,
members, every ministry module). **OPEN-9**: PII redaction is per-call-site, not
central; alerting/incident-response runbook not present.

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
3. **`next` 15 → 16** and **`zod` → 4.6.7**: breaking majors; schedule with the
   upgrade train.
4. Paystack webhook timestamp-freshness (NOTE — provider signs no timestamp).
5. Image magic-byte verification + EXIF stripping.
6. `CHECK (amount >= 0)` constraints on money columns (schema migration).
7. SMS global hourly spend cap + provider alerts.
8. `robots.txt` + `/.well-known/security.txt`.
9. Central log redaction + `docs/incident-response.md`.

## Assumptions & what could not be verified

- Render/Vercel/Neon/Redis dashboard settings (IP allowlists, PITR, spend caps,
  preview-deployment protection) are outside the repo — treat as MANUAL ACTIONS.
- No production live-fire test was run; findings are from static analysis + the
  running dev instance.
- `x-middleware-subrequest` stripping is moot here: auth is enforced in the API
  guard, not in Next middleware, so the Next auth-bypass class of CVE does not
  apply to this app.
