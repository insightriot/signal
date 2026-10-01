---
id: SIG-43
type: BUG
status: C
title: "`transitionPhase` records the phase you are *leaving*, so a SHIP date
  can never be written by it — SHIP is terminal,…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:74
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B43
---
| B43 | `fixed` | **P2** | **`transitionPhase` records the phase you are *leaving*, so a SHIP date can never be written by it — SHIP is terminal, and `ship.md:96` documents the opposite.** `state.js:390-391` appends **`state.phase`** (the phase being left) with today's date, then sets `phase` to the argument. `ship.md:96` claims `transitionPhase(baseDir,'SHIP')` *"appends `SHIP (YYYY-MM-DD)` to `completed_phases`"* — it appends `REVIEW (date)`. **The consequence is structural, not cosmetic** (sharpened by Brett 2026-07-26, and the reason this is P2 not P3): `SHIP` enters `completed_phases` only on a transition *away from* SHIP, and there is none — so **no correct SHIP date can ever be recorded by this function**, in any mode, Epic or linear. This repo's own STATE is the proof: `completed_phases: [… REVIEW]`, `phase: SHIP`. **A second failure mode rides on it:** the appended entry is stamped with **today's** date but names the phase being left, which may have closed days earlier — so the date is wrong for the phase it labels. Live instance: `transitionPhase(base,'SHIP')` called at `phase: PLAN` stamped `PLAN (2026-07-26)` and recorded no SHIP at all — *"even without the collapse (B44), the call would have silently failed to record the thing it was called to record."* **Not covered by B41**, which is about the middle commands never calling `transitionPhase` at all — though B41 is what let `phase` still read `PLAN` at ship time. **The codebase already knows this and says so — in the other direction from the docs:** `retrospective.js:493` comments the Epic-close detector as keying on pre-SHIP coverage, *"**NOT** a `- SHIP` entry (Signal never writes one)."* So the gate was built around the fact that SHIP is unrecordable while `ship.md:96` tells the reader the opposite. **Fix:** append `nextPhase` (or both, `"left X / entered Y"`), and carry each phase's real close date rather than the write date. Then correct `ship.md:96` — **and re-check `isEpicCloseByState`/`checkProposedStateWrite`, which are written against today's never-writes-SHIP behavior** and would need the `coversPreShip` test revisited if SHIP starts appearing in the list. **→ Status reconciled 2026-08-02** (fix lane, BUGS.md status-vs-code sweep): fixed in **M5.E9 (FR2)** and never flipped. `completePhase` (`tools/lib/state.js:655`) records a phase complete *without* transitioning away from it, which is what a terminal SHIP needs; `ship.md:98` was corrected in the same Epic and now describes `transitionPhase` as appending the phase being **left**. Asserted at `tests/linear-mode-e2e.test.js:178`. |