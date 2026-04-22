# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

---

## GitHub repo rename: `dev-skills-gsd` → `signal`?

Manifest `name` fields are now `signal`, but repository URLs still point at `InsightRiot/dev-skills-gsd` because that's the actual GitHub repo name. Changing the URLs without renaming the repo would break clone/install.

**Options:**
1. Rename the GitHub repo now (e.g., to `InsightRiot/signal` or `InsightRiot/signal-plugin`). Then update all URLs in one pass.
2. Defer rename to later; leave URLs pointing at `dev-skills-gsd` indefinitely. Inconsistent but harmless.
3. Rename to something non-colliding (e.g., `InsightRiot/signalos-plugin` if `signal` is taken or to avoid generic naming).

**Needs Brett's decision.** Action items once decided:
- Rename on GitHub (via web UI or `gh`).
- Update `repository.url` in `package.json`.
- Update `repo` in `.claude-plugin/marketplace.json`.
- Update `homepage` + `repository` in `.claude-plugin/plugin.json`.
- Update local `git remote set-url origin` to the new URL.

**Resolve by:** Before shipping v1 (Tranche 3 / README writing).

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
