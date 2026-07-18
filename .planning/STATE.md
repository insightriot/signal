---
schema_version: 1
docs_layout_version: 2
phase: REVIEW
current_epic: M5.E2
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-17)
  - PLAN (2026-07-17)
  - EXECUTE (2026-07-18)
  - VERIFY (2026-07-18)
blockers: []
last_completed_task:
  id: M5.E2.S4.t1
  status: done
  commit: 251388e
  completedAt: 2026-07-18T01:50:42.927Z
last_decision_at: 2026-07-18T01:50:42.927Z
last_updated_commit: e42afedf971ea3ee939630d29b691bb72368d5f3
last_updated: 2026-07-18T17:03:04.869Z
---
# Project State

## Resume pointer

M5.E2 (Auto-sensing migrate command — FR6/FR7), FULL/strict — **EXECUTE COMPLETE → VERIFY (in progress).** All code shipped (S1 engine + S2/S3 vectors/hook/banner, 8 commits `1b79b96`..`ac893de`) + S4.t1 Signal dogfood (`251388e`: 31 byte-identical archive relocations + stamp v2, 1260 tests green, reversible). **S4.t2 faithfulness PROVEN read-only** on the real 546 KB `nextpass/.planning/STATE.md` — vector-1 de-prose of 19 entries + 538 KB body relocate **conserves every word (0 dropped)**; the live nextpass apply is a **post-release** step Brett runs via the shipped plugin (nextpass already unwedged manually, so no urgency). **Direction (2026-07-18): drive to a real 0.1.x release** — VERIFY → REVIEW (adversarial + fix carry-forwards: `readLayoutBanner` hot-path efficiency + B11 flag noise) → SHIP, **bundled with M5.E1** as the doc-bloat fix. M5.E3 (FR4/FR5) stays the documented fast-follow unless pulled in. Progress board: `M5.E2-PROGRESS.md`.

## In-flight

M5.E2 — the auto-sensing migrate/re-org command (FR6) + doc-layout stamp/banner (FR7). **Pulled forward ahead of FR4/FR5** (2026-07-16 pivot). Releasable on its own as E1+E2. **4 slices, 3 waves.**
- **Wave 1 — S1: ✅ COMPLETE** (2026-07-17). `commands/migrate-memory.md` + `tools/lib/migrate-memory.js`: arg-parse (dry-run default), `relocateFaithful`/`conserves` faithfulness gate (word/byte conservation — the B8 catch), vector-1 de-prose locator+transform, vector-2 body relocate, `senseState` auto-sense, `probeGitState`, `applyMigrate` (compose V1→V2→stamp under one coarse lock, TOCTOU, surgical rollback, tag+staged), `scanDanglingLinks`/`renderDryRun`, stamp-only-on-conformance + zero-diff idempotency. B9 folded as S1.t0. **Two advisor passes** (verifyFaithful≠vector-1 gate; V1→V2 one-pass; surgical rollback; TOCTOU).
- **Wave 2 — S2 + S3: ✅ COMPLETE** (2026-07-17). S2 = vector-3 retroactive evict loop (no-fabricate gate) + generalized `tools/lib/archive-tree.js` + blocking dangling-link gate (abort+surgical-rollback) + `applyArchiveTree` wired into `applyMigrate` with extended snapshot set + full-corpus `senseProject` brain (append-log protection, milestone flag-don't-move). S3 = `hooks/warn-layout-drift.js` SessionStart hook (capped-prefix, fail-open) + resume/status pre-reorg banner (stamp-first + structural sniff). Sub-split S2.t5→t5a/t5b at EXECUTE. Two load-bearing mutation gates (B8 drop; dangling-link skip) proven RED-first.
- **Wave 3 — S4: ✅ COMPLETE (for EXECUTE).** **S4.t1 (Signal dogfood): ✅** (`251388e`) — 31 archive relocations + stamp v2, byte-identical, 1260 tests green, reversible. **S4.t2 (nextpass 546 KB vector-1): ✅ engine-proven read-only** — de-prose of 19 entries + 538 KB body relocate conserves every word (0 dropped); the **live apply is a post-release user step** (Brett runs it via the shipped plugin — nextpass already unwedged, no urgency). B10 (SHIP-suffix gap) caught + fixed mid-flight (`9064340`).

Artifacts: `M5.E2-{RESEARCH,PLAN,VALIDATION,PROGRESS}.md`. (FR4/FR5 → M5.E3.)

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E1** (Doc-runtime & memory hygiene) — SHIPPED 2026-07-16, unreleased (batched with E2/E3). Doc-model FR1 + STATE/FUTURE-IDEAS eviction FR2/FR3 + dogfood. → [M5.E1-RETROSPECTIVE.md](M5.E1-RETROSPECTIVE.md).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative + migration-preserved body) → [STATE-HISTORY.md](STATE-HISTORY.md). Relocated 2026-07-16 (M5.E1.S5 dogfood — vector-2 legacy-body eviction).
