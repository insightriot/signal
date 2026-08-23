# Cross-model review at REVIEW — the scoping pass

**Written 2026-08-23.** Discharges the backlog item *"Cross-model review at REVIEW — **scope it,
don't build it yet** · question first"*, third of the three autonomy-counterweight items accepted
2026-08-08. The item's own instruction was to force a choice between two scopes before any build.

**Result: build neither — because a measurement nobody had taken, and which cost nothing, says the
binding problem is somewhere else entirely.** Signal has run an independent reviewer on every pull
request since `v0.1.31`. Nobody had ever read its output. Reading it produced **7 real findings
across 11 PRs**, four of them in this repository's own work from the last two days.

---

## What the item asked

`FM-1` of `LOOP-ENGINEERING-ANALYSIS.md` names claim integrity as autonomy's central risk and
prescribes adversarial verification with **fresh context**. The backlog item sharpens the objection:

> Fresh context removes the writer's **conversation**; it does not remove the writer's **priors**.
> The evidence in FM-1's own paragraph is that every major catch in this project came from *a human
> reading documents against each other* — **two different readers, not one reader twice.**

Two candidate scopes were named: **cross-tier** (different-strength model, same family) and
**cross-vendor** (write with Claude, review with something else).

## Finding 1 — the split runs the wrong way, and that is the whole answer

Line up each option against the objection that motivated it:

| Option | Reachable? | Does it give a *different reader*? |
| --- | --- | --- |
| **Cross-tier** — same family, different strength | **Yes.** Agent frontmatter takes a `model:` key; it is a one-line change per agent. | **Barely.** Same vendor, same training lineage, largely the same priors. It changes how *hard* the reader thinks, not *what it is disposed to believe*. |
| **Cross-vendor** — a different family entirely | **No, not as a promise.** See Finding 2. | **Yes.** This is the only option that answers the objection as written. |

**The cheap option does not buy the thing, and the option that buys the thing cannot be promised.**
That is not a reason to pick the cheap one anyway. A cross-tier reviewer shipped under the banner of
"cross-model review" would be this repository's named defect — a mechanism whose label claims a
property it does not have — and the item that commissioned this scoping exists precisely to stop
that.

## Finding 2 — cross-vendor cannot be capability-detected, measured not assumed

`analysis/PHASE-C-BUILD-VS-ADOPT.md` (2026-08-21) went looking for exactly this and found:

- No environment variable enumerates the session's tool roster. **One feature flag is not a
  capability list**, and nothing answers *"is a second vendor's reviewer available here?"*
- The documented surface **undercounts reality** — the docs name two `CLAUDE*` variables; thirteen
  were observed reaching a Bash child on the same machine.
- Its verdict, quoted: *"do not build capability detection on these variables. If a future need is
  real, the honest mechanism is a documented one or none."*

The precedent it rests on is `B52`: `plugin-binding.js` refuses `CLAUDE_PLUGIN_ROOT` and derives the
path from the module's own location, because *the env var says where the plugin is supposed to be,
and the bug is exactly the case where those disagree.*

**So a Signal command cannot ask whether a second-vendor reviewer exists.** It can only be told.

## Finding 3 — Signal already runs a second reader, and nobody has counted what it catches

**`.github/workflows/claude-code-review.yml` has run `/code-review --comment` on every pull request
since `v0.1.31`.** It has fresh context by construction, it comments rather than blocks, and it has
been green on every PR in this span.

**Nobody had ever checked whether it found anything.** It is a live, already-paid independent review
pass, and its catch rate was unmeasured — which made every argument about *adding* a second reader
an argument from theory while the evidence sat uncollected in the PR history.

**So the measurement was taken, 2026-08-23. It is the first hard number this discussion has had.**

| PRs since the reviewer went live | Produced nothing | Produced findings | Findings | Real on inspection |
| --- | --- | --- | --- | --- |
| **11** (`#187`–`#197`) | **8** | **3** | **7** | **7 of 7** |

- **`#190`** — two contradictions inside `LOOP-ENGINEERING-ANALYSIS.md`: a table row rating Memory
  *"Built, and unusually strong"* with no shortfall while the prose directly beneath calls Memory
  *"the one real gap"*; and an amendment refuting the sentence above it (*"bounded by the iteration
  cap"*) while leaving that sentence unedited. **Both still live when read on 2026-08-23** — filed
  by the reviewer two days earlier and never opened. Fixed in this pass.
- **`#195`** — two holes in `environment.js`'s names-never-values guard. **Both confirmed by
  execution**, not by reading: a `.env` paste inside a code fence passed, and so did blockquote,
  bold, numbered-list and colon forms of an assignment. Six shapes tested, six passed. Fixed in this
  pass.

- **`#197`** — **three more, in the fix for `#195`.** A CRLF regression (tightening the trailing
  match to `[ \t]*` left a `\r` that made every pattern fail on a CRLF checkout — a silent
  fail-open, in the repo's only `.planning/` reader not normalising line endings); a **new bypass**
  (widening the placeholder rule to accept any bracketed content let `API_KEY=[sk_live_…]` through,
  opened in the same change that closed six holes); and a **false positive that would have made the
  file unusable** (`SLACK: #eng-help`, `STATUS: active` all refused — and the guard refuses the
  *write*, so the file could not hold the content it exists for). All three confirmed by execution.

**The `#195` result is the one that matters, because of what it survived.** Those two defects were
in a change that had a green 2886-test suite, four mutation tests verified red, and an author who
had just written the threat model. The fenced-paste hole was *pinned by a test asserting it as
intended behaviour* — the author's own reasoning ("an example belongs in a fence") inverted the
threat model, and no amount of the author re-reading the author's code was going to surface that. A
second reader did it in 46 seconds.

**And `#197` is the result that settles it.** Those three were introduced by an author *who had just
read the reviewer's report and was writing a targeted fix for it*. Being told about six holes, and
concentrating on exactly those six, produced a regression, a fresh bypass, and a usability-breaking
false positive. **Attention on the problem is not the scarce resource; a second reader is.**

**The four findings on `#190` and `#195` sat unread for days.** The reviewer was not failing. Nobody
was looking. That is `analysis/UNREACHED-MECHANISM-ANALYSIS.md` one step further along: not a
mechanism nothing reaches, but a mechanism that runs, produces correct output, and **has no reader**.

`#197`'s three were read before merge — but only because this scoping pass happened to be about the
reviewer. **That is not a process, it is a coincidence**, and it is exactly what step 1 below has to
replace.

⚠ The reviewer is *not* cross-vendor and its tier is unpinned, so this does **not** settle the priors
question — it does not show that a *different family* catches different defects. What it shows is
that a **different reader of any kind**, on this project, catches real defects at a rate of roughly
**1 in 4 pull requests** — including in work its author had just verified four ways, and including in
a fix written specifically in response to that same reviewer hours earlier.

## Finding 4 — the honest mechanism, if a build is ever warranted, is DECLARE not DETECT

`PHASE-C` asks for *"a documented one or none."* Signal shipped the documented one yesterday without
this use in mind: **`.planning/ENVIRONMENT.md`** (2026-08-22) is the file where a project records
what its environment has that the code does not show.

A second-vendor reviewer is exactly that kind of fact. The shape would be: the project **declares**
its reviewer in `ENVIRONMENT.md`; REVIEW uses it when declared and says plainly that it is absent
when not. No detection, no broken promise, no capability inference.

**Not proposed for building here** — it is recorded so the next person does not re-derive it, and so
the option is on the table when the measurement in Finding 3 comes back.

## The call

**Build neither of the two scopes as written. The binding problem is not the reviewer — it is that
nothing reads the reviewer.**

Four real defects were produced, correctly, by machinery already paid for, and all four sat unread
until someone went looking for an unrelated reason. Adding a *stronger* or *different-vendor*
reviewer to that arrangement buys nothing: it would produce better findings for the same nobody.

**In order:**

1. ~~**Make the existing reviewer's findings reachable.**~~ **DONE 2026-08-23, same day.** The gap
   was one line wide: `/sig:ship`'s Exit Criteria required a PR and said nothing about its review
   comments, so a merge could step over correct findings without anything noticing.
   `readPrReviewFindings` + `formatPrReviewFindings` (`tools/lib/pr-review-findings.js`) now list
   every unresolved thread with file, line and headline in `ship.md`'s Exit Criteria.
   **It reports; it does not refuse** — consistent with the `B75` call that a skipped step is
   process, and process warns. **`cannot-check` never renders as "none"**, and an unresolved thread
   marked OUTDATED is counted and named rather than treated as handled — measured on this
   repository, all three `#197` findings were still unresolved after being fixed, and one was
   already outdated.
2. **Then, if a second reviewer is still wanted, go cross-vendor and DECLARED** (Finding 4) — never
   cross-tier, which does not answer the objection that motivated the item.
3. **Do not add a phase step** either way. The item said so and nothing here changes it; fold any
   future reviewer into FM-1's existing countermeasure.

⚠ **What this scoping did not establish.** It did not test whether a different-**vendor** reviewer
catches *different* defects — the actual question in the item, still unanswered by anything but
argument. The measured 1-in-4 rate is one project, eleven PRs, and seven findings; that is an
observation, not a sample, and all seven came from just three PRs. It also cannot say what the
reviewer **missed**, since nothing independently audited the eight quiet PRs — a silent reviewer and
a clean diff look identical from here, which is this repository's oldest recurring shape (`B39`).

---

*Companions: `analysis/LOOP-ENGINEERING-ANALYSIS.md` (`FM-1`, the risk this answers),
`analysis/PHASE-C-BUILD-VS-ADOPT.md` (the capability-detection finding),
`analysis/UNREACHED-MECHANISM-ANALYSIS.md` (the class Finding 3 extends).*
