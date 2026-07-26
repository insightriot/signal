---
schema_version: 1
docs_layout_version: 3
phase: EXECUTE
current_epic: M5.E7
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-25)
  - PLAN (2026-07-25)
blockers: []
last_completed_task:
  id: M5.E7.S4.t10
  status: done
  commit: e2ba186
  completedAt: 2026-07-26T11:23:37.732Z
last_decision_at: 2026-07-26T11:23:37.732Z
last_updated_commit: e2ba186
last_updated: 2026-07-26T11:23:37.733Z
---
# Project State

## Resume pointer

**v0.1.10 — Carry-over bug squash (M5.E5) — ✅ SHIPPED 2026-07-21.** The four M5.E4 carry-overs cleared: **B24** (migrate dangling-gate over-abort — re-keyed on the resolved abs-target + multiset), **B26** (retro gate blind on the self-hosted flow — STATE-based Epic-close fallback, Layers 1+2), **B25** (FR5 read-enclosure behavioral interleaving test + `_afterRead` seam), **B6** (stale-nudge by file identity — `BOOKKEEPING_PATHS`). Full DISCUSS→SHIP at FULL/strict: 4 tasks / 2 waves (sequential dispatch), 1529 → **1561 tests**, REVIEW **PASS** — a 3-specialist adversarial panel ran a 12-case mutation matrix and found **0 false-greens** (contrast v0.1.9's two). **B26 dogfooded on its own SHIP** (hard-blocked until this retro existed). Tag `v0.1.10` → release commit `3f47cf1`. Retro: `M5.E5-RETROSPECTIVE.md`.

**v0.1.11 — M5.E6 Doc-runtime close-out — ✅ SHIPPED 2026-07-25.** The maintenance-command half of the doc-runtime flagship — Signal's self-maintenance is now locked before the BR-8 re-audit. Shipped: **`/sig:sweep`** (read-only, invoking-project hygiene; the **18th** command) + `docs/map` ship-checklist line (FR3) + FR7 close-out & **B31** (add's doc-write under `.state.lock`) + the four M5.E5 carry-overs cleared (**B27/B28** migrate flag-not-abort, **B29** `_afterRead` guard, **B30** retro-gate fresh-flow). Full DISCUSS→SHIP at FULL/strict: 25 task-commits / 3 waves, 1561 → **1623 tests**. VERIFY **PASS** (strict — independent mutation proof-of-fail on B27/B30/B29). REVIEW **PASS** — a 3-specialist adversarial panel (code-quality + security OWASP/ASVS-L2 + test-integrity) found **0 Critical, 0 false-greens**. Decisions **D-M5E6-1…5**. Retro: `M5.E6-RETROSPECTIVE.md`. **Self-dogfood note:** the FR1 retro-gate skipped on M5.E6's own stale milestone row (→ **B36**, P2) — the Epic that fixed B30 tripped the *third* milestone-row residual; caught by hand, cataloged, gate fired once the row was marked shipped.

**➡ NEXT: the M5 v2-port re-audit (BR-8)** — the doc-runtime is done, so BR-8 now gates the speculative feature ports (gstack / pm-skills / superpowers / compound-engineering). New `needs-triage` carry-overs to weigh into the next Epic: **B36** (FR1 gate stale-row blind spot, P2), **B34/B35** (renameFn pollution parity + sweep crash-safety, P3), **B32/B33** (map-array + comment drift, P3). Sprint-4 compound Epic (OBSERVATIONS.md passive capture, D-M5E6-2) also queued.

## In-flight

**None — M5.E6 shipped as v0.1.11 (2026-07-25).** No Epic in flight. Next horizon is the BR-8 v2-port re-audit (see the resume pointer above). Post-ship follow-ups all cataloged `needs-triage` in `BUGS.md` (B32–B36); AC7.7's standalone-assertion disposition recorded in `M5.E6-VERIFICATION.md`/`-REVIEW.md`.

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E6** (Doc-runtime close-out — maintenance-command half) — SHIPPED as **v0.1.11** (2026-07-25). `/sig:sweep` + roster 17→18 + FR3 map line + FR7 close-out & B31 + cleared B27/B28/B29/B30; 1561→1623 tests; VERIFY PASS (strict, mutation proof-of-fail), REVIEW PASS (3-specialist panel, 0 false-greens). New `needs-triage`: B32–B36 (incl. **B36** — FR1 gate stale-row blind spot found dogfooding the ship). → [M5.E6-RETROSPECTIVE.md](M5.E6-RETROSPECTIVE.md).
- **M5.E5** (v0.1.10 carry-over bug squash) — SHIPPED as **v0.1.10** (2026-07-21). B24/B25/B26 + B6 refinement fixed, RED-first; 1529→1561 tests; REVIEW PASS (0 false-greens, 12-case mutation matrix); **B26 dogfooded on its own SHIP**. New carry-overs B27–B30 deferred (`needs-triage`). → [M5.E5-RETROSPECTIVE.md](M5.E5-RETROSPECTIVE.md).
- **M5.E4** (Bug & doc-runtime hygiene close-out) — SHIPPED as **v0.1.9** (2026-07-21). 12 confirmed bugs fixed/dismissed + FR5 concurrency-lock; 1492→1529 tests; REVIEW PASS-WITH-FIXES (evict.js false-green security bypass caught + fixed in-phase). B24 + the B6 refinement deferred to v0.1.10. → [M5.E4-RETROSPECTIVE.md](M5.E4-RETROSPECTIVE.md).
- **M5.E1 + M5.E2 + M5.E3** — the doc-runtime, SHIPPED together as **v0.1.8** (2026-07-20): canonical doc-model + eviction (E1), auto-sensing `/sig:migrate-memory` (E2), all-docs hygiene + living `BACKLOG.md` + append-log eviction + auto `/sig:index` (E3). → [M5.E3-RETROSPECTIVE.md](M5.E3-RETROSPECTIVE.md) (+ E1/E2 retros).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative) → [STATE-HISTORY.md](STATE-HISTORY.md).
