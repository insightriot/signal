---
schema_version: 1
docs_layout_version: 3
phase: SHIP
current_epic: M5.E8
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-27)
  - PLAN (2026-07-28)
  - EXECUTE (2026-07-28)
  - VERIFY (2026-07-28)
  - REVIEW (2026-07-28)
  - SHIP (2026-07-28)
blockers: []
last_completed_task: null
last_decision_at: 2026-07-26T13:45:54.062Z
last_updated_commit: 5b6e9ee089647a76820d1a6c1243a4cfc907280e
last_updated: 2026-07-28T13:37:23.013Z
---
# Project State

## Resume pointer

**v0.1.13 — M5.E8, the measurement foundation — ✅ SHIPPED 2026-07-28.** Signal can now measure whether one of its own instructions changes what an agent does. Full DISCUSS→SHIP at FULL/strict. 1652 → **1736 tests**. Tag `v0.1.13` → release commit `8d20193`. Retro: `M5.E8-RETROSPECTIVE.md`. Decisions **D-M5E8-1…6**.

**The two numbers that are the deliverable:**
- **The ceiling (FR5):** of **407 directive lines** across 18 `commands/*.md`, **91 (22.4%) are trace-measurable; 316 (77.6%) are not.** Published in `ADHERENCE-LOG.md`; the log states the remainder is **unmeasured, not passing**, pinned by a wording test. This *corrects* the Epic's own research (R1 estimated 10.9%) and *falsifies* R1's claim that `execute`/`verify`/`review`/`calibrate` name zero library calls — they name **4/3/3/0**, including this Epic's own canary.
- **The verdict (FR2):** `B41-phase-entry` → **3/3 as-written, 0/3 with the instruction deleted, 0 failed runs → OBEYED.** M5.E9's phase-entry fix works. It shipped unverified in v0.1.12 and is the first thing the harness measured.

**The sentence worth carrying forward:** *every defect this Epic found was in the measuring instrument, and every one produced a plausible-looking result rather than an error.* Four — an unreachable fixture (`ABSENT`), a broken `--plugin-dir` seam, a control arm that deleted one line from a section restating the instruction three more times (near-miss `INERT`), and a commit captured after the run that defeated `--combine`'s pairing guard. **None would have made a reader doubt the number.** The near-miss matters most: the plan **pre-authorised `inert` in writing** so a null result would not be tuned away — and that guardrail is exactly what would have carried a broken control into the published log. A pre-committed acceptable outcome needs a pre-committed way to tell it from its impostor (→ the four-verdict impostor table in `M5.E8-REVIEW.md`).

**➡ NEXT: v0.1.14 — `B48`, and it is live in shipped code.** `execute.md`'s phase-entry instruction is **unconditional**, and an agent **correctly refused** it rather than write a false record into the ledger v0.1.12 had just made honest (calling `transitionPhase` on a phase that halts at its preconditions records `phase: EXECUTE` for a project with nothing to execute). Affects **all four** commands M5.E9 changed — `plan`, `execute`, `verify`, `review`. Found by reading a run transcript, **not** by a verdict. Carries with it: **`B49`'s remaining half** (extend `checkVersionConsistency` to cover `package.json` — the guard exists and fired on `marketplace.json` during v0.1.13's own cut; only its *scope* is short), and **a defect class with three confirmed instances — a guard written, shipped, and never called** (`B39` a watchlist never walked · `B46` 45 dispositions nothing reads back · M5.E8's `I2` a `--check` nothing invoked). One class, not three bugs; candidate mechanism is a hygiene check asserting every `--check`-style guard in `tools/` has a caller.

**Note for whoever plans v0.1.14:** `B48`'s fix **rewords a measured instruction**, which invalidates the `OBEYED` verdict recorded against it. That is exactly what the new `ship.md` adherence checklist line exists to catch — so v0.1.14 should re-run the canary (`node tools/adherence-run.js --canary B41-phase-entry`). It will be the first time the harness is used the way it was built to be used rather than to prove itself.

**`B36` sighted live a THIRD time** at M5.E8's own SHIP: the FR1 retro gate **skipped** because `MILESTONE-5.md` still carried E8 as `▶ NEXT`. The retro existed only because it was written before the gate ran. Same inertia as at M5.E9's and M5.E6's ships.

## In-flight

**None — M5.E8 shipped as v0.1.13 (2026-07-28).** No Epic in flight; `current_epic` still reads `M5.E8` and will roll when the next Epic opens its DISCUSS. `completed_phases` holds M5.E8's complete six-phase ledger (DISCUSS→SHIP) — the first one written entirely by the commands rather than by hand, which is `B41`'s fix working on Signal itself.

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
