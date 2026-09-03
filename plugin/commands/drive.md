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
- `tools/lib/drive.js` — `proposeEpicCandidates`, `collectPreflight`, `formatPreflight`,
  `PREFLIGHT_SOURCES`, `canProceedUnattended`, `FLOORS`, `floorsFor`, `queueDecision`, `readQueue`
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

### 0b. Confirm you are running it alone

One `AskUserQuestion`, in plain words: *run {Epic} start to finish on my own?* Options: yes /
pick a different one / stop.

**This gate is NOT in `FLOORS` and must not be added to it.** That array is documented as
tier-independent gates each backed by a specific decision; this is a new confirmation belonging
to the command flow. It fires regardless of `attention` — `unattended` means the run does not
stop to ask *along the way*, not that it starts without being told to.

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

### 1. Read the dial

`readEffectiveProfile(baseDir, { currentEpic })`, then `attentionFor(profile)`:

| `attention` | What the loop does |
|---|---|
| `attended` | Stops at every gate. Identical to today's behaviour — this is what a profile with no `attention` derives when `gate_strictness: strict`. |
| `checkpointed` | Runs free **inside** a phase; stops at each phase boundary. |
| `unattended` | Runs until a floor or an unanswerable decision. |

**A profile written before this axis existed keeps its exact current behaviour**, because attention
is *derived* from `gate_strictness` when absent (`off`→`unattended`, `light`→`checkpointed`,
`strict`→`attended`) rather than defaulted to a constant. That mapping is not a guess: `light` and
`strict` were measured to differ by exactly one boolean in code, and `off` already meant auto-advance.

### 2. Report the queue before doing anything

`readQueue(baseDir)`. If anything is unanswered, print it **first**. A run that adds to a queue
nobody is draining is the failure mode this command could most easily create.

**A long queue is a signal, not a backlog.** If entries accumulate faster than they are answered,
the attention setting is wrong for this project — say so in those words.

### 3. Loop

Until a stop:

1. `describeNextAction(state.phase, profile.phases_skipped)` → the next command (fail-open, `B70`).
2. `loopStatusFor(state, state.phase)` → the loop count for a bounded phase, `null` elsewhere.
3. `canProceedUnattended(state.phase, profile, { loopStatus })`.
4. **`proceed: false`** → stop. Print `reason` (`floor` / `loop-ceiling` / `loop-unknown` /
   `attended` / `phase-boundary`), and for a floor print every `why`. For `loop-ceiling` print
   `formatLoopCeilingHalt(loopStatus)` — do not write the sentence yourself; one place turns a
   ceiling into prose so this file and the driver cannot describe the same halt two ways. Never
   paraphrase a floor's reason into something softer.
5. **`proceed: true`** → run that phase command, then re-read state and continue.

⚠ **Step 2 is not optional, and omitting it does not fail open — it fails closed on every pass.**
`canProceedUnattended` refuses with `loop-unknown` when a `LOOP_BOUNDED_PHASES` phase arrives with no
`loopStatus`, deliberately: an actor that cannot tell how many times it has looped should stop. So a
call written without the third argument halts at **every** `VERIFY` and **every** `REVIEW`,
regardless of `attention` — the check sits above the attention branches. This file documented the
two-argument call from the day the ceiling shipped (`B113`), and a test in the Signal repository
now fails if it comes back.

**Deciding vs. queueing.** When a phase asks a gray-area question mid-run, only queue it when the
work can honestly continue without the answer. If it cannot, **stop** — a queued decision that the
next step silently assumed an answer to is worse than a blocked run, because it looks like progress.
Every queued entry carries the recommendation that would have been offered; Signal already mandates
one on every gray-area ask, and hiding it is "failing to use the model's signal".

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
