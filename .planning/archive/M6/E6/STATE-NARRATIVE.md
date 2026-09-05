<!-- Relocated verbatim from .planning/STATE.md on 2026-09-05 at the M6.E7 open.
     M6.E6 shipped and merged as PR #236; this is its closed narrative. evictEpicNarrative
     returned `no-section` because the narrative lived in the resume-pointer block rather than
     an Epic-named section, so the move was done by hand on the same relocate-never-delete
     terms. Retro: .planning/M6.E6-RETROSPECTIVE.md -->

### ▶ PREVIOUS — `M6.E6` SHIPPED and merged (PR #236), 2026-09-04. History.

**`M6.E6` IS CLOSED AT SHIP — DISCUSS / PLAN / EXECUTE / VERIFY / REVIEW are done.** *Wire the
decision queue.* Runs at **FEATURE** inside this FULL project
([`M6.E6-PROFILE.md`](M6.E6-PROFILE.md)) — the third use of the per-unit dial. Artifacts:
[`M6.E6-REQUIREMENTS.md`](M6.E6-REQUIREMENTS.md), [`M6.E6-PLAN.md`](M6.E6-PLAN.md),
[`M6.E6-VERIFICATION.md`](M6.E6-VERIFICATION.md), [`M6.E6-REVIEW.md`](M6.E6-REVIEW.md).

**⚠ The code shipped BEFORE its REVIEW phase ran.** PR #233 and #234 merged it and `v0.1.37`
released it; REVIEW ran afterwards, on 2026-09-04, and found two Important defects that are
therefore live in a released version — both fixed forward on `review/m6.e6-router-guards`
(PASS-WITH-FIXES, suite 3206). **What remains is SHIP: a pull request, and the Epic-close
retrospective.** Both are floors — `/sig:drive` halted on them rather than proceeding.

**One decision is parked and unanswered:** `Q-M6E6-1` in
[`DECISION-QUEUE.md`](DECISION-QUEUE.md) — whether meeting the outcome oracle on `v0.1.37` re-opens
VERIFY's `NOT MET` verdict. Product-altitude, painful to undo. Answer it before the retro reconciles
the two accounts.

**This narrative was four phases behind its own frontmatter until 2026-09-04** — it read *"DISCUSS
is written, PLAN is next"* while the frontmatter said `VERIFY` and the artifacts said further still.
`markFresh` advances the timestamp and the commit; nothing advances the prose, so a stale pointer
reads as fresh. Filed as an observation for the retro.

**The gap that opened the Epic, in one sentence** (closed 2026-09-04): `/sig:drive`'s description
promised *"Queues what it can defer"* and it could not — `queueDecision` shipped in `v0.1.31` with
**zero callers outside `tests/`**, so a mid-phase gray-area question was a hard halt. The first live
run to reach step 3b parked `Q-M6E6-1` and carried on.

**⚠ DISCUSS reversed the backlog row's framing, and that is the finding to carry forward.** The row
says wire the queue to a *phase command*, and DISCUSS is where gray areas are named — but
`discuss.md` §4 at `unattended` **already** auto-adopts every gray area silently. Wiring there would
*narrow* what it adopts, not add deferral: a defensible change, and a **different** one from what the
row describes. Split out to its own backlog row rather than smuggled in (`D-M6E6-2`). `/sig:drive` is
the first writer, because it is where a halt is the current behaviour.

**Routing (`D-M6E6-3`/`-4`):** the asking command tags each decision's reversibility using
calibration's existing vocabulary — a convention, no new dial (NFR2 — a fourth knob is `B75`). An
**untagged** decision **queues**; it is never adopted by default. Expect a chatty queue at first:
that is the fail-closed side of the trade working, not a defect.

**Read-forward is a noticeboard, not a loop (`D-M6E6-5`)** — answered entries are surfaced and a
person acts. Auto-applying needs a durable link to the work and can land a stale answer; re-running
the asking phase collides with the loop ceiling. Said plainly rather than oversold.

**Two `/sig:drive` runs happened first (2026-09-03, an external project) and both halted at the front
door — correctly.** They produced `v0.1.35` (the front end: propose the work, confirm, ask everything
blocking up front) and `v0.1.36` (`resolveStartPhase` — picking the work is not enough if nothing
says where it *starts*; the run dead-ended on `describeNextAction('EXPLORING') → recognized: false`).
**The end-to-end gate in [`BACKLOG.md`](BACKLOG.md) is still open** — neither run reached a phase.

> ### ⚠ The merge SQUASHED despite `--merge` — filed, root cause unknown
>
> All 24 commits are absent from `main`, and `ADHERENCE-LOG.md` was immediately left pinning
> `0e88e03`, a commit unreachable from `main`. That is verbatim the failure the Epic lane's `--merge`
> rule exists to prevent, and nothing detected it — the merge reported success. Repaired by
> recomputing against `d0ac0c5`. **Nothing forced the squash**: the repo allows all three methods and
> the ruleset permits all three. **The next Epic merge is the experiment** — pass `--merge`, then run
> `git rev-list --parents -n1 HEAD` before anything else.

> ### ⚠ THE DIRECTION, unchanged since 2026-08-28
>
> **Loop / goal functionality — what Signal needs to hold up on autonomous runs. Nothing else in
> it.** Brett, 2026-08-28. Do **not** open another Signal-auditing-Signal Epic ahead of this. Order
> and evidence: [`../analysis/LOOP-GOAL-DIRECTION.md`](../analysis/LOOP-GOAL-DIRECTION.md) §6.

**`M6.E5`'s narrative is evicted to [`RETROSPECTIVES.md`](RETROSPECTIVES.md)** under the doc-budget
rule — it is closed work, and this file is read on every run. The three things worth carrying
forward, in one line each:

- **A headline claim was published in five documents and then RETRACTED** — false, caused by two
  defects in the Epic's own scanner. A measurement taken with a broken instrument reads as a finding
  about the world.
- **Read the CI reviewer on EVERY PR, and again after pushing fixes.** Measured hit rate ~1 in 4;
  it catches what a green suite, mutation tests and the author do not. It has now caught something on
  three consecutive PRs (#211, #228, #230).
- **`B100` still bites any Epic with sub-lettered acceptance criteria** — `AC_ID_RE` drops the
  sub-letter, so coverage is miscounted on both sides of the diff. Derive that denominator by hand.

### ~~▶ NEXT WORK — B75's enforcement~~ · **UNBLOCKED, BUILT AND MERGED 2026-08-22 (`#193`)**

**The blocking test ran and answered YES:** a `PostToolUse` hook on `AskUserQuestion` fires. Settled
by running it, not by reading — see [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md), which now carries the
result, the control-arm method, and two corrections to its own procedure (no CLI restart is needed;
the first drafted command used `jq`, which is not installed here).

**What shipped:** `hooks/record-ask.js` appends every observed question and its running phase to
`.signal/asks.jsonl`; `hooks/check-state-write.js` reports at phase close. `confirm_in_phase` has a
consumer for the first time. 2841 → **2869 tests**, four mutations verified red.

⚠ **`B75` IS STILL OPEN, and that is a decision rather than an oversight.** Asked as a direct
either/or whether a phase closing with zero observed asks should be **refused** or **reported**, the
answer on 2026-08-22 was **reported**. So the dial is now *checked and reported*, **not enforced** —
nothing fails when a command ignores it, and `references/phase-gates.md` says so in those words.
The row's original sentence still describes reality, which is why the status was not flipped.

⚠ **It also counts nothing, by design:** `confirm_in_phase` is a countable quantity in only two of
six commands (`execute.md`'s waves, `ship.md`'s checklist); `discuss.md` is one per gray area found
as you go, and `plan.md`/`verify.md`/`review.md` say "every step" without defining a step. So the
check answers *"were you asked anything at all?"* — total omission and no finer, and a box-ticking
question satisfies it.

**What would actually close `B75`:** something that FAILS on a skipped ask. The
`adherence-run --canary` shape named in the row remains the candidate, and `B55` is the precedent
for how easily such a canary measures the wrong thing. **Not started, and not obviously worth it
until the warn has been lived with.**

*(Everything below is the standing plugin-binding guidance, unchanged.)*


**⚠ RESTART THE CLI PROCESS BEFORE RUNNING ANY WRITING `/sig:` COMMAND — but as of `v0.1.20` the
tool now tells you when it matters, instead of leaving it to you to remember.** `B52` is fixed:
`/sig:status`, `/sig:resume` and a SessionStart hook compare the copy the process actually resolved
against what `installed_plugins.json` records, and banner loudly when they disagree.

**Read this rule as narrowed, not lifted.** The check ships **inside the cache copy it inspects**, so
it cannot fire until a session binds to a version that has it — the first `0.1.20` session is exactly
the one that cannot warn itself. And the banner reports; it does not block. So the habit still
applies, and the *reason* it applies is unchanged: a stale binding served the pre-`B78`
PASS-WITH-FIXES text to **both** `/sig:review` passes of the M5.E18 build (five hits in one session,
2026-08-04), and *a stale binding that serves the wrong version of a **decision document** is worse
than one serving stale code.*

**A context clear is NOT sufficient** — measured, not reasoned: a `/clear` ran 2026-08-02 at 12:50
and the process kept its binding. **Restart the CLI process.** The banner says so in those words for
that reason. To check by hand, run any `/sig:` command and read the cache path it cites.

**Cache status 2026-08-23: CURRENT — bound copy and `installed_plugins.json` agree on `0.1.32`,
`readBindingBanner` returns `null`, no banner is due.** The update-then-restart sequence prescribed
after the `v0.1.32` cut was carried out; nothing is pending.

> *Superseded, and the correction is mine to own:* this paragraph read **"Cache status 2026-08-21 …
> EXPECT THE BANNER, and it will be correct"**, which was **accurate when written** — the update had
> not yet run. It went stale when the update ran, and it became an outright **contradiction** the
> moment the new top block above said the binding was current and no update was needed. **The
> contradiction was introduced by that edit, not discovered in the file** — I noticed it a minute
> later by reading down, and nothing would have caught it otherwise. Recorded this way because
> describing it as a pre-existing defect would be dressing up my own mistake, and because it is the
> ordinary way `M5.E17`'s class arrives: not by anyone writing something false, but by someone
> updating one end of a document and not the other.

**Prior — cache status 2026-08-19: bound copy and `installed_plugins.json` both read `0.1.30`** — verified
via `readBindingBanner`, which returns `null`, so no banner is due. Three cache copies sit on disk
(`0.1.25`, `0.1.27`, `0.1.30`); since `B103` (`v0.1.28`) `/sig:doctor --fix` will not offer to delete
one a live session is running, so the extras are disk cost, not a hazard.

⚠ **The sequence after any release is `/sig:update` **and then** restart, in that order** — a restart
before the update has nothing new to bind to, and the *next* session is the first one the fix can
protect.
