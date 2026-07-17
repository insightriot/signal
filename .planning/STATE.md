---
schema_version: 1
phase: EXECUTE
current_epic: M5.E2
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-17)
  - PLAN (2026-07-17)
blockers: []
last_completed_task: null
last_decision_at: 2026-07-16T10:56:20.313Z
last_updated_commit: b104e4b08850b56dfc0618a990adc9e243dcf3a9
last_updated: 2026-07-17T14:14:13.816Z
---
# Project State

## Resume pointer

M5.E2 (Auto-sensing migrate command — FR6/FR7), FULL/strict — **EXECUTE in progress: Wave 1 (S1) COMPLETE → Wave 2 (S2 ∥ S3) next.** S1 shipped `/sig:migrate-memory` (11 atomic commits t0–t8, 1071→1168 tests, validator green) — the safe auto-sensing engine that **provides the mechanism to un-stick nextpass** (pure vector-1; the real 529 KB repo is proven end-to-end in **S4.t2**, not yet) + the B8 auto-remediation. Run `/sig:resume` for the briefing; run `/sig:execute` to continue with Wave 2. Progress board: `M5.E2-PROGRESS.md`. Any staleness banner shown is the benign B6 "+1" (markFresh bookkeeping; local HEAD == origin — nothing to pull).

## In-flight

M5.E2 — the auto-sensing migrate/re-org command (FR6) + doc-layout stamp/banner (FR7). **Pulled forward ahead of FR4/FR5** (2026-07-16 pivot). Releasable on its own as E1+E2. **4 slices, 3 waves.**
- **Wave 1 — S1: ✅ COMPLETE** (2026-07-17). `commands/migrate-memory.md` + `tools/lib/migrate-memory.js`: arg-parse (dry-run default), `relocateFaithful`/`conserves` faithfulness gate (word/byte conservation — the B8 catch), vector-1 de-prose locator+transform, vector-2 body relocate, `senseState` auto-sense, `probeGitState`, `applyMigrate` (compose V1→V2→stamp under one coarse lock, TOCTOU, surgical rollback, tag+staged), `scanDanglingLinks`/`renderDryRun`, stamp-only-on-conformance + zero-diff idempotency. B9 folded as S1.t0. **Two advisor passes** (verifyFaithful≠vector-1 gate; V1→V2 one-pass; surgical rollback; TOCTOU).
- **Wave 2 — S2 ∥ S3: ⏳ PENDING.** S2 = vector-3 retroactive evict + archive-tree + link-rewrite + full-corpus auto-sense (sub-split at EXECUTE). S3 = FR7.2 upgrade banner + SessionStart Node hook.
- **Wave 3 — S4: ⏳ PENDING.** Signal + nextpass dogfood = the §5 faithfulness human-eyeball proof.

Artifacts: `M5.E2-{RESEARCH,PLAN,VALIDATION,PROGRESS}.md`. (FR4/FR5 → M5.E3.)

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E1** (Doc-runtime & memory hygiene) — SHIPPED 2026-07-16, unreleased (batched with E2/E3). Doc-model FR1 + STATE/FUTURE-IDEAS eviction FR2/FR3 + dogfood. → [M5.E1-RETROSPECTIVE.md](M5.E1-RETROSPECTIVE.md).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative + migration-preserved body) → [STATE-HISTORY.md](STATE-HISTORY.md). Relocated 2026-07-16 (M5.E1.S5 dogfood — vector-2 legacy-body eviction).
