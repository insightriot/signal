---
id: SIG-69
type: BUG
status: T
title: The SHIP retro write-guard cannot evaluate a project whose `current_epic`
  is non-strict, and says nothing — the third…
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:108
legacy_id: B69
---
| B69 | `confirmed` | P3 | **The SHIP retro write-guard cannot evaluate a project whose `current_epic` is non-strict, and says nothing — the third behaviour on a field everyone assumed had two.** `checkProposedStateWrite` reaches `expectedRetroPath({current_epic})` → `deriveRetroPath`, which **throws** on any value not matching `M{N}[.{N}]*.E{N}` (`tools/lib/retrospective.js:149`). The `PreToolUse` hook wraps that call in a bare `catch` and exits 0 (`hooks/check-state-write.js:116-122`). **The fail-open is deliberate and correct** — the comment says so, and a `PreToolUse` hook must never crash a normal edit. **What is wrong is the silence:** the guard did not pass, it *could not run*, and nothing distinguishes those. **`B42` enumerated two behaviours for this field** — Layer 1 hard-halts on a missing Epic, *"Layer 2 fails open — `checkProposedStateWrite` returns `{block:false}` on a null/absent `current_epic`"*. A **truthy but non-strict** value is neither: it throws. **Verified by execution 2026-08-02** against `eval-project-I` (`current_epic: M1`, `phase: SHIP`, all six pre-SHIP phases present in `completed_phases` — every precondition met): `checkProposedStateWrite` threw `deriveRetroPath: malformed epicId "M1"`. `eval-project-C` does **not** trip it, and only by accident — its `phase` is a prose blob rather than the literal `SHIP`, so the function returns at the first gate. **Exactly `B63`'s shape one layer over** — *could not apply* rendered identically to *already clean* — which is why it belongs with **M5.E18**'s port of M5.E16's four-status model rather than as a standalone fix. **Fix shape:** have `checkProposedStateWrite` catch the malformed-ID case itself and return a distinct `{block:false, unevaluated:true, cause:"non-strict-current-epic"}`, and have the hook surface it as a warning instead of swallowing it — the same *needs a person vs. clears itself* split `/sig:sweep` already ships. |