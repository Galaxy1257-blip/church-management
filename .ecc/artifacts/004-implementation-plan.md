# 004 — Implementation Plan (Gate 1)

**Task (owner request, 26 Oct 2026):** *"add to blueprint to update git everytime"* — make
**commit + push after every unit of work** a standing rule of the project, so it is read at the top of
every future session instead of being re-derived.

**Status:** `approved` — the owner asked for this rule explicitly; nothing beyond documentation changes.

## Where the rule has to live (and why all four)

The repo documents itself in four places that a fresh session reads in this order. A rule that lives in
only one of them gets missed, which is exactly what happened before this session (four separate commits
had to be reconstructed by hand at the end).

| File | Insert point | Why there |
|---|---|---|
| `BUILD_ORDER.md` (the blueprint) | `## Ground rules (apply to every task)` → new item **8** | It is the "read first" doc; ground rules are prefixed to every task. |
| `STATE.md` | §2 item **9** + §10 handoff **step 6** | §2 is the encoded-rules list; §10 is the mandatory end-of-session checklist. |
| `LOGS.md` | new `## 2026-10-26 — Session L` entry | Append-only session journal — every owner request is recorded here. |
| `.ecc/STATE.md` | "Current task" / "Next step" / decisions | ECC gate journal; carries continuity across sessions. |

## The rule (final wording, blueprint item 8)

1. A unit of work ends in a commit — never carry a dirty tree into the next task or session.
2. Conventional subject (`feat(area):`, `fix(area):`, `chore(area):`, `docs(area):`); one logical change.
3. **Stage explicit paths, never `git add -A` / `git add .`** — this working tree holds
   `church-asset-kit/` (117 MB) and credential-bearing scratch scripts (`scripts/*neon*`,
   `scripts/tmp-*.js`, `scripts/check-users.cjs`) that must never enter history.
4. `npm run check:secrets` before staging; a secret found in a file means **do not commit that file**.
5. Commit the evidence with the code: `LOGS.md`, blueprint checkboxes, `STATE.md`, `.ecc/` artifacts.
6. Push (`git push origin main`) and *prove* it: `git ls-remote origin refs/heads/main` must equal
   `git rev-parse HEAD`. On Windows/PowerShell a successful `git push` reports a false non-zero exit
   because git writes progress to stderr — check the ref, not `$LASTEXITCODE`.
7. Genuinely uncommittable work (mid-refactor, red tests) is declared in `STATE.md` §6 rather than
   left silently dirty.

## Files to change

- `BUILD_ORDER.md` — ground rule 8 (7 sub-points).
- `STATE.md` — §2 rule 9; §10 new step 6.
- `LOGS.md` — Session L entry (request, rule text, proof of push, what stayed out of the commit).
- `.ecc/STATE.md` — current task → this rule; next step → browser pass + operator migration steps.
- `.ecc/artifacts/005-test-validation.md`, `006-verification-report.md` — gate evidence for this change.

## Acceptance criteria

- The rule text appears in `BUILD_ORDER.md` ground rules **and** `STATE.md` §2 **and** §10.
- The credential-bearing scripts are still **untracked** after the commit:
  `git ls-files scripts | Select-String 'neon|tmp-demo|check-users'` returns nothing.
- `npm run check:secrets` → clean.
- `git ls-remote origin refs/heads/main` == `git rev-parse HEAD` (push verified, not assumed).

## Out of scope / NOT covered

- No CI enforcement of the rule (a pre-commit hook is a separate, optional follow-up; the repo has no
  hooks today and `core.hooksPath` is unset).
- No change to application code, tests, or `render.yaml`.
- The rule cannot make a network-less session push; §network-auto-resume still governs outages.
