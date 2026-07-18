---
schema_version: 1
docs_layout_version: 2
phase: EXECUTE
current_epic: M5.E2
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-17)
  - PLAN (2026-07-17)
blockers: []
last_completed_task:
  id: M5.E2.S4.t1
  status: done
  commit: 251388e
  completedAt: 2026-07-18T01:50:42.927Z
last_decision_at: 2026-07-18T01:50:42.927Z
last_updated_commit: 251388e
last_updated: 2026-07-18T01:50:42.928Z
---
# Project State

## Resume pointer

M5.E2 (Auto-sensing migrate command — FR6/FR7), FULL/strict — **EXECUTE in progress: Waves 1 + 2 COMPLETE, Wave 3 S4.t1 (Signal dogfood) COMPLETE → S4.t2 (nextpass) is the last task.** S1 (Wave 1) shipped the safe auto-sensing engine (t0–t8); S2 + S3 (Wave 2) added vector-3 retroactive evict + generalized archive-tree + blocking dangling-link gate + full-corpus auto-sense brain (append-log protection) + the FR7 SessionStart hook and resume/status layout banner (8 commits `1b79b96`..`ac893de`). **S4.t1 (commit `251388e`):** dogfooded `/sig:migrate-memory` on Signal's own `.planning/` — 31 byte-identical archive relocations + STATE stamped `docs_layout_version: 2` (so the FR7 banners now go silent on Signal itself), 1260 tests + validator green, reversible via tag `pre-migrate-memory-2026-07-18T01-48-19-462Z`; B10 (SHIP-suffix gap) caught + fixed mid-flight (`9064340`). **Remaining: S4.t2** — dev-install the plugin + dry-run→approve→apply on the real 529 KB `nextpass/.planning/STATE.md` (the B8 vector-1 proof; external, needs the nextpass repo). Progress board: `M5.E2-PROGRESS.md`.

## In-flight

M5.E2 — the auto-sensing migrate/re-org command (FR6) + doc-layout stamp/banner (FR7). **Pulled forward ahead of FR4/FR5** (2026-07-16 pivot). Releasable on its own as E1+E2. **4 slices, 3 waves.**
- **Wave 1 — S1: ✅ COMPLETE** (2026-07-17). `commands/migrate-memory.md` + `tools/lib/migrate-memory.js`: arg-parse (dry-run default), `relocateFaithful`/`conserves` faithfulness gate (word/byte conservation — the B8 catch), vector-1 de-prose locator+transform, vector-2 body relocate, `senseState` auto-sense, `probeGitState`, `applyMigrate` (compose V1→V2→stamp under one coarse lock, TOCTOU, surgical rollback, tag+staged), `scanDanglingLinks`/`renderDryRun`, stamp-only-on-conformance + zero-diff idempotency. B9 folded as S1.t0. **Two advisor passes** (verifyFaithful≠vector-1 gate; V1→V2 one-pass; surgical rollback; TOCTOU).
- **Wave 2 — S2 + S3: ✅ COMPLETE** (2026-07-17). S2 = vector-3 retroactive evict loop (no-fabricate gate) + generalized `tools/lib/archive-tree.js` + blocking dangling-link gate (abort+surgical-rollback) + `applyArchiveTree` wired into `applyMigrate` with extended snapshot set + full-corpus `senseProject` brain (append-log protection, milestone flag-don't-move). S3 = `hooks/warn-layout-drift.js` SessionStart hook (capped-prefix, fail-open) + resume/status pre-reorg banner (stamp-first + structural sniff). Sub-split S2.t5→t5a/t5b at EXECUTE. Two load-bearing mutation gates (B8 drop; dangling-link skip) proven RED-first.
- **Wave 3 — S4: 🔶 IN PROGRESS (human gate).** **S4.t1 (Signal dogfood): ✅ COMPLETE** (`251388e`) — 31 archive relocations + stamp v2 on Signal's own `.planning/`, byte-identical, 1260 tests green, reversible. **S4.t2 (nextpass 529 KB vector-1): ⏳ PENDING** — external; dev-install the plugin + dry-run→approve→apply on the real B8 file. This is the real vector-1 de-prose proof (S4.t1 exercised the archive path only; Signal's STATE was already clean).

Artifacts: `M5.E2-{RESEARCH,PLAN,VALIDATION,PROGRESS}.md`. (FR4/FR5 → M5.E3.)

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E1** (Doc-runtime & memory hygiene) — SHIPPED 2026-07-16, unreleased (batched with E2/E3). Doc-model FR1 + STATE/FUTURE-IDEAS eviction FR2/FR3 + dogfood. → [M5.E1-RETROSPECTIVE.md](M5.E1-RETROSPECTIVE.md).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative + migration-preserved body) → [STATE-HISTORY.md](STATE-HISTORY.md). Relocated 2026-07-16 (M5.E1.S5 dogfood — vector-2 legacy-body eviction).
