# Backlog

Live work for Lanternfly. Bugs live in `.planning/BUGS.md`.

## Product direction

### #99 — Strategic: Lanternfly as a shared kitchen platform — household API + per-plan history · **roadmap** · large
https://example.com/lanternfly/issues/99
Move Lanternfly from a single-cook planner to a shared household tool: plans get a history, and other apps read them over an API. Spans several milestones.

### #96 — Future: implement leftovers tracking (documented, not in code) · **roadmap** · large
https://example.com/lanternfly/issues/96
Leftovers are in the data model notes but absent from the schema, the exporters and the planner UI. Deferred to v5.

## Planner polish (v4.2 remainder)

### ~~#89 — New Plan dialog: offer 'Import file' as a third start · **roadmap** · small~~ · **DONE — M9.E2, 2026-03-08**
https://example.com/lanternfly/issues/89
**Done** in M9.E2 (S5) — [PR #57](https://example.com/lanternfly/pull/57).
Starting a plan from a file means creating a blank plan first, then finding Import in the toolbar.

### ~~#73 — First screen after sign-in is a plain grey wait · **hygiene** · small~~ · **DONE — M9.E2, 2026-03-08**
https://example.com/lanternfly/issues/73
**Closed — superseded** (M9.E2): an earlier change removed the grey wait; the planner paints immediately.
The first screen after sign-in is a plain grey "Loading..." with no logo.

### ~~#82 — No narrow-screen layout and no 'desktop only' notice · **hygiene** · medium~~ · **DONE — M9.E2, 2026-03-08**
https://example.com/lanternfly/issues/82
**Done** in M9.E2 (S6): a desktop-only notice below 1024px. A real narrow layout is not done — re-file as roadmap if wanted.
Fixed widths and no breakpoints, so phones get squeezed layouts.

## Code health & ops

### #58 — Fix 4 effect-ordering lint warnings in the planner · **hygiene** · small
https://example.com/lanternfly/issues/58
Two of four are fixed. Two remain behind documented lint disables.

### Planner does not enforce the length cap on notes · **hygiene** · small
<!-- backlog-key: 3f9a0c1d2e4b5a6978877665544332211aabbccd -->
Promoted from FUTURE-IDEAS (2026-03-07). The notes field has no maxLength while the schema caps it at 2000 characters, so export then re-import rejects a long note.

### Pantry toggle jumps between the top and bottom of the rail
Seen in the M9.E2 preview walkthrough (2026-03-08). The control moves under the cursor. Fix: put both states' toggle in one place.

### M9.E2 REVIEW follow-ups · **hygiene** · small
Deferred from M9.E2 REVIEW (2026-03-07):
1. Skip the reveal wait when nothing was collapsed.
2. Size cap on imported files.

---

*Last updated: 2026-03-08*
