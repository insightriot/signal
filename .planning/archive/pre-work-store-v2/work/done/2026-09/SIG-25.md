---
id: SIG-25
type: BUG
status: C
title: FR5 AC5.2 has no behavioral read-enclosure test — `rmw-lock.test.js`'s
  throw-under-held-lock tests pass even for a…
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:52
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B25
---
| B25 | `fixed` | P3 | **FR5 AC5.2 has no behavioral read-enclosure test — `rmw-lock.test.js`'s throw-under-held-lock tests pass even for a wrapper that reads OUTSIDE its lock** (a silent lost-update — the exact bug FR5 exists to kill). Read-enclosure IS correct (confirmed by inspection ×3 during REVIEW: all 6 wrappers are `withStateLock(baseDir, () => XxxCore(…))` with the read inside `Core`) and disclosed in `M5.E4-VERIFICATION.md`, so the *behavior* is right — this is a **test-strength** gap only. A true proof needs an interleaving test (writer A pauses after its read → B commits → A resumes → assert A fails-fast or incorporates B), which requires an injectable pause-hook in each Core (none today). Surfaced by the M5.E4 REVIEW test-integrity panel (2026-07-21). Deferred to v0.1.10. |