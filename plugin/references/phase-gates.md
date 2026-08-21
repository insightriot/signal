# Phase Gate Reference

Every phase transition passes a gate. **Whether that gate asks a person is set by the profile's
`attention` dial — it is not unconditional, and this file used to say it was (`B73`).**

| `attention` | What the gate does at a phase boundary |
|---|---|
| `attended` | Asks. The user explicitly says "proceed". |
| `checkpointed` | Asks at phase boundaries; runs free **inside** a phase. |
| `unattended` | Advances without asking — **except at a floor or a loop ceiling** (below). |

> **Why the old line was wrong, kept because the correction is the point.** This file opened with
> *"Every phase transition requires explicit approval. No exceptions."* — while `gate_strictness:
> off` had meant exactly that exception for releases, and `/sig:drive` now advances phases under
> `attention: unattended`. **The rule and the code disagreed, in the file whose job is to state the
> rule.** That is `M5.E17`'s class (instructions contradicting instructions) sitting in the
> reference every other gate document defers to.

**Two things the dial cannot turn off**, because each was made tier-independent by a specific
decision and an autonomy layer that quietly overrode one would re-litigate that decision by omission:

- **Floors** — the SHIP pull request, the Epic-close retrospective, the drain's diff preview and its
  destructive confirms, and the orphan prompt. Enumerated in `FLOORS` (`tools/lib/drive.js`), not
  re-listed here, so there is one roster rather than two.
- **The loop ceiling** — a phase that fails and loops backwards stops for a person on the third pass
  (`B76`). Counted from `completed_phases` by `loopStatusFor` (`tools/lib/loop-ceiling.js`) and
  enforced by `canProceedUnattended`, which also refuses when it **cannot read** the count.

## Gate Structure

Each gate has three components:
1. **Exit criteria** — what must be true before leaving this phase
2. **Anti-rationalization check** — countering the specific shortcuts agents take at this transition
3. **Human approval** — the user explicitly says "proceed", **when `attention` calls for it, or
   whenever a floor or the loop ceiling applies regardless of `attention`**

## EXECUTE has no approval checkbox, and that is deliberate

Five phase commands carry a *"User approves…"* line in their Exit Criteria — `discuss.md`,
`plan.md`, `verify.md`, `review.md`, `ship.md`. **EXECUTE carries none, and nothing said whether
that was design or omission** (`B74`). It is design: EXECUTE's exits are **machine-checkable** —
all plan tasks completed, tests passing, atomic commits present — so there is nothing for a person
to adjudicate that a check cannot decide. Recorded here because *"a reader cannot tell design from
omission"* is `B39`'s shape, and an undocumented absence in a gate reference reads as a missing gate.

> **`B74` — CLOSED 2026-08-21, and the lane call recorded here was revised rather than left standing.**
> An earlier version of this note said the remaining work *"stays Epic-homed"*, on the strength of
> `B74`'s original triage (*"needs new capability"*). **`attention` (`v0.1.31`) is that capability**,
> so what was left was wiring with no design surface — a bug fix across command text, which is the
> fix lane by this repo's own two-lane rule. Revised in the same commit that did the work, because
> leaving a "this is Epic-homed" sentence in the file while doing it fix-lane would be `M5.E17`'s
> class committed **inside the file just fixed for `B73`**.
>
> Four of the five approval checkboxes are now conditional on their `gates.confirm_*` flag. **The
> fifth — `ship.md`'s "User approves PR for merge" — is deliberately still unconditional**, because
> it is a **floor** (`ship-pr`), not a tier-gated ask. That asymmetry is the correct shape and
> `ship.md` says so at the box, so nobody tidies it away later.

## Gate Summary

| Transition | Key Artifacts | Must Exist |
|---|---|---|
| → DISCUSS | (start) | `.planning/` directory, `STATE.md` |
| DISCUSS → PLAN | `PROJECT.md`, `CONTEXT.md`, `REQUIREMENTS.md` | All decisions locked or explicitly deferred |
| PLAN → EXECUTE | `{phase}-PLAN.md`, `{phase}-RESEARCH.md`, `{phase}-VALIDATION.md` | Plan passes 8-dimension validation |
| EXECUTE → VERIFY | Atomic commits, passing tests | All plan tasks completed |
| VERIFY → REVIEW | `{phase}-VERIFICATION.md` | All acceptance criteria met |
| REVIEW → SHIP | `{phase}-REVIEW.md` | All Critical/Important issues resolved |
| SHIP → (done) | PR created, checklist complete | Clean history, docs updated |

## Verify → Execute Loop

VERIFY can loop back to EXECUTE up to 3 times. After 3 failures:
- Escalate to the user
- Reassess whether the plan needs revision (loop back to PLAN)
- Do not force-pass verification

## Gate Enforcement

Gates are enforced by checking for the required artifacts in `.planning/`. An agent cannot begin a phase's work if the prior phase's artifacts are missing or incomplete.
