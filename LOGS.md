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
  legacy-font decode `q→ɔ Q→Ɔ x→ɛ X→�?` (`--no-decode` to disable) → chapter-header handling (bare
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

## 2026-10-29 - Session N: owner feedback round 1 (plain language, simple groups, visibility)

**Request (owner):** make the English soft and easy to understand (e.g. "offering" instead of
"giving"); simplify demographics to only Men, Women and Children but let the church change the
groups; add financial events like Harvest; remove Worship from the app while keeping every removed
area switchable back on from Settings; and stop members seeing parts of the app they are not allowed
to see. Owner said more changes will follow.

**Shipped (uncommitted at session end - awaiting owner confirmation to commit/push):**

- **Modules** - `MODULE_DEFAULTS` in `packages/shared/src/modules.ts` (new, mirrored in
  `apps/web/src/lib/access.ts`) with **Worship off by default**; `resolveModules`/`moduleEnabled` now
  fall back to those defaults when a church has no stored key, so existing churches get Worship off
  but can tick it back on under Settings -> App sections. Shared tests rewritten (68/68).
- **Simple groups** - seed now creates `Children` (0-12) + `Adults` (13+, split) instead of six age
  brackets; Settings has "Simple: Children / Men / Women" and "Detailed age groups" presets, plus
  editable/removable groups and a "+ Add group" row; split segments are labelled exactly Men/Women.
  `demographics.service.saveBrackets` now deactivates IN_PERSON headcount segments the new group set
  no longer uses, so switching from detailed to simple stops orphan groups appearing in the counter.
- **Special money events** - default funds stay the common, recurring ones (Tithe, Offering, Welfare,
  Building, Missions, First Fruits, Thanksgiving, Harvest). Occasional events — church anniversary,
  seed offering, a named harvest — are NOT seeded; Settings -> Offering has one-tap buttons for
  Church Anniversary / Seed Offering / Harvest / Thanksgiving / First Fruits that skip events the
  church already has, and any other category can be typed in by hand.
- **Visibility** - nav and route rules now name the permission that fits each job instead of broad
  read scopes: USHER no longer sees Groups, Children, Roster, Departments, Branches or Events;
  LEADER no longer sees Branches; `/branches` needs church/settings write or finance read; MEMBER is
  redirected to `/portal` at login. Usher Mode still reaches check-in even when Worship is off.
- **Plain language** - Finance -> Offerings, "By category", "count" wording for cash/cheque, give page
  -> "Give an offering", "What is this offering for?", "Other ways to give an offering"; portal ->
  "My offerings", "No offerings recorded yet"; service detail -> "Attendance count"; members table ->
  "Group"; Settings copy softened throughout.

**Gates (29 Oct):** shared build 0 - shared 68/68 - api 55/55 - typecheck 0 (shared/db/api/worker/web)
- eslint 0 - `check:secrets` clean - access-smoke `ALL CHECKS PASSED` (rewritten for the new
array-permission model and Worship default off) - `next build` 29 routes (26 static, 3 dynamic).

**Not done:** no browser pass on the three affected surfaces (Settings groups/presets, public give
page, member portal); a church that explicitly saved worship: true keeps Worship on (expected -
resolveModules only applies the new default when the key is absent); role visibility for custom
roles follows the stored permission preset, so a hand-widened custom role still sees what its
permissions allow.

## 2026-10-30 — Session O: subscriptions, public site and the onboarder console

**Request (owner, in three parts):** (1) monthly subscription billing with a lock when a church
falls behind, with cash payments recordable by the office; (2) a developer office to manage every
church and user, act on a church's behalf, add churches and users and reset passwords; (3) a home
screen with real sign-in, sign-up and forgot-password. Then: **"create a section for onboarders
that's almost similar to the dev console, determine appropriate actions they can take there by
brainstorming and implement. let them have their own logins. the main dev admin will be the one to
create account for onboarders. i want the app such that if one church specifically ask for features
specific to them we can create it for them at their side."**

**Shipped (4 commits, pushed to `origin/main`):**
- `962aef4` **feat(api)** — `PlatformRole` gains `ONBOARDER`; the platform guard re-reads role and
  `isActive` from the DB on every request; owner-only staff CRUD with bcrypt-12 passwords and
  self-disable/self-demotion/last-owner guards; church member CSV preview + confirm (checking
  duplicates and errors before writing); `settings.customFeatures` parsed by a new shared helper
  (`parseCustomFeatures`/`resolveCustomFeatures`, max 20, safe keys and links); `/auth` is
  `@BillingExempt` so a paused church can still sign in and pay; password-reset OTPs carry
  `purpose` so a login code cannot be redeemed as a reset (migration `6_password_reset`); `me()`
  now reports `billingLocked` so the support lock actually reaches the workspace; `resetPassword`
  transaction fixed for `TransactionClient`.
- `cbf4934` **feat(web)** — public home, sign-in (password or SMS code), sign-up (new church with
  14-day trial **or** join an existing church by id) and the three-step forgot-password flow, all
  plain English and phone-first.
- `9efd7e6` **feat(web)** — `/billing` (state, fee, covered-until, history, Paystack/MoMo mock pay,
  cash instructions) and a full-screen lock that replaces every area when the workspace is paused,
  except `/billing`; per-church **Extras** nav group and page.
- `3d4049f` **feat(web)** — platform office console: overview, churches list/detail, payments to
  confirm, **Team** page (owner only), app-section switches, extras editor, member CSV import and
  "Open as" handoff (90-second single-use link).

**Verification:** API role boundaries retested (onboarder 403 on staff list and fee changes, 200 on
extras and import preview; owner 200); extra tool saved on one church and rendered in that church's
nav only; CSV import previewed and confirmed (1 member, test data removed after); paused workspace
showed the lock screen at 390 px and `/billing` opened without a 402; support lock cleared
afterwards. New shared tests for the extras validator. Dev owner account recreated locally with
`npm run platform:admin` (credentials live in the operator's environment, never in the repo).

**Gates:** typecheck 0 (5 workspaces) · eslint 0 · shared 72/72 · api 73/73 · worker no tests ·
`check:secrets` clean. No `next build` run this session (dev server verified in the browser instead).

**Known gaps / operator notes:** a handoff session has no refresh token by design, so a hard reload
while "Open as" lands back on `/login`; Paystack is still the mock flow until live keys are set; the
office needs at least one active OWNER, so keep one outside the test accounts; docs updated here.

## 2026-10-31 — Session P: class-scoped care and a service that opens itself

**Request (owner, two parts):** (1) **"let only ushers or sunday school teachers see ''care'' when
enabled"** — and, when asked how much of the church a teacher should see, **"Their Sunday School
class"**; (2) **"i noticed there was a ''service'' and it seems someone has to signal that church is
starting make it automatic every sunday like 7:30 to 12 unless specified that no church on particular
day."**

**Shipped (`7105d44` class-scoped care, `d25d67e` the automatic service; the section switches
themselves are `353c79a` and the 15-switch settings page is `279f3fb`, both from the parallel session):**

- **Care follows the class, not the church.** Migration `10_sunday_school_class` adds
  `User.careClassBracketId` + `careClassSegment`; the access token carries them as `ccb`/`ccs`.
  `care.module.ts` resolves a scope for anyone without `members:read`: their own bracket (plus the
  boys/girls half when the class is split) and nothing else — the class queue, class overview,
  counselling notes and care tasks are all filtered to those member ids, and a task opened on a
  child outside the class is a 400 rather than a quiet leak. A teacher with no class yet gets an
  empty queue and a plain-English instruction to see the office; before this fix they inherited the
  whole-church list, which was the privacy hole this change exists to close. Welfare and moderation
  stay permission-gated, so a teacher gets 403 on both. The platform office can set the class on a
  staff row, and the sidebar chip now reads **My class** instead of **Whole church** for a teacher.
- **Sunday opens the doors by itself.** New shared `service-schedule.ts` holds the model
  (`enabled`, `weekday`, `startTime`, `endTime`, `name`, `skipDates`) and `serviceWindowState()`;
  defaults are Sunday 07:30–12:00, stored in `Church.settings.serviceSchedule` so no migration was
  needed. `GET /services` reconciles today against that window before it answers — creating the
  service at the opening time, flipping SCHEDULED to OPEN, closing it at the end, and creating
  nothing at all on a ticked "no church" Sunday. Because the reconcile rides the read that the
  dashboard, check-in and services pages already make, no scheduler or worker change is required.
  Closed services never reopen. `GET/PUT /services/schedule` (`services:read` / `services:write`)
  serves the settings view with the next eight Sundays labelled and flagged; the Services page shows
  one **Automatic service** card with the name, opening and closing times and the skip list. The
  seeded Sunday template moved from 09:00 to 07:30 to match.

**Verification:** API — class of 6 children returned to the teacher and only those 6; task list
class-only; welfare 403; moderation 403; task on an outside child 400; task on a class child 201
(test row deleted); unassigned teacher got an empty class and empty queue. Schedule — an OPEN service
appeared at the window start, auto-closed after the end, nothing was created on a skipped date, and
defaults came back intact. Browser at 390×844 — teacher nav is Dashboard + Care only, queue names are
not clickable, the visit form's child picker lists the class, no welfare card and no moderation
controls; the admin Services card saved "no church on Sun 1 Nov", it survived a reload and the API
confirmed `skipDates: ["2026-11-01"]`, then it was unticked again.

**Gates:** typecheck 0 (5 workspaces) · eslint 0 · shared 83/83 · api 73/73 · worker no tests ·
`check:secrets` clean · `.ecc/access-smoke.mts` and `.ecc/modules-drift.mts` both ALL CHECKS PASSED.
One eslint error came in with `279f3fb` (a `react-hooks/exhaustive-deps` disable comment in
`expenses/page.tsx` for a rule this flat config never registers) and was removed here.

**Left as found:** the demo church's Care switch is back off, the demo teacher's class assignment is
cleared, and the service schedule is Sunday 07:30–12:00 with no skip dates. `services`/`children`/
`groups`/`expenses` module flags were returned to the values the other session had them at.

## 2026-11-02 — Session Q: the dashboard answers in one glance

The machine lost power mid-session, so this starts with the recovery and then the two dashboard
items that were still open.

- **The web server is healthy again.** The 500-on-every-route condition was a `next build` sharing
  `apps/web/.next` with a live `next dev`. Killed the :3000 listener, deleted `.next`, restarted
  `npm run dev:web`; `/`, `/dashboard`, `/expenses`, `/events`, `/children`, `/care` and `/settings`
  each return 200.
- **Events stopped offering a card the church switched off.** `eventsVisible` on the dashboard read
  `mod('worship')`, but `/events` moved behind its own `events` switch in `279f3fb`, so a church with
  Events off still saw the Upcoming events card. It reads `mod('events')` now.
- **Four cards, then a line.** The dashboard shows the first four cards and folds the rest behind
  **Show N more cards**; the button flips to **Show fewer cards** and the choice is stored in the same
  `chms.dashboard.layout` record as the order and hidden cards, so it survives a reload and a revisit.
  Edit dashboard ignores the fold — the person arranging sees every card and no fold line.

**Verification:** browser as the demo admin — four cards with "Show 3 more cards", expand to seven and
the label flips, reload keeps seven, collapse returns to four; edit mode shows seven cards, no fold
line and seven arrange rows. Typecheck 0, eslint 0. The panel used was 510 CSS px, not 390 — the
in-app browser could not be resized and its surface was hidden, so no screenshot was taken. The fold
is a count rule, not a breakpoint, so width does not change it.

**Verse of the day rotates (owner: "currently it's set to only John 3:16").** The 8pm SMS quoted one
pinned verse forever. New `packages/shared/src/daily-reading.ts` holds 84 curated passages, each with a
single plain-English line beside it; the pick is driven by the church-local date, so the same day always
gives the same reading and no passage repeats inside a season. New `verse.ts` puts one reference parser
and one book matcher behind the API reader, the worker SMS and the rotation, which also fixed a real
bug: the ASV bundle spells numbered books `I John`, `II Peter`, `Revelation of John`, so asking for
"1 John 3:18" in ASV used to 404 in the reader and silently skip in the SMS. `GET /bible/daily` answers
in any bundled translation (or a pinned `?verse=`), the worker rotates when the church has not pinned
one, and Settings→SMS now lists the seven bundles the server actually has — the old dropdown offered a
"WEB" translation that has never existed. Verified: all 84 references return text in all seven bundles
(vitest, skips when the untracked 27MB bundles are absent); as an admin in the running app the card
showed Psalms 34:8 in KJV, the same verse in Twi (`Monka nhwɛ na monhunu sɛ AWURADE yɛ…`) and ASV
"1 John 3:18" now resolves; saving Twi + SMS-on persisted through a reload, then it was put back.
The 8pm job itself was not run — the worker was not started and the demo wallet is unfunded, so the
send path is covered by the shared tests and typecheck only.

**Not shipped on purpose:** an in-app daily-reading switch and notification inbox were drafted, but a
switch that gates nothing is the same defect as the Children hint, so it comes back with the worker
writing the rows and the header bell that shows them.


---

## 2026-11-02 — Session R: the Bible, one button away from everywhere (`35192ee`)

**Owner ask:** "i think bible is in the app but not showing in ui. just put a button at the top right that
shows bible and allow changing language, making notes (in different colours), searching similar texts and
other bible actions but no clutter, i want that button to persist despite the opened part of the app.
button not too big or interrupting" — then "**make the bible reader to be accesible to any type of user**".

**Built.** `apps/web/src/components/bible-dock.tsx` is a 52×27px **Bible** pill fixed to the top right at
`z-index: 44` — above the mobile bar, below the menu scrim — mounted once in the staff shell
(`(app)/layout.tsx`) and once in the member companion (`portal/page.tsx`), so it survives every page, every
tab and every drawer in the app. Nothing loads until the first press: one `GET /bible` for the translation
list, one for the chapter, one for the notes. The panel reuses the existing drawer CSS:
language select (seven bundles: KJV, ASV, Twi, Akuapem-Twi, Fante, Ga, Ewe), book + chapter, verse list with
a dot on any verse you have already noted, tap-to-note with five colours, "My notes" as a list of your own
verses, keyword search across the whole bundle, Copy, and "Other languages" which fetches the same verse in
every other bundle side by side. The reading position (translation, book, chapter) is remembered per browser
in `chms.bibleDock`; the notes are on the server, so they follow the person to another phone.

**Any user type.** The gate is the session, not the permission: `apps/api/src/bible/bible-notes.ts` exposes
one `BibleNotesService` behind two thin surfaces — staff `/bible/notes` with `@Authenticated()` (so MEMBER
with zero permissions still qualifies) and member `/portal/bible-notes` with the portal bearer the companion
already carries, matching how the rest of `portal.module.ts` works. `BibleNote.authorId` is deliberately a
plain uuid with no foreign key, because a staff `User` id and a portal `Member` id share the column. Every
query is `where: { id, churchId, authorId }`, so a note belongs to exactly one person.

**Off switch.** New **Bible** entry in Settings → App sections (`bible` in `MODULE_KEYS`, default on), and it
gates more than the button: the staff shell and the companion stop rendering it (`/portal/home` now returns
`bibleOn`), `POST /bible/notes` answers 403 "The Bible is switched off for this church" and `GET` returns
`[]`. Verified both directions in the running app.

**Verification** (dev servers on :3000/:4000, in-app browser; a 390px iframe because the surface itself is
510 CSS px): shared build + **119/119** · api **73/73** · typecheck 0 · eslint 0 ·
`prisma migrate deploy` applied `0a_sunday_school_role_key` + `11_bible_notes` as the owner, then
`db:extras` + `db:appuser`; `scripts/reset-test-db.mjs` proved the fresh-install path builds table 11.
As super admin: button at top:7 right:14 with nothing overlapping, panel opens with 7 languages and 31
verses, notes save as `note-yellow`/`note-green`, the noted verse grows its dot, "My notes" lists both refs,
`God so loved` found 2 verses, John 3:16 compared across all six other bundles, and a full page reload
brought the same two notes back from the server. As **Sunday School teacher** (`+233240000110`): the button
is there, the reader works, and a blue note saved — the list came back empty first, which is the per-author
scope proving itself. Through the **member** path (a real portal session issued by seeding an `OtpChallenge`
with the service's own hash and redeeming it on the sign-in form): 44px colour chips, panel 374×669 in a
375×760 viewport with no horizontal overflow, `search rejoice` → 25 hits, note saved and listed with its
ref. Cross-account probes: staff `DELETE` of a member's note → 404, staff list never shows a member's note,
member `PATCH`/`DELETE` of their own → 200/204. Switch off → button gone, `POST` 403, `GET` `[]`; switch on
→ button back. All demo notes, the seeded OTP challenges and the throwaway seed script were deleted after
the run (`BibleNote` is empty again).

**Fixed on the way:** the colour chips started life as 18px targets, which is a miss on a phone — they are
now 44×44 with the paint confined to the content box, so the dot still looks the same size.

## 2026-11-02 — Session S: nothing is allowed to be invisible (`308bf5f`, pushed)

**Owner ask:** a screenshot of the announcements page — "text color unreadable, check all similar instances".

**The one cause.** `globals.css` styles every `button` as a filled control: `color: var(--brand-ink)`, which
is near-white paper cream. Anywhere a `<button>` is used as a *surface* instead of a control, its text is
white on white. The announcements list did exactly that (`<button className="card notice-card">`) and then
painted `background: var(--bg)` inline on top. Fixed as a rule, not a patch — `button.card` now takes
`color: var(--ink)` and drops the control gradient, the same way `.group-card` already did. The inline
background came off the page. A scan of every `.tsx` for a button carrying a card class found two: this one
and `.group-card`, which was already correct.

**The sweep.** A DOM audit that walks every visible text node, blends the ancestor background chain and
scores it against WCAG (4.5:1 body, 3:1 large) at 390px in the running app. The first version of it reported
zero failures on every page — it was parsing `rgb()` with a regex, and `\s` does not survive the script
transport, so every colour silently fell back to black-on-white and scored 21:1. Rebuilt with no regex at
all. The honest numbers then showed the real pattern: **night is the only dark palette, and in it
`--brand` (#2f6b52) is a fill, never a colour you write text in** — as text on a dark card it is 2.85:1, on
the Bible chip 2.09:1. Every text site that wanted the brand tint now uses `--link`, which each of the 21
themes already tunes for legibility and which the audit never once flagged: sidebar title, sidebar actions,
dashboard stat numbers, member and group initials, the usher-mode rail, the companion tab bar, and
`.link-button`. Two more were unreadable for a different reason — `.theme-card.on .hint` ("In use") and the
mock-checkout confirmation were `--accent` gold, 2.1–3.0:1 on paper in almost every theme; both are ink now.
`.bible-fab` and `.bible-verse sup` came with them. A wrong turn is recorded here on purpose: `--brand-ink`
was briefly dark in night, which made filled buttons *worse* (6.2:1 down to 3.0:1) and was reverted.

**Plain language.** `Register (idempotent by phone)` on the visitors form is now **Save visitor** — the
behaviour (a second save of the same phone does not make a second person) is a property of the button, not
a word to put on it.

**Verification.** sanctuary and night, 390px: 0 failures across /dashboard, /members, /announcements,
/visitors, /settings, /groups, /finance, /billing, /services, /events, /campaigns, /extras, /about, /bible,
/portal and the open Bible dock (69 nodes). The original card computes `color: rgb(34,27,21)` on
`rgb(255,253,248)`. shared 119/119 · api 73/73 · typecheck 0 · eslint 0 · check:secrets clean.

**Still open, deliberately not touched.** The static token audit lists 55 pairs under 4.5:1 across 20
themes, and after this session they are all the same two families: `--terracotta` used as *hover* text
(2.99–4.48 — transient, borderline, and it is the owner's chosen hover colour) and `--accent` gold as the
decorative ■ in `.demo-legend`. Both would need the palettes themselves darkened, which is a design change
rather than a bug fix, so they are the owner's call.

---

## 2026-11-03 — Session T: every Bible reads in its own language

**Asked.** "The bible book names of the twi bibles seem to be in english — recheck, along with all languages.
Is it normally like that?" No, it is not: a printed Twi Bible says *Mateo*, not *Matthew*. The English titles
were our own artifact — `normalize-bible-bundle.mjs` identifies each book by its chapter/verse signature
against the KJV and then throws the source's own title away.

**Built.** Each bundle now carries a `localName` beside the canonical `name`, harvested from the original
sources by **`scripts/add-bible-local-names.mjs`** (`npm run bible:names`, dry-run unless `--write`): the
mobobi apps' asset filenames, the christappzz Room `TotalBooks.subBookName`, and — for Ewe, whose app ships
the *Twi* list verbatim — the Bible Society of Ghana published titles, kept in
`scripts/data/bible-ewe-book-names.json`. `name` stays canonical so references, saved notes and the
cross-translation compare are untouched, while the reader, the floating Bible, search hits and click-to-copy
all print the language's own title. `matchBook` accepts either spelling, so typing **Mateo 3:16** jumps.

**Caught while testing.** The Asante harvest had been pairing the Room rows against a book list taken from
`kjv.json` — and that bundle arrived from its API in *alphabetical* order, so the first title landed on
1 Chronicles: the reader was about to label Chronicles as Genesis. The fix makes the database label itself:
the same table always carries an English shelf in the same row order, so the two lists are paired inside the
source instead of against a positional guess. 65 of 66 Asante titles changed.

**Two more things the same walk exposed.** Bundles list their books in whatever order their source used, so
*every* reader opened the Bible at **1 Chronicles** — `inBookOrder` in `@chms/shared` now puts them in Bible
order, Genesis to Revelation. And the picker said "Twi (TWI (Asante))", one name said twice: version names
are title-cased in the bundles and `translationLabel` adds the language only when the version name does not
already carry it, which also cleans up **Settings → Bible translation** ("TWI-ASANTE — Twi" → "Twi (Asante)").

**Counts.** 66/66 books named in all five Ghana bundles. Titles that still look English are the ones that
genuinely are the same word in that language (Twi 6, Ga 10, Ewe 7, Asante 9: Genesis, Exodus, Amos, Daniel,
Hosea, Nahum…). The one real gap is **Fante: 24 books** still print the English title because that app
names its own files that way and its text is AES-encrypted, so its printed titles are not recoverable from
it. Not guessed at.

**Verified.** /bible and the floating Bible at 390px: book lists show *Numeri, Deuteronomium, Yosua, Mateo*,
switching translation keeps the reader on the same book and chapter, "Mateo 5:1" resolves, 0 overflowing
nodes. shared 123/123 · api 73/73 · worker 15/15 · typecheck 0 · eslint 0 · check:secrets clean.

**Owner's side, unchanged.** Redistribution rights for all five Ghana bundles; whether the second Twi text is
really the Asante revision (its package is named *akaupem* and its in-app label says *ASANTE VERSION*); and
the Ewe list above is a second-hand published table — worth a look against a printed Ewe Bible.

## 2026-11-03 — Follow-up: which Twi is which (`committed`)

**Owner ask:** "there are 2 twi there, indicate which is Akuapem and which is Asante. Or are they the same?"

**Not the same text.** Of the 31,091 verses both bundles carry, 8% are identical after normalising case,
punctuation and spacing; 30 of the 66 book titles differ. Two translations, not one file listed twice.

**Which is which — one proven, one not.** Grepping the raw bytes of the christappzz Room DB found the
literal string "TWI BIBLE ASANTE VERSION" stored beside the `twi_bible` shelf id, and no "Akuapem" string
anywhere in the data. So `twi-asante.json` is Asante, proven from the package itself; the app's *store title*
("Akuapem Twi Bible & Audio") is the part that is wrong. `twi.json` has the opposite problem: its app is
sold as "Asante Twi & English Bible" and its audio packs list Akuapem 1999 / Akuapem 2026 / Asante 2026,
while the text assets carry no edition label at all — so we cannot call it Akuapem either.

**Consequence.** FEATURES.md and FEATURES_SIMPLE.md claimed an "Akuapem Twi" Bible. That claim is not
supported by anything in the bundle, so both now say **Twi** with a pointer to the open audit, and
BUILD_ORDER R2.1 carries the audit: settle the edition (Bible Society of Ghana, or the same developer's
*Twi Bible: Asante & Akuapem*, which puts both dialects in one database and can be compared directly), then
either relabel or source a genuine Akuapem. The picker keeps showing "Twi" and "Twi (Asante)" — honest for
what we know.

**Also this session:** the Today shortcuts read as one sentence ("Check someone in Record offering Register
a visitor Add a member") and the last wrapped mid-thought on a phone — `.quick-links` now puts a muted dot
after each item except the last, on both dashboard link rows (`57ad211`).

## 2026-11-04 — Audit round 4, Batch 1: switches are boundaries, and the Sunday School desk works (`committed`)

**Owner ask:** after the four-phase audit, *"FIX ALL Feature reality, IMPLEMENT Minor and polish AND FIX
Major — 10 findings"*. Three of the four report sections were approved. The two fake-success blockers
(mock Paystack webhook, simulated SMS/gift success) were **not**, so they are exactly as they were — this
log entry does not claim otherwise.

**The switch was the shared rule.** `@ForModule(key)` on the controller plus `ModuleGuard` last in the
chain means Settings → App sections closes the endpoint, not only the link. Measured against the running
API with a wildcard-permission token, so only the switch could produce the refusal: **9 of 9 switched-off
sections 403 with the section named** (Services ×2 endpoints, Care ×2, Serving team, Events, Follow-up,
Special offerings, SMS, Departments, Branches) and **5 of 5 switched-on sections 200** (Members, Expenses,
Finance, News, Children roster). `module-coverage.spec.ts` fails the boot if a key in `MODULE_KEYS` claims
no controller, and rejects a typo like `@ForModule('peple')` — a switch cannot be decorative and cannot be
misspelled into silence.

**The desk, and the one class rule.** `SUNDAY_SCHOOL` did not hold `checkin:write`, so the Children hint
promised a page the role could not open. Granting `checkin:write` was rejected: it is the door register for
the whole service, and it would have put `/children` in the usher's menu while the API still refused it.
The role got its own `children:write` instead, and the narrowing lives in one file
(`apps/api/src/common/class-scope.ts`) that Care and the desk both read — `deskRosterChildIds` for the
pickup list (office + the teacher's own class), `deskMoveChildIds` for the desk (office + door team + own
class). The usher's existing desk access is unchanged, so nothing was taken away to give the teacher theirs.

**Proven in the running app, not in a test.** Teacher roster = own class only (Kofi Mensah); office roster
= both children; usher roster = 403 naming the office and the class teacher; teacher check-in of a class
child = 201 with tag + code; teacher check-in of another class's child = 403 *"That child is not in your
class."*; teacher `POST /checkin` = 403 (no widening); usher desk = 201 as before; release by code = 201 and
the room list back to empty. Then the same cycle by hand in the browser at desktop and at 390px: pick child,
pick guardian, ticket **T481329 / 721261**, release on the code, *"Kofi Mensah was handed over."*, Inside
now 0 → 1 → 0.

**What the browser found that the API test did not.** With Services switched off the desk's service picker
rendered **empty and unexplained** — `GET /services` is worship-gated, so the feature just approved was
unusable in exactly the churches the switch is meant for. Fixed by `GET /children/services`, which reads
through `ServicesService.list` rather than the table: that keeps the one rule that opens today's service on
the first read of a Sunday morning. Verified by pointing the demo church's weekly day at today — the desk
read created the service row itself, the picker filled, and the schedule was restored to Sunday afterwards.
An empty list now says why instead of showing a blank box.

**Two more dead ends closed.** The nav's empty state used to print nothing at all; it now separates *"No
page matches …"* from *"Nothing is switched on for your role yet…"*, verified by switching Children back off
under the teacher. And the brand mark went to `/dashboard` for every role instead of inheriting the first
menu item.

**Counts.** shared 126/126 (15 files) · api 114/114 (10 files, +15 this batch: 12 class-scope, 3 desk) ·
`typecheck` clean in both apps · eslint clean · `check:secrets` clean. Verified at desktop and 390px over
the children's desk, the teacher/usher/office menus and the switched-off `/checkin`.

**Local dev fixtures (Postgres only — Neon was not touched).** Demo user `+233240000110` given the demo
password, made active, and assigned the *Children Ministry* bracket with segment ALL; two `MemberGuardian`
pickup links (Kofi Mensah and Emmanuel Appiah ← Akosua Nyarko), because the demo church had none; one
service row dated 4 Nov, created by the desk read itself.

**Left for the batch that owns it, not silently fixed.** `PermissionsGuard` returns `false`, so a permission
403 prints Nest's generic *"Forbidden resource"* while a switch 403 names the section — one voice for both
belongs with the shared notice banner in Batch 3. And the dashboard still offers **Check someone in**,
**All services →** and the *Latest service* card while Services is off; the page answers honestly with
*"Area switched off"*, so nothing is unsafe, but the card should follow the switch. Also Batch 3.

## 2026-11-04 — Audit round 4, Batch 2: the money on screen told the truth (`committed`)

**Owner ask:** the same approved line — *"FIX ALL Feature reality, IMPLEMENT Minor and polish AND FIX
Major — 10 findings"* — with Batch 2 covering the four money findings: welfare showed ciphertext, a
special-offering campaign counted every later gift forever, the dashboard's money card had no date, and the
member statement PDF did not exist. The two fake-success blockers were **not** approved and are untouched.

**The encrypted notes had never been readable, by anyone.** `encryptNote` sealed with AES-256-GCM and threw
the 16-byte auth tag away, so `decryptNote` could not authenticate a single note ever written — and the
welfare list shipped `descriptionCipher`, `nonce` and `keyVersion` to the browser instead of the words. The
tag now travels appended to the ciphertext (no schema column), `decryptNote` sets it on read, and the list
returns `description` in words with the cipher material kept on the server. Rows written before the fix
cannot be recovered (GCM without its tag cannot be opened at all), so `openNote` returns `null` for those
and one dead row no longer 500s the whole screen. Proven live with an admin token: `GET /welfare` returned
*"Two months of rent behind; the family is keeping it quiet."* and no cipher fields; `Approve` in the
browser flipped the badge to Approved and the waiting count 2 → 1.

**Welfare had no screen its own approvers could reach.** `/care` is usher/teacher-only on purpose (owner
decision), but `welfare:read` belongs to finance, follow-up and elder — so the decrypted list had no live
consumer. Welfare moved to its own **/welfare** page in the Money area, gated by `welfare:read` and by the
Care switch (the endpoints are `@ForModule('care')`). `/care` lost the welfare card and kept the prayer wall
and visits. Verified at 390px: admin sees the table with the situation text, the table card scrolls 190px
to reach Approve/Decline, and the usher's `/care` and its two-link rail are unchanged; the usher has no
Welfare link (no `welfare:read`).

**Campaign totals counted the future.** A campaign summed gifts from its start with no end, so two campaigns
on one fund reported the same number forever. `campaignRaisedWhere` now bounds by `paidAt < endsOn + 1 day`
(the end date is inclusive) and launch accepts an end date. On real demo gifts (Building fund: Sep 494,000 /
Oct 201,000 pesewas): bounded Sep = **494,000**, open-ended = **695,000**, and the seeded Sanctuary campaign
shows **GHS 6,950.00** with *"23 Aug 2026 – 19 Feb 2027"* on its card.

**The money card now says which Sunday.** It read `GHS 3338.00` under a bare *"Offering"* label; it now
reads **"Offering on 18 Oct 2026 (11 entries)"**, verified at desktop and 390px.

**The statement is a real file.** `statement(year)` used to page `myGiving`'s 200 rows and filter in
JavaScript — a year with more than 200 gifts silently under-reported. It now queries `paidAt` within the
year in the database and totals every row. The portal downloads it through the same dependency-free PDF
writer as expenses: **statement-2026.pdf, 1,557 bytes, `%PDF-1.4`**, containing the church name, the member,
`Total given: GHS 1132.00` and `5 gift(s)` — for a member whose five gifts sum to exactly 113,200 pesewas.
The statement screen also gained the error banner it never had.

**Member mode keeps the session (owner ask while verifying).** The 30-day portal token lived only in React
state, so every reload cost the church another SMS code. A *Keep me signed in on this phone* tick (on by
default) writes the token to this phone's storage; without it the token lives for the open tab only. A
revoked token lands on the sign-in form, not an error. Verified in the browser: signed in, reloaded —
still *"Welcome, Akua Danso"*; *Sign out* cleared storage and returned the phone form.

**Found on the way, deliberately not fixed (not approved).** Portal sign-in cannot complete for a church with
no SMS wallet: the OTP row is created, but no code is queued and the member has nothing to type. The demo
church has no `SmsWallet` row at all. This sits inside the fake-SMS blocker the owner withheld; the OTP was
exercised locally by seeding a challenge row (deleted afterwards).

**Counts.** api **128/128** (14 files, +14 this batch: 4 crypto, 4 welfare, 4 campaign window, 2 statement)
· shared 126/126 (15 files) · `typecheck` clean in both apps · eslint clean · `check:secrets` clean.
Verified at desktop and 390px on /welfare, /care (admins and ushers), /campaigns, the dashboard card and the
portal (sign-in, reload, statement, PDF, sign out).

**Local dev fixtures (Postgres only — Neon untouched).** Care and Special offerings were switched on for the
demo church to test, then restored to off; the two scratch welfare requests and the seeded OTP challenges
were deleted.

## 2026-11-04 — Audit round 4, Batch 7: members send notices, leaders approve (`committed`)

**Owner ask (4 Nov):** *"allow member mode to put in announcements and prayer requests, with ability to
attach pics"*, then *"the announcement put in must go to church leaders and if approved shows to
everybody"*.

**What was built.** Schema `12_member_posts`: `Announcement.submittedByMemberId`, `Announcement.moderation`
(default APPROVED so staff notices are untouched), `PrayerRequest.photoDataUrl`. The companion gained a
**Notices** tab: a member writes a notice (title, body, optional photo) and sees where each one stands —
*Waiting for a leader* / *Approved* / *Not approved*. Prayer requests accept a photo too. Photos go through
the same `fileToPhotoDataUrl` shrink (≤ ~200 KB) and server-side `normalizePhotoDataUrl` as member photos.

**The leaders' queue.** `/announcements` shows **Waiting for a leader (n)** above the published list;
Approve/Decline calls `POST /announcements/:id/moderate` (`campaigns:write`, audited as
`announcement.approve|reject`). The public list (`GET /announcements`, portal home, portal own-notices)
only ever reads `moderation: 'APPROVED'`.

**The switch, on the API path.** Settings → App sections has *"Let members send in notices and prayer
requests"*, stored as `Church.settings.memberPosts` (off by default). `memberPostsOn()` requires it **and**
News to be on — with News off a notice has nowhere to appear and the leaders' queue lives on that page.
`POST /portal/posts` and a prayer with a photo are refused by the API when it is off, not merely hidden.

**Proven.** Unit: 5 new (`member-posts.spec.ts`) — switch truth table (3) + approved/pending list filters (2).
Live, API: submit 202 PENDING → leaders' `?pending=true` shows it, the public list does not → approve →
public list does; switch off → **403** on the notice and on a prayer photo; switch on → prayer photo **200**.
Live, browser at 390px: Notices tab, notice sent, *"Waiting for a leader"*, staff queue **Waiting for a
leader (1)** → Approve → *"Approved — everybody can see it now."* and it appears under Published; 0 overflow.

**Counts.** api **133/133** (15 files) · shared 126/126 · typecheck clean in both apps · eslint clean ·
`check:secrets` clean. Demo church has the switch **on** so the owner can try it; the scratch notices,
prayer rows and seeded OTP challenges were deleted. Migration applied to the **local** Postgres only.

## 2026-11-04 — Audit round 4, Batch 8: reminders, the notification pane, and welfare routing (`committed`)

**Owner ask (4 Nov):** choose who a welfare request goes to (leaders or one member); let announcements and
reminders arrive on members' phones; give leaders a reminder section to broadcast one message; stop two
leaders sending the same message twice; and schedule 1 week / 3 days / 1 day before a program, announcements
included.

**Reminders.** New `/reminders` under Reach (`campaigns:write`), with a *Send a reminder* shortcut on the
Today card. One message goes to the whole church immediately, or a program date turns it into 7/3/1-day
reminders. The text is normalised (case, spacing, punctuation) and hashed into a per-church unique key: a
second leader gets **409** — *"This exact message was already sent (04/11/2026). Schedule it for another day
or change the wording."* — proven by API and in the browser with `choir PRACTICE` vs `Choir practice`.
Announcements can carry the same program date + offsets; those keys include the announcement id so two
different notices with similar words do not block each other.

**The pane.** `Notification` grew into a real model (the old, unused table had no scheduling columns — added
additively, no rows lost). The companion header has a bell with an unread count and a pane listing due
reminders, polled every 45 s and marked read when opened. Honest limit: this is the in-app pane; OS-level
push still needs the VAPID keys the church has not set, so nothing here claims a phone notification when the
app is closed.

**Welfare routing.** `WelfareRequest.assignedToMemberId`; the /welfare form asks *Who handles it* — the
leaders (default) or one member. The leaders always keep their list; the chosen member sees it in the
companion under *Help you were asked to follow up* with the decrypted situation and amount. Proven live:
assigned GHS 300.00 school-fees request appeared for Akua Danso with its text readable, and the staff list
shows *"With Akua"*.

**Proven.** Unit **5 new** (`reminders.spec.ts`): key ignores case/spacing/punctuation, 3-row schedule at
program −7/−3/−1 days, single now-row without a program, duplicate refused. Live: 201 now-send · 409
duplicate · 201 three scheduled rows · portal pane unread 1 → read → 0 · assigned welfare decrypted.
Browser at 390px: send, duplicate refusal sentence, scheduled/sent list, bell `🔔 1` → pane → cleared, help
card; 0 overflow.

**Counts.** api **138/138** (16 files) · shared 126/126 · typecheck clean both apps · eslint clean ·
`check:secrets` clean. Migration `13_notifications` applied to the **local** Postgres only. Care was switched
on for the welfare test and restored off; test notifications, the test request and seeded OTP rows deleted.

## 2026-11-04 — Audit round 4, Batch 9: code-gated self-join, and messages that clear themselves (`committed`)

**Owner ask (4 Nov):** *"add the self add such that a single code is given to members … so outsiders do not add
unnecessarily or do u think we should make it open?"* and *"'approved, everybody can see it now' toast does
not go away — fix that and all similar instances. push to git when done"*.

**Recommendation, and what was built: keep it closed.** An open join link puts a stranger's record — and
their phone number — on the church list, and that phone can then read the companion (notices, giving history).
So self-add is **one church code**, 8 characters with no look-alike letters (no 0/O, 1/I) so it can be read
out loud. Settings → App sections has the switch, shows the code and the shareable link, and can rotate it.
The public page is `/join/<church-id>`; the API checks enabled + code (case/space-insensitive) and refuses a
phone already on the list (*"That phone is already on the church list — sign in instead."*). The new member
is created immediately with a member number and the right age bracket, so they can sign in to the companion.

**Proven live:** wrong code → **403** *"That code is not right…"*; correct code typed lower-case → **201**
`M00048` with DOB 1990-05-04 resolved to a bracket; same phone again → **400** duplicate. Page checked at
390px; the test member was deleted afterwards.

**The sticky toast, fixed as a rule.** Every success/error banner now renders through one component
(`components/notice.tsx`): success clears in 6 s, errors in 12 s with a close ×. The sweep replaced **38
files** (33 single-line banners + 5 multi-line ones across the platform console and billing panel); three
remaining accent cards are real content (check-in ticket, children ticket, graduation list), not messages.
Verified in the browser: a reminder's *"Sent — it is in everybody's notification pane now."* was visible at
1.5 s and gone by 7.5 s, and a join-page error cleared by itself after 12 s.

**Counts.** api **142/142** (17 files, +4 join-gate tests) · shared 126/126 · typecheck clean both apps ·
eslint clean · `check:secrets` clean. Test notification and test member deleted; demo church has self-add on.

## 2026-11-04 — Audit round 4, Batch 10: a door toolkit that fits an usher (`committed`)

**Owner ask (4 Nov):** *"the usher must be able to submit count of members who came, submit count of money
collection, give members QR to add themselfs… allow usher mode to fit all the functions (although anyone can
be usher for a particular day)"*, then *"change add member to check in, let usher only be able to enter say
monies counted not see financial sheet"*, and *"put a actual qr in the app"*.

**Usher mode now holds the whole door.** Check-in takes a scanned card **or** a typed member number/phone in
one box (`POST /checkin` resolves qrToken hash, memberNo or phone; repeat is idempotent, bogus is 404).
`/collection` lets the door enter the amount counted only — new `collection:write` permission, a server path
that opens/uses the `Door count — <service>` batch and records a PENDING cash figure, and **no** finance
sheet: `GET /finance/batches` stays 403 for the usher while the count returns 201. Attendance counting
(`headcount:write`) stays on the Attendance page. Any staff member with `headcount:write` + `services:read`
can switch to usher mode (unchanged).

**Real QR codes.** `qrcode` renders actual scannable codes: the **join QR** (church link) on `/join-card`, the
office's `Join code` page, and inside Check-in as *"New here?"*; and each member's **own check-in QR** in the
companion home, built from their member number — the same value the door's check-in resolves. No "paste a
token" box any more.

**Wording clean-up.** Requirement tags are gone from the UI: "Denomination preset (R4.10)" is now
"Denomination wording", and stray `R4.x` markers were stripped from page comments.

**Proven live.** Usher `/auth/me` = `headcount:write, checkin:write, collection:write`; finance batches **403**
vs collection **201** (5,000 → 12,345 pesewas PENDING row in the `Door count` batch); missing service **400**;
check-in by `DEMO-1001` **200**, repeat (lower-case) `alreadyCheckedIn`, `NOBODY1` **404**. Browser at 390px as
the usher: nav = Today · Check-in · Attendance · Visitors · Collection (no Add member, no Offering), the
New-here QR renders, collection shows *"Counted in. The treasurer will approve it."*, 0 overflow.

**Counts.** api 142/142 (17 files) · shared 126/126 · typecheck clean in api/web/shared · eslint clean ·
`check:secrets` clean. Test money rows, attendance and seeded codes deleted; worship switched on for the test
and restored off. Neon untouched.

## 2026-11-04 — Collections at programs that are not services (`committed`)

**Owner:** money is collected at other programs too (harvest night, a funeral, a fund drive), so the count
cannot be tied to a Sunday service. `GivingBatch.serviceId` is now nullable (migration
`14_program_collections`), and the collection screen asks **"For what?"** — a service from the list, or
*Other program…* with a name. The batch label is what the treasurer reads: `Offering count — <service>` or
`Offering count — <program>`. A count that names neither is refused (*"choose the service or name the
program"*). 4 unit tests. Proven live: *Harvest night* → 201, batch `serviceId: null`,
label `Offering count — Harvest night`; browser at 390px shows the service list plus Other program, and
submits with the typed name. api 146/146 (18 files) · shared 126/126 · typecheck/eslint/secrets clean.
Test rows deleted.

## 2026-11-04 — Audit round 4, Batch 11: the door stays open, and a card belongs to one church (`committed`)

**Owner:** "the qr is not there, i want ushers to be able help members check in", then "make sure qr is
specific to each church".

**The door was inside the Services section twice over.** `CheckinController` carried a class-level
`@ForModule('worship')`, so with Services switched off the usher's `POST /checkin` answered 403 *"Services is
switched off for this church"* — and the nav item inherited the area's `module: 'worship'`, so the Check-in
link (and the join QR on it) disappeared entirely. Reproduced with curl as `+233550449843` before touching
code. The door is not the attendance screen, so the section switch now closes only the attendance *list*
(`GET /checkin`, `@ForModule('worship')` + `services:read`); the desk itself runs on `checkin:write` through
two new routes — `GET /checkin/setup` (the Sunday to work + how many are in) and `GET /checkin/find`
(name / member number / phone, flagged with who is already inside). `/checkin` is `standalone` in
`lib/access.ts`, which skips the section switch and keeps the permission; the same rule is read by the
dashboard and Visitors through one `doorView()` helper instead of three per-screen copies.

**Two defects the live test caught.** The count came from `headcount.totals.netTotal`, which only maps
`isActive` sections, so a member auto-sorted into a section the office switched off was invisible: the door
said 1 after taking two people in. It now counts `Attendance` rows for that service. And checking in one
person from the search results marked **every** row "In already"; only the tapped member flips now.

**Church-scoped cards.** The companion QR encoded the bare member number, and member numbers repeat across
churches — the same card checked in whoever held that number in whichever assembly scanned it. The payload
is now `chms-card://<church-id>/<member-number>` (`packages/shared/src/card.ts`, mirrored in
`apps/web/src/lib/card.ts` because the web app cannot import shared); the door reads the reference inside it
and refuses a foreign church **by name** rather than matching the wrong person. Coverage of every QR the app
issues: 3 screens — companion card (changed), join QR inside Check-in and on `/join-card` + Settings (both
already carried the church id in `/join/<slug>`). A typed member number or phone still works unchanged.

**Proven live, worship OFF, 390px, as the usher.** `GET /checkin/setup` 200 (8 services, current service +
count); find by first name, both names in either order, member number, phone; `POST /checkin` 200 with the
section named; repeat → `alreadyCheckedIn`; `chms-card://grace/MEM-0001` → 400 *"That card belongs to another
church (grace) — it cannot be used here."* shown on the phone screen; `chms-card://demo/MEM-0001` → 200
counted in a section; the companion renders the card QR for a signed-in member (MEM-0001) and the door
accepts what it encodes. 0 failures over 3 door screens; test attendance and auto-checkin headcount rows
deleted afterwards (service count back to 0).

**Counts.** api 155/155 (19 files, +9 door tests) · shared 130/130 (16 files, +4 card tests) · typecheck
clean in api/web/shared · eslint clean · `check:secrets` clean. `@chms/shared` rebuilt so the API picks up
the new exports. Neon untouched.

## 2026-11-04 — Audit round 5: every role, what it can actually do (`awaiting approval — nothing here is built`)

**Owner:** "audit each particular user of the app and their permissions and actions allowed, suggest
recommendations". Method: the role→permission table in `packages/shared/src/permissions.ts:64-173`, every
`@RequirePermissions` / `@ForModule` / `@Authenticated` / `@Public` in `apps/api/src/**`, the nav +
`ROUTE_ACCESS` rules in `apps/web/src/lib/access.ts`, and the live demo data (19 staff accounts in the
`demo` church). Guard chain as verified: `guards.ts:132` 500s a route that declares nothing, `guards.ts:144`
ANDs the listed permissions, `guards.ts:174` **allows** any route that omits `@ForModule` — so a missing key
is a silent hole in the section switch, not a closed door.

**Findings, with what I re-checked before believing it.**

1. **`giving.controller.ts` is the only money controller that doesn't honour the Money switch.** Class-level
   `@ForModule('money')` is absent; only `GET transactions` (`:66`) declares it. `POST funds` (`:80`),
   `GET funds` (`:44`), `quote` (`:50`), `initialize` (`:57`), `GET/POST settings` (`:86`, `:92`) all stay
   reachable with Money switched off. Two of those are exactly what the public `/give/<slug>` page calls
   (`quote`, `initialize`), so gating the whole controller also stops public offerings — the owner's call,
   the same shape as the door exemption shipped in Batch 11. **Corrected:** the earlier draft claimed
   `DELETE /sms/opt-outs/:phone` needed only `sms:read`; it is `sms:send` (`sms.controller.ts:55`).
2. **The children's desk answers `@Authenticated()` and authorises deeper down.** `POST checkin` (`:259`),
   `POST checkout` (`:293`) and `GET roster` (`:270`) declare no permission; the real rule is
   `deskMoveChildIds()` / `deskRosterChildIds()` (`class-scope.ts:58-79`), which throws for anyone without
   `members:write` / `checkin:write` / `children:write` — and it does run before any write
   (`children.module.ts:25-27`, `:91`, `:130`). So no member can walk off with a child; but the permission
   is invisible to the guard chain, to the boot check and to a reviewer reading the controller.
   **Corrected:** `children:write` is live (used in `class-scope.ts:60,75` + `access.ts:196`), not dead.
3. **Six permissions are granted but required by nothing:** `church:write`, `users:read`, `users:write`,
   `sms:purchase`, `audit:read` (grep: only `permissions.ts:40` + `guards.spec.ts:85`), `members:import`
   paths aside. FINANCE_ADMIN is handed `audit:read` and `users:read` that open no door.
4. **Usher mode is switched by `headcount:write`, which no nav item or route rule uses**
   (`(app)/layout.tsx:54,108`) — eligibility is decoupled from what the rail actually shows.
5. **`/collection` nav and route disagree on the Money switch.** Nav item carries `module:'money'`
   (`access.ts:295`) but `ROUTE_ACCESS` (`:315`) lists only `collection:write`, and `itemSwitches()` scans
   `NAV_AREAS` where `/collection` never appears — so typing the URL reaches the page. The API behind it
   (`finance.controller.ts` class-level `@ForModule('money')`) still refuses the data, so it is a dead
   screen rather than a leak.
6. **`ELDER` and `FOLLOWUP_TEAM` hold `care:read/write/moderate` and see no Care anywhere** — the role gate
   `CARE_ROLES = ['USHER','SUNDAY_SCHOOL']` (`access.ts:175,229,317`) hides the nav and denies `/care`,
   while `/welfare` (no role gate) stays open. This is Batch-1-era intent, but it means those grants are
   dead weight on two roles.
7. **`POST /demographics/promotions/run` needs only `members:write`** (`demographics.controller.ts:72`) and
   no switch; `POST /push/subscribe` needs `members:read` (`push.module.ts:37`). Branch transfer approval is
   `members:write` (`branches.module.ts:197`) — a member-editing role approves a transfer between branches.
8. **`/about` is the only `(app)` screen with no `ROUTE_ACCESS` entry** (`access.ts:310-338`), and
   `canAccessPath` returns `true` when nothing matches (`:435`). Deliberate per the page comment, but it is
   the one screen where "no rule" means "open".

**Not touched:** `dev.controller.ts:41` mock-Paystack completion (`@Public`) and the simulated SMS/gift
success — the two blockers the owner explicitly did not approve. `platform/*` skips church RBAC by design
(own PlatformGuard).

**Recommendations put to the owner (awaiting a yes per line):** gate `giving` on `money` and decide the
public-give exemption · put a declarable permission on the three children's-desk routes · delete the dead
grants · re-key usher mode off `checkin:write` · give `/collection` its `module:'money'` route rule ·
decide whether ELDER/FOLLOWUP_TEAM keep `care:*` at all · separate `promotions:run` / `branches:write`
permissions.

## 2026-11-04 — Audit round 5 approved, Batch 12: the giving door answers to the church (`committed`)

**Owner:** "for the point one give a prompt when turning books off, app should act on user response,
implement audit log and point 2. do 4 and 5 and 6. decide on 7" — points **1, 2, 3, 4, 5, 6 approved**,
point **7 is mine to decide**. Point 3 (the audit-log screen) is built on `audit:read`, which was one of the
six grants that opened no door (`round 5` finding 3), so it is the next unit rather than part of this one.

**Point 1 — the switch asks, and the API obeys.** `apps/web/src/app/(app)/settings/page.tsx` renders "The
link members use to give online" only while `!modules.money`: two radios, *Keep it open — only close the
books* (default, and forced back to that whenever Offerings is on) or *Stop online giving too*. The answer
rides on the same `POST /churches/me/profile` call as the section switches, lands in
`Church.settings.moneyOffStopsGiving` (Json column — no migration), and invalidates the module-flag cache.
`givingStopsWithBooks()` in `packages/shared/src/modules.ts:1` is the one reader of that flag; the web app
never has to know it, because the closure is enforced server-side.

`@PublicIntake('money')` (`apps/api/src/common/decorators.ts`) marks a `@Public()` door a section switch may
close. `ModuleGuard` (`guards.ts`) now checks the intake key **before** the `@Public` early-return, reads
`req.body.churchSlug` (guards run after body-parser, before validation — the same fact `rate-limit.ts` relies
on), and calls `givingDoorClosedForSlug()` in `common/module-flags.ts`: a TTL-cached platform lookup of the
slug, and an unknown slug counts as closed so a typo cannot get through. The message names the church's own
answer, not a section id.

**A blocker that was hiding under point 1: anonymous giving had never worked.** The only caller of
`POST /giving/quote` / `POST /giving/initialize` is the public `/give/<slug>` page, and both carried
`@RequirePermissions('giving:read')` — so a giver with no session got `401 missing bearer token`. This is why
the controller had no class-level `@ForModule('money')`: gating it as it stood would have closed the door the
round-5 report said was already closed. Fixed by making them slug-keyed public intake: `quoteForSlug` /
`initializeForSlug` resolve the church from the slug and then check the fund with
`where: { id, churchId, isActive: true }`, so a giver cannot pay into another church's fund. The two
user-session methods were deleted (no caller), and the shared `quoteCore`/`initializeCore` bodies now audit
with `actorId: null` plus the request ip — the row records the act, not a staff id. **Audit log still to
build (point 3); this unit only makes sure the anonymous rows are honest when it is read.**

**Point 2 — the desk declares its rule.** `@AnyPermission(...)` is the OR form of `@RequirePermissions`
(`PermissionsGuard` ANDs one list, ORs the other; `boot-check.ts` accepts either, so default-deny still
fails a route that declares neither). `POST /checkin` + `POST /checkout` = `members:write` / `checkin:write`
/ `children:write`; `GET /roster` = `members:write` / `children:write`. `class-scope.ts` is untouched — the
office/door/own-class narrowing is still the second lock, and a Sunday School teacher still cannot move a
child outside their class. What changed is that the rule is now visible to the guard chain, the boot check
and whoever reads the controller.

**Coverage.** 165/165 API tests over 19 files, 132/132 shared over 16 files; api + web typechecks clean;
`eslint .` clean; `check:secrets` clean. New: 4 `AnyPermission` guard tests, 3 give-door guard tests,
3 desk-metadata tests, 3 `givingStopsWithBooks` tests, 2 integration tests re-pointed at the slug methods.
Live at 390px (chrome-devtools, `demo` church, signed in as the super admin): prompt appears when
Offerings is unticked and vanishes when it is re-ticked → "Stop online giving too" + Save →
`POST /giving/quote` **403** with the church's own wording and `/give/demo` shows the closed notice with no
form → "Keep it open" + Save → **200** `{"chargedMinor":5000,"netToFundMinor":4892}` with Offerings still
off → Offerings back on → **200**, and the DB reads `modules.money: true, moneyOffStopsGiving: false`.
Anonymous quote + initialize were also proven earlier in this unit (200 with a mock `authorizationUrl`,
`audit_event` row with `actor_id: null`, `ip: "::1"`).

**Still honest about:** the give page was verified against the mock Paystack path only, so "money arrives in
the fund" is the pre-existing live-keys gap — not a new one. Camera QR scanning, OS-level push (no VAPID
keys), and the usher's manual headcount counter behind the Services switch are unchanged.

---

## 2026-11-05 — Batch 13: the Activity log, point 3 (`committed`)

**Owner ask:** *"impement audit log"* — the third of the six points approved in round 5. The hash chain and
`appendAudit` already existed (round 1 of the audit, `extras.sql` + `packages/db/src/audit.ts`); what did not
exist was any way for a pastor or a treasurer to *read* it. `audit:read` had been in the permission list
since the beginning and required by nothing — round-5 finding 3 counted it among six dead grants.

**What is new.** `apps/api/src/audit/` (`AuditService` + `AuditModule`, three routes and no more) and
`apps/web/src/app/(app)/audit/page.tsx` + `apps/web/src/lib/audit-labels.ts`. The page is a table of When |
Who | What | From, newest first, with a search box, a "which part of the app" filter built from the prefixes
this church actually has (`/audit/groups`, so a church never sees a section it has not used), a cursor
button for older pages, and a **"Check nothing was changed"** button that runs `auditVerify` over the whole
chain and answers either "every line still matches the one before it" or the `seq` that breaks. Copy on the
page says plainly that nobody can edit or remove a line — "not the pastor and not us: the database turns
that attempt away" — because the table really is trigger-append-only.

**Three decisions worth keeping.**
1. **The church filter is written into the SQL, not trusted to RLS.** `extras.sql` only forces row-level
   security on tables that spell the column `churchId`; `audit_event` spells it `church_id`, so it has
   none (verified live: `relrowsecurity=false` for `app_user`). Every query carries
   `e.church_id = $n::uuid` itself, and a new caller cannot inherit the filter by accident.
2. **`before`/`after` never leave the API, and the search never touches them.** The screen says what
   happened to a record, not what the record contains; searching whole-record payloads would turn the page
   into a way to fish a value out of the database one guess at a time.
3. **Opt-in switch, default off, and the hint says what switching off actually does**: "Switching this off
   hides the page — the app keeps recording either way." A church must not be able to stop the evidence by
   hiding the window.

**Proof.** 10 new tests (`apps/api/src/audit/audit.spec.ts`), including one that pins the controller surface
to exactly `constructor, events, groups, summary` so a write route cannot be added without failing the suite,
and one that fails if the church filter or the payload exclusion is dropped. **176/176 API tests over 20
files, 132/132 shared over 16 files**; api + web typechecks clean; `eslint .` clean; `check:secrets` clean;
`@chms/shared` rebuilt so the running API sees the `audit` key. Live, `demo` church, true 390×844 mobile
viewport (chrome-devtools emulation — `resize_page` alone would not go under ~500px):
78 lines render with **0 unlabelled actions, 0 clipped cells, 0 horizontal page scroll**; group filter
counts match the API on every one of check-in 7 / online giving 1 / offering counts 6 / church settings 26 /
every part 78; actor search "usher" → 14 rows on screen and 14 from the API; a no-match search shows "Nothing
matches that. Try a different word, or clear the filter."; integrity button → "78 lines / 3 of them today /
every line still matches the one before it"; Activity log in the ORGANISATION nav appears when the section is
ticked and disappears when it is not. At the API: section off → **403 on all three routes** with
"Activity log is switched off for this church. Turn it on in Settings → App sections.", section on → 200;
an **Usher** token → 403 (no `audit:read`), and the holders are exactly SUPER_ADMIN (wildcard), PASTOR (all
permissions) and FINANCE_ADMIN — the three who should read it, so no grant needed changing.

**A measurement error of my own, corrected.** The first theme sweep reported night mode at **1.16:1** on the
table cells. It was wrong: my background walk treated the zebra stripe `rgba(255,255,255,0.024)` as opaque.
Re-run with proper alpha compositing, the sweep over **all 19 themes** gives a minimum of 4.52:1 (rosewood,
the small-caps "When" header) — every theme passes WCAG AA for body text. Also corrected mid-unit: an
in-browser `fetch('/api/v1/...')` hit the **Next origin on :3000** and returned a Next 404 page, which is
not the API; the app itself proxies through `lib/api.ts` to :4000, so the switch-off proof is a curl to
:4000 plus the nav/render behaviour on screen, both shown above.

**Not proven, said plainly:** the "Show the ones before these" button. The demo log is 78 lines and the page
asks for 100, so the button never appears there; the cursor itself is covered by `audit.spec.ts` and by
`?limit=2` at the API (`olderThan: 77, more: true`), not by a click. And `apps/web` has no test runner, so
the 79-code label map cannot be unit-tested — an unknown code is printed exactly as recorded with a
"this screen has not been taught" count on the page, so drift is visible instead of silently wrong.

**Also in this commit:** nine `(\`uncommitted\`)` headings in this file flipped to `(\`committed\`)` after
checking each against `git log -S` for the commit that introduced it (`eb6bcca`, `1d87b10`, `349c2f2`,
`0fd04bc`, `9c87a2e`, `8dcb007`×2, `5038fbb`, `ebf9a5a`). They were stale, not a warning about live work.

**Next, in the owner's order:** 4 usher mode keyed on `checkin:write` not `headcount:write`
(`(app)/layout.tsx:54,108`); 5 `/collection` honouring the Money switch in `ROUTE_ACCESS`
(`lib/access.ts:315` — the nav item already has `module:'money'` at `:295`); 6 `ELDER` + `FOLLOWUP_TEAM` in
`CARE_ROLES` (`lib/access.ts:175`); 7 my decision — `demographics:write` and `branches:write` granted to
exactly the roles that already perform those acts, so the gate exists without changing behaviour. Still not
approved to touch: the mock-Paystack completion at `dev.controller.ts:41` and the simulated SMS/gift
success. Permission 403s still print Nest's generic "Forbidden resource" — Batch 3 (#57) owns that voice.

## 2026-11-05 — Batch 14: the door shell keys on check-in, and /collection answers to the Money switch (`committed`)

Points 4 and 5 of the owner's approved list. Both turned out to be one problem seen from two sides: the door
screens were governed by rules that did not name the job or the section that actually owns them.

**What changed.** `headcount:write` decided who was offered usher mode (`(app)/layout.tsx:54` and `:108`)
while no nav item or route rule anywhere in the app names that permission — a tallier with no door duties got
the shell, and a door worker counted out of it. The two calls now use `canEnterUsherMode()` (= `checkin:write`,
the same permission `/checkin` and `POST /checkin` require) and `isDoorOnly()` (`lib/access.ts:316-323`),
placed next to `USHER_NAV` so the rail and the eligibility test read one definition. `services:read` is gone
from the rule: the desk reads its own service list, so the shell must work with the Services section off.
Neither USHER nor LEADER gained or lost a screen — both already hold `checkin:write`.

For point 5 the fix was the shared rule, not the one line. `AccessRule` carries no module; a path's section
switch comes from `itemForPath()` (`lib/access.ts:419`), which scanned `NAV_AREAS` only. Every door-only
screen lives in `USHER_NAV`, so it resolved to zero switches: the rail hid the Collection link while a typed
URL still opened a page whose API answers 403. `itemForPath()` searches both lists now and takes each item's
own `module` — never the rail's `?? 'worship'` area default.

**A regression of my own, caught in the running app.** The first version let that rail default leak into
path resolution, so `/dashboard` became worship-gated and an usher in a Services-off church lost the Today
screen — "Area switched off — Services is switched off for Demo Church" and two rail links instead of six.
Fixed by passing `undefined` for rail items, with a comment saying why, and re-proven open.

**Proof.** As the Usher at true 390×844: usher mode opens by itself on sign-in, the toggle works both ways,
`/collection` → "Area switched off — Offerings is switched off for Demo Church. A church admin can turn it
back on in Settings → App sections.", `/dashboard` and `/checkin` stay open with Services off, and the
service picker lists the 6 programs again once Offerings is re-ticked. At the API: `/finance/collection-service`
200 → **403** → 200 in the same sequence, `/children/services` 200 either way (it is a children screen, not a
money one). Resolver sweep over **21 area paths + 6 rail paths**: four rail links (`/checkin`, `/services`,
`/visitors`, `/care`) also live in `NAV_AREAS` and resolve exactly as before; of the two that live only in the
rail, **exactly one changes behaviour — `/collection`, which now carries the Offerings switch when typed as a
URL** — and `/dashboard` stays switch-free, which is the regression I had to undo. Gates:
**176/176 API (20 files), 132/132 shared (16 files)**, api and web typechecks clean, `eslint .` clean,
`check:secrets` clean. Demo's sections restored to their round-5 state (`people, money, reach, bible,
children, groups, expenses, departments, branches, audit` on).

**Not proven, said plainly:** `apps/web` has no test runner, so `canEnterUsherMode()`, `isDoorOnly()` and the
rewritten `itemForPath()` carry no unit test — the evidence above is a live browser and a live API, not a
suite. A second person flipping the switch on another browser would still see the old shell until the page
reloads, because the section flags ride on the cached `/auth/me` (`lib/session.ts`); that is pre-existing and
unchanged here.

**Next, in the owner's order:** 6 — `ELDER` and `FOLLOWUP_TEAM` in `CARE_ROLES` (`lib/access.ts:~175`), the
care nav and `/care` route rule and the dashboard card all read that one list. Then 7, my decision: grant
`demographics:write` and `branches:write` to exactly the roles that already perform those acts, so the gate
exists without changing anybody's behaviour.

## 2026-11-05 — Batch 15: Care is opened by the permission, not by a copied list of roles (`committed`)

Point 6 of the owner's approved list: "ELDER and FOLLOWUP_TEAM hold `care:read/write/moderate` and see no
Care anywhere." The literal request was to add those two role keys to `CARE_ROLES`. I swept first, and the
sweep changed what the fix was.

**The measurement.** Ten roles × four surfaces that decide whether Care reaches a person — the `/care` route
rule, the office nav item, the door rail item and the dashboard card — driven through the real
`apps/web/src/lib/access.ts` (Node strips the types; `apps/web` has no runner) against
`permissionsForRoles()` from the built `@chms/shared`. Before: **8 of 40 checks disagreed with `care:read`** —
ELDER and FOLLOWUP_TEAM, as the audit said, **and also PASTOR and SUPER_ADMIN**, which round 5 had not
noticed. Four roles held a permission that opened no screen.

**So the list went away rather than growing.** `CARE_ROLES`, `isCareRole()`, the `roles` field on `NavItem`
and `AccessRule`, and the `roles` arguments threaded through `mayOpen()`, `canAccessPath()`,
`visibleNavGroups()` and `visibleUsherNav()` are deleted — Care was the gate's only user anywhere in the app.
`care:read` is now the rule on both sides, which is what `apps/api/src/ministry/care.module.ts:344-413` has
always enforced. The Sunday School teacher is still confined to their own class, because that scope lives in
`apps/api/src/common/class-scope.ts:19` (anyone with `members:read` sees the whole queue) and never came from
the nav. After: **40/40 agree with `care:read`, 0 mismatches**; usher, teacher, elder, follow-up, pastor and
this office open Care, and leader, secretary, treasurer and member do not.

**Proven in the running app.** As the Elder: Care in the nav, `/care` opens, chip reads "Elder · Whole
church", the visit list renders real rows. As the platform admin: `/care` was unreachable before and now
renders "Pastoral care / Prayer wall / Visits & follow-ups". As the Sunday School teacher: unchanged, "Sunday
school · My class". As the Secretary — who must not have it: no nav link, and a typed `/care` answers "Not
available for your role — Care needs a permission your role does not have." At a true **390×844** as the
Elder: **0 clipped elements, no horizontal scroll**. The Care section hint was repainted in
`packages/shared/src/modules.ts` and its hand mirror in `apps/web/src/lib/access.ts`; both strings verified
identical.

**A mistake I made, and how I put it back.** FOLLOWUP_TEAM has no demo login, so to prove the fifth role live
I inserted the role onto the Elder account with `join "Role" ro on ro.key='FOLLOWUP_TEAM'` — and `Role` rows
are **per church**, so the select produced one row per church and the insert wrote **451 rows across 451
churches** instead of one. Same session: 450 foreign rows deleted, the single `demo` row kept for the check
(header read "Followup team · Elder · Whole church", `/care` opened, `GET /prayer` → 200), then that row
revoked too. A count over the whole table now reads **0** `FOLLOWUP_TEAM` rows outside the demo church, the
account is back to `["ELDER"]` and the demo church's Care section is back **off**, which is how this session
found it. The scratch script was deleted, not committed. Lesson recorded here rather than in code: any
`Role`/`MemberRole` join needs `churchId` in its `ON`, not just `key`.

**Gates.** `176/176` API over 20 files, `133/133` shared over 16 files (the new `care:read` holder test is
the +1), api and web typechecks clean, `eslint .` clean, `check:secrets` clean, `@chms/shared` rebuilt.

**Not proven, said plainly:** the follow-up-team case was demonstrated on an account that held the role only
temporarily; there is no permanent `FOLLOWUP_TEAM` login in the demo church, so a fresh install's follow-up
user has not been signed in. And `apps/web` still has no test runner: the deletion of the gate is proven by
the sweep and the browser, not by a web unit test.

**Next, in the owner's order:** 7, my decision — `demographics:write` and `branches:write` split off
`members:write`, granted to exactly the roles that already do those acts so nobody's behaviour changes and
the gate exists for the church that wants to hand one of those jobs out on its own.

## 2026-11-05 — Batch 16: two jobs stop borrowing the permission to edit a member (`committed`)

**The owner's instruction, again:** "…decide on 7". Points 1–6 shipped in Batches 11–15, so this unit is the
one I was given a decision on rather than an order. Round 5's finding was two lines long: *`POST
/demographics/promotions/run` needs only `members:write` (`demographics.controller.ts:72`) and no switch;
branch transfer approval is `members:write` (`branches.module.ts:197`) — a member-editing role approves a
transfer between branches.*

**What I decided, and why.** Both jobs were being paid for with the right to edit *one* person. The promotion
run moves every child who has had a birthday across the whole church; a transfer moves a member from one
congregation to another and waits on a second leader. Neither is a member edit, and a church that wanted to
hand one of them to a worker without opening the directory could not. So I split rather than documented:
`demographics:write` and `branches:write` in `packages/shared/src/permissions.ts`, granted to `LEADER` and
`SECRETARY`, inherited by `PASTOR` from `[...PERMISSIONS]` and by this office from the wildcard. **The holder
set is exactly the four roles that already held `members:write`** — the split creates no new access on day
one; it makes the next grant possible. Nothing needed migrating because `apps/api/src/auth/auth.service.ts:96`
derives a session's permissions from this table on every request rather than from the stored
`Role.permissions` rows.

**Point 6's lesson, applied before it could repeat.** The transfer form is not on `/branches`; it is on
`/org` (`apps/web/src/app/(app)/org/page.tsx:51`), and `/org`'s rule admitted only `church:write` or
`settings:write` — the office and the pastor. So a leader or secretary who *could* post a transfer had no
screen to post it from, which is the granted-but-invisible defect from the last batch, one file away.
`branches:write` is now in that rule and in its nav mirror (`apps/web/src/lib/access.ts:272` and `:349`).
Admitting those two roles to a screen they had never seen meant checking what else that screen offers: the
add-a-branch form posts `POST /branches`, which needs `settings:write`, so it is hidden unless the session
holds it — a newly-admitted role is never handed a control that will fail on it. On the Members screen the
*Update age groups* button was unconditional and 403'd for the treasurer, the usher and the elder; it is
gated on `demographics:write` now.

**Measured, not asserted.** Eight demo logins against the running API, three probes each = **24 outcomes**.
The four holders get `promotions/run` → **201** (dry run: `apply:false` previews only, `demographics.service.ts:192`)
and `branches/transfers` → **400** (past the gate, rejected on the deliberately bogus id, so the probe writes
nothing); the other four get **403** on both. That is the same table as before the split, so the handover lost
nothing. For the web I exported the pre-change table (`git show daabf40:apps/web/src/lib/access.ts`) and ran
both against the same eight live sessions over seven paths plus the button: **64 checks, 5 changes, all of
them intended** — `/org` closed→open for Secretary and Leader, the promotions button shown→hidden for
Treasurer, Usher and Elder, and **0** changes on `/members`, `/branches`, `/care`, `/groups`, `/roster` or
`/collection`, in nav or in route.

**Live UI.** As Secretary: Organisation opens with headings Branches / Transfer member / Households, two
forms, and no *Add* branch form. As Secretary on Members the button is still there. As Elder on Members the
header is down to *Import list* and *+ Add member*. At **390×844** both `/org` and `/members` report a 390px
document width — no horizontal overflow — with **0 clipped controls**.

**Deliberately left where they were:** `POST /branches` stays on `settings:write`; remittances stay on
`giving:write`/`finance:read`/`finance:approve`; and `POST /push/subscribe` stays on `members:read`, because
it stores a device token for the person who is signed in — that is not editing a member record, and it was
the third item in the same audit line. The new spec pins all of these so the next split does not sweep them up
by habit. I also left `promotions/run` with **no section switch**: it still has none, and giving it one would
take the job away from a church that runs it today. That is an owner decision, not mine.

**A gate that is flaky before this batch.** The API suite now runs 21 files, and
`apps/api/test/integration.spec.ts` blows its 5-second timeout for the two tests that create a church when the
suite runs in parallel against the local Postgres. It reproduces **with my new file removed** (174/176 over 20
files, 2 timeouts) and the file itself passes **11/11** when run alone, so the cause is contention, not this
change. My 4 tests passed in every run. Reporting the full-suite counts as 179/180 and 177/180 rather than
claiming a clean sweep I did not get.

**Gates.** `134/134` shared over 16 files (the holder-set test is the +1), `180` API tests over 21 files with
the caveat above, api and web typechecks clean, `eslint .` clean, `check:secrets` clean, `@chms/shared`
rebuilt so the API and the sweep read the new table. The two scratch scripts (the API probe and the old-vs-new
web sweep) were deleted, not committed, as was the exported copy of the old table.

**Not proven, said plainly.** The transfer *approval* half (`POST /branches/transfers/:id/approve`) has no
screen in the app and there is no GET that lists pending transfers for one to be built on, so nothing in the UI
calls it: the new permission is proven live on the request half and pinned by decorator on the approve half.
The demo church's "Pastor" login (`+233550449840`) is stored as `SUPER_ADMIN`, so the `PASTOR` role key was
verified through the shared table and not through a sign-in. And `apps/web` still has no test runner — the
`/org` rule change and the button gate rest on the sweep and the browser, not on a web unit test. The
neighbouring *Import list* and *+ Add member* buttons on Members are still offered to roles that cannot use
them (`members/page.tsx:209-210`, needing `members:import` and `members:write`); that is the same class of
defect, one screen wide, and I did not fold it into this unit.

**Next, in the owner's order:** round 5 is finished — points 1, 2, 3, 4, 5, 6 approved and shipped, 7 decided
and shipped. Five commits sit unpushed (`54e3d1a`, `4f7ab0d`, `f2a6f46`, `daabf40`, this one) and pushing
auto-deploys Render and Vercel, so that waits for a word. After that, the standing leftovers the audit found
but did not own: Batches 3–6 (#57–#60).
