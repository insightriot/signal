---
id: SIG-35
type: BUG
status: T
title: "`sweep.js checkIndexFreshness` unwrapped compose/diff can crash the
  read-only sweep."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:63
legacy_id: B35
---
| B35 | `confirmed` | P3 | **`sweep.js checkIndexFreshness` unwrapped compose/diff can crash the read-only sweep.** Every other sweep check is crash-safe (try-catch→advisory), but the managed-index path (`enumeratePlanningDocs`/`renderPlanningIndex`, sweep.js:86-88) is unwrapped — a throw mid-walk crashes the whole sweep. **Low reachability** (only a Signal-managed, non-empty, non-foreign INDEX.md reaches it — stranger repos early-return at the foreign/absent gate, so the stranger-repo "never crash" contract HOLDS; the gap is a Signal repo with a pathological `.planning/`). Surfaced 2026-07-24 (M5.E6 REVIEW code-quality). Fix: wrap the compose-and-diff in try/catch → advisory (RED-first via a mocked-throw on `enumeratePlanningDocs`), making the never-crash guarantee total. Not a SHIP blocker. **→ Status reconciled 2026-08-02** (fix lane, BUGS.md status-vs-code sweep): **triaged — still live.** `checkIndexFreshness` remains unwrapped on both ends: its `enumeratePlanningDocs` / `renderPlanningIndex` compose-and-diff has no try/catch (`tools/lib/sweep.js:93-95`), and `runSweep` calls it bare at `:404`. Every neighbouring check is crash-safe; this one is the exception. |