---
id: SIG-87
type: BUG
status: C
title: "`B41`'s shape survives in human-driven runs: a phase that RAN is absent
  from `completed_phases`."
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:152
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B87
---
| B87 | `fixed` | **P2** | **`B41`'s shape survives in human-driven runs: a phase that RAN is absent from `completed_phases`.** Caught live during M5.E19's own VERIFY, while it was happening rather than reconstructed after. The Epic's ledger reads `DISCUSS, PLAN, VERIFY` — **EXECUTE is missing, and EXECUTE ran**: `commands/archive.md`, `tools/lib/archive-command.js` and `tests/archive-command.test.js` were all written and committed (`cafab4a`), and `M5.E19-PROGRESS.md` records all five slices. `transitionPhase` records the phase being **left**, so a run that goes PLAN → VERIFY without ever calling `transitionPhase('EXECUTE')` appends `PLAN` and EXECUTE never enters the log at all. **Why `B41`'s fix cannot catch this:** M5.E9 closed `B41` by putting the `transitionPhase` call **inside each phase command** — which does nothing for a run that never invokes the commands. **Signal-on-Signal is exactly that run**, and so is any Epic a maintainer drives by hand, which is how most of this repo's own Epics have been executed. So the ledger's accuracy silently depends on the operator remembering a call, for the one project that produces all of Signal's evidence. **Not repaired at discovery, deliberately:** the phase log is append-only with no dedupe (`D-M5E9-5`) and hand-inserting an entry to tidy the record is the falsification the append-only rule exists to prevent — `B48` settled that writing a phase entry the flow did not produce is wrong even when an instruction demands it. **Candidate fixes, neither chosen:** (a) a drift check comparing `completed_phases` against artifacts on disk — a `{Epic}-PROGRESS.md` exists ⇒ EXECUTE ran; note `phase-behind-artifacts` already compares `phase` to artifacts but is **blind to gaps in the log**, so this is a new check rather than a widening; (b) make the phase-entry call reachable outside the command path. **Found 2026-08-07** at M5.E19 VERIFY. |