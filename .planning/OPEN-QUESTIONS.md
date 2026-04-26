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

**Surfaced by:** Tranche 2 Step 8 paper walkthrough (2026-04-25).

`tools/lib/state.js` `initState(baseDir)` initializes STATE.md with `Current Phase: DISCUSS`. But `/sig:new-project.md` Step 1 says to initialize STATE.md with `Current Phase: CALIBRATE` (because Phase 0 should run next).

If `initState` is called directly from tooling (not via the slash command), STATE.md gets the wrong initial phase. Minor — only matters when bypassing the command — but it's a discrepancy.

**Candidate fix:** Update `initState` default to `CALIBRATE`, OR accept a `phase` parameter so the caller chooses.

**Resolve by:** Trivial; can be done in any session that touches state.js.

---

## Tier count: validate 4 tiers against real calibration

Schema is locked at 4 tiers (SKETCH / FEATURE / SPIKE / FULL) per DECISIONS.md. The design note in `references/tier-definitions.md` explains why, but this is a judgment call that can only be validated by calibrating real projects.

Watch for:
- **Too-coarse signal:** if real projects keep landing between SKETCH and FEATURE (e.g., "this is more than SKETCH but I'm uncomfortable calling it FEATURE"), we may need a 5th tier.
- **Redundant tiers:** if SPIKE and SKETCH feel interchangeable in practice, we may consolidate.
- **Missing dimensions:** if Scope / Stakes / Novelty / Reversibility / Horizon don't capture some real project quality (e.g., team size, deadline pressure), the diagnostic questions may need to evolve.

**Resolve by:** Tranche 3 (real-project calibration runs). Likely outcome: confirmed as-is, with minor override-key tweaks.

---

## Plugin manifest: what does Claude Code auto-discover?

`plugin.json` only declares `commands`. Need to know:
- Does Claude Code auto-load `agents/` from plugin root?
- Same for `skills/` / `hooks/` / `references/`?
- If yes, no manifest changes needed. If no, need to declare paths.

Reference: check Claude Code plugin docs and the GSD plugin manifest for how it handles this.

**Resolve by:** Tranche 1, Step 2.

---

## Dogfood target feature for Tranche 3

**Resolved 2026-04-23:** `/sig:status` and `/sig:resume` are now committed Tranche 3 deliverables (see `TRANCHE-3.md` Task 1), not candidates. Decision: build one via Signal (likely `/sig:status`, the simpler read-only command), hand-roll the other to avoid a chicken-and-egg loop.

Remaining sub-question: which do we build via Signal vs. hand-roll? Resolve at Tranche 3 kickoff.

---

## Historical docs: annotate or archive?

`GSD-AgentSkills-Combination-Analysis.md` predates the broader landscape analysis. Options:
- Add a one-line "superseded by `analysis/` docs" header at the top.
- Move to an `archive/` folder.
- Leave as-is; the Reference Repositories table now flags it as "Historical."

**Resolve by:** Low priority; decide in Tranche 3 docs work.

---

## Testing strategy for Signal itself

Currently: 2 vitest files (`state.test.js`, `context-monitor.test.js`). No tests for slash commands (they're markdown — how would you test?). No integration tests yet.

- Should slash command behavior be testable? How (simulated runs, golden outputs)?
- Is Nyquist-compliance something Signal enforces on its own codebase, dogfood-style?

**Resolve by:** Tranche 2 / early Tranche 3.

---
