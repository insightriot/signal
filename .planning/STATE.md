---
schema_version: 1
docs_layout_version: 3
phase: SHIP
current_epic: M5.E16
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-08-01)
  - PLAN (2026-08-02)
  - EXECUTE (2026-08-02)
  - VERIFY (2026-08-02)
  - REVIEW (2026-08-02)
  - EXECUTE (2026-08-02)
  - VERIFY (2026-08-02)
  - REVIEW (2026-08-02)
  - SHIP (2026-08-02)
blockers: []
last_completed_task:
  id: M5.E16.S1
  status: done
  commit: be0588f
  completedAt: 2026-08-02T00:20:21.679Z
last_decision_at: 2026-08-02T00:20:21.679Z
last_updated_commit: 8d94b76
last_updated: 2026-08-02T14:18:13.834Z
---
# Project State

## Resume pointer

**▶ No Epic open.** M5.E16 shipped as **v0.1.16** on 2026-08-02. Next candidates, in the order the
evidence argues for: **M5.E15** (`B55`, the adherence control arm — blocks any new adherence verdict
being trusted) → **M5.E14** (tracker migration + the 48-entry inbox triage cut from M5.E17) →
**M5.E10** (review hardening / claim integrity — the semantic half of M5.E16's question).

---

**v0.1.16 — M5.E16, "what `.planning/` asserts vs. what is on disk" — ✅ SHIPPED 2026-08-02.**
`/sig:sweep` gained six deterministic STATE-vs-world checks, each declaring whether it **needs a
person** or **clears itself**. 1836 → **1938 tests**. 18 → **19 commands**. Decisions
**D-M5E16-1…5**. Retro: [`M5.E16-RETROSPECTIVE.md`](M5.E16-RETROSPECTIVE.md).

**The number that shaped the release.** Measured across **13 real `.planning/` projects**: the two
checks aimed at the incident that opened this Epic can evaluate **2 of them**. Signal's own
hand-maintained, Epic-mode, `schema_version: 1` shape is the **minority** shape — 4 of 12 readable
projects are Epic-mode, 7 of 12 have a canonical `phase`, and `readState` **throws** on one outright.
A detector printing nothing on the other 11 would read as *clean* when it never looked, which is
`B39`'s shape and `B54`'s. So the report separates **"checked and clean"** from **"could not
check,"** and `(h)` — a check found only by measuring — reports *why* the others cannot see.

- **Six ship, two dropped with reasons.** Orphan detection duplicates `detectOrphans`; the blockers
  check is **unvalidatable** — *zero of thirteen* real projects have a non-empty `blockers[]`.
- **Precision measured, not asserted:** 13 projects, **5 findings, all true positives, 0 false
  positives**. NFR3 **+19 ms** against a 200 ms budget.
- **Also shipped:** `INDEX.md` regenerates at **every phase transition** (was: only at ship), and
  **`/sig:update`** — installed vs. available *plus the CHANGELOG delta*, the half `/plugin` cannot
  show you.
- **`D-M5E16-1`:** FR4 said *"Signal runs it"*, NFR2 said sweep never writes. Resolved in NFR2's
  favour, and the recorded cost is that **the command-healable bucket ships empty** — asserted by a
  test.

**Two defects in the Epic's own work, both found by reading documents against each other:**

- **`B59`** — `M5.E16-PROFILE.md` carried **two** out-of-enum values, so `readEffectiveProfile`
  threw and **the Epic declaring FEATURE ran its whole DISCUSS at the project's FULL.** Found at its
  own PLAN preamble, the first time any code read the file. Fixed and pinned.
- **`C1` at REVIEW** — check `(c)` reported **"clean"** on `traction-engine` (19 phase artifacts, 0
  retrospectives) because it declared itself unconditionally evaluable while keying detection to a
  strict filename. **REVIEW returned FAIL and the Epic looped back to EXECUTE**, rather than take the
  small-diff exit `D-M5E17-1` explicitly warns about. The fix then introduced a *false positive*,
  which FR2.1's re-measure requirement caught inside the same loop.

**The sentence worth carrying forward:** *check `(a)` had zero live hits and fixture-only evidence
until the REVIEW→EXECUTE loop-back moved the recorded phase backwards past an artifact that already
existed — so the Epic's own process produced the first field instance of the drift its own check was
built to detect.*

**Published honestly rather than rounded:** Nyquist **87 of 98 red-first**, not 98/98 — measuring the
baseline rather than attesting to it is what surfaced the ten that could not have failed. New:
**`B60`** (P2, six phase commands have no branch for a malformed PROFILE while four meta commands
do), **`B61`** (P3, hand-edited numeric-looking `last_updated_commit` is YAML-coerced).

---

**⚠ HOW CHANGES REACH `main` CHANGED 2026-08-01 — read before your first commit.** `main` is
**protected**; direct pushes are rejected by the server. Every change needs a branch, a PR, and a
green `test` check (0 approvals required). **Two lanes:** the Epic lane runs six phases, the fix lane
runs none — **both** require the PR. Delivery moved to the relative `.` marketplace source, so
**users track `main`**, not a pinned tag. Full rules in `CLAUDE.md` § *How changes reach `main`*;
rationale in **`D-M5E17-4`** / **`D-M5E17-5`**.

---

**v0.1.15 — M5.E17, "instructions that contradict other instructions" — ✅ SHIPPED 2026-08-01.**
Three documents corrected, each pinned by a test comparing one document against another. 1806 →
**1828 tests**. Decisions **D-M5E17-1…5**.

- **`ship.md` referenced a commit that no step created** — four steps staged "into the SHIP commit",
  none made it, and `markFresh` sat at §5.3 ahead of all four, stamping a pre-commit HEAD **by
  construction**. New §9 creates it; `markFresh` follows.
- **`verify.md` / `review.md` stated no `markFresh` ordering at all** — silent, not wrong, which is
  the same defect one step earlier. Audit: **2 explicit / 2 silent / 1 wrong** across 5 call sites.
- **`review.md`'s verdict table contradicted two shipped Epics** (`FAIL | Any Critical` vs M5.E9 and
  M5.E13 both shipping PASS-WITH-FIXES with an in-phase Critical). Rule was miscalibrated, not
  practice — **D-M5E17-1**, four conjunctive conditions, counter-argument recorded in the file.
- **`plan.md` now schedules first-use** — name what the Epic does *for the first time*, put it in
  **wave 1**. `B54`, `B39`, `B42`/`B53`, `B48`, `B55` all surfaced on a first execution, all late.
- **Two of the Epic's own ACs were satisfiable by a no-op** — corrected in the open. The red baseline
  was **measured, not predicted**, and running it caught an error in the probe itself.
- **Cut: FR4**, the 48-entry inbox triage → **M5.E14** with the tracker migration (`D-M5E17-3`).
- **`B56` filed:** `references/facts.md` publishes 894 tests (actual **1828**); the guard pins
  `facts.md` to `README.md` but never to the real count — both drift together, test stays green.

**Fixed same day, outside the Epic (fix lane):**
- **`B58` (P1)** — `marketplace.json` pinned `sha` to **v0.1.13's commit** while `ref` said v0.1.15.
  Claude Code resolves the **sha**, so **every install since v0.1.14 silently delivered v0.1.13** —
  two releases undeliverable, and Signal's only regular outside user was running v0.1.13 machinery
  against live projects. **Found by Brett running `/plugin`.** The guard checked the sha's *shape*
  and the ref's *value* and never compared them. **`B7` recorded this exact drift at v0.1.7 as
  "needs a look" and nothing enforced it for eight releases.** Closed by **deletion** — the source is
  now the relative `.` form, so there is no second place to record which commit ships.
- **`B57`** — `/sig:sweep` walked `.planning/.migrate/snapshot/`, a frozen backup, and reported it as
  broken live docs: **11 of nextpass's 12 findings were noise.** Found by the first run of sweep
  against real non-Signal projects — the FR1 first-use discipline, applied the day it shipped.
- **`ship.md`'s direct-to-main self-exemption removed.** Its Exit Criteria require a PR and an
  approval; §5 exempted "the Signal-on-Signal flow" from exactly that. Written 2026-05-26 —
  **thirteen releases shipped under it and exactly one PR existed in that span.** Fourth contradicting
  instruction pair found in that one file. Now pinned by a test.

---

**v0.1.14 — M5.E13, "guards that don't guard" — ✅ SHIPPED 2026-07-30.** Four defects, one shape: *something was built to catch a mistake, and it does not catch it.* Full DISCUSS→SHIP at FULL/strict. 1736 → **1806 tests**. Retro: `M5.E13-RETROSPECTIVE.md`. Decisions **D-M5E13-1…8**.

**Closed:** `B48` (the phase-entry instruction was **unconditional**, and an agent **correctly refused it** — fixed in the text *and* the code beneath it), `B53` (a non-strict `current_epic` split artifact **write**-naming from **read**-resolution), `B39` (a watchlist nothing walked), `B36`, `B49`-remainder, `B51`, `I2`, and `B54`.

**The two findings that outrank the plan, both found by doing the work rather than planning it:**

- **`B54`** (at PLAN) — `checkGateArtifacts` was the guard class's **fourth** instance and the only one **wrong if wired up**: executed against Signal it returned `missing:['REQUIREMENTS.md']`, so the obvious remediation would have blocked PLAN for every Epic-mode project. **Being uncalled is what protected its bug from discovery.** Deleted.
- **`B55`** (at the last task) — **the adherence control arm was never isolated across files.** `adherence-run.js` mutates one command file while `transitionPhase` is named 4× each in three siblings, so a control-arm agent simply reads a neighbour. The canary re-ran **INDETERMINATE** (3/3 vs 1/3) and was **deliberately not re-rolled** — a second run is a coin-flip and taking the better of two is what M5.E8's impostor table forbids. **v0.1.13's flagship `OBEYED` is not falsified but unisolated: clean by luck, not construction.** → **M5.E15**.

**The sentence worth carrying forward:** *this Epic's own defect classes appeared in its own work five times — at DISCUSS, PLAN, VERIFY, and twice at REVIEW — and all five were caught by someone re-deriving a number that was already written down. None by a mechanism.* REVIEW's two were the sharpest: an **unconditional guard** replacing an unconditional instruction (Critical — it made SKETCH projects unshippable, `B42`'s exact shape), and **two implementations of one rule under a comment denying it**. If these classes survive an Epic explicitly about them, they survive anything short of automation. That is the argument for **M5.E16**.

**Known limits, stated:** AC2.2 **NOT MET** — `B46`'s premise does not survive measurement (**0 of 48** inbox candidates map to any disposition row); work stopped rather than forced. The published coverage share fell 22.4% → 21.1% **because clarifying an instruction lowers it** — documented in `ADHERENCE-LOG.md` above the table.

**New this release:** **CI** (`.github/workflows/test.yml`) — Signal had none. Its first run caught a latent dependency nothing had stated: the suite walks real git history, and `actions/checkout` shallow-clones by default.

## In-flight

**Nothing.** M5.E16 closed 2026-08-02.

**Carried from M5.E16's retro, unhomed:** `review_depth: quality-only` silently disables
`simplification_pass`, and `M5.E16-PROFILE.md`'s prose claimed the dial anyway — so the profile
asserted rigor it did not receive for the whole Epic. That is `B59`'s shape one level up (`B59` was a
profile the code could not *parse*; this is one it parses and then overrides). Detecting it is a
prose-vs-precedence comparison — **M5.E10's semantic territory**, not M5.E16's deterministic one.

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
