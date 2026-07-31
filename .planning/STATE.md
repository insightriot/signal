---
schema_version: 1
docs_layout_version: 3
phase: SHIP
current_epic: M5.E13
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-29)
  - PLAN (2026-07-29)
  - EXECUTE (2026-07-30)
  - VERIFY (2026-07-30)
  - REVIEW (2026-07-30)
  - SHIP (2026-07-30)
blockers: []
last_completed_task:
  id: M5.E13.S3.t2
  status: aborted
  commit: null
  completedAt: 2026-07-31T02:50:26.294Z
last_decision_at: 2026-07-31T02:50:26.294Z
last_updated_commit: b76420a72aa0e8c33871e698a6c583c67edb33bb
last_updated: 2026-07-31T02:50:26.321Z
---
# Project State

## Resume pointer

**v0.1.14 — M5.E13, "guards that don't guard" — ✅ SHIPPED 2026-07-30.** Four defects, one shape: *something was built to catch a mistake, and it does not catch it.* Full DISCUSS→SHIP at FULL/strict. 1736 → **1806 tests**. Retro: `M5.E13-RETROSPECTIVE.md`. Decisions **D-M5E13-1…8**.

**Closed:** `B48` (the phase-entry instruction was **unconditional**, and an agent **correctly refused it** — fixed in the text *and* the code beneath it), `B53` (a non-strict `current_epic` split artifact **write**-naming from **read**-resolution), `B39` (a watchlist nothing walked), `B36`, `B49`-remainder, `B51`, `I2`, and `B54`.

**The two findings that outrank the plan, both found by doing the work rather than planning it:**

- **`B54`** (at PLAN) — `checkGateArtifacts` was the guard class's **fourth** instance and the only one **wrong if wired up**: executed against Signal it returned `missing:['REQUIREMENTS.md']`, so the obvious remediation would have blocked PLAN for every Epic-mode project. **Being uncalled is what protected its bug from discovery.** Deleted.
- **`B55`** (at the last task) — **the adherence control arm was never isolated across files.** `adherence-run.js` mutates one command file while `transitionPhase` is named 4× each in three siblings, so a control-arm agent simply reads a neighbour. The canary re-ran **INDETERMINATE** (3/3 vs 1/3) and was **deliberately not re-rolled** — a second run is a coin-flip and taking the better of two is what M5.E8's impostor table forbids. **v0.1.13's flagship `OBEYED` is not falsified but unisolated: clean by luck, not construction.** → **M5.E15**.

**The sentence worth carrying forward:** *this Epic's own defect classes appeared in its own work five times — at DISCUSS, PLAN, VERIFY, and twice at REVIEW — and all five were caught by someone re-deriving a number that was already written down. None by a mechanism.* REVIEW's two were the sharpest: an **unconditional guard** replacing an unconditional instruction (Critical — it made SKETCH projects unshippable, `B42`'s exact shape), and **two implementations of one rule under a comment denying it**. If these classes survive an Epic explicitly about them, they survive anything short of automation. That is the argument for **M5.E16**.

**Known limits, stated:** AC2.2 **NOT MET** — `B46`'s premise does not survive measurement (**0 of 48** inbox candidates map to any disposition row); work stopped rather than forced. The published coverage share fell 22.4% → 21.1% **because clarifying an instruction lowers it** — documented in `ADHERENCE-LOG.md` above the table.

**New this release:** **CI** (`.github/workflows/test.yml`) — Signal had none. Its first run caught a latent dependency nothing had stated: the suite walks real git history, and `actions/checkout` shallow-clones by default.

## In-flight

**Nothing in flight.** M5.E13 shipped 2026-07-30 as v0.1.14; the six-phase ledger below was written entirely by the commands, SHIP included.

**Next candidates, in the order the evidence argues for:**
- **M5.E15** — `B55`, the control arm made real. Blocks any new adherence verdict being trusted. **Standing prohibition: do not re-run a canary for a cleaner number before the arm is fixed.**
- **M5.E16** — the guard class's **document-shaped** (`B39`'s home) and **data-shaped** (`B46`'s home) detectors. The code-shaped one is built and covers 2 of 4.
- **M5.E10** — review hardening / claim integrity. Three `B50` sightings this Epic alone feed it.

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E8** (The measurement foundation) — SHIPPED as **v0.1.13** (2026-07-28). The adherence harness + the published coverage ceiling (**91/407 = 22.4%** trace-measurable). First verdict: `B41-phase-entry` **OBEYED** (3/3 vs 0/3). 1652→1736 tests; VERIFY PASS (28 ACs); REVIEW PASS-WITH-FIXES (1 Critical — the source commit was captured after the run, defeating `--combine`'s pairing guard). New: **B48** (P2, live), **B49** (P3, fixed). → [M5.E8-RETROSPECTIVE.md](M5.E8-RETROSPECTIVE.md).
- **M5.E9** (Linear mode & the phase ledger) — SHIPPED as **v0.1.12** (2026-07-27), **ran ahead of E8** (D-M5E9-2). Closed B41–B45; `[BREAKING]` `completed_phases` became an append-only trimming log. 1623→1652 tests. → [M5.E9-RETROSPECTIVE.md](M5.E9-RETROSPECTIVE.md).
- **M5.E6** (Doc-runtime close-out — maintenance-command half) — SHIPPED as **v0.1.11** (2026-07-25). `/sig:sweep` + roster 17→18 + FR3 map line + FR7 close-out & B31 + cleared B27/B28/B29/B30; 1561→1623 tests; VERIFY PASS (strict, mutation proof-of-fail), REVIEW PASS (3-specialist panel, 0 false-greens). New `needs-triage`: B32–B36 (incl. **B36** — FR1 gate stale-row blind spot found dogfooding the ship). → [M5.E6-RETROSPECTIVE.md](M5.E6-RETROSPECTIVE.md).
- **M5.E5** (v0.1.10 carry-over bug squash) — SHIPPED as **v0.1.10** (2026-07-21). B24/B25/B26 + B6 refinement fixed, RED-first; 1529→1561 tests; REVIEW PASS (0 false-greens, 12-case mutation matrix); **B26 dogfooded on its own SHIP**. New carry-overs B27–B30 deferred (`needs-triage`). → [M5.E5-RETROSPECTIVE.md](M5.E5-RETROSPECTIVE.md).
- **M5.E4** (Bug & doc-runtime hygiene close-out) — SHIPPED as **v0.1.9** (2026-07-21). 12 confirmed bugs fixed/dismissed + FR5 concurrency-lock; 1492→1529 tests; REVIEW PASS-WITH-FIXES (evict.js false-green security bypass caught + fixed in-phase). B24 + the B6 refinement deferred to v0.1.10. → [M5.E4-RETROSPECTIVE.md](M5.E4-RETROSPECTIVE.md).
- **M5.E1 + M5.E2 + M5.E3** — the doc-runtime, SHIPPED together as **v0.1.8** (2026-07-20): canonical doc-model + eviction (E1), auto-sensing `/sig:migrate-memory` (E2), all-docs hygiene + living `BACKLOG.md` + append-log eviction + auto `/sig:index` (E3). → [M5.E3-RETROSPECTIVE.md](M5.E3-RETROSPECTIVE.md) (+ E1/E2 retros).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative) → [STATE-HISTORY.md](STATE-HISTORY.md).
