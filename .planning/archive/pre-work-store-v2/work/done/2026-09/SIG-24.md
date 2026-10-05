---
id: SIG-24
type: BUG
status: C
title: A pre-existing broken `](*.md)` link inside a strictly-closed-milestone
  DECISIONS section blocks `applyMigrate` — it…
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:51
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B24
---
| B24 | `fixed` | P2 | **A pre-existing broken `](*.md)` link inside a strictly-closed-milestone DECISIONS section blocks `applyMigrate` — it aborts + rolls back byte-identical, violating the FR6.3 "a pre-existing dangle must NOT be attributed to the migrate" contract.** The append-log evict relocates the closed block to `archive/M{n}/` AND re-roots the still-broken link, so `computeDanglingDelta`'s `file\0link` key can't subtract it against the pre-apply baseline (both the file path and the link text changed) → it's flagged as a NEW dangle. **Fail-SAFE** (never a partial write) but **over-eager**: any external repo whose closed DECISIONS history carries ONE broken `](*.md)` link is blocked from migrating. Cross-check: `renderDryRun` lists this same dangle under "pre-existing dangling" (not the migrate's fault), yet apply aborts on it — a dry-run/apply divergence. **Discovered + reproduced 2026-07-20** (M5.E4.T4.1, `8fec7bf` — asserts current behavior in `migrate-dangling-baseline.test.js`, does NOT endorse it). Inert on Signal (0 inline `](*.md)` in DECISIONS.md). **Fix (deferred — out of M5.E4's known-bug scope):** make baseline-subtraction survive the block-move+reroot (key the delta on the decision ID / original link, not `file\0link`), OR exempt links inside evicted-and-rerooted closed blocks from the gate. Candidate for a v0.1.10 fast-follow. |