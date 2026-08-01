---
schema_version: 1
docs_layout_version: 3
phase: PLAN
current_epic: M5.E16
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-08-01)
blockers: []
last_completed_task: null
last_decision_at: 2026-07-31T02:50:26.294Z
last_updated_commit: e309ce2
last_updated: 2026-08-01T23:55:07.032Z
---
# Project State

## Resume pointer

**▶ ACTIVE: M5.E16 — STATE-vs-world drift detection. DISCUSS, opened 2026-08-01.** Target v0.1.16.
`/sig:sweep` gains deterministic checks comparing what STATE.md **asserts** against what is on disk
and in git. **20 of 56 catalogued bugs are STATE-related (36%)** — the largest cluster — and nothing
verifies any STATE field except `last_updated_commit`. **This one ships as a capability for the
invoking project, not as Signal hygiene**; that reframe is the point, and it retires M5.E16's prior
"detectors for Signal's own guard class" framing (both original homes moved: `B39` fixed in M5.E13,
`B46` → M5.E14). Requirements: `M5.E16-REQUIREMENTS.md` · Profile: FEATURE, **`nyquist: strict`**
because precision — not recall — is the deliverable.

**The live instance that opened it, from this repo, 2026-07-31:** frontmatter read
`current_epic: M5.E17`, while the body's *"Next candidates"* list named M5.E15 / M5.E16 / M5.E10 and
**omitted M5.E17 entirely**. `/sig:resume` read both halves and flagged neither. *The data moved, the
prose did not, and the command whose only job is orientation read straight past it.*

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

**M5.E16 is in PLAN** (opened 2026-08-01, target v0.1.16). Plan, research and validation written;
no tasks started. Next command: `/sig:execute`.

**PLAN's first step found `B59` and stopped for it.** The tier-gating preamble was the first time any
code read `M5.E16-PROFILE.md`, and it **threw**: two values outside their enums (`stakes: moderate`,
valid only for `reversibility`; `reversibility: easy`, valid nowhere). `readEffectiveProfile` fails
open, so **the Epic that declares FEATURE ran the whole of DISCUSS at the project's FULL** and every
override the file existed to set was inert. Written by hand in `18741a8` — the same commit as the
DISCUSS it was meant to govern. Fixed in the fix lane (PR #6) and pinned by
`tests/own-profiles-parse.test.js`; `B60` filed for the ten command files that handle *"PROFILE not
found"* and say nothing about a malformed one — **6 silent / 4 explicit**, and the six that are
silent are the six that consume the tier to set rigor.

**Research was replaced by measurement** (`research_parallelism: 0`, and there was nothing to read).
The candidate checks were prototyped against **13 real `.planning/` projects** on this machine —
FR2.1 asked for one. Results in `M5.E16-RESEARCH.md`:

- **6 checks ship, 2 are dropped with written reasons.** `(e)` duplicates `detectOrphans`; **`(f)`
  cannot be validated at all — zero of thirteen projects have a non-empty `blockers[]`.**
- **Two checks were added.** `(g)` PROFILE-parses (Brett's call). **`(h)` — `current_epic` set but
  not a strict Epic ID — was found by measuring**, fires on `agent-tools-sync` (`"M1"`) and
  `traction-engine` (`"PHASE12"`), and is **`B53`'s class live in the field** on half the Epic-mode
  corpus.
- **Check `(b)` is proven against real history**, not a fixture: red at `4421105` / `137b9ca` /
  `8acd1d2` — the three commits spanning the drift that opened this Epic — and green at `18741a8`,
  the commit that repaired it.
- **The number that shapes the plan: checks `(a)` and `(b)`, the two aimed at the originating
  incident, can evaluate 2 of 13 projects.** Signal's own shape is the *minority* shape — 4 of 12
  readable projects are Epic-mode, 7 of 12 have a canonical `phase`, and `readState` **throws** on
  one outright. A sweep that prints nothing there reads as *clean* when it never looked, which is
  `B39`'s and `B54`'s shape. **The report must distinguish checked-clean from could-not-check**, and
  the coverage numbers get published the way M5.E8 published its 22.4% ceiling.

Decisions **D-M5E16-1 … 5**. `/sig:sweep` **stays read-only** — FR4 ("Signal runs it") contradicted
NFR2 ("no writes"), Brett resolved it in NFR2's favour, and healing moved to FR5's phase-transition
regeneration plus an opt-in `--heal`. Validation found **AC4.3 had no owner** and added `S4.t4`.

**Scope, after the 2026-08-01 additions — six FRs, and FR4 is the load-bearing one:**
- **FR1** six deterministic STATE-vs-world checks in `/sig:sweep` · **FR2** precision discipline
  (validate on a real non-Signal project; a false-positive check is **removed**, not tuned quiet)
- **FR3** do findings also surface at `/sig:resume`? — PLAN decides with a reason
- **FR4 — every check declares a heal path.** *Measured 2026-08-01 across four real projects: 16
  structural findings, and **15 should never have reached a person** (11 false alarms, 3
  self-healing, 1 one-command-fixable). Detect-only would have manufactured 15 chores.* Three
  categories: self-healing → report as reassurance; command-healable → **Signal runs it**;
  needs-a-person → **the only category allowed to interrupt.** A check that cannot state its
  category does not ship.
- **FR5** `INDEX.md` regenerates at **every phase transition**, not only SHIP (Brett, 2026-08-01).
  Session-start regeneration rejected: no Signal hook writes anything today, and that line holds.
- **FR6 — `/sig:update`.** Reports installed vs available, **shows the CHANGELOG delta** (the half
  `/plugin` cannot do), updates on confirm, then **states that a restart is required** — `B52`, and
  Brett wants the timing to be his. Feasibility confirmed, not assumed: `claude plugin update` /
  `marketplace update` / `list` all exist. Fully separable — **if the Epic does not slice cleanly,
  FR6 becomes its own Epic rather than dropping requirements.**

**Open questions carried into PLAN** (all three stated in `M5.E16-REQUIREMENTS.md`):
1. Do STATE findings also surface at `/sig:resume`, and at what banner cost? A detector nobody runs
   is `B39` in a new costume; resume's briefing is capped at 50 lines. **Decide with a reason.**
2. Which of the six checks ship — (d) and (e) already have partial coverage via `isStateStale` /
   `detectOrphans`; overlapping findings are their own kind of noise.
3. What counts as "the body mentions `{Epic}`" for check (b) — highest false-positive risk of the
   six, and the most likely to be killed by FR2.2.

**Queued behind it, in the order the evidence argues for:**
- **M5.E15** — `B55`, the control arm made real. Blocks any new adherence verdict being trusted. **Standing prohibition: do not re-run a canary for a cleaner number before the arm is fixed.**
- **M5.E14** — tracker migration **plus** the 48-entry inbox triage cut from M5.E17 (`D-M5E17-3`). The
  deeper problem is the capture *channel*: the findings that reached the backlog (`B42`, `B53`, `B48`)
  all arrived incidentally, from someone reading an artifact. Day-to-day hand-corrections never
  become entries at all.
- **M5.E10** — review hardening / claim integrity. The judge-based, semantic half of M5.E16's
  question (claims-vs-artifacts, the traction-engine Phase 11 evidence) lands here — **after** the
  deterministic checks, not with them.

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
