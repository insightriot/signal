# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

---

## Tier count: validate 4 tiers against real calibration

Schema is locked at 4 tiers (SKETCH / FEATURE / SPIKE / FULL) per DECISIONS.md. The design note in `references/tier-definitions.md` explains why, but this is a judgment call that can only be validated by calibrating real projects.

Watch for:
- **Too-coarse signal:** if real projects keep landing between SKETCH and FEATURE (e.g., "this is more than SKETCH but I'm uncomfortable calling it FEATURE"), we may need a 5th tier.
- **Redundant tiers:** if SPIKE and SKETCH feel interchangeable in practice, we may consolidate.
- **Missing dimensions:** if Scope / Stakes / Novelty / Reversibility / Horizon don't capture some real project quality (e.g., team size, deadline pressure), the diagnostic questions may need to evolve.

**Resolve by:** Tranche 3 (real-project calibration runs). Likely outcome: confirmed as-is, with minor override-key tweaks.

---

## Agent count: 17 on disk vs. 24 in spec

`PROJECT.md` claims 24 agents (21 GSD + 3 Agent Skills specialists). Actual on disk: 17.

- Which 7 are missing? Quick audit against GSD's agents/ directory and Agent Skills' agents/ directory.
- Are any of the missing ones actually load-bearing vs. redundant with what's there (per the rundown's note that GSD's 21 overlap with compound-eng's lens pattern and may trim)?
- Decision: write them, or revise `PROJECT.md` Gate 2 down to the real number?

**Resolve by:** Tranche 2, Step 6.

---

## Plugin manifest: what does Claude Code auto-discover?

`plugin.json` only declares `commands`. Need to know:
- Does Claude Code auto-load `agents/` from plugin root?
- Same for `skills/` / `hooks/` / `references/`?
- If yes, no manifest changes needed. If no, need to declare paths.

Reference: check Claude Code plugin docs and the GSD plugin manifest for how it handles this.

**Resolve by:** Tranche 1, Step 2.

---

## Orphan skills on disk

`state/config.json` phase_bindings lists 15 skills. On disk there are 21 SKILL.md files. The 6 not in any binding: `api-and-interface-design`, `frontend-ui-engineering`, `source-driven-development`, `deprecation-and-migration`, `using-agent-skills` (meta), and one more to identify.

- Add to bindings? If so, which phase?
- Remove from disk? If so, update PROJECT.md's skill list (4.2).

**Resolve by:** Tranche 2, Step 5.

---

## Dogfood target feature for Tranche 3

**Resolved 2026-04-23:** `/sig:status` and `/sig:resume` are now committed Tranche 3 deliverables (see `TRANCHE-3.md` Task 1), not candidates. Decision: build one via Signal (likely `/sig:status`, the simpler read-only command), hand-roll the other to avoid a chicken-and-egg loop.

Remaining sub-question: which do we build via Signal vs. hand-roll? Resolve at Tranche 3 kickoff.

---

## Socratic / guided-question UX pattern

GSD is known for a specific conversational pattern: when asking the user for input, present **3 options + "other/explain"** rather than open-ended prompts. This reduces decision fatigue, surfaces tradeoffs explicitly, and keeps the flow moving.

Today's Signal commands use this pattern lightly (see `discuss.md` step 4: "present the options with trade-offs, make a recommendation, ask for decision") but it's not codified as a cross-command convention. There's no reference doc authors can check against. Risk: phase commands drift into open-ended questions that slow users down and let Claude improvise inconsistently across commands.

**Candidate resolution:**
- Write `references/question-patterns.md` — a short reference doc defining:
  - The 3-options-plus-other pattern and when to use it (gray areas, tradeoffs, user-is-the-decider choices).
  - When open-ended questions ARE appropriate (clarifying a genuinely unknown user intent).
  - How to structure options (name, one-line description, tradeoff / why-you'd-pick-this).
  - How to handle "other" — always accept free-text, always capture reasoning for future reference.
- Add a command-authoring checklist item: "any user-facing question must use the 3+other pattern unless explicitly justified."
- Retrofit existing question-asking commands (`discuss.md`, `calibrate.md`, eventually `escalate.md`) to conform.

**Why now, not later:** the Tranche 2 Step 3 preamble-pass will touch every phase command — natural moment to also standardize question-asking. Doing this after Tranche 2 means retrofitting twice.

**Resolve by:** Before Tranche 2 Step 3. Ideally as Tranche 2 Step 3a or a dedicated sub-step.

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
