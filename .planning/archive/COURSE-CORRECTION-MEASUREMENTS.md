# Course correction — per-command measurements

Moved here from `.planning/COURSE-CORRECTION.md` (Step 1, item 3) on 2026-10-29 to keep that file
under its size limit. Each entry is a fresh session running the branch's command on a copy of the
test project, walking one real bug (sidebar times that don't refresh) through the flow.

**discuss, 2026-10-28, on that bug:** 25.8 KB to 7.5 KB; branch code imported; 4 questions, all
saying what they decide and what was checked, with a recommendation; 5 plumbing calls stated, not
asked; files in the Epic's folder, none loose; one stop for batch approval (`checkpointed`, as
designed; answered by the test agent); STATE written twice,
the second left uncommitted (step 4); $6.27, 28 turns, 4.5 minutes. It caught a planned Epic's
number being handed out (`SIG-367`). An approved calibrate was left undone.
**plan, 2026-10-29, same bug, from where discuss left it:** 30.5 KB to 11.4 KB; branch code
imported; no questions about the work, one stop to confirm inbox triage (`checkpointed`, as
designed; answered by the test agent); plan, research and validation in the
Epic's folder, none loose; one task, test first, its fake-timer assumption checked by a throwaway
test; STATE in the plan commit plus a separate commit to mark it fresh (step 4); $4.29, 38 turns,
7 minutes. It hit a crash on the project's config (`SIG-368`, fixed). Its inbox items were
migration leftovers (`SIG-370`). The approved calibrate again
did not run (`SIG-369`).
**execute, 2026-10-29, from where plan left it (final file):** 12.1 KB to 7.0 KB; branch code
imported; no questions or stops; the task recorded before its work and closed after its commit;
tests red first; the parent run in the progress file; a separate commit to mark STATE fresh
(step 4); $2.88, 32 turns, 3.7 minutes.
**verify, 2026-10-29, after execute:** 15.2 KB to 8.5 KB; branch code imported; no questions or
stops; tests re-proved red; coverage 5 of 5 by the check; a separate commit to mark STATE fresh
(step 4); $2.91, 20 turns, 3.6 minutes.
**verify again, 2026-10-29, step 4's branch, from the same post-execute copy:** one commit (report,
STATE.md, INDEX.md), working tree clean, no markFresh call; the branch's `isStateStale` reads fresh
on it, `main`'s reads stale (2 commits). Same verdict as before (5 of 5); $3.10, 23 turns, 4.3 minutes.
**resume, 2026-10-30, step 4b's branch (checkpoint archived), on a copy of the post-verify project
with one plan-file commit made after it, without STATE.md:** branch code imported; the stale banner
named the new remedy (commit STATE.md), and the session found the plan change on its own and
proposed going back to EXECUTE for it; nothing written. $1.16, 11 turns, 1.5 minutes. Updating
STATE.md left it stale until committed; the commit cleared it. A fresh session given
`/sig:checkpoint` was told no such command exists, and nothing ran.
**review, 2026-10-30, the rewrite's branch, on a copy of the post-verify project (`3c9b6aa`):**
29.5 KB to 13.8 KB; branch code imported; no questions or stops (FEATURE, `quality-only`). The
change was diffed from the commit that added the plan (no remote). All three reviewers dispatched in
one message as `sig:specialists:*` (no fallback needed). The test engineer found an Important: no
test caught the 30 s refresh stopping after its first tick (the tests advanced the clock once, so a
one-shot timer would have passed them; the component's timer did repeat). One
fix round, test only, fresh read clean, `checkFixRounds` accepted, PASS-WITH-FIXES recorded; the
parent run was a stated gap, since the code already worked. $8.57, 6 minutes. It then re-ran the check
after its commit, saw that commit as uncovered, and committed the report again without STATE.md, so
STATE read stale. Step 8 now says not to. **Second run, same start, after that fix:** the same
Important found and fixed the same way, one commit, STATE fresh; $5.35, 6 minutes.
A fresh read of the rewrite against the code then found seven gaps, all confirmed and fixed (15.3 KB
after): what the round after a loop back is (its base and head; one reading was refused by
`checkFixRounds`), a FAIL with nothing to fix looping back with no way through, the fallback diff
base reaching back to a linear project's first run, the pass heading written twice, commits written
as `HEAD`, what follows EXECUTE, and a deferred Important with no verdict. The loop-back path is
proven by a real-git test against the code, not yet on the test project. Two more fresh reads of the
fixes found three, then four, more: each round's new recovery rules made the next defects. Stopped at
the ceiling of three by removing those rules instead of adding more (15.4 KB); the one code gap left
is SIG-376 (a refused REVIEW record reads as "next: /sig:ship").
**ship, 2026-10-31, the rewrite's branch, on copies of the post-review project (`628749f`) with a
local bare remote standing in for GitHub:** 54.2 KB to 18.5 KB, then 21.7 KB after two fix rounds;
branch code imported every run. Run 1 (no retrospective): stopped at step 1 on the retrospective
check, wrote nothing, offered to draft it; $0.75, 4 turns. Run 2 (retrospective added by hand): checks
passed, then refused at 7.6 on the Epic's open bug (CONV-10, whose requirements say it closes after
a person's preview check), after step 6 had already recorded the phase and staged files; it also
corrected the hand-written retrospective against the REVIEW record (my error: it said "one-shot
timer"); $3.88, 32 turns. Fix: a read-only open-items check (`closeEpicCheck`) in step 1, and 7.4
closes the Epic's finished bugs too. Run 3 (same start, after the fix): stopped at step 1 on that
bug, nothing written, offered the two ways on; $0.98, 9 turns. Run 4 (the bug's close requested by
hand first): all checks, one confirm at `checkpointed`, then one SHIP commit, clean tree, the unit
reading *closing* on a commit, the `Closes:` line and the undo note in the commit message (no pull
request possible); $7.02, 31 turns. Fresh reads of the rewrite against the code: 7 Important and 5
Minor, all confirmed; then 4 Important and 4 Minor in round 1's own fixes, one of them showing a
round-1 change was wrong (a broken unit record does block every write). A third read of round 2 found 1 Important and 4 Minor; at the ceiling, two sentences were narrowed
(a row outside the Epic is asked again with `rerequestCloses`; `broken` only where a result carries
it) and three rare cases left as stated limits (shallow clones, rows rebased after an earlier SHIP),
which SIG-380's confirm-after-rebase mostly removes.

## Unattended Epic trial (2026-11-04)

A practice CSV library (FEATURE tier, `attention: unattended`, no GitHub remote), `/sig:drive M1.E1`
in one `claude -p` session, with the pick and how-to-run answers in the prompt (no question tool in `-p`).

- **Run 1 is invalid:** `drive.md` named no `${CLAUDE_PLUGIN_ROOT}`, so the agent found Signal under
  `~/.claude/plugins` and ran the cached 0.1.53 for every command and tool. Fixed in #341.
- **Run 2, on `main` plus #341:** DISCUSS to REVIEW without a person, stopping only at SHIP's floors
  (pull request, retrospective). 23 min, $16.93. Four fresh executor agents, one commit per slice; three
  reviewers; VERIFY passed 28 of 28 criteria; REVIEW found 1 Important (a missing test), fixed in one round
  with a fresh read. 33 of 33 tests pass; hand checks of quoting, embedded newlines, CRLF and an unclosed
  quote correct. Records: every Epic file in its folder, tree clean, no commit marking STATE fresh.
  Commit check and stop hook never had to act.
- **Costs and rough edges:** 6 product decisions queued for a person (built on the agent's
  recommendation); the preflight could not check requirements that DISCUSS had not written yet, and
  after DISCUSS listed this run's own queued decisions as blocking (the agent went on, against
  `drive.md`'s rule); the test-map check returned "cannot evaluate"; one slice had no fail-first proof;
  25 permission refusals were the harness's allowlist, not Signal.

## Step 3, run 1 (2026-11-04)

One small backlog feature on the test project (keep a device's unsynced edits as a separate copy when
the saved version also moved), built twice from the same `main` commit in scratchpad clones (bare local
origins, not a worktree of the real repo). Same model, prompt text, allowlist and "no person available"
line. Signal: `/sig:drive`, `attention: unattended` set in the clone. Plain: Signal disabled (absent
from the session's plugin list). The verdict rule was written before either run: Signal wins only with
strictly fewer confirmed defects, no more steps-in, and at most 3x the time and cost.

| | Signal | Plain |
|---|---|---|
| Wall time | 81 min | 15 min |
| Cost | $52.55 | $8.04 |
| Finished | no: stopped at REVIEW's loop ceiling, a draft fix saved for a person | yes, one commit |
| Steps-in needed | 1 | 0 |
| Decisions queued | 3 | 0 (made and listed in its final message) |
| Change to `src/` | 1069 lines, 21 commits | 443 lines |
| Suite / typecheck / lint | green / clean / 0 errors | green / clean / 0 errors |
| Defects (every version run against both blind reviewers' failing tests, 7 cases) | 6 failed: 1 high (a copy whose server save fails is lost after a reload), 3 medium (a duplicate copy after a racing open, and after storage fills while caching the saved version; arguably, a timestamp-only server change moves the edits into a copy), 2 cosmetic titles | 6 failed: **2 high** (the same lost copy; and storage full while writing the copy leaves the old copy on screen to be saved over the newer server version), 2 medium (the storage-fills and timestamp-only cases), 2 cosmetic titles |

**Verdict under the pre-registered rule: Signal did not win** (6 defects each, cost 6.5x, time 5.5x,
one step-in). Signal's REVIEW fixed one of plain's two high defects (the stale overwrite) and missed the
other. A first write-up said Signal had no high defect: wrong, because the reviewer of Signal's version
never tested the failed-save case; running each reviewer's tests against both versions found it.

Where Signal's time went: DISCUSS through VERIFY took 30 min; REVIEW and its loops took 50. Each fix
round produced new findings in the previous round's fixes, until the loop ceiling stopped the run with
one self-reported Important open (holds cleared at logout before sign-out completes; not tested here).

**Follow-up: plain's result plus one review.** A fresh session on plain's commit started Signal's three
reviewer agents once (code, security, tests), fixed every confirmed Critical or Important finding in one
round with a failing-first test, and committed; no second review. 27 min, $7.35. It fixed the stale
overwrite and left the lost copy as a known limit (rated a Suggestion). Against the same 7 cases: 5
failed (1 high, 2 medium, 2 cosmetic). **Plain plus one review: $15.39 and about 42 min in total, finished,
no step-in, 5 defects; Signal: $52.55, 81 min, unfinished, 6 defects.** On this feature the review
earned its place and the rest of the flow did not.

Limits: one feature, one run each; Signal's diff names requirement IDs in comments, so the blind
reviewers could guess which was which; a countdown test in the suite is flaky on both (not counted).
