# STATE — Master session context (read this FIRST in a new session)
Last updated: 2026-11-07 (Session AG — real searchable `/help` FAQ (62 answers / 13 topics) replaces the dead `/#help` footer link; dead-click sweep found 0 other dead links. **Batch 4 DONE**: skip links, 24px targets, 46 aria-labels (0 unlabeled remain), one shared `useDialogFocus` hook in 4/4 dialogs verified live (move-in/wrap/Escape/restore). **Batch 5 DONE**: branch_scope RESTRICTIVE generated for every branchId tenant table (was Transaction only); Render startCommand boots with db:extras + db:appuser; quiet hours (default 20:00–08:00, on) enforced in the dispatcher for marketing-style SMS with a Settings → SMS control; sendCampaign refuses plainly in-window. Gates green: shared 141, API 213, web 10. Worker-side fixes (followup.ts off-by-one-day, verse-of-day no quiet guard) reported to the parallel session. **Batch 6 DONE**: `/counseling` screen (encrypted notes, Care-gated), "Share links" foot action → `/flyers/:slug` (guest link corrected to `/join/:slug`), FEATURES §15 rewritten honestly. Next: the owner's program-tracking feature (#81), then full-app debugging pass). **Self-contained**: a fresh session can
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
   **Next units, in the owner's order:** points 3 to 7 — carried in 0h below, 3 shipped in Batch 13.
   `audit:read` was one of round-5 finding 3's six dead grants; it now gates three routes and one screen,
   so five remain (`church:write`, `users:read`, `users:write`, `sms:purchase`, `members:import`).
   **Still not approved to touch:** `dev.controller.ts:41` mock-Paystack completion and simulated SMS/gift
   success. Migrations `12_member_posts` / `13_notifications` are local Postgres only.

0h. **Session AC — Batch 13, the Activity log screen (point 3).** A read-only `/audit` over the
   hash-chained `audit_event` table (`apps/api/src/audit/`, `apps/web/src/app/(app)/audit/page.tsx`):
   When | Who | What | From, newest first, search + a "which part of the app" filter built from the codes
   this church actually has, and a **"Check nothing was changed"** button that runs `auditVerify` over the
   whole chain on demand. Three deliberate choices: the church filter is written into the SQL because
   `extras.sql` only forces RLS on tables spelling `churchId` and this table spells it `church_id`; the
   `before`/`after` payloads are never sent to the browser, so the screen says what happened to a record,
   not what the record contains; and the section switch is **opt-in and default off** per the owner's rule,
   with a hint that says switching it off only hides the page — the app keeps recording either way.
   Gates: `@ForModule('audit')` + `@RequirePermissions('audit:read')` on all three routes; `audit:read`
   already sat unused in `packages/shared/src/permissions.ts:40`, held by SUPER_ADMIN, PASTOR and
   FINANCE_ADMIN — those are exactly the three who should read it, so no grant changed.
   **Proven in the running app:** switch off → 403 with plain-English copy on `/audit/events`,
   `/audit/summary` and `/audit/groups`, switch back on → 200; an Usher token → 403; at a true 390×844
   viewport 78 lines render with 0 unlabelled actions, 0 clipped cells and no horizontal scroll; group
   filter counts match the API exactly (check-in 7, online giving 1, offering counts 6, church settings 26,
   every part 78); actor search "usher" → 14 rows in both; integrity check reports "78 lines / 3 of them
   today / every line still matches the one before it"; minimum text contrast over **all 19 themes** is
   4.52:1 (AA pass) after correcting a false positive of my own — my first sweep read an
   `rgba(255,255,255,0.024)` zebra stripe as opaque and claimed night mode was 1.16:1.
   **Not proven:** the "Show the ones before these" button — demo only has 78 lines and the page asks for
   100, so the cursor path is covered by `audit.spec.ts` and by `?limit=2` at the API, not by a click.
   `apps/web` has no test runner, so the 79-code label map cannot be unit-tested; drift shows
   on screen as "No plain-English name for this one yet — shown as recorded" with a count.
   **Next units:** points 4 and 5 shipped as 0i; 6 and my decision on 7 remain.
   **Still not approved to touch:** `dev.controller.ts:41` mock-Paystack completion and
   simulated SMS/gift success. Permission 403s still print "Forbidden resource" (Batch 3, #57).

0i. **Session AC — Batch 14, points 4 and 5: the door shell and the door money screen.** Both were the same
   class of bug — a rule stated in one place and read in another.
   **4 · Usher mode is keyed on the door now.** `(app)/layout.tsx` decided eligibility from
   `headcount:write` (+ `services:read`), which no nav item or route rule names, so eligibility and the rail
   could drift apart. New helpers in `lib/access.ts` sit next to `USHER_NAV`: `canEnterUsherMode()` =
   `checkin:write` — the same permission the `/checkin` link and `POST /checkin` both require — and
   `isDoorOnly()` for auto-opening the mode. `services:read` is no longer asked for, because the desk reads
   its own service list and the mode has to survive a church that switched Services off. USHER and LEADER are
   the only holders and both keep `checkin:write`, so no role gains or loses anything today; the fix is for
   the next assignment.
   **5 · `/collection` honours the Offerings switch.** The shared rule was not "add `module:'money'` to that
   one route line": `AccessRule` has no module field — a path's switch comes from `itemForPath()`, which only
   scanned `NAV_AREAS`. Door-only screens live in `USHER_NAV`, so they resolved to **no** switch while their
   own rail item hid the link: typed the URL, landed on a page whose API 403s. `itemForPath()` now searches
   both lists using each item's own `module`, never the rail's `?? 'worship'` area default. **One** path
   changes behaviour: `/collection`. `/dashboard` is newly resolved by the shared rule as well but comes out
   switch-free — and that is where **my own regression, caught in the running app**, was: my first version
   inherited that rail default, which put the shared Today screen behind the Services switch and denied it to
   an usher. Fixed, then re-proven open with Services off.
   **Proven live as the Usher at a true 390px:** sign in → usher mode opens by itself (toggle reads "Full app",
   `chms.usherMode=1`); Offerings off + typed `/collection` → "Area switched off — Offerings is switched off
   for Demo Church…"; `/dashboard` and `/checkin` both still open with Services off; toggle off → office nav,
   on → rail; Offerings back on → `/collection` opens with its 6 programs. At the API
   `/finance/collection-service` → 200 with Money on and **403** with the section wording with Money off —
   which is what made a service picker look empty mid-check, not my resolver. `/children/services` answers
   200 either way, so the door picker stays independent of Money as Batch 11 intended. Resolver coverage:
   21 area paths + 6 rail paths — the 4 rail links that also live in the areas resolve unchanged, and of the
   2 rail-only paths 1 changes behaviour (`/collection`) and 1 stays open (`/dashboard`).
   176/176 API, 132/132 shared, api + web typechecks, lint, `check:secrets` clean.
   **Not proven:** `apps/web` has no test runner, so `canEnterUsherMode` / `isDoorOnly` / `itemForPath` carry
   no unit test — the proof above is the running app. **Next:** point 6 (`CARE_ROLES` at `lib/access.ts`) and
   my decision on point 7.

0j. **Session AC — Batch 15, point 6: Care is opened by the permission, not by a copied role list.** The
   ask was "add ELDER and FOLLOWUP_TEAM to `CARE_ROLES`". Before editing it I swept all **10 roles** against
   all **four** surfaces that gate Care (route rule, office nav, door rail, dashboard card) and got **8
   mismatches**: `SUPER_ADMIN` and `PASTOR` hold `care:read` and were locked out exactly the way the elders
   were. Widening the list would have fixed the instance and left the rule intact, so the list went away:
   `CARE_ROLES`, `isCareRole()`, `NavItem.roles`, `AccessRule.roles` and the `roles` arguments through
   `mayOpen()` / `canAccessPath()` / `visibleNavGroups()` / `visibleUsherNav()` are deleted — Care was their
   only user — and `care:read` is now the single rule, which is what
   `apps/api/src/ministry/care.module.ts:344-413` has always enforced. The Sunday School teacher stays inside
   their own class because that scope lives in `apps/api/src/common/class-scope.ts:19`, not in the nav.
   Re-sweep: **40/40 checks agree with `care:read`, 0 mismatches**; the four care roles open it, the four
   others (leader, secretary, treasurer, member) still do not.
   **Proven live:** the Elder and the platform admin both open `/care` (chips "Elder · Whole church"; the
   visit list renders real rows), the teacher still reads "Sunday school · My class", and a typed `/care` as
   the Secretary says "Not available for your role — Care needs a permission your role does not have." At
   **390×844** as the Elder: 0 clipped elements, no horizontal scroll. The shared hint and its hand-mirror in
   `apps/web/src/lib/access.ts` were both repainted to name elders and the follow-up team. New test in
   `packages/shared/src/permissions.test.ts` pins the six `care:read` holders.
   **A mistake I made, and repaired:** to verify the follow-up team I granted that demo account the role with
   a join on `Role.key` — and `Role` is per church, so the insert wrote **451 rows over 451 churches**. I
   deleted the 450 foreign rows, kept the one demo row for the check, revoked it afterwards, and counted the
   table: **0** stray `FOLLOWUP_TEAM` rows outside `demo`. The Elder account is back to `["ELDER"]` and the
   demo church's Care section is back **off**, as this session found it. `176/176` API, `133/133` shared,
   api + web typechecks, lint and `check:secrets` clean.
   **Next:** point 7, my decision — separate `demographics:write` / `branches:write` from `members:write`.

0k. **Session AC — Batch 16, point 7 (my decision): two jobs stop borrowing the member record.** The audit
   found `POST /demographics/promotions/run` (`demographics.controller.ts:72`) and both transfer routes
   (`branches.module.ts:191,197`) answering to `members:write` — the right to edit one person — while each of
   them moves many people. I split them: `demographics:write` and `branches:write` added to the shared table
   and granted to `LEADER` + `SECRETARY`, with `PASTOR` inheriting from `[...PERMISSIONS]` and this office from
   the wildcard, so **the holder set is the same four roles that already held `members:write`** and no church
   lost or gained a worker. No migration: `auth.service.ts:96` derives permissions from that table per request,
   not from the stored `Role.permissions` rows.
   **Point 6's lesson applied on the way in:** the transfer form sits on `/org`, whose rule
   (`church:write`/`settings:write`) admitted only the office and the pastor — so the leader and secretary who
   could post a transfer had no screen to post it from. `branches:write` is now in that rule and its nav
   mirror, the add-a-branch form is hidden without `settings:write`, and *Update age groups* on Members is
   offered only to `demographics:write` (it used to 403 on the elder, usher and treasurer screens).
   **Numbers:** 8 live logins × 3 API probes = **24 outcomes**, all identical to before the split (holders 201
   on the `apply:false` preview and 400 past the gate on a bogus id; the other four 403). **64 web-rule checks
   over the same 8 sessions against the table at `daabf40`: 5 changes, all intended** — `/org` closed→open for
   Secretary and Leader, the promotions button shown→hidden for Treasurer, Usher and Elder; `/members`,
   `/branches`, `/care`, `/groups`, `/roster`, `/collection` unchanged. Live at desktop and **390×844**: 0
   clipped controls, no horizontal overflow. New API spec
   `apps/api/src/demographics/demographics.permissions.spec.ts` pins the three new decorators, the routes that
   deliberately did *not* move (`settings:write`, `giving:write`, and `POST /push/subscribe` on `members:read`
   because it saves a device token rather than editing a member), and the six member-editing routes.
   **134/134 shared, 180 API tests over 21 files, api + web typechecks, lint, `check:secrets` clean** — with
   one honest caveat: `test/integration.spec.ts` blows its 5s timeout for the two church-creating tests when
   the suite runs in parallel, and it does so **with my new file removed too** (174/176 over 20 files), passing
   11/11 alone. Pre-existing contention against the local Postgres, not this batch.
   **Not proven:** the transfer *approval* half has no screen and no GET behind one, so nothing in the UI calls
   it. **Next:** round 5 is finished (points 1–7). Five commits sit unpushed and I will ask before pushing,
   because it auto-deploys Render and Vercel. The standing leftovers are Batches 3–6 (#57–#60).

0l. **Session AD — Batch 17, the three things Batch 16 left behind.** All three were the follow-ups I had
   reported rather than fixed: the bulk job had no section switch, the approval step had no screen, and the
   Members header still offered two controls that 403 on click.
   1. **`POST /demographics/promotions/run` now carries `@ForModule('people')`**
      (`demographics.controller.ts:78`) — the job lives on the Members screen, so switching *Members & visitors*
      off closes the route too. Handler-level metadata wins over the controller's under
      `getAllAndOverride` (`guards.ts:174-209`), so the five bracket/settings reads stay open: the office and
      the children's desk both need them with Members off. **Proven live:** with the demo switch off the
      Secretary's run is `403` while `brackets`/`counts`/the new transfers list stay `200`; switch back on,
      `201`; the church's stored flags came back byte-identical to how they were found.
   2. **The approval step has a screen.** New `BranchesService.listTransfers` (`branches.module.ts:68-112`) and
      `GET /branches/transfers` on `branches:write`. `MemberTransfer` has no Prisma relations, so the member,
      both branches and the two workers are stitched in one lookup each — the remittance-report pattern, not
      an `include`. On `/org` the *Transfer member* card gains **Waiting for approval (n)** with Approve and
      Decline per row, naming the member, the number, both branches and who asked. **Proven live end to end:**
      the row rendered "Gideon Oppong (MEM-0045) HQ Accra → Tema Congregation · asked by Secretary"; the
      Approve click emptied the list, wrote `APPROVED` with the approver named, and moved that member's
      `branchId` for real; a second row declined the same way read "the member stays where they are". The Elder
      gets `403` on the list and the row set is empty for the other three non-holders.
   3. **Members offers only what the session can actually do.** The header reads the session permissions once
      (`members/page.tsx:113`) and gates *Update age groups* on `demographics:write`, *Import list* on
      `members:import` and *+ Add member* on `members:write`; the per-row stage `select` is a plain word when
      the session lacks `members:write`. **Proven live:** the Elder sees 0 header buttons, 0 row selects and
      the stage as text; the Secretary sees all three buttons and 48 selects.
   **One gap I did not close, and it is a real one:** `approveTransfer` (`branches.module.ts:51-66`) still lets
   the worker who *asked* for a transfer approve it — proven live (the Secretary asked and approved, `201
   APPROVED`), so the card's promise of approval "by another leader" is not enforced. It belongs with the
   branch hardening in Batch 5 (#60), not here.
   **Numbers:** `186/186` API over 22 files (5 new transfer tests + the promotion-run ones), `134/134` shared, api
   + web typechecks, lint, `check:secrets` clean. Earlier in the batch `test/integration.spec.ts` timed 2 of its
   tests out in the parallel run and passed 11/11 alone — the same pre-existing contention as Batch 16, and the
   final run was 186/186 with nothing removed. **What the phone pass could not
   do:** the chrome-devtools MCP that carried `emulate` disconnected mid-session, so 390×844 was not
   re-measured. The in-app browser was 510 CSS px wide on its own, which is already past the mobile
   breakpoints: 0 clipped controls on `/org` and `/members`, and the only element wider than the viewport is
   the branch table inside its own scroll wrapper. **Demo church left as found** — 0 branches, 0 transfers, 0
   members with a branch, `people` switch on; the audit rows my tests wrote stay, because that ledger is
   append-only. **Next:** Batches 3–6 (#57–#60) and pushing this batch, which auto-deploys Render and Vercel.

0m. **Session AE — the branded-PDF batch (#70–#75): everything shareable now leaves the app as one branded PDF,
   and the PDFs say who stood behind the money.** The owner's brief was "all shareables in neatly branded PDFs,
   no JSON unless very necessary", plus "add the person who signed off or initiated payments and the names of
   people who donated". Both are done in code and both were exercised in the running app.
   1. **The writer takes any JPEG, not only the logo** (`pdf.ts`). An `{ kind:'image', jpeg, maxSide, caption }`
      block now sits beside `heading`/`table`/`fields`, gets its own `/DCTDecode` XObject once however many pages
      use it, and the object numbering moved so pages follow the images (`firstPageObject = 6 + imageObjects.length`).
      **Proven at the byte level:** every xref offset lands on its own `n 0 obj` and every `/Length` equals the bytes
      actually between `stream` and `endstream`.
   2. **Nine documents in the staff app, two in the member portal:** expenses month summary, the finance board
      report, the branch remittance report, the roster sheet, the check-in attendance sheet, the member directory,
      one member's Act 843 personal-data copy, the join card (with its QR square printed) and the campaigns/pledges
      board sheet. The JSON downloads stay where a machine has to read them, with a PDF beside them.
   3. **Names, not UUIDs.** `expenses/summary` returns `startedByName`/`approvedByName` per payment and a
      `signOffBy` list for the header (`expenses.module.ts`); `/finance/analytics` groups gifts by giver with
      `COALESCE(member name, giverName)` and reports private gifts as a total only, never a name
      (`finance.service.ts`); remittances, roster shifts and pledges each resolve their people in one lookup.
      `campaignRaisedWhere` still bounds a campaign by its own dates.
   **Numbers:** `192/192` API over 23 files (17 of them new name tests in 5 files), `134/134` shared, api + web
   typechecks, lint and `check:secrets` clean. In the running app **9 of 9 pressed PDF buttons produced a file,
   0 byte-level problems over 9 documents** — expenses (1p, 7 objects, `Signed off by: Pastor`, `Secretary`/`Pastor`
   in every payment row), finance (3p, 11 objects, named givers + "no gift was marked private"), members directory
   (2p, 48 members with names, numbers and phones), personal data for `DEMO-0109`, campaigns board sheet (pledges
   read "Akua Danso MEM-0026 · GHS 7500 · Once"), join card (1 embedded QR image, church code `TML3ED5P`), roster,
   attendance and remittance sheets (headers and fallbacks correct). Screenshots: the expenses PDF rendered in
   Chrome at `1000×760` and `/expenses` at `390×844` with 0 viewport overflow.
   **What I could not prove, and why:** the two portal PDFs (annual statement, my-data) need a member SMS code and
   the mock gateway hashes it, so they were read in code only. `/roster`, `/checkin` and `/branches` have **0 rows**
   in the demo church, so those three sheets printed their headers and their "Nothing to show." line but no real
   names — the name lookups behind them are covered by the new API tests, not by the browser. On desktop Chrome
   `navigator.canShare({files})` is true, so a PDF button opens the Windows share flyout and the button sits at
   "Preparing…" until it is dismissed; the phone path (share to WhatsApp, or downloads) is what the fallback text
   describes and was not exercised here.
   **Demo church left as found** — `worship`, `roster` and `special_offerings` were switched on for the pass and
   restored to `false` afterwards, byte-identical to the flags read before the batch. **Next:** commit + push
   (auto-deploys Render and Vercel), then migrations 12/13 on Neon, then Batches 3–6 (#57–#60).
0n. **Session AF — Batch 3 done, plus the Terms/Privacy pages and a self-service erasure right.**
   1. **One cedi format everywhere** — `format.ts` gains `ghs()` (`GH₵ 1,234.00`, thousands separators, negative
      aware); 65 call sites / 16 screens now use it, and `format.test.ts` pins it. A sweep of the old `GHS`/₵
      labels left 13 double-encoded `â‚µ` byte sequences (11 files) — repaired at the byte level. `pdf.ts`
      transliterates `GH₵ → GHS` so the WinAnsi PDF stays valid.
   2. **Permission 403s speak plain English** — `permissions.ts` adds `permissionLabel()` (a whole-catalogue
      job-name map); `guards.ts` throws `ForbiddenException` naming the job for both the all-required and
      any-of cases. Coverage test asserts **no** permission renders as its own key. Proven live: Elder gets
      `"Your role is not allowed to update age groups."` and `"…move a member between branches."`.
   3. **Legible accent** — `--accent-ink: color-mix(in srgb, var(--accent) 50%, var(--ink))` (one declaration,
      resolves per theme). Measured live on the public home eyebrow: **2.65:1 → 6.23:1** (warm theme), and the
      gold legend bullet uses it.
   4. **Terms of Use + Privacy Policy** — public `/terms` and `/privacy` (server components), shared
      `legal-meta.ts` (operator/contact/date), footer links + sign-up consent. Grounded in the real schema.
   5. **Self-service erasure** — `DELETE /auth/me` → `auth.service.eraseMe()` anonymises the person (names,
      contacts, photo, DOB, QR), deletes care notes + prayer requests, opts the old number out first, keeps
      financial **amounts** with the giver name cleared, revokes sessions, deactivates the login, and writes an
      audit entry with **no** before/after payload. Buttons in the member portal and the staff About page.
      `auth.erase.spec.ts` (5 tests) pins all of it. Erasure is a right, not a switch.
   **Gates:** shared 136/136, API 208/208 (28 files, incl. the new erase spec), web 3/3, both typechecks, eslint
   clean, `check:secrets` clean. **Maintenance rule** is now in repo `AGENTS.md`, the global skill
   `app-legal-docs`, and project memory — any data-handling change updates the two pages and bumps
   `LEGAL_UPDATED` in the same commit.
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


