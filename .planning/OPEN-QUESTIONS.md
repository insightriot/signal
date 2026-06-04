# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

**Triage state (2026-04-26, M3 Task 5):** of the 20 active items going into triage, 14 fix-nows applied (state.js, command markdowns, references), 4 marked resolved (PROJECT.md location moved in M4; numeric `{phase}-` prefix locked in DECISIONS; MILESTONE-3.md schema-drift corrected; REVIEW/SHIP read-prior-artifacts didn't bite in dogfood), 1 deferred to M4 (slash-command testing harness), 1 confirmed-no-change with current data (4-tier count). The fix-now applications are documented in commit `<filled-in-on-commit>`. This file now carries only items that genuinely remain open.

---

## Tier count: validate 4 tiers — confirmed for v1, revisit on real-user data

**Status:** No tier-count change for v1. Two data points (FULL URL shortener + SKETCH CSV-to-JSON) didn't surface "between SKETCH and FEATURE" or "SPIKE/SKETCH redundant" cases. Two data points isn't statistically meaningful but is enough to *not change* the schema speculatively.

**Watch for** during real-user calibration runs:
- Projects landing between SKETCH and FEATURE (would suggest a 5th tier).
- SPIKE feeling interchangeable with SKETCH in practice (would suggest consolidation).
- Calibration questions missing a real dimension (team size, deadline pressure).

**Resolve by:** post-v1 with real-user calibration data.

---

## Slash-command testing strategy for Signal itself

**Deferred to MILESTONE-4 (or post-v1).** Slash commands are markdown interpreted by Claude — testing them requires a fixture-based command-execution harness (start project at known state, drive command, diff against golden output) or a prompt-replay system. Both are non-trivial. The two M3 dogfood passes provide more practical coverage than any unit-test harness would.

**Current state:** 96 vitest tests cover tooling helpers (`state.js`, `profile.js`, `context-monitor.js`, `status.js`). No tests for command markdowns themselves. Validator (`tools/validate-plugin.js`) checks file existence + structure but not behavior.

**Resolve by:** MILESTONE-4. Couples to the v2 architecture additions (more commands → more surface to verify mechanically).

---

## M4.5.E5 re-entry note (logged via /sig:checkpoint --context before a context clear): docs/launch-post.md + docs/demo-script.md are committed DRAFTS awaiting Brett voice/accuracy pass before publishing — not blocking S2-S4. EXECUTE is paused at the strict gate: Slice 1 complete (t1-t4), awaiting explicit go to start Slice 2 (tester brief + friction-log).

*Logged 2026-06-04 via /sig:checkpoint*
