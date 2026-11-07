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
8. **Commit and push after every unit of work (owner request, 26 Oct 2026).** A step ends in a commit — never carry a dirty tree into the next task or the next session.
   1. Conventional subject (`feat(area):`, `fix(area):`, `chore(area):`, `docs(area):`), one logical change per commit.
   2. **Stage explicit paths — never `git add -A` / `git add .`.** This working tree legitimately holds `church-asset-kit/` (117 MB of images) and credential-bearing scratch scripts: **untracked** `scripts/check-neon.mjs`, `scripts/seed-neon.mjs`, `scripts/check-users.cjs` (never `git add` these) and the **tracked** `scripts/tmp-demo-accounts.js`, whose working copy carries an uncommitted Neon connection string — never commit that hunk; rewrite it to `process.env.DATABASE_URL` instead.
   3. Run `npm run check:secrets` before staging. If a secret is in a file, the file does not get committed — the owner rotates the credential.
   4. Commit the evidence with the code: `LOGS.md`, the ticked `BUILD_ORDER.md` items, `STATE.md`, and the `.ecc/` gate artifacts + journal for that task.
   5. Push (`git push origin main`) and **prove** it: `git ls-remote origin refs/heads/main` must equal `git rev-parse HEAD`. On Windows, PowerShell reports a *false* non-zero exit for `git push` and `eslint` because they write progress to stderr — trust the ref, not `$LASTEXITCODE`.
   6. If work is genuinely uncommittable (mid-refactor, red tests), say so in `STATE.md` §6 instead of leaving silent uncommitted changes.

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

## R1. Admin UIs (APIs complete + boot-checked; screens remaining) — ✅ DONE except counselling
Re-checked against the source on 3 Nov 2026 — this list had drifted: every page below was built in Sessions
N–R (each has its own `page.tsx` with real forms and API calls, verified by reading the file, not by
clicking every one) and is now ticked. The one genuine gap is split out at the bottom.
- [x] Settings (brackets, toggles, SMS gateway)
- [x] Members (chips, promotions modal, dob)
- [x] /groups — groups, meetings, attendance (358 lines; members open the shared profile drawer)
- [x] /roster — volunteer shifts + confirm/decline
- [x] /events — events + RSVP list (capacity/waitlist, guest QR tokens)
- [x] /campaigns — capital campaigns + pledges (progress from real gifts)
- [x] /expenses — submit + approve workflow (a submitter cannot approve their own)
- [x] /care — prayer wall (moderated) + welfare + care queue, class-scoped for a Sunday School teacher
- [x] /children — dual-ticket check-in/checkout (child tag + guardian pickup code)
- [x] /org — branches, transfers (2-step), households
- [x] /announcements — post announcements, category filter, photo, tap-to-read drawer
- [x] /drip — follow-up workflow builder (steps editor over the running engine)
- [ ] **Counselling notes have an API and no screen.** `apps/api/src/ministry/care.module.ts` creates and
      lists encrypted `CounselingNote` rows; nothing in `apps/web` calls it. Either surface it on /care for
      the roles that hold it, or remove the endpoint — it is currently dead weight with real privacy duty.
- ~~media page: songs (CCLI flag) + setlists~~ — **Media was deleted outright** (owner, Session P). No
  `/media` route and no media module in the API; the two `[x]` lines that claimed it were removed.

## R2. Phase 2.5 — Bible & worship companion
- [x] scripts/fetch-bible.mjs — bundle public-domain KJV (offline JSON, gitignored) — 66 books bundled 21 Oct
- [x] /bible API — **multi-translation**: scans `apps/api/data/bible/*.json`; books/chapter/search/verse refs + `?translation=`
- [x] /bible web page — translation picker, read + search + click-to-copy verse
- [x] **R2.0b The Bible button (Session R)** — one small fixed button on every staff page AND in the
  member companion, for every role: 7 languages, tap-a-verse notes in 5 colours (server-side, per author,
  `BibleNote` + `migrations/11_bible_notes`), verse search, cross-translation compare, remembered place.
  Off switch: Settings → App sections → **Bible**, which hides the button on both surfaces and makes
  `POST /bible/notes` 403 rather than merely removing the link.
- ~~Setlists API + songs (CCLI flag) on /media~~ — **gone with Media** (owner, Session P): no `/media`
  route, no media module in `apps/api/src`. Rebuild only if a church asks for a worship set list.
- [ ] **R2.1 Ghana local-language Bibles (owner action — licences)**
  - [x] Twi — ✅ BUNDLED 21 Oct (Session H): extracted from owner-supplied APK
    `com.mobobi.twibibleoffline_3.8.apk` with **`scripts/extract-apk-bible.mjs`** (generic APK→bundle:
    unzip assets → UTF-16/HTML parse → q/x→ɔ/ɛ decode → structural ID vs KJV → validation report).
    66/66 books, 31,094 verses, `twi.json` auto-listed. `publicDomain:false` + honest `license` field —
    owner must verify translation identity/rights (Mater Dei vs heritage translation) before public hosting.
    **Dialect still unproven**: the app is sold as *Asante Twi & English Bible* and its audio packs name
    Akuapem 1999 / Akuapem 2026 / Asante 2026, while nothing inside the text assets says which edition the
    *text* is. So `twi.json` is labelled plain **Twi** in the app and FEATURES no longer calls it Akuapem.
  - [ ] **Twi dialect audit** — settle what `twi.json` actually is, then either label it correctly or get a
    genuine Akuapem. `twi-asante.json` is proven: the Room DB itself carries the literal string
    "TWI BIBLE ASANTE VERSION" beside the `twi_bible` shelf (the app's *store title* says Akuapem, so the
    title is the unreliable half). The two texts are not duplicates — of 31,091 shared verses only 8% are
    identical after normalising, and 30 of 66 book titles differ. Cheapest proof: the same developer's
    *Twi Bible: Asante & Akuapem*, which ships both dialects in one database and can be compared directly,
    or a line from the Bible Society of Ghana.
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
  - [x] Own-language book titles (Session S) — **`scripts/add-bible-local-names.mjs`** (`npm run bible:names`)
        merges a `localName` into every bundle from its own source: mobobi asset filenames, christappzz Room
        `TotalBooks.subBookName` paired with the English shelf in the same table, and the Bible Society of
        Ghana Ewe list (`scripts/data/bible-ewe-book-names.json`) because com.eweghana.bible ships the Twi
        names. `name` stays canonical, so references, notes and compare are unaffected; the reader, the Bible
        button, search hits and copy all print the language's title, and `matchBook` takes either spelling
        ("Mateo 3:16" jumps). Book lists also follow **Bible order** now (`inBookOrder` in `@chms/shared`) —
        the bundles came out of their sources alphabetically, so every reader opened at 1 Chronicles.
  - [ ] Fante: 24 of 66 books still show the English title because the Fante app names its own files that way
        and its text is AES-encrypted, so the printed titles are not recoverable from it. Re-harvest from a
        licensed Fante drop, or accept the English titles, or take a published Fante list the owner checks.
  - [ ] Nzema, Dagbani, Dangme — as demand confirmed
  - [x] Once licensed file received: **APK → `node scripts/extract-apk-bible.mjs <apk> <code> <Language>`**
      (handles UTF-16, HTML styles, legacy-font decode, structural validation vs KJV — proven on Twi) or
      manual convert to bundle shape → drop into `apps/api/data/bible/` → appears in picker automatically (zero code changes)
  - [ ] Show licence attribution on /bible footer per translation. `bundle.license` is already returned and
        today reaches the screen only as a `title` tooltip on the language chip
        (`apps/web/src/app/bible/page.tsx:93`) — it needs a visible line, especially for the six Ghana
        bundles marked `publicDomain:false`.
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
- [x] Statements PDF: built-in branded writer (Batch 18) — no PDF library dependency was ever added

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

## R5. Owner feedback round 1 (29 Oct 2026 — plain language + visibility)
- [x] Plain English: "Offering" instead of "Giving" across nav, finance, public give page and portal
- [x] Simple groups by default: Children / Men / Women, switchable to detailed age groups in Settings
- [x] Churches can rename, remove and add their own groups; unused headcount segments are deactivated
- [x] Money events: common recurring categories stay as defaults (Tithe, Offering, Welfare, Building,
      Missions, First Fruits, Thanksgiving, Harvest); occasional events (Church Anniversary, Seed
      Offering, a named harvest) are one-tap adds in Settings → Offering, not seeded defaults
- [x] Worship switched off by default and re-enableable from Settings → App sections
- [x] Per-role visibility: nav and routes require the permission that fits the job (USHER, LEADER,
      FINANCE_ADMIN, MEMBER audited); MEMBER lands on /portal
- [ ] Owner follow-ups ("I will add others") — awaiting the next list

## R6. Backlog (evaluate after a pilot church uses R4 — do not build speculatively)
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

## R7. Owner round 2 (30 Oct 2026 — subscriptions, public site, platform office)
- [x] Monthly subscription billing: 14-day trial → paid → 7-day grace → workspace paused;
      `BillingGuard` returns 402 and the app shows one calm lock screen (except `/billing`)
- [x] Paystack subscription checkout (mock flow until live keys) + office confirmation of cash payments
- [x] `/billing`: fee, billing day, covered-until, pause date, payment history, pay/instructions
- [x] Public home, sign-in (password or SMS code), sign-up (start a church with trial **or** join by id),
      three-step forgot-password via SMS; `/auth` exempt from the billing lock
- [x] Password-reset codes carry their own OTP purpose (a login code cannot reset a password)
- [x] Platform Office `/platform`: overview, churches, church detail, payments, audit trail
- [x] Office roles OWNER / ONBOARDER / SUPPORT enforced server-side; owner-only team management
      (create login, reset password, turn off) and owner-only money/church creation
- [x] Per-church extra tools (`settings.customFeatures`): office editor + church-side `/extras` nav group
- [x] Member CSV import from the office: preview with duplicates/errors, then confirm
- [x] "Open as" handoff (90-second single-use link) for support work inside a church
- [x] App sections: only members, services, offerings and news are on for a new church; care, serving
      team, events, children, groups, follow-up, special offerings, expenses, SMS, departments and
      branches are switches the church ticks in Settings (Media deleted outright)
- [x] Care scoped to the class: ushers see the whole queue, a Sunday School teacher sees only the class
      the office assigns them (`User.careClassBracketId` + segment, carried as token claims); no class
      means an empty list, and welfare/moderation stay closed
- [x] Automatic Sunday service: the weekly service creates itself, opens check-in at 07:30 and closes
      at 12:00 (both editable), and a Sunday ticked "no church" never opens — reconciled on every read
      of `/services`, so no scheduler is involved
- [ ] Owner follow-ups — awaiting the next list

## R8. Owner round 3 (2 Nov 2026 — the dashboard, the Bible, legibility)
- [x] **Dashboard answers in one glance** (Session Q): trimmed to four cards, the rest behind a
      "Show 3 more cards" line that remembers the choice per browser; Edit mode still shows every card.
- [x] **Sunday School care scoped to the class** + **the service that opens itself** (Session P) — see R7.
- [x] **Rotating verse of the day** from the bundled Bibles (Session Q): `dailyReading()` in
      `packages/shared/src/daily-reading.ts`, used by both the SMS worker and `GET /bible` — no longer
      pinned to John 3:16.
- [x] **The Bible, one button away from everywhere** (Session R, `35192ee`) — R2.0b above.
- [x] **Nothing is allowed to be invisible** (Session S, `308bf5f` + `2b8f691`): a `<button>` used as a card
      inherited the filled-button ink and printed white on paper; night's `--brand` was used *as text*
      (2.09–3.03:1) and `--accent` gold as text (2.1–3.0:1). Text that wants the brand tint now uses
      `--link`. Verified 0 WCAG failures at 390px in light and night over 16 screens plus the open dock.
      `Register (idempotent by phone)` → **Save visitor**.
- [x] **A Sunday School teacher now runs the children's desk** (Session U, Batch 1 — see R9). The hint was
      made true by giving the role its own permission rather than by widening `checkin:write`: `SUNDAY_SCHOOL`
      holds `children:write`, which opens the desk for the assigned class only. The door team keeps
      `checkin:write` and does not get the pickup list.
- [ ] **The daily reading has no in-app voice.** The rotation engine ships; there is no header bell, no
      reading card on the dashboard or `/portal`, and no switch of its own. Owner asked for the quotation
      plus a very short message as a notification, and (later) a phone widget.
- [ ] **Sunday School batch** (recommended after the teacher permission decision): class attendance register
      · guardian SMS on check-in and check-out · class skip dates for the weeks a teacher is away ·
      allergy/health note visible to the class teacher only · the allowed guardians on the pick-up row ·
      the class view pointing at the offline Bible bundles.
- [ ] **`/flyers/[slug]` exists but nothing links to it**, and [FEATURES.md §15](FEATURES.md) still
      advertises a "Social Media Flyer Generator" that draws branded graphics. It is a share-links + QR page.
      Either link it from Settings/announcements or correct the doc.
- [ ] **Palette decision owed by the owner:** `--terracotta` as *hover* text (2.99–4.48:1) and the gold ■
      in `.demo-legend` both fail AA as text. Fixing them means darkening the 20 approved palettes, which is
      a design change, not a bug fix — so they were left alone.
- [ ] **Deploy is manual.** A push only runs CI; Render and Vercel keep serving the old build until a deploy
      is started in each console. Nothing in R8 is live on the hosted site until the owner does that.

## R9. Owner round 4 (3–4 Nov 2026 — full audit, then fix in batches)
Audit ran in four phases (function, working features in the running app, UI/UX, recommendations).
The owner approved three of the four report sections — *"FIX ALL Feature reality, IMPLEMENT Minor and
polish AND FIX Major — 10 findings"* — and did **not** approve the two fake-success blockers (mock Paystack
webhook, simulated SMS/gift success). Those stay as they are until asked for.

### Batch 1 — switches are real boundaries, and every role can reach what its role allows ✅
- [x] **A switch that only hides a link is not a switch.** `@ForModule(key)` + `ModuleGuard` (last in the
      guard chain) reject the endpoint itself: **9 of 9** switched-off sections answered 403 by name,
      **5 of 5** switched-on sections answered 200. `module-coverage.spec.ts` fails the boot if a switch in
      the shared table is claimed by no controller, so no key can be decorative.
- [x] **Worship off by default** for a new church, with `MODULE_DEFAULTS` as the single source.
- [x] **The Sunday School desk, scoped** — new `children:write`, one class rule in
      `apps/api/src/common/class-scope.ts` shared by Care and the desk, `deskRosterChildIds` (pickup list:
      office + own class only) and `deskMoveChildIds` (desk: office + door + own class). 12 unit tests.
- [x] **The desk needs a service without the Services section** — `GET /children/services` reads through
      `ServicesService.list`, so the Sunday-morning auto-open still runs. Proven live: the read created
      today's service for a church with worship switched off.
- [x] **Nav never prints a dead end**: the empty menu says which of the two reasons applies, and the brand
      mark goes to `/dashboard` for every role.
- [x] Verified in the running app at desktop and 390px as teacher, office and usher — full check-in and
      code release cycle, `0` overflow, office-only form hidden from the teacher.
- Gates: shared 126/126 · api 114/114 · both typechecks · eslint · `check:secrets` clean.

### Batch 2 — money truth ✅
- [x] **Welfare notes readable by the person deciding.** The GCM tag now travels with the ciphertext (the
      schema has no column), the list returns `description` in words and no cipher material, and `openNote`
      returns null for pre-fix rows instead of failing the screen. 8 unit tests (4 crypto, 4 welfare).
- [x] **Welfare has a reachable screen.** New **/welfare** page in the Money area, `welfare:read`, gated by
      the Care switch because the endpoints are `@ForModule('care')`. `/care` stays usher/teacher-only.
      Verified at 390px: table scrolls 190px inside its card to reach Approve/Decline; usher unaffected.
- [x] **Campaign totals stop at the end date.** `campaignRaisedWhere` bounds `paidAt < endsOn + 1 day`
      (end day inclusive); launch accepts an end date; the card prints the window. On real gifts: bounded
      Sep = 494,000 pesewas, open-ended = 695,000. 4 unit tests.
- [x] **The dashboard money card names its Sunday**: *"Offering on 18 Oct 2026 (11 entries)"*.
- [x] **Statement PDF from the member companion.** `statement(year)` filters in the database (was: 200-row
      page filtered in JS) and the portal downloads a real file — verified `statement-2026.pdf`, 1,557
      bytes, `%PDF-1.4`, `Total given: GHS 1132.00`, `5 gift(s)`. 2 unit tests.
- [x] **Keep me signed in on this phone** (owner ask) — portal token kept in local storage (or the open tab
      only when unticked), restored on reload, cleared by Sign out. Verified live.
- Gates: shared 126/126 · api 128/128 · both typechecks · eslint · `check:secrets` clean.

### Batches 3–7 (approved or requested)
- [x] **Batch 3 — display:** GH₵ formatting everywhere, one shared notice banner component, accent legibility.
      **DONE Session AF** — `ghs()` across 65 call sites / 16 screens, plain-English 403s, `--accent-ink` 6.23:1.
- [x] **Batch 4 — phone and keyboard accessibility sweep.** **DONE Session AG** — skip-to-content links (app +
      public shells); WCAG 2.5.8 24px floor on button/select/input controls; **46 aria-labels** applied (27 from
      placeholder context, 19 hand-written), re-audit shows **0 unlabeled controls**; one shared `useDialogFocus`
      hook (pure `trapTarget` boundary helper + 7 unit tests) wired into **4/4 dialogs** (member drawer, Bible dock,
      announcement drawer, phone menu). Verified live in the running app: focus moves in, Tab wraps last→first,
      Shift+Tab wraps first→last, Escape closes, focus restores to the trigger — Bible dock 44 focusables, phone
      menu 15, member drawer 3, announcement 1. Members page: 0 unlabeled visible controls, 0 horizontal overflow.
      Drawers 390px-safe (`min(420px,94vw)` / full-width bottom sheet). Gates: shared 136/136 · API 208/208 ·
      web 10/10 · shared/db/api/web typechecks · eslint · `check:secrets` clean. Screenshots unavailable (hidden
      browser surface) — DOM + live keyboard-event verification used instead.
- [x] **Batch 5 — ops:** branch RLS backstop, Render start command, SMS quiet hours enforced on send.
      **DONE Session AG** — `branch_scope` RESTRICTIVE policy now applied **dynamically to every tenant table
      carrying a `branchId`** (extras.sql loop, mirrors `tenant_isolation`) instead of only Transaction — the
      named 7 (Member, Visitor, Service, Group, Expense, Pledge, GivingBatch) plus any others; inert for
      church-wide users (`app.branch_ids` is `''`), filters only branch-scoped DEPARTMENT readers.
      Render `startCommand` now runs `db:extras` + `db:appuser` after `migrate deploy` so a fresh environment
      comes up with RLS + roles. Quiet hours: one shared rule (`resolveSmsQuietHours`/`smsQuietHoursBlocked`,
      default 20:00–08:00 on, matching the drip engine) enforced in the **dispatcher** (the single send path)
      for marketing-style sources (CAMPAIGN/DRIP/ANNOUNCEMENT/EVENT/ROSTER) — transactional OTP/receipt/reply
      never held; `sendCampaign` refuses with a plain-English reason instead of silently queueing zero;
      Settings → SMS gets an on/off + window control (church.settings.smsQuietHours, API-gated). Gates: shared
      141/141 · API 213/213 (incl. new dispatcher + service quiet-hours specs) · web 10/10 · all typechecks ·
      eslint · `check:secrets` clean. Worker-side fixes (followup.ts nextRunAt off-by-one during the last quiet
      hour; verse-of-day has no quiet-hours guard) belong to the parallel session — reported, not committed.
- [x] **Batch 6 — screens that do not exist:** counselling notes, `/flyers` link, honest FEATURES.
      **DONE Session AG** — new `/counseling` screen (find a member or your class → their encrypted notes →
      add a note with optional shared-with member IDs); nav item + route rule, both `care:read` and the Care
      switch (API is `@ForModule('care')` too). "Share links" foot action in the app shell → `/flyers/:slug`
      (was an orphan page, only reached by guessing the URL); its guest link corrected to `/join/:slug` (it
      pointed at the member portal). FEATURES §15 rewritten honestly: `/flyers` lists links (it does not
      generate graphics/QRs), guest sign-up is `/join/:slug` (not `/public/:slug/visitors`), and the portal
      bullet "update personal contact information" is corrected to "not available yet; members can delete
      their own account instead". Verified live: deny-path 403 renders plain English with Care off, nav hides
      the item, `/flyers/demo` renders the corrected links. Gates: web typecheck, eslint, web 10/10,
      `check:secrets` clean.
### Program tracking ✅ (owner ask, 7 Nov)
- [x] `Program` table (migration 15) + `/programs` screen: a church program repeats on a member's date (birthday,
      wedding anniversary, salvation/baptism/ordination day). Leaders set the reminder window (1 day – 1 month
      before) per program; the **Coming up** list shows whose day is inside it, with the ordinal ("25th").
- [x] **Send to the church** (the approval the owner asked for): one tap posts a whole-church notification
      (`kind: PROGRAM`, `memberId: null`) to the companion bell — sent **once a year per member per program**
      (dedupe key `program:{id}:{memberId}:{MM-DD}`; second tap says who already sent it).
- [x] **Off by default:** new App-section switch `programs` ("Programs & milestones"), default `false`, enforced
      on the API (`@ForModule('programs')`, covered by the module-coverage spec) and in the nav/route rules —
      both switch-table copies (packages/shared + web `lib/access.ts`) list the key.
- [x] Leader visibility is the `/programs` page itself (nothing is sent anywhere before approval). 12 shared
      date-maths tests (leap-day → Feb 28 in common years, window edges, ordinals incl. 11th/12th/13th) +
      3 API tests (approve-once, dedupe refusal, no-date refusal). Privacy + Terms updated and
      `LEGAL_UPDATED` bumped: celebrations are announcements, approved by a leader, askable not to share.

### Batch 7 — member posts ✅ (owner ask, 4 Nov)
- [x] Notices tab in the companion: title, body, optional photo; *Waiting for a leader* / *Approved* / *Not
      approved*. Prayer requests take a photo too.
- [x] Leaders' queue on /announcements; approve/decline audited; only `APPROVED` reaches the public list and
      the portal home.
- [x] Settings switch *"Let members send in notices and prayer requests"* (`settings.memberPosts`, off by
      default), enforced by the portal API together with the News section. 5 unit tests; proven live
      (202 PENDING → approve → public; switch off → 403).

### Batch 8 — reminders + welfare routing ✅ (owner ask, 4 Nov)
- [x] `/reminders` for leaders: broadcast now, or 1 week / 3 days / 1 day before a program; announcements
      can carry the same schedule. Duplicate text is refused by the API with the date it first went out.
- [x] Companion notification bell + pane (unread count, polled, marked read). In-app only; OS-level push
      needs VAPID keys the owner has not provided.
- [x] Welfare requests can be sent to the leaders (default) or one member, who sees it in the companion.
- [x] 5 unit tests; live API + browser at 390px; migration `13_notifications` applied locally only.

### Batch 9 — self-join with a code, and self-clearing messages ✅ (owner ask, 4 Nov)
- [x] `/join/<slug>` with an 8-character church code (no look-alike letters), Settings switch + copy link +
      rotate. Off by default; refused by the API without the code; duplicate phone refused. 4 unit tests.
- [x] One shared message bar for the whole app: success clears in 6 s, errors in 12 s with a dismiss button;
      swept across 38 files.

### Batch 10 — the door toolkit ✅ (owner ask, 4 Nov)
- [x] Check-in by scanned card or typed member number/phone in one box; idempotent repeats; 404 for a code
      that matches nobody.
- [x] `/collection` with `collection:write`: the door enters the amount counted; the treasurer approves it.
      The finance sheet stays closed to the usher (403 proven).
- [x] Real QR codes (`qrcode`): join QR on `/join-card` and inside Check-in; each member's own check-in QR in
      the companion.
- [x] Requirement tags removed from UI copy and comments.
- [x] Counts also work at programs that are not services (harvest night, funeral, fund drive):
      `GivingBatch.serviceId` nullable, "For what?" picker with *Other program…*, batch label names the
      occasion. 4 unit tests.

### Batch 11 — the door stays open, and a card belongs to one church ✅ (owner ask, 4 Nov)
- [x] "The qr is not there, i want ushers to be able help members check in": with the **Services section
      switched off** the usher lost the Check-in link *and* `POST /checkin` (the controller carried
      `@ForModule('worship')`). The door now reads its own list (`GET /checkin/setup`) and finds people by
      name/number/phone (`GET /checkin/find`), both on `checkin:write`; only the attendance *list* stays
      inside the section. Nav/route rule for `/checkin` is `standalone` (skips the section switch, keeps the
      permission). `doorView()` is the one shared rule used by Check-in, the dashboard and Visitors.
- [x] The count at the top of the door reads the check-ins, not the section totals — a person auto-sorted
      into a section the office switched off is still in the room.
- [x] Helping someone at the door marks **that** person checked in, not everybody on the screen.
- [x] **A card carries the church that printed it**: `chms-card://<church-id>/<member-no>` (shared helper in
      `packages/shared/src/card.ts`, mirrored for the web in `lib/card.ts`). Member numbers repeat across
      churches, so a bare number in a QR could check in the wrong person at another assembly. The door
      refuses a foreign card by name; a typed member number or phone still works; the join QR already named
      the church in its URL. 9 API door tests + 4 shared card tests.

### Audit round 5 — permissions per user (owner ask, 4 Nov)
Owner reply: *"for the point one give a prompt when turning books off, app should act on user response,
implement audit log and point 2. do 4 and 5 and 6. decide on 7"* — so items 1, 2, 3, 4, 5, 6 are approved
and 7 is mine to decide. Point 3 (the audit log screen) needs `audit:read`, which nothing required before
this round, so it is the next unit — shipped as Batch 13 below; 4–7 follow.

### Batch 12 — the giving door answers to the church, and the desk says who it is open to ✅ (4 Nov)
- [x] **Switching Offerings off now asks what happens to online giving.** Settings → App sections shows
      "The link members use to give online" with two plain-English choices — *Keep it open — only close the
      books* (default) or *Stop online giving too* — saved to `Church.settings.moneyOffStopsGiving` (no
      migration) and the prompt disappears again when Offerings is switched back on.
- [x] **The API acts on that answer.** New `@PublicIntake('money')` decorator: `ModuleGuard` reads
      `churchSlug` from the body, looks up the church through the TTL-cached platform client and 403s with
      *"Offerings is switched off for this church, and the church has stopped online giving too."* Only the
      give-link routes carry it; the office setup routes stay readable so Settings can rebuild the section.
- [x] **Fixed a blocker found while proving it: anonymous online giving had never worked.** `POST
      /giving/quote` and `POST /giving/initialize` demanded staff permissions, but the only caller is the
      public `/give/<slug>` page. They are now `@Public()` intake keyed by `churchSlug`, with the church
      looked up from the slug and the fund checked against *that* church; rate limits 30/min and 8/min per
      IP. The dead `byPhone` bucket was removed (it keyed off `phoneE164`, which these bodies never send).
- [x] **The give page tells people, instead of failing on submit**: `getPublicBySlug` returns `givingClosed`
      and the form is replaced by "Demo Church is not taking online giving right now…". Verified at 390px.
- [x] **The children's desk declares its permission instead of hiding it three layers down.** `POST /checkin`,
      `POST /checkout` and `GET /roster` now carry the new `@AnyPermission(...)` (an OR list — members /
      check-in / children for the desk, members / children for the roster), so `PermissionsGuard`, the boot
      check and a reviewer all see the rule. `deskMoveChildIds()` / `deskRosterChildIds()` stay exactly as
      they were: the class narrowing is still the second lock, and a member with none of those is refused
      before any write.
- [x] 4 guard tests (OR passes/fails, empty list is a boot error, `@AnyPermission` satisfies default-deny) +
      3 give-door tests + 3 desk-metadata tests + 3 shared `givingStopsWithBooks` tests.
      **165/165 API (19 files), 132/132 shared (16 files)**, api + web typechecks, lint, `check:secrets` clean.
      Live at 390px: prompt rendered, "stop" → 403 + closed give page, "keep" → 200 quote, demo restored.

### Batch 13 — the Activity log: point 3, the screen that shows who changed what ✅ (5 Nov)
- [x] **`GET /audit/events`, `/audit/groups`, `/audit/summary`** (`apps/api/src/audit/`) read the
      trigger-append-only, hash-chained `audit_event` table and nothing else — the module declares no route
      that writes, and a test pins the controller surface to exactly `events`, `groups`, `summary`.
- [x] **The church filter lives in the SQL, not in RLS.** `extras.sql` only forces row-level security on
      tables that spell the column `churchId`; this one spells it `church_id`, so it has none (verified:
      `relrowsecurity=false` for `app_user`). Every query carries `e.church_id = $n::uuid` itself.
- [x] **The screen says what happened, not what the record holds.** `before`/`after` never leave the API,
      and the search covers action, entity, entity id and the actor's name only — never the payloads, so the
      page cannot be used to fish a value out of the database one guess at a time.
- [x] **A "Check nothing was changed" button** runs `auditVerify` over the whole chain and answers either
      "every line still matches the one before it" or the `seq` that breaks — on demand, because it reads
      the entire log.
- [x] **Opt-in section switch, default off** (`audit` in `MODULE_KEYS`), hint says plainly that switching it
      off hides the page while the app keeps recording. `@ForModule('audit')` gates the API too, so a typed
      URL cannot read a section the church turned off.
- [x] **79 action codes have plain-English names** (`apps/web/src/lib/audit-labels.ts`), and an unknown code
      is printed exactly as recorded with a count on screen — `apps/web` has no test runner, so drift is
      visible rather than silently wrong.
- [x] 10 audit tests. **176/176 API (20 files), 132/132 shared (16 files)**, api + web typechecks, lint,
      `check:secrets` clean, `@chms/shared` rebuilt.
      Live at a true 390×844 viewport: 78 lines, **0 unlabelled actions, 0 clipped cells, 0 horizontal
      scroll**, group filter matches the API on all four counts (7 / 1 / 6 / 26), actor search 14 rows in
      both, empty-state copy, integrity check "78 lines / 3 of them today", switch off → 403 on all three
      routes then 200 after restoring, Usher token → 403, **19/19 themes ≥4.5:1** minimum contrast.
      Not proven: the "Show the ones before these" button — demo has 78 lines and the page asks for 100, so
      the cursor is covered by `audit.spec.ts` and `?limit=2` at the API, not by a click.

### Batch 14 — the door shell and the door money screen: points 4 and 5 ✅ (5 Nov)
- [x] **Usher mode is opened by the door job, not the headcount tally.** `headcount:write` decided
      eligibility at `(app)/layout.tsx:54` and `:108` while no nav item or route rule anywhere names it. Both
      now call `canEnterUsherMode()` (= `checkin:write`, the permission the `/checkin` link and
      `POST /checkin` require) and `isDoorOnly()` next to `USHER_NAV`, so eligibility and the rail are read
      from one definition. `services:read` is gone from the rule: the desk reads its own service list, so the
      shell has to work with the Services section switched off. USHER and LEADER both already hold
      `checkin:write`, so nobody gains or loses a screen today.
- [x] **`/collection` honours the Offerings switch — and the fix is the shared rule, not the one line.**
      `AccessRule` carries no module at all; a path's switch comes from `itemForPath()`, which scanned only
      `NAV_AREAS`. Door-only screens live in `USHER_NAV`, so they resolved to zero switches: the rail hid the
      link with Offerings off while a typed URL still opened a page whose API 403s. `itemForPath()` searches
      both lists now, taking each item's own `module` and never the rail's `?? 'worship'` area default.
- [x] **A regression of my own, caught in the running app and undone:** the first version gave `/dashboard`
      the rail's worship default, which denied the shared Today screen to an usher in a church with Services
      off. Re-proven open afterwards.
- [x] Live as the Usher at 390px: auto usher mode on sign-in, toggle both ways, `/collection` → "Area
      switched off — Offerings is switched off for Demo Church…", `/dashboard` + `/checkin` still open with
      Services off, `/collection` back to 6 programs once Offerings is re-ticked. API: `/finance/
      collection-service` 200 → **403** → 200 with the section wording; `/children/services` 200 either way.
      Resolver sweep: 21 area paths + 6 rail paths — the 4 rail links that also live in the areas resolve
      unchanged; of the 2 rail-only paths, 1 changes behaviour (`/collection`) and 1 stays open (`/dashboard`).
      **176/176 API (20 files), 132/132 shared (16 files)**, api + web typechecks, lint, `check:secrets`
      clean. `apps/web` has no test runner, so these three helpers carry no unit test — the proof is live.

### Batch 15 — Care is opened by the permission, not by a copied list of roles: point 6 ✅ (5 Nov)
- [x] **Point 6 said two roles were locked out; it was four.** Sweeping all 10 roles against all four Care
      surfaces (route, office nav, door rail, dashboard card) showed `SUPER_ADMIN` and `PASTOR` holding
      `care:read` with no Care screen either — the same defect, one row higher in the table. Fixing the list
      would have fixed the instance; the list itself was the bug.
- [x] **The role gate is deleted, not widened.** `CARE_ROLES` and `isCareRole()` are gone from
      `apps/web/src/lib/access.ts`, along with the `roles` field on `NavItem`/`AccessRule` and the `roles`
      parameters threaded through `mayOpen()`, `canAccessPath()`, `visibleNavGroups()` and
      `visibleUsherNav()` — Care was their only user. `care:read` is now the single rule, which is exactly
      what `apps/api/src/ministry/care.module.ts` already enforces. Sunday School stays limited to its own
      class because that scope lives in `apps/api/src/common/class-scope.ts:19`, not in the nav.
- [x] **Copy follows the rule:** the Care section hint in `packages/shared/src/modules.ts` and its hand
      mirror in `apps/web/src/lib/access.ts` now name elders, the follow-up team and ushers for the whole
      queue; both strings verified identical.
- [x] `packages/shared/src/permissions.test.ts` pins the six roles that hold `care:read` (usher, teacher,
      elder, follow-up, pastor, this office) and asserts leader/secretary/treasurer/member do not, so a new
      grant is a decision rather than an accident.
- [x] Live: elder and the platform admin open `/care` (chips "Elder · Whole church", page renders the visit
      list), the teacher still gets "Sunday school · My class", and a typed `/care` as Secretary says "Not
      available for your role — Care needs a permission your role does not have." At 390×844: 0 clipped
      elements, no horizontal scroll. **40/40 role-surface checks agree with `care:read`; 0 mismatches**
      (was 8). **176/176 API (20 files), 133/133 shared (16 files)**, api + web typechecks, lint,
      `check:secrets` clean.
- [x] **A mistake I made and repaired, recorded here:** granting the demo Elder a `FOLLOWUP_TEAM` row for the
      live check used a join on `Role.key` without the church, and `Role` is per-church — the insert wrote
      451 rows across 451 churches. All 450 foreign rows were deleted in the same session, the one demo row
      was kept for the test and then revoked, and a count over the whole table confirms **0** stray
      `FOLLOWUP_TEAM` rows outside the demo church. The Elder account is back to `["ELDER"]` and the demo
      church's Care section is back to off.

### Batch 16 — Two jobs get their own permission instead of borrowing the member record: point 7 ✅ (5 Nov)
- [x] **Point 7 was mine to decide, and I decided to split it, not to widen it.** The birthday promotion run
      (`apps/api/src/demographics/demographics.controller.ts:72`) and both halves of a branch transfer
      (`apps/api/src/ministry/branches.module.ts:191,197`) answered to `members:write` — the permission to
      edit one person. Each of those jobs moves many people or moves a person between congregations, so a
      church that wants to hand one of them out on its own could not.
- [x] `demographics:write` and `branches:write` added to `packages/shared/src/permissions.ts` and granted to
      `LEADER` and `SECRETARY`; `PASTOR` picks them up from `[...PERMISSIONS]` and this office from the
      wildcard, so the holder set is **exactly the four roles that held `members:write`**. Nothing had to be
      migrated: `apps/api/src/auth/auth.service.ts:96` derives permissions from this table on every request,
      not from the stored `Role.permissions` rows.
- [x] **The grant has a screen, which is the lesson from point 6.** The transfer form lives on `/org`, and the
      old rule (`church:write`, `settings:write`) admitted only the office and the pastor — so a leader or
      secretary who could post a transfer had no page to post it from. `branches:write` is now in that rule
      and in its nav mirror (`apps/web/src/lib/access.ts:272,349`), and the add-a-branch form on the same
      card is hidden unless the session holds `settings:write`, so nobody is offered a control that will fail.
      `apps/web/src/app/(app)/members/page.tsx:208` offers *Update age groups* only to `demographics:write` —
      it used to be unconditional and 403 on the elder, usher and treasurer screens.
- [x] Deliberately **not** moved: `POST /branches` (opening a branch) stays on `settings:write`, remittances
      stay on `giving:write`/`finance:read`/`finance:approve`, and `POST /push/subscribe` stays on
      `members:read` — it saves a device token for the signed-in person, which is not editing a member
      record. Pinning these in the new spec so the next split does not sweep them up by habit.
- [x] Measured, not asserted: **8 live demo logins × 3 API probes = 24 outcomes** — the four holders get
      `promotions/run` 201 (dry run, `apply:false` previews only per `demographics.service.ts:192`) and
      `branches/transfers` 400 (past the gate, rejected on the bogus id) exactly as before the split; the
      other four get 403 on both, as before. **64 web-rule checks over the same 8 sessions, comparing the
      table at `daabf40` with the new one: 5 changes, all intended** — `/org` closed→open for Secretary and
      Leader, the promotions button shown→hidden for Treasurer, Usher and Elder, and nothing at all changing
      on `/members`, `/branches`, `/care`, `/groups`, `/roster` or `/collection`.
- [x] Live UI: Secretary opens Organisation (heads Branches / Transfer member / Households, 2 forms, no *Add*
      branch form), Secretary still sees *Update age groups* on Members, and Elder's Members header is down
      to *Import list* + *+ Add member*. At 390×844: `/org` and `/members` both 390px document width, no
      horizontal overflow, **0 clipped controls**. Gates: **180 API tests over 21 files (my 4 new ones pass
      every run)**, **134/134 shared (16 files)**, api + web typechecks, lint, `check:secrets` clean.
- [x] **A gate that is flaky before my change, said plainly:** `apps/api/test/integration.spec.ts` times out
      its 5s budget for the two DB-creating tests when the whole suite runs in parallel. It reproduces with
      my new spec file removed (**174/176, 2 timeouts over 20 files**) and the file passes **11/11** run
      alone, so the flake is contention against the local Postgres, not this batch. Full-suite counts in this
      batch's runs were therefore 179/180 and 177/180.
- [x] **Not proven, said plainly:** the transfer *approval* step (`POST /branches/transfers/:id/approve`) has
      no screen in the app and no GET to list pending transfers behind one, so nothing in the UI calls it; the
      new permission is proven on the request half and on the decorator for the approve half. `apps/web` still
      has no test runner, so the web half of this batch rests on the live sessions and the table diff.

### Batch 17 — The three follow-ups Batch 16 reported instead of fixing ✅ (6 Nov)
- [x] **The bulk job answers to the Members switch.** `POST /demographics/promotions/run` carries
      `@ForModule('people')` (`apps/api/src/demographics/demographics.controller.ts:78`). A handler-level
      section beats a controller-level one in `getAllAndOverride` (`apps/api/src/common/guards.ts:174-209`), so
      the bracket and settings reads stay open with Members off — the office and the children's desk both need
      them. Live: switch off → the Secretary's run is `403` while `brackets`/`counts` stay `200`; switch on →
      `201`; the stored flags came back byte-identical to how they were found.
- [x] **The approval step has a screen.** New `BranchesService.listTransfers`
      (`apps/api/src/ministry/branches.module.ts:68-112`) + `GET /branches/transfers` on `branches:write`.
      `MemberTransfer` (schema.prisma:540-552) has no relations, so the member, both branches and both workers
      are stitched in one lookup each rather than an `include`. `/org` gained **Waiting for approval (n)** with
      Approve / Decline per row. Live end to end: the row read "Gideon Oppong (MEM-0045) HQ Accra → Tema
      Congregation · asked by Secretary"; clicking Approve emptied the waiting list, wrote `APPROVED` naming the
      approver and really moved that member's `branchId`; a second row declined read "the member stays where
      they are". Elder gets `403` on the list; the other non-holders get an empty list at best.
- [x] **Members offers only what the session can do.** The header reads the session permissions once
      (`apps/web/src/app/(app)/members/page.tsx:113`) and gates *Update age groups* on `demographics:write`,
      *Import list* on `members:import`, *+ Add member* on `members:write`; the per-row stage `select` becomes
      the plain word when the session lacks `members:write`. Live: Elder → 0 header buttons, 0 row selects,
      stage shown as text; Secretary → all three buttons and 48 selects.
- [x] Tests: `apps/api/src/ministry/branches.transfers.spec.ts` (5) pins the name stitching, the "no longer on
      the book" lines, the one-lookup-per-side query shape, the no-filter history and the route's permission;
      `demographics.permissions.spec.ts` gained the `people` section pin, including that the five reads carry no
      section. **186/186 API over 22 files, 134/134 shared (16 files)**, api + web typechecks, lint,
      `check:secrets` clean.
- [x] **A gap I found and did not close:** `approveTransfer` (`branches.module.ts:51-66`) still lets the worker
      who asked for a transfer approve it — proven live (Secretary asked, Secretary approved, `201 APPROVED`),
      so the card's "awaits approval by another leader" is not enforced by the API. It belongs to the branch
      hardening in Batch 5 (#60), not to this unit.
- [x] **Not proven, said plainly:** no 390×844 measurement this batch — the chrome-devtools MCP that carried
      `emulate` disconnected mid-session. The in-app browser was 510 CSS px wide, already past the mobile
      breakpoints, and at that width `/org` and `/members` show **0 clipped controls**, the only over-wide
      element being the branch table inside its own scroll wrapper. `apps/web` still has no test runner. The
      demo church is back as found (0 branches, 0 transfers, 0 members with a branch, `people` on); the audit
      rows these tests wrote stay, since that ledger is append-only by design.

### Batch 18 — Every shareable leaves the app as one branded PDF, and it names the people behind the money ✅ (6 Nov)
Owner brief: *"make all shareables in neatly branded pdfs … no json unless very necessary"*, then *"add the
person who signed off or initiated payments/expenses and the names of people who donated"*. No new dependency:
the built-in writer in `apps/web/src/lib/pdf.ts` does all of it.
- [x] **The writer prints pictures, not only text.** A generic `{ kind:'image', jpeg, maxSide, caption }` block
      joins `heading`/`table`/`fields`/`rule`; each distinct JPEG becomes one `/DCTDecode` XObject however many
      pages use it, and page objects moved to `6 + imageObjects.length` so the numbering stays exact. The join
      card now prints its own QR square with "Point your camera here" under it.
- [x] **Nine documents in the staff app, two in the member portal** — expenses month summary, finance board
      report, branch remittance report, roster sheet, check-in attendance sheet, member directory, one member's
      Act 843 personal-data copy, campaigns/pledges board sheet, join card; plus the portal statement and my-data
      copies (`apps/web/src/app/portal/page.tsx:334,420`). JSON downloads stay where a machine must read them,
      with a readable PDF beside them (`#71`–`#74`).
- [x] **The people are named, not their UUIDs.** `expenses/summary` → `startedByName`/`approvedByName` per row
      and a `signOffBy` line in the header (`apps/api/src/ministry/expenses.module.ts`); `/finance/analytics` →
      givers grouped by `COALESCE(member name, giverName)` with private gifts totalled but never named
      (`apps/api/src/finance/finance.service.ts`); remittances, roster shifts and pledges each resolve people in
      one lookup, with plain-English fallbacks ("No longer on the book", "Not approved yet").
- [x] Tests: 17 new in 5 files — `ministry/expenses.names.spec.ts` (5), `finance/givers.spec.ts` (4, pins the
      `LEFT JOIN "Member"`, the `isAnonymous = false` filter and that the private query never selects a name),
      `ministry/branches.remittances.spec.ts` (3), `ministry/roster.names.spec.ts` (3),
      `ministry/pledges.names.spec.ts` (2). **192/192 API over 23 files, 134/134 shared**, api + web typechecks,
      lint, `check:secrets` clean.
- [x] **Proven in the running app:** 9 of 9 pressed buttons produced a file and **0 byte-level problems over 9
      documents** (every xref offset lands on its own object, every `/Length` matches its stream). Real content
      where the demo church has data: expenses `Signed off by: Pastor` with `Secretary`/`Pastor` down every
      payment row; finance 3 pages with named givers; directory 2 pages / 48 members; `DEMO-0109` personal data;
      campaigns "Akua Danso MEM-0026 · GHS 7500 · Once"; join card with 1 embedded image and code `TML3ED5P`.
      Screenshots taken of the rendered expenses PDF and of `/expenses` at 390×844 (0 viewport overflow).
- [x] **Not proven, said plainly:** the two portal PDFs need a member SMS code and the mock gateway stores only
      its hash, so they were read in code only. `/roster`, `/checkin` and `/branches` hold **0 rows** in the demo
      church, so those sheets printed headers + "Nothing to show." but no real names — the lookups behind them
      are covered by the new API tests, not by the browser. On desktop Chrome `navigator.canShare({files})` is
      true, so a PDF button opens the Windows share flyout and waits on it; the phone path is what the fallback
      wording describes and was not exercised here.
- [x] Demo church flags left exactly as found: `worship`, `roster` and `special_offerings` were turned on for the
      pass and restored to `false` after it.

### Found in Batch 1, deliberately left for the batch that owns it
- [x] `PermissionsGuard` returns `false`, so a permission 403 prints Nest's generic *"Forbidden resource"*
      while a switch 403 names the section. **DONE Session AF (Batch 3):** both now throw a plain-English
      `ForbiddenException` naming the job, with a whole-catalogue coverage test.
- [x] The dashboard keeps offering **Check someone in** and **All services →**, and the *Latest service*
      card, while the Services section is switched off. The page itself answers with "Area switched off",
      so nothing is unsafe — it is the card that should follow the switch. **DONE Session AF (Batch 3):**
      the Services links already gate on `mod('worship')`; the `/checkin` link stays on purpose (the door
      keeps counting with Services off). (#78 verified against source.)

### Session AF additions (Batch 3 + legal)
- [x] One cedi format everywhere — `ghs()` (GH₵ 1,234.00), 65 call sites / 16 screens, PDF-safe.
- [x] Terms of Use + Privacy Policy at `/terms` and `/privacy`, footer + sign-up links, `legal-meta.ts`.
- [x] Self-service erasure `DELETE /auth/me` (anonymise, keep amounts, opt-out first, no audit before/after).
      Buttons in the member portal and staff About page. Erasure is a right, not a switch.
- [ ] #78 Dashboard cards fully follow every App-section switch (partially done — re-audit each card).

### Session AG additions (Help that answers + no dead clicks — owner ask, 7 Nov)
- [x] **The public "Help" link did nothing useful** — it pointed at `/#help`, which only scrolled to the
      contact footer. Replaced with a real, searchable `/help` page: 62 plain-English answers in 13 topics
      (getting started, billing, members, attendance, offerings, SMS, care, groups/branches, switches/roles,
      Bible, appearance/phone, data/privacy, troubleshooting), each grounded in what the app actually does.
      Native `<details>` disclosures (keyboard + screen-reader friendly), live search filter, contact card.
- [x] Public nav `Help → /help`; added an in-app `Help` link in the menu footer beside About.
- [x] **Dead-click sweep**: every `href` target resolves to a real route/anchor (0 × 404); no no-op `onClick`
      handlers; no `TODO`/`coming soon`/`disabled` placeholder buttons. `/#features` and `/#pricing` resolve to
      real home-page sections. `/#help` was the only dead link.
- [x] Verified live: `/help` 200, 62 FAQs / 13 groups render, search "locked" → 3 of 62 then resets, 0 horizontal
      overflow, widest button 244px (fits 390px). Typecheck + eslint + `check:secrets` clean. Screenshots not
      available (in-app browser surface hidden) — DOM verification used instead.

## Explicitly NOT recommended now (rebuild risk — already covered)
Offline headcount+haptic ✅ · overcapacity 85/95 ✅ · projection screen ✅ · QR membership cards ✅ (hashed
tokens) · households/guardians ✅ · children dual-ticket ✅ · visitor slips + GH phone norm ✅ · drip
pipeline ✅ · campaigns/thermals/goal dates ✅ (endsOn) · two-counter cash+cheque ✅ · pesewas ledger ✅ ·
bulk SMS segments+wallet+STOP ✅ · prayer wall+answered tracking ✅ · encrypted counseling notes ✅ API only,
no screen (R1) ·
cell meeting reports ✅ (topic/offering/attendance) · hash-chained audit ✅ · RLS multi-branch data
isolation ✅ (governance reports pending R4.5) · announcements+push skeleton ✅ · birthday age-promotion ✅
(birthday *messages* → fold into R4.3 locales)


