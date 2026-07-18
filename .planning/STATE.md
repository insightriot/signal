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
last_updated_commit: a903bed94d652589036f25d97214187abb3ab2ce
last_updated: 2026-07-18T19:35:47.424Z
---
# Project State

## Resume pointer

M5.E2 (Auto-sensing migrate command — FR6/FR7), FULL/strict — **✅ DONE THROUGH REVIEW (PASS-WITH-FIXES, approved 2026-07-18). M5.E2's own SHIP is folded into a COMBINED E1+E2+E3 release.** Full DISCUSS→REVIEW: engine + vectors + hook/banner (S1–S3), Signal dogfood + nextpass faithfulness proof (S4), then a **3-specialist adversarial REVIEW** that caught + fixed a **SHIP-blocking rollback gap** (2 reviewers reproduced it) + a symlink escape + fence-less false-success + perf DoS + test-adequacy gaps — **5 RED-first fix batches `50ad065`..`dd77ef1`, 1281→1300 tests green**, real-file faithfulness **re-confirmed 0-dropped @ `ca6ec22`**. Reports: `M5.E2-{VERIFICATION,REVIEW}.md`; bugs `BUGS.md` (B10–B16).

> **DECISION 2026-07-18 (Brett): fold M5.E3 (FR4/FR5 — all-docs hygiene runtime + living `BACKLOG.md`) into this release**, so the ENTIRE doc-runtime ships as one 0.1.x — NOT E1+E2 alone. Rationale: E1+E2 fix STATE/FUTURE-IDEAS bloat + the migrate command; E3 extends auto-hygiene to every other planning doc (append-logs like `DECISIONS.md`, milestone docs) + the living backlog. See `DECISIONS.md` 2026-07-18.

**➡ NEXT ACTION: open M5.E3 — run `/sig:discuss --epic M5.E3`.** (This rolls `current_epic`→M5.E3 + resets the phase per B9/S1.t0, and starts E3's DISCUSS fresh.) After M5.E3 ships, cut the **combined E1+E2+E3** marketplace release; THEN `/plugin update` in nextpass et al. and run `/sig:migrate-memory`. Any staleness/origin banner is the benign B6 "+1" (bookkeeping commit; HEAD == origin).

## In-flight

**M5.E3 (FR4/FR5 — all-docs hygiene runtime + living `BACKLOG.md`) is the next Epic to build** — open with `/sig:discuss --epic M5.E3`. Its 3 DISCUSS pre-decisions are locked (see `MILESTONE-5.md`). After E3 ships → combined E1+E2+E3 release.

M5.E2 (below) — the auto-sensing migrate/re-org command (FR6) + doc-layout stamp/banner (FR7), **DONE THROUGH REVIEW.** Pulled forward ahead of FR4/FR5 (2026-07-16 pivot); now bundled with E1+E3 into one release (2026-07-18). **4 slices, 3 waves — all complete:**
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
