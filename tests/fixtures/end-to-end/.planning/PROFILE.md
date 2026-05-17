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
  created_at: 2026-05-17T00:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

End-to-end test fixture — FULL-tier profile used by tests/state-end-to-end.test.js.
