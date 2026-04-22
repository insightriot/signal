# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

---

## PROFILE.md schema specifics

- What exact field names go in `rigor_overrides`? Candidates: `tdd_required`, `security_audit`, `nyquist_tests`, `review_depth`, `context_rot_reread`, `plan_validation_dims` (all 8 vs subset). Need a close read of each phase command to know what knobs actually need overriding.
- Is the tier enum `SKETCH | FEATURE | SPIKE | FULL` the right cut? Or do we need a 5th tier between SKETCH and FEATURE? Defer judgment until we try calibrating real projects.
- Metadata: `calibrated_by` — what goes there? Session ID? Just a timestamp? Or skip entirely?
- How do we record escalation history when `/sig:escalate` upgrades tier mid-flight? Append-only array in PROFILE.md, or separate file?

**Resolve by:** Tranche 1, Step 5 (when writing `references/profile-schema.md`).

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

What small, real feature do we build *with Signal, on itself* to validate end-to-end? Candidates:
- `/sig:help` command (lists all commands with short descriptions)
- `/sig:status` command (summarizes current `.planning/` state)
- A missing reference doc (e.g., `context-engineering-checklist.md`)
- The `readProfile()` helper in `tools/lib/` (if deferred from Tranche 2)

**Resolve by:** Start of Tranche 3.

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
