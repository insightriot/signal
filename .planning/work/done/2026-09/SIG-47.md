---
id: SIG-47
type: BUG
status: C
title: "`/sig:resume` reads `0/7 phases done` immediately after a linear-mode ship."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:82
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B47
---
| B47 | `fixed` | P3 | **`/sig:resume` reads `0/7 phases done` immediately after a linear-mode ship.** M5.E9's FR5 trim clears `completed_phases` at ship (relocating the run to `STATE-HISTORY.md`), so the first thing a user sees after shipping is `Phase: SHIP (0/7 phases done)` — at exactly the moment they want confirmation something *completed*. Defensible on a literal reading (the **next** run has zero done) and it is cosmetic, not data loss; the archived run is intact and verified zero-loss. **Cataloged at M5.E9 REVIEW (2026-07-27) as I1, deliberately not fixed in-phase:** the honest fix is for the resume banner to render the archived run's count, which means teaching `resume.js` to read `STATE-HISTORY.md` — **a new capability, not a defect fix**, and Slice 2 was already the Epic's largest unit. Recorded rather than absorbed so the next reader does not have to rediscover it. **Fix shape:** `renderResumeBriefing` reads the most recent `phase-log:archived` section when the live list is empty and `phase: SHIP`, and renders e.g. `SHIP (last run: 7/7 done, archived)`. **FIXED 2026-09-25 (fix lane, with `B124`)** — exactly the recorded fix shape: `readLastArchivedRun` (`tools/lib/resume.js`) reads the newest `linear run ending …` section of `STATE-HISTORY.md` — **not** any `phase-log:archived` section, since quarantine dumps share the marker and would have been reported as a run — and the briefing renders `SHIP (last run: 6/7 phases done, archived)`. Linear mode only, matching the trim. Pinned by a test that drives the real writer (`transitionPhase` … `completePhase('SHIP')`) and fails on the old renderer. |