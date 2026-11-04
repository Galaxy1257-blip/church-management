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

### Batches 3–7 (approved or requested, not started)
- [ ] **Batch 3 — display:** GH₵ formatting everywhere, one shared notice banner component, accent legibility.
- [ ] **Batch 4 — phone and keyboard accessibility sweep.**
- [ ] **Batch 5 — ops:** branch RLS backstop, Render start command, SMS quiet hours enforced on send.
- [ ] **Batch 6 — screens that do not exist:** counselling notes, `/flyers` link, honest FEATURES.
### Batch 7 — member posts ✅ (owner ask, 4 Nov)
- [x] Notices tab in the companion: title, body, optional photo; *Waiting for a leader* / *Approved* / *Not
      approved*. Prayer requests take a photo too.
- [x] Leaders' queue on /announcements; approve/decline audited; only `APPROVED` reaches the public list and
      the portal home.
- [x] Settings switch *"Let members send in notices and prayer requests"* (`settings.memberPosts`, off by
      default), enforced by the portal API together with the News section. 5 unit tests; proven live
      (202 PENDING → approve → public; switch off → 403).

### Found in Batch 1, deliberately left for the batch that owns it
- [ ] `PermissionsGuard` returns `false`, so a permission 403 prints Nest's generic *"Forbidden resource"*
      while a switch 403 names the section. Batch 3 (shared notice banner) should give both one voice.
- [ ] The dashboard keeps offering **Check someone in** and **All services →**, and the *Latest service*
      card, while the Services section is switched off. The page itself answers with "Area switched off",
      so nothing is unsafe — it is the card that should follow the switch. Batch 3.

## Explicitly NOT recommended now (rebuild risk — already covered)
Offline headcount+haptic ✅ · overcapacity 85/95 ✅ · projection screen ✅ · QR membership cards ✅ (hashed
tokens) · households/guardians ✅ · children dual-ticket ✅ · visitor slips + GH phone norm ✅ · drip
pipeline ✅ · campaigns/thermals/goal dates ✅ (endsOn) · two-counter cash+cheque ✅ · pesewas ledger ✅ ·
bulk SMS segments+wallet+STOP ✅ · prayer wall+answered tracking ✅ · encrypted counseling notes ✅ API only,
no screen (R1) ·
cell meeting reports ✅ (topic/offering/attendance) · hash-chained audit ✅ · RLS multi-branch data
isolation ✅ (governance reports pending R4.5) · announcements+push skeleton ✅ · birthday age-promotion ✅
(birthday *messages* → fold into R4.3 locales)


