# OPEN_ITEMS — ChMS unfinished work (resume here)

Last updated: 2026-11-06 (Session AF). The single source of truth for every undone
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
- [ ] **#59 Batch 6 — counselling notes screen, `/flyers` link, honest FEATURES.**
      Counselling notes exist API-only (`counselingNote` table, encrypted); either give
      them a screen (#46) or delete the endpoint. Link the share-links page; correct
      FEATURES §15.
- [ ] **#78 — dashboard cards follow every App-section switch.** Services links already
      gate on `mod('worship')`; re-audit the remaining cards against each switch.

## B. Feature backlog (owner-approved, unbuilt)

- [ ] #13 Outreach brainstorm + starter module
- [ ] #33 Class attendance register for the teacher's class
- [ ] #34 Text the guardian on child check-in/out
- [ ] #35 Let a church skip Sunday School on specific Sundays
- [ ] #36 Show allergies to the class teacher only
- [ ] #37 Show allowed guardians on the pick-up row
- [ ] #38 Point the class view at the offline Bible bundles
- [ ] #40 Daily reading as an in-app notification, with its own switch (also #45)
- [ ] #45 Put the daily reading in the app with its own switch (dup of #40 — reconcile)
- [ ] #46 Encrypted counselling notes: screen or delete (feeds #59)
- [ ] #47 Show each Bible's licence on the reader
- [ ] #48 Link the share-links page + correct FEATURES §15
- [ ] #49 Audit the two Twi bundles; get a genuine Akuapem if needed

## C. Honest gaps (not faked — report as such)

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
      before any Neon schema write.
- [ ] Check Neon for seeded **mojibake** in expense/announcement text (the demo seed
      `scripts/tmp-demo-data2.js` had double-encoded em-dashes, now fixed at source; the
      DB rows seeded earlier may still hold them).

## F. Hosting will move (Neon / Vercel / Render are temporary)

The owner will move off Neon, Vercel and Render later. The Privacy Policy names these
as processors, so **when hosting moves, update `PROCESSORS` in
`apps/web/src/app/(public)/legal-meta.ts` and bump `LEGAL_UPDATED`** — every page that
lists processors updates from that one constant. Also re-check the deploy path in
`project-hosting-deploy-path.md` memory and the Render start command (#60).

## Questions still owed by the owner

- None blocking right now (the parallel-session / auto-off and phone-verification
  questions from earlier sessions were resolved or are superseded).
