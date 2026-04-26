# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

---

## `{phase}-` artifact naming convention — multi-phase semantics in a single-phase v1

**Surfaced by:** Tranche 2 Step 8 paper walkthrough (2026-04-25).

PLAN/EXECUTE/VERIFY/REVIEW commands all write artifacts with a `{phase}-` prefix (e.g., `{phase}-PLAN.md`, `{phase}-RESEARCH.md`, `{phase}-VALIDATION.md`, `{phase}-PROGRESS.md`, `{phase}-VERIFICATION.md`, `{phase}-REVIEW.md`). This implies multi-phase semantics (a project has phase 1, phase 2, etc.) — inherited from GSD's pattern of multi-phase project work.

But Signal v1's framing (per `CONTEXT.md`) is "one project = one linear flow" — there isn't a "phase 1" because there isn't a "phase 2." The `{phase}-` prefix is vestigial.

Two paths:
- **Embrace multi-phase explicitly.** Tie the naming to the multi-feature project lifecycle question already in `FUTURE-IDEAS.md`. A "phase" becomes a feature increment.
- **Simplify naming for v1.** Drop the prefix — files become `PLAN.md`, `RESEARCH.md`, `VALIDATION.md`, etc.

**Resolve by:** Tranche 3 dogfood — first real run will surface whether `{phase}-` is helpful or noise.

---

## REVIEW and SHIP could read prior-phase artifacts more explicitly

**Surfaced by:** Tranche 2 Step 8 paper walkthrough (2026-04-25).

REVIEW writes `{phase}-REVIEW.md` based on the codebase but doesn't explicitly read `{phase}-VERIFICATION.md` (VERIFY's output). SHIP's pre-ship checklist mentions "Review report issues resolved" but doesn't explicitly instruct reading `{phase}-REVIEW.md`.

Currently, Claude infers what to do — usually correctly. Risk: in a long session or with context degradation, the inference might miss critical findings.

**Candidate fix:** Add explicit "Load prior-phase artifacts" steps to REVIEW (read VERIFICATION.md) and SHIP (read REVIEW.md). Mirror DISCUSS's "Load Prior Context" pattern.

**Resolve by:** Tranche 3 dogfood — observe whether implicit inference holds in real runs. If Claude misses Review findings in SHIP, the explicit-read pattern becomes a fix-now.

---

## state.js `initState` writes DISCUSS; `/sig:new-project` writes CALIBRATE

**Surfaced by:** Tranche 2 Step 8 paper walkthrough (2026-04-25); reinforced by Tranche 3 Task 1 dogfood (2026-04-26).

`tools/lib/state.js` `initState(baseDir)` initializes STATE.md with `Current Phase: DISCUSS`. But `/sig:new-project.md` Step 1 says to initialize STATE.md with `Current Phase: CALIBRATE` (because Phase 0 should run next).

If `initState` is called directly from tooling (not via the slash command), STATE.md gets the wrong initial phase. Minor — only matters when bypassing the command — but it's a discrepancy.

**Candidate fix:** Update `initState` default to `CALIBRATE`, OR accept a `phase` parameter so the caller chooses.

**Resolve by:** Trivial; can be done in any session that touches state.js.

---

## `/sig:calibrate` doesn't initialize STATE.md (init gap between Phase 0 and Phase 1)

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

`/sig:calibrate` writes `.planning/PROFILE.md` but not `.planning/STATE.md`. `/sig:discuss` Step 1 expects STATE.md to exist. On a clean post-calibrate path, STATE.md is missing — `/sig:discuss` continues gracefully (Step 1 doesn't halt), but `transitionPhase` later fails because there's no state to transition.

**Candidate fix:** add a final step to `/sig:calibrate` that calls `initState(baseDir, 'DISCUSS')` after writing PROFILE.md. Or: `/sig:discuss` Step 1 calls `initState` if STATE.md is absent. The first option is cleaner — the calibration phase produces both artifacts the workflow expects.

**Resolve by:** small fix in `/sig:calibrate.md` Step 5 or Step 6. Couples to the `initState` phase-default question above (if both fix together, can hardcode the right initial phase).

---

## Calibrate Scenario B and `checkGateArtifacts` PLAN gate require `.planning/PROJECT.md`

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

Two places assume PROJECT.md lives at `.planning/PROJECT.md`:
- `/sig:calibrate.md` Scenario B (line 26): "`.planning/PROJECT.md` exists, no `PROFILE.md`" → happy path.
- `tools/lib/state.js` `checkGateArtifacts(baseDir, 'PLAN')` (line 124): requires `PROJECT.md` to exist in `.planning/`.

But the Signal-build's own `PROJECT.md` lives at repo root (legacy from before `.planning/` was introduced). The dogfood worked around this by symlinking `.planning/PROJECT.md → ../PROJECT.md`.

**Two fix paths:**
- **Move Signal's own PROJECT.md to `.planning/PROJECT.md`** so the convention applies uniformly. Symlink at repo root for backward refs.
- **Make calibrate + checkGateArtifacts also check repo root** as a fallback. More code, but accommodates self-managed projects that drifted.

**Resolve by:** Tranche 3 Task 4 (README work) is a natural seam — moving PROJECT.md is a small refactor and the README will reference the new path anyway.

---

## `review_depth: quality-only` supersedes `security_audit` / `performance_pass` / `simplification_pass`

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

In `review.md` Section 0's override table, `review_depth: quality-only` says "Skip Steps 2 (security), 3 (performance), 4 (simplification)" — but the table also lists `security_audit`, `performance_pass`, `simplification_pass` as separate overrides with their own effects. FEATURE tier sets `review_depth: quality-only` but ALSO sets `security_audit: basic`, `performance_pass: true`, `simplification_pass: true` — which wins?

The current behavior (per the table's prose) is that `review_depth` wins: when it's `quality-only`, the other flags are ignored. That's a precedence rule that isn't explicit in the table.

**Candidate fix:** Add a one-line precedence note above the rigor table in `review.md`: *"`review_depth` is the master switch — `none` skips REVIEW entirely, `quality-only` skips Steps 2/3/4, `full` runs all four. The other rigor flags (`security_audit`, `performance_pass`, `simplification_pass`) only matter when `review_depth: full`."*

**Resolve by:** Tranche 3 triage; one-line edit.

---

## `transitionPhase` doesn't dedupe completed phases

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

If `transitionPhase` is called after `state.completedPhases` was edited by hand (or by an earlier transition that wasn't undone), it appends — producing duplicate entries (`VERIFY` listed twice, etc). Minor in the happy path; bites in recovery scenarios.

**Candidate fix:** in `state.js#transitionPhase` line 88, dedupe `completed` by phase name (keep latest timestamp): `Array.from(new Map(completed.map(p => [p.split(' ')[0], p])).values())`.

**Resolve by:** Trivial; bundled with the other state.js fix above.

---

## Tier count: validate 4 tiers against real calibration

Schema is locked at 4 tiers (SKETCH / FEATURE / SPIKE / FULL) per DECISIONS.md. The design note in `references/tier-definitions.md` explains why, but this is a judgment call that can only be validated by calibrating real projects.

Watch for:
- **Too-coarse signal:** if real projects keep landing between SKETCH and FEATURE (e.g., "this is more than SKETCH but I'm uncomfortable calling it FEATURE"), we may need a 5th tier.
- **Redundant tiers:** if SPIKE and SKETCH feel interchangeable in practice, we may consolidate.
- **Missing dimensions:** if Scope / Stakes / Novelty / Reversibility / Horizon don't capture some real project quality (e.g., team size, deadline pressure), the diagnostic questions may need to evolve.

**Resolve by:** Tranche 3 (real-project calibration runs). Likely outcome: confirmed as-is, with minor override-key tweaks.

---

## Historical docs: annotate or archive?

`GSD-AgentSkills-Combination-Analysis.md` predates the broader landscape analysis. Options:
- Add a one-line "superseded by `analysis/` docs" header at the top.
- Move to an `archive/` folder.
- Leave as-is; the Reference Repositories table now flags it as "Historical."

**Resolve by:** Low priority; decide in Tranche 3 docs work.

---

## Testing strategy for Signal itself

Currently: 3 vitest files (`state.test.js`, `context-monitor.test.js`, `profile.test.js`) — 53 tests covering tooling helpers. No tests for slash commands (they're markdown interpreted by Claude — how would you test their behavior?). No integration tests yet.

- Should slash command behavior be testable? How (simulated runs against fixture projects, golden-output diffs, prompt-replay harness)?
- Is Nyquist-compliance something Signal enforces on its own codebase, dogfood-style?

**Resolve by:** Tranche 3 dogfood. Likely outcome: a fixture-based command-execution test harness lands as part of (or after) the FULL-tier and SKETCH-tier passes.

---
