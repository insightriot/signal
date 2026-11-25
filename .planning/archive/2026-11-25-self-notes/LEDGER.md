# Ledger: what was archived on 2026-11-25, and how to get it back

This file is generated from `git diff --name-status` against the tag `pre-archive-2026-11-25`. It is step 1 of
"The cut-down, step by step" in `.planning/SLIM-SIGNAL.md`.

## What happened

- **339 files were moved with `git mv`, byte for byte.** None was deleted.
- **21 files were edited** (listed below with the reason).
- **24 test cases were removed from 10 test files.** Each one asserted something about Signal's own notes, which are now archived. Two test files that were only about those notes were moved whole to `archive/tests/`.
- **Nothing inside `plugin/` changed**, so nothing a project runs changed.

## How to get something back

The tag `pre-archive-2026-11-25` is the whole repository as it stood before this change.

- One file, where it used to be: `git checkout pre-archive-2026-11-25 -- <old path>`
- One file, moved back: `git mv <new path> <old path>`
- A removed test case: `git show pre-archive-2026-11-25:tests/<file>` shows the file with the case in it.

## How to check that nothing was lost

This prints every file whose exact content was in the repository at the tag and is not in it now. It should
print 20 names and nothing else: the edited files, minus `CLAUDE.md`, whose earlier content is kept whole
in `archive/`:

```
git ls-tree -r pre-archive-2026-11-25 | awk '{print $3"\t"$4}' | sort > /tmp/before.txt
git ls-tree -r HEAD | awk '{print $3}' | sort -u > /tmp/after.txt
awk -F'\t' 'NR==FNR {have[$1]=1; next} !($1 in have) {print $2}' /tmp/after.txt /tmp/before.txt
```

## Files edited

- `.planning/SLIM-SIGNAL.md`: Step 1 marked done, and the note that the adherence harness waits for step 3.
- `CLAUDE.md`: Rewritten from 36.5 KB to about 5 KB. The earlier text is archive/CLAUDE-pre-archive-2026-11-25.md, unchanged.
- `README.md`: Five links to Signal's own .planning files became plain file names. They describe files a command writes in the reader's project.
- `docs/launch-post.md`: One link repointed to archive/analysis/.
- `docs/migration-curator-to-signal.md`: One link repointed to archive/analysis/.
- `docs/vs.md`: One link repointed to archive/analysis/.
- `tests/adherence-anchor-reachability.test.js`: Reads STATE.md at its archived path. The check is unchanged: the commit it pins must stay reachable.
- `tests/jev.test.js`: Path to the stored answers repointed to archive/analysis/jev-spike/. No test changed.
- `tests/state-narrative-jev.test.js`: Path to the stored answers repointed to archive/analysis/jev-spike/. No test changed.
- `tools/doc-budgets.json`: Entries for files that moved are removed; the CLAUDE.md ceiling drops from 40 KB to 8 KB.
- `tools/measure-jev-state.js`: Same path repointed.
- The other test files in this list had the test cases below removed, with the helper code only those cases used.

## Test cases removed

Each asserted a fact about one of Signal's own notes (a decision recorded in `DECISIONS.md`, a count measured
on this repository's backlog, a profile file parsing). Tests of what the plugin does were left alone.

- `tests/advise-digest.test.js`
  - on this repository (1 test)
- `tests/advise-live-measurement.test.js`
  - M6.E8 t1.1 — the three existing inputs, measured on this repository (3 tests)
  - M6.E8 t2.2 — the fold input and the KEPT override, measured on this repository (AC4.3) (2 tests)
  - M6.E8 t3.1 — the bug-discharge input, measured on this repository (AC1.3) (1 test)
  - AC2.1′ — no blocked row is blocked BY "entry price for"; the gate row, if live, is not blocked (1 test)
  - M6.E8 t3.3 — input 3 on this repository (AC3.3) (1 test)
- `tests/archive-report.test.js`
  - S7 AC4.3 — Signal's own tree: only real retros move, the rest are reported (2 tests)
- `tests/attention-axis.test.js`
  - the shipped PROFILE.md parses and resolves to a real attention level (1 test)
- `tests/commands-wording.test.js`
  - DECISIONS.md records D-M5E17-1 with its rationale (AC2.2) (1 test)
  - DECISIONS.md records D-M5E18-6 without rewriting D-M5E17-1 in place (1 test)
  - DECISIONS.md carries D-M5E17-5 with the two-lane rule (1 test)
- `tests/correction-protocol.test.js`
  - a retraction this Epic actually wrote (2 tests)
- `tests/planning-index.test.js`
  - every D-… across Signal's live + archived DECISIONS resolves to a file that DEFINES it (AC3.3 on real data) (1 test)
- `tests/state-drift-checks-general.test.js`
  - M5.E16 S2 — the live true positives that motivated each check (2 tests)
- `tests/tier-advisory.test.js`
  - CLAUDE.md no longer says escalate only promotes (1 test)
- `tests/verification-template.test.js`
  - AC S6.3 — the corpus measurement is shipped, per check (3 tests)
- `tests/own-profiles-parse.test.js` and `tests/work-question-settled.test.js`: moved whole to `archive/tests/`.

## Files moved

| From | To |
| --- | --- |
| `.planning/BACKLOG-REVIEW-2026-08-09.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-08-09.md` |
| `.planning/BACKLOG-REVIEW-2026-09-06.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-09-06.md` |
| `.planning/BACKLOG-REVIEW-2026-09-13.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-09-13.md` |
| `.planning/BACKLOG-REVIEW-2026-09-14.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-09-14.md` |
| `.planning/BACKLOG-REVIEW-2026-10-01.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-10-01.md` |
| `.planning/BACKLOG-REVIEW-2026-10-06.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-10-06.md` |
| `.planning/BACKLOG-REVIEW-2026-10-10.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-10-10.md` |
| `.planning/BACKLOG-REVIEW-2026-10-14.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-10-14.md` |
| `.planning/BACKLOG-REVIEW-2026-10-20.md` | `.planning/archive/2026-11-25-self-notes/BACKLOG-REVIEW-2026-10-20.md` |
| `.planning/CONTEXT.md` | `.planning/archive/2026-11-25-self-notes/CONTEXT.md` |
| `.planning/DECISION-QUEUE.md` | `.planning/archive/2026-11-25-self-notes/DECISION-QUEUE.md` |
| `.planning/DECISIONS.md` | `.planning/archive/2026-11-25-self-notes/DECISIONS.md` |
| `.planning/INDEX.md` | `.planning/archive/2026-11-25-self-notes/INDEX.md` |
| `.planning/M4.5.E1-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E1-RETROSPECTIVE.md` |
| `.planning/M4.5.E10-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E10-RETROSPECTIVE.md` |
| `.planning/M4.5.E11-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E11-RETROSPECTIVE.md` |
| `.planning/M4.5.E2-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E2-RETROSPECTIVE.md` |
| `.planning/M4.5.E3-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E3-RETROSPECTIVE.md` |
| `.planning/M4.5.E4-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E4-RETROSPECTIVE.md` |
| `.planning/M4.5.E5-LAUNCH-KIT.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E5-LAUNCH-KIT.md` |
| `.planning/M4.5.E5-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E5-RETROSPECTIVE.md` |
| `.planning/M4.5.E6-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E6-RETROSPECTIVE.md` |
| `.planning/M4.5.E7-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E7-RETROSPECTIVE.md` |
| `.planning/M4.5.E8-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E8-RETROSPECTIVE.md` |
| `.planning/M4.5.E9-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M4.5.E9-RETROSPECTIVE.md` |
| `.planning/M5.E1-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E1-RETROSPECTIVE.md` |
| `.planning/M5.E10-CORPUS-MEASUREMENT.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-CORPUS-MEASUREMENT.md` |
| `.planning/M5.E10-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-PLAN.md` |
| `.planning/M5.E10-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-PROGRESS.md` |
| `.planning/M5.E10-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-REQUIREMENTS.md` |
| `.planning/M5.E10-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-RESEARCH.md` |
| `.planning/M5.E10-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-RETROSPECTIVE.md` |
| `.planning/M5.E10-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-REVIEW.md` |
| `.planning/M5.E10-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-VALIDATION.md` |
| `.planning/M5.E10-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E10-VERIFICATION.md` |
| `.planning/M5.E13-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-PLAN.md` |
| `.planning/M5.E13-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-PROGRESS.md` |
| `.planning/M5.E13-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-REQUIREMENTS.md` |
| `.planning/M5.E13-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-RESEARCH.md` |
| `.planning/M5.E13-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-RETROSPECTIVE.md` |
| `.planning/M5.E13-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-REVIEW.md` |
| `.planning/M5.E13-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-VALIDATION.md` |
| `.planning/M5.E13-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E13-VERIFICATION.md` |
| `.planning/M5.E15-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-PLAN.md` |
| `.planning/M5.E15-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-PROGRESS.md` |
| `.planning/M5.E15-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-REQUIREMENTS.md` |
| `.planning/M5.E15-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-RESEARCH.md` |
| `.planning/M5.E15-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-RETROSPECTIVE.md` |
| `.planning/M5.E15-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-REVIEW.md` |
| `.planning/M5.E15-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-VALIDATION.md` |
| `.planning/M5.E15-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E15-VERIFICATION.md` |
| `.planning/M5.E16-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-PLAN.md` |
| `.planning/M5.E16-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-PROFILE.md` |
| `.planning/M5.E16-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-PROGRESS.md` |
| `.planning/M5.E16-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-REQUIREMENTS.md` |
| `.planning/M5.E16-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-RESEARCH.md` |
| `.planning/M5.E16-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-RETROSPECTIVE.md` |
| `.planning/M5.E16-REVIEW-2.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-REVIEW-2.md` |
| `.planning/M5.E16-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-REVIEW.md` |
| `.planning/M5.E16-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-VALIDATION.md` |
| `.planning/M5.E16-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E16-VERIFICATION.md` |
| `.planning/M5.E17-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E17-PLAN.md` |
| `.planning/M5.E17-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M5.E17-PROFILE.md` |
| `.planning/M5.E17-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E17-REQUIREMENTS.md` |
| `.planning/M5.E17-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E17-RESEARCH.md` |
| `.planning/M5.E17-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E17-RETROSPECTIVE.md` |
| `.planning/M5.E17-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E17-VALIDATION.md` |
| `.planning/M5.E18-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-PLAN.md` |
| `.planning/M5.E18-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-PROGRESS.md` |
| `.planning/M5.E18-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-REQUIREMENTS.md` |
| `.planning/M5.E18-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-RESEARCH.md` |
| `.planning/M5.E18-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-RETROSPECTIVE.md` |
| `.planning/M5.E18-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-REVIEW.md` |
| `.planning/M5.E18-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-VALIDATION.md` |
| `.planning/M5.E18-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E18-VERIFICATION.md` |
| `.planning/M5.E19-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-PLAN.md` |
| `.planning/M5.E19-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-PROFILE.md` |
| `.planning/M5.E19-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-PROGRESS.md` |
| `.planning/M5.E19-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-REQUIREMENTS.md` |
| `.planning/M5.E19-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-RESEARCH.md` |
| `.planning/M5.E19-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-RETROSPECTIVE.md` |
| `.planning/M5.E19-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-REVIEW.md` |
| `.planning/M5.E19-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-VALIDATION.md` |
| `.planning/M5.E19-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E19-VERIFICATION.md` |
| `.planning/M5.E2-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E2-RETROSPECTIVE.md` |
| `.planning/M5.E3-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-PLAN.md` |
| `.planning/M5.E3-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-PROGRESS.md` |
| `.planning/M5.E3-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-REQUIREMENTS.md` |
| `.planning/M5.E3-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-RESEARCH.md` |
| `.planning/M5.E3-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-RETROSPECTIVE.md` |
| `.planning/M5.E3-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-REVIEW.md` |
| `.planning/M5.E3-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-VALIDATION.md` |
| `.planning/M5.E3-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E3-VERIFICATION.md` |
| `.planning/M5.E4-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-PLAN.md` |
| `.planning/M5.E4-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-PROGRESS.md` |
| `.planning/M5.E4-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-REQUIREMENTS.md` |
| `.planning/M5.E4-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-RESEARCH.md` |
| `.planning/M5.E4-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-RETROSPECTIVE.md` |
| `.planning/M5.E4-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-REVIEW.md` |
| `.planning/M5.E4-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-VALIDATION.md` |
| `.planning/M5.E4-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E4-VERIFICATION.md` |
| `.planning/M5.E5-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-PLAN.md` |
| `.planning/M5.E5-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-PROGRESS.md` |
| `.planning/M5.E5-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-REQUIREMENTS.md` |
| `.planning/M5.E5-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-RESEARCH.md` |
| `.planning/M5.E5-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-RETROSPECTIVE.md` |
| `.planning/M5.E5-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-REVIEW.md` |
| `.planning/M5.E5-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-VALIDATION.md` |
| `.planning/M5.E5-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E5-VERIFICATION.md` |
| `.planning/M5.E6-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-PLAN.md` |
| `.planning/M5.E6-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-PROGRESS.md` |
| `.planning/M5.E6-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-REQUIREMENTS.md` |
| `.planning/M5.E6-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-RESEARCH.md` |
| `.planning/M5.E6-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-RETROSPECTIVE.md` |
| `.planning/M5.E6-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-REVIEW.md` |
| `.planning/M5.E6-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-VALIDATION.md` |
| `.planning/M5.E6-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E6-VERIFICATION.md` |
| `.planning/M5.E7-CORRECTIONS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-CORRECTIONS.md` |
| `.planning/M5.E7-COUNTERFACTUAL.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-COUNTERFACTUAL.md` |
| `.planning/M5.E7-DEMAND-LEDGERS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-DEMAND-LEDGERS.md` |
| `.planning/M5.E7-DEMAND-REGISTER.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-DEMAND-REGISTER.md` |
| `.planning/M5.E7-DEMAND-RETROS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-DEMAND-RETROS.md` |
| `.planning/M5.E7-DISPOSITIONS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-DISPOSITIONS.md` |
| `.planning/M5.E7-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-PLAN.md` |
| `.planning/M5.E7-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-PROFILE.md` |
| `.planning/M5.E7-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-PROGRESS.md` |
| `.planning/M5.E7-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-REQUIREMENTS.md` |
| `.planning/M5.E7-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-RESEARCH.md` |
| `.planning/M5.E7-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-RETROSPECTIVE.md` |
| `.planning/M5.E7-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-REVIEW.md` |
| `.planning/M5.E7-SUPPLY-COMPOUND-NEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-SUPPLY-COMPOUND-NEW.md` |
| `.planning/M5.E7-SUPPLY-COMPOUND.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-SUPPLY-COMPOUND.md` |
| `.planning/M5.E7-SUPPLY-GSTACK.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-SUPPLY-GSTACK.md` |
| `.planning/M5.E7-SUPPLY-PMSKILLS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-SUPPLY-PMSKILLS.md` |
| `.planning/M5.E7-SUPPLY-SUPERPOWERS.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-SUPPLY-SUPERPOWERS.md` |
| `.planning/M5.E7-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-VALIDATION.md` |
| `.planning/M5.E7-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E7-VERIFICATION.md` |
| `.planning/M5.E8-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-PLAN.md` |
| `.planning/M5.E8-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-PROGRESS.md` |
| `.planning/M5.E8-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-REQUIREMENTS.md` |
| `.planning/M5.E8-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-RESEARCH.md` |
| `.planning/M5.E8-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-RETROSPECTIVE.md` |
| `.planning/M5.E8-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-REVIEW.md` |
| `.planning/M5.E8-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-VALIDATION.md` |
| `.planning/M5.E8-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E8-VERIFICATION.md` |
| `.planning/M5.E9-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-PLAN.md` |
| `.planning/M5.E9-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-PROGRESS.md` |
| `.planning/M5.E9-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-REQUIREMENTS.md` |
| `.planning/M5.E9-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-RESEARCH.md` |
| `.planning/M5.E9-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-RETROSPECTIVE.md` |
| `.planning/M5.E9-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-REVIEW.md` |
| `.planning/M5.E9-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-VALIDATION.md` |
| `.planning/M5.E9-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M5.E9-VERIFICATION.md` |
| `.planning/M6.E1-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-PLAN.md` |
| `.planning/M6.E1-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-PROGRESS.md` |
| `.planning/M6.E1-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-REQUIREMENTS.md` |
| `.planning/M6.E1-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-RESEARCH.md` |
| `.planning/M6.E1-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-RETROSPECTIVE.md` |
| `.planning/M6.E1-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-REVIEW.md` |
| `.planning/M6.E1-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-VALIDATION.md` |
| `.planning/M6.E1-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E1-VERIFICATION.md` |
| `.planning/M6.E10-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E10-REQUIREMENTS.md` |
| `.planning/M6.E10-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E10-RETROSPECTIVE.md` |
| `.planning/M6.E10-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E10-REVIEW.md` |
| `.planning/M6.E10-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E10-VERIFICATION.md` |
| `.planning/M6.E11-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E11-RETROSPECTIVE.md` |
| `.planning/M6.E12-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-PLAN.md` |
| `.planning/M6.E12-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-PROGRESS.md` |
| `.planning/M6.E12-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-REQUIREMENTS.md` |
| `.planning/M6.E12-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-RESEARCH.md` |
| `.planning/M6.E12-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-RETROSPECTIVE.md` |
| `.planning/M6.E12-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-REVIEW.md` |
| `.planning/M6.E12-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-VALIDATION.md` |
| `.planning/M6.E12-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E12-VERIFICATION.md` |
| `.planning/M6.E13-MIGRATION-DIFF.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-MIGRATION-DIFF.md` |
| `.planning/M6.E13-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-PLAN.md` |
| `.planning/M6.E13-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-PROGRESS.md` |
| `.planning/M6.E13-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-REQUIREMENTS.md` |
| `.planning/M6.E13-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-RESEARCH.md` |
| `.planning/M6.E13-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-RETROSPECTIVE.md` |
| `.planning/M6.E13-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-REVIEW.md` |
| `.planning/M6.E13-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-VALIDATION.md` |
| `.planning/M6.E13-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E13-VERIFICATION.md` |
| `.planning/M6.E14-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-PLAN.md` |
| `.planning/M6.E14-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-PROGRESS.md` |
| `.planning/M6.E14-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-REQUIREMENTS.md` |
| `.planning/M6.E14-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-RESEARCH.md` |
| `.planning/M6.E14-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-RETROSPECTIVE.md` |
| `.planning/M6.E14-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-REVIEW.md` |
| `.planning/M6.E14-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-VALIDATION.md` |
| `.planning/M6.E14-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E14-VERIFICATION.md` |
| `.planning/M6.E15-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-PLAN.md` |
| `.planning/M6.E15-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-PROGRESS.md` |
| `.planning/M6.E15-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-REQUIREMENTS.md` |
| `.planning/M6.E15-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-RESEARCH.md` |
| `.planning/M6.E15-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-RETROSPECTIVE.md` |
| `.planning/M6.E15-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-REVIEW.md` |
| `.planning/M6.E15-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-VALIDATION.md` |
| `.planning/M6.E15-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E15-VERIFICATION.md` |
| `.planning/M6.E16-BASELINE.json` | `.planning/archive/2026-11-25-self-notes/M6.E16-BASELINE.json` |
| `.planning/M6.E16-INVENTORY.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-INVENTORY.md` |
| `.planning/M6.E16-MIGRATION-DIFF.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-MIGRATION-DIFF.md` |
| `.planning/M6.E16-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-PLAN.md` |
| `.planning/M6.E16-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-PROGRESS.md` |
| `.planning/M6.E16-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-REQUIREMENTS.md` |
| `.planning/M6.E16-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-RESEARCH.md` |
| `.planning/M6.E16-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-RETROSPECTIVE.md` |
| `.planning/M6.E16-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-REVIEW.md` |
| `.planning/M6.E16-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-VALIDATION.md` |
| `.planning/M6.E16-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E16-VERIFICATION.md` |
| `.planning/M6.E17-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-PLAN.md` |
| `.planning/M6.E17-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-PROGRESS.md` |
| `.planning/M6.E17-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-REQUIREMENTS.md` |
| `.planning/M6.E17-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-RESEARCH.md` |
| `.planning/M6.E17-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-RETROSPECTIVE.md` |
| `.planning/M6.E17-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-REVIEW.md` |
| `.planning/M6.E17-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-VALIDATION.md` |
| `.planning/M6.E17-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E17-VERIFICATION.md` |
| `.planning/M6.E18-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-PLAN.md` |
| `.planning/M6.E18-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-PROGRESS.md` |
| `.planning/M6.E18-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-REQUIREMENTS.md` |
| `.planning/M6.E18-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-RESEARCH.md` |
| `.planning/M6.E18-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-RETROSPECTIVE.md` |
| `.planning/M6.E18-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-REVIEW.md` |
| `.planning/M6.E18-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-VALIDATION.md` |
| `.planning/M6.E18-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E18-VERIFICATION.md` |
| `.planning/M6.E2-CORPUS-MEASUREMENT.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-CORPUS-MEASUREMENT.md` |
| `.planning/M6.E2-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-PLAN.md` |
| `.planning/M6.E2-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-PROGRESS.md` |
| `.planning/M6.E2-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-REQUIREMENTS.md` |
| `.planning/M6.E2-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-RESEARCH.md` |
| `.planning/M6.E2-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-RETROSPECTIVE.md` |
| `.planning/M6.E2-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-REVIEW.md` |
| `.planning/M6.E2-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-VALIDATION.md` |
| `.planning/M6.E2-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E2-VERIFICATION.md` |
| `.planning/M6.E3-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-PLAN.md` |
| `.planning/M6.E3-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-PROGRESS.md` |
| `.planning/M6.E3-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-REQUIREMENTS.md` |
| `.planning/M6.E3-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-RESEARCH.md` |
| `.planning/M6.E3-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-RETROSPECTIVE.md` |
| `.planning/M6.E3-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-REVIEW.md` |
| `.planning/M6.E3-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-VALIDATION.md` |
| `.planning/M6.E3-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E3-VERIFICATION.md` |
| `.planning/M6.E4-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-PLAN.md` |
| `.planning/M6.E4-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-PROFILE.md` |
| `.planning/M6.E4-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-PROGRESS.md` |
| `.planning/M6.E4-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-REQUIREMENTS.md` |
| `.planning/M6.E4-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-RESEARCH.md` |
| `.planning/M6.E4-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-RETROSPECTIVE.md` |
| `.planning/M6.E4-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-REVIEW.md` |
| `.planning/M6.E4-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-VALIDATION.md` |
| `.planning/M6.E4-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E4-VERIFICATION.md` |
| `.planning/M6.E5-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-PLAN.md` |
| `.planning/M6.E5-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-PROFILE.md` |
| `.planning/M6.E5-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-PROGRESS.md` |
| `.planning/M6.E5-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-REQUIREMENTS.md` |
| `.planning/M6.E5-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-RESEARCH.md` |
| `.planning/M6.E5-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-RETROSPECTIVE.md` |
| `.planning/M6.E5-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-REVIEW.md` |
| `.planning/M6.E5-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-VALIDATION.md` |
| `.planning/M6.E5-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E5-VERIFICATION.md` |
| `.planning/M6.E6-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E6-PLAN.md` |
| `.planning/M6.E6-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M6.E6-PROFILE.md` |
| `.planning/M6.E6-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E6-REQUIREMENTS.md` |
| `.planning/M6.E6-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E6-RETROSPECTIVE.md` |
| `.planning/M6.E6-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E6-REVIEW.md` |
| `.planning/M6.E6-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E6-VERIFICATION.md` |
| `.planning/M6.E7-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E7-PLAN.md` |
| `.planning/M6.E7-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M6.E7-PROFILE.md` |
| `.planning/M6.E7-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E7-PROGRESS.md` |
| `.planning/M6.E7-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E7-REQUIREMENTS.md` |
| `.planning/M6.E7-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E7-RETROSPECTIVE.md` |
| `.planning/M6.E7-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E7-REVIEW.md` |
| `.planning/M6.E7-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E7-VERIFICATION.md` |
| `.planning/M6.E8-PLAN.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-PLAN.md` |
| `.planning/M6.E8-PROFILE.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-PROFILE.md` |
| `.planning/M6.E8-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-PROGRESS.md` |
| `.planning/M6.E8-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-REQUIREMENTS.md` |
| `.planning/M6.E8-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-RESEARCH.md` |
| `.planning/M6.E8-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-RETROSPECTIVE.md` |
| `.planning/M6.E8-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-REVIEW.md` |
| `.planning/M6.E8-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-VALIDATION.md` |
| `.planning/M6.E8-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E8-VERIFICATION.md` |
| `.planning/M6.E9-DETERMINATIONS.md` | `.planning/archive/2026-11-25-self-notes/M6.E9-DETERMINATIONS.md` |
| `.planning/M6.E9-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/M6.E9-REQUIREMENTS.md` |
| `.planning/M6.E9-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/M6.E9-RETROSPECTIVE.md` |
| `.planning/M6.E9-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/M6.E9-REVIEW.md` |
| `.planning/M6.E9-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/M6.E9-VERIFICATION.md` |
| `.planning/MILESTONE-4.5.md` | `.planning/archive/2026-11-25-self-notes/MILESTONE-4.5.md` |
| `.planning/MILESTONE-5.md` | `.planning/archive/2026-11-25-self-notes/MILESTONE-5.md` |
| `.planning/MILESTONE-6.md` | `.planning/archive/2026-11-25-self-notes/MILESTONE-6.md` |
| `.planning/PROFILE.md` | `.planning/archive/2026-11-25-self-notes/PROFILE.md` |
| `.planning/PROJECT.md` | `.planning/archive/2026-11-25-self-notes/PROJECT.md` |
| `.planning/RESEARCH-PROMPT-existing-tools.md` | `.planning/archive/2026-11-25-self-notes/RESEARCH-PROMPT-existing-tools.md` |
| `.planning/RETROSPECTIVES.md` | `.planning/archive/2026-11-25-self-notes/RETROSPECTIVES.md` |
| `.planning/STATE-HISTORY.md` | `.planning/archive/2026-11-25-self-notes/STATE-HISTORY.md` |
| `.planning/STATE.md` | `.planning/archive/2026-11-25-self-notes/STATE.md` |
| `.planning/v0.1.6-PLAN.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-PLAN.md` |
| `.planning/v0.1.6-PROGRESS.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-PROGRESS.md` |
| `.planning/v0.1.6-REQUIREMENTS.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-REQUIREMENTS.md` |
| `.planning/v0.1.6-RESEARCH.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-RESEARCH.md` |
| `.planning/v0.1.6-RETROSPECTIVE.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-RETROSPECTIVE.md` |
| `.planning/v0.1.6-REVIEW.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-REVIEW.md` |
| `.planning/v0.1.6-VALIDATION.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-VALIDATION.md` |
| `.planning/v0.1.6-VERIFICATION.md` | `.planning/archive/2026-11-25-self-notes/v0.1.6-VERIFICATION.md` |
| `GSD-AgentSkills-Combination-Analysis.md` | `archive/GSD-AgentSkills-Combination-Analysis.md` |
| `analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md` | `archive/analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md` |
| `analysis/AUTONOMY-COUNTERWEIGHT.md` | `archive/analysis/AUTONOMY-COUNTERWEIGHT.md` |
| `analysis/CLAIM-INTEGRITY-ANALYSIS.md` | `archive/analysis/CLAIM-INTEGRITY-ANALYSIS.md` |
| `analysis/CROSS-MODEL-REVIEW-SCOPE.md` | `archive/analysis/CROSS-MODEL-REVIEW-SCOPE.md` |
| `analysis/DEEPSEEK-HARNESS-ASSESSMENT.md` | `archive/analysis/DEEPSEEK-HARNESS-ASSESSMENT.md` |
| `analysis/JOURNEY-MAP.html` | `archive/analysis/JOURNEY-MAP.html` |
| `analysis/LANES-IMPLEMENTATION-GUIDE.md` | `archive/analysis/LANES-IMPLEMENTATION-GUIDE.md` |
| `analysis/LOOP-ENGINEERING-ANALYSIS.md` | `archive/analysis/LOOP-ENGINEERING-ANALYSIS.md` |
| `analysis/LOOP-GOAL-DIRECTION.md` | `archive/analysis/LOOP-GOAL-DIRECTION.md` |
| `analysis/OPENKB-ASSESSMENT.md` | `archive/analysis/OPENKB-ASSESSMENT.md` |
| `analysis/PERMISSIONS-SPIKE.md` | `archive/analysis/PERMISSIONS-SPIKE.md` |
| `analysis/PHASE-C-BUILD-VS-ADOPT.md` | `archive/analysis/PHASE-C-BUILD-VS-ADOPT.md` |
| `analysis/PI-OMP-PATTERNS.md` | `archive/analysis/PI-OMP-PATTERNS.md` |
| `analysis/REPO-ANALYSIS.md` | `archive/analysis/REPO-ANALYSIS.md` |
| `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` | `archive/analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` |
| `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` | `archive/analysis/SIGNAL-INTEGRATION-RUNDOWN.md` |
| `analysis/SIGNAL-V2-ROADMAP.md` | `archive/analysis/SIGNAL-V2-ROADMAP.md` |
| `analysis/SOFTWARE-FACTORY-COMPARISON.md` | `archive/analysis/SOFTWARE-FACTORY-COMPARISON.md` |
| `analysis/STORAGE-ARCHITECTURE-PROPOSAL.md` | `archive/analysis/STORAGE-ARCHITECTURE-PROPOSAL.md` |
| `analysis/STORAGE-ARCHITECTURE-RESEARCH-PROMPT.md` | `archive/analysis/STORAGE-ARCHITECTURE-RESEARCH-PROMPT.md` |
| `analysis/TYPESAFE-JEV-ASSESSMENT.md` | `archive/analysis/TYPESAFE-JEV-ASSESSMENT.md` |
| `analysis/UNREACHED-MECHANISM-ANALYSIS.md` | `archive/analysis/UNREACHED-MECHANISM-ANALYSIS.md` |
| `analysis/WORK-ITEM-SYSTEM-DESIGN.md` | `archive/analysis/WORK-ITEM-SYSTEM-DESIGN.md` |
| `analysis/item-architecture-research/signal-storage-GPT.md` | `archive/analysis/item-architecture-research/signal-storage-GPT.md` |
| `analysis/item-architecture-research/signal-storage-Gemini.md` | `archive/analysis/item-architecture-research/signal-storage-Gemini.md` |
| `analysis/item-architecture-research/signal-storage-Perplexity.md` | `archive/analysis/item-architecture-research/signal-storage-Perplexity.md` |
| `analysis/jev-spike/labels-and-results.json` | `archive/analysis/jev-spike/labels-and-results.json` |
| `analysis/jev-spike/runs/2026-09-27-bug-fixed.txt` | `archive/analysis/jev-spike/runs/2026-09-27-bug-fixed.txt` |
| `analysis/jev-spike/runs/2026-09-27-state-narrative.txt` | `archive/analysis/jev-spike/runs/2026-09-27-state-narrative.txt` |
| `analysis/work-items/work-items-architecture.html` | `archive/analysis/work-items/work-items-architecture.html` |
| `analysis/work-items/work-items.architecture.json` | `archive/analysis/work-items/work-items.architecture.json` |
| `tests/own-profiles-parse.test.js` | `archive/tests/own-profiles-parse.test.js` |
| `tests/work-question-settled.test.js` | `archive/tests/work-question-settled.test.js` |
| `CLAUDE.md` (as it was) | `archive/CLAUDE-pre-archive-2026-11-25.md` |
