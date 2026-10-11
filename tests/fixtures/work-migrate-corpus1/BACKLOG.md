# Backlog

What Lanternfly is working on next. Defects are kept in `.planning/BUGS.md`.

## Product direction

### #310 — Strategic: Lanternfly as a shared kitchen platform — household API + per-plan history · **roadmap** · large
https://example.com/lanternfly/issues/310
Move Lanternfly from a single-cook planner to a shared household tool: plans get a history, and other apps read them over an API. Spans several milestones.

### #305 — Future: implement leftovers tracking (documented, not in code) · **roadmap** · large
https://example.com/lanternfly/issues/305
Leftovers are in the data model notes but absent from the schema, the exporters and the planner UI. Deferred to v5.

## Planner polish (v4.2 remainder)

### ~~#288 — New Plan dialog: offer 'Import file' as a third start · **roadmap** · small~~ · **DONE — M9.E2, 2026-03-08**
https://example.com/lanternfly/issues/288
**Done** in M9.E2 (S5) — [PR #57](https://example.com/lanternfly/pull/57).
Today a cook makes an empty plan and then hunts for Import to load one from a file.

### ~~#271 — First screen after sign-in is a plain grey wait · **hygiene** · small~~ · **DONE — M9.E2, 2026-03-08**
https://example.com/lanternfly/issues/271
**Closed — superseded** (M9.E2): an earlier change removed the grey wait; the planner paints immediately.
The first screen after sign-in is a plain grey "Loading..." with no logo.

### ~~#279 — No narrow-screen layout and no 'desktop only' notice · **hygiene** · medium~~ · **DONE — M9.E2, 2026-03-08**
https://example.com/lanternfly/issues/279
**Done** in M9.E2 (S6): narrow windows now show a notice. A layout that actually adapts is still not built — file it again if it matters.
Panels have fixed widths, so small screens cut them off.

## Code health & ops

### #244 — Fix 4 effect-ordering lint warnings in the planner · **hygiene** · small
https://example.com/lanternfly/issues/244
Half are fixed; the rest are suppressed with a comment saying why.

### Planner does not enforce the length cap on notes · **hygiene** · small
<!-- backlog-key: 3f9a0c1d2e4b5a6978877665544332211aabbccd -->
Moved here from the ideas list (2026-03-07). The schema limits notes to 2000 characters but the text box does not, so a long note fails on re-import.

### Pantry toggle jumps between the top and bottom of the rail
Noticed during the M9.E2 demo (2026-03-08): the button changes position when clicked. Keep it in one spot.

### M9.E2 REVIEW follow-ups · **hygiene** · small
Deferred from M9.E2 REVIEW (2026-03-07):
1. Skip the scroll animation when the panel is already open.
2. Reject imported files over 1 MB.

---

*Last updated: 2026-03-08*
