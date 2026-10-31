---
name: sig:ship
description: "SHIP phase — check the change is ready, open the pull request, record the phase and close the work in the project's records, in one commit."
args: ""
---

# SHIP

Get the reviewed, verified change into a pull request a person can merge, with the project's records
saying what shipped.

Every `tools/lib/`, `skills/` and `references/` path in this file is under `${CLAUDE_PLUGIN_ROOT}/`:
import from there, never from another copy of Signal. `baseDir` is the project root; `planningDir` is
`.planning/` in it; `state` is `readState(baseDir)` (`tools/lib/state.js`) and `currentEpic` is its
`current_epic`. Keep each call below on one line when you quote it.

## 1. Check SHIP can run (writes nothing)

**Profile.** `readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`):

- It throws because no profile exists: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:ship`."*
- `SHIP` is in `phases_skipped`: stop with *"This tier ({tier}) skips SHIP. If this output should
  ship, run `/sig:escalate` to upgrade the tier."*

`applyRigorOverrides({}, profile)` gives the `gates` used below.

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | Confirm each checklist step (`gates.confirm_in_phase`). |
| `checkpointed` | Confirm at PR creation. |
| `unattended` | Go through the checklist without confirming. |

At every level the pull request and the person's approval to merge still happen: they are floors
(`ship-pr`, `ship-retro`), not asks the dial can clear. `gate_strictness: strict` turns on the
check in step 9.

**Retrospective.** In Epic mode (`detectMode(state) === 'epic'`, `tools/lib/state.js`) load
`.planning/MILESTONE-{n}.md`, where `{n}` is `current_epic` without its trailing `.E{N}`; if it is
missing, stop with *"current_epic `{epicId}` points to a milestone whose MILESTONE-{n}.md does not
exist. Set current_epic to a real Epic or create the milestone file."* Pass `milestoneContent: null`
instead in linear mode, and when `unitRecordsOn(baseDir)` (`tools/lib/unit-records.js`) is true; if that call throws, print its message and **halt**: the folder is there and cannot be trusted.
Then `shipFR1Check({state, profile, milestoneContent, baseDir})` (`tools/lib/retrospective.js`):

- `{halt: false, skipped: true, reason}`: not an Epic close, or a linear project. Go on.
- `{halt: false, skipped: true, unevaluated: true, reason}`: the check did not run because the
  milestone row is stale. Print `reason` as it is, then go on.
- `{halt: false, isEpicClose: true, retroPath}`: the retrospective is there and complete. This is an
  **Epic-close SHIP**; step 7 uses that.
- `{halt: true, message}`: print `message` and stop. The person writes or fixes the retrospective,
  then runs `/sig:ship` again. There is no flag that skips this.

**Branch.** `checkBranchPosture(baseDir, { tier: profile.tier, override })` (`tools/lib/branch-guard.js`), with `override` true only for `--allow-default-branch`:

- `ok` or `not-applicable` (no pull request at this tier, or no remote): go on.
- `on-default`: print `formatBranchHalt(result, { command: '/sig:ship' })` and stop. Every commit is
  already on the default branch, so there is nothing to open a pull request from.
- `overridden`: print `formatBranchLine(result)` and go on.
- `cannot-determine`: print `formatBranchUnknown(result)` and go on; check by hand at step 5 that a
  pull request can be opened.

## 2. Load skills

From `skills/ship/`, read and apply `git-workflow-and-versioning/SKILL.md`,
`ci-cd-and-automation/SKILL.md`, `documentation-and-adrs/SKILL.md`, `shipping-and-launch/SKILL.md`
and `deprecation-and-migration/SKILL.md`.

## 3. Check before the pull request

- No secrets in the code or the git history.
- New environment variables are documented (`.env.example`).
- README updated if setup or a public interface changed; CHANGELOG updated.
- **How to undo it** is known: usually "revert the commit". Say what undoing costs when it is not
  that simple: a data migration, a published or cached artifact, a breaking rename.
- The tests pass, the build succeeds, the linter passes.
- The REVIEW report's findings are resolved or accepted.

Then call `readOpenObligations(baseDir)` (`tools/lib/obligations.js`) and print `formatObligationReport(result)`. It reports and never stops the
ship: items still open, items done, and sources that could not be read, which read as unknown, not
as none. Mark one done with `dischargeObligation(baseDir, {text, by, at})`.

## 4. Git history

Each commit is one change with a message that says what and why. No "WIP" or "fix typo" commits are
left; clean them up with the person's approval. The project's records name commits as proof, and a
merge commit keeps them; a squash or rebase merge replaces them, which step 7.6 handles.

## 5. Open the pull request

Title: imperative, under 70 characters. Add screenshots for a UI change. If the work made a
significant architecture decision, write an ADR in the project's docs folder and link it.

### Output contract

- **The PR body states what changed, why, how it was verified, and how to undo it.** In that order; the diff shows the rest.

## 6. Record the phase

1. `await transitionPhase(baseDir, 'SHIP')` (`tools/lib/state.js`) records the phase being left and
   sets `phase: SHIP`.
2. `await completePhase(baseDir, 'SHIP')` records `SHIP (date)`; running it again the same day
   records nothing new. In linear mode it also moves the finished run to `.planning/STATE-HISTORY.md`
   and returns `trimmed`: print that count. When `runEnded?.ok === false`, the `## Run ended` line
   was not added to the REVIEW report (`runEnded.path`, `runEnded.error`): say so, fix the cause and
   call `markRunEnded(baseDir)`; re-running `/sig:ship` does not write it.
3. **Stage what steps 1–2 wrote, for step 8's commit:** `.planning/STATE.md`;
   `.planning/STATE-HISTORY.md` when it exists; and the REVIEW report at `runEnded.path` when
   `runEnded?.ok === true`. A report it could not write is not staged.

## 7. Update the project's records

Each sub-step says when it runs, and stages what it writes for step 8's commit.

### 7.1 Move the Epic's story out of STATE.md (Epic-close SHIP only)

Call `evictEpicNarrative(baseDir, state.current_epic)` (`tools/lib/evict.js`). It moves the Epic's
section of the STATE.md body to `.planning/archive/<milestone>/<epic>/STATE-NARRATIVE.md`, leaves a
one-line pointer, and keeps open carry-overs live. `{evicted: true}`: stage `.planning/STATE.md` and
the new file. It refuses and changes nothing with `no-section` (nothing to move), `not-closed`, or
`lossy-card` with `missing`: the retrospective leaves out things the section says. Never force it;
fix the retrospective and run again.

**With unit records** the Epic is closed when its record is, and at this SHIP it is only
*closing*, so the call returns `not-closed`: expected, say so and go on. The story leaves STATE.md
when its close is confirmed, by step 7.7 of a later SHIP or by `/sig:docs-sweep`.

### 7.2 Regenerate the retrospectives index (Epic-close SHIP only)

`regenerateIndex(baseDir)` (`tools/lib/retro-index.js`). When `written` is true, stage
`.planning/RETROSPECTIVES.md`.

### 7.3 Sweep the capture inbox (Epic-close SHIP only)

With the work store on (`isStoreOn(baseDir)`, `tools/lib/work-store.js`) skip this and say so: the
inbox is generated from the records. Otherwise preview with
`evictTerminalToLedger(baseDir, { dryRun: true })` (`tools/lib/drain.js`), confirm as
`gate_strictness` says (`strict` asks, `off` goes on), then call `evictTerminalToLedger(baseDir)`.
DEFERRED entries stay. `danglingFence: true` means it moved nothing past an unclosed fence: say so.
Stage the inbox and the ledger when entries moved.

### 7.4 Close the backlog rows this Epic finished (Epic-close SHIP only)

Read the Epic's REQUIREMENTS and PLAN and name the backlog rows its work finished. If none, say
*"no backlog rows discharged; this Epic closed no queued item"* and go on. Otherwise call
`dischargeBacklogRows(baseDir, {rows, by: state.current_epic, at: <today>})` (`tools/lib/backlog.js`), with `rows` as heading substrings. Report each result:

- `discharged`; `already-discharged` (done by hand, fine);
- `not-found`: the substring matched no live row; check the wording;
- `ambiguous`: it matched more than one row and **wrote nothing**; name the row exactly and run again;
- `unreadable`: some records could not be read; fix them and run again.

With the work store on, schema 2, each matched item is asked to close (`requestCloses`) with the
Epic's commit as proof, the branch HEAD unless you pass `commit`; it reads *closing* until that commit
is on the default branch. It refuses (`CONFLICT`, nothing written) with uncommitted changes when HEAD
proves nothing: commit the work first. On a v1 store it refuses (`CONFIG`) naming
`node tools/work-migrate-v2.mjs`: **halt**, migrate, run again. Stage `.planning/BACKLOG.md`, the
changed records and the regenerated views.

### 7.5 The content gate (every SHIP)

Call `runShipContentGate(baseDir, { acceptStale })` (`tools/lib/ship-gate.js`) and print `formatShipContentGate(result)`. `acceptStale` lists the check ids given as
`--accept-stale <check-id>`.

- `refuse`: **halt**, no SHIP commit. Each refusal names the claim, the evidence against it and the
  edit that clears it. Make the edit and run again, or pass `--accept-stale <check-id>` on purpose.
- `overridden`: go on, and put `result.record` in the PR description under *"Shipped past the content
  gate"*.
- `pass`: go on. Advice is printed and never stops the ship, including the Jev checks when
  `TYPESAFE_API_KEY` is set (up to about a minute); copy the Jev lines into the PR description.
- `unverified`: the gate could not run. Go on, and say so in the PR description.

### 7.6 Close the unit (work store on)

Skip with the store off. Otherwise find the unit this SHIP closes:

- At an Epic-close SHIP, the Epic. At any other SHIP with no unit records, nothing.
- With unit records, read STATE again and call `unitToCloseAtShip(baseDir, state)` (`tools/lib/work-ops.js`), then act on its `kind`:
  - `epic`: the Epic, only at an Epic-close SHIP. `no-unit-records`, `not-at-ship`: nothing.
  - `unit`: `current_epic` is not an Epic ID (`phase-11`); a linear SHIP ends the run. By `status`:
    - `open`: close it.
    - `closing`: its close was requested before; ask the person whether this SHIP is a re-run of the same work. Yes: close it again. No: say the unit stays closing on its first commit and this SHIP closes no unit.
    - `closed`: this SHIP closes no unit because `current_epic` names a closed one; a person moves `current_epic` to the next unit by hand.
    - no record: run `/sig:docs-migrate --work-store`, then run again.
  - `not-a-unit-id`: say so, showing only `shown`, and close nothing.
  - `broken-record`, or `broken` on any kind: close nothing; name each record (`/sig:docs-sweep` reports them) and restore it with git, never by hand.
  - `ask`: `current_epic` is null and some records are not closed (`units`). Show them and ask the person which one, if any, this SHIP finishes; close that one, or nothing.
  - `none`: say that no unit is closed by this SHIP.

To close the Epic:

Call `closeEpic(baseDir, state.current_epic, {by, pr, release})` (`tools/lib/work-ops.js`), with `pr` from step 5 and `release` the version this ship publishes, if any. For a unit that is not an Epic, make the same call with its ID. It is not an Epic ID, so no retrospective is required: the result says so (`retro: null`, with a note to print).

**With unit records** it requests a close on `.planning/work/units/<ID>.json`, with the branch HEAD
as proof unless you pass `commit`:

- `close-requested`: the unit reads *closing* until `commit` is on the default branch. Stage the unit's
  record, `.planning/work/EPICS.md` and each milestone file whose Epic table changed. `created: true`
  means the call made the record first: say so.
- `re-requested` (`commit`, `previous`): normal after review fixes were pushed. Name both commits and
  stage as above.
- `already-requested`, `already-closed`: nothing changed.

**With the store on and no unit records** the call checks every item of the Epic and moves its
folder: `closed` (stage `moved`, `rewritten` and the regenerated lists), `no-folder` (nothing
changed), or `CONFLICT` naming `{EpicID}-*.md` files at the top of `.planning/`: `git mv` each into
`.planning/work/epics/<EpicID>/`, then run again.

Refusals write nothing:

- `OPEN_ITEMS`: **HALT.** It names each open item of the Epic. Close each (`/sig:item close`) or move
  it back (`/sig:item move <id> T`), then run again. An item still *closing* after a squash or rebase
  merge: see below.
- `CONFLICT`: **HALT.** The retrospective is missing or has a `[FILL IN]`; or `origin/HEAD` is unset
  with uncommitted changes (`git fetch origin`, then `git remote set-head origin -a`); or the
  folder case above. Fix it and run again.
- `CONFIG` with `version: 1`: **HALT.** It names `node tools/work-migrate-v2.mjs`; migrate, run again.
- `NOT_FOUND`: a unit with no record.
- `SCHEMA`: **HALT.** A record is broken somewhere in the store. `/sig:docs-sweep` or `checkRecords(baseDir)` (`tools/lib/work-records.js`) names each; `/sig:item` cannot repair one. Restore it with `git checkout -- <path>` when HEAD holds a good copy, or with `git checkout --ours <path>` or `--theirs <path>` for a merge conflict, then run again.

**After a squash or rebase merge** the branch commit recorded as proof never reaches the default
branch, so the unit and its items stay *closing*. After the merge, on the default branch with a
clean tree, make the same call. It writes nothing and returns `rerequest-proposed` with `candidates`
(each item, its `proof`, and why: `not-in-history` or `unknown-commit`). Show the list and ask the
person which items were in the merged pull request: git cannot tell for them. Then call
`closeEpic(baseDir, '<EpicID>', {by, pr, release, rerequest: [{id, proof}]})` with only those. It
returns `re-requested` with the merged commit; an item not confirmed stays open (`OPEN_ITEMS`).
Commit the changed records and views through a pull request; step 7.7 or `/sig:docs-sweep` then
confirms them.

### 7.7 Confirm closes whose commit reached the default branch (every SHIP)

With the store off, or on a v1 store, nothing happens. Otherwise call `runConfirmCloses(baseDir)` (`tools/lib/close-confirm.js`) and print its `line`; `null` means no item is
closing. It compares with the local `origin/<default>` ref and does not fetch. With unit records it
confirms units too, and the line names both (`Closes: items — … · units — …`).

- The close step 7.6 just requested reads `still closing (<EpicID>: not-on-default-branch)`: expected;
  the merge puts its commit there.
- `no-remote`, `no-origin-remote` or `not-a-repo`: git can never confirm it. The line names
  `/sig:item confirm <ID>`; run that only with the person's yes for that ID.
- For each unit it confirms (`units.confirmed`) it calls `evictEpicNarrative` (step 7.1's call), and
  returns `evictions` and one `evictionLine`: print it. For `evicted: true`, stage `.planning/STATE.md`
  and its `archivePath` (the `STATE-NARRATIVE.md` file). `evicted: false` keeps the unit closed and gives the reason: nothing to
  move, `held` (print `holdReason`), `no-card`, `lossy-card`, `unit-record-unreadable` or `error`.
  After `lossy-card`, fix the retrospective and call `evictEpicNarrative(baseDir, '<EpicID>')` again.

Stage the changed item and unit records with `.planning/work/EPICS.md` and each milestone file whose
Epic table changed. Copy the `Closes:` line into the PR description, or say no item was closing.

### 7.8 Milestone retrospective (only with `--milestone-meta`)

`generateMilestoneMetaRetro(baseDir, milestoneId, opts)` (`tools/lib/retro-index.js`), where
`milestoneId` is `current_epic` without `.E{N}`. It writes `.planning/{milestoneId}-RETROSPECTIVE.md`
with `[FILL IN]` sections, and refuses to overwrite one unless `{force: true}`: show the refusal and
let the person decide. Stage the new file.

### 7.9 Regenerate `.planning/INDEX.md` (every SHIP)

`regeneratePlanningIndex(baseDir)` (`tools/lib/planning-index.js`). It writes only when the index
changes; when `written` is true, stage `.planning/INDEX.md`.

## 8. Make the SHIP commit

Commit everything steps 6 and 7 staged as one commit, and push. It moves the pull request's head, so
**add the `review-head` label only after SHIP's final push**: a review asked for earlier reviews a
head that is gone.

## 9. Hand off

When `gate_strictness` is `strict`, run the anti-rationalization check before calling the work done:

| Temptation | Check |
|---|---|
| "Nobody reads CHANGELOGs" | They are for users, and for you in six months. |
| "I'll clean up the git history later" | Later never comes. Clean it now. |
| "Docs can wait until after merge" | If they are not in the pull request, they will not get written. |

Then read `references/anti-rationalization.md` and ask: *am I shipping this because it is ready, or
because I am tired of working on it?*

Report each of these from evidence, never from memory:

- **Pull request:** `readPullRequestEvidence(baseDir)` (`tools/lib/branch-guard.js`), printed with `formatPrEvidenceLine(evidence)`. It ticks only on a real PR URL.
- **Review findings:** `readPrReviewFindings({owner, repo, pr, cwd})` (`tools/lib/pr-review-findings.js`; `cwd` is the project folder, pass no `execFn`), printed with `formatPrReviewFindings(result)`. It lists every unresolved review
  thread, counts outdated ones separately, and prints `cannot-check` on its own line, never as none.
  It reports; it does not stop the ship.
- **Reviewer effort:** `readReviewerEffort({owner, repo, pr, cwd})` (same file), printed with `formatReviewerEffort(result)`. It flags a review run too short to have
  read the change. Add the `review-head` label only after SHIP's final push, and run this check after
  that run completes. Do not call the pull request ready to merge unless `result.readyToMerge` is
  true; otherwise say it is waiting for that review.
- **CI:** every check passes.

The person approves the merge. That is the `ship-pr` floor at every `attention` level: merging is
delivery, and nothing here merges.
