---
tier: FULL
schema_version: 1

calibration:
  scope: product
  stakes: major
  novelty: familiar
  reversibility: irreversible
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
  created_at: 2026-04-26T07:20:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

URL shortener service intended for production. Tier **FULL** fired on rule 1 — `reversibility: irreversible` (published short URLs are a public contract that cannot be retracted) and `horizon: years` (production infrastructure). Rigor maxed: TDD on, full security audit, strict Nyquist, all 8 plan-validation dimensions, 4-way research parallelism, all phases run.

## Notes

- No `.gitignore` adjustments needed — repo had no `.gitignore` at calibration time.
- No overrides — accepted derived tier.
- Reasoning for FULL despite small surface area: short URLs are an *interface contract*. The keyspace, code-format, redirect semantics, and storage durability decisions all become public the moment a URL is shared, and reversing any of them breaks all outstanding short URLs. That's the irreversibility-trumps-scope case the FULL rule is designed to catch.
