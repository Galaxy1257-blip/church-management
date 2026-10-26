# 005 — Test Validation (Gate 3)

**Change:** documentation/rules only (blueprint ground rule 8, `STATE.md` §2 rule 9 + §10 step 6,
`LOGS.md` Session L, `.ecc/STATE.md`). **No application code, tests, migrations, or CI config touched.**

For a docs-only change the "test suite" is: the text exists where a future session will read it, the
repo's own secret gate still passes, the credential-bearing files are still not staged, and nothing else
in the tree changed. Every check below was run on 26 Oct 2026 from `C:\Users\HP\Desktop\church`.

## Checks run — expected vs actual

| # | Command | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | `Select-String -Path BUILD_ORDER.md -Pattern '^\d+\. '` | ground rules numbered 1–8, new item 8 = the git rule | lines 7–14: 1…8 present; line 14 = `8. **Commit and push after every unit of work (owner request, 26 Oct 2026)…` | ✅ |
| 2 | `Select-String -Path STATE.md -Pattern 'Git protocol \(owner, 26 Oct\)'` | 1 hit in §2 | line 46: `9. **Git protocol (owner, 26 Oct): commit + push after every unit of work** — blueprint ground rule 8.` | ✅ |
| 3 | `Select-String -Path STATE.md -Pattern 'Commit and push\*\* \(§2 rule 9\)'` | 1 hit in §10 | line 205: `6. **Commit and push** (§2 rule 9): …` | ✅ |
| 4 | `Select-String -Path LOGS.md -Pattern '^## 2026-10-26'` | exactly one Session L heading, appended at EOF | line 557: `## 2026-10-26 — Session L (blueprint rule: commit + push after every unit of work)` | ✅ |
| 5 | `Select-String -Path .ecc\STATE.md -Pattern 'ground rule 8'` | rule referenced in Current task + decisions | lines 23, 69, 81 | ✅ |
| 6 | `npm run check:secrets` | `check:secrets clean` | `check:secrets clean — no API keys found in the tree.` | ✅ |
| 7 | `git ls-files scripts` | credential helpers absent, `tmp-demo-accounts.js` present (tracked) | `check-neon.mjs`, `seed-neon.mjs`, `check-users.cjs` absent; `tmp-demo-accounts.js`, `tmp-demo-data.js`, `tmp-demo-data2.js` present | ✅ (and it **corrected** the first draft, see below) |
| 8 | `git grep -n -I npg_ HEAD -- scripts` | nothing (committed tree clean) | no output | ✅ |
| 9 | `git --no-pager log --all --oneline -S'npg_' -- scripts` | reveals where the DSN lives | hits only in `refs/cline/checkpoints/*` ("untracked files on cline checkpoint"), **not** ancestors of `origin/main` | ⚠️ local-only, documented |
| 10 | `git merge-base --is-ancestor f7e3991 origin/main` | exit 1 (not pushed) | exit 1 | ✅ |
| 11 | `git for-each-ref refs/remotes` | only `origin/main` | only `refs/remotes/origin/main` | ✅ |
| 12 | `git diff --stat` | only the four docs + the untouched `scripts/tmp-demo-accounts.js` | `.ecc/STATE.md 14±`, `BUILD_ORDER.md 7+`, `LOGS.md 38+`, `STATE.md 8+`, `scripts/tmp-demo-accounts.js 4±` (pre-existing, not staged) | ✅ |

Log of the structural checks: `.ecc/docs-rule-check.log`.

## Failure → fix pairs (this change)

1. **First draft of rule 8.2 was factually wrong.** It claimed all four scratch scripts "stay out of
   history". `git ls-files scripts` proved `tmp-demo-accounts.js` (plus `tmp-demo-data.js`,
   `tmp-demo-data2.js`) are **already tracked** — only the credential-bearing *hunk* is uncommitted.
   Fixed in `BUILD_ORDER.md` 8.2, `STATE.md` §10 step 6, `LOGS.md`, `.ecc/STATE.md`.
2. **`git push` appears to fail under PowerShell** (exit 1 + `NativeCommandError`) because git writes
   progress to stderr — this session's first push looked failed but `git ls-remote` showed it had landed.
   Encoded as the explicit "prove the push with the ref" instruction so the next session does not
   re-diagnose it. Same class as the known `npx eslint .` false-failure.
3. **Shell quoting broke a batched `cmd /c` chain** (`Missing closing ')'`) when building the check log →
   split into native PowerShell `Select-String` calls writing to `.ecc/docs-rule-check.log`.

## NOT covered

- No automated test asserts the rule exists. A doc rule cannot fail a build; it is read by the next
  session. (A `pre-commit` hook would be the mechanical version — deliberately not added.)
- No browser/UI surface involved.
- The Neon credential is still present in the working tree and in local `refs/cline/checkpoints/*`;
  rotation is an owner action, not something this change can fix.
