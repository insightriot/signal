# Goal Direction in Signal — what the loop works on, and how it knows it is done

**Date:** 2026-09-01
**Status:** Analysis. Scoped strictly to loop / goal functionality per Brett's call of 2026-08-28.
**Method:** Read against the live payload under `plugin/` (not the pre-`M6.E1` paths the older loop
analysis cites), plus one measurement run over `.planning/BACKLOG.md`'s actual rows. Every count
below is derived from the artifact, not recalled.

---

## 0. Scope — and what this deliberately does not re-cover

[`LOOP-ENGINEERING-ANALYSIS.md`](LOOP-ENGINEERING-ANALYSIS.md) is about **attention**: splitting the
rigor knob so FULL rigor with low supervision becomes expressible. That question is answered there
and substantially shipped. This document is about the other half, which that analysis *names* in two
late amendments and never designs:

- §3.4 (added 2026-08-22) scores Signal against a six-component parts list and marks **Trigger** as
  "not handed off" and **Memory** as built-to-write but never read forward.
- §5.5 places `/sig:drive` at the first two handoffs and leaves the trigger un-handed-off.

Those are pointers. This is the design question behind them: **once nobody is typing the command,
what decides what to work on, and what decides that the run is over?**

**Not re-covered here** (read the parent document): the attention axis itself (§5.1), the gate
conversion table (§5.2), the trust ramp (§5.5), the hard gate at PR-merge (§6.1), the failure modes
(§6.2). **Excluded by the scope of the call**: Phase C / parallel lanes, the permissions follow-on,
and any re-litigation of merge-is-delivery. Nothing about them is in here.

---

## 1. Where the loop actually stands — three states, not two

The obvious way to open this is a shipped/not-shipped table. That would be wrong here, because this
repository's own named defect is a mechanism that is **built, documented end to end, and reached by
nothing** (`B75`, shipped open on purpose; `analysis/UNREACHED-MECHANISM-ANALYSIS.md`). So the
column is three-valued.

| Loop part | State | Evidence |
|---|---|---|
| `attention` axis (attended / checkpointed / unattended) | **Built, unenforced** | `B75` ships open by choice: nothing fails when a phase command ignores `gates.confirm_in_phase`. |
| Floors (never-unattended gates) | **Built and enforced** | `FLOORS`, 5 entries, checked above the attention branches in `canProceedUnattended` (`plugin/tools/lib/drive.js:78`). |
| Loop ceiling (bounded VERIFY/REVIEW retries) | **Built, mis-wired** | See §1.1 — this is a live defect, not a gap. |
| Decision queue | **Built, reached by nothing** | `queueDecision` / `readQueue` (`plugin/tools/lib/drive.js:161,170`) are called by `tests/drive.test.js` and named in `drive.md`'s reference list. **Zero phase commands mention the queue.** |
| Cost / budget ceiling | **Not built** | `grep` for a cost or budget ceiling across `plugin/tools/lib/` and `drive.md` returns nothing. The backlog already calls this "currently unsized"; it is the missing third brake. |
| Trigger, Epic-scope work-finding, memory read-forward | **Not built** | §§2–4 below. |

That is one enforced part out of six. The pattern is not that the loop is unbuilt — it is that the
loop's parts are built and unwired, three times over, in the same area, by three different releases.

### 1.1 A defect found while reading this: the loop ceiling is never actually supplied

`canProceedUnattended(phase, profile, { hasFloor, loopStatus })` **fails closed on not knowing**. For
`VERIFY` and `REVIEW` (`LOOP_BOUNDED_PHASES`, `plugin/tools/lib/loop-ceiling.js:60`), a caller that
supplies no `loopStatus` gets `{ proceed: false, reason: 'loop-unknown' }` — deliberately, and the
comment says why: *"an actor that cannot tell should stop."*

`commands/drive.md` §3 documents the call as:

> `canProceedUnattended(state.phase, profile)`

Two arguments. `drive.md` never mentions `loopStatus`, `loopStatusFor`, or the ceiling anywhere in
the file, and its authoritative-references list (`plugin/commands/drive.md:19`) names
`canProceedUnattended, FLOORS, floorsFor, queueDecision, readQueue` — **not** `loopStatusFor`.

**Reproduced, not inferred.** Running the documented call against the live module:

```
VERIFY   {"proceed":false,"reason":"loop-unknown"}
REVIEW   {"proceed":false,"reason":"loop-unknown"}
```

Both refuse *above* the attention branches, so no `attention` setting reaches a state that changes
this. **Followed literally, `/sig:drive` halts at every VERIFY and every REVIEW with `loop-unknown`.** The
ceiling that `v0.1.32` shipped as *"the entry price for autonomy work"* is invoked by the one command
that drives the loop in a form that can only ever refuse. The code is right; the caller is wrong; no
test covers the call site because the call site is prose. This is `M5.E17`'s class — instructions
that contradict the code they name — inside the mechanism built to bound the loop.

Filed as **`B113`**. It is small and it is a prerequisite: goal-direction work that builds on
`/sig:drive` inherits a driver that cannot pass its own ceiling check.

---

## 2. Trigger — what starts a cycle

**Today: a person types `/sig:drive`.** That is the entire trigger.

Two constraints are already on record and both bind hard:

1. **No capability detection at the deterministic layer.** A plugin cannot declare a tool dependency,
   query the session's tool roster, or state a minimum version
   ([`PHASE-C-BUILD-VS-ADOPT.md`](PHASE-C-BUILD-VS-ADOPT.md)). Detection exists at the *prompt* layer
   only — which `M5.E8` measured as 77.6% not trace-measurable, and which the regenerated ceiling now
   puts at **78.2%** (423 of 541 directive lines). So a trigger cannot reliably ask
   "can I run here?"
2. **The runtime's fan-out requires explicit user opt-in**, so a `/sig:` command cannot silently
   invoke it.

**The honest reading is that the trigger is the wrong thing to automate first, and possibly at all.**
An automated trigger is the only component here whose failure mode is *unsupervised work starting
without anyone deciding it should*. Every other component fails toward stopping. Signal's whole
posture — fail-closed actors, `B39`'s could-not-check discipline, PR-merge as a permanent human gate
— argues that the cheap and correct trigger is an external scheduler the operator configures
(a cron, a CI job, the harness's own scheduling), calling `/sig:drive` on a schedule the operator
chose. Signal supplies the loop; the operator supplies the clock.

**Recommendation: do not build a trigger.** Document the external-scheduler shape instead, and spend
the budget on §3 and §4, which are the parts that make an already-triggered run useful.

---

## 3. Work-finding at Epic scope — measured, and the answer is no

`describeNextAction` selects the next *phase within* an Epic (`B70`). Nothing selects the Epic.
`drive.js` contains no `current_epic` reference. `BACKLOG.md` is the queue by decision
(`D-M5E18-1`: *"the queue is `.planning/BACKLOG.md`, not this file"*).

So the question is concrete and measurable: **can a machine read `BACKLOG.md` and pick the next unit
of work at usable precision?** This repository has measured exactly this shape before and been
humbled — `AC3.2`'s three matching rules over 28 rows returned 13 flags/1 real, 3/1 and 2/1;
`bug-status-vs-changelog` runs at a measured 1-in-2. So it was measured rather than argued.

### 3.1 The run

Rule, built to be as generous as honesty allows:

- **R1** — a `###`/`####` heading that is not struck through.
- **R2** — R1 plus a lane/size trailer (`· **roadmap** · medium`, `· **hygiene** · small`, …).
- **R3** — R2 minus any heading carrying a closure word (DONE / SHIPPED / ABANDONED / ABSORBED /
  CLOSED / CUT / RESOLVED / FOLDED INTO).

| | Count |
|---|---|
| `###`/`####` rows in `BACKLOG.md` | **72** (55 + 17) |
| R1 — not struck through | **41** |
| R2 — R1 with a size/lane trailer | **14** |
| R3 — R2 with no closure word | **13** |
| R3 rows that are genuinely live work | **10** |
| Live rows the rule never sees | **≥ 17** |

**Precision 10/13 (77%). Recall ≈ 10/27 (37%).**

### 3.2 The three false positives, and why they are not fixable by a better regex

- **`B52`** (`BACKLOG.md:50`) — shipped in `v0.1.20`.
- **`B88`** (`:205`) — shipped in `v0.1.24`.
- **Command namespace** (`:239`) — decided 2026-08-09 (`D-BR0809-3`): bare verbs stay.

Two of the three share one shape, and it is the interesting one. The closure is recorded in a
**struck sibling heading** — `### 1. ~~`B52`…~~ · **DONE, v0.1.20**` at `:37` — while the original
entry is **preserved verbatim below, unstruck, for provenance**. That is a deliberate and good
documentation habit. It also means the closed row and the live row are *byte-identical in shape*, and
the fact that distinguishes them lives in a different heading. **No row-local rule can tell them
apart**, because the information is not in the row. This is `B39`'s can't-tell-checked-from-unchecked
shape, one level up.

The third is worse for a machine: the namespace row is *decided but not done* — the decision defers
execution to "the next breaking window." Nothing in the row's text distinguishes decided-and-waiting
from undecided.

### 3.3 The recall failure is the larger one

R2 drops 27 unstruck rows. At least **17** are clean live work items with no size trailer —
`M5.E12`, `M5.E14` (obligation tracker), `/sig:goal` wrapper, passive `OBSERVATIONS.md` capture, the
slash-command test harness, `/sig:report` + `/sig:orient`, `/sig:audit`, and the whole of Sprints 5–6.
The trailer convention was adopted partway through the file's life and never backfilled. A rule keyed
on it sees the recent half of the backlog and is blind to the rest — and it is blind *silently*,
which is the property that makes it dangerous rather than merely weak.

### 3.4 What generalizes

**This measures one project.** Signal's `.planning/` is repeatedly the minority shape — `B82` lived
only where unit names are not Epic IDs (8 of 12 corpus projects), and `M5.E16`'s Epic-mode checks
reach 2 of 13. A `BACKLOG.md` with this heading discipline at all is Signal-specific; most corpus
projects have no such file. **So the finding is: not machine-selectable here, and here is the best
case.** Elsewhere it is likely worse, and nothing in this run says otherwise.

### 3.5 Recommendation

**Do not build automatic Epic selection.** Two options are honest; a third is not.

- **Honest, cheap:** the operator names the unit — `/sig:drive --epic M6.E6`. The loop is autonomous
  *within* a chosen goal. This is the trust-ramp-consistent move and it needs almost no new code.
- **Honest, more work:** make the backlog machine-readable *at the point of writing* — an explicit
  status marker per row (the `<!-- standing -->` shape already under design for the standing-entries
  row), so closure is row-local by construction rather than inferred. Then selection becomes a lookup
  rather than a guess. This is a documentation-format change with a migration, not a detector.
- **Not honest:** ship the 77%/37% rule and let the loop pick. Three runs in four pick something real;
  the fourth silently reopens shipped work, and the blind spot covers the older half of the file.

---

## 4. Memory read-forward — the one gap that is purely additive

Signal records dead ends better than any project I can point at in its own corpus: `BACKLOG.md`
preserves dated "checked and declined" and "RE-PARKED" reasoning with review dates, `M5.E10` shipped
required *"what this could not establish"* sections, `references/retrospective-template.md` prompts
for friction and dead ends explicitly.

**Nothing reads any of it at cycle start.** `drive.md`'s opening reads are the profile, the queue, and
`describeNextAction`; its only retrospective reference is the Epic-close floor. Attended, the operator
supplies this from memory. Unattended, cycle four is free to repeat cycle two — and this repository
has already run that experiment by hand: `M6.E5` re-derived a finding `B100` had recorded two weeks
earlier, and the duplicate was caught by a reviewer rather than by the filer.

This is the one component where the design question is small and the payoff is immediate, because the
**data already exists and is already well-formed**. The question is only what a cycle-start read
consumes and whether it fits the budget:

- **Cheapest useful shape:** at cycle start, read the *declined-and-parked* rows relevant to the
  chosen unit plus the last N retrospectives' dead-end sections, and render them as a "what has
  already been tried and rejected here" block. Read-only, fail-open, no new artifact.
- **Budget is the real constraint,** not availability: `BACKLOG.md` is 139 KB and `BUGS.md` 320 KB.
  This must be a targeted extraction, not a file read. That is a genuine design question and it is
  the one worth taking to DISCUSS.

**Recommendation: build this one.** It is additive, it has no enforcement surface to get wrong, and
it is the only part of the goal half whose input is already there and already trustworthy.

---

## 5. Run-level done-ness — the missing brake

Signal's stop conditions are **per-phase**: `FLOORS` (5 gates), `canProceedUnattended`, and the
`VERIFY`/`REVIEW` loop ceiling. All three answer *"may I take this step?"* None answers *"is this run
finished, and has it cost too much?"*

Three brakes are named in the parent analysis; Signal has two. **The cost ceiling is not built** —
verified by grep, and the backlog already concedes it is "currently unsized." Its absence matters
more for goal-direction than for attention: an attended run is bounded by the operator's patience,
and an unattended run triggered on a schedule is bounded by nothing at all.

Also worth stating plainly: **goal-level done-ness is not phase-level PASS.** Every existing gate
answers whether a phase's work is acceptable. Nothing answers whether the *goal* was achieved —
which is the same distinction `M6.E4` shipped for DISCUSS when it separated an *outcome* oracle from
the *completion* oracle acceptance criteria already are. That gate exists at DISCUSS for a human. The
loop has no equivalent, and a loop that cannot tell "done" from "the phases all passed" will run the
flow to completion on the wrong goal and report success.

**Recommendation: size the cost ceiling before any scheduled trigger exists**, and treat it as a
floor-class brake — checked above the attention branches, like the loop ceiling, for the same reason.

---

## 6. What this recommends, in order

1. **Fix `B113`** (drive.md never supplies `loopStatus`). Prerequisite; small; fix lane.
2. **Wire the decision queue to at least one phase command**, or delete it. Built-and-unreached is
   this repository's named defect and there are now three instances in this one area.
3. **Build memory read-forward** (§4). Additive, data already exists, budget is the design question.
4. **Size the cost ceiling** (§5).
5. **Do not build**: an automatic trigger (§2), or automatic Epic selection (§3). Name the unit
   explicitly and let the loop be autonomous inside it.

**The shape of the answer:** the goal half does not need much building. It needs the parts already
built to be *reached*, one read added, one brake sized — and two things deliberately left to the
operator, because both of them fail in the direction of unsupervised work starting or continuing
without a decision.

---

## 7. What this analysis could not establish

- **The measurement evaluates one project.** §3.4 says so and does not extrapolate. Whether any other
  corpus project's backlog is machine-selectable is unmeasured.
- **The 10-of-13 ground truth is my own hand classification**, cross-referenced against `CHANGELOG`
  entries and `D-BR0809-3`. Another reader could defensibly score the namespace row differently
  (decided-but-unexecuted is a real category). At worst the precision is 11/13; it is not 13/13,
  because `B52` and `B88` are shipped.
- **`B113`'s code half is reproduced; its end-to-end half is not.** The documented two-argument call
  was run against the real module: `VERIFY` and `REVIEW` both return
  `{proceed:false, reason:'loop-unknown'}`. What was *not* done is driving `/sig:drive` itself through
  a real Epic, so the claim "the command halts" is one inference step from what was measured — the
  measured fact is that the call as documented cannot return `proceed:true` at those two phases.
- **Cost is unsized here too.** §5 says the ceiling should exist; this document does not propose a
  number, and picking one needs usage data Signal does not have.
