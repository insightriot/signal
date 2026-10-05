---
id: SIG-26
type: BUG
status: C
title: "`shipFR1Check` returns `{skipped:true, 'not an Epic-close'}` for a
  FULLY-completed Epic on the Signal-on-Signal…"
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:53
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B26
---
| B26 | `fixed` | P3 | **`shipFR1Check` returns `{skipped:true, 'not an Epic-close'}` for a FULLY-completed Epic on the Signal-on-Signal self-hosted flow — the flagship FR1 retro gate silently skips.** At M5.E4's SHIP (all 6 phases done, Epic complete), `shipFR1Check({state, profile, milestoneContent, baseDir})` returned `{halt:false, skipped:true, reason:'not an Epic-close SHIP…'}`, so the retro enforcement did NOT fire. The M5.E4 retro was written manually (correct), but the hard-block designed to prevent a missing retro didn't engage — the Epic-close detection likely relies on a `MILESTONE-{n}.md` close-signal the hand-managed flow (Epic-prefixed artifacts, hand-set `current_epic`) doesn't populate. **General risk:** a hand-managed / self-hosted project could close an Epic with no retro and no gate firing. Surfaced 2026-07-21 (M5.E4 SHIP). Needs triage: inspect the Epic-close predicate in `shipFR1Check` + how it reads the milestone file. |