---
tier: FULL
schema_version: 1

calibration:
  scope: product
  stakes: major
  novelty: rare
  reversibility: painful
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: full
  performance_pass: true
  simplification_pass: true
  nyquist_enforcement: strict
  plan_validation_dims: all
  research_parallelism: 4
  gate_strictness: strict
  context_rot_reread: true
  review_depth: full

metadata:
  created_at: 2026-05-14T02:52:44Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

Signal is a standalone Claude Code plugin distributed via marketplace — long-lived core infrastructure for the user's development practice. Tier **FULL** fires on `horizon: years` (Rule 1 of the tier-derivation order); `stakes: major` and `reversibility: painful` reinforce but don't independently trigger. The calibration question/router architecture is novel enough that `novelty: rare` is honest — there are adjacent prior art repos (GSD, Agent Skills, superpowers) but no calibration-routed predecessor.

## Notes

- **Retro-calibration of an in-flight project.** Signal-on-Signal hand-rolled `.planning/` while building the `/sig:` commands (per CONTEXT.md line 30) and never wrote a PROFILE.md for itself. This profile formalizes that gap on 2026-05-13 ahead of running `/sig:plan` on Milestone 4.5 Epic 2 (`/sig:add` command). All prior milestones (M1–M4) effectively operated at FULL-tier rigor by manual discipline; this file makes that explicit and unblocks downstream phase commands.
- **STATE.md preserved.** STATE.md predates this PROFILE.md (Signal-on-Signal has been mid-build for months); calibrate's idempotent `initState` would normally overwrite it to `DISCUSS`, but doing so here would wipe load-bearing working memory. STATE.md left untouched; the calling phase command should read it as-is.
- **`research_parallelism: 4` retained** despite the footnote suggesting downward override for well-trodden domains. Signal's domain has genuinely novel surface (calibration routing, tier-gated phase flow, plugin-ecosystem synthesis) where 4 distinct angles are likely to return non-redundant signal. Revisit if the first FULL-tier `/sig:plan` run produces redundant research.
- **`.gitignore` clean** — single repo-root `.gitignore` checked; no `.planning/` entries. No override or adjustment needed.
- **Escalation path:** `/sig:escalate` if scope or stakes shift; future re-calibrations should preserve `escalation_history` per the schema.
