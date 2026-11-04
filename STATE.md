# STATE — Master session context (read this FIRST in a new session)
Last updated: 2026-11-04 (Session AB). **Self-contained**: a fresh session can
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
  apps/web                 # Next 15 PWA: staff app (+usher mode, /billing, /extras), /give public,
                           #   member companion /portal, /bible, public home+signup+reset, /platform office
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
9. **Git protocol (owner, 26 Oct): commit + push after every unit of work** — blueprint ground rule 8.
   Conventional subject, explicit paths (never `git add -A`), `npm run check:secrets` first, evidence
   (`LOGS.md`/`BUILD_ORDER.md`/`STATE.md`/`.ecc/`) committed with the code, and the push proven with
   `git ls-remote origin refs/heads/main` == `git rev-parse HEAD`. Never leave a dirty tree across a
   task or session boundary; declare anything uncommittable in §6.

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
  fante(66), ewe(66). Each bundle carries `localName` per book (own-language titles; `name` stays the
  English key). Non-PD extracts carry `publicDomain:false` + honest license. WEB pending (§6).
- **Demographics**: configurable AgeBrackets (min/max/genderSplit); Member.dob + ageBracketId; check-in
  auto-sorts into bracket headcount sections; birthday promotions (manual + nightly), audit-chained.
- **Roles**: SUPER_ADMIN('*') · FINANCE_ADMIN (money+reports) · USHER (headcount/checkin/visitors+care) ·
  FOLLOWUP_TEAM (visitors+care+sms) · LEADER (ops) · MEMBER (zero staff perms → companion only) ·
  **ELDER** (R4.7: care+visitors+sms) · **SECRETARY** (R4.7: members+services+campaigns+reports) ·
  **SUNDAY_SCHOOL** (Session U: care for the assigned class + the children's desk for that class) —
  seeded by seedChurchDefaults; presets in shared/permissions.ts. Media was removed entirely in
  Session P. Care is visible only to USHER and SUNDAY_SCHOOL even though other roles may hold care:read.
- **App-section switches are API boundaries, not menu sugar**: `@ForModule(key)` on the controller and
  `ModuleGuard` last in the guard chain (`apps/api/src/common/guards.ts`), so a switched-off section 403s
  with the section named. `module-coverage.spec.ts` fails if any key in `MODULE_KEYS` claims no controller.
- **One class rule, shared**: `apps/api/src/common/class-scope.ts` is the only place that decides what a
  Sunday School teacher's class is. Care and the children's desk both read it; nobody re-implements it.
## 4. Verification status (**`npm run db:verify` PASSED** — Session K, 22 Oct)
- **Gate green (26/26)**: `prisma migrate deploy` (0_init) · `extras.sql` (FORCE RLS, triggers,
  hash-chained audit) · app_user + platform_user roles/grants/passwords · seed (demo church,
  9 roles incl. SUNDAY_SCHOOL) · api tests **19 unit + 7 integration** — integration runs against a **freshly reset
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

- **Session N delta (29 Oct, uncommitted):** shared build ✓ · shared **68/68** · api **55/55** ·
  typecheck 0 (shared/db/api/worker/web) · eslint 0 · check:secrets clean · access-smoke
  **ALL CHECKS PASSED** (rewritten for array permissions + Worship default off) · `next build` 29 routes.
  No browser pass on the changed surfaces yet.

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
- **K**: **`npm run db:verify` GATE PASSED — 26/26** on native PostgreSQL 16.11
  (Docker install failed → EDB silent installer, service Automatic). Fixed along the way:
  withPlatform→platformPrisma, extras.sql idempotency, create-roles password healing,
  verify-stack dotenv, headcount SAVEPOINT replay, SmsLedger refId-backfill trigger exception,
  handleInbound phone normalisation, integration tests modernised + fresh `chms_test` per run.
- **O (current, 30 Oct)**: **subscriptions, public site and the platform office.** Monthly billing
  (14-day trial → active → 7-day grace → paused) with `BillingGuard` 402 and a workspace lock;
  Paystack subscription payments (mock until live keys) plus cash confirmation by the office;
  public home / sign-in (password or SMS) / sign-up (new church or join by id) / 3-step password
  reset; `/platform` office for OmniLabs staff (OWNER, ONBOARDER, SUPPORT) with churches, users,
  payments, app sections, per-church **extra tools**, member CSV import and 90-second "Open as"
  handoff. Owners alone manage money, create churches and the team; onboarders set churches up.
  Shipped as `962aef4` (api), `cbf4934` (public web), `9efd7e6` (billing/extras web), `3d4049f`
  (office web), pushed to `origin/main`.

## 6. Currently working on (exact in-flight state)
0. **Session P — ✅ committed 31 Oct (`7105d44` class-scoped Sunday School care, `d25d67e` automatic
   Sunday service).** The web 500s are cleared: killed the :3000 listener, deleted `apps/web/.next`,
   restarted `npm run dev:web` — `/`, `/dashboard`, `/expenses`, `/events`, `/children`, `/care`,
   `/settings` all return 200. **Never run `next build` while a dev server is live.**
   Dashboard is trimmed to four cards, the rest behind a "Show 3 more cards" line that remembers the
   choice per browser (Edit mode still shows every card).
   Owner decision that was open here — a Sunday School teacher could not open `/children` — is settled:
   Session U gave the role its own `children:write`, scoped to the class the office assigned. See 0e.
0b. **Session R — the persistent Bible button (`35192ee`, pushed).** Owner asked
   for the Bible to be reachable from anywhere: "just put a button at the top right … but no clutter" and
   "make the bible reader accessible to any type of user". `apps/web/src/components/bible-dock.tsx` is a
   small fixed **Bible** button plus a reading panel mounted in the staff shell and the member companion,
   with seven languages, five note colours, verse search, cross-translation compare and a link to `/bible`.
   Notes live in the new `BibleNote` table (`migrations/11_bible_notes`), scoped by church and author, and
   one service answers both audiences: staff `@Authenticated()` `/bible/notes`, members `/portal/bible-notes`
   with the bearer they already hold. The new **Bible** app section is the off switch and gates the API too.
   Nothing from the previous session's list is shipped yet: the in-app daily reading + header bell, and the
   Sunday School batch (class register, guardian SMS, class skip dates, teacher-only health note, guardians
   on the pick-up row, class link to the reader).
0c. **Session S — unreadable text, app-wide (`308bf5f`, pushed).** Owner screenshot of the announcements page:
   "text color unreadable, check all similar instances". One rule caused it (the global filled-button ink
   leaking into `<button className="card">`) and the same leak in disguise was found across the app: night's
   `--brand` used *as text* (2.09–3.03:1) and `--accent` gold as text (2.1–3.0:1). Every text site now uses
   `--link` or `--ink`; verified 0 WCAG failures at 390px in sanctuary and night over 16 screens plus the
   open Bible dock. Also `Register (idempotent by phone)` → **Save visitor**. Deliberately left for the
   owner: `--terracotta` hover text (2.99–4.48) and the gold ■ legend marker would need the 20 approved
   palettes darkened — a design change, not a bug fix.
0d. **Session T — each Bible reads in its own language (`c23a8a7`).** Owner: "the bible book names of
   the twi bibles seem to be in english … along with all languages, is it normally like that". No — the
   normaliser had discarded the source titles. `scripts/add-bible-local-names.mjs` (`npm run bible:names`,
   dry run unless `--write`) harvests all 66 titles per bundle from the owner's APKs and, for Ewe, a
   published Bible Society of Ghana list (`scripts/data/bible-ewe-book-names.json`). Bundles keep the
   canonical `name` and gain `localName`; `matchBook` accepts either, so "Mateo 3:16" works; the reader,
   the floating dock and Settings print local titles in **Bible order** (`inBookOrder` in shared). Two
   latent defects fixed on the way: books listed alphabetically (reader opened at 1 Chronicles) and the
   duplicated "Twi (TWI (Asante))" label (`translationLabel`). Honest gap: **Fante shows 24 English
   titles** — that app names its own files in English and its text is AES-encrypted, so the printed titles
   are not recoverable from it.
0e. **Session U — audit Batch 1 (uncommitted as of 4 Nov).** The owner approved three sections of the
   Phase 4 report — *feature reality, minor and polish, and the 10 major findings* — and withheld the two
   fake-success blockers (mock Paystack webhook, simulated SMS/gift success). **Do not "fix" those two**;
   they are waiting for live keys, not for code.
   Batch 1 made the App-section switches real: `@ForModule(key)` + `ModuleGuard` last in the chain, so a
   switched-off section 403s at the API (**9/9 off, 5/5 on**), and `module-coverage.spec.ts` fails the boot
   if a key in `MODULE_KEYS` is claimed by no controller. Worship is off for a new church by default.
   The Sunday School desk now works: new `children:write` permission, one class rule shared with Care in
   `apps/api/src/common/class-scope.ts` (`deskRosterChildIds` = pickup list, office + own class;
   `deskMoveChildIds` = desk, office + door + own class), and `GET /children/services` so the desk can pick
   a service while the Services section stays off — it reads through `ServicesService.list`, which is what
   opens today's service on the first read Sunday morning. The usher lost the Children menu item the hint
   had promised but the API refused.
   Local dev fixtures created to prove it (Postgres only, **Neon untouched**): demo user `+233240000110`
   given the demo password and the *Children Ministry* bracket with segment ALL, two `MemberGuardian` pickup
   links (Kofi Mensah and Emmanuel Appiah ← Akosua Nyarko), and a service row dated 4 Nov. The demo church's
   `serviceSchedule.weekday` was temporarily set to Wednesday and restored to Sunday.
0f. **Session V — audit Batch 2 (money truth).** Four findings fixed and proven in the running app.
   (1) Welfare notes were never decryptable: `encryptNote` dropped the GCM tag, so the list shipped
   `descriptionCipher`/`nonce`/`keyVersion`. The tag now rides at the end of the ciphertext, the list returns
   `description` in words, and `openNote` returns null for pre-fix rows instead of failing the screen.
   (2) Welfare moved to its own **/welfare** page (Money area, `welfare:read`, gated by the Care switch
   because the API routes are `@ForModule('care')`); `/care` stays usher/teacher-only and keeps the prayer
   wall and visits. (3) Campaign totals are bounded by `endsOn` (inclusive day) via `campaignRaisedWhere`,
   and launch accepts an end date. (4) The dashboard money card names its Sunday and entry count.
   `statement(year)` now filters in the database rather than over `myGiving`'s 200-row page, and the portal
   downloads a real PDF (verified: 1,557 bytes, `Total given: GHS 1132.00`, `5 gift(s)`). Member mode also
   got **Keep me signed in on this phone**, so a reload no longer costs the church another SMS code.
   Open finding, not approved to fix: portal sign-in cannot complete when the church has no `SmsWallet`
   (no code is queued) — part of the withheld fake-SMS blocker.
0g. **Session AB — audit round 5 approved; Batch 12 (giving door + desk permissions).** Owner reply to the
   round-5 report: *"for the point one give a prompt when turning books off, app should act on user response,
   impement audit log and point 2. do 4 and 5 and 6. decide on 7"* — points **1, 2, 3, 4, 5, 6 approved**,
   point **7 is mine to decide**. Shipped here (see BUILD_ORDER Batch 12, LOGS 2026-11-04 Batch 12):
   Settings → App sections asks what happens to the public give link when Offerings is unticked, the answer
   is stored in `Church.settings.moneyOffStopsGiving`, and `@PublicIntake('money')` + `ModuleGuard` enforce
   it; and the three children's-desk routes declare `@AnyPermission(...)` instead of relying only on
   `class-scope.ts`. **A real blocker came out of it**: `POST /giving/quote` and `/giving/initialize`
   demanded staff permissions although their only caller is the anonymous `/give/<slug>` page, so online
   giving had never worked for a giver — both are now public intake keyed by `churchSlug` (fund checked
   against that church, audit row with `actor_id: null` + ip, 30/min and 8/min per IP).
   **Next units, in the owner's order:** (3) the read-only audit-log screen on `audit:read` — the table is
   trigger-append-only and hash-chained, worth saying on the screen; (4) usher mode keyed on `checkin:write`
   not `headcount:write` (`(app)/layout.tsx:54,108`); (5) `/collection` route rule missing `module:'money'`
   (`lib/access.ts:315`, nav has it at `:295`); (6) `ELDER` + `FOLLOWUP_TEAM` hold `care:*` but
   `CARE_ROLES` (`lib/access.ts:175`) hides Care from them; (7) my decision = add `demographics:write` and
   `branches:write` granted to exactly the roles that already do those things, so the gate exists with no
   behaviour change. The six dead grants from finding 3 shrink to five once `audit:read` has a screen.
   **Still not approved to touch:** `dev.controller.ts:41` mock-Paystack completion and simulated SMS/gift
   success. Migrations `12_member_posts` / `13_notifications` are local Postgres only.
1. **R4 pack — ✅ DONE (Session G)**, all 12 items ticked in BUILD_ORDER; Paystack/Ghana requirements   guide delivered in chat (sandbox keys, webhook URL, Paystack subaccount-per-branch model, cSMS
   token steps, Bible licences).
2. **Owner operator gates (R0)** — remaining: paste cSMS token in
   Settings→SMS gateway + confirm body fields; Paystack sandbox keys → flip PAYSTACK_MODE; WEB
   translation needs a *reachable* PD source (do NOT retry bible-api.com from this network).
   (`npm run db:verify` ✅ cleared 22 Oct — no longer a gate.)
3. **Owner feedback round 1 — ✅ committed 28e4f37 (Session N).** Plain English, simple
   Children/Men/Women groups, on-demand money events, Worship off by default, per-role visibility.
4. **Owner round 2 — ✅ shipped Session O (`962aef4`…`3d4049f`).** Monthly subscription with a
   workspace lock and `/billing`; public home/login/sign-up/forgot; platform office with owner /
   onboarder / support roles, per-church extra tools and member CSV import. Create an office login
   with `PLATFORM_ADMIN_EMAIL=… PLATFORM_ADMIN_PASSWORD=… npm run platform:admin` (role via
   `PLATFORM_ADMIN_ROLE=OWNER|ONBOARDER|SUPPORT`). Keep at least one active owner.
5. **Known gaps:** church-level staff roles still have no admin screen (platform Team only manages
   office staff); milestone dates capturable via API but no dedicated member-detail UI yet; handoff
   sessions have no refresh token (hard reload → `/login`); Paystack is still mock until live keys;
   `npm run test -w @chms/worker` reports "no test files" (pre-existing).
6. **Ghana-language Bibles — ✅ DONE through Session I**: six bundles live in `apps/api/data/bible/`
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
- **R1**: ✅ complete (all admin UIs) — BUILD_ORDER ticked 3 Nov after reading each page. One gap: encrypted
  **counselling notes have an API (`care.module.ts`) and no screen**; surface them on /care or drop it.
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
- **Known gaps / polish**: church-level staff roles admin screen (office staff now managed at
  `/platform/team`); member-detail UI for milestone dates; WEB translation source; GitHub CI run;
  Turnstile keys; worker has no test files; Paystack live keys and cSMS token (owner gates).
- **R8 (2 Nov round)**: ✅ dashboard at a glance · rotating verse of the day · the Bible button · the
  legibility sweep · the teacher-vs-Children-hint decision, closed by R9 Batch 1. Open: the daily reading as an in-app
  notification + bell, with its own switch · the Sunday School batch (register, guardian SMS, skip dates,
  teacher-only health note, guardians on the pick-up row, class → offline bundles) · `/flyers` has no entry
  point and FEATURES §15 overstates it · licence line on the /bible footer · the terracotta/gold palette
  decision (owner) · **Render + Vercel need a manual deploy before any of this is live.**
- **R9 (4 Nov audit round)**: Batch 1 ✅ — switches gate the API (9/9 switched-off sections 403 by name,
  5/5 switched-on 200), worship off by default, the class-scoped children's desk, the nav empty state.
  Batch 2 ✅ — welfare decrypt + its own /welfare page, campaign end date, dashboard money label, statement
  PDF, member-mode keep-signed-in. Batches 3–6 approved and not started (display · accessibility · ops ·
  missing screens). Batch 7 ✅ (owner ask, 4 Nov) — members send notices and prayer requests with photos
  from the companion; a notice waits as PENDING for a leader on /announcements and only shows to everybody
  once approved. Gated by `Church.settings.memberPosts` (off by default; demo is on) **and** the News
  section, enforced in the API.
  Batch 8 ✅ (owner ask, 4 Nov) — **Reminders** page under Reach (broadcast now, or 1 week/3 days/1 day
  before a program; duplicate text refused with the date it first went out), a companion **notification
  bell/pane** (in-app only — OS push still needs VAPID keys), and welfare requests that can be routed to one
  member (`WelfareRequest.assignedToMemberId`, shown in the companion as *Help you were asked to follow up*).
  Batch 9 ✅ (owner ask, 4 Nov) — **code-gated self-join** (`/join/<slug>`, 8-char church code, Settings
  switch + rotate; closed by choice, not open) and one shared **auto-clearing message bar** (`components/notice.tsx`:
  success 6 s, error 12 s + dismiss) applied across 38 files.
  Batch 10 ✅ (owner ask, 4 Nov) — usher mode fits the door: check-in by scanned card **or** typed member
  number/phone, `/collection` (new `collection:write`; the usher enters the counted amount and never sees the
  finance sheet — `GET /finance/batches` stays 403), real QR codes (join QR on /join-card and inside Check-in;
  each member's check-in QR in the companion). Requirement tags (`R4.10`) removed from the UI. Collections
  also work at non-service programs (nullable `GivingBatch.serviceId`, "For what?" picker).
  Batch 11 ✅ (owner ask, 4 Nov) — **the door is not the Services screen**: with worship switched off an usher
  still opens Check-in (`/checkin/setup` + `/checkin/find` gated on `checkin:write`, no `@ForModule`), the nav
  item is `standalone`, and the count reads Attendance rows so a person in a hidden section is still counted.
  **A card belongs to one church**: member QRs carry `chms-card://<church-id>/<number>` and the door refuses a
  foreign card by name (member numbers repeat across churches). See BUILD_ORDER §Batch 11.
  The two fake-success blockers (mock Paystack webhook, simulated SMS/gift success) were **not** approved
  and are untouched. See BUILD_ORDER §R9.

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
- App-section switches: packages/shared/src/modules.ts (keys+defaults+labels) ·
  apps/api/src/common/module-flags.ts + ModuleGuard in guards.ts · nav/routes: apps/web/src/lib/access.ts
  (the web mirrors the shared permission list — there is no shared dependency between the two apps)
- Class scope (Sunday School): apps/api/src/common/class-scope.ts — the only place that decides it
- **Theme colour rules** (apps/web/src/app/globals.css): `button` is a *filled control* — `color:
  var(--brand-ink)`, near-white. A `<button>` used as a surface must be `button.card` or set its own
  `color: var(--ink)` (`.group-card`, `.theme-card` do). `--brand` is a **fill** in every theme; text that
  wants the brand tint uses `--link` (tuned per theme; the only token that never fails contrast).
  `--accent` gold and `--terracotta` are decorative/hover colours and fail AA as body text in most themes.
- withTenant: packages/db/src/tenant.ts · audit: packages/db/src/audit.ts (+ audit_verify() in extras.sql)
- SMS dispatch (api): apps/api/src/sms/sms-dispatcher.ts · gateway (worker): apps/worker/src/sms-gateway.ts
- Giving: apps/api/src/giving/ (verifyPaystackSignature, paystackSecret, CAS settle); worker settle/nudge
- Demographics: apps/api/src/demographics/ · age math: packages/shared/src/age.ts
- Bible API: apps/api/src/bible/ (reader + `bible-notes.ts`, one service, two route surfaces) ·
  bundles: apps/api/data/bible/*.json (gitignored) · the always-there button: apps/web/src/components/bible-dock.tsx
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
6. **Commit and push** (§2 rule 9): `git add <explicit paths>` → conventional commit → `git push origin main`
   → prove it with `git ls-remote origin refs/heads/main` == `git rev-parse HEAD`. Put the commit hashes in
   the LOGS.md entry and in §6. `scripts/tmp-demo-accounts.js` is tracked, so its credential-bearing
   working copy must be reverted or rewritten before it is ever staged again; the untracked
   `scripts/*neon*` / `check-users.cjs` helpers never get added (see §2 rules 7 & 9).


