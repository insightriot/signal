---
id: SIG-68
type: BUG
status: T
title: The detected Epic/linear mode is never printed, so a project reads as
  Epic mode to a human and linear to Signal with…
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:107
legacy_id: B68
---
| B68 | `confirmed` | P3 | **The detected Epic/linear mode is never printed, so a project reads as Epic mode to a human and linear to Signal with nothing saying so.** The unimplemented half of `B53`'s fix shape (part 2 of 3), split out 2026-08-02 when that entry was reconciled to `fixed` — parts (1) and (3) shipped, this one did not, and folding it into a closed row would have hidden it. `detectMode` (`tools/lib/state.js`) is called by **no renderer**: `tools/lib/status.js` never imports it, and `tools/lib/resume.js` names it only in a comment (`:146`). It is named in exactly one command file, `ship.md`. So `/sig:status` and `/sig:resume` both print a briefing whose artifact resolution, retro gate and archive eligibility all depend on a mode neither one shows. **Live instances today:** `eval-project-C` (`current_epic: "PHASE12"`) and `eval-project-I` (`current_epic: "M1"`) — both non-strict, both therefore linear to every resolver, both reading as Epic mode to anyone who opens STATE.md. M5.E16's sweep check `(h)` (`epic-id-not-strict`) reports the contradiction, but only when someone runs `/sig:sweep`; the two commands people actually run at orientation stay silent. **Fix shape:** call `detectMode(state)` in `renderResumeBriefing` and the `/sig:status` renderer and print the mode on the `Phase:` line. **Sequencing:** natural fit for **M5.E18**, which is re-measuring the linear/Epic split across the corpus anyway. |