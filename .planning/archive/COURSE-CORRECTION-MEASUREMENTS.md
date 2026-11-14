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

## Step 3, run 2 (2026-11-05 to -06)

Three linked backlog features from one section of the test project's backlog, built in a row on two
scratchpad clones of the same `main` (bare local origins). Each feature was merged into its clone's
`main` before the next started, so later features built on earlier ones and on each side's own records.
Same model, allowlist and "no person available" line. Signal: `/sig:drive` per feature at
`attention: unattended`, stopping at SHIP's floors. Plain: Signal disabled, told to build, test, keep
the project's docs up to date and commit. The plan, hand checks and verdict rule were written before
any run. Signal wins only with: no more serious defects; fewer defects or fewer redos; roadmap fit and
records no worse; at most one more step-in. Plain wins only with no more of any of those. Anything
else is mixed. Records count only if they visibly prevented a defect or a redo.

Defects: a fresh blind reviewer per side per feature (source diff only, requirement and Epic IDs masked).
Every defect needed a failing test or an exact repro, and every test was run against both sides. Five
borderline severity calls went to Brett with the sides hidden.

| | Signal | Plain |
|---|---|---|
| Wall time (3 features) | ~175 min | ~40 min |
| Cost (API-equivalent; run on a Max plan) | ~$87 | ~$25 |
| Suite / typecheck / lint, each feature | green / clean / 0 errors | green / clean / 0 errors |
| Serious defects | **1** (F3: the live run view never shows the tool calls; a route drops them) | 2 (F2: the run view shows a failing lookup as a success; F3: three tool calls in one turn end the run in an error) |
| All defects | 13 (F1 3, F2 3, F3 7) | **11** (F1 3, F2 5, F3 3) |
| Redos | 0 | 0 |
| Step-ins | 12: parked decisions, all answered "accepted as recommended" | **0** |
| Continue prompts needed | 0 | 0 |
| Records score (fixed checklist, 4 per feature) | 10 of 12 | 9.5 of 12 |
| Records that visibly prevented a defect or redo | none | none |

**Verdict under the pre-registered rule: mixed.** Signal had fewer serious defects. Plain had fewer
defects in all, needed no person, and took a quarter of the time. Neither side redid earlier work.
Records came out about even. Signal filed follow-ups more reliably and wrote no false record. Plain left
two features' follow-ups inside notes marked for deletion, and wrote one false statement. Neither
side's records changed what it built. Signal read its previous feature's retro only at SHIP, after the
code was written. It also left the project's `CONTEXT.md` three Epics stale throughout.

What the 12 step-ins were: decisions Signal parked, carrying on with its own recommendation for
each. Each was checked against plain's listed choices for the same question:
- Same call: 7 (list layout, what a box starts with, no migration for the new stored keys, tools on
  automatically, how inputs are matched, how calls are shown).
- A different design, neither causing rework: 3 (one failure setting vs one per lookup; what the agent
  is told about a failure; how earlier calls are replayed to the agent).
- Something plain never built, already counted as plain defects: 2 (typed answers in the run view;
  which lookup was set to fail).
Accepting all 12 unchanged bought nothing that the build itself did not already decide.

Roadmap fit: even. Both sides built what each entry asked for, kept F3 to its first step, and left the
backlog item open.

Records, a grading difference: both sides left `CONTEXT.md` as it was at the base. Signal's grader
docked it half a point per feature, while plain's grader judged it fit the project. Graded the same way,
Signal leads 11.5 to 9.5. The verdict does not change.

Limits: three features on one project, one run each. The grader could tell F3's sides apart: plain's
own final message named the route defect it had fixed. The reviewers and Brett stayed blind. On F3
Signal ran SHIP inside its `/sig:drive` run; on F1 and F2 it needed a second `/sig:ship` run, which
is counted in its time and cost.

## Step 3, run 3: plain Claude Code with an existing records tool (2026-11-06)

The same three features as run 2, built by plain Claude Code on three fresh clones of the test
project's `main`, with three ways of keeping records: Beads 1.3.1 (an issue tracker for coding
agents), Backlog.md 1.55.1 (one markdown file per task), or neither (the project's own markdown
files, run the same day as a control). In each tool clone, the tool's own setup was run, then one
plain session moved the open records in: 23 backlog items and 1 open bug in both tools. The build
prompts were the same for all three clones; only what each tool's setup wrote into the project's
instructions differed. The plan and the reading rule were written before the builds. The key
measure was changed before the first run, because the original one could not fire: before its first
code edit, does the agent find the open follow-ups that earlier features left in the area it is about
to change, and then fix them or say why it is leaving them?

| | Beads | Backlog.md | No tool |
|---|---|---|---|
| Earlier follow-ups seen before building, F2 / F3 | 0 of 5 / 0 of 4 | 1 of 6 / 1 of 7 | **3 of 6 / 6 of 11** |
| ... and fixed or explicitly left, F2 / F3 | 0 / 0 | 0 / 0 | **1 / 3** |
| New limits filed as items | F1 only; F2 and F3 filed none | none in any feature | none (written into done notes) |
| Records checklist (6 per feature) | 6 / 4 / 2 | 3.5 / 4 / 3 | 3 / 3 / 4 |
| Suite / typecheck / lint | green / clean / 0 errors | green / clean / 0 errors | green / clean / 0 errors |
| Defects, one blind review per build (not cross-checked) | 1 serious, 9 medium, 1 cosmetic | 1 serious, 6 medium, 2 cosmetic | 3 serious, 5 medium, 1 cosmetic |
| Step-ins | 0 | 0 | 0 |
| Time / cost, builds (plus moving the records in) | 39 min / $27 (+10 min / $6.6) | 36 min / $27 (+7 min / $6.0) | 43 min / $28 |

**Under the rule fixed before the runs, neither tool earned a place.** Both made the key measure
worse, not better. In the tool clones, the agent looked up only its own item. With Beads it never ran
the "what's open" command that the tool's session-start note told it to run. With Backlog.md it never
opened the two review follow-up lists. The control saw earlier limits mostly by accident: it read
the previous feature's commit as an example to copy, and that commit listed the limits. Agents in all
three clones named new limits in their final messages and mostly did not file them. In the Backlog.md
clone, feature 3 quietly reversed a rule recorded in feature 1. A finding about Beads specifically:
its database is not in git, and no session re-exported it, so a fresh clone would show the old state.

What it shows, with runs 1 and 2: the records were never the bottleneck. In every arm of every run,
the agent did not read the open follow-ups before building. That includes Signal, which read its
previous retro only at SHIP. Where it did read them, it was by accident. Moving the records into a
better-shaped store did not change that. Whatever closes the gap has to put the relevant open items
in front of the agent before it builds, and check afterwards that every limit it named was filed.
Telling the agent to look did not work, from Signal's prose or from Beads' session-start note.

Limits: one build per clone per feature. Each build's defects come from one blind reviewer, not
cross-checked between clones, and severity is the reviewer's call. The control's three serious
defects, against one for each tool, are a single-reviewer count; and the key measure was not
designed to show defects. The F1 and F2 blind copies were first cut from the wrong commit; this was
caught and redone before any review.

## Step 3, run 4: plain Claude Code plus the two slim checks (2026-11-08)

The first test of SLIM-SIGNAL.md pieces 2 and 5, built as two hooks: `show-open-items.js` (before a
build, prints the rest of the backlog section the item sits in, open and done, plus open bugs naming
the same files) and `check-limits-filed.js` (after, sends the agent back once if it named limits and
filed none as open items). One fresh practice clone of the test project from the same base, the same
three linked backlog features and the same prompts as run 3. Signal itself disabled; only the two
hooks added. Control: run 3's no-tool arm. The rule for reading it was written before the run.

| | Plain + the two checks | Control (run 3, no tool) |
|---|---|---|
| Earlier items shown or read before building, F2 / F3 | **9 of 9 / 10 of 10** | 3 of 6 / 6 of 11 |
| ... and fixed or explicitly left, F2 / F3 | **2 / 6** (F3: 10 counting one blanket line) | 1 / 3 |
| New limits filed as their own open items | **all three features** | none |
| Every limit in the final message filed | **all three features** | partly, all three |
| Records checklist (6 per feature) | **5.5 / 5.5 / 4** | 3 / 3 / 4 |
| Suite / typecheck / lint | green / clean / 0 errors | green / clean / 0 errors |
| Defects, one blind review per build (not cross-checked) | 1 serious, 7 medium, 3 cosmetic | 3 serious, 5 medium, 1 cosmetic |
| Step-ins | 0 | 0 |
| Time / cost | 39 min / $28 | 43 min / $28 |
| Times the after-check sent the agent back | 0 | n/a |

**Under the rule fixed before the run, the checks work.** Acted-on items rose on both features, all
three features filed their limits as open items, serious defects fell, no one stepped in, and time
and cost were unchanged. The after-check never had to fire: the before-check's closing line, which
says how to file limits, was enough on its own.

What it shows: putting the items in front of the agent works for seeing; it is not enough for acting.
F2 was shown all nine items and acted on two; it edited the exact lines two of the others name and
mentioned neither. F3 left the rest with one line ("this change doesn't touch them"), which was false
for the two items closest to its change. The reasons behind choices still live only in final
messages, never in the records. The hook's text (about 15 KB) was over Claude Code's inline limit, so
it was saved to a file; both sessions read that file as their first step, but shorter text would be
safer.

Next, from this: shorten the hook's text (open items in full, done items as their limit lines only);
and add to the after-check that every shown item naming a file the change touched is either fixed or
named in the final message with a reason. Both are code.

Limits: one build per feature, one blind reviewer per build, not cross-checked. The control ran two
days earlier. I built the hooks and knew the items; graders and reviewers were fresh agents.

## Step 3, run 5: the tightened slim checks, features 2 and 3 again (2026-11-08)

What changed from run 4 (branch `feat/slim-checks-tighten`): the before-check text is about 7 KB
instead of 16 KB, so it is shown inline (run 4's was saved to a file); each open item is one line
with its code names and line number, and the closing instruction says a line covering "the rest"
does not count. The after-check also sends the agent back once when a shown item names a file or code
name the change touched and is neither fixed nor named in the final message.

Same start as run 4's F2 (a fresh practice copy at run 4's F1 merge, run 4's later branches
removed), same prompts, model and flags. F3 starts from run 5's own F2. Control: run 4's F2 and F3.
Rule written before the run: acted-on higher on both features item by item; serious defects no more
than run 4's; records score no more than 1 lower per feature; no step-ins; time and cost within about
25%.

| | Run 4 | Run 5 |
|---|---|---|
| F2 items seen / acted on (item by item) | 9 / 2 | 10 / 9 (2 of them only after a push) |
| F3 items seen / acted on (item by item) | 10 / 6 | 17 / 15 |
| Times the after-check sent the agent back | 0 | F2 1 (2 items), F3 1 (1 item) |
| Records score F2 / F3 | 5.5 / 4 | 6 / 4 |
| Defects F2 | 0 serious, 2 medium, 3 cosmetic | 0 serious, 1 medium, 1 cosmetic |
| Defects F3 | 1 serious, 3 medium | 1 serious, 2 medium |
| Step-ins | 0 | 0 |
| Time / cost, F2 + F3 | 28 min / $20 | 35 min / $22 |

N differs between runs: the grader counted items afresh each time, and F3 starts from a different F2.

**Verdict: passes on what it was built for, and is just over on time.** Acted-on went from 2 of 9 to
9 of 10 (F2) and 6 of 10 to 15 of 17 (F3). Records and defects held or improved. Time was 26% over
(the bound was about 25%) and cost 11% over; the extra is in F3 (26 min against 16), which fixed or
rewrote more earlier follow-ups. The F3 serious defect is the same in both runs (the mock lookup
finds the record when the agent passes nothing or a wrong value under another name); neither check is
about it.

What it shows:
- **Most of the gain came before the build, not from the push.** Of the 24 items acted on, 3 came
  after a push. The shorter inline text and the "one line for the rest does not count" instruction did
  the rest. Run 4 had the full text too, but in a file.
- **The push checks names, not substance.** Both F2 pushes were items that shared only a code name
  with the change (`turn_cap`, `/api/rehearse/runs`). The agent said so, truly, in one reply. The
  F3 push was minor but real. It missed one ignored item in F2 (a test item about the agent prompt,
  which F2 rewrote) and one in F3 (dismissed under "and the rest", after the session had looked at it).
- **New gap: a feature reversing an earlier feature's rule.** F3 made the mock tools hand typed answers
  back to the agent, against F1's recorded "the agent is never sent them", and did not say it overrode
  that rule or update the two doc lines. It also left F2 marked "not yet merged". Neither check looks
  for this; it is piece 7 (standing rules as tests).
- One test in the project's suite failed once in three runs after the merge (flaky); typecheck clean,
  lint 0 errors.

Next: keep both checks as they are. The push costs a turn on a shared name and catches little on its
own, but it is what makes the instruction more than words; drop it only if a run shows the instruction
alone holds. The reversed-rule gap goes to piece 7.

Limits: one build per feature, one blind reviewer per build, not cross-checked. I built and tuned the
checks on run 4's records, so run 5's F2 was the case the tuning was aimed at; F3 started from new
records. Graders and reviewers were fresh agents with run 4's briefs.

## Step 3, run 6: standing rules shown at the end, features 2 and 3 again (2026-11-09)

What changed from run 5: the end check also lists the "never / always / only when" sentences of the
`AGENTS.md` and `CLAUDE.md` files in the folders the build changed, as they stood at the start, and
asks which the change breaks (SLIM-SIGNAL piece 7). The before-build text gained one sentence: a test
for a never/always rule checks every route out, not one field. Why: in runs 3 and 5, F3 reversed F1's
recorded rule (typed answers are never sent to the agent) without saying so; in run 5 F1 had tests for
the rule and they passed, because they checked the system prompt and F3 added tool results.
Matching rules to the change by code name was tried first on replay and missed: the rule was in plain
words, and the code used other names. Same base (b67dc2c), prompts, model, flags; fresh clone with no
run 5 branches. Rule written before the run.

| | Run 5 | Run 6 |
|---|---|---|
| F3 reversed a recorded rule without saying so | yes (F1's typed-answers rule) | no (F3 kept it: tools return only system-record entries) |
| Stale rule lines caught by the rule list | (no rule list) | 1, real: F2's "the make-up call is unchanged", fixed after the push |
| Rule lines wrongly claimed broken | | 0 of 13 (F2), 0 of 14 (F3) |
| Extra pushes from the rule list | | 0: both pushes would have happened for items anyway |
| Acted on, F2 (run 5's list of 10, same records) | 9 | 7 |
| Acted on, F3 (each run's own grader) | 15 of 17 | 8 of 20 |
| Records score, F2 / F3 | 6 / 4 | 6 / 4.5 |
| Defects, F2 | 0 serious, 1 medium, 1 cosmetic | 0 serious, 1 medium, 2 cosmetic |
| Defects, F3 | 1 serious, 2 medium | 0 serious, 4 medium |
| Step-ins | 0 | 0 |
| Time / cost, F2+F3 | 35 min / $22 | 43 min / $23.6 (+23%, +7%) |

**Under the rule fixed before the run, it fails:** acted-on fell by more than one item on F2. Every
other line of the bar holds.

What it shows:
- **The rule list did one real thing:** it put F2's "the make-up call is unchanged" in front of F3,
  which had made it false, and F3 fixed it. The grader confirmed the catch. No false claims, and no
  extra turn, because the item check was pushing anyway.
- **F3 not reversing F1's rule cannot be put down to the check.** F3 settled that design before the
  end check ran, and earlier F3 builds reversed the rule silently in 2 of 5. One clean run is weak.
- **The "test every route" sentence had no effect seen:** F3 wrote no test that typed answers never
  reach the agent through a tool result.
- **The rule list's limit:** a stale line with no never/always word ("Both wrappers say every lookup
  and action succeeds at once") was not listed and stayed stale. Not widened on one case.
- **F2's drop is real on identical records:** two items (a remembered answer sent as a fact, more than
  100 answers) were ignored in the final message before any push; one more (Sentry request bodies)
  was not named. Whether that is run-to-run variance or the one added sentence, one run cannot say.
- **F3's drop is partly grading.** Run 5's grader counted "outside this feature" as a reason and left
  out one earlier review's items as file-only overlap; run 6's grader counted names without a reason, or
  eight items under one reason, as not acted on, and included those items. The two cannot be put on
  one list. F3 did name every item it was shown, one by one; many had no reason.
- **F3 medium #2** (a tool whose input the make-up call left empty finds the record whatever the agent
  passes) is the same kind of bug as run 5's serious one, rated differently by a different reviewer.
  Not counted as an improvement.
- Two slips for piece 5, filed here, not fixed: a later F3 commit made its own BACKLOG note false ("the
  agent never sees those entries" does not hold for a tool from an earlier phase), and a full-suite
  failure it could not identify (possibly flaky) was named only in chat, not filed.

Next, proposed: one more F2 on a fresh clone, same hooks, to see whether 7 of 10 is noise (about 12
min, $8). The run 6 verdict stands whatever it shows.

Limits: one build per feature, one blind reviewer per build, one grader. Graders differed in how
strictly they counted, so F3's acted-on is not comparable across runs. I built the check and replayed
it on runs 3 and 5.

## Step 3, run 7: F2 again, and every run regraded on one sheet (2026-11-10)

Why: run 6 failed its bar on F2's acted-on (7 of run 5's 10, against 9), and its F3 number could
not be compared with run 5's because the two graders counted differently. Run 7 builds F2 once more
on a fresh clone (same base b67dc2c, prompt, model, flags; hooks pinned at d18961d5, identical to run
6's). Then one fixed grading sheet per feature, written before grading: one list of items, one rule
for "acted on" (fixed, or named on its own with a reason that is about that item and true against the
diff; a reason shared across several items, or none, does not count). One grader scored every build of
a feature in one pass, the builds labelled with letters. Rule for reading it written before the run.

| F2, same 14 items, one grader | Run 5 | Run 6 | Run 7 |
|---|---|---|---|
| Acted on | 8 | 6 | 6 |
| of those, after the end check's push | 2 | 1 | 2 |
| Broke a recorded rule without saying so | no | no | no |
| Time / cost | 9 min / $7.0 | 11 min / $7.7 | 16 min / $9.8 |

| F3, same 18 shared items + that run's 5 F2 follow-ups, one grader | Run 5 | Run 6 |
|---|---|---|
| Acted on, shared | 2 of 18 | 4 of 18 |
| Acted on, own F2 follow-ups | 2 of 5 | 2 of 5 |
| Total | 4 of 23 | 6 of 23 |

What it shows:
- **Run 5's F3 "15 of 17" was the grader, not the build.** On the common sheet run 5's F3 acted on 4
  of 23 and run 6's on 6. The earlier grader counted "outside this feature" said once for several
  items as a reason for each. So run 5's record on acting on items was weaker than reported, and
  run 6 did not fall back on F3.
- **On F2 the drop holds on one sheet:** runs 6 and 7 both 6, run 5 8. The only setup difference is
  the one sentence added to the before-build text in run 6 ("a test for a never/always rule checks
  every route out"). In run 7, four typed-answer items were left under one shared line. Under the
  rule fixed before the run, the sentence is removed (done 2026-11-10). It also showed no effect on
  what it asked for. The check it asked for now goes into shaping (SLIM-SIGNAL piece 1) instead.
- **Acting on items is still low everywhere:** at best 8 of 14 on F2 and 6 of 23 on F3 by the strict
  rule. Most misses are items covered by one shared reason. The end check only catches items whose
  code the build changed, and a group line already gets past it when each item is named.
- In all three F2 builds the agent narrowed "Both wrappers say every lookup and action succeeds at
  once" (no never/always word, so not on the rule list) and rewrote it to state the exception. So
  that line was handled each time without the rule list.

Limits: three F2 builds and two F3 builds. Labels hid run numbers, but the repo paths named them.
One grader per feature. Two borderline calls are listed in the grader's notes (run 5's F2 could be
7, run 7's could be 5). Run 6's F3 line in the section above ("not comparable") is replaced by this.

## Step 3, run 8: one line per shown item, F2 (2026-11-10)

What changed: the before-build text asks for every shown item to get its own line in the final
message, with "fixed" or a reason about that item; a line naming several items counts for none. The
end check now covers every shown item (not only those whose code the build touched), keeps items with
no code name, and sends the agent back once for any item without a line that names it alone and carries
at least four words of reason. A limit line that restates a shown item is no longer read as a new limit.
Why: on one sheet, runs 5-7 missed mostly by leaving items under one shared reason, or by name only,
and items whose code was untouched were never checked. Same base, prompt, model, flags; fresh clone;
hooks pinned at 65873fe2. Rule for reading it written before the run. All four F2 builds were graded
again together by one grader (letters shuffled), so runs 5-7 moved by one item each from the
three-way grading (8, 6, 6 → 8, 5, 7): that is the grader-to-grader spread.

| F2, same 14 items, one grader | Run 5 | Run 6 | Run 7 | Run 8 |
|---|---|---|---|---|
| Acted on | 8 | 5 | 7 | **13** |
| of those, after the push | 2 | 1 | 2 | 1 |
| Reasons that only restate what the item is about (true / given) | 3/4 | 3/3 | 3/3 | 10/12 |
| Broke a recorded rule without saying so | no | no | no | no |
| Records score | 6 | 5.5 | 6 | 6 |
| Time / cost | 9 min / $7.0 | 11 min / $7.7 | 16 min / $9.8 | 14 min / $8.6 |
| Items the end check sent back | | | | 29 of 36 |
| of the 14, sent back though already answered (false flags) | | | | 7 |

**Under the rule fixed before the run, it fails:** 7 of the 14 were sent back though the grader
counts them answered (bar: at most 2). Acted-on (bar: 9), time, cost, rules and records all pass.

What it shows:
- **The gain came before the end check ran.** The main report already gave all 36 shown items a
  line each, one by one; 12 of the 14 counted from it. So the before-build instruction did the work.
- **The end check's reason rule is too strict for short true reasons.** "Continue right after the
  cap: unrelated, because it's about the Continue button and the turn cap" has three words of its own
  beyond the item's, so it was sent back. On paper, two words would cut false flags across runs 5-8
  from 9 to 5, but would also pass "left, it matters more now" and run 8's long but false Sentry
  reason.
- **The push still found the one real miss:** rereading the 29 lines, the agent saw that its change
  now puts user text in the request body the Sentry item is about, which its main report had called
  unrelated, and filed it. A word count cannot tell a true reason from a false one, so the
  threshold is left at four and the false flags are accepted for now: they cost one turn, within time.
- **10 of 13 rest on "unrelated, because it's about X".** The grader checked each against the diff and
  all 10 hold. That is what the sheet asks for, but it is a light kind of acting on: it says the item
  was looked at and set aside correctly, not that anything was fixed.
- E1-small (the `RehearsalSetup.tsx` size) was missed by three of four builds the same way: they
  answered the stop-route half only.

Limits: one build. I tuned the four-word rule on runs 5-7 before the run. No blind defect review this
time (F2's defects have been 0 serious in every run).


## Step 3, run 9: one line per shown item, F3 (2026-11-11)

What changed from run 8: nothing in the before-build text; two fixes from the PR review (a file name
alone no longer marks a new limit as a shown item; an item that cannot be named is not shown). F3
started from run 8's F2 merge. Graded on `grade-sheet-f3.md` by one grader, runs 5, 6 and 9 together
under letters; records by a fresh grader with the R1-R7 checklist. Rule for reading it written
before the run.

**Correction:** the F3 sheet's "18 shared items" is 17 (its table groups the five typed-answers items
in one row and was miscounted). Runs 5 and 6 read 2 and 4 of 17, not of 18.

| F3, one grader | Run 5 | Run 6 | Run 9 |
|---|---|---|---|
| Acted on, 17 shared items | 2 | 4 | **14** |
| Acted on, own F2 follow-ups | 2 of 5 | 2 of 5 | 7 of 8 |
| of all acted on, after the end check's push | 0 | 0 | 2 |
| Changed F1's typed-answers rule | yes, silently | no | yes, said so (fully only after the push) |
| Records score | 4 (own grader) | 4.5 | 5 |
| Time / cost | 26 min / $15.2 | 31 min / $16.0 | 26 min / $13.6 |
| Items the end check sent back | | | 35 of 42 |
| of the sheet items, sent back though already acted on (false flags) | | | 14 |

**Under the rule fixed before the run, it fails on false flags only:** 14 against a bar of 3.
Acted-on (bar: 8), time, cost, the rule and records pass.

What it shows:
- **The before-build instruction holds on the longest list.** The main report gave all 42 shown items
  a line each; every shared item counted was counted from it. Same pattern as run 8.
- **The end check's item push does little and costs a turn.** It sent back 35 items; the agent
  reworded them as "because it is about X". 2 items became acted-on after it. Replayed at other
  reason thresholds, it never gets under 3 false flags (four words: 14; none: 4), because some
  items have bad leads: three done entries all got the same opening sentence (where the item came from), the paragraph's
  first sentence, so no line can name one alone.
- **The rules part of the end check did catch something.** F3 narrowed F1's rule (a mock tool returns
  a typed answer). The main report mentioned it as a partial fix; after the push it said the rule no
  longer holds and corrected both docs lines. Run 5's F3 made the same change and said nothing.
- **About 20 of the per-item lines are "left, unrelated (topic)".** The grader found each topic true
  but close to restating the title; two reasons were wrong (the scroll item called an "observer
  step", and E1-small's size half ignored again, the fourth of five builds to do so).
- **The records lost a point for a false note,** the same kind as run 6's: "that tool's entry is never
  sent up front" is false when a phase run ties the failure to an earlier phase's tool.

Limits: one build. Run 9's F2 follow-up list differs from runs 5-6. Letters hid run numbers, but repo
paths named them. No blind defect review.


## Step 3, run 10: no item send-back, F2 then F3 (2026-11-11)

What changed from runs 8-9: the end check no longer sends the agent back for a shown item without a
line of its own, and the before-build text no longer says it will. The before-build request for one
line per item, the limits-filed check and the rules check are unchanged. F2 from the same base as run
8, then F3 from this run's F2 merge. Hooks pinned at 1bbe3908. One grader per feature, under letters:
F2 against run 8, F3 against run 9 (so runs 8 and 9 were graded again). Records: F2 in the same
grader, F3 by a fresh grader. Rule for reading it written before the run.

| | Run 8 F2 | Run 10 F2 | Run 9 F3 | Run 10 F3 |
|---|---|---|---|---|
| Acted on, sheet items | 13 of 14 | **13 of 14** | 15 of 17 | **15 of 17** |
| Acted on, own F2 follow-ups (F3) | | | 7 of 8 | 7 of 7 |
| of those, after a push | 1 | 0 | 1 | 0 |
| False reasons | 1 (fixed after the push) | 1 | 0 | 0 |
| Changed a recorded rule without saying so | no | no | no | no |
| Records score | 5.5 | 5.5 | 5 (earlier grader) | 4.5 |
| Time / cost | 14 min / $8.6 | 14 min / $7.7 | 26 min / $13.6 | 27 min / $13.3 |

Graders moved runs 8 and 9 by one item each against their first grading (run 8 records 6 → 5.5, run 9
shared 14 → 15): that is the grader-to-grader spread.

**Under the rule fixed before the run, it holds:** F2 13 (bar 11), F3 15 (bar 12), time and cost
within bars, no silent rule change, records within one point.

What it shows:
- **The send-back was not needed.** Same acted-on counts without it, and every item counted came from
  the main report. The warning sentence in the before-build text did not matter either.
- **The rules check is still the part that changes outcomes.** Both F3 builds narrowed F1's
  typed-answers rule. Before the check they mentioned it only in passing, and the rule lines in the
  docs contradicted the new code. After the rules check they named it as a rule change and fixed the
  lines.
- **The misses are the same in every build:** a size or test part of a two-part item, and the
  cost-of-failed-calls item ("a separate change" is not a reason). Run 10's F2 called E1-small
  unrelated though it grew that file.
- **Records lost a point for a false note again** (F3: "a lookup answers only when the input matches
  the person's values"; the code also matches system-record values), and three older sentences went
  stale where later text in the same file was correct.

Limits: one build per feature. Repo paths could still name the run. No blind defect review.


## Step 3, run 11: shape the item first, F2 then F3 (2026-11-11)

What changed from run 10: piece 1's first slice. For an item with no `Files:` list and `Checks:`, the
before-build text asks for both before any code (drafted by the agent here: the prompts say no person
is available), and asks that a check for a never/always/only rule test every route out. The end check
names changed files outside the list. Same base and prompts as run 10; hooks pinned at e1040104. One
grader per feature under letters, against run 10 (graded again); F3 records by a fresh grader.

| | Run 10 F2 | Run 11 F2 | Run 10 F3 | Run 11 F3 |
|---|---|---|---|---|
| Wrote Files and Checks before the first code edit | | yes | | yes |
| Acted on, sheet items | 13 of 14 | **14 of 14** | 14 of 17 | **13 of 17** |
| Acted on, own F2 follow-ups (F3) | | | 7 of 7 | 4 of 4 |
| of those, after a push | 0 | 0 | 0 | 0 |
| Files changed outside the list, unexplained | | 0 | | 0 |
| Narrowed F1's typed-answers rule, called it a rule change before the end check | | | no | no (planned in the shape, listed as a decision) |
| Records score | 6 | 5 | 4.5 | 4 |
| Time / cost | 14 min / $7.7 | 15 min / $8.9 | 27 min / $13.3 | **35 min / $18.4** |

Graders moved run 10 by one item or point against its first grading (F2 records 5.5 → 6, F3 shared
15 → 14).

**Under the rule fixed before the run, it fails two lines:** F3 took 35 min and $18.4 (bars 33 and
$18), and F3 did not call its change to F1's rule a rule change before the end check. Shaping before
code, files, acted-on, silent rule changes and records pass.

What it shows:
- **A defect in the check cost F3 a turn.** F3 wrote every check as a labelled bullet ("- Tools:
  ..."); the parser stopped at the first one, read no checks, and the end check asked for a shape the
  item already had. F3 read the hook's source to learn the format and reworded its checks. Fixed in
  the same branch. Some of the time and cost overrun is this.
- **Shaping turned the rule change into a decision made before the code.** F3's shape commit already
  said a tool may return a typed answer, with a check asserting it, and the main report listed it under
  its decisions. It still did not update the two rule lines until the rules check, so the docs
  contradicted the code until then.
- **The every-route instruction produced every-route checks, with tests.** F3's "only the agent" check
  (no tool data in any make-up, person or observer call, in a phase run, a whole call and a replay)
  and its "never logged" check each have a test that does what it says. But no check holds F1's rule,
  because the shape chose to narrow it.
- **The file lists were wide.** F3 listed 26 files and stayed inside them but for one test fixture,
  which it explained. A list that wide holds the build to little.
- F2 acted on all 14; the misses in F3 are the usual ones (two-part test and size items, the cost
  item).

Limits: one build per feature. The agent drafted its own shape; the person's side is untested.

## Step 3, run 12: a shape that changes a rule rewrites its line first; F3 only (2026-11-13)

What changed from run 11: the parser fix, and one line in the before-build text for an unshaped item:
"If this work changes one of those rules, say so in the item and rewrite that rule's line in its
instruction file in the same commit, before any code." F3 only, from run 11's F2 merge (7ebc5c2), same
prompt; hooks pinned at 87c707e8. One grader under letters against run 11's F3; records by a fresh
grader.

| | Run 11 F3 | Run 12 F3 |
|---|---|---|
| Committed Files and Checks before the first code edit | yes | yes |
| Rule lines it changed, rewritten before the first code commit | no (after the rules check) | **yes, both, in the shape commit** |
| F1's typed-answers rule | narrowed | **kept** (tools return record entries only) |
| Acted on, sheet items | 15 of 17 | 15 of 17 |
| Acted on, F2 follow-ups | 3 of 4 | 4 of 4 |
| of those, after a push | 0 | 0 |
| Files changed outside the list, unexplained | 0 | 0 (24 changed, all listed) |
| Records score | 4 | **5.5** (no false statement) |
| Time / cost | 35 min / $18.4 | **26 min / $13.2** |

This grader put run 11's F3 at 15 of 17 and 3 of 4 (the run 11 grader: 13 of 17, 4 of 4).

**Under the rule fixed before the run, it passes every line.**

What it shows, with one run:
- **The two rules F3 extended were rewritten in the shape commit**, before any code, and the rules
  check had nothing to send back. It also kept F1's rule this time by design, so whether the new line
  or a different design choice did that cannot be told apart from one run.
- **Time and cost came back under run 10's bar** with the parser defect gone.
- **The rules check reads never/always lines only.** A plain sentence the build made stale ("Both
  wrappers say every lookup and action succeeds at once") stayed, in this run and in run 11.
- **F3's checks cover every model call and the call-log rows, not logs or Sentry,** though its own
  records say tool calls are never logged. No check in either run tests that typed answers never
  reach the agent through a tool result.

## Step 3, run 13: each check names its test; F2 then F3 (2026-11-13)

What changed from run 12: each check must name, in backticks, the test file that holds it, or say "not
testable by code" and why; where nothing can run tests yet, that comes first. The end check sends back
checks that name no test file the build changed. New files not yet committed now count as changed.
Same base and prompts as run 11; hooks pinned at 1f4d8316. One grader per feature under letters (F2
against run 11's F2, F3 against run 12's F3), and new: each check read against its test. Records by a
fresh grader per feature.

| | Run 11 F2 | Run 13 F2 | Run 12 F3 | Run 13 F3 |
|---|---|---|---|---|
| Files and Checks before the first code edit | yes | yes | yes | yes |
| Checks with a test that does what they say | 9 of 9 | 10 of 10 | 13 of 14 | 10.5 of 11 |
| Checks marked "not testable by code" | 0 | 1 (logs; partly fair) | 0 | 2 (logs: not fair; real models: fair) |
| Rule lines it changed, rewritten before the first code commit | no (same commit) | yes | yes | **no**: the planned one yes; the typed-answers one, decided during the build, after the code commit (said before the end check) |
| Acted on, sheet items | 13 of 14 | 13 of 14 | 16 of 17 | 14 of 17 |
| Acted on, own F2 follow-ups | | | 4 of 4 | 7 of 9 |
| of those, after a push | 0 | 0 | 0 | 0 |
| Files outside the list, unexplained | 0 | 0 (all 16 listed) | 0 | 0 |
| Records score | 5 | 5.5 | 5.5 | 4.5 |
| Time / cost | 15 min / $8.9 | 18 min / $10.2 | 26 min / $13.2 | 26 min / $14.1 |

This grader put run 12's F3 at 16 of 17 (run 12's grader: 15). The end check sent back no untested
check in either feature: every check named a test file the build changed.

**Under the rule fixed before the run, it fails one line:** F3 rewrote the typed-answers rule line after
its first code commit. Every other line passes; F2's time (17 min 59 s) and F3's records (4.5) are at
their bars exactly.

What it shows:
- **The escape is where the hard check went.** Both features marked their "never logged" check "not
  testable by code". It is testable (plant a marker value, check the logger, Sentry and the call-log
  row); run 11's F2 did just that. The gap run 12 showed is still open, now labelled.
- **A rule change planned in the shape is rewritten first; one decided during the build is not.** F3's
  shape rewrote the failing-lookups rule before code; it then decided mid-build that a tool may return a
  typed answer and updated that line after the code, though it said so in its main report.
- **Every named test was a real one.** All but three checks across both features have a test that does
  exactly what the check says; the three partly ones each miss a comparison against the old output.

## Step 3, run 14: rule checks are always testable; a mid-build rule change is rewritten next (2026-11-13)

What changed from run 13: the before-build text says a never/always/only check is always testable (plant
a marker value, check every way out, logs and error reports included), and the end check refuses "not
testable by code" on such a check; and both shaped and unshaped text say a rule changed during the build
gets its line rewritten in the next commit, before more code. Same base and prompts; hooks pinned at
ac43716c. One grader per feature under letters (F2 and F3 each against run 13); records by a fresh grader
per feature.

| | Run 13 F2 | Run 14 F2 | Run 13 F3 | Run 14 F3 |
|---|---|---|---|---|
| Never/always/only checks marked "not testable by code" | 1 | **0** | 1 | **0** |
| Never-checks whose test covers every way out | 2 of 3 | 2 of 3 | 1 of 3 | 3 of 4 |
| Checks with a test that does what they say | 9 of 10 | 8 of 9 | 10 of 11 | 13.5 of 14 |
| Rule lines rewritten no later than the code that changes the behaviour | yes | yes | no | **no**, and called a rule change only after the end check |
| Acted on, sheet items | 14 of 14 | 13 of 14 | 16 of 17 | 13 of 17 |
| Acted on, own F2 follow-ups | | | 7 of 9 | 4 of 6 |
| of those, after a push | 0 | 0 | 0 | 0 |
| Files outside the list, unexplained | 0 | 0 | 0 | 0 |
| Records score | 5.5 | **6** | 4.5 | **6** |
| Time / cost | 18 min / $10.2 | 16 min / $9.2 | 26 min / $14.1 | 30 min / $16.4 |

This grader put run 13's builds a little differently from run 13's grader (F2 14 of 14, F3 16 of 17).
The end check sent F2 back once for a never-check with no test; F2 then wrote marker tests for two more
routes, checking their responses, logs and error reports.

**Under the rule fixed before the run, it fails two lines:** not every never-check covers every way out
(F2 misses one route's error report, F3 one route's logs), and F3 rewrote the typed-answers rule only after
the end check. The other lines pass; F3's 13 of 17 is at its bar.

What it shows:
- **The label loophole is closed, and coverage rose where it was weakest.** No rule check was marked
  untestable, and F3's never-checks went from 1 of 3 to 3 of 4 covering every way out. What is left is a
  route missed, not a check dodged.
- **The mid-build sentence did nothing.** Runs 11, 13 and 14 each decided mid-build to let a tool return a
  typed answer, and each wrote the rule line late; in run 14 it was not called a rule change until the end
  check showed it. The rules check is what catches it, and the records end correct (6 of 6).
- **Records were the best yet on both features.**
