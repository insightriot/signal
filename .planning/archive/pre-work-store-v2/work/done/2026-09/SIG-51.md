---
id: SIG-51
type: BUG
status: C
title: "`discuss.md` still instructs the DISCUSS close to set `phase: PLAN`,
  which makes `/sig:plan`'s at-entry transition…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:88
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B51
---
| B51 | `fixed` | **P2** | **`discuss.md` still instructs the DISCUSS close to set `phase: PLAN`, which makes `/sig:plan`'s at-entry transition record PLAN as complete before PLAN has run.** `commands/discuss.md:158-161` ends with *"Update `STATE.md`: `## Current Phase` / `PLAN`"* — the pre-M5.E9 convention, where the **outgoing** command advanced the phase. M5.E9's `B41` fix moved that responsibility to the **incoming** command: `commands/plan.md:44` now says *"Before any Workflow step, call `await transitionPhase(baseDir, 'PLAN')` … It appends the phase being **left** to `completed_phases`."* **Both instructions survive, and obeying both writes a false entry.** If DISCUSS sets `phase: PLAN`, then at `/sig:plan` entry `leaving` resolves to **PLAN**, so `recordPhase` appends `PLAN (date)` — recording PLAN complete **before it did any work**. `recordPhase` is **deliberately append-only with no dedupe** (`state.js:425-427`, D-M5E9-5 / `B44` — a genuine re-transition did happen twice), so the false entry is **permanent** and later sits beside the real `PLAN (date)` appended when EXECUTE transitions. **Same family as `B48`:** an instruction whose literal execution corrupts the ledger M5.E9 built to make honest, while ignoring it is the only correct move. **Found by dogfooding — M5.E13's own DISCUSS, 2026-07-28.** The instruction was not obeyed; `phase` was left at `DISCUSS` so `/sig:plan` records the transition itself, which is the post-`B41` design. **Scope check: `discuss.md` is the sibling case of the four commands `B48` covers** — M5.E9 updated the four *incoming* commands and left the *outgoing* instruction in the fifth. `calibrate.md` and `ship.md` also called `transitionPhase` pre-M5.E9 and need the same read. **Folded into M5.E13 FR1** rather than opened as separate work: one instruction family, one fix. **→ Status reconciled 2026-08-02** (fix lane, BUGS.md status-vs-code sweep): fixed in **M5.E13** and never flipped. `commands/discuss.md:158` now reads **"Do NOT set `phase: PLAN` here"** — the incoming command advances the phase, not the outgoing one. Pinned by `tests/commands-wording.test.js:61`, which asserts no command sets a phase the next command also sets. |