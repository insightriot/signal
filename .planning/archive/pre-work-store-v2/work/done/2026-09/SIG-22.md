---
id: SIG-22
type: BUG
status: C
title: "`doc-hygiene.js` internal-link check touches disk outside the walk root."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:49
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B22
---
| B22 | `fixed` | P3 | **`doc-hygiene.js` internal-link check touches disk outside the walk root.** `checkInternalLinks` resolves `](target)` to `resolve(dirname(f), pathPart)` (`:110`) then `existsSync` + (anchors) `readFile` (`:361`) — a `](../../../x.md#a)` target reads outside the repo. Read-only, offline (AC4.3 no-network independently verified), runs only in Signal's OWN test suite → no exfil, but an unbounded disk touch. **Fix (~2-3 LOC):** bound the resolved target to repo root before existsSync/readFile. Deferred (Suggestion, M5.E3 REVIEW rev-sec). |