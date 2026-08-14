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

> **Refreshed 2026-08-09 (backlog-review triage, finding `S1`).** Three claims below were stale, and
> this file was the only live governance doc untouched since 2026-07-25. **Milestone 4 closed
> 2026-05-12 and M4.5 closed 2026-07-15**, so both the deferral target and the resolve-by named a
> milestone that no longer exists. The question itself is still open and is **more** decidable now,
> not less — see the corrected state below.

**Current state (2026-08-09):** **2410 vitest tests across 143 files** cover the `tools/lib` layer.
There is now partial mechanical coverage of the command markdowns themselves, which did not exist
when this question was written: `tests/commands-wording.test.js`, `tests/prescribed-cli.test.js`
(walks every `claude plugin` string a command prescribes and checks it against an identity derived
from `plugin.json` + `marketplace.json`), `tests/intra-file-consistency.test.js` (`B89` — a command
may not permit what the same file forbids), `tests/cross-file-consistency.test.js`, and
`tests/guard-callers.test.js` (whose own coverage gap is `B81`). **Behavioural** execution of a
command is still untested; `tools/validate-plugin.js` still checks structure, not behaviour.

**What has changed the decision inputs.** `M5.E8` built the adherence harness — Signal *can* now
measure whether a specific instruction changes what an agent does — and published the ceiling:
**91 of 407 directive lines (22.4%) are trace-measurable.** That is the honest answer to "can we
test command markdown," and it is a partial yes with a measured bound rather than the flat no this
entry assumed. The open question is therefore narrower: **is a fixture-based execution harness worth
building for the other 77.6%, given the adherence harness already covers the measurable slice?**
Related open item: the slash-command testing harness (A5) in [`BACKLOG.md`](BACKLOG.md) § Sprint 5.

**Resolve by:** unchanged in substance — when command count or a measured adherence failure makes the
gap concrete. **No longer keyed to a closed milestone.**

---

*(The M4.5.E5 re-entry breadcrumb was removed 2026-06-06 — E5 shipped as v0.1.4. The pending outward loop, voice pass + recruit ≥3 testers, is tracked in `M4.5.E5-LAUNCH-KIT.md` §3 and `M4.5.E5-SHIP.md`, not here.)*

## Should worktree-isolated agent dispatch become a build item?

Raised 2026-07-25 (M5.E7 Wave 1 checkpoint). Concurrent agent dispatch against a
shared worktree caused two agents to silently absorb each other's files (D-M5E7-9b).
The demand signal is strong — Theme F (EXECUTE dispatch guidance) was raised
independently in M5.E1, M5.E4, and M5.E5 with **zero coverage in any of the four
ledgers**, and it then reproduced live during this Epic. The supply side is named:
superpowers' `using-git-worktrees`, one of four skills with no Signal analog.

The open part is **scope**, not merit: is the fix (i) an executor-guidance line only,
(ii) `isolation: "worktree"` wired into the dispatch path, or (iii) the full
`using-git-worktrees` port? M5.E7's disposition pass (S3.t8) should answer it — this
entry exists so the question survives a context clear if it doesn't.

## Should FULL tier REQUIRE an independent review pass at REVIEW, rather than leaving it to the maintainer to remember? M5.E15's self-review found nothing and had to hand-write its own limitation; the independent cloud pass then found the one thing it missed. Evidence for, from one Epic.

*Logged 2026-08-06 via /sig:checkpoint*

## Does M5.E7 ever get a version number? `CHANGELOG.md` carries a DATED `## [Unreleased] — 2026-07-26 — The v2 direction audit (M5.E7)` heading. A dated "Unreleased" is a contradiction, and doc-hygiene deliberately SKIPS `[Unreleased]` for version-consistency, so that section is invisible to the guard that would catch it. Latent trap: the next release cut is one reordering away from folding the wrong section. May be deliberate — M5.E7 shipped analysis, not code.

*Logged 2026-08-06 via /sig:checkpoint*

## Should the "one canary is not a survey" caveat name all declared deletion sites instead of just `canary.command`? It renders "a fact about {id} in commands/{command}.md", accurate when a canary had one anchor. The instruction now lives at five declared sites. `canary.command` is genuinely the measured command, so the sentence is defensible — but a reader could take it as the full footprint. Deliberately not changed in REVIEW: wording on a published-record template deserves its own decision.

*Logged 2026-08-06 via /sig:checkpoint*

*(The `B46` question — "is it dismissed with the row kept?" — was **answered 2026-08-11**: `B46` was
re-triaged to `dismissed` with its row intact, in PR #140. Removed here per this file's own rule
(delete resolved questions; the record lives in `BUGS.md`). **Worth noting how it was found:** the
question outlived its answer by three days and was caught by a sweep of this file, not by anything
that reconciles a question against the bug it asks about — the second such stale record found on
2026-08-14, alongside `B38` reading `confirmed` after shipping. The rest of this file was **not**
audited in that pass.)*

## Where do decisions get recorded outside `/sig:plan` (`A2`)? Recommendation was park-with-trigger, because `B89` had just made the drain required and nobody had seen the new behaviour yet; Brett pushed back that it may be worth building sooner. The reframe that shrinks it: `/prose:backlog` ANALYSES and only Signal RECORDS, so `A2` is 'somewhere to record decisions outside PLAN' — fix-lane sized, not an Epic. Undecided as of 2026-08-09.

*Logged 2026-08-09 via /sig:checkpoint*
