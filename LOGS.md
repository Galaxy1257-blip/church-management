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

**Addendum 7 (later 22 Oct) — typeable headcount counters:**
- Attendance counters accept **direct number entry**: the count is now an input (numeric keypad on
  mobile) — type `40` + Enter (or tap away) to set that segment outright; +/− buttons still there
  for small nudges. `setCount()` converts the typed value into the same ±1 outbox events taps
  create (offline-safe, idempotent, server batch-safe ≤999), with optimistic local update +
  haptic + auto-sync; Enter commits, focus pre-selects the old value, digits only (3 max).
  CSS keeps the label look until hovered/focused. Lives in services/[id] headcount page
  (ushers use the same screen). Verified: web typecheck 0, service page HTTP 200, login + services list OK.

---

**Addendum 6 (later 22 Oct) — Create account + unique church id + sign-in branding:**
- **`POST /auth/signup` (public)** — "Create account" on the login page: church id + name + phone +
  password → MEMBER-role User + linked Member record (`M00047`-style, same memberNo scheme) →
  auto-login (tokens). Guards: GH phone normalization, 6-char password, unknown church → 400,
  duplicate phone → 409 "sign in instead". Verified live: signup with uppercase `DEMO` → 200+token
  (id normalized), dupe 409, unknown 400, created rows (MEMBER + memberNo) confirmed in DB.
- **Church ids are now guaranteed unique (case-insensitive)**, three layers: normalize on create
  (lowercase, URL-safe, ≥2 chars), friendly "id already taken" errors (pre-check + race catch),
  and **DB index `idx_church_slug_ci` ON "Church" (lower(slug))** in extras.sql (applied to
  chms + chms_test; verified: `duptest`+`DupTest` insert REJECTED by the index). All lookups
  (auth login/OTP/signup, public controller, getPublicBySlug) normalize the slug too.
- **Sign-in page shows the church identity**: logo + full church name (up to 3 lines, clamped) +
  tagline, fetched live from `GET /public/:slug` as the church id is typed (350ms debounce;
  falls back to generic heading when not found). `public.controller` now also returns `branding`
  from church settings — ready for the later UI stage (multi-line names like "Church of
  Pentecost, Nsuatre District, Hemang Assembly" render as-is).
- Also this stretch: runtime refresh fix (stale dist/process divergence), tunnels relaunched
  (localhost.run, HTTP-based): web `https://923adaaafc9632.lhr.life` · api
  `https://ed22e6a71ae638.lhr.life`. typecheck api+web 0.

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

**Addendum (26 Oct) — Role-aware staff app: PASTOR role, role tiers/scope, permission-gated
nav + routes + dashboard:**

- **`PASTOR` is now a real role (9 roles total)** — `packages/shared/src/enums.ts`,
  `schema.prisma`, `migrations/1_pastor_role/migration.sql` (`ADD VALUE IF NOT EXISTS`, additive),
  seeded in `packages/db/src/seed-constants.ts`, and its preset is **all 32 permissions** (not `*`,
  which stays platform-only). Seed also refreshes existing churches' default role sets.
- **Three visibility tiers + data scope** in `packages/shared/src/permissions.ts`:
  `PLATFORM` (SUPER_ADMIN) · `CHURCH` (PASTOR) · `DEPARTMENT` (finance/leader/elder/secretary/
  follow-up/usher) · `SELF` (MEMBER); `DataScope` = ALL | BRANCH | SELF | NONE derived from roles ×
  branch rows, shipped in the JWT and `/auth/me` so the UI states scope honestly.
- **`@Authenticated()`** decorator + guard/boot-check branch: `/auth/me` is now reachable by a
  MEMBER (zero permissions) so the shell can tell them to use `/portal`. Default-deny is intact —
  the boot check still rejects any route with no declared policy.
- **Web shell is permission-driven** (`apps/web/src/lib/access.ts`, new): nav model (5 groups /
  18 items + 4 usher links), page→permission map (20 prefixes, longest-prefix match),
  `canAccessPath` route guard, `role · scope` chip. MEMBER → `/portal`; a denied route renders
  "Not available for your role" instead of a 403-blanked page; usher mode is offered only with
  `headcount:write` + `services:read` and toggles a 4-link nav.
- **Dashboard degrades instead of exploding**: it reads `/auth/me` first, then calls only the
  endpoints the viewer may read (wallet/services/reports/visitors/churn/tasks/events/news) and
  renders each card behind its own permission check. Previously one 403 (e.g. USHER on
  `/sms/wallet`) rejected `Promise.all` and blanked the whole page.
- **Verification**: `prisma generate`, `typecheck` (5 workspaces), `test` (shared 62, api 31 incl.
  7 live-Postgres integration, worker `--passWithNoTests`), `eslint .`, `check:secrets` all green;
  plus `.ecc/access-smoke.mts` running the real role presets through the web helpers →
  SUPER_ADMIN/PASTOR see 18/18 items and every route, LEADER/FINANCE_ADMIN/USHER/SECRETARY/ELDER/
  FOLLOWUP see only their modules, MEMBER sees none and is redirected. **Not verified in a browser.**
- **Fixes made while getting the gates green** (all real, all listed in
  `.ecc/artifacts/002-test-validation.md`): integration tests used hardcoded webhook
  `eventKey`s and phone numbers, so a second run collided on global uniques → per-run ids;
  role count 8→9; worker test script `--passWithNoTests`; eslint ignores `.ecc/**` and grants node
  globals to `scripts/*.{js,cjs}`; removed an unused decorator import in `auth.controller.ts`.
- **Operator steps**: `npm run db:migrate:deploy` everywhere (local `chms` + `chms_test` were
  patched with `.ecc/apply-migration.mjs`), rebuild `@chms/shared` + `@chms/db` before deploying
  api/worker (stale dist is what made `'PASTOR'` unassignable to `RoleKey`), re-seed churches to
  create the PASTOR role, then grant it via `UserRole` (no user-management UI yet).

---

## 2026-10-26 — Session L (blueprint rule: commit + push after every unit of work)

**Owner:** "add to blueprint to update git everytime" → encoded as **ground rule 8** in
`BUILD_ORDER.md`, **rule 9** in `STATE.md` §2, and a new **step 6** in the §10 handoff protocol, so every
future session reads it before touching code.

**The rule (as written in the blueprint):**
1. Every unit of work ends in a commit — no dirty tree across a task or session boundary.
2. Conventional subject (`feat(area):` …), one logical change per commit.
3. **Explicit paths only — never `git add -A` / `git add .`**: this tree legitimately holds
   `church-asset-kit/` (117 MB) and the Neon-credential scratch scripts (`scripts/*neon*`,
   `scripts/tmp-demo-accounts.js`, `scripts/check-users.cjs`).
4. `npm run check:secrets` before staging; a secret in a file means that file is not committed.
5. Commit the evidence with the code: `LOGS.md`, blueprint ticks, `STATE.md`, `.ecc/` artifacts + journal.
6. Push (`git push origin main`) and **prove** it: `git ls-remote origin refs/heads/main` must equal
   `git rev-parse HEAD`. PowerShell reports a *false* exit 1 for `git push` (git writes progress to
   stderr) — same class of trap as the `eslint` false failure.
7. Anything genuinely uncommittable (mid-refactor, red tests) is declared in `STATE.md` §6.

**Ship record (same day, immediately before this entry)** — `main` pushed to
`github.com/Galaxy1257-blip/church-management`:
`3c9b4d0` feat(rbac) role-aware staff app (21 files) · `664e746` feat(web) headcount direct entry ·
`a43903f` fix(church) unique slug + public branding · `1defc0f` chore(ecc) gate artifacts + smoke test ·
`1453b69` chore(ecc) push journal. Verified: `git diff origin/main HEAD` empty.

**Kept out of git on purpose:** `scripts/tmp-demo-accounts.js` — **tracked file, uncommitted hunk**
(its working copy swaps the localhost DSN for a pooled Neon DSN with the `neondb_owner` password;
`git grep npg_ HEAD` shows the committed version is clean). Untracked and never added:
`scripts/check-neon.mjs`, `scripts/seed-neon.mjs`, `scripts/check-users.cjs`. **Owner action: rotate that
Neon password, then rewrite all four to `process.env.DATABASE_URL`.** Also untracked:
`church-asset-kit/` (117 MB), `church-asset-pipeline/`, `CHURCH_UI_BRAINSTORM_GHANA.md`,
`UI_IDEAS_GHANA.md`, `scripts/*.html`.

**Leak radius checked:** the only remote ref is `refs/remotes/origin/main`, and the credential is not in
it (`git grep npg_ HEAD` → nothing). It *is* inside the IDE's local snapshot refs
(`refs/cline/checkpoints/*`, commits titled "untracked files on cline checkpoint") — local disk only,
never pushed. Prune with `git update-ref -d` per checkpoint if the owner wants them gone.

**Deploy note:** `render.yaml` runs `npx prisma migrate deploy` in the API start command;
`prisma migrate status` shows 2 migrations with only `1_pastor_role` pending → the PASTOR enum applies
itself on the next Render deploy (additive `ADD VALUE IF NOT EXISTS`, idempotent).

---


---

## 2026-10-26 — Session M: audit fixes + nav consolidation

**Owner request:** *"implement the changes you recommended for the supposed bloated features and fix
issues you found when scanning the codebase"* — i.e. turn Session L's audit into code.
Plan: `.ecc/artifacts/005-implementation-plan.md` (Gate 1, approved on request).

### Correction to Session L's own audit (checked, not assumed)

The audit said the Neon DSN was on `origin` and therefore possibly public. **That was wrong**, and it is
corrected here because the wrong version had already been written down:

| Check | Result |
|---|---|
| `git grep -l npg_ HEAD -- scripts/*` | nothing — HEAD was already clean |
| `git merge-base --is-ancestor {e17e875,a74342a,6c74a45} origin/main` | exit **1** for all three → never pushed |
| working tree | 6 files still carried the DSN |

Severity: hygiene, not incident response. Rotation is still the right operator action (the password sat
on disk and in three local-only commits), but nothing leaked publicly.

### Security / correctness (Track A)

1. **Secret scanner was blind to the thing that actually leaked.** It only knew Paystack/cSMS/AWS shapes.
   Added patterns for a Postgres/MySQL/Redis/Mongo DSN **with an embedded password**, Neon's `npg_…`, and
   generic `SECRET`/`PASSWORD`/`TOKEN` assignments — exempting the localhost dev DSN and doc placeholders
   (`RECREATION_GUIDE.md` documents the shape with `<PASSWORD>`/`<HOST>`). Proven with a negative test: a
   planted DSN fails the scan, then passes once deleted.
2. **Credential removed from the tree.** Deleted the three Neon scratch scripts (`check-neon.mjs`,
   `seed-neon.mjs`, `check-users.cjs`); the three demo seeders now read `process.env.DATABASE_URL`, abort
   with a clear message when it is missing, and `.gitignore` keeps new scratch scripts out of history.
3. **Production cannot boot with the public dev secrets.** `env.ts` gained a `superRefine`: in production
   `JWT_SECRET` must be ≥ 32 chars and none of the three documented dev defaults may be used. (The dev
   default was 37 chars, so the old ≥ 16 rule let it through.)
4. **Rate limiting on the whole unauthenticated surface** (`common/rate-limit.ts`, no new dependency):
   login 8/5 min per phone + 30/5 min per IP, signup 5/h, OTP request 3/h per phone + 10/h per IP (it bills
   real SMS), OTP verify 10/10 min, refresh 60/5 min. `trust proxy` is set in production so the bucket keys
   on the real client IP behind Render/Cloudflare.
5. **`OTP_MAX_ATTEMPTS` was dead code.** The lookup filtered on `codeHash`, so a wrong guess matched no row
   and `attempts` never moved: six digits were brute-forceable for the full 5 minutes. It now finds the
   newest live challenge **by phone**, compares the hash in constant time, and burns the challenge after 5.

6. **`memberNo = count + 1`** raced (P2002 on `@@unique([churchId, memberNo])` in front of a user typing a
   form) and re-used numbers after a soft delete. New `common/member-no.ts` takes a per-church
   `pg_advisory_xact_lock` and allocates from `MAX(M#####) + 1`; used by create, CSV import and signup.
7. **CORS was a mirror** (the fallback branch allowed every origin, plus any `*.vercel.app`). It is now an
   allowlist from `WEB_URL`, deny-by-default.
8. **500s leaked internals** (`exception.message` on a 500 → SQL/paths in the browser), and unmatched
   Prisma codes were reported as 500s. The filter now maps status → stable code (incl. `RATE_LIMITED`),
   logs 5xx detail, and returns a generic body.
9. **Logo upload was broken for 75–400 kB** (body-parser's 100 kB default vs the 400 k char ceiling).
   `useBodyParser('json', {limit:'1mb'})` — verified in `@nestjs/platform-express` that `useBodyParser`
   re-applies the `rawBody` verify hook, so the Paystack HMAC still works — and the two size errors became
   `BadRequestException` instead of `Error` → 500.
10. **Webhook secret compared with `!==`** → `timingSafeEqualStr` (`common/crypto.ts`), also used by OTP.

### Feature consolidation (Track B)

- **5 areas + Home + Settings** instead of ~18 top-level links: People, Worship, Money, Reach,
  Organisation. `NAV_AREAS` is one source of truth; a single `<AreaTabs />` in the app layout renders the
  in-area tabs from the pathname, so **no page file was rewritten and no route was deleted**.
- **Per-church module switches** (`Church.settings.modules`, no migration): Settings → Modules has five
  checkboxes; `/auth/me` returns `modules`; nav, tab strip, route guard and dashboard cards all honour it.
  `/settings` is never module-gated (it is where you switch things back on), and the API still enforces
  permissions — this is visibility, not authorisation.
- **Dashboard** now shows 3 KPIs + a "Today" card with the three recording actions; the remaining cards are
  module-gated. The cards that duplicated numbers already visible in their own area are gone.
- **`/auth/me` de-duplicated**: the shell and the dashboard both called it on every page load. New
  `lib/session.ts` caches the promise; `getSession()` is shared. `getApiBase()` no longer writes to
  `localStorage` on every request (once per page load).

### Gate evidence

`npm run typecheck` (5 workspaces) · `npm run test` → shared **68**, api **50** (19 new: env production
guards, rate-limit buckets, timing-safe compare), worker 0 · `npx eslint .` clean ·
`npm run check:secrets` clean **and** proven to fail on a planted DSN · `npx tsx .ecc/access-smoke.mts`
→ `ALL CHECKS PASSED` (18 new assertions for areas/tabs/modules).
Logs: `.ecc/{tc-all,test2,lint,secrets,neg}.log`.

### Not done (declared, not forgotten)

Rotating the Neon password (needs the Neon console), rewriting git history (nothing on `origin`),
`@nestjs/throttler` (single instance; swap `take()` for Redis INCR when scaled), a `/dashboard/summary`
endpoint, branch-scope RLS on the seven non-`Transaction` tables (needs a migration + a per-request
setting), CSP/headers, and any user-management UI.

## 2026-10-26 — Session N: the missing web deploy target (`chms-web`)

Pushing to `main` only ever updated `chms-api`; `render.yaml` declared no target for
`apps/web`, so the role-aware shell never reached production. Plan `artifacts/007`.

**Change set (5 code files):**

- `render.yaml` — new `chms-web` service: `type: web`, `runtime: node`, `plan: free`,
  `region: oregon`, build `npm install && npm run build -w @chms/web`, start
  `npm run start -w @chms/web`, `healthCheckPath: /login`, env `NEXT_PUBLIC_API_URL`
  (`sync: false`), `NEXT_TELEMETRY_DISABLED=1`, `NODE_ENV=production`.
- `apps/web/package.json` — `start` is `next start` (was `next start -p 3000`). Render routes
  traffic to `$PORT`; the hardcoded flag would have failed its port check.
- `apps/web/next.config.mjs` — build fails when `RENDER` is set and `NEXT_PUBLIC_API_URL` is
  missing. `NEXT_PUBLIC_*` is inlined at build time, so the alternative is a healthy-looking
  deploy that calls `localhost:4000`.
- `apps/api/src/platform/payment-provider.ts` — mock-pay link now uses the **first** entry of
  `WEB_URL`. `main.ts` documents `WEB_URL` as a comma-separated CORS allowlist; appending a path
  to the whole list produced `https://a,http://b/give/mock-pay?ref=…`.
- `apps/api/src/platform/payment-provider.spec.ts` — 3 new vitest cases for that.

**Rejected option (with evidence, not opinion):** a Render *static site* with
`output: 'export'`. The build route table shows `ƒ (Dynamic)` on `/flyers/[slug]`,
`/give/[slug]` and `/services/[id]`; static export needs `generateStaticParams`, and
`give/[slug]` is the public giving link, so a static site would 404 it. SSR it is.

**Gate evidence:** `render.yaml` parses (3 services, all chms-web keys asserted) ·
`vitest payment-provider` 3/3 · full API suite 6 files / **53** tests · web typecheck 0 ·
`next build` 0 (31 routes) · `PORT=3999 next start` → `/login` `/` `/dashboard` `/give/demo`
all **200** · guard negative test exit 1 with the intended message ·
`check:secrets` clean. Logs: `%TEMP%\{web-build,web-start,api-test,guard-neg2}.log`.

### Follow-ups this session deliberately did not do

1. **Session M's working tree is still uncommitted** (30 files: `access.ts`, `(app)/layout.tsx`,
   `lib/session.ts`, `components/`, `settings`, `dashboard`, API audit fixes). This unit touches
   none of it; because the web service builds from the pushed commit, `chms-web` will serve the
   `HEAD` UI until that work is committed **and** pushed. `scripts/tmp-demo-accounts.js` still
   carries the Neon DSN and must stay out of that commit.
2. Dashboard steps for the owner: create/patch the service from the blueprint, set
   `NEXT_PUBLIC_API_URL=https://<chms-api-host>/api/v1`, and set the API's `WEB_URL` to
   `https://<chms-web-host>,http://localhost:3000` (comma list is fine for CORS now that links
   use the first origin).
3. Free plan: 750 instance-hours are shared by both web services; both spin down after 15 min.



## 2026-10-26 � Session M closed: audit fixes + 5-area nav (`38f8f9a`)

**Request (owner):** *"implement the changes you recommended for the supposed bloated
features and fix issues you found when scanning the codebase"* � audit fixes (track A) plus the
nav/module consolidation (track B). Plan `.ecc/artifacts/005`, validation `010`, verification `011`.

**Shipped** � one commit, pushed (`origin/main == 38f8f9a`):

- **Secrets** � `check:secrets` now sees Postgres/Redis/Mongo DSNs with an embedded password, Neon
  `npg_` values, cSMS `csms_` tokens and generic `*SECRET`/`*PASSWORD` assignments; the credential-
  bearing scratch scripts are gone, the tracked demo scripts read `DATABASE_URL` from the env, and
  the `tmp-*`/`*neon*`/`check-users` patterns are gitignored.
- **API** � prod env validation rejects dev secrets and short `JWT_SECRET`s; token-bucket rate
  limits on signup/login/otp/refresh; OTP attempts are counted and the challenge burns at 5
  (the cap was unreachable before); `memberNo` allocated under an advisory lock + `MAX()` so
  concurrent creates stop hitting P2002; CORS is an allowlist from `WEB_URL`; 5xx bodies no longer
  echo `exception.message`; both shared secrets compare in constant time.
- **Web** � nav collapsed to 5 areas (People, Worship, Money, Reach, Organisation) with one tab
  strip rendered from the layout; a Modules tab in Settings turns areas off *and* closes their
  routes; dashboard rebuilt as 3 KPIs + 3 actions with every card permission- and module-gated
  (the ungated "Latest service" card was a back door); `/auth/me` is fetched once per session; the
  API base URL is no longer written to localStorage on every request.

**Gates (final run):** shared build 0 � shared 68/68 � api 55/55 (46 unit + 9 live-DB
integration) � typecheck 0 � eslint 0 � check:secrets clean � access-smoke `ALL CHECKS PASSED` �
`next build` 29 routes (26 static, 3 dynamic).

**Verification earned its keep** � three real defects surfaced while writing report 011: a planted
`SMS_PASSWORD` was invisible to the scanner (`\b` never matches after `_`); `churches.service.ts`
compared the platform signup key with `!==`; and the first attempt at the two new integration tests
silently nested them inside another test (caught as 1 failed, fixed to 9/9). Both Session M gaps
that had been *claimed* unverifiable � the OTP cap and the member-number allocator � are now covered
by live-Postgres tests.

**Still open:** no browser pass; A7/A8 untested; the integration suite skips silently without a
`chms_test` database; the secrets scan is manual; the Render-like `next build` guard has never
fired; **the owner must still rotate the Neon password** and set `NEXT_PUBLIC_API_URL` on
`chms-web`.
