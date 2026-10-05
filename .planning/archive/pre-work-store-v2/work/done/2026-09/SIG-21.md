---
id: SIG-21
type: BUG
status: C
title: "`resolveDecisionId` rebuilds the whole D-ID map from disk on every call;
  the FR5 anchor gate calls it once per evicted…"
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:48
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B21
---
| B21 | `fixed` | P3 | **`resolveDecisionId` rebuilds the whole D-ID map from disk on every call; the FR5 anchor gate calls it once per evicted ID.** `migrate-memory.js:2803-2804` loops evicted IDs and calls `resolveDecisionId` (→ `buildDecisionIdMap` walks `archive/` + reads every DECISIONS.md + regexes the corpus) per ID → O(N_ids × full-corpus-rebuild). Fine at Signal's scale (73 IDs × ~183 KB, one-time migrate) but drags on a project with thousands of decisions. **Fix (~5 LOC):** build the map once before the gate loop, resolve in-memory — safe *here* because eviction has already written to disk before the gate runs (map is stable across the loop); leave the mechanical-fresh `resolveDecisionId` for the standalone/self-heal callers. Deferred (Suggestion, M5.E3 REVIEW rev-code). |