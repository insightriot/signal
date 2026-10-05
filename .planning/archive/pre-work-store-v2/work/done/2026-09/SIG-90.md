---
id: SIG-90
type: BUG
status: C
title: Signal can lower rigor per unit of work, and every surface that
  introduces the feature says it only raises it — so…
priority: P1
source: migration:BUGS.md
source_ref: BUGS.md:155
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B90
---
| B90 | `fixed` | **P1** | **Signal can lower rigor per unit of work, and every surface that introduces the feature says it only raises it — so users pay FULL-tier ceremony on two-hour slices and conclude the tool has no opinion about types of work.** Reported from **`eval-project-A`** 2026-08-08: *"every slice — including a two-hour UI fix — runs the full seven-phase FULL-tier machine… the ceremony is flat-cost regardless of slice size, so small user-facing work is where it hurts most, which is exactly backwards."* **The capability is NOT missing** — verified: `/sig:escalate` implements **de-escalation** (`escalate.md:87`, *"Case C — de-escalation downward (less rigor)"*, with `backfill_warnings: []` because nothing needs back-filling going down); an Epic-scoped `{EpicID}-PROFILE.md` shadows the project profile and `escalate.md:94` **targets it** when an Epic is active; `tier-definitions.md:28` names **FEATURE** *"the default tier — when in doubt, answer FEATURE"*; and `phases_skipped` already drops REVIEW at SKETCH and REVIEW+SHIP at SPIKE. **What is missing is every path to discovering any of it.** (a) The command is **named `escalate`**; `CLAUDE.md` describes it twice as *"promotes tier mid-flight"* and *"upgrades tier mid-flight **if scope grows**"* — a user reading either learns the dial turns one way. (b) Per-Epic tiering is an **optional prose offer** inside `discuss.md`'s Epic-mode section; nothing prompts it, and a linear-mode project never sees it at all. (c) **Nothing notices the mismatch** — no check says *this slice touched two files and ran seven phases at FULL; consider a lower tier*, though the ingredients exist (`readEffectiveProfile` knows the tier; the diff size is a `git` call away). (d) At FULL, `phases_skipped: []`, so **the default path once calibrated FULL is to pay everything, forever, unless somebody actively intervenes.** **Same shape as `B87`/`B88`, filed the same day:** the mechanism exists, nothing reaches for it, and correctness depends on the operator already knowing. Here the cost is not a broken record — it is **a week of a real user's time**, and the conclusion that Signal *"is a complete idiot when it comes to the importance of types of work."* **Candidate fixes, not chosen:** rename or alias the command so the down direction is nameable (`/sig:retier`, or `/sig:escalate --down` surfaced in `CLAUDE.md`); make per-unit tier a **prompt** at Epic open rather than an offer; add a cheap tier-vs-diff-size advisory to `/sig:status`/`/sig:resume`; and state in `tier-definitions.md` that **project tier is a ceiling, not a floor** — the per-unit tier is the one that should move. **Found 2026-08-08** from a `eval-project-A` retro; capability verified present in Signal before filing, so this is a discoverability defect, not a feature request. |