# Milestone 5 — Rundown v2 Integrations

> **Roadmap note (2026-04-26):** This was originally MILESTONE-4. It moved to MILESTONE-5 when `/sig:init` (brownfield onboarding) was promoted to MILESTONE-4 — see `.planning/DECISIONS.md` (2026-04-26 — "Roadmap reorder: brownfield onboarding promoted to MILESTONE-4"). The v2-ports work itself is unchanged; only its position in the queue moved.

**Goal:** Expand Signal from 6-phase v1 to the 10-phase architecture from `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`.

**Estimated effort:** Multi-week. Attempt one Epic at a time, ship, observe, iterate.

**Blocked by:** ~~Milestone 4 complete (brownfield onboarding shipped) + v1 shipping to actual users for at least a few weeks. Without usage signal, v2 additions are speculative.~~ **LIFTED 2026-07-15** — usage-signal gate cleared (4 non-Signal users onboarded, M4.5 closed). See DECISIONS 2026-07-15. Note: the re-audit still gates the *speculative* v2 feature ports; the eviction Epic (M5.E1, first-built) is independent of it.

**Note:** This file is directional, not prescriptive. Expect significant rewrite once v1 usage data rolls in and priorities clarify. Epics may be re-ordered based on user pain points, not the order listed here.

---

> **OVERRIDE (2026-07-15, expanded 2026-07-16):** first-*built* Epic is **`M5.E1` — Doc-runtime & memory hygiene** (the go-big doc-runtime flagship: canonical doc-model + STATE/FUTURE-IDEAS eviction + all-docs hygiene + living BACKLOG.md + an auto-sensing migrate command + a doc-layout upgrade stamp/banner), not the re-audit. `M5.E1` **folds in** the re-audit's one gating decision (the doc-index/traversal model, FR1) and records it as canonical; the re-audit is not dropped — it follows and still gates the *speculative* v2 feature ports (upstream phases, compound loop, framework ports), which no longer include the doc-runtime. Full spec: `M5.E1-REQUIREMENTS.md`. See DECISIONS 2026-07-16 (D-M5E1-1 … D-M5E1-6). The BR-8 note below stands for the re-audit's own (now feature-port-only) scope when it runs.

> **Opening move (locked 2026-07-04, BR-8):** M5's first Epic is the **landscape re-audit + roadmap refresh** — feature-parity audit across all inspiration repos → `SIGNAL-INTEGRATION-RUNDOWN-v2.md` with a *sequenced* Epic queue. Scope: `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 2 + FUTURE-IDEAS "M5 opening move." The E1–E6 order below gets re-sequenced by that audit's output, and the memory/doc-runtime scope (BACKLOG-REVIEW Sprint 3, from the FUTURE-IDEAS memory-management entry) enters the queue then. See DECISIONS 2026-07-04. **A preview seed for this audit — the reflection scorecard + the "flagged-but-not-yet-queued" frontier the E1–E6 list is missing — is captured in `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` (2026-07-13); the re-audit should verify it fresh and supersede it.**

## Epic status

The doc-runtime flagship (per the 2026-07-16 override) takes the early M5.E IDs. The
speculative v2-port candidates below are **unsequenced** — their pre-override `M5.E1–E6`
labels are **superseded** and will be assigned real IDs by the re-audit (BR-8). Read this
table, not the candidate headings, for what the IDs mean.

> **Sequencing pivot (2026-07-16):** E2 and E3 **swapped**. Live doc-bloat is blocking Brett across ~5 projects (`nextpass/.planning/STATE.md` at 529 KB is write-wedged — see `BUGS.md` B8), and the **migrate command** (FR6/FR7) is what un-sticks existing projects; the all-docs hygiene runtime + living BACKLOG.md (FR4/FR5) is prevention/maintenance that can follow. So the migrate command is pulled forward to **M5.E2** and the hygiene/backlog work moves to **M5.E3**. B8's cheap discoverability mitigation shipped standalone (`56593a2`); its full auto-remediation is now M5.E2's job.

| Epic | Status | Scope |
|---|---|---|
| **E1** | ✅ shipped 2026-07-16 | **Doc-runtime & memory hygiene** — canonical doc-model (FR1) + STATE/FUTURE-IDEAS eviction (FR2/FR3) + dogfood. Retro: [`M5.E1-RETROSPECTIVE.md`](M5.E1-RETROSPECTIVE.md). |
| **E2** | ✅ shipped 2026-07-18 (unreleased) | **Auto-sensing migrate command + doc-layout stamp/banner** (FR6, FR7) — *pulled forward*. `/sig:migrate-memory`: relocate-never-delete, dry-run-default, git-reversible, all 3 bloat vectors + archive-tree + FR7 stamp/hook/banner. Un-sticks live bloated projects (B8 auto-remediation; nextpass 546 KB→1.3 KB, 0 words dropped). REVIEW PASS-WITH-FIXES (3-specialist panel; SHIP-blocking rollback gap caught + fixed). ≈1071→1300 tests. Retro: [`M5.E2-RETROSPECTIVE.md`](M5.E2-RETROSPECTIVE.md). Landed on `main` unreleased — release batched with E3 (D-M5E2-6). |
| **E3** | ✅ **SHIPPED as v0.1.8** (2026-07-20, combined E1+E2+E3) | **All-docs hygiene runtime + living `BACKLOG.md` + append-log eviction** (FR4, FR5, +FR1/2/3/6) — *deferred from E2*, **folded into the release** (D-M5E2-6): the doc-runtime ships as ONE `0.1.x` = E1+E2+E3. 7 slices / 5 waves at FULL/strict. Shipped: `ISSUES-INBOX.md` rename + `--bug` (FR1), auto-`/sig:index` + D-ID map (FR3), living `BACKLOG.md` + drain classify (FR2), all-docs hygiene guard (FR4), append-log evict-with-anchors (FR5), v2→v3 migrate + born-on-v3 + Curator retired (FR6). **Signal dogfooded to v3** (DECISIONS 178 KB→33 KB, 0 dropped). Stamp-null rollout fix (existing projects converge). 1300→**1492 tests** (through SHIP). VERIFY 28/28 ACs; REVIEW PASS-WITH-FIXES (3-specialist panel, 4 Important fixed in-phase); findings B18–B23. Retro: [`M5.E3-RETROSPECTIVE.md`](M5.E3-RETROSPECTIVE.md). **Released as v0.1.8 (2026-07-20).** |
| **E4** | ✅ shipped as **v0.1.9** (2026-07-21) | **Bug & doc-runtime hygiene close-out** — 12 confirmed `BUGS.md` items cleared + FR5 concurrency-lock; 1492→1529 tests; REVIEW PASS-WITH-FIXES (evict.js false-green security bypass caught + fixed in-phase). Retro: [`M5.E4-RETROSPECTIVE.md`](M5.E4-RETROSPECTIVE.md). *(Interleaved bug-squash Epic — not doc-runtime-flagship; listed here for a complete Epic status.)* |
| **E5** | ✅ shipped as **v0.1.10** (2026-07-21) | **Carry-over bug squash** — B24/B25/B26 + B6 refinement; 1529→1561 tests; REVIEW PASS (3-specialist panel, 0 false-greens). Retro: [`M5.E5-RETROSPECTIVE.md`](M5.E5-RETROSPECTIVE.md). New carry-overs B27–B30 → M5.E6. |
| **E6** | ✅ shipped as **v0.1.11** (2026-07-25) | **Doc-runtime close-out — the maintenance-command half.** `/sig:sweep` (read-only invoking-project hygiene) + roster 17→18 + `docs/map` ship line + FR7 close-out & **B31** (add-vs-drain cross-lock) + cleared the four M5.E5 carry-overs (B27/B28 flag-not-abort, B29 `_afterRead` guard, B30 retro-gate timing). **Finishes the doc-runtime so its self-maintenance is locked before the re-audit (BR-8).** 1561→1623 tests; VERIFY PASS (strict, mutation proof-of-fail); REVIEW PASS (3-specialist panel, 0 false-greens). Retro: [`M5.E6-RETROSPECTIVE.md`](M5.E6-RETROSPECTIVE.md). Decisions D-M5E6-1…5; new carry-overs B32–B36 → `needs-triage` (incl. **B36** — the FR1 gate's own stale-row skip, surfaced dogfooding this SHIP). |
| **E7** | ✅ shipped 2026-07-26 (**no version cut — no code**) | **The v2 direction audit (BR-8).** Deliverable is a decision: [`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md) — **45 candidates verbed (11 builds / 16 continue / 19 abandon)**, sequenced **M5.E8–M5.E12** and landed in [`BACKLOG.md`](BACKLOG.md) with triggers + first slices (the enforcement half — D-M5E7-8b). Ran under Signal's **first Epic-scoped PROFILE** (`M5.E7-PROFILE.md` — *"strict thinking, zero test theater"*). **Headline: Signal cannot detect whether its own interventions work** — no test asserts a prompt instruction was obeyed, against 7-of-12 adherence and a 7.12× output spread on byte-identical code; **M5.E8 is unconditional-next.** **Not one straight port survived** — COMPOUND cut on a falsified premise, `<HARD-GATE>` cut because it isn't a mechanism (**C3**), and **C6** found a locked decision resting on a ~4.5×-wrong date. Suite unchanged at **1623** (correctly — no code). VERIFY PASS (30 ACs, 22 re-derived); REVIEW **PASS-WITH-FIXES** (repurposed per AC7.4 to attack the reasoning — cut §6.1's self-defence from three arguments to one, dated the falsifier, caught **B41**). Retro: [`M5.E7-RETROSPECTIVE.md`](M5.E7-RETROSPECTIVE.md). Decisions D-M5E7-1…12; **§ "Candidate v2 feature-port scope" below is SUPERSEDED by this Epic.** New carry-over **B41** (P2) → M5.E9. |
| **E9** | ✅ shipped as **v0.1.12** (2026-07-27) — **ran ahead of E8** (D-M5E9-2) | **Linear mode can ship; the phase ledger becomes an honest log.** Closed `B41`–`B45` — all four of the originating bugs reported from **outside** Signal's own use, not found by its suite. **`B42` (P1):** a project with no Epics could not run `/sig:ship` **at all** — live since v0.1.3 across nine releases, invisible because Signal-on-Signal has been Epic-mode since M4.5.E11. Retro gate is now **Epic-only** (D-M5E9-1). **`B43`/`B44`/`B45`:** three defects stacked in `state.js:388-395` — a SHIP date was unrecordable (SHIP is terminal), set semantics collapsed a multi-run ledger silently, and unvalidated entries became permanent phantom phases. **`B41`:** the four middle commands now transition at entry. **`[BREAKING]`** `completed_phases` is an append-only log of the current run that **trims** (linear → `STATE-HISTORY.md`; Epic → archive on roll, before the reset). 1623 → **1652 tests**; proof-of-fail by baseline replay (**16 of 22 new tests fail on the pre-Epic code**). REVIEW **PASS-WITH-FIXES** — 1 **Critical fixed in-phase**: the new sweep check told *every healthy project* its history had been destroyed; removed rather than re-tuned, because a past collapse **is not detectable from the file**. New: `B46`, `B47`. Decisions D-M5E9-1…7. Retro: [`M5.E9-RETROSPECTIVE.md`](M5.E9-RETROSPECTIVE.md). |
| **E13** | ✅ shipped as **v0.1.14** (2026-07-30) — **ran ahead of E10–E12** (D-M5E13-1; ID-is-identity makes out-of-order legal) | **Guards that don't guard.** Four defects, one shape: *something was built to catch a mistake and does not catch it.* Closed `B48` (the phase-entry instruction was **unconditional**, and an agent **correctly refused it** — fixed in both the text and the code beneath it, D-M5E13-4), `B53` (a non-strict `current_epic` split artifact **write**-naming from **read**-resolution; the resolver's first candidate is now `artifactName`'s own output, making `epic-native-flow.md`'s guarantee true **by construction**), `B39` (a watchlist nothing walked — **run for the first time: 11 rows, all unevaluated, two already fired**), `B36` (the retro gate's stale-row skip is now loud), `B49`-remainder + `B51` + `I2`. **New `B54` found at PLAN:** `checkGateArtifacts` was the class's **fourth** instance and the only one **wrong if wired up** — executed against Signal it returned `missing:['REQUIREMENTS.md']`, so switching it on would have blocked PLAN for every Epic-mode project; **deleted**. 1736 → **1806 tests**; **CI added** (Signal had none — its first run caught a latent git-history dependency). VERIFY **20/21** — AC2.2 documented NOT MET, because `B46`'s premise does not survive measurement (**0 of 48** inbox candidates map to any disposition row). REVIEW **PASS-WITH-FIXES** — 1 Critical + 1 Important, **both re-creations of this Epic's own defect classes one layer down**: an unconditional guard replacing an unconditional instruction, and two implementations of one rule under a comment denying it. **Headline finding: the adherence control arm was never isolated across files** (`B55`) — v0.1.13's `OBEYED` was clean by luck, not construction; the re-run returned **INDETERMINATE** and was deliberately not re-rolled. Decisions D-M5E13-1…8. Retro: [`M5.E13-RETROSPECTIVE.md`](M5.E13-RETROSPECTIVE.md). Carry-overs → **M5.E15** (`B55`), **M5.E16** (the class's document- and data-shaped halves). |
| **E8** | ✅ shipped as **v0.1.13** (2026-07-28) | **The measurement foundation.** Signal can now measure whether one of its own instructions changes what an agent does. **The ceiling, published first (FR5):** of **407 directive lines** across 18 `commands/*.md`, **91 (22.4%) are trace-measurable, 316 (77.6%) are not** — and the log states the remainder is *unmeasured, not passing*, pinned by a wording test. This **corrects R1's estimate** (22/202 = 10.9%) and **falsifies its inference** that `execute`/`verify`/`review`/`calibrate` name zero library calls — they name **4/3/3/0**, including this Epic's own canary. **The verdict:** `B41-phase-entry` → **3/3 as-written, 0/3 deleted, OBEYED** — ***this verdict was withdrawn and later re-earned; see the note*** (added 2026-08-09, backlog-review finding `S4`): `M5.E13` found the control arm was never isolated across files (`B55`), and the re-run returned **`INDETERMINATE`**, so *this* run's `OBEYED` was clean by luck rather than by construction. `M5.E15` (v0.1.19) rebuilt the control arm and **re-ran `B41-phase-entry` to `OBEYED` for real** — treatment 3/3, control 0/3, seam PASS. **The conclusion below stands; the provenance does not** — the standing verdict belongs to `M5.E15`'s run, not this one. The retraction is placed on this line deliberately, because a correction three paragraphs away leaves the claim's own line reading as live to a `grep` (`M5.E10`'s correction-protocol corollary). M5.E9's phase-entry fix works; it shipped unverified in v0.1.12 and is the first thing the harness measured. **Every defect found was in the instrument, and each produced a plausible result rather than an error** — an unreachable fixture (`ABSENT`), a broken seam, a control arm that deleted one line from a section restating the instruction three more times (near-miss `INERT`), and a commit captured post-run that defeated `--combine`'s pairing guard. The near-miss `INERT` is the one that matters: **the plan had pre-authorised `inert` in writing** so a null result would not be tuned away, and that guardrail is exactly what would have carried a broken control into the published log. 1652 → **1736 tests**. VERIFY PASS (28 ACs). REVIEW **PASS-WITH-FIXES** (1 Critical, 3 Important, all fixed in-phase; the four-verdict impostor analysis is the artifact worth re-reading). New: **`B48`** (P2, live in v0.1.12 — an agent *correctly refuses* an unconditional Signal instruction), **`B49`** (P3, fixed here). Decisions D-M5E8-1…6. Retro: [`M5.E8-RETROSPECTIVE.md`](M5.E8-RETROSPECTIVE.md). |
| **E17** | ✅ shipped as **v0.1.15** (2026-08-01) — **ran ahead of E10–E12, E14–E16** | **Instructions that contradict other instructions.** Three Signal instructions disagreed with another Signal instruction, or with ratified practice; nothing compares one instruction against another, so two documents can give an agent conflicting orders indefinitely and only a live run reveals it. Fixed: **`ship.md` referenced a commit that no step created** (four steps staged "into the SHIP commit"; `markFresh` sat at §5.3 ahead of all four, so it stamped a pre-commit HEAD **by construction** — observed live during M5.E13's own ship); **`verify.md`/`review.md` stated no `markFresh` ordering at all** (silent, so the agent picks); **`review.md`'s verdict table contradicted two shipped Epics** (*"FAIL \| Any Critical"* in three places while M5.E9 and M5.E13 both shipped PASS-WITH-FIXES with a Critical closed in-phase — the rule was miscalibrated, not the practice, **D-M5E17-1**). Added: **`plan.md` now schedules first-use in wave 1** — *"shipped but never run"* is Signal's best defect predictor (`B54`, `B39`, `B42`/`B53`, `B48`, `B55` all surfaced on a first execution, all late). **`ship.md`'s direct-to-main self-exemption removed** — it was written 2026-05-26 and **thirteen releases shipped under it with exactly one PR in that span**; the gate now lives in a GitHub ruleset (`D-M5E17-4`, `D-M5E17-5`). 1806 → **1822 tests**. **Two of this Epic's own ACs were satisfiable by a no-op and were re-executed in corrected forms** — recorded openly. New `B56` (P3). Deferred: the 48-entry inbox triage → **M5.E14** (`D-M5E17-3`). Decisions D-M5E17-1…5. Retro: [`M5.E17-RETROSPECTIVE.md`](M5.E17-RETROSPECTIVE.md) — **backfilled 2026-08-03 from commit messages, the CHANGELOG and `B71`, not written at close**; `/sig:ship` was never invoked for this Epic and no `PROGRESS`/`VERIFICATION`/`REVIEW` exists. See the note below the table. |
| **E16** | ✅ shipped as **v0.1.16** (2026-08-02) | **STATE-vs-world drift detection.** `/sig:sweep` gains six deterministic checks comparing what a project's `.planning/` **asserts** against what is on disk and in git; each declares whether it **needs a person** or **clears itself**, and the report distinguishes **"checked and clean"** from **"could not check."** *That distinction is the release:* measured across **13 real projects**, the two checks aimed at the originating incident can evaluate **2 of them** — Signal's hand-maintained, Epic-mode, `schema_version: 1` shape is the **minority** shape (4 of 12 Epic-mode; 7 of 12 with a canonical `phase`; `readState` **throws** on one). Also shipped: **`INDEX.md` regenerates at every phase transition** (was: ship only) and **`/sig:update`** (installed vs. available **plus the CHANGELOG delta** — the half `/plugin` cannot show you); roster **18 → 19 commands**. 1836 → **1938 tests**. **Two defects found in the Epic's own work, both by reading documents against each other:** **`B59`** — `M5.E16-PROFILE.md` carried **two** out-of-enum values, so `readEffectiveProfile` threw and **the Epic declaring FEATURE ran its whole DISCUSS at the project's FULL**, caught at its own PLAN preamble the first time any code read the file; and at REVIEW, **check `(c)` reported "clean" on a project it could not see** (`traction-engine`: 19 phase artifacts, 0 retrospectives). **REVIEW returned FAIL and the Epic looped back to EXECUTE** rather than take the small-diff exit `D-M5E17-1` warns about — and check `(a)` then fired in the field for the first time, *caused by that loop-back*. Decisions D-M5E16-1…5. Retro: [`M5.E16-RETROSPECTIVE.md`](M5.E16-RETROSPECTIVE.md). |
| **E18** | ✅ shipped as **v0.1.18** (2026-08-04) | **The archive half, for the projects Epic-gating does not reach.** Both archive paths are Epic-gated **by construction** (`planArchiveMoves` filters through `EPIC_ID_STRICT_RE`; `deriveEpicArchiveDir` **throws** on a non-strict ID), so the halves that stop `.planning/` growing forever reach **4 of 12** readable projects. DISCUSS walked three real trees rather than quoting the backlog, and two findings reshaped the scope: **there is no single "prefix" to read** (nextpass has **10+ unit names**, some beginning with the word `PLAN`, so a declared-prefix field cannot express the shape), and **the retro requirement, not the prefix, is the harder blocker** (**none of the three projects has a single retrospective file**, so closure-by-retro returns *nothing is closed* everywhere). Confirmed by execution: `traction-engine` carries `current_epic: PHASE12` while `detectMode` reports **linear**, so a not-current guard routed through any strict-gated helper receives `null`, **silently never fires**, and the unit being edited today becomes archivable — `B53`'s seam one field over. Requirements: [`M5.E18-REQUIREMENTS.md`](M5.E18-REQUIREMENTS.md) (FR1–FR6). Decisions D-M5E18-1…5. `B70` shipped **fix-lane** ahead of the build work. | **Shipped end-to-end: `/sig:migrate-memory` went from archiving 67 files across 1 of 12 real projects — all 67 Signal's own — to **114 across 6**.** `traction-engine` 0 → 26. Seven slices: units derived from filenames (`work-units.js`), verdicts read as values (`verdict.js`), **three-outcome closure** (`closure.js` — `cannotDetermine` is a value, not a rendering decision), a stub retro is not closure, a non-Epic unit archives to `.planning/archive/{unit}/` (path-confined, 12 adversarial fixtures), and four statuses so `0` stops meaning both *could not look* and *checked and clean* (`B63`). **The closed-set is a UNION, measured in both directions:** retro-only sees 67 and is blind to 8 projects; verdict-only sees 110 but **loses 4** (`M5.E17` has a retro and no VERIFICATION, so the verdict rule reads a shipped Epic as running); either counts → 114, nothing lost. A **stub retro vetoes** closure regardless of verdict, or the union silently undoes `B64`. **S5 was planned as 2 sites and shipped as 5** — the sibling sweep, run FIRST rather than last, found `isStubRetro` had existed since M4.5.E9 and was consumed in **exactly one place**; every caller making a *decision* threw it away, including `checkEpicWithoutRetro`, **the check M5.E16 shipped eight days earlier to catch this**. **REVIEW returned FAIL** (a 112-LOC in-phase fix against a ≤ 50 cap — the *"71 are deletions"* argument rejected on the record) and the Epic looped back; the second VERIFY then found `AC4.5`'s half unreachable. **Three separate "correct library code, no command path" gaps, none caught by the same mechanism twice** — the Epic's most useful finding about itself. 1994 → **2168 tests**. Decisions D-M5E18-1…6. Bugs closed: `B64`, `B70`, `B72`, `B78`. Retro: [`M5.E18-RETROSPECTIVE.md`](M5.E18-RETROSPECTIVE.md). |

> **✅ `M5.E17`'s retrospective was backfilled 2026-08-03** —
> [`M5.E17-RETROSPECTIVE.md`](M5.E17-RETROSPECTIVE.md). **This reverses the decision recorded
> earlier the same day, and the reversal is recorded rather than overwritten**, because the original
> reasoning was sound about `.planning/` and wrong about the project.
>
> **The original position, kept verbatim:** flagged by `/sig:sweep`'s `epic-without-retro` check —
> its **first fire in normal use**, and the check working as designed. Deliberately **not**
> backfilled: M5.E17 has `PLAN`, `REQUIREMENTS`, `RESEARCH` and `VALIDATION` on disk but **no
> `PROGRESS`, `VERIFICATION` or `REVIEW`** — the artifacts that record the *running* are the missing
> ones, so any retro written now would be prose about what an Epic learned, composed from documents
> written before it executed. That is
> [`CLAIM-INTEGRITY-ANALYSIS.md`](../analysis/CLAIM-INTEGRITY-ANALYSIS.md)'s defect exactly —
> *a completeness claim written from the shape of the work rather than from the artifact* — and it
> would silence the detector by manufacturing the thing it asked for.
>
> **Why it was reversed (Brett, 2026-08-03).** That reasoning treats `.planning/` as the only place
> the running was recorded. It was not. `137b9ca`'s commit message was written **at execute time**
> and carries most of what a `PROGRESS` file would: the two ACs found satisfiable by a no-op and
> re-executed in corrected forms, the red baseline measured (AC3.1′ 3/5, AC2.1′ 3/3), the error
> found *in the probe itself*, and the audit landing at five call sites where FR3.2 predicted three.
> Add the `[0.1.15]` CHANGELOG entry written at ship and `B71`'s reconstruction from git, and the
> result is **derived from artifacts that name themselves** — which is the property that separates
> derivation from manufacture. The backfill states its sources inline, states which phases produced
> nothing, and states that it was written two days late. A retro that says *"VERIFY left no artifact,
> so this file cannot tell you whether it ran"* is not the defect the original note feared; it is the
> opposite of it.
>
> **What has not changed:** `B71` — the gate could not have fired for this Epic's shape regardless —
> is still open and still homed at M5.E18 (open question 3). **Writing the record does not fix the
> mechanism**, and the backfill is not evidence that it was. Also unchanged:
> `tools/backfill-retros.js` is **not** the instrument (it is a one-shot scoped to M4.5 and its
> dry-run plans writes over 11 existing retros).

> **E9 runs before E8 — deliberate, not drift (D-M5E9-2, 2026-07-27).** `## Vocabulary` in
> [`PROJECT.md`](PROJECT.md) locks **ID-as-identity** and names this exact case (*"M4.t13 might ship
> after M4.t17"*). A **P1** that fully blocks a documented mode on a live project outranks a research
> Epic; **E8 keeps its ID and its slot immediately behind v0.1.12.**

> **Re-audit now follows E1–E6 (2026-07-22)** — *historical: the re-audit ran as **E7** and closed 2026-07-26; see the row above and [`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md).* The BR-8 "opening move" note below predates the doc-runtime override + the E4/E5 bug-squashes + the E6 close-out. The landscape re-audit is no longer M5's *first* Epic — it runs **after** M5.E6 finishes the doc-runtime — and still gates only the *speculative* v2 feature ports. Read the status table above for actual sequence.

**Release prep — ✅ DONE: the combined E1+E2+E3 doc-runtime shipped as v0.1.8 (2026-07-20).** Tag `v0.1.8` → release commit `b9fc456`; `plugin.json`/`marketplace.json` bumped + sha-pinned; CHANGELOG folded under `[0.1.8]`; README command-reference + CLAUDE.md refreshed; GitHub release live (Latest). All items below resolved:
- ~~(1) bump the **"N slash commands" count**~~ **✅ DONE (M5.E3 FR4/S3.t1 + S6b)** — the reconcile-before-guard fixed every current prose count against `roster.js`. **Note: the target was 15 → 17, not 16** — E3 added `/sig:index` (FR3) on top of E2's `/sig:migrate-memory`, so the roster is now **17 commands / 26 agents / 21 skills**. `CLAUDE.md:70` + `docs/map` reconciled; the FR4 hygiene guard enforces it on `main`.
- **(2) STILL OPEN — README § Command reference prose:** the README's command *list* still enumerates 15 commands (S3.t1 reconciled *counts*, not the prose roster). **Both `/sig:migrate-memory` AND `/sig:index` must be added to the README command reference before the tag** — prose authoring, out of FR4's count-reconcile scope (flagged in `M5.E3-PROGRESS.md`).
- **(3) tag-time:** bump `plugin.json` + tag + `marketplace.json` per the version rubric (the FR4 version-check skips `[Unreleased]`, green through the unreleased window, asserts once the tag cuts).
- **(4) tag-time:** fold the CHANGELOG `[Unreleased]` doc-runtime block under the cut version heading.
- **(5) doc-accuracy sweep (flagged during E3):** `CLAUDE.md` predates M5 (says M4.5 tester criterion "remains open" — MILESTONE-4.5.md says closed 2026-07-15; lists E1–E10 not E11; no M5). A CLAUDE.md refresh belongs to the release cut.

**M5.E3 DISCUSS pre-decisions (locked 2026-07-16, before the pivot — carry into E3's DISCUSS):**
1. **`INDEX.md` → fully auto-generated** by a Signal-native `/sig:index` generator; hand-curation retired (reverses the `curator-dormant-on-signal-planning` hand-curated stance — that memory + a DECISIONS entry get updated *when E3 implements it*, not before). One-line notes derived from each file (mechanism = E3 PLAN).
2. **Cleanup scan runs inside the test suite** (dead links / `[FILL IN]` stubs / roster+count drift across `docs/`, `README`, `CLAUDE.md`, `analysis/`); no new command — the `/sig:sweep` name stays reserved. Structural drift = hard test failure; soft findings = reported.
3. **Living `BACKLOG.md` = full switch:** build it as the single sequenced roadmap, migrate `BACKLOG-REVIEW-2026-07-04.md`'s content in, archive that snapshot with a pointer (move-never-delete). `FUTURE-IDEAS.md` stays the raw inbox.

## Candidate v2 feature-port scope — **✅ SUPERSEDED 2026-07-26 by the M5.E7 re-audit**

> **Read [`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md) instead. The
> checkboxes below are history.**
>
> The re-audit this section was waiting on **ran and closed** (Epic **M5.E7**, 2026-07-25→26). All
> 23 items below now carry a **`build` / `abandon` / `continue` verb** with a rationale
> (`.planning/M5.E7-DISPOSITIONS.md`), and the surviving work is sequenced as **M5.E8–M5.E12** and
> **landed in [`BACKLOG.md`](BACKLOG.md)** with triggers and first slices.
>
> **Headline: not one straight port survives.** The COMPOUND group is cut entirely (its premise was
> falsified — the knowledge was in-context at the moment of every miss), gstack's `/cso` replacement
> is cut on threat-model fit, `<HARD-GATE>` is cut because **it does not exist as a mechanism**
> (correction **C3**), pm-skills GTM and product discovery are cut on product fit, and the Cursor
> adapter is cut on demand.
>
> **These 25 checkboxes have never had one checked** — a fact the audit cites as its own evidence
> that a roadmap enforced by nothing does not get executed (D-M5E7-8b). They are **left unchecked
> and unedited on purpose**: editing them would erase that evidence. **Do not work from this list.**

*Pre-override labels retained for continuity only; the `M5.E1–E6` numbers below no longer bind (see the status table + override note above).*

### Upstream phases — IDEATE / VALIDATE / STRATEGIZE

From pm-skills + gstack + oh-my-claudecode.
- [ ] Port `/discover` workflow from pm-skills → split into `/sig:ideate` + `/sig:validate`
- [ ] Port `/strategy` workflow from pm-skills → `/sig:strategize`
- [ ] Port assumption-mapping (Impact × Risk) and Opportunity Solution Trees from pm-skills
- [ ] Port `/office-hours` reframing from gstack → integrate into `/sig:ideate`
- [ ] Port `deep-interview` with 20% ambiguity gate from oh-my-claudecode → integrate into `/sig:spec` (possibly renamed from `/sig:discuss`)
- [ ] Update tier-gating: these phases skip entirely in SKETCH, may skip in FEATURE

### COMPOUND phase (memory layer)

From compound-engineering + gstack.
- [ ] Port `/sig:compound` from compound-engineering's Compound phase
- [ ] Port `learnings-researcher` + `session-historian` agents
- [ ] Port `/retro` + `/learn` from gstack (weekly reflection + JSONL learning log)
- [ ] Integrate with `.planning/` so learnings carry forward between projects

### Security upgrade

- [ ] Replace Agent Skills' `security-and-hardening` skill with gstack's 15-phase `/cso` audit
- [ ] Verify full license attribution in `LICENSES.md`
- [ ] Update `/sig:review` to reference the new skill

### TDD & gate upgrades

From superpowers.
- [ ] Replace Agent Skills' TDD with superpowers' harder version (deletes pre-test code)
- [ ] Port `<HARD-GATE>` tag mechanism as an enforcement module that actually blocks progression
- [ ] Port `systematic-debugging` 4-phase skill
- [ ] Adopt superpowers' anti-rationalization table format across all existing phase gates

### Context discipline hooks

From planning-with-files.
- [ ] Graft the 2-Action Rule into the executor agent
- [ ] Add hook-driven `PROFILE.md` re-read on `PostToolUse` to prevent drift
- [ ] Implement findings-quarantine pattern for untrusted external data (web fetch, API responses)

### Multi-runtime adapters

- [ ] Cursor adapter layer
- [ ] Codex adapter layer
- [ ] Study superpowers' cross-platform session-start hook as reference

> **Effort read (2026-07-19):** Checked current Codex CLI docs — the Codex-adapter line item is no longer "build missing infrastructure." Codex now ships direct analogs for most of what Signal needs: `AGENTS.md` (≈ `CLAUDE.md`), Skills with `SKILL.md` + on-demand loading (≈ Signal's 21 skills), subagents with `sandbox_mode`/`mcp_servers`/`skills.config` (≈ Signal's 26 per-agent tool allowlists), and a hooks framework (flagged `codex_hooks`, newer/less proven than Claude Code's). Real gaps remain: Codex's Custom Prompts (the `/sig:*`-command analog) are deprecated in favor of skills, so the 17 commands need re-casting as skills rather than a straight port, and there's no `AskUserQuestion` equivalent (markdown fallback already anticipated in `references/question-patterns.md`). Rough call: ~6/10 effort — real multi-week translation plus end-to-end testing of the wave-based orchestration on the actual runtime, not the ~9/10 "reimplement missing primitives" job the framing above implied. Doesn't change sequencing — still gated behind the re-audit (BR-8) — just corrects the cost estimate for whenever it's picked up. Cursor's current capability set is unverified; re-check before estimating that line the same way.

---

## Exit Criteria

When the 10-phase architecture from `SIGNAL-INTEGRATION-RUNDOWN.md` is functional end-to-end on real projects.

## Notes

- **v2 must not break v1 for existing users.** Every change feature-flagged or opt-in until proven.
- **Attribution discipline:** each port adds the source repo's full license text to `LICENSES.md` per the "Planned Integrations (v2)" section. Move entries from "Planned" to "Ported" tier when work lands.
- **Re-evaluate priority.** Don't assume Epics ship in M5.E1 → M5.E6 order. Order should follow real user pain points from v1 usage.

## Captured via /sig:add

### Doc-lifecycle / eviction discipline — the

**Captured:** 2026-07-13 via `/sig:add`.

Doc-lifecycle / eviction discipline — the shared root of BOTH the STATE.md bloat and the FUTURE-IDEAS bloat. Both files grow without bound because content never LEAVES them; splitting docs by topic won't fix that, eviction will. One Sprint-3 (memory & doc-runtime) design, three parts: (1) Inbox->Backlog->Milestone lifecycle — a living BACKLOG.md (groomed, sequenced) that supersedes the dated BACKLOG-REVIEW-2026-07-04 snapshot; FUTURE-IDEAS stays the raw inbox; hygiene-vs-roadmap becomes a tag inside the backlog, not a new file. (2) Eviction step — shipped/promoted entries must EXIT FUTURE-IDEAS (fixes the ~42-candidate drain non-convergence documented in "Drain disposition-detector misses blockquote promotions", and the stale "✓ SHIPPED" entry still sitting inline at ~line 500). (3) STATE.md — the write-hook guardrail + evict-on-close already fully specced at "STATE.md append-without-evict" (HIGH PRIORITY); note that E10 shipped WITHOUT it, so it is now homeless. Timing: pull the STATE write-hook guardrail forward to a small v0.1.6 trust patch (it prevents the 455KB CMMC-dogfood failure at write time, and testers will run /sig:resume day one); the fuller lifecycle redesign belongs in Sprint 3 (gated on M5 usage signal). Also route bug-flavored "hygiene" items (drain blockquote, footer drift, /sig:add derived-title) to BUGS.md, which sits at 0 open and is underused — not to FUTURE-IDEAS. This entry deliberately consolidates and points back to existing entries rather than re-describing them, to avoid adding to the pile it is about.
