---
schema_version: 1
docs_layout_version: 3
phase: VERIFY
current_epic: M5.E4
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-20)
  - PLAN (2026-07-20)
  - EXECUTE (2026-07-21)
blockers: []
last_completed_task:
  id: M5.E4.T4.1
  status: done
  commit: 8fec7bf
  completedAt: 2026-07-20T15:54:52.684Z
last_decision_at: 2026-07-20T15:54:52.684Z
last_updated_commit: 4a7c3a4a059f7202b1ddacf5a0d96a5720781aab
last_updated: 2026-07-21T13:31:38.775Z
---
# Project State

## Resume pointer

**Milestone 5 — the doc-runtime (E1 + E2 + E3) — ✅ SHIPPED as v0.1.8 (2026-07-20).** M5.E3 (all-docs hygiene + living `BACKLOG.md` + append-log eviction, FR1–FR6) completed a full DISCUSS→SHIP at FULL/strict: 7 slices / 5 waves, 1300 → **1492 tests**, dogfooded on Signal's own `.planning/` (DECISIONS.md 178 KB → 33 KB, 37 sections evicted, 0 dropped), REVIEW PASS-WITH-FIXES (3-specialist panel, 4 Important fixed in-phase). The combined **E1+E2+E3** doc-runtime is released to the marketplace — Signal's memory is now self-maintaining (`ISSUES-INBOX`→`BACKLOG`/`BUGS` lifecycle, auto `/sig:index`, hygiene guard, verbatim `DECISIONS.md` eviction, `/sig:migrate-memory`). Retro: `M5.E3-RETROSPECTIVE.md`.

**➡ NEXT: Milestone 5's doc-runtime is complete + released.** No Epic open. Next horizon per `MILESTONE-5.md`: the **v2-port re-audit (BR-8)** which gates the speculative feature ports (gstack / pm-skills / superpowers / compound-engineering), or open a new Epic with `/sig:discuss --epic <name>`. Deferred non-blocking fast-follows: `BUGS.md` B18–B23. Any staleness/origin banner is the benign B6 "+1" (HEAD == origin).

## In-flight

**None — M5.E3 shipped as v0.1.8; no Epic open.** The doc-runtime milestone (E1+E2+E3) is complete and released.

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E2** (Auto-sensing migrate command — FR6/FR7) — SHIPPED 2026-07-18, unreleased (batched E1+E2+E3). `/sig:migrate-memory` (relocate-never-delete, dry-run-default, git-reversible); REVIEW PASS-WITH-FIXES (3-specialist panel — SHIP-blocking rollback gap caught + fixed); ≈1071→1300 tests. → [M5.E2-RETROSPECTIVE.md](M5.E2-RETROSPECTIVE.md).
- **M5.E1** (Doc-runtime & memory hygiene) — SHIPPED 2026-07-16, unreleased. Doc-model FR1 + STATE/FUTURE-IDEAS eviction FR2/FR3 + dogfood (STATE.md 64.5 KB→1 KB). → [M5.E1-RETROSPECTIVE.md](M5.E1-RETROSPECTIVE.md).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative + migration-preserved body) → [STATE-HISTORY.md](STATE-HISTORY.md). Relocated 2026-07-16 (M5.E1.S5 dogfood — vector-2 legacy-body eviction).
