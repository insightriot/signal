---
id: SIG-11
type: BUG
status: C
title: "`vector-2-defer` flag over-fires — one spurious flag per historical
  closed Epic on any already-evicted corpus."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:33
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B11
---
| B11 | `fixed` | P3 | **`vector-2-defer` flag over-fires — one spurious flag per historical closed Epic on any already-evicted corpus.** `classifyClosedEpicBody(stateBody, epicId)` returns `vector-2-reclassify` whenever a closed Epic has no section heading in the *current* STATE body — but on a healthy/mature project the STATE body holds only current state, so **every** past closed Epic (whose narrative long ago moved to its retro + archive) trips it, emitting `FLAG: vector-2-defer — <Epic> … handled by the vector-2 whole-body relocate, not V3` with **no corresponding move** (`vectors:[]`, `v3.evicts:0`). **Confirmed 2026-07-17** via S4.t1 dry-run on Signal's `.planning/`: 12 vector-2-defer flags, zero backing relocations. Advisory noise, no data impact — but it makes the dry-run's flag section useless-to-misleading on any real project. **Fix (REVIEW):** only emit `vector-2-defer` when there is actual un-sectioned closed-Epic narrative *present in the body* to relocate, not for every historical Epic absent from it. **→ Fixed 2026-07-18 (`dd77ef1`):** `planVector3` case 4 now gates the flag on `senseInlinedBody(stateText).candidate` (the same predicate `applyMigrate` uses for the whole-body relocate) — fires iff the relocate it defers to will actually run. Skeleton/already-relocated → 0 flags (eval-project-A real dry-run 12→0); genuine inline narrative → still fires. Advisory-only; noop/idempotency/vectors unchanged. |