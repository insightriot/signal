# Phase Gate Reference

Every phase transition requires explicit approval. No exceptions.

## Gate Structure

Each gate has three components:
1. **Exit criteria** — what must be true before leaving this phase
2. **Anti-rationalization check** — countering the specific shortcuts agents take at this transition
3. **Human approval** — the user explicitly says "proceed"

## Gate Summary

| Transition | Key Artifacts | Must Exist |
|---|---|---|
| → DISCUSS | (start) | `.planning/` directory, `STATE.md` |
| DISCUSS → PLAN | `PROJECT.md`, `CONTEXT.md`, `REQUIREMENTS.md` | All decisions locked or explicitly deferred |
| PLAN → EXECUTE | `{phase}-PLAN.md`, `{phase}-RESEARCH.md`, `{phase}-VALIDATION.md` | Plan passes 8-dimension validation |
| EXECUTE → VERIFY | Atomic commits, passing tests | All plan tasks completed |
| VERIFY → REVIEW | `{phase}-VERIFICATION.md` | All acceptance criteria met |
| REVIEW → SHIP | `{phase}-REVIEW.md` | All Critical/Important issues resolved |
| SHIP → (done) | PR created, checklist complete | Clean history, docs updated |

## Verify → Execute Loop

VERIFY can loop back to EXECUTE up to 3 times. After 3 failures:
- Escalate to the user
- Reassess whether the plan needs revision (loop back to PLAN)
- Do not force-pass verification

## Gate Enforcement

Gates are enforced by checking for the required artifacts in `.planning/`. An agent cannot begin a phase's work if the prior phase's artifacts are missing or incomplete.
