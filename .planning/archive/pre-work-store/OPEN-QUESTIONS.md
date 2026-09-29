# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

**Triage state (2026-04-26, M3 Task 5):** of the 20 active items going into triage, 14 fix-nows applied (state.js, command markdowns, references), 4 marked resolved (PROJECT.md location moved in M4; numeric `{phase}-` prefix locked in DECISIONS; MILESTONE-3.md schema-drift corrected; REVIEW/SHIP read-prior-artifacts didn't bite in dogfood), 1 deferred to M4 (slash-command testing harness), 1 confirmed-no-change with current data (4-tier count). The fix-now applications are documented in commit `<filled-in-on-commit>`. This file now carries only items that genuinely remain open.

---

## ~~Is `AskUserQuestion` hookable?~~ — **ANSWERED YES, 2026-08-22, by running it**

> **Result: it fires.** A `PostToolUse` hook with matcher `AskUserQuestion` ran and logged
> `FIRED tool=AskUserQuestion` when a question was answered. **`B75` takes the mechanical-observer
> branch below**, not the self-recorded fallback.
>
> **Method, so it can be re-run.** Two matchers in `.claude/settings.local.json`, both running the
> same one-line command: the real arm (`AskUserQuestion`) and a **control** (`Read`) — because a
> silent log cannot distinguish *"the hook did not fire"* from *"the setup is broken."* The control
> logged first, proving the setup live; the real arm logged on the next answered question. This
> control is not in the procedure as originally written above — it was added because `M5.E15`/`B55`
> is exactly the defect of an experiment whose negative arm was never verified to be a real negative.
>
> ⚠ **Two corrections to the procedure as written.** (1) **No restart was needed** — the settings
> watcher picked up the hooks mid-session, so *"restart the CLI (hooks load at session start)"*
> overstates the cost. (2) The first command drafted used `jq`, **which is not installed on this
> machine**; it wrote an empty tool name and would have produced a log that looked like a
> partial failure. Caught by piping a synthetic payload through the command before it went
> anywhere near the config — a step worth keeping.
>
> ⚠ **What this does NOT establish, and the closure note must say so.** The hook observes *that a
> question was asked*. It cannot observe that the **right** question was asked, or that it related to
> the phase in progress. So the gate catches **omission** (no ask happened) and a **false
> self-report** (a claim with no matching observation) — but **not** a pointless question asked to
> satisfy the check. Stronger than the fallback; not airtight. Claiming otherwise is this
> repository's named defect.

*Raised 2026-08-22, mid-design, after Brett approved building `B75`'s closure condition. Settled the
same day, by running it rather than reading about it.*

**Why it matters.** `B75` ships open because the `attention` dial is documented end to end and
**enforced nowhere** — nothing fails if a command skips an in-phase ask. Brett's call: *"needs to be
built if we're claiming it."* The strongest design is a **mechanical observer** — a `PostToolUse`
hook matching `AskUserQuestion` that records the ask **as it actually happened**, rather than
trusting the model's self-report. Signal already ships a `PreToolUse` hook with a matcher
(`Edit|Write` → `check-state-write.js`), so the mechanism is proven here.

**The question is unresolved, and two readings of the same doc page disagree:**

| Reading | Says |
|---|---|
| First fetch | *"`AskUserQuestion` is NOT hookable… it wouldn't appear as a regular tool name."* |
| Second fetch, asking for the **positive** enumeration | The docs give **no complete list**; the only tool documented as skipping both hooks is **`EndConversation`**. |

**The second is the load-bearing one and it contradicts the first.** The first answer's negative was
an **inference by the summarising model**, not a quoted sentence — the exact failure mode
`v0.1.25` shipped a provenance rule for (*do not restate an upstream summary about a third artifact
without opening it*). So: **not settled, and it must not be designed against in either direction.**

**How to settle it — empirically, in one cheap test.** Add a `PostToolUse` hook with matcher
`AskUserQuestion` that appends one line to a scratch file, restart the CLI (hooks load at session
start), trigger any `AskUserQuestion`, and look. A fired hook settles it yes; a silent one settles it
no. **Do this before writing any of the design below.**

**If hookable → the real thing.** Hook records the ask; a phase-exit gate refuses when
`gates.confirm_in_phase` was set and zero asks were recorded for that phase. Mechanical observation,
so it catches both omission *and* a false self-report.

**If NOT hookable → the honest fallback, and the claim must narrow with it.** Self-recorded ledger +
the same phase-exit gate. That catches **omission** (the realistic case: the ceremony just does not
happen) and **cannot** catch **fabrication** (a recorded ask that never occurred). ⚠ If this is what
ships, `B75`'s closure note must say so in those words — *"fails when the ask is skipped, not when it
is falsely reported"* — because claiming enforcement it does not have is the defect this repository
is named after.

**Undecided either way:** where the ledger lives (STATE.md frontmatter costs lock contention and
size; a separate file costs a doc-runtime artifact), and whether it is tracked (high-churn,
machine-local) — which decides what a fresh clone's gate does when no ledger exists.

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

## ~~Does M5.E7 ever get a version number?~~ · **ANSWERED 2026-08-18 — no, and the heading changed instead**

**Decision (Brett, 2026-08-18): relabel, do not version.** The section now reads `## 2026-07-26 — The v2 direction audit (M5.E7) · analysis only, no version cut`.

**Why not a version.** The entry's own opening line is *"No code shipped, so no version was cut."* Assigning one would record a release that never happened — a false published fact in the changelog, which is precisely the class `M6.E2` shipped checks for. The contradiction was never *"this needs a version"*; it was a heading claiming *unreleased* about work that was finished.

**And its absence from `/sig:update` is now correct rather than a defect** — there is no version delta for any user to have received. The matching `BUGS.md` entry is closed on the same reasoning.

*Logged 2026-08-06 via /sig:checkpoint. Single-homed 2026-08-18 (`M6.E2` `AC6.2`). Answered 2026-08-18.*

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

## `M6.E1` S3: manifest or vendor for `yaml`? Decide before building S3.t2.

`AC3.5` requires PLAN's A-vs-B call to be made explicitly rather than defaulted into. **A (a
two-file `plugin/package.json` + lockfile declaring `yaml` only)** is the recommendation on the
evidence in `M6.E1-RESEARCH.md` §4; **B (commit `plugin/node_modules/yaml/`)** removes the install
entirely but needs a `.gitignore` exception and hand-updates. **If B wins, `D-M6E1-3` is superseded
in DECISIONS.md, not silently drifted from.**

*Logged 2026-08-15 via /sig:checkpoint (M6.E1 EXECUTE, S2 close)*

## `M6.E1`: the `depSource` fallback in `adherence-harness.js` becomes dead code when S3 lands — remove it or it is an unreached branch.

S2 added `const depSource = existsSync(join(pluginRoot,'package.json')) ? pluginRoot : join(pluginRoot,'..')`
because the payload has no manifest **yet**. The moment S3.t2 adds one, the `..` branch stops being
taken and becomes a path nothing reaches — **the exact class
`analysis/UNREACHED-MECHANISM-ANALYSIS.md` names**, introduced by this Epic while it was being
careful about the same thing elsewhere. Either delete the fallback at S3, or keep it and state in a
comment why an unreachable branch is retained.

*Logged 2026-08-15 via /sig:checkpoint (M6.E1 EXECUTE, S2 close)*

## Can the repo go private without breaking installs?

**Status:** Open — logged 2026-08-19 via `/sig:add`.

Can Signal's repo become private without breaking installs — and what unpublishes the existing history? Brett answered the underlying call on 2026-08-19: unpublish old, not just stop publishing new. Key mechanism found: making the repo private removes all 754 commits of .planning/ from public view instantly — no filter-repo, no force-push, and critically no broken commit SHAs, so ADHERENCE-LOG.md's reproducibility anchors survive (a history rewrite would destroy them, which is the documented reason the Epic lane merges rather than squashes). The constraint that follows: the repo that goes private cannot be the repo that serves installs, so these must become two things. M6.E1 already did most of that split — marketplace.json points at ./plugin, which is self-contained at 3.2 MB against a 207 MB repo; the separation exists but is expressed as a config path inside one repo rather than as two repos. Two candidate shapes: (a) publish-from-private — working repo goes private, a new public repo carries only plugin/ plus the manifest, pushed at each release; the public repo structurally cannot leak .planning/ because it does not contain it; cost is a URL change so the four non-Signal users must re-point their marketplace. (b) keep the URL and replace its contents — fresh plugin-only history force-pushed over the existing public repo, full history moved to a new private repo; no URL-level disruption but existing clones would have unrelated history. TWO UNKNOWNS, both testable rather than arguable, and neither is asserted: whether Claude Code can install from a private repo when the user has git credentials (probably, since it is a git clone underneath, but unverified), and how an existing install reacts to its upstream history being replaced. Any migration sent to the four users must be run in an isolated config before being sent — B102 was migration advice that uninstalled Signal and said it hadn't, and it was found by running the commands, not reading them. The framing that should decide it: whether the payload/repo boundary is enforced by construction (two repos, the public one physically cannot contain planning docs) or by configuration (one repo, a manifest path, and a rule that keeps holding) — given this repo's record with rules that exist only as config or prose, construction is the recommendation. Offered and not taken up yet: a contained spike standing up a throwaway private repo plus a plugin-only public mirror, running a real install and a real /sig:update against both. NOTE ON HOMING: this question had no row anywhere before this capture — it has been called "open and deliberately deferred" across several releases while living only in CLAUDE.md and CONTEXT.md narrative prose, which is the shape D-M5E18-1 exists to prevent.

**Resolve by:** (unset — triage at next planning pass)

---
