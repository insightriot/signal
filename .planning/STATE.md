---
schema_version: 1
docs_layout_version: 3
phase: PLAN
current_epic: M5.E5
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-21)
blockers: []
last_completed_task: null
last_decision_at: 2026-07-20T15:54:52.684Z
last_updated_commit: 0c74af95a21c9cab6ecfcf4d2924ae3aaeea9305
last_updated: 2026-07-21T17:05:46.099Z
---
# Project State

## Resume pointer

**v0.1.9 — Bug & doc-runtime hygiene close-out (M5.E4) — ✅ SHIPPED 2026-07-21.** The confirmed-bug backlog cleared before the v2-port re-audit: **12 known bugs fixed** (or dismissed) + the FR5 doc-runtime **concurrency-lock**. Full DISCUSS→SHIP at FULL/strict: 5 waves / ~18 tasks, 1492 → **1529 tests**, REVIEW **PASS-WITH-FIXES** (3-specialist adversarial panel — caught + closed a real path-confinement bypass shipping under a *false-green test*, the `evict.js` leaf-symlink escape). Tag `v0.1.9` → release commit `0164f0f`; GitHub release live. Retro: `M5.E4-RETROSPECTIVE.md`.

**➡ NEXT: v0.1.9 released; no Epic open.** **v0.1.10-candidate carry-overs** from M5.E4 (all in `BUGS.md`): **B24** (a pre-existing dangle in a *closed* DECISIONS section blocks `/sig:migrate-memory` — fix reworks the dangling-delta gate), **B25** (FR5 AC5.2 needs a behavioral read-enclosure test — correct by inspection today), **B26** (`shipFR1Check` Epic-close detection silently skips on the self-hosted flow), + the **B6 local-stale scope refinement** (a stale-semantics call the REVIEW flagged). Also slated for v0.1.10: the **Sprint-3 hygiene commands** (`/sig:sweep`, CLAUDE.md de-bloat, `docs/map`). Broader horizon per `MILESTONE-5.md`: the **v2-port re-audit (BR-8)** gating the speculative ports. Open a new Epic with `/sig:discuss --epic <name>`.

## In-flight

**None — M5.E4 shipped as v0.1.9; no Epic open.**

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E4** (Bug & doc-runtime hygiene close-out) — SHIPPED as **v0.1.9** (2026-07-21). 12 confirmed bugs fixed/dismissed + FR5 concurrency-lock; 1492→1529 tests; REVIEW PASS-WITH-FIXES (evict.js false-green security bypass caught + fixed in-phase). B24 + the B6 refinement deferred to v0.1.10. → [M5.E4-RETROSPECTIVE.md](M5.E4-RETROSPECTIVE.md).
- **M5.E1 + M5.E2 + M5.E3** — the doc-runtime, SHIPPED together as **v0.1.8** (2026-07-20): canonical doc-model + eviction (E1), auto-sensing `/sig:migrate-memory` (E2), all-docs hygiene + living `BACKLOG.md` + append-log eviction + auto `/sig:index` (E3). → [M5.E3-RETROSPECTIVE.md](M5.E3-RETROSPECTIVE.md) (+ E1/E2 retros).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative) → [STATE-HISTORY.md](STATE-HISTORY.md).
