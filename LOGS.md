# LOGS — running build journal (append-only)

Format: one entry per working session / major change. Requests from the
product owner are logged here AND tracked as checkboxes in `BUILD_ORDER.md`.

---

## 2026-10-21 — Session A (overnight build, saved 00:50 / shutdown armed 04:30)

**Built:** Phase 0 foundations + Phase 1 core (full). Monorepo, Prisma schema
migration + extras.sql (FORCE RLS, hash-chained audit), withTenant, auth
(password+OTP, refresh rotation), RBAC default-deny + boot check, members + CSV
import, services + worker materialisation, offline-first headcount outbox,
check-in, visitors, Paystack giving (HMAC webhook, CAS settle, mock mode),
finance two-counter batches, single SMS dispatcher + campaigns + opt-out,
worker reconciler, full PWA screens, mock give→settle→receipt loop.
**Verified:** shared 55/55 tests, api 19 unit tests, lint clean, API smoke boot
passes boot-check, Next build ✓.
**Note:** no Docker in this session → live-DB integration tests still pending
(`npm run db:verify` created later).

## 2026-10-21 — Session B (00:50 → ~01:45, shutdown armed for 04:30)

**Saved state:** STATE.md written; `npm run check:secrets` added (token never
in files); fixed age.ts Date.UTC bug (55/55 green).

**Built since Session A save point:**
- Demographics: `AgeBracket` model + migration; members/visitors use DOB with
  real-time age resolution; bracket CRUD + headcount-section sync (gender
  split → KEY_M/_W); toggles (autoAssignHeadcount, autoPromote); filter chips;
  "Run Age Promotion Check" + celebration modal; nightly auto-promote job.
- Check-in auto-sort with "counted in <section>" feedback; dashboard
  demographics bar.
- Provider-agnostic SMS gateway (mock / cSMS preset / custom HTTP: URL + auth
  header + JSON body template) stored in PlatformSetting, worker hot-reload 60s.
- Usher Mode (ONE-app decision): role-scoped simplified shell, auto-on for
  usher-only accounts.
- Phase 2 API modules (all boot-checked): groups/meetings, roster, branches +
  transfers, households, pledges/campaigns, expenses, care (prayer, encrypted
  counseling/welfare), events/RSVP, announcements, media + songs (CCLI flag),
  children dual-ticket check-in, drip engine worker (quiet hours, stop on
  reply), member portal (OTP → my giving + statement).
- Phase 3: SSE live headcount + projection screen, giving analytics, churn
  list, WhatsApp template registry, public visitor form (rate-limited),
  flyer links.
- Verification: all packages typecheck, lint clean, secrets clean, API boots
  with boot-check green across every route, Next build ✓ (17/17 pages).

## 2026-10-21 — Session C (admin UIs + Phase 2.5; this entry)

**Owner requests this session:**
1. "add remaining tasks to blueprint and finish working on them" → R0–R3
   sections added to BUILD_ORDER.md and built (see below).
2. "different variations of the bible in english + ghana local languages" →
   R2.1/R2.2 added to blueprint; multi-translation architecture built.
3. "be adding requests to the blueprint and keep logs" → this file created;
   future requests land in BUILD_ORDER REMAINING TASKS + a LOGS entry.

**Built:**
- Blueprint: BUILD_ORDER "REMAINING TASKS" R0–R3 (ops gates, admin UIs,
  Bible/worship, deferred-tail wiring) with live checkbox status.
- `npm run db:verify` (scripts/verify-stack.mjs): one command → migrate deploy
  + extras + roles + seed + integration tests (R0 gate, needs Docker).
- Admin UI screens (R1 complete): /groups, /roster, /events, /campaigns,
  /expenses, /care, /children, /org, /announcements, /drip (workflow builder
  with steps + publish), media page extended with **songs (CCLI-gated lyrics)
  + setlists** (worship companion); full nav added.
- Follow-up admin API (`/followup/workflows` list/create/publish) + setlists
  API + push subscribe/unsubscribe endpoints (VAPID send still gated).
- Turnstile verification on public visitor form (auto-on when
  TURNSTILE_SECRET_KEY set).
- **Bible Phase 2.5:** `npm run bible:fetch` bundled KJV (66 books,
  public-domain, gitignored) — verified download; Bible API rewritten
  **multi-translation** (scans `apps/api/data/bible/*.json`; `?translation=`
  on chapter/verse/search; licence metadata returned per translation);
  /bible web page with translation picker + click-to-copy verses.
- Blueprint R2.1: Ghana local-language plan — Twi (Mater Dei), Fante, Ewe, Ga,
  Nzema, Dagbani via Bible Society of Ghana / Digital Bible Library licences;
  drop-in file convention = zero code changes when licensed files arrive.

**Verification status:** ✅ api typecheck OK · web typecheck OK · lint clean ·
secrets clean · `node --check` both scripts pass · KJV 66/66 books bundled.
Pending (needs Docker): `npm run db:verify`.

## 2026-10-21 — Session D (post-shutdown-removal continuation)

**Owner requests this session:** "continue" (down the blueprint), plus earlier
standing rules: add requests to blueprint + keep logs.

**Built:**
- Blueprint housekeeping: all R1 admin-UI checkboxes marked [x].
- **R2.2 ASV (1901)** bundled: 66/66 books → `apps/api/data/bible/asv.json`
  (source verified: scrollmapper/bible_databases, MIT repo, per-translation
  8.4MB JSON, shape auto-detected + normalized by fetch-bible.mjs).
  WEB attempted under WEB/WBT/WBS codes — all 404 → left as a verified-source
  item in the blueprint (no guessing).
- Fetch script hardened: parallel pool (8) + 3-attempt retries with backoff +
  timeouts (fixed a transient socket crash on the 66-book phase).
- **Verse-of-the-day SMS (R2 final item):**
  - worker `verse-of-day.ts`: daily 05:55, resolves the configured verse from
    the bundled translation, caps at ~3 SMS segments, opt-out respected
    (source ANNOUNCEMENT), per-member-per-day idempotency
    (`vod:{church}:{yyyymmdd}:{memberId}`), wallet-reserve via same contract.
  - API: `GET/POST /churches/me/devotional` (settings:write, audit-logged).
  - Web: "Verse of the day (SMS)" card on Settings (toggle + translation +
    reference).
- ESLint scripts globals extended (AbortSignal/setTimeout/fetch).

**Verification:** api OK · worker OK · web OK · LINT CLEAN · secrets CLEAN.
Bible bundles on disk: kjv.json (66) + asv.json (66). Pending: db:verify (Docker).

## 2026-10-21 — Session E (context-hardening + companion + WEB)

**Owner requests this session:**
1. "remove shutdown task" → done (ChMS-Shutdown-0430 deleted; no bare shutdown pending).
2. "continue" → kept building down the blueprint.
3. "from now on log everything, include all info about the app with milestones, currently working on,
   what's left, as context for a new session" → **STATE.md rewritten as the master self-contained
   session-context document** (§1–§10 incl. mandatory handoff protocol). LOGS.md remains the
   append-only history; BUILD_ORDER.md the task ledger.

**Built:**
- **Member companion expansion** (answers the earlier "members need their own section" ask):
  - API portal: GET home (services+announcements+links), GET shifts (roster+service info), GET events,
    POST events/:id/rsvp (capacity→WAITLIST), POST prayer (moderated wall), POST shifts/:id/respond
    (portal token — members cannot hit staff endpoints).
  - Web /portal: tabbed companion UI — Home, My giving (+statement/print), My shifts (YES/NO),
    Events (RSVP), Prayer (anonymous option). Login unchanged (OTP to registered member phone).
- **WEB translation assembly**: scripts/fetch-web.mjs (bible-api.com, public-domain WEB text, 1189 chapters,
  pool of 8, retries, shape-normalized to bundle). First run failed 100% (%20 vs + URL bug) — fixed and
  relaunched detached (check web-bible.log; on success apps/api/data/bible/web.json is auto-served).
- Validation: api OK · web OK (after HomeData.links fix) · lint CLEAN · secrets CLEAN.

**In-flight for next session (§6 of STATE.md):** WEB fetch result; overcapacity+haptic; Next re-build;
roles/giving explainer owed in chat.

## 2026-10-21 — Session F (overcapacity + build verification)

**Owner request:** "continue".

**Built:**
- **Overcapacity alerts + haptic** (features-doc spec): auditorium `capacity` added to DemographicSettings
  (API settings DTO + Settings card input); headcount screen shows 🟡 85% / 🔴 95% banners with
  "open overflow areas" prompt, and `navigator.vibrate` patterns on every tap (light tick; strong pulse
  at 85%; double-pulse at 95%). Capacity 0 = disabled.
- Fixed portal `home()` destructuring bug (object not array) and unused `useEffect` import (caught by
  Next's own lint during build).

**Verification (full sweep):** api OK · web OK · **Next production build ✓ 28/28 pages** (up from 17 —
all new admin UI + companion + bible pages included) · LINT CLEAN · secrets CLEAN.
WEB bible: confirmed failed this session (recorded in E + blueprint) — needs a reachable PD source.


---

## 2026-10-21 — Session G (R4 Ghana pack + church customisation)

**Owner requests:** (1) "allow customizations of typical church specific items like ghana typical
funds, church name and logo any others that needs that" (2) "ok" ×6 — continue R4 per BUILD_ORDER.

**Built — church customisation layer:**
- **Church profile API** `GET/POST /churches/me/profile` (settings:write, audited): name, pastor,
  SMS sender ID, **logo** (data-URL ≤300KB guard), **primary colour** (live `--brand` CSS var),
  tagline, contact (phone/email/address/social), **giving instructions** (MoMo merchant/number/USSD
  + bank), care-alert settings, SMS locales, denomination, retention fields.
  `GET /churches/:slug` (public) now returns branding + givingInstructions + contact.
- **Settings page** gained cards: Church profile & branding (logo upload, colour picker), Giving
  instructions, Retention policy (Act 843 fields), Missing-member alerts, Funds manager
  (rename/type/activate/add), Online-giving fee model, SMS templates & locales editor, Denomination preset.
- Branding surfaces: staff topbar (logo+colour via /auth/me), portal home header, public
  `/give/[slug]` (logo, tagline, colour, **"Other ways to give"** MoMo/bank block), portal home
  **"Ways to give"** card from settings.givingInstructions.

**Built — R4 pack (all 12 items):**
- **R4.1 missing-member alerts**: worker `missing-member-scan` (nightly 03:10 UTC=Accra) — active
  members with NO attendance in last N Sundays (default 3, `settings.care.missingSundays`) who
  attended before → open `CareTask(MISSING_MEMBER)` (idempotent) + one SMS digest/day to
  `settings.care.digestPhones`. CareTask got `memberId`; Care page got the care queue UI.
- **R4.2** `MOBILE_MONEY` channel on batch entries (ref required) + giving-instructions on /give + portal.
- **R4.3 SMS locales**: `shared/src/sms-locales.ts` (en/tw/ga/ewe/fante; keys receipt, nudge, otp,
  portalOtp, devotional, **funeral**) — `localizedSmsBody()` = locale → en → builtin; wired at ALL
  send sites (giving-settle receipt+nudge, staff OTP, portal OTP, verse-of-day); admin editor.
- **R4.4** FundType +FIRST_FRUIT/THANKSGIVING/HARVEST/ANNIVERSARY (Prisma+shared+seed → 8 defaults);
  Funds manager UI (add custom e.g. Church Anniversary).
- **R4.5 remittances**: `Remittance` model (+`Branch.region` + relation), submit (idempotent by
  ref) → **approve → remit** 2-step → per-branch/region report; **new Branches page** in nav:
  report, submit form, approval queue, directory with region.
- **R4.6** Announcement `category` (GENERAL/FUNERAL/OUTDOORING/EVENT/ALERT) end-to-end (DTO,
  create, filter chips, badge); welfare already had FUNERAL; funeral SMS template key; family
  fundraising = existing campaigns.
- **R4.7** RoleKey +ELDER/+SECRETARY + ROLE_PERMISSIONS presets (elder: care+sms+visitors;
  secretary: members+services+campaigns+reports) + DEFAULT_ROLES seed. NOTE: no staff-user admin
  screen exists yet (pre-existing gap) — roles surface wherever ROLE_KEYS drives UI next.
- **R4.8** Member milestones (salvation/baptism/marriage/ordination) + `PastoralAction` model;
  API `POST /members/:id/milestones`, `GET/POST /members/meta/pastoral`.
- **R4.9** Care queue `GET/POST /tasks`, `POST /tasks/:id` (VISIT_HOSPITAL/BEREAVEMENT/HOME,
  FUNERAL_SUPPORT; OPEN→IN_PROGRESS→DONE) + Care page card (start/done + quick-create).
- **R4.10** `shared/src/denominations.ts` 5 presets; Settings applies → settings.terminology;
  `GET /churches/me/terminology` (church:read); Branches page headings use the unit term.
- **R4.11 Act 843**: consent = OptEvent + smsConsentAt + hash-chained audits; **data-access**
  `GET /members/:id/export` + row⤓ button; **export-my-data** `GET /portal/export` + "Download my
  data" button; **retention fields** stored in settings (policy only).
- **R4.12** `Member.discipleshipStage` (VISITOR→NEW_BELIEVER→MEMBER→WORKER→LEADER); `POST
  /members/:id/stage`, `GET /members/meta/stages`; Members page pathway badges + per-row stage select.

**Fixes:** `shared/uuid.ts` → `globalThis.crypto.getRandomValues` (isomorphic; webpack cannot parse
`node:crypto` once web imports @chms/shared); removed eslint-disable comments for rules absent from
the flat config; `GET members/pastoral` → `meta/pastoral` (was shadowed by `GET :id`); remittance
`include` needed a real relation (schema updated, `migrations/0_init` regenerated → 46.7KB).

**Verification (full sweep):** shared **55/55** · api **19 passed / 7 CI-skipped** · typecheck
shared+db+api+worker+web OK · lint CLEAN · check:secrets CLEAN · prisma generate + 0_init
regenerated · **Next production build ✓ 29/29 pages** (new /branches page).
Still NOT run (no Docker): `npm run db:verify` (migrations/RLS/7 integration tests).
Delivered in chat: **Paystack & Ghana requirements guide** (sandbox keys, webhook URL, Paystack
account model, cSMS token steps, Bible licences).

---

## 2026-10-21 — Session H (Twi Bible extraction from APK)

**Owner requests:** "if i send a twi bible apk into desktop can u extract the twi bible" →
"check download folder and start the twi, i am downloading others" (Fante/Ewe/Ga APKs expected).

**Built:**
- **`scripts/extract-apk-bible.mjs`** — generic APK→Bible-bundle extractor (zero npm deps), reusable
  for every language APK: PowerShell unzip of `assets/*.txt` → BOM-aware UTF-16LE/BE/UTF-8 reading →
  parser for both observed HTML styles (`<p>/<strong><em>N` mobobi style + Apple-export spans) →
  legacy-font decode `q→ɔ Q→Ɔ x→ɛ X→Ɛ` (`--no-decode` to disable) → chapter-header handling (bare
  headers outside `<p>`, CRLF endings, unclosed `<p>` tags, empty-`<strong>` suffixes) → `X-X-X`
  divider skip → mixed-file salvage (slices English junk prepended before the real book) →
  English-content guard (word-based; short books aren't false-flagged) → structural book ID against
  KJV verse-count signatures with filename token/roman-numeral/bigram tie-breaks → typo-aware verse
  gaps (isolated jump=clamp e.g. Isa 52:15 written "25"; sequential continuation=pad e.g. Gen 31
  skips 49–52) → source-omitted verses render as "…" → tolerant match fallback (chapter counts equal
  + ≥90% verse agreement, or totals within 2) → full validation report + spot checks.
- **`apps/api/data/bible/twi.json`** — **66/66 books, 31,094 verses**, `translation:"TWI"`,
  `languageCode:"tw"`, `publicDomain:false`, honest `license` field (translation identity unverified).
  Auto-listed by `/bible` (loader scans the dir — zero wiring); verse-of-day Settings gained a Twi
  option. 8 books on tolerant match (91–98% per-chapter agreement — source numbering quirks);
  121 source-merged verses shown as "…".

**APK data bugs found (and handled):** Filemon.txt had English Genesis prepended before real Twi
Philemon (salvaged); Isaiah 52:15 numbered "25"; a Psalm title numbered "53"; Genesis 31 omits
markers 49–52; 3 John numbered 15 vs KJV 14.

**Verification:** extractor exit 0 · loader simulation (load/findBook/chapter/verse/search incl.
John 3:16, Ps 23:1, 3 Jn 1:15, Song of Solomon) all pass · lint CLEAN · web typecheck OK ·
secrets CLEAN. Temp files cleaned; bundle gitignored with the other bundles (data/bible/*.json).

**Next:** owner drops Fante/Ewe/Ga APKs → same script (`node scripts/extract-apk-bible.mjs <apk>
<code> <Language>`); per-language font maps may need tweaks (Ewe ƒ/ɖ). Owner to confirm Twi
translation rights before public hosting (bundle.license already flags it).

---


## 2026-10-21 — Session I (other-language Bibles: Ga, Fante, Akuapem-Twi)

**Owner request:** "DO FOR THE OTHER LANGUAGES IN DOWNLOAD FOLDER" (Ga/Fante/Akuapem-Twi XAPKs).

**Built — three more bundles, all 66/66 books, all 1,189 chapters:**
- `ga.json` — Ga Bible XAPK (com.mobobi.gabible), 31,090 verses → `extract-apk-bible.mjs --mobobi`
- `fante.json` — Fante Bible XAPK (com.mobobi.bibleoffline), 31,051 verses → `--mobobi`
- `twi-asante.json` — Akuapem Twi XAPK (christappzz), **31,102 verses (exact KJV count)** →
  `extract-akuapem-sqlite.py` + `normalize-bible-bundle.mjs`

**The hard part — mobobi's encryption REVERSED from the dex** (Ga/Fante assets = base64+AES):
`dexdump -d classes2.dex` → `T2.G` (AES/CBC + IV builder) → `PreferencesMenu.j` = scripture
decryptor → key = `SHA-256(PreferencesMenu.c())` where `c() = FontStyle.a() =
(FontMenu.o+p+q).replace(o,"")` = **`nv93h50sk1zh508v`**, IV = **16 zero bytes** (the
`fill-array-data` literal read straight from the dex), input = base64 — wrapped in **3 layers** of
(base64→AES). Shipped as `--mobobi`; the script also now auto-enters **XAPK** wrappers (extracts
the inner base.apk).

**Parser hardening (all languages benefit):** plain-line verse mode with indented `N. text`
conversion · forward-JUMP rule (skipped header = source-omitted chapters → ellipsis placeholder;
Fante Jeremiah is missing 21:15–22 + all of ch22) · deferred-`1.` rule (duplicate/mislabeled
verse-1 merges in-chapter — Twi 2 Kgs 18, Ga Rom 15:2 — never a fake chapter break) · multiword +
accented (`À–ɛ`) + leading-digit headers with file-stem fallback and CP1252-mojibake stem repair ·
English-word guard (short books no longer false-flagged).

**Akuapem-Twi:** Room SQLite (`assets/book_database`; verse text in `chapterOfVerseData.titleOfVerse`
with prefixed numbers; `twi_bible` = "TWI BIBLE ASANTE VERSION"). Python converter handles
continuation rows (4,635 appended), captions, numbering typos; `normalize-bible-bundle.mjs` maps
Twi book names (Nnwom→Psalms, Adiyisɛm→Revelation…) structurally against KJV.

**Verification:** all six bundles load via the BibleService algorithm (load/findBook/chapter/verse/
search) · Gen1:1/Ps23:1/Jn3:16 spot-checked per language · Twi re-run after final parser changes
still 66/66 · Fante re-run direct from `.xapk` 66/66 · lint CLEAN · secrets CLEAN · scratch
removed (.xapk incl. the 141MB dexdump, tmp dirs, logs).
**Licences:** all new bundles `publicDomain:false` + honest `license` (identity unverified) — owner
confirms redistribution rights before public hosting.
**Next:** Ewe/Nzema/Dagbani/Dangme APKs → same scripts (Ewe: check ƒ/ɖ font map).

---

## 2026-10-22 — Session J (Ewe Bible + /bible bug-fixes)

**Owner request:** "ITS IN DOWNLOAD FOLDER EWE" → `com.eweghana.bible_1.0.22.xapk` (17.9 MB, completed
01:30 after an earlier stalled `.crdownload` probe).

**Built:**
- **`ewe.json` — 66/66 books, 1,189 chapters, 31,137 verses**, auto-listed by `/bible` (now 7
  translations: kjv, asv, twi, twi-asante, ga, fante, ewe). Same christappzz-style architecture as
  Akuapem Twi: XAPK → inner APK → Room DB `assets/book_database`, translation key **`Ewe_(Ghana)`**.
  Pipeline: `extract-akuapem-sqlite.py` → raw → `normalize-bible-bundle.mjs --translation EWE …`
  (KJV structural names; Deuteronomy via 75%-floor rule). Text verified: Gen1:1 "Le gɔmedzedzea me,
  Mawu wɔ dzifo kple anyigba." · Ps23 · Jn3:16 (Mawu/God, Yehowa/Jehovah); ƒ/ɖ/ɔ/ɛ intact (SQLite
  stores unicode — no font-map needed). Note: Deuteronomy/1 Tim/1 Sam source rows arrive OUT OF
  ORDER (e.g. 1 Tim 5 stores vv16–25 before vv1–15) and some numbered rows have empty text.
- **`extract-akuapem-sqlite.py` hardened** (benefits Twi-Asante too): two-phase row processing —
  Phase A classifies (numbered/unnumbered), Phase B places with the JS extractor's lookahead clamp
  (isolated gap>3 = typo, but never clamp when the next marker continues n+1) + numbered-empty rows
  claim their slot so split-row text lands on the right verse. Akuapem rerun still exact
  (31,102). **`normalize-bible-bundle.mjs`**: tolerant floor 90%→75% chapter agreement (an
  equal-chapter book with ≥75% matching per-chapter counts is effectively uniquely identifiable).

**Fixed (found during validation):**
- **`BibleService.DATA_DIR` off-by-one** — `resolve(__dirname, '../../../data/bible')` escaped to
  `apps/data/bible` (nonexistent) from BOTH `src/bible` and `dist/bible` layouts → `/bible` would
  404 "No Bible bundles" in dev and dist. Now `../../data/bible` (+ comment).
- **`index().defaultTranslation`** ignored `defaultCode()` (reported alphabetical `asv`); now uses
  the resolved code; `defaultCode()` explicitly prefers **kjv** (reader expectation) over
  first-alphabetical pd bundle.
- **Metadata**: `ewe` and `twi-asante` were written with `publicDomain:true` (normalize defaults) —
  corrected to `false` (licenses say rights unverified).

**Verification:** api typecheck ✓ · api build ✓ · full-tree eslint JSON report: 161 files, 0 errors,
0 warnings · check:secrets clean · **BibleService dist simulation ✓**: index lists 7 translations
with correct pd flags, default=kjv, KJV Jn3:16 by default-ref, Ewe Gen1 (31 v), Ewe search
"Mawu"/"Yehowa" hits, twi-asante Jn3:16 ✓. `.ewe` temp dir removed. (Note: `npm run lint` on this
box prints Node's MODULE_TYPELESS warning for eslint.config.js and the shell wrapper surfaces
exit 1 — the JSON report is the ground truth: clean.)

**Licences:** `ewe.json` `publicDomain:false` + honest license (com.eweghana.bible v1.0.22,
translation identity unverified) — owner confirms redistribution rights before public hosting.

**Next:** Nzema/Dagbani/Dangme APKs → same scripts. Remaining gates unchanged (Docker
`db:verify`, WEB source, smoke boot).

---

## 2026-10-22 — Session K (native PostgreSQL + **db:verify GATE PASSED 26/26**)

**Owner:** "DOCKER IS INSTALLED" → daemon absent mid-install → "couldn't install" → "any alternative
to docker". Answer: **db:verify only needs PostgreSQL** → went native.

**Postgres install (Docker-free):**
- EDB **PostgreSQL 16.11** windows installer (361,562,960 B) — downloaded in 4 byte-range chunks
  with mid-flight resume (server throttles ~0.3–1 MB/s; Windows' built-in **curl is 7.55.1** —
  `--retry-all-errors` doesn't exist there). Authenticode **Valid (EnterpriseDB)** before install.
- **Silent install trap**: `Start-Process -ArgumentList` does NOT quote array elements —
  `--prefix "C:\Program Files\PostgreSQL\16"` split at the space → installer exit 1 instantly
  (`Expected option but got "Files\PostgreSQL\16"`). Fix: space-free prefix → **`C:\PostgreSQL\16`**.
- Result: Windows service `postgresql-x64-16` (**Running, Automatic**), superuser postgres/postgres,
  DBs `chms` (dev) + `chms_test` (integration). Docker now optional (compose still offers redis).

**Gate wiring:** `.env` created (from .env.example + TEST_DATABASE_URL / DATABASE_URL_TEST /
PLATFORM_DATABASE_URL_TEST); `verify-stack.mjs` now `import 'dotenv/config'` (it read
`OWNER_DATABASE_URL` from bare env → would always exit); new **`scripts/reset-test-db.mjs`**
(drop/recreate + migrate + extras + roles) so integration tests get a fresh `chms_test` every run
(CI parity — tests hardcode ids like device `dev-1`, webhook `evt_*`); test step passes
app/platform `_TEST` URLs (and overrides inherited `OWNER_DATABASE_URL`, which otherwise pointed
create-roles at dev `chms` → missing grants → 42501).

**Bugs the gate caught (all fixed):**
1. **`withPlatform` ran on the app_user client** (tenant.ts) — cross-tenant writes (seed, church
   bootstrap, webhook settle, reconciler) were FORCE-RLS-blocked (42501). Now runs on
   `platformPrisma` (platform_user BYPASSRLS) — the documented ground rule made real.
2. **extras.sql not idempotent**: `branch_scope`/`counseling_access` policies + 5 `ADD CONSTRAINT`s
   unguarded (R4.5 additions) → guarded (DROP POLICY IF EXISTS + pg_constraint DO block).
3. **create-roles didn't heal passwords** — `platform_user` existed with a stale/invalid password
   (Prisma P1000). Now unconditional `ALTER ROLE … PASSWORD` (idempotent healing).
4. **headcount replay crash** — `catch(P2002) continue` without a savepoint poisons the PG tx
   (`25P02`): ANY offline outbox replay would have crashed in production. Now SAVEPOINT/RELEASE/
   ROLLBACK-TO per event + existence re-check (headcount.service.ts).
5. **SmsLedger append-only trigger vs `refId` backfill** — dispatcher + worker (drip/receipt/VOD)
   all `UPDATE` the ledger row to attach `refId` after insert; the hard trigger made **every first
   dispatch** fail (P0001). Trigger now permits ONLY null→id `refId` (all money/history columns
   compared unchanged) — append-only intent preserved.
6. **`handleInbound` didn't normalise sender phones** — outbound stores `normalizeGhPhone` results;
   inbound matched raw → `unknown_recipient` for `024…` input. Now normalises at entry (raw kept
   as fallback).
7. **Integration tests modernised**: roles 6→**8** (R4.7); segment keys `MEN/WOMEN` → real seeded
   bracket keys (queried); phone generator produced 11-char MSISDNs → 10-char (slice(-7));
   SMS wallet top-up (IT churches have none → NO_BALANCE); opt-out assertions use normalised phone.

**Verification (final):** `npm run db:verify` → **✅ 26/26** (19 unit + 7 integration), migrate
applied to `chms`+`chms_test`, extras (60 policies) idempotent twice-over, roles+passwords, seed
(demo church `01a161d4…`, 8 roles). Sweep: typecheck **api/worker/web/db all 0** · full-tree eslint
**162 files 0/0** · check:secrets **clean** · api build ✓. ~862 MB temp download junk removed;
repo temp dirs (.ewe, .akuapem-recheck) removed.

**Notes for next session:** `npm run lint` on this box always prints Node's MODULE_TYPELESS warning
for `eslint.config.js` — shell wrappers may surface exit 1; the JSON report
(`npx eslint . -o report.json --format json`) is ground truth (currently 0/0). Wrappers also kill
any command whose native child writes stderr — write long jobs detached to files.

**Remaining operator gates:** cSMS token (Settings→SMS gateway), Paystack sandbox keys, WEB PD
source, Bible translation-rights confirmation. Known gaps unchanged (roles admin screen,
member-detail milestone UI, smoke-boot re-run, worker tests, GitHub CI).

**Addendum 2 (later 22 Oct) — login fix + demo accounts:**
- **Login was fundamentally broken**: auth looked users up on the app_user client where FORCE
  RLS hides every row outside a church context → always "invalid credentials". `auth.service.ts`
  now uses `platformPrisma` for cross-tenant lookups (login/OTP/session load); `seed.ts` likewise
  (church was "not found" on every reseed). Verified live: password logins HTTP 200.
- **Wallet bootstrap bug**: `seedChurchDefaults` only topped up an EXISTING SmsWallet (nothing
  ever created one) → every church started NO_BALANCE → all SMS/OTP suppressed. Now upserts the
  row first, then grants the 500-unit welcome bundle (signup path shares this fix).
- **Demo accounts** (slug `demo`, password `admin1234`, created by
  `scripts/tmp-demo-accounts.js` — safe to re-run after a reseed): Pastor 0550449840
  (SUPER_ADMIN) · Secretary 0550449841 · Finance 0550449842 · Usher 0550449843 · Elder 0550449844
  · Teacher 0550449845 · Member 0550449846 (MEMBER + portal Member record). Verified: staff
  logins 200; portal OTP round-trip 202 → code queued → verify 200 (portal OTP codes sit in the
  queued SmsLog body until Redis/worker is available to "send" them.

**Addendum 3 (later 22 Oct) — demo data populated:**
- App had no data beyond seed defaults → generated realistic mock data via
  `scripts/tmp-demo-data.js` + `tmp-demo-data2.js` (deterministic, idempotent/rerun-safe,
  context handoff in `scripts/.demo-ctx.json`): **46 members** (bracket/milestone/stage mix),
  **10 services** (8 CLOSED Sundays + Wed study + next SUNDAY SCHEDULED), **292 attendance**
  (12 members lapsed 3 Sundays = missing-member worker material), **320 headcount** rows
  (per-segment + ONLINE), **4 groups**, **8 approved giving batches / 101 tx / GHS 29,050**
  (cash/MoMo/cheque mix, receipts), **10 approved expenses** (Ghana vendors), **building
  campaign + 8 pledges**, **4 events + 26 RSVPs**, **4 announcements** (incl. FUNERAL &
  OUTDOORING), **8 visitors + 5 follow-up progresses**, **6 care tasks** (incl. 2
  MISSING_MEMBER), **7 pastoral actions** from member milestone dates.
- Verified live: pastor login 200 → `GET /members` **total=46**, `/services` **10**,
  `/finance/batches` **8**, `/finance/reports/analytics` 200.

---

**Addendum 4 (later 22 Oct) — topbar declutter + settings grouping:**
- **Topbar**: 20 flat links (+2) wrapped to two cluttered rows → **grouped dropdown nav**:
  Dashboard · **People ▾** (Members, Visitors, Children, Care, Groups) · **Worship ▾**
  (Services, Check-in, Roster, Media) · **Finance ▾** (Finance, Pledges, Expenses) ·
  **Outreach ▾** (Events, Drip, SMS, News) · **Org ▾** (Org, Branches) · Settings ·
  Usher mode · Logout — one clean row. Dropdowns: click toggle, closes on outside-click /
  Escape / navigation; active section underlined; `role=menu/menuitem` + aria-expanded.
  Usher-mode mini nav stays flat (4 items). CSS: `.nav-group*`/`.nav-panel` in globals.css.
- **Settings**: 13 stacked sections → **3 tabs**: **Church setup** (age brackets+toggles,
  profile/logo/identity/giving-instructions/retention/alerts mega-form, denomination) ·
  **SMS setup** (gateway, verse-of-day, Twi/Ga/Ewe/Fante templates) · **Giving** (funds,
  fee model). Implemented as `hidden={tab!==…}` per form (state preserved across tabs,
  zero JSX restructuring) + seg-toggle tab bar with per-tab description.
- Verified: web typecheck 0; /login /settings /dashboard all HTTP 200 in dev (routes compile).

---

**Addendum 5 (later 22 Oct) — hover menus + richer dashboard:**
- **Topbar dropdowns are now hover-driven**: hovering a group opens it instantly, moving
  across groups switches directly (previous menu closes), and the open menu closes ~140ms
  after the mouse leaves it (grace timer bridges the button→panel gap — implemented via
  `scheduleClose`/`cancelClose` refs in layout.tsx). Click only OPENS (touch-friendly;
  outside-click / Escape / navigation still close).
- **Dashboard enriched** (was 4 stats + 3 cards → **6 stats + 8 cards**): new stats
  *Giving last Sunday* + *At-risk members (60-day)*; new cards **Giving trend (last 8
  Sundays, bar rows)**, **Care queue** (open/in-progress, due dates), **Upcoming events**,
  **At-risk members** (churn risk badges + last seen), **Announcements** (category badges,
  excerpt). All five new feeds verified against live endpoints (`/finance/reports/by-sunday`,
  `/members/meta/churn`, `/tasks`, `/events`, `/announcements` — shapes confirmed) and
  `.catch(() => [])` guarded so a role without access still gets a working dashboard.
- Verified: web typecheck 0; /dashboard HTTP 200 in dev.

---

**Addendum (earlier 22 Oct) — Desktop launcher + root-.env fix:**
- **`C:\Users\HP\Desktop\ChMS.lnk`** → `scripts/start-app.cmd`: starts postgresql-x64-16 if
  stopped, opens "ChMS API" + "ChMS Web" windows, auto-opens http://localhost:3000, starts the
  worker only when Redis :6379 is listening. Verified live: `dev:api` + `dev:web` boot,
  `GET /api/v1/bible` → **HTTP 200, all 7 translations**, web → HTTP 200; test instances stopped
  after verification (clean ports).
- **Bug fixed:** `import 'dotenv/config'` resolves `.env` from **cwd** — npm `-w` runs with
  cwd=apps/api (or apps/worker), so the ROOT .env was never loaded:
  `Invalid environment: DATABASE_URL: Required; JWT_SECRET: Required`. New
  `apps/api/src/load-root-env.ts` + `apps/worker/src/load-root-env.ts` (root .env via
  `resolve(__dirname, '../../../.env')` — correct from src/ and dist/ — then cwd .env fills only
  unset keys); both main.ts entries import it first. Typecheck+build api/worker ✓, lint ✓.

---
