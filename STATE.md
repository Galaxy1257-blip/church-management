# STATE — Master session context (read this FIRST in a new session)
Last updated: 2026-10-21 (Session G). **Self-contained**: a fresh session can
resume from it alone. Update it + LOGS.md + BUILD_ORDER.md at every session end
(see §10 Session handoff protocol).

---

## 1. What this app is
**ChMS** — multi-tenant church management platform for Ghana (GHS, MoMo).
Money is integer pesewas everywhere. One npm-workspaces monorepo:

```
C:\Users\HP\Desktop\church\
  schema.prisma            # tables source of truth (Prisma 6; +RefreshToken +AgeBracket +PlatformSetting)
  extras.sql               # FORCE RLS, triggers, hash-chained audit (audit_event), audit_verify()
  migrations/0_init/       # full DDL — deployed to chms + chms_test (db:verify passed 22 Oct)
  packages/shared          # money, normalizeGhPhone, template engine, fee quote/grossUp, sms segments,
                           #   csv, uuidv7, permissions, age math (ageOn/resolveBracket/promotionsFor)
  packages/db              # prisma clients (app=RLS via withTenant; platform=BYPASSRLS), audit, seed, roles, extras
  apps/api                 # NestJS 11 /api/v1; default-deny RBAC + boot check; raw-body Paystack webhook
  apps/worker              # BullMQ: sms-send, giving-settle, campaign-send, verify-pending,
                           #   maintenance (sweep/reconcile/age-promotion/followup-tick/verse-of-day)
  apps/web                 # Next 15 PWA: staff app (+usher mode), /give public, member companion /portal, /bible
  docker-compose.yml       # postgres:16 + redis:7 (init creates app_user/platform_user)
  scripts/                 # check-secrets.mjs, verify-stack.mjs (db:verify), fetch-bible.mjs, fetch-web.mjs
  mockups/index.html       # 11 static screen mockups
  README.md                # setup   BUILD_ORDER.md = blueprint + REMAINING TASKS (R0–R3)
  LOGS.md                  # append-only session journal   STATE.md = THIS FILE
```

## 2. Ground rules (encoded in code)
1. Money = integer pesewas; fund credited `giftMinor`, gateway charges `chargedMinor`.
2. Idempotency everywhere: SmsLog.idempotencyKey; client uuidv7 ids for Headcount/Attendance;
   ProcessedWebhookEvent dedupe; compare-and-set status flips; append-only SmsLedger (trigger-enforced).
3. Tenant DB access only via `withTenant`/TenantService. `platformPrisma` (BYPASSRLS) ONLY for cross-tenant
   jobs (worker, webhook ref lookup, reconciler). RLS uses FORCE → runtime MUST connect as app_user
   (superusers bypass RLS even with FORCE — see .env.example role split).
4. ONE SMS dispatcher (api sms-dispatcher.ts); gateway called only by worker. Wallet reserve→log→queue.
5. Postgres = source of truth; reconciler rebuilds jobs from DB rows (boot + nightly 02:20).
6. Verify-before-build: CSMS fields unverified (blocked until confirmed via Settings gateway card);
   Paystack mock until keys; Ghana local Bibles need licences (Bible Society of Ghana / Digital Bible Library).
7. **Secrets: never write API tokens into any file.** Operators paste at runtime (Settings → SMS gateway →
   PlatformSetting['sms_gateway'], masked on GET). Before every export: `npm run check:secrets`.
8. **Logging protocol (owner, 21 Oct):** every session appends to LOGS.md, updates BUILD_ORDER checkboxes
   and this file (see §10).

## 3. Settled architecture decisions (do not relitigate)
- **Usher = ONE app, role-scoped**: staff PWA "Usher Mode" (auto-on for usher-only accounts) →
  Today/Check-in/Headcount/Visitors + big touch targets. No second binary.
- **Three surfaces**: (a) staff app (JWT, RBAC nav) · (b) member companion `/portal` (OTP to member's
  registered phone → home/giving/shifts/events/prayer; token aud='portal', not staff JWT) ·
  (c) public links `/give/[slug]`, `/bible`, `/flyers/[slug]`, `/public/:slug/visitors`.
- **SMS gateway provider-agnostic**: mock / cSMS preset / custom HTTP (url + auth header + JSON body
  template `{to} {message} {sender} {idempotencyKey}`); stored in DB; worker hot-reloads 60s.
- **Bible multi-translation**: every `apps/api/data/bible/*.json` served (`?translation=`); default = **kjv**
  (explicit preference in `defaultCode`). Bundled: kjv(66), asv(66), twi(66), twi-asante(66), ga(66),
  fante(66), ewe(66). Non-PD extracts carry `publicDomain:false` + honest license. WEB pending (§6).
- **Demographics**: configurable AgeBrackets (min/max/genderSplit); Member.dob + ageBracketId; check-in
  auto-sorts into bracket headcount sections; birthday promotions (manual + nightly), audit-chained.
- **Roles**: SUPER_ADMIN('*') · FINANCE_ADMIN (money+reports) · USHER (headcount/checkin/visitors read) ·
  FOLLOWUP_TEAM (visitors+care+sms) · LEADER (ops+media) · MEMBER (zero staff perms → companion only) ·
  **ELDER** (R4.7: care+visitors+sms) · **SECRETARY** (R4.7: members+services+campaigns+reports) —
  seeded by seedChurchDefaults; presets in shared/permissions.ts.
## 4. Verification status (**`npm run db:verify` PASSED** — Session K, 22 Oct)
- **Gate green (26/26)**: `prisma migrate deploy` (0_init) · `extras.sql` (FORCE RLS, triggers,
  hash-chained audit) · app_user + platform_user roles/grants/passwords · seed (demo church,
  8 roles) · api tests **19 unit + 7 integration** — integration runs against a **freshly reset
  `chms_test`** each run (`scripts/reset-test-db.mjs`, app/platform URLs via `.env`
  `DATABASE_URL_TEST`/`PLATFORM_DATABASE_URL_TEST`).
- **Postgres = native PostgreSQL 16.11** at `C:\PostgreSQL\16` (EDB silent installer; Docker Desktop
  install failed on this machine). Service `postgresql-x64-16` = Running/**Automatic**. Databases:
  `chms` (dev) + `chms_test` (integration). Docker now optional (compose file still offers
  redis/PG parity).
- Sweep: typechecks api/worker/web/db ✓ · full-tree eslint **162 files 0/0** ✓ · check:secrets
  clean ✓ · api build ✓ · Next prod build ✓ (Session G) · API smoke boot last run Session F.
- **Bugs the gate caught & fixed (Session K)**: `withPlatform` ran on the app_user client
  (cross-tenant writes RLS-blocked → now `platformPrisma`); `extras.sql` not idempotent
  (branch_scope/counseling_access policies + 5 ADD CONSTRAINTs unguarded); create-roles now
  heals role passwords (platform_user was auth-broken); verify-stack now loads `.env`;
  headcount replay crashed (`25P02` — poisoned tx → now SAVEPOINT per event);
  SmsLedger append-only trigger blocked every first dispatch (`P0001` → trigger now allows ONLY
  the null→id `refId` backfill); `handleInbound` didn't normalise sender phones
  (raw `024…` → `unknown_recipient`); integration tests modernised (roles 6→8, real seeded segment
  keys, 10-char phone generator, wallet top-up, fresh-DB resets).
- **Session J delta**: Ewe bundled (66/66, 31,137v) + /bible fixes (`DATA_DIR` off-by-one,
  default translation = kjv, `ewe`+`twi-asante` pd=false) — BibleService dist sim ✓.

## 5. Milestones (detail per session in LOGS.md)
- **A (21 Oct overnight)**: Phase 0 + Phase 1 core complete — monorepo, schema+FORCE-RLS+hash-chained audit,
  withTenant, auth (password+OTP+refresh rotation), RBAC default-deny+boot check, members+CSV import,
  services+weekly materialisation, offline-first headcount (IndexedDB outbox→/sync/batch), check-in,
  visitors (idempotent+drip enrolment), Paystack giving (HMAC-SHA512 webhook, CAS settle, mock mode),
  finance two-counter batches, single SMS dispatcher+campaigns+STOP/START, reconciler, full PWA,
  give→settle→receipt loop verified in mock.
- **B**: demographics (brackets/DOB/auto-sort/promotions/chips/modal), usher mode, provider-agnostic gateway,
  Phase 2 modules (groups, roster, branches+transfers, households, pledges/campaigns, expenses,
  care with AES-GCM counseling/welfare notes, events+RSVP, announcements, media+songs, children dual-ticket,
  drip engine worker, member portal), Phase 3 (SSE headcount+projection screen, analytics, churn,
  WhatsApp template registry, public visitor form, flyer links), secrets script, STATE/LOGS created.
- **C**: all R1 admin UI screens + drip builder + songs/setlists; followup-admin+setlists+push APIs;
  Turnstile wiring; Bible: KJV 66/66 bundled, multi-translation API+page; blueprint R0–R3; LOGS.md; 11 mockups.
- **D**: ASV 66/66 (scrollmapper MIT, shape auto-detect); fetch script parallel+retries;
  verse-of-the-day SMS (worker 05:55 + /churches/me/devotional + Settings card).
- **E**: shutdown task removed (owner request); **member companion portal expansion** (home, giving
  +statement, volunteer shifts w/ YES-NO, events+RSVP, prayer tabs; portal-side shift respond endpoint);
  **WEB bible assembly script** (scripts/fetch-web.mjs via bible-api.com, background);
  master STATE.md rewrite for session handoff.
- **F**: overcapacity 85/95% banners + haptic vibration patterns (demographics capacity setting).
- **G**: **church customisation layer** (profile/branding API + Settings cards: logo,
  primary colour, tagline, contact, giving instructions, fees, funds manager, SMS-locale editor,
  denomination preset, retention, care alerts; branded topbar/give/portal) + **full R4 Ghana pack
  R4.1–R4.12** (missing-member nightly job, manual MoMo channel, SMS locales wired at every send
  site, Ghana fund seeds, branch remittances w/ 2-step approval + Branches page, funeral categories,
  elder/secretary roles, milestones+PastoralAction, care queue, denomination terminology, Act 843
  exports/retention, discipleship stages). shared/uuid now isomorphic (Web Crypto).
- **H/I**: Ghana-language Bibles from owner APK/XAPKs — Twi (mobobi AES recovered), Ga, Fante,
  Akuapem-Twi-asante via Room-DB pipeline; extractor hardening; 66 books/1,189 chapters each.
- **J**: Ewe bundled (66/66, 31,137 verses) + /bible fixes (DATA_DIR off-by-one, kjv default,
  ewe/twi-asante publicDomain=false).
- **K (current)**: **`npm run db:verify` GATE PASSED — 26/26** on native PostgreSQL 16.11
  (Docker install failed → EDB silent installer, service Automatic). Fixed along the way:
  withPlatform→platformPrisma, extras.sql idempotency, create-roles password healing,
  verify-stack dotenv, headcount SAVEPOINT replay, SmsLedger refId-backfill trigger exception,
  handleInbound phone normalisation, integration tests modernised + fresh `chms_test` per run.

## 6. Currently working on (exact in-flight state)
1. **R4 pack — ✅ DONE (Session G)**, all 12 items ticked in BUILD_ORDER; Paystack/Ghana requirements
   guide delivered in chat (sandbox keys, webhook URL, Paystack subaccount-per-branch model, cSMS
   token steps, Bible licences).
2. **Owner operator gates (R0)** — remaining: paste cSMS token in
   Settings→SMS gateway + confirm body fields; Paystack sandbox keys → flip PAYSTACK_MODE; WEB
   translation needs a *reachable* PD source (do NOT retry bible-api.com from this network).
   (`npm run db:verify` ✅ cleared 22 Oct — no longer a gate.)
3. **Known gaps:** no staff-user/roles admin screen (roles exist in seed+presets only); milestone
   dates capturable via API but no dedicated member-detail UI yet; API smoke boot not re-run this
   session (typecheck+build only); `npm run test -w @chms/worker` reports "no test files" (pre-existing).
4. **Ghana-language Bibles — ✅ DONE through Session I**: six bundles live in `apps/api/data/bible/`
   (kjv, asv, twi, twi-asante, ga, fante — all 66 books/1,189 chapters), auto-listed by `/bible`.
   Tools: `scripts/extract-apk-bible.mjs` (APK **and XAPK**; `--mobobi` decrypts the mobobi AES
   scheme — key `nv93h50sk1zh508v`, zero IV, 3 layers, recovered via dexdump), 
   `scripts/extract-akuapem-sqlite.py` (Room SQLite), `scripts/normalize-bible-bundle.mjs`
   (raw→KJV-named). All non-PD bundles carry honest `license` fields — owner confirms rights before
   public hosting. Next languages: Ewe/Nzema/Dagbani/Dangme → same scripts (Ewe: verify ƒ/ɖ font map).
## 7. What's left (summary — authoritative = BUILD_ORDER.md REMAINING TASKS)
- **R0 (owner gates)**: ✅ `npm run db:verify` passed 22 Oct (native PG 16.11 — no Docker needed);
  paste cSMS token in
  Settings→SMS gateway + confirm body fields vs Postman doc; Paystack sandbox keys; 3-Sunday pilot.
- **R1**: ✅ complete (all admin UIs).
- **R2**: ✅ KJV+ASV · ✅ **Twi + Twi(Asante) + Ga + Fante (Sessions H/I — all 66 books, 1,189
  chapters each)** · ✅ verse-of-the-day · WEB in-flight (§6) · Ewe ✅ (Session J, `com.eweghana.bible` Room DB);
  remaining Ghana languages (Nzema, Dagbani, Dangme) = owner drops APK →
  `node scripts/extract-apk-bible.mjs <apk|.xapk> <code> <Language> [--mobobi]` (Room-DB APKs go
  via extract-akuapem-sqlite.py + normalize-bible-bundle.mjs) → apps/api/data/bible/ (zero code
  changes; shape in script header).
- **R3**: ✅ push subscribe (VAPID send gated) · ✅ Turnstile (auto-on with TURNSTILE_SECRET_KEY) ·
  WhatsApp sending gated on provider approval · USSD deferred (telecom) · PDF = print view shipped.
- **R4 (Ghana pack)**: ✅ ALL 12 items (Session G) — customisation layer, missing-member alerts,
  MoMo+instructions, SMS locales, funds, remittances, funeral categories, elder/secretary,
  milestones, care queue, denomination presets, Act 843, discipleship. See BUILD_ORDER §R4 + LOGS G.
- **Known gaps / polish**: staff-user & roles admin screen; member-detail UI for milestone dates;
  WEB translation source; GitHub CI run; Turnstile keys; worker has no test files.

## 8. How to run / verify (quick reference)
```bash
cd C:\Users\HP\Desktop\church
npm install                          # already installed on this machine
cp .env.example .env                 # DATABASE_URL=app_user…; OWNER_DATABASE_URL=owner…; PLATFORM_DATABASE_URL=platform…
net start postgresql-x64-16          # native PG 16.11 @ C:\PostgreSQL\16 (service = Automatic)
                                     #   db: chms (dev) + chms_test (integration); docker compose ONLY if you want redis
npm run db:verify                    # migrate+extras+roles+seed+tests (fresh chms_test per run)
npm run dev:api                      # tsc-watch → http://localhost:4000/api/v1
npm run dev:worker                   # BullMQ consumers + schedulers
npm run dev:web                      # http://localhost:3000
# demo login: slug demo / 0240000000 / admin1234   (seed grants 500 welcome SMS units)
npm run test -w @chms/shared && npm run test -w @chms/api
npm run lint && npm run check:secrets
npm run bible:fetch                  # KJV+ASV re-download; scripts/fetch-web.mjs = WEB
```

## 9. Critical edit points
- Permissions map: packages/shared/src/permissions.ts · guards+boot check: apps/api/src/common/
- withTenant: packages/db/src/tenant.ts · audit: packages/db/src/audit.ts (+ audit_verify() in extras.sql)
- SMS dispatch (api): apps/api/src/sms/sms-dispatcher.ts · gateway (worker): apps/worker/src/sms-gateway.ts
- Giving: apps/api/src/giving/ (verifyPaystackSignature, paystackSecret, CAS settle); worker settle/nudge
- Demographics: apps/api/src/demographics/ · age math: packages/shared/src/age.ts
- Bible API: apps/api/src/bible/ · bundles: apps/api/data/bible/*.json (gitignored)
- Member companion: apps/api/src/portal/portal.module.ts · apps/web/src/app/portal/page.tsx
- Worker schedulers/queues: apps/worker/src/main.ts · reconciler.ts · drip: followup.ts · vod: verse-of-day.ts
- R4/Ghana: worker missing-member: apps/worker/src/missing-member.ts · SMS locales: packages/shared/src/sms-locales.ts ·
  denomination presets: packages/shared/src/denominations.ts · remittances: apps/api/src/ministry/branches.module.ts +
  web (app)/branches · care queue: apps/api/src/ministry/care.module.ts · profile/branding: apps/api/src/churches/churches.service.ts +
  web (app)/settings · stages/milestones/export: apps/api/src/members/ · portal export: apps/api/src/portal/portal.module.ts

## 10. Session handoff protocol (MANDATORY at every session end)
1. Append dated session entry to **LOGS.md** (owner requests, built items, verification results).
2. Tick/extend checkboxes in **BUILD_ORDER.md** REMAINING TASKS.
3. Refresh **§4 Verification status** and **§6 Currently working on** in THIS file.
4. Run: typecheck (api/worker/web) + lint + check:secrets — record results here.
5. Never leave tokens/secrets in files; list pending operator actions for the owner.


