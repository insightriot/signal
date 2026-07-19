---
schema_version: 1
docs_layout_version: 2
phase: PLAN
current_epic: M5.E3
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-18)
blockers: []
last_completed_task: null
last_decision_at: 2026-07-18T01:50:42.927Z
last_updated_commit: c73a273
last_updated: 2026-07-19T02:42:48.539Z
---
# Project State

## Resume pointer

M5.E3 (all-docs hygiene runtime + living `BACKLOG.md` + append-log eviction — FR4/FR5 + D-M5E2-6), FULL/strict — **✅ DISCUSS complete (2026-07-18); PLAN next.** The final doc-runtime Epic; opened via `/sig:discuss --epic M5.E3` (clean B9-fixed roll). Doc-lifecycle model locked (**D-M5E3-1…8**, `DECISIONS.md` 2026-07-18): four role-named files — `ISSUES-INBOX.md` (raw capture, renamed from `FUTURE-IDEAS.md`) → the drain classifies/dispositions → `BACKLOG.md` (sequenced work) + `BUGS.md` (defects); `OPEN-QUESTIONS.md` (questions). Capture = verbatim body + agent-authored auto-title. Append-log hygiene = **evict-with-anchors** (closed-milestone `DECISIONS.md` → `DECISIONS-HISTORY.md` behind pointers, anchors preserved; the auto-`/sig:index` is the load-bearing traversal layer). Hygiene checks = test-suite, deterministic + offline. Rollout: layout v2→v3 (E2 banner + extended `/sig:migrate-memory` for existing; born-on-v3 for new); retires `ship.md` §8 Curator. Spec: **`M5.E3-REQUIREMENTS.md`** (6 FRs + ACs + NFRs).

**➡ NEXT ACTION: run `/sig:plan`** (`current_epic: M5.E3` set — no `--epic` needed). Any staleness/origin banner is the benign B6 "+1" (bookkeeping commit; HEAD == origin).

## In-flight

**M5.E3 — PLAN next.** DISCUSS closed with the doc-lifecycle model locked; the 6 FRs are speced in `M5.E3-REQUIREMENTS.md`: FR1 `ISSUES-INBOX` rename + smart capture · FR2 living `BACKLOG` + drain classify/promote · FR3 auto-generated `/sig:index` · FR4 all-docs hygiene in the test suite · FR5 append-log eviction (evict-with-anchors — E3's risky, migrate-shaped piece; reuses E2's dangling-gate + relocate-never-delete spine) · FR6 layout v2→v3 migration + rollout. Batched into the combined E1+E2+E3 release.

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E2** (Auto-sensing migrate command — FR6/FR7) — SHIPPED 2026-07-18, unreleased (batched E1+E2+E3). `/sig:migrate-memory` (relocate-never-delete, dry-run-default, git-reversible); REVIEW PASS-WITH-FIXES (3-specialist panel — SHIP-blocking rollback gap caught + fixed); ≈1071→1300 tests. → [M5.E2-RETROSPECTIVE.md](M5.E2-RETROSPECTIVE.md).
- **M5.E1** (Doc-runtime & memory hygiene) — SHIPPED 2026-07-16, unreleased. Doc-model FR1 + STATE/FUTURE-IDEAS eviction FR2/FR3 + dogfood (STATE.md 64.5 KB→1 KB). → [M5.E1-RETROSPECTIVE.md](M5.E1-RETROSPECTIVE.md).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative + migration-preserved body) → [STATE-HISTORY.md](STATE-HISTORY.md). Relocated 2026-07-16 (M5.E1.S5 dogfood — vector-2 legacy-body eviction).
