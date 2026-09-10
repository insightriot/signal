---
description: Run the phase flow without sitting at every gate. Reads the attention setting, advances while it may, and stops the moment a decision genuinely needs you — with the reason named. Queues what it can defer. Never merges.
---

# `/sig:drive` — run the loop

You are running `/sig:drive`. It advances the Signal flow **on your behalf**, and stops when it must.

This is the command Signal's loop-engineering audit argued for. *(That audit lives in the Signal
repository and is **not** shipped with the plugin, so its findings are stated here rather than
cited as a path you can open.)* It measured the problem before proposing anything: a FULL-tier Epic
costs **48–86 synchronous human touchpoints**, and almost all of that ceremony lived only in command
prose, enforced by nothing. Signal already spanned a ~10× attention range — but **the attention dial
was welded to the rigor dial**, so the only way to buy less of your time was to buy less rigor.

`attention` splits them. `/sig:drive` is what spends it.

Authoritative references:
- `tools/lib/plugin-binding.js` — `readBindingBanner` (step 0; a halt here, not a report)
- `tools/lib/drive.js` — `proposeEpicCandidates`, `resolveStartPhase`, `CANONICAL_PHASES`,
  `collectPreflight`, `formatPreflight`, `PREFLIGHT_SOURCES`, `routeDecision`,
  `ROUTE_REVERSIBILITY`, `ROUTE_ALTITUDE`, `formatAnsweredForward`, `canProceedUnattended`,
  `FLOORS`, `floorsFor`, `queueDecision`, `readQueue`
- `tools/lib/loop-ceiling.js` — `loopStatusFor`, `formatLoopCeilingHalt`, `LOOP_BOUNDED_PHASES`
- `tools/lib/profile.js` — `attentionFor`, `ATTENTION_LEVELS`, `readEffectiveProfile`
- `tools/lib/status.js` — `describeNextAction`, `formatNextActionCopy`
- `tools/lib/state.js` — `readState`

## What it will not do

**It never merges.** Merge is delivery, and delivery stays a person's (`D-M5E17-5`).

**It never overrides a floor.** `FLOORS` in `drive.js` lists gates that stop the loop no matter what
`attention` says — the SHIP pull request, the Epic-close retrospective ("no bypass", `D-E9-3`), the
PLAN drain's diff preview and its destructive confirms, the resume orphan prompt. Each was made
tier-independent by a specific decision. **An autonomy layer that silently overrode them would be
re-litigating those decisions by omission** — which is precisely how `ship.md` came to carry a
self-exemption that survived thirteen releases and one pull request.

**It fails closed.** An unreadable profile, an unknown phase, a missing `attention` — all stop the
loop. A missing setting must never be the reason something ran without asking. This is deliberately
the opposite of the `B39` fail-*open* posture used for reporting: a detector that cannot look should
say so and continue; **an actor that cannot tell should stop.**

## Workflow

### 0. Is this session running the installed Signal? — `B115`

**First, before anything.** Call `readBindingBanner({ homeDir: os.homedir() })` from
`tools/lib/plugin-binding.js`. If it returns a banner, **print it and STOP.**

**This is a halt for `/sig:drive` specifically, where `/sig:status` and `/sig:resume` only report
it.** Those are briefings: a reader sees the warning and decides. This command *acts*, repeatedly,
on instructions it read once — so a stale binding means an entire autonomous run executes a retired
release's rules, and the longer the run the more it does before anyone notices. That is the
command's own stated posture: **an actor that cannot tell should stop.**

⚠ **Found by running it (2026-09-04).** The first live `/sig:drive` invocation loaded `v0.1.34`'s
copy of this file while `v0.1.36` was installed — so the front end (`0a`–`0c`, shipped in `v0.1.35`
and `v0.1.36`) **was not in the file the run executed**, and the run had no way to know. `B52`'s
banner was built for exactly this and fires correctly from the bound copy; it never ran, because
this command was the one that never called it.

**Steps 0a–0c are the front end, and they are not optional.** Before them this command
began at whatever phase `STATE.md` happened to name, chose nothing, and asked for nothing —
which is a stepper with an autopilot flag, not a driver. Found by running it end-to-end for
the first time on 2026-09-03, against a real project.

### 0a. Choose the work — propose, never auto-pick

If the user named an Epic in the arguments, use it and skip to **0b**.

Otherwise call `proposeEpicCandidates(baseDir)`. Present the candidates in the order returned
— an already-open Epic comes first, because resuming beats starting something new — and ask
which one, via `AskUserQuestion`, offering the top candidates plus an "something else" path.

⚠ **It proposes; you never pick silently.** `LOOP-GOAL-DIRECTION.md` measured the best honest
selection rule over real backlog rows at **77% precision / ~37% recall** and recommended not
building automatic selection. That verdict is about a *silent* pick becoming work nobody asked
for. A ranked proposal behind an explicit confirmation is a different mechanism: the person
closes the recall gap by naming what the list missed, and the precision gap by declining.

⚠ **`cannotCheck` entries render as their own line.** No `BACKLOG.md` means "could not look",
never "no work" — and an empty candidate list with an unread source must never be presented
as "nothing to do".

**Zero candidates with an EMPTY `cannotCheck` is the readable-and-genuinely-empty case, and it
is a question, not a report.** The backlog was read and holds no live rows. **Ask what to work
on** — the person always has an answer the file does not, and a groomed queue is a convenience
rather than the source of truth about what matters. Observed on the second real run
(2026-09-03): the command correctly distinguished empty-from-unreadable and then stopped with
advice instead of asking, which leaves the user to restate what they already came to do.

### 0a-ii. Say where the chosen work STARTS

Call `resolveStartPhase(state, candidate)`.

**Choosing the work and not saying where it starts leaves the dead end the front end exists to
remove, one step later** — steps 1–3 read `state.phase`, so a run that has just picked something
still keys on whatever the file holds. On the second real run that value was `EXPLORING`;
`describeNextAction` returned `recognized: false`, and there was no command to run **at any
attention level**.

- Resuming an open Epic at a canonical phase → continue there, no write.
- Newly chosen work → **DISCUSS**, whatever the file says. The recorded phase belongs to
  whatever ran last, and inheriting it is how fresh work ends up resuming someone else's position.
- `blocked: true` → **stop.** An open Epic whose recorded phase is unreadable cannot be placed:
  restarting it at DISCUSS may discard completed phases. Print `why` and let a person set it.

It proposes; it does not write. Confirm the phase, then record it through the ordinary
phase-transition write — a stale phase gets corrected deliberately, never silently
overwritten by a command the user ran to make progress.

### 0b. Ask HOW to run it — in the SAME interaction that picks the work

**One `AskUserQuestion` call carrying BOTH questions.** It accepts up to four, so choosing the
work and choosing the cadence are one screen, not two round-trips.

- **Q1 — what to work on:** the ranked candidates from `0a`.
- **Q2 — how to run it:** the three modes below.

| Option shown | `attention` | What the loop does |
|---|---|---|
| **Step me through it** | `attended` | Confirms at every phase boundary. |
| **Drive it — ask when it matters** | `checkpointed` | Runs DISCUSS→REVIEW. Stops for a live floor and **asks** on a gray-area decision. |
| **Drive it — queue everything** | `unattended` | Same, but a gray-area decision is **parked** in `DECISION-QUEUE.md` and the run continues. |

**Pre-select the profile's value as the default** (FR5), so `attention` still means something and
an existing profile behaves exactly as before unless the user chooses otherwise. **The profile is
a default, not a hidden gate.**

> #### ⚠ Why this is a question and not a config read
>
> `D-BR0908-1`: this project had no `attention`, silently derived `attended` from
> `gate_strictness: strict`, and **four consecutive Epics wrote a throwaway per-Epic `PROFILE.md`
> at `light` to escape it** rather than setting the dial — because `attention` was missing from
> `references/profile-schema.md`, the document every phase command points at.
>
> **Nobody disagreed with the setting. Nobody could find it.** A dial nobody can find is worse
> than a question everybody is asked. Asking once, up front, is also what turns *"stops
> constantly"* into *"asked me once, then ran"* — the behaviour people mean by driving.

**This gate is NOT in `FLOORS` and must not be added to it.** That array is tier-independent gates
each backed by a specific decision; this is a confirmation belonging to the command flow. It fires
regardless of the mode — a mode says the run does not stop to ask *along the way*, never that it
starts without being told to.

**Report the chosen mode in the run's output and record it** (FR6), so a run's cadence is legible
afterwards rather than inferred from a file.

### 0c. Ask everything blocking, UP FRONT

Call `collectPreflight(baseDir, { epic })` and render it with `formatPreflight`. It reads the
sources named in `PREFLIGHT_SOURCES`: unanswered parked decisions, `STATE.md` blockers, open
questions naming this Epic, and unfilled `[FILL IN]` / `[INFERRED]` markers in the Epic's
requirements.

**Ask every `blocking` item as ONE batch, before running anything.** This is the piece that
makes the dial worth having: a FULL-tier Epic was measured at 48–86 synchronous touchpoints,
and `attention` only decides whether the loop *pauses* at them. Asking up front, once, is what
turns "stops constantly" into "asked me once, then ran" — which is the behaviour people mean
by driving.

⚠ **A source that could not be read is a STOP, not a clean pass.** `cannotCheck` is rendered
separately and never folded into an empty `blocking` list. This module's posture is that an
actor which cannot tell should stop; the alternative is a run that starts blind while reporting
"nothing needed", at the moment that costs the most.

### 1. Read the dial — and re-read it every pass (`B93`)

`readEffectiveProfile(baseDir, { currentEpic })`, then `attentionFor(profile)`:

**Step `0b` has already chosen the mode.** This read supplies the *default* it was offered with,
and is re-read every pass so an Epic roll cannot leave the loop on the previous unit's dial.

| `attention` | What the loop does |
|---|---|
| `attended` | Stops at every phase boundary. *"Step me through it."* |
| `checkpointed` | **Advances every phase.** Stops at a live floor, and **asks** on a gray-area decision. |
| `unattended` | Advances every phase. Stops at a live floor; a gray-area decision is **queued**, not asked. |

⚠ **`checkpointed` used to say *"runs free inside a phase; stops at each phase boundary"*, and that
was a behaviour with no code path.** `canProceedUnattended` is only ever asked a phase-boundary
question — § 3 calls it once per pass on `state.phase` — so it answered *stop* to every question it
ever received. This repository's own `PROFILE.md` is set to it, which was the entirety of
*"`/sig:drive` doesn't work"*: the loop could not take a single step at its configured setting.
Fixed in `M6.E10`. A test in the Signal repository now asserts that at least one mode reaches
REVIEW without stopping — the assertion nothing made before, which is why a loop that could not
advance shipped and stayed shipped.

**What separates `checkpointed` from `unattended` is what happens to a DECISION, not to a phase.**
Both advance phases; both stop at a live floor; both stop at SHIP.

**A profile written before this axis existed keeps its exact current behaviour**, because attention
is *derived* from `gate_strictness` when absent (`off`→`unattended`, `light`→`checkpointed`,
`strict`→`attended`) rather than defaulted to a constant. That mapping is not a guess: `light` and
`strict` were measured to differ by exactly one boolean in code, and `off` already meant auto-advance.

### 2. Report the queue before doing anything

`readQueue(baseDir)`. If anything is unanswered, print it **first**. A run that adds to a queue
nobody is draining is the failure mode this command could most easily create.

**Then `formatAnsweredForward(queue)`** — what a person answered since the last run, printed above
the unanswered count. ⚠ **Answers are surfaced, never auto-applied** (`D-M6E6-5`): applying one needs
a durable link to the work and can land a stale answer on something that has moved on. Report them
and let the user say whether to carry them into this run.

**A long queue is a signal, not a backlog.** If entries accumulate faster than they are answered,
the attention setting is wrong for this project — say so in those words.

### 3. Loop

⚠ **RE-READ THE PROFILE AT THE TOP OF EVERY PASS. `current_epic` changes under you** (`B93`).

This file never calls `setCurrentEpic` — deliberately, because opening an Epic is `/sig:discuss
--epic`'s job. The consequence is that a single dial read at step 1 is read against **whatever Epic
`STATE.md` happened to name when the run started**, which for newly-chosen work is the *previous*
Epic. If that Epic left a `{PrevEpic}-PROFILE.md` behind, its tier and its `attention` govern the
whole of this run, and the Epic actually being driven never gets a say.

**Not hypothetical:** `M6.E4`, `M6.E5`, `M6.E6` and `M6.E7` each wrote a per-Epic `PROFILE.md`, so
four consecutive Epics are on disk ready to shadow the next run's dial read. A run that reads
`checkpointed` from a finished Epic while the live one derives `attended` advances phases the user
expected to be asked about — the failure direction that matters, since the other way round only costs
a question.

Two further ways `currentEpic` moves mid-run, both ordinary rather than exotic: DISCUSS rolls the
Epic on its first pass, and `/sig:calibrate` may write a per-Epic profile immediately after that roll.

Until a stop:

0. **`readEffectiveProfile(baseDir, { currentEpic: state.current_epic })` and `attentionFor` again**,
   from the state just re-read. Cheap, and it is the only thing that keeps the dial attached to the
   work. If the resolved attention **changed** since the previous pass, say so out loud with both
   values and the Epic each came from — a loop that silently re-tiers itself is worse than one that
   halts.
1. `describeNextAction(state.phase, profile.phases_skipped)` → the next command (fail-open, `B70`).
2. `loopStatusFor(state, state.phase)` → the loop count for a bounded phase, `null` elsewhere.
3. **`await resolveFloors(state.phase, baseDir)`** → which floors at this phase are *live right now*.
4. `canProceedUnattended(state.phase, profile, { hasFloor: live.length > 0, loopStatus })`.
4. **`proceed: false`** → stop. Print `reason` (`floor` / `loop-ceiling` / `loop-unknown` /
   `attended` / `phase-boundary`), and for a floor print every `why`. For `loop-ceiling` print
   `formatLoopCeilingHalt(loopStatus)` — do not write the sentence yourself; one place turns a
   ceiling into prose so this file and the driver cannot describe the same halt two ways. Never
   paraphrase a floor's reason into something softer.
5. **`proceed: true`** → run that phase command, then re-read state and continue.

⚠ **Step 3 is not optional either, and it is the fix for the second half of *"it doesn't work"*.**
`canProceedUnattended` falls back to `floorsFor(phase).length > 0` when `hasFloor` is absent — a
**phase-NAME match**, not a condition. PLAN carries two floors that protect the idea-inbox drain
(preview the diff, confirm deletions), so with an empty inbox there was nothing to preview and
nothing to delete **and PLAN halted anyway**. Every run at every mode was DISCUSS → dead stop at
PLAN. `hasFloor` existed the whole time and no caller passed it.

⚠ **`resolveFloors` fails CLOSED**: a condition that throws, or a floor nobody classified, comes
back **live**, and `cannotCheck` names it — so a halt says *"could not tell"* rather than implying
a condition it never evaluated. **SHIP's two floors carry `always: true` and are never evaluated**
(`D-M5E17-5`, `D-E9-3`); conditional floors must not become a route to re-litigating those by
omission, which is exactly how `ship.md` came to carry a self-exemption that survived thirteen
releases.

⚠ **Step 2 is not optional, and omitting it does not fail open — it fails closed on every pass.**
`canProceedUnattended` refuses with `loop-unknown` when a `LOOP_BOUNDED_PHASES` phase arrives with no
`loopStatus`, deliberately: an actor that cannot tell how many times it has looped should stop. So a
call written without the third argument halts at **every** `VERIFY` and **every** `REVIEW`,
regardless of `attention` — the check sits above the attention branches. This file documented the
two-argument call from the day the ceiling shipped (`B113`), and a test in the Signal repository
now fails if it comes back.

### 3b. A gray-area question mid-run — route it, do not halt on it

**This is the step that makes the dial worth having past the first surprise.** `collectPreflight`
moved the *foreseeable* questions to the front; this is what happens to the ones that could not be
foreseen. Before `M6.E6` the answer was: halt.

Tag the decision on both axes, then call `routeDecision({ reversibility, altitude })`:

| Axis | Values | Which way it routes |
|---|---|---|
| `altitude` | `plumbing` / `product` | plumbing is yours to decide; **product / scope / positioning is the user's** |
| `reversibility` | calibration's four terms, per **decision** | `trivial` / `moderate` may be adopted; `painful` / `irreversible` queues |

**OR-composed:** a decision is adopted only when it is **both** plumbing **and** reversible.
Reversibility alone misses the case that matters most — a product call that is trivial to revert,
like a default tier, is still a person's to make.

- **`route: 'adopt'`** → take the recommendation and continue.
- **`route: 'queue'`** → `queueDecision(baseDir, { …, reversibility, altitude }, { attention })`
  and continue. It routes again internally and records the router's own sentence, so the entry says
  which axis parked it. Do not write that sentence yourself.

**Pass `attention`.** `queueDecision` **refuses** at `attended` and returns
`{queued: false, refused: true, reason}` rather than throwing — a live run must not die because a
caller was honest about its attention level. It also refuses to file a decision the router would
adopt, which would otherwise leave an entry reading *"Adopted: …"* sitting unanswered forever.

⚠ **An adopted decision is recorded nowhere, and that is deliberate.** By construction it is
plumbing-altitude *and* reversible — the class the "gate at product altitude" norm says is yours to
decide. Logging each one would rebuild the interruption stream this command exists to remove.

⚠ **Tag honestly, and when unsure do not guess — leave it untagged.** An untagged decision queues
(`D-M6E6-4`); that is the safe direction, and the entry names which axis you left blank. Expect a
chatty queue while tagging is new. That is the fail-closed side working, not a defect.

⚠ **Queue only when the work can honestly continue without the answer. If it cannot, STOP** — a
queued decision the next step silently assumed an answer to is worse than a blocked run, because it
looks like progress. Every entry carries the recommendation that would have been offered; hiding it
is "failing to use the model's signal".

⚠ **Never queue at `attention: attended`.** A person sitting at the gate should be *asked*. Queueing
is what `unattended` and `checkpointed` buy; filing a question at someone waiting to answer it is a
worse experience than the halt this step replaces.

### 4. Report

State the phases advanced, where it stopped and why, and what is queued. **If the loop advanced
nothing, say that plainly** — "checked and could not advance" must never render like "ran and
finished".

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "The user set `unattended`, so merging is implied." | No. `unattended` is about *attention*, not *authority*. Merge is delivery. The SHIP floor is not tunable. |
| "This floor is obviously fine to skip in this case." | No. Every floor exists because someone decided it was tier-independent. Skipping one is overturning that decision without saying so. |
| "The profile is malformed, but the intent is obviously `unattended`." | No — fail closed. Inferring autonomy from a broken config is how a run nobody authorised becomes a run nobody noticed. |
| "The queue is long, but the run succeeded, so report success." | The queue length **is** the result. A run that parks 20 decisions did not succeed at anything except deferring. |
| "STATE.md names a phase, so just start there — that IS the work." | No. A phase value is where the last run stopped, not a decision about what to do next. Starting from it without choosing and confirming is what made this command a stepper. Run 0a–0c. |
| "No backlog file, so there's nothing to work on — report done." | "Could not look" is not "no work". It renders as `cannotCheck`, on its own line, and the run does not present an empty candidate list as an empty queue. |
| "Preflight found nothing blocking, so go" — when a source failed to read. | Check `cannotCheck` first. A clean `blocking` list next to an unread source means the pass did not happen, and starting there is starting blind. |
| "The binding banner is advisory everywhere else, so report it and carry on." | Everywhere else the reader is present and deciding. Here the run continues on its own, executing a retired release's instructions for as long as it lasts. Step 0 halts. |
| "This one is obviously fine to decide — I know what they would say." | That is what `altitude` is for, and knowing the answer is not the same as it being yours. A product call queues even when reversible and even when the recommendation is obvious. |
| "Tagging every decision is tedious; leave them untagged and it will route sensibly." | It will: untagged **queues**. That is correct and it is not free — an untagged entry tells the reader which axis you skipped. Tag it or accept the queue. |
| "The queue is the safe default, so queue everything." | A queue nobody drains is the failure this command most easily creates, and depth is the measurement the file exists to produce. Adopt what is genuinely plumbing and genuinely reversible. |
