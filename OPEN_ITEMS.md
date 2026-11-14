# OPEN_ITEMS — ChMS unfinished work (resume here)

Last updated: 2026-11-14 (Session AI). The single source of truth for every undone
prompt and unanswered question. Read this at the start of a new session before
claiming new work. Tick a line only when the change is committed and pushed (which
auto-deploys Render + Vercel).

## A. Approved roadmap batches still open

- [ ] **#58 Batch 4 — phone + keyboard accessibility sweep.** Re-run Phases 1–3 checks
      at desktop AND 390px across all screens; fix focus/tap/keyboard issues; report a
      count ("0 failures over N screens in both themes").
- [ ] **#60 Batch 5 — branch RLS backstop, Render start command, SMS quiet hours.**
      `audit_event` has no RLS policy; Render start command; enforce SMS quiet hours on
      send (not just the UI hint).
- [x] **#59 Batch 6 — counselling notes screen.** DONE. The screen was built (see #46);
      the `/flyers` link and FEATURES §15 corrections are also done (see #48).
- [x] **#78 — dashboard cards follow every App-section switch.** DONE. Audited all 10 widgets
      against `packages/shared/src/modules.ts`. Two gaps fixed (shared rule, not the instance):
      the "Today" card showed its card even when every quick link was switched off, and the
      "Members to check on" card linked to /members while Members & visitors was off. Extracted
      `dashboardQuickLinks()` into `apps/web/src/lib/access.ts` (one rule, used for both the card's
      existence and its links) and gated the churn card's link on `mod('people')`. The other 8
      widgets already obeyed their switches (verified against source). Coverage: 10 widgets audited,
      8 compliant, 2 fixed. Tests: `access.test.ts` (8 cases) pin the link rules including the
      check-in door exception.

## B. Feature backlog (owner-approved, unbuilt)

- [ ] #13 Outreach brainstorm + starter module
- [x] #33 Class attendance register for the teacher's class — DONE. New `ClassRegisterMark` table
      (`migrations/16_class_register/migration.sql`), keyed by a church-local `dateKey` instead of a
      Service so a Sunday School with Services switched off still takes its register. `GET/PUT
      /children/register` (`@AnyPermission('members:write','children:write')`) shows the last 8 Sundays;
      PUT sends the whole class (a child left out is unmarked), rejects a child outside the caller's class,
      refuses a Sunday the church marked off ("there is no register to take"), and appends
      `children.register` to the audit log with date + present/away/classSize only — never the names.
      Verified live at 390px as Demo Sunday School: 8 Sunday chips, 1 Present + 1 Away saved (PUT 200),
      counts and marks persisted across reload; Usher got 403; an account with no class gets an empty
      answer, and the card is hidden. Tests: shared 164, API 227 (permission metadata + refusal cases).
      Also fixed the "office can see this register" line: office roles without a class assignment cannot,
      so the copy now says the office sees the counts in the activity log.
- [x] #34 Text the guardian on child check-in/out — DONE. One text per check-in and per collection,
      sent to the adult recorded as the drop-off guardian. Shared rules in `packages/shared/src/sms.ts`:
      `childPickupMessage()` (first name, church, time — never the pickup code) and
      `childPickupSmsGate()` (switch off → OFF; no phone → NO_PHONE; consent false → NO_CONSENT;
      unreadable number → BAD_PHONE). `notifyGuardian()` in `children.module.ts` adds the SmsOptOut
      check, goes through `SmsDispatcher.dispatch` (source NUDGE, so quiet hours do not hold it) and
      reports back QUEUED | OFF | NO_PHONE | NO_CONSENT | OPTED_OUT | BAD_PHONE | NO_BALANCE |
      QUIET_HOURS; the ticket and the collection notice say what happened ("A text was queued for X.").
      Switch: Settings → SMS → "Guardian texts" (`Church.settings.childPickupSms`, default on), gated on
      the API path, not just the button. Also fixed a re-check-in bug: the upsert now records the adult
      who brought the child this time and restarts the clock. Verified live at 390px with the UI at both
      ends: check-in ticket "A text was queued for Akosua Nyarko." and release notice "…A text was queued
      for Akosua Nyarko."; two SmsLog rows with the right bodies, wallet 488→486; switch off → OFF with
      no log. Honest limit: the worker gateway is still `mock`, so "queued" is the strongest claim —
      nothing was delivered to a phone, and both the Settings card and this item say so. Test data removed
      (wallet refunded to 488/12 via an append-only ADJUST ledger row).
- [x] #35 Let a church skip Sunday School on specific Sundays — DONE. The office picks the Sundays the
      church is away on a "Days off" card on `/children` (8 upcoming Sundays as chips, save persists to
      `Church.settings.sundaySchoolSkips` through `PUT /children/skips`; `GET /children/skips` lets every
      desk role read it). Days are stored as plain `YYYY-MM-DD` keys and validated in
      `packages/shared/src/sunday-school.ts` (`isSundaySchoolDateKey` rejects impossible dates;
      `resolveSundaySchoolSkips` dedupes and sorts). On a skipped Sunday the desk shows a banner ("Sunday
      School is marked off today") and hides **Drop off** while leaving **Pick up** available; "Open the
      desk anyway" restores check-in for that visit. Verified live at 390px: card renders 8 Sundays,
      toggle + save persisted across reload, banner hid Drop off and kept Pick up, open-anyway reopened
      it, no horizontal overflow. Permission finding: the calendar write is gated on `members:write`, which
      LEADER (Teacher) also holds — so a teacher can edit it; only SUNDAY_SCHOOL (desk-only) cannot.
      Corrected the code comment that claimed "only the office" changes it. No migration.
- [x] #36 Show allergies to the class teacher only — DONE. `Member.allergyNote` (same migration) is
      edited in the member drawer only when the caller holds `members:write`; `seesAllergy()` +
      `stripAllergy()` in `members.service.ts` remove the field from list and getOne for every other role,
      and create/update audits mask it as `[recorded]` so the contents never enter the log. The class
      register returns the note for its own children and prints it in red under the child's name. Privacy
      page updated in the same commit (shown to the church office and the child's own class teacher, not
      the rest of the team) and `LEGAL_UPDATED` → 14 November 2026. Verified live: Secretary saved
      "Peanut allergy — carries an inhaler" (PATCH 200) → teacher's register showed it; Usher's drawer
      had no Allergies & health section and the API response carried no key. Test note and marks removed
      after verification.
- [x] #37 Show allowed guardians on the pick-up row — DONE. After choosing a child, the desk prints
      "Who may collect <child>: <names>" from `/children/roster` (already filtered to `canPickup: true`),
      with an explicit "no approved guardian on record" fallback. Verified live at 390px against a real
      check-in (Emmanuel Appiah → Akosua Nyarko).
- [x] #38 Point the class view at the offline Bible bundles — DONE (already satisfied; verified Session AI).
      `BibleDock` is mounted in the `(app)` shell (`layout.tsx:166`), so the Bible button sits on `/children`
      too. Verified live: opening it on the class view lists all 8 bundled translations and renders
      Genesis 1 from the packed KJV — no navigation away from the desk.
- [ ] #40 Daily reading as an in-app notification, with its own switch (also #45)
- [ ] #45 Put the daily reading in the app with its own switch (dup of #40 — reconcile)
- [x] #46 Encrypted counselling notes screen — DONE (verified Session AI). `(app)/counseling/page.tsx`
      (161 lines) is a real screen: pick a member (or a teacher's own class), read their notes, add one,
      share with another leader. Backed by `@Post('counseling')` / `@Get('counseling/:subjectId')`
      (`care.module.ts:363-371`), encrypted at rest via `ministry/crypto.ts`. Follows the Care switch.
- [x] #47 Show each Bible's licence on the reader — DONE. `/bible` shows a visible
      "Licence:" line under the reader (label + licence text per translation; both
      shown in compare mode). Verified live: KJV public-domain line, Twi honest
      "licence not verified" line.
- [x] #48 Link the share-links page + correct FEATURES §15 — DONE. Share-links (`/flyers/:slug`)
      already linked in the sidebar footer (`app-nav.tsx:226`) and renders live with 3 copy-able links;
      FEATURES §15 rewritten to match the source precisely (portal's confirm/decline shifts, RSVP with
      waitlist, member-posted notices/prayer with photo + anonymous, real PDF statement, anonymise-on-delete).
- [ ] #49 Audit the two Twi bundles; get a genuine Akuapem if needed

## C. Honest gaps (not faked — report as such)

- [ ] **Hosted sign-in can take up to a minute.** The API runs on Render's free tier, which sleeps after
      inactivity and needs 25–50s to wake. The sign-in form now says so after 6s ("the server may be
      starting up… please wait") so it no longer looks broken, but the wait is real. Paid hosting or a
      keep-warm ping removes it. (This is what the "only dev and pastor logins work" report actually was —
      see LOGS Session AI; the logins themselves were never broken.)

- [ ] Camera QR scanning is **not implemented** (QR membership cards are hash-token
      based, printed/read, not camera-scanned).
- [ ] OS push needs **VAPID keys** before browser/device push actually delivers.
- [ ] SMS gateway is **mock** (messages recorded, never delivered) — until live keys.
- [ ] Paystack is **mock** (`dev.controller.ts` mock webhook) — until live keys.
- [ ] `/headcount/totals` is still **worship-gated**.
- [ ] `audit_event` has **no RLS** (folded into #60).
- [ ] No permanent **FOLLOWUP_TEAM** demo login exists.
- [ ] Roster/pledge assign forms take a **raw Member UUID** (no name picker).

## D. Standing owner asks still partly owed

- [ ] "Audit each user and their permissions and actions allowed, suggest
      recommendations" — demo logins were delivered; the per-user permission matrix +
      plain-English recommendations still need a written pass.

## E. Data / infra to-dos

- [ ] **Migrations 12 + 13** (`member_posts`, `notifications`) are applied to local
      Postgres only — NOT yet applied to Neon. Apply via `prepare_database_migration`
      before any Neon schema write. **Also 14 (`program_collections`) and 15
      (`programs`)**: the Render start command now runs `prisma migrate deploy`, so
      check the deploy log first — a push to main may have applied 12–15 already;
      only apply manually if not.
- [ ] Check Neon for seeded **mojibake** in expense/announcement text (the demo seed
      `scripts/tmp-demo-data2.js` had double-encoded em-dashes, now fixed at source; the
      DB rows seeded earlier may still hold them).

## F. Hosting will move (Neon / Vercel / Render are temporary)

The owner will move off Neon, Vercel and Render later. The Privacy Policy names these
as processors, so **when hosting moves, update `PROCESSORS` in
`apps/web/src/app/(public)/legal-meta.ts` and bump `LEGAL_UPDATED`** — every page that
lists processors updates from that one constant. Also re-check the deploy path in
`project-hosting-deploy-path.md` memory and the Render start command (#60).

## G. Bible bundles — licence structure + open work (owner ask, 8 Nov)

| Bundle | Label in dropdown | Licence status |
| --- | --- | --- |
| `kjv.json` | KJV | **Free** — public domain (crown copyright expired 2016) |
| `asv.json` | ASV (1901) | **Free** — public domain (1901) |
| `web.json` | World English Bible (WEB) | **Free** — public domain (packed 8 Nov, `scripts/fetch-web-bible.mjs`) |
| `twi.json` | Twi (classic wording) | **Unverified** — extracted from `com.mobobi.twibibleoffline` APK |
| `twi-asante.json` | Twi (modern wording) | **Unverified** — extracted from Akuapem Twi Bible & Audio APK (app labels itself Asante; identity audited in #49) |
| `ewe.json` / `fante.json` / `ga.json` | Ewe / Fante / Ga | **Unverified** — extracted from APKs |
| Asante Twi "Nkwa Asɛm" (Biblica) | *not packed* | **Licensed** — owner emailing GBS/Biblica for permission (9 Nov morning); pack only with written permission, drop-in ready |

Open work:
- [x] **Push the local commits** to GitHub — RESOLVED. After repeated 8 Nov failures
      ("unexpected disconnect while reading sideband packet" / "schannel: server closed
      abruptly" on the ~25MB pack), the link recovered and
      `git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push origin main`
      succeeded (`3edf7ae..363080b`). Remote `main` confirmed == local HEAD `363080b`
      (bundles + Bible labels/WEB + #83 + #85). #47 pushed in a follow-up commit.
- [x] **Side-by-side two-translation reading** (#83) — DONE. `/bible` has a "Read
      alongside" picker; verse-aligned pairs (two columns ≥700px, stacked per verse
      on phones), per-verse copy, missing-chapter handled. Verified live (KJV↔WEB
      Genesis 3, 24 aligned pairs). Fixed two WEB data bugs found while verifying:
      `scripts/fetch-web-bible.mjs` overwrote multi-block verses (kept only the last
      fragment, e.g. Gen 3:16) and left sparse holes as JSON `null`; now joins blocks
      and densifies to `''`. Regenerated web.json (66 books, 31,102 verses; 4 genuine
      critical-text omissions kept empty). Regression guard: `bible.service.spec.ts` (3).
- [x] **Mobile "no way back" audit + fix** (#85) — DONE. Audited every standalone
      page (root layout has no nav): `/bible`, `/flyers/:slug`, `/give/:slug`,
      `/give/thanks`, `/join/:slug` had no way back; `/handoff` had no exit on error;
      `/portal` already has its own tab bar (left alone); `/give/mock-pay` is the
      untouched dev mock flow (left alone). Added one shared `BackBar`
      (`apps/web/src/components/back-bar.tsx`): "← Back" uses history when present,
      else a safe fallback link (never a dead button) + a Home/Dashboard link.
      Applied to the five pages; `/handoff` error gets a "Go to sign in" link.
      Verified live: direct landing Back → `/`; with history Back → prior page;
      `/flyers` fallback shows Dashboard; 24px+ aria-labeled target.
- [ ] **Pack the Asante Twi** once the owner's permission email is answered —
      text itself must not be repacked without that written permission.
- [ ] **Twi edition identity audit** (#49) — labels now say classic/modern
      wording (what the text proves); which edition is Akuapem vs Asante is
      still unverified.

## Questions still owed by the owner

- None blocking right now (the parallel-session / auto-off and phone-verification
  questions from earlier sessions were resolved or are superseded).
