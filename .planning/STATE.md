---
schema_version: 1
docs_layout_version: 3
phase: REVIEW
current_epic: M5.E13
current_wave: null
current_tasks:
  - id: M5.E13.S3.t2
    epic: M5.E13
    wave: 1
    status: in_progress
    startedAt: 2026-07-30T00:17:04.562Z
completed_phases:
  - DISCUSS (2026-07-29)
  - PLAN (2026-07-29)
  - EXECUTE (2026-07-30)
  - VERIFY (2026-07-30)
blockers: []
last_completed_task:
  id: M5.E13.S3.t1
  status: done
  commit: 5a677717f03ca1d8cf890330a41276703592e4f5
  completedAt: 2026-07-30T00:16:49.677Z
last_decision_at: 2026-07-30T00:16:49.677Z
last_updated_commit: 00af9a4c5bbe2e56c804a1a53f7a815d1101a454
last_updated: 2026-07-30T13:55:16.555Z
---
# Project State

## Resume pointer

**v0.1.13 — M5.E8, the measurement foundation — ✅ SHIPPED 2026-07-28.** Signal can now measure whether one of its own instructions changes what an agent does. Full DISCUSS→SHIP at FULL/strict. 1652 → **1736 tests**. Tag `v0.1.13` → release commit `8d20193`. Retro: `M5.E8-RETROSPECTIVE.md`. Decisions **D-M5E8-1…6**.

**The two numbers that are the deliverable:**
- **The ceiling (FR5):** of **407 directive lines** across 18 `commands/*.md`, **91 (22.4%) are trace-measurable; 316 (77.6%) are not.** Published in `ADHERENCE-LOG.md`; the log states the remainder is **unmeasured, not passing**, pinned by a wording test. This *corrects* the Epic's own research (R1 estimated 10.9%) and *falsifies* R1's claim that `execute`/`verify`/`review`/`calibrate` name zero library calls — they name **4/3/3/0**, including this Epic's own canary.
- **The verdict (FR2):** `B41-phase-entry` → **3/3 as-written, 0/3 with the instruction deleted, 0 failed runs → OBEYED.** M5.E9's phase-entry fix works. It shipped unverified in v0.1.12 and is the first thing the harness measured.

**The sentence worth carrying forward:** *every defect this Epic found was in the measuring instrument, and every one produced a plausible-looking result rather than an error.* Four — an unreachable fixture (`ABSENT`), a broken `--plugin-dir` seam, a control arm that deleted one line from a section restating the instruction three more times (near-miss `INERT`), and a commit captured after the run that defeated `--combine`'s pairing guard. **None would have made a reader doubt the number.** The near-miss matters most: the plan **pre-authorised `inert` in writing** so a null result would not be tuned away — and that guardrail is exactly what would have carried a broken control into the published log. A pre-committed acceptable outcome needs a pre-committed way to tell it from its impostor (→ the four-verdict impostor table in `M5.E8-REVIEW.md`).

**▶ IN FLIGHT: M5.E13 — "Guards that don't guard" (v0.1.14). Opened 2026-07-28; PLAN closed 2026-07-29, phase PLAN → EXECUTE next.** Requirements: [`M5.E13-REQUIREMENTS.md`](M5.E13-REQUIREMENTS.md) (6 FRs) · Plan: [`M5.E13-PLAN.md`](M5.E13-PLAN.md). Decisions **D-M5E13-1…8**. Tier FULL inherited. Four defect groups, one story: *something was built to catch a mistake, and it does not catch it* — `B48`, the guard class, `B36` + retro-index freshness, and `B49`'s remainder. **The guard class went from three instances to four at PLAN** — `B39`/`B46`/`I2`/**`B54`**. Four groups, not five; the count that moved is the class's, and only that one.

**Two things this DISCUSS corrected before planning anything.** (1) M5.E8's retro proposed a mechanism for the guard class — *a `--check`-has-a-caller test* — that covers **1 of its own 3 instances**: `--check` appears in exactly one file in all of `tools/`, and it is `I2` itself; `B39` is an instruction no command implements, `B46` a data write-back nothing ran. Scope corrected (**D-M5E13-3**): fix the three, build the narrow test, **label the gap in the test's own name**. (2) The Epic takes ID **`M5.E13`, not the next-derived `M5.E10`** — `M5.E10`–`E12` are live roadmap headings with inbound references, and ID-is-identity makes out-of-order legal (**D-M5E13-1**).

**The five triggers M5.E8 fired are now decided, not silent (D-M5E13-6)** — one promoted (M5.E10, re-scoped from two items to seven by the claim-integrity analysis, `B38` folded in with a purpose), four re-parked with new written conditions and dates. Plus **D-M5E13-7**: the tracker call in `analysis/CLAIM-INTEGRITY-ANALYSIS.md` §7 discharges the *GitHub Issues adoption* trigger that fired **2026-07-15** and sat unacted — `B39`'s own canonical instance.

**The originating bug, for context:** `execute.md`'s phase-entry instruction is **unconditional**, and an agent **correctly refused** it rather than write a false record into the ledger v0.1.12 had just made honest (calling `transitionPhase` on a phase that halts at its preconditions records `phase: EXECUTE` for a project with nothing to execute). Affects **all four** commands M5.E9 changed — `plan`, `execute`, `verify`, `review`. Found by reading a run transcript, **not** by a verdict. Carries with it: **`B49`'s remaining half** (extend `checkVersionConsistency` to cover `package.json` — the guard exists and fired on `marketplace.json` during v0.1.13's own cut; only its *scope* is short), and **a defect class with three confirmed instances — a guard written, shipped, and never called** (`B39` a watchlist never walked · `B46` 45 dispositions nothing reads back · M5.E8's `I2` a `--check` nothing invoked). One class, not three bugs. ~~Candidate mechanism: a hygiene check asserting every `--check`-style guard in `tools/` has a caller.~~ **Falsified 2026-07-28 (D-M5E13-3)** — that test's population is one file, and it is `I2` itself; it covers **1 of the 3** instances. See the IN-FLIGHT block above.

**Note for whoever plans v0.1.14:** `B48`'s fix **rewords a measured instruction**, which invalidates the `OBEYED` verdict recorded against it. That is exactly what the new `ship.md` adherence checklist line exists to catch — so v0.1.14 should re-run the canary (`node tools/adherence-run.js --canary B41-phase-entry`). It will be the first time the harness is used the way it was built to be used rather than to prove itself.

**`B36` sighted live a THIRD time** at M5.E8's own SHIP: the FR1 retro gate **skipped** because `MILESTONE-5.md` still carried E8 as `▶ NEXT`. The retro existed only because it was written before the gate ran. Same inertia as at M5.E9's and M5.E6's ships.

## In-flight

**M5.E13 — "Guards that don't guard", phase PLAN.** Opened 2026-07-28; `current_epic` rolled `M5.E8 → M5.E13` and reset the ledger, so `completed_phases` is empty and fills as this Epic's own phases close. M5.E8's complete six-phase ledger (DISCUSS→SHIP) — the first written entirely by the commands rather than by hand, which is `B41`'s fix working on Signal itself — **[CORRECTED: this line originally claimed it was "archived on the roll"; it was NOT]**. The roll **silently discarded it** (`B52`): this session ran `state.js` from the **v0.1.11 plugin cache**, which predates M5.E9's archive-on-roll step. **Recovered verbatim from git and restored** to [`archive/M5/E8/STATE-NARRATIVE.md`](archive/M5/E8/STATE-NARRATIVE.md), zero entries lost.

**▶ PLAN closed 2026-07-29.** Artifacts: [`M5.E13-PLAN.md`](M5.E13-PLAN.md) (5 slices, 16 tasks), [`M5.E13-RESEARCH.md`](M5.E13-RESEARCH.md), [`M5.E13-VALIDATION.md`](M5.E13-VALIDATION.md) (8/8 dimensions pass; 21 ACs, 20 automated, 8 proof-of-fail).

**Both DISCUSS open questions are settled by measurement, not by preference.** (1) FR1.2's refusal goes in **`transitionPhase`, not `recordPhase`** — `completePhase` calls `recordPhase` (`state.js:574`) and exists to record **SHIP**, whose artifact is optional by design, so a guard in `recordPhase` would refuse the normal ship (a direct AC1.3 collision). (2) `B39` is fixed by **implementing the walk, not retiring the entry** — the watchlist carries a **dated** trigger live until **2026-08-23**, and retiring it would discard a live obligation ~3.5 weeks early, against the entry's own stated rationale.

**PLAN found the class's FOURTH instance — `B54`, and it is the worst of them.** `checkGateArtifacts` (`state.js:616`) is an artifact-existence checker that **nothing calls** — an exhaustive grep returns the definition, four test references, and **three prose hits describing it as part of the flow**, one of which records a *fix once applied to it*. Unlike `B39`/`B46`/`I2`, which are merely absent, this one is **wrong if wired up**: executed against Signal it returns `{ready:false, missing:['REQUIREMENTS.md']}`, because it hardcodes the unprefixed name while Epic mode writes `M5.E13-REQUIREMENTS.md` — so the obvious remediation (switch it on) blocks PLAN for every Epic-mode project. Four of its five gates are vacuous empty lists. **Being uncalled is what protected its bug from discovery** — a dormant guard is not neutral; it rots, and its documentation rots with it. **Disposition ratified by Brett: replace** (delete + rebuild in `transitionPhase`), per M5.E9's remove-don't-re-tune precedent. **This corrects D-M5E13-3's locked count of three to four** — which is that decision's own lesson turned on this Epic.

**Two couplings PLAN discovered that the requirements did not name.** (1) FR1.1's rewording **invalidates `references/adherence-canaries.json`** — the `B41-phase-entry` canary's control arm anchors on the exact section heading being reworded, so the JSON must change in the same commit or the canary measures stale text. (2) FR3.2's named sibling `checkIndexFreshness` lives in **`sweep.js:66`**, not `retro-index.js` — the new check homes there.

**Next command:** `/sig:execute`. Wave 1 = S1 ∥ S3 ∥ S4 · Wave 2 = S2 · Wave 3 = S5.

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
