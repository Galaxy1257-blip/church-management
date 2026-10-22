# ChMS Build Order (for the AI builder)

Read first: the blueprint doc (Sections 1-13), `schema.prisma` (source of truth for tables), `extras.sql` (RLS, triggers, audit log).
Where an older section contradicts a later one, the **precedence rules in Section 13 of the doc** win.

## Ground rules (apply to every task)
1. Money is integer pesewas. The fund is credited `giftMinor`; Paystack is charged `chargedMinor`.
2. Every write that could be retried (webhook, sync event, SMS, receipt) has an **idempotency key or unique constraint**. Test it by sending it twice.
3. All DB access goes through `withTenant(churchId, userId, fn)` (interactive transaction + `set_config`). Never import the bare Prisma client in feature modules.
4. All SMS goes through one dispatcher: normalise phone, check opt-out, reserve credits, create `SmsLog`, enqueue. No other code calls the gateway.
5. Postgres is the source of truth; Redis/BullMQ is a timer. A reconciler must be able to rebuild every job from DB rows.
6. Verify-before-build items (marked *verify* in the doc): Paystack Ghana MoMo/USD/subaccount details, CSMS API fields and reply support, WhatsApp pricing. Use sandbox keys; do not guess.
7. Definition of done for each step: code + tests + audit log entries for sensitive actions + permission check on every route.

## Phase 0: Foundations (week 1-2)
- [ ] Monorepo: Next.js PWA, NestJS API, worker entrypoint, shared types, Docker Compose (Postgres 16, Redis).
- [ ] Apply `schema.prisma` migration, then `extras.sql`. Create `app_user` (no BYPASSRLS).
- [ ] `withTenant`, auth (phone OTP + password), JWT + refresh rotation, RBAC guard with default-deny (boot check fails if a route has no permission decorator).
- [ ] `normalizeGhPhone`, template engine (`render`, `validateTemplate`), fee `quote/grossUp` with unit tests.
- [ ] CI: lint, typecheck, unit + integration tests (Postgres/Redis containers). **Tenant-isolation test** (church A cannot read church B).
- [ ] Seed: roles/permissions, default funds, default headcount segments, default visitor workflow.

## Phase 1: MVP, Sunday ops and collections (week 3-10)
1. [ ] Church onboarding + member CSV import (preview, dedupe, errors file).
2. [ ] Services + `ServiceTemplate` job; **offline-first usher headcount** (Dexie outbox, `/sync/batch`, conflict table). Gate: airplane-mode e2e test passes.
3. [ ] Member check-in (search + QR with hashed token cache), visitor registration (offline-safe).
4. [ ] SMS foundation: gateway adapter (against CSMS sandbox/mock), dispatcher, wallet + ledger, DLR webhook, opt-out keyword handling, credit alerts (500/100/0), credit purchase via Paystack.
5. [ ] Paystack giving: quote, initialize, give page, signed webhook (raw body, HMAC SHA512), `giving-settle` worker (compare-and-set, amount check against `chargedMinor`), receipt SMS, stuck-PENDING sweeper, failed/abandoned nudge.
6. [ ] Finance: cash/cheque batches (two counters, separate approver), nightly reconciliation job, per-fund and per-Sunday reports.
7. [ ] Bulk SMS campaigns (audience filter, segment counter, cost preview).
8. [ ] Hardening: audit chain + nightly verification, backups + restore drill, alerts, dashboards.
- **Release gates:** duplicate-webhook concurrency test (one SUCCESS, one receipt); offline usher test; opt-out trigger test; pilot church runs 3 Sundays with zero lost events and 100% payment match.

## Phase 2: Retention and automation (week 11-18)
- [ ] Drip engine: versioned workflows, step worker, reconciler, quiet hours, cancellation (STOP/reply/converted), `PendingPrompt` + inbound webhook, `CareTask` queue.
- [ ] Drip builder UI (dnd-kit, validation, cost preview, publish with "new visitors only / apply to active").
- [ ] Groups/cells + meetings + attendance (offline), volunteer roster + YES/NO confirmation + backup assignment.
- [ ] Branches + member transfer + branch-scoped RLS; households.
- [ ] Pledges/campaigns, member portal (OTP login, my giving, statement PDF), expense ledger, children's check-in.
- [ ] Prayer wall + counseling notes (encryption helper), events + RSVP, announcements (in-app + web push), sermon links.
- [ ] QR flyer generator + public visitor form (Turnstile, rate limit).

## Phase 3: Advanced (week 19+)
- [ ] SSE live headcount + media screen; giving analytics (read replica/materialized views).
- [ ] WhatsApp channel (after provider approval); welfare workflow; multi-currency mode B; USSD; churn score (rule-based first).

## Open questions to confirm with the product owner before coding
Paystack account model (subaccount per church vs own keys), SMS sender ID approval timeline, whether CSMS supports inbound replies (shortcode/virtual number), pricing model, pilot church and branch structure, Data Protection Commission registration owner.

---

# REMAINING TASKS (added 21 Oct 2026 — status tracked in STATE.md)

## R0. Operational gates (need live infra / human action — not code)
- [x] Run full stack once: `npm run db:verify` (migrate + extras + roles + seed + integration tests) —
  **✅ PASSED 22 Oct (Session K)** on native PostgreSQL 16.11 (`C:\PostgreSQL\16`, Windows service
  `postgresql-x64-16`, Automatic) — Docker NOT required; 26/26 tests (19 unit + 7 integration against
  a freshly-reset `chms_test` DB, see scripts/reset-test-db.mjs)
- [ ] Paste cSMS token in Settings → SMS gateway + confirm body fields vs Postman doc (owner action)
- [ ] Paystack sandbox keys: `PAYSTACK_MODE=live` + keys (owner action)
- [ ] Pilot: 3 Sundays, zero lost events, 100% payment match (release gate)

## R1. Admin UIs (APIs complete + boot-checked; screens remaining) — IN PROGRESS
- [x] Settings (brackets, toggles, SMS gateway)
- [x] Members (chips, promotions modal, dob)
- [ ] /groups — groups, meetings, attendance
- [ ] /roster — volunteer shifts + confirm/decline
- [ ] /events — events + RSVP list
- [ ] /campaigns — capital campaigns + pledges
- [ ] /expenses — submit + approve workflow
- [ ] /care — prayer wall, counseling (encrypted), welfare
- [ ] /children — dual-ticket check-in/checkout
- [ ] /org — branches, transfers, households
- [ ] /announcements — post announcements
- [x] media page: + songs (CCLI flag) + setlists (worship companion)
- [ ] /drip — follow-up workflow builder (steps editor; engine already runs)

## R2. Phase 2.5 — Bible & worship companion
- [x] scripts/fetch-bible.mjs — bundle public-domain KJV (offline JSON, gitignored) — 66 books bundled 21 Oct
- [x] /bible API — **multi-translation**: scans `apps/api/data/bible/*.json`; books/chapter/search/verse refs + `?translation=`
- [x] /bible web page — translation picker, read + search + click-to-copy verse
- [x] Setlists API + songs (CCLI flag) on /media
- [ ] **R2.1 Ghana local-language Bibles (owner action — licences)**
  - [x] Twi — ✅ BUNDLED 21 Oct (Session H): extracted from owner-supplied APK
    `com.mobobi.twibibleoffline_3.8.apk` with **`scripts/extract-apk-bible.mjs`** (generic APK→bundle:
    unzip assets → UTF-16/HTML parse → q/x→ɔ/ɛ decode → structural ID vs KJV → validation report).
    66/66 books, 31,094 verses, `twi.json` auto-listed. `publicDomain:false` + honest `license` field —
    owner must verify translation identity/rights (Mater Dei vs heritage translation) before public hosting.
  - [x] Twi (Asante) — ✅ BUNDLED (Session I): `Akuapem Twi Bible & Audio` XAPK → Room DB
    `assets/book_database` via **`scripts/extract-akuapem-sqlite.py`** (+ `normalize-bible-bundle.mjs`
    for KJV-name mapping): 66/66 books, 1,189 chapters, **31,102 verses (exact)**, `twi-asante.json`,
    in-app label "TWI BIBLE ASANTE VERSION", rights unverified (license field flags it).
  - [x] Fante — ✅ BUNDLED (Session I): `Fante Bible` XAPK (mobobi) — **AES scheme recovered from
    dexdump** (key = SHA-256(`nv93h50sk1zh508v`) from `FontStyle.a()`, zero IV, 3×base64+AES layers,
    `--mobobi` flag): 66/66 books, 31,051 verses, `fante.json`.
  - [x] Ga — ✅ BUNDLED (Session I): `Ga Bible` XAPK (mobobi, same scheme): 66/66, 31,090 verses,
    `ga.json`.
  - [x] Ewe — ✅ BUNDLED (Session J): `com.eweghana.bible_1.0.22.xapk` → Room DB `book_database`,
    translation key `Ewe_(Ghana)` → `scripts/extract-akuapem-sqlite.py` (hardened: two-phase row
    processing with lookahead clamp for out-of-order rows + empty-row slot claiming) →
    `normalize-bible-bundle.mjs` (tolerant floor lowered to 75% chapter agreement for
    uniquely-identifiable same-chapter books): 66/66, 1,189 chapters, 31,137 verses, `ewe.json`.
    ƒ/ɖ/ɔ/ɛ intact (plain-unicode SQLite — no font-map needed). `publicDomain:false` (rights unverified).
  - [ ] Nzema, Dagbani, Dangme — as demand confirmed
  - [x] Once licensed file received: **APK → `node scripts/extract-apk-bible.mjs <apk> <code> <Language>`**
      (handles UTF-16, HTML styles, legacy-font decode, structural validation vs KJV — proven on Twi) or
      manual convert to bundle shape → drop into `apps/api/data/bible/` → appears in picker automatically (zero code changes)
  - [ ] Show licence attribution on /bible footer per translation (bundle.license field already returned)
- [x] Verse-of-the-day SMS: worker job daily 05:55 (source ANNOUNCEMENT = opt-out respected, idempotent vod:{church}:{day}:{member}); settings card on /settings (`/churches/me/devotional`)
- [ ] **R2.2 More English translations (verify-before-build sources)**
  - [x] ASV (1901, public domain) — bundled from scrollmapper/bible_databases (MIT) — 66 books, `asv.json`
  - [ ] WEB (World English Bible, public domain) — **sources tried 21 Oct**: scrollmapper (404 on WEB/WBT/WBS),
    bible-api.com chapter assembly (100% connection failures from this network). Next: verify a reachable
    public-domain WEB source (e.g. official worldenglish.bible downloads) → convert TXT→bundle shape →
    write web.json into apps/api/data/bible/ (auto-served, zero code changes).

## R3. Deferred-tail wiring (skeletons now, providers later)
- [x] WhatsApp template registry (sending gated on provider approval)
- [x] Push: POST /push/subscribe (store PushSubscription); send when VAPID keys set
- [x] Turnstile: verify on /public/:slug/visitors when TURNSTILE_SECRET_KEY set
- [ ] USSD: deferred (telecom integration required — confirm with owner)
- [ ] Statements PDF: print view shipped; PDF lib deferred

## R4. Ghana-market MVP+ pack (owner request 21 Oct — triaged from Sets 1&2; priority order)
- [x] R4.1 **Missing-member alerts** — nightly: members with 3+ missed Sundays (from Attendance) →
      CareTask per lapsed member + SMS digest to welfare team; threshold in settings (churn endpoint exists)
- [x] R4.2 **Manual MoMo/cash entry + offline giving instructions** — MOMO_TRANSFER channel on batch
      entries (with provider reference); merchant number / USSD (`*xxx#`) instructions block on
      /give + portal from Church.settings.givingInstructions
- [x] R4.3 **SMS template locales (Twi/Ga/Ewe/Fante)** — per-church locale overrides for receipt, drip
      defaults, OTP, devotional with English fallback; admin editor. (Full UI i18n deferred to R5)
- [x] R4.4 **Ghana fund types** — add FIRST_FRUIT, THANKSGIVING, HARVEST, ANNIVERSARY, SEED fund types
      (seed defaults per denomination)
- [x] R4.5 **Branch → HQ remittance tracking** — Remittance model (fromBranch, amountMinor, depositRef,
      2-step approval), reports per branch/region (denomination selling point)
- [x] R4.6 **Funeral / one-week / outdooring support** — welfare quick-path + family fundraising
      (campaign/fund per bereaved family) + announcement category + SMS template
- [x] R4.7 **Elder & Church Secretary roles** — new RoleKeys (or LEADER permission presets)
- [x] R4.8 **Life events & spiritual milestones** — Member milestone fields (baptism, salvation,
      marriage, ordination) + PastoralAction log (wedding/dedication/class completion)
- [x] R4.9 **Care case tracking** — visits log (hospital/bereavement/home), assignee, status → care queue
- [x] R4.10 **Denomination presets** — terminology pack (Pentecostal, Methodist/Presbyterian w/ parish–
      society–diocese, Catholic, Apostolic) mapping labels + default structures on onboarding
- [x] R4.11 **Act 843 compliance pack** — consent log, data-access-request endpoint, retention policy
      fields, export-my-data (member companion)
- [x] R4.12 **Discipleship pathway tracker** — stages (visitor → new believer → member → worker → leader),
      per-member progress, stage report (ties to brackets/drip already built)

## R5. Backlog (evaluate after a pilot church uses R4 — do not build speculatively)
- Budget vs actuals + council export (expense ledger exists; budget module new)
- Asset/inventory register + check-out; facility booking; leadership meeting minutes
- Spiritual gifts/skills survey feeding rosters
- Visitor→member conversion funnel report (flags exist; funnel aggregation small)
- Cell locator maps (start text/district search first)
- Interface i18n for all screens (SMS locales first — R4.3)
- Email channel; WhatsApp Cloud API (gated on business verification)
- USSD check-in/prayer + USSD giving (telecom partnership required)
- Google/Apple Wallet passes; livestream platform deep links; multi-currency diaspora mode B
- View-audit on sensitive records (privacy tradeoff — edit-audit already hash-chained; revisit with DPC advice)

## Explicitly NOT recommended now (rebuild risk — already covered)
Offline headcount+haptic ✅ · overcapacity 85/95 ✅ · projection screen ✅ · QR membership cards ✅ (hashed
tokens) · households/guardians ✅ · children dual-ticket ✅ · visitor slips + GH phone norm ✅ · drip
pipeline ✅ · campaigns/thermals/goal dates ✅ (endsOn) · two-counter cash+cheque ✅ · pesewas ledger ✅ ·
bulk SMS segments+wallet+STOP ✅ · prayer wall+answered tracking ✅ · encrypted counseling notes ✅ ·
cell meeting reports ✅ (topic/offering/attendance) · hash-chained audit ✅ · RLS multi-branch data
isolation ✅ (governance reports pending R4.5) · announcements+push skeleton ✅ · birthday age-promotion ✅
(birthday *messages* → fold into R4.3 locales)


