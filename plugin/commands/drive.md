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
- `tools/lib/drive.js` — `canProceedUnattended`, `FLOORS`, `floorsFor`, `queueDecision`, `readQueue`
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
2. `canProceedUnattended(state.phase, profile)`.
3. **`proceed: false`** → stop. Print `reason` (`floor` / `attended` / `phase-boundary`), and for a
   floor print every `why`. Never paraphrase a floor's reason into something softer.
4. **`proceed: true`** → run that phase command, then re-read state and continue.

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
