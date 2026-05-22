# Activity Scan

> **IMPORTANT — shallow clone detected.** This repository was cloned with `--depth=1`; `.git/shallow` is present and `git rev-list --count HEAD` returns 1. All git-history-based signals below are therefore drawn from a single commit and are not representative of the upstream project's true activity. Where a field cannot be meaningfully computed, it is annotated `(shallow clone — not representative)`. Project metadata (claimed version 5.2.1 of `expressjs/express`) is provided as external context only; this scan reports only what `git` can see locally.

## Repo Lifetime

- **First commit (visible):** 2026-05-17 (4 days ago) *(shallow clone — earliest visible commit, not the true project first commit)*
- **Last commit:** 2026-05-17 (4 days ago)
- **Total commits (visible):** 1 *(shallow clone — true total is much larger upstream)*
- **Project age (visible):** 4 days *(shallow clone — not representative; expressjs/express dates to 2009)*

## Commit Cadence

| Window | Commits | Avg/week |
|---|---|---|
| Last 30 days | 1 | 0.23 *(shallow — not representative)* |
| Last 90 days | 1 | 0.08 *(shallow — not representative)* |
| Last 365 days | 1 | (context only — shallow, not representative) |

All cadence figures reflect only the single commit visible in the shallow clone and should not be used to characterize the upstream project's velocity.

## Contributors (90 days)

- **Total unique (visible):** 1 *(shallow clone — not representative)*
- **Top contributors:**

  | Name | Commits |
  |---|---|
  | dependabot[bot] | 1 |

(Note: the sole visible author is a bot account — `dependabot[bot]`. In a non-shallow clone this would warrant a flag about bot-vs-human ratio; here it is simply an artifact of the shallow clone landing on a dependency-bump commit.)

## Hot Files (90 days, lockfiles excluded)

| File | Commits |
|---|---|
| `test/utils.js` | 1 |
| `test/support/utils.js` | 1 |
| `test/support/tmpl.js` | 1 |
| `test/support/env.js` | 1 |
| `test/res.vary.js` | 1 |
| `test/res.type.js` | 1 |
| `test/res.status.js` | 1 |
| `test/res.set.js` | 1 |
| `test/res.sendStatus.js` | 1 |
| `test/res.sendFile.js` | 1 |

*(Window used: 90 days. **Caveat:** because only 1 commit is visible, this list is just the set of files touched in that single commit — there is no real churn signal. The full output of `git log --name-only` returned 20+ files all tied at 1 commit; the table above is truncated arbitrarily and is not a hot-file ranking in any meaningful sense. Shallow clone — not representative.)*

## Commit-Message Convention

- **Dominant pattern:** Conventional Commits + squash-and-merge style (both signals present in the single visible subject; cannot determine dominance from n=1)
- **Sample subjects:**
  - `build(deps): bump github/codeql-action from 4.35.1 to 4.35.2 (#7212)`

The single visible subject uses a Conventional Commits type (`build(deps):`) **and** ends with a squashed PR reference (`(#7212)`), so the project appears to use both conventions together. With only one sample, this is suggestive rather than confirmed.

## Branch State

- **Default branch:** `master`
- **Current branch:** `master`
- **Stale branches (last commit > 90d):** 0 *(only one local branch exists in this shallow clone; the master tip is 4 days old)*

Remote refs visible: `remotes/origin/HEAD -> origin/master`, `remotes/origin/master`. No other branches present in this shallow clone.

## Health Classification

- **Status:** active
- **Reasoning:** Rule 4 fired on the only data available — last commit 4 days ago, 1 commit in 90 days (visible), 1 contributor. The 90-day commit count is below rule 4's normal `>= 10` threshold, but the 1-contributor count is also below the maintenance-mode rule's "only 1 active contributor" gate **only because the shallow clone hides all other contributors**. The "<6 months ago" recency clause holds. **Strong caveat:** because the clone is shallow (depth=1), neither the rule-3 (maintenance-mode) nor rule-4 (active) gate can be evaluated faithfully. The upstream `expressjs/express` repo is widely understood to be actively maintained, but that judgment is not derivable from this shallow clone — it is external context. Classification should be treated as a placeholder pending a full-history clone.

## Most Recent Commits

| Date | Author | Subject |
|---|---|---|
| 2026-05-17T09:48:32-05:00 | dependabot[bot] | build(deps): bump github/codeql-action from 4.35.1 to 4.35.2 (#7212) |

## Notes

- **Shallow clone (`--depth=1`).** `.git/shallow` is present and `git rev-list --count HEAD` returns 1. Every signal in this scan is derived from that single commit. To produce a representative activity scan, re-clone without `--depth` (or run `git fetch --unshallow`) and re-run.
- The single visible commit is authored by a bot (`dependabot[bot]`) — this is incidental to the shallow clone, not a signal about the project.
- The commit subject simultaneously uses a Conventional Commits type prefix (`build(deps):`) and a squash-merge PR suffix (`(#7212)`), which is consistent with a GitHub-flow project that has both conventions configured — but n=1 is not enough to confirm.
- External context (from the task prompt): the working tree is claimed to represent `expressjs/express` version 5.2.1. This metadata is not derivable from the shallow git history and is reported here only for the synthesizer's convenience.

## Detection Failures

- **Project age, true first commit, total commit count, contributor diversity, hot-file churn, cadence trends, convention dominance, stale-branch count across the full project, and force-push/rebase history:** all unable to be computed faithfully due to shallow clone (`--depth=1`). A full clone is required for any of these to be meaningful.
