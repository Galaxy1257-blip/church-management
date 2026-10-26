# 006 — Verification Report (Gate 4)

**Scope:** the owner's request *"add to blueprint to update git everytime"* is satisfied when a fresh
session, reading only `BUILD_ORDER.md` / `STATE.md` / `LOGS.md`, cannot miss the rule and cannot repeat
the mistakes it prevents.

## How verification was performed (evidence, not claims)

| Layer | What was verified | Method |
|---|---|---|
| Rule placement | Rule present in all four docs, numbered consistently (no duplicate "8." collision with Phase 1 list) | `Select-String '^\d+\. '` over `BUILD_ORDER.md`; hits at lines 7–14 → `.ecc/docs-rule-check.log` |
| Handoff wiring | §2 rule 9 **and** §10 step 6 both point at the rule, so the end-of-session checklist cannot skip it | `Select-String` on `STATE.md` → lines 46, 205–209 |
| Session journal | Session L appended at EOF with request, rule text, ship record, exclusions, deploy note | `Select-String '^## 2026-10-26'` → line 557 |
| Continuity file | `.ecc/STATE.md` current task = this rule; RBAC task marked shipped; next steps re-ordered | direct read of lines 20–90 |
| Secret posture | No credential in the committed tree; credential helpers untracked; tracked script's bad hunk unstaged | `npm run check:secrets` → clean; `git grep -n -I npg_ HEAD -- scripts` → empty; `git ls-files scripts` |
| Leak radius | Credential exists only in local IDE snapshot refs, never pushed | `git for-each-ref refs/remotes` (only `origin/main`), `git merge-base --is-ancestor f7e3991 origin/main` → exit 1 |
| Change surface | Only the four docs (+ pre-existing untracked/modified files) changed | `git diff --stat` |

## Per-file result

| File | Change | Verified |
|---|---|---|
| `BUILD_ORDER.md` | Ground rule 8 with 6 sub-points (commit per unit of work, explicit paths, secrets gate, evidence, prove-the-push, declare-uncommittable) | ✅ text at line 14, sub-points 15–20 |
| `STATE.md` | §2 rule 9; §10 new step 6 (commit + push + prove, hashes into LOGS/§6) | ✅ lines 46–50, 205–209 |
| `LOGS.md` | Session L entry: request, rule, 5-commit ship record, exclusions with tracked/untracked distinction, leak-radius check, Render migrate note | ✅ line 557+ |
| `.ecc/STATE.md` | Current task = git rule; RBAC closed; shipped list now 5 commits; credential section corrected; next steps 6–7 added | ✅ lines 20–110 |
| `.ecc/artifacts/004,005,006` | Gate 1 / 3 / 4 artifacts for this change | ✅ this set |
| `.ecc/journal.jsonl` | `intent`, `artifact`, `commit` entries for this task | ✅ appended |

## Residual risks / honest gaps

1. **The rule is prose, not enforcement.** A future session or a human can still forget it; nothing
   blocks an uncommitted tree. Deliberate decision — a `pre-commit` hook would fail on this repo's
   intentionally-untracked 117 MB assets and surprise contributors.
2. **`scripts/tmp-demo-accounts.js` is tracked** and its working copy still holds the Neon DSN. It will
   keep showing as `M` in `git status` until the owner rotates the password and rewrites the file. The
   rule now says exactly this, so the dirty entry is explained rather than mysterious.
3. **Local `refs/cline/checkpoints/*`** contain the DSN. Never pushed, but present on disk; pruning is an
   owner choice (`git update-ref -d`), and deleting them drops IDE restore points.
4. **CI cannot see this change's value** — docs are not tested. CI on this push still exercises
   lint/typecheck/shared tests and the integration job (which applies `1_pastor_role` to a fresh Postgres).

## Operator actions still open (unchanged by this task)

- Rotate the Neon `neondb_owner` password; move the four scratch scripts to `process.env.DATABASE_URL`.
- `npm run db:migrate:deploy` on every database (Render does this automatically on deploy).
- Manual browser pass for the role-aware staff app (USHER default-on, LEADER denied panel) — the only
  layer still unverified after the RBAC task.
