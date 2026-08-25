# Changelog

All notable changes to Signal are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — pre-1.0 (`0.x.y`) allows breaking changes at minor (`0.x`) bumps. See the pre-1.0 line in [`SECURITY.md`](SECURITY.md) for the support policy, and Signal's version-decision rubric (adopted with the M4.5.E5 launch assets) for how minor vs. patch is decided.

`[BREAKING]` tags mark entries that change user-visible behavior, slash-command surface, plugin manifest shape, or `.planning/` schema.

---

## [Unreleased]

### Fixed

- **The release notes' own test-count trailer is now reconciled from the gating run (`B109`).**
  `setFactsTestCount` set the figure in `facts.md` and **nothing set the same figure where a reader
  actually meets it** — the `N → **M tests**` line at the foot of the release notes. That trailer is
  typed by hand into `[Unreleased]` while the Epic is still adding tests, so it was stale **by
  construction** at every cut, not occasionally: `v0.1.33`'s said `2841 → **2927 tests**` while
  `facts.md`, `CLAUDE.md` and `CONTEXT.md` — all written in the same PR — said **2979**. Caught by a
  reviewer comparing two files by hand, because nothing in the suite read it. `B106`'s shape, one
  file over.
- ⚠ **The first design was wrong and measuring is what said so.** It threw on a missing trailer, on
  the reasoning that a cut which stops beats one that publishes a stale figure. Measured before
  building: **14 of 33 released sections carry a trailer and 19 do not** — `v0.1.31`, `v0.1.25` and
  every release before `v0.1.8` among them. Throwing would have failed the cut for the *more common*
  shape, which is `B42`'s defect — a newly-unconditional guard making a legitimate mode unusable.
  The trailer is an optional flourish, not a contract.
- **So absence returns unchanged and SAYS SO.** A silent no-op is `rewriteBugTally`'s bug (a replace
  matching nothing returns the input and the caller reports success on a file it never fixed), so
  every outcome carries a note the CLI prints on **both** the dry-run and the apply path — *absent*
  reads as absent, never as reconciled (`B39`). The baseline is **checked against what `facts.md`
  published and deliberately not rewritten**: an author may legitimately span two releases, and
  silently overwriting a number someone chose is worse than printing a question about it.
- **`foldChangelog` and the trailer now share one implementation of "which section is pending"**
  (`pendingSectionBounds`) rather than two — `B82`'s lesson. They must agree, or the trailer could
  rewrite a released section while the fold correctly refuses to (`B84`, one function over).
- ⚠ **The ordering is load-bearing and pinned by a test:** the trailer edit is scoped by the
  `[Unreleased]` heading that the fold replaces, so folding first makes the pending section
  unfindable and the trailer silently unreconciled — the bug reintroduced by a line swap. Proved by
  mutation in both directions, and **replayed against the real pre-cut `CHANGELOG.md` from git**,
  where it corrects `2927 → 2979` and leaves history byte-identical.

2979 → **2992 tests**.

## [0.1.33] — 2026-08-24 — what nobody was reading

### Added

- **`M6.E4` — "what PLAN reads and writes": three backlog rows batched by SUBJECT, not size.**
  Batching the twelve promoted rows by size — all smalls, then mediums, then larges — was proposed
  and **rejected** (`D-BR0823-1`): size measures *diff* cost, and the six phases exist to pay
  *decision* cost. Two rows both marked `small` belong in opposite lanes. An all-mediums Epic would
  have had **no goal statement**, so goal-backward verification has no goal and the plan-checker's
  goal-alignment dimension nothing to align against.
- **Standing inbox entries leave the live candidate count.** A `<!-- standing -->` marker in an
  entry's header region marks it deliberately permanent; `listDrainCandidates` excludes it and
  `listStandingEntries` reports it as its own category. **This repo's inbox now reports 0 live
  candidates and 1 standing** — it reported 1 live before and structurally *could never reach zero*,
  because its only live candidate was the trigger-watchlist entry marked *"never promote, merge, or
  delete"*, for which every disposition verb is illegal or nonsensical. `commands/plan.md` Step 1b's
  **"no candidates" branch had therefore never executed on this repo**; it has now, and works.
  The marker's header region is bounded **by the Status line**, so an entry that merely *discusses*
  the marker in its prose — this repo's own backlog row does — never becomes standing by talking
  about it.
- **A plan's own numbers are checked against its own criteria** (`tools/lib/plan-consistency.js`).
  `M4.5.E9` shipped a task whose formula `template_floor + 150B × section_count` **rejects exactly
  what its own acceptance criterion requires** (*"one sentence per section passes"* — one sentence
  is ~50–70B). A human caught it during execution; no gate did, and that Epic's retrospective
  recommended this check **twice, in May**, with nothing routing it anywhere. The detector returns
  task units carrying both a quantity and a criterion, and `agents/verifiers/plan-checker.md` must
  address each **by name** under `testability` — the dimension count stays **8**.
  ⚠ It **does not judge whether the numbers work**: that is semantic, and `M5.E10` deliberately
  refused to fake that half. The code finds candidates; the reviewer does the arithmetic.
  ⚠ Its precision contract is **inverted** relative to `M6.E2`'s checks and says so at the point of
  use — it produces a *worklist*, not findings, so it optimises **recall**.
  **Reach: 10 of 13 corpus projects**, 432 task units, **46 flagged (10.6%)**; Signal's own tree
  runs **14.0%**. **No `##` fallback**, refused on measurement rather than taste: in the two
  non-evaluable projects the h2 headings are **8 of 12** and **10 of 12** *section* vocabulary, so
  parsing them would flag `## Phase goal` as a task.
- **The research finally reaches the builder.** `agents/executors/executor.md` declared the PLAN
  task, `CONTEXT.md` and `VALIDATION.md` as its inputs — **`RESEARCH.md` was not among them**, so
  PLAN paid a codebase researcher to find the good exemplars and the executor was never told the
  file exists. Now declared, along with a per-task **exemplar reference** (a pointer, not the
  document — bulk injection fights the context budget). `commands/plan.md`'s required-contents list
  also gained **Files likely touched** — which the planning *skill* has carried all along while the
  authoritative *command* list omitted it — and a per-task **Out of scope** field. All **advisory,
  never fatal**: every corpus plan predates them and was correct when written.

### Fixed

- **A standing entry below a dangling fence was recovered back into the live candidate set.**
  `listDrainCandidatesWithRecovery` kept a bare `!dispositioned` filter while its sibling
  `listDrainCandidates` gained `!standing` — two implementations of one predicate, one updated
  (`B107`/`B82`'s shape). Found **at REVIEW, by reading**: Signal's own inbox could not have hit it,
  since its standing entry sits above any fence. The regression test is **mutation-verified** —
  reverting the one-line fix turns exactly that test red and nothing else.
- **`parseEntries`' JSDoc was detached from its function** — a const had been inserted between the
  doc block's closing `*/` and the `export`, and its `@returns` still listed the pre-`standing`
  shape.
- **`plan-checker.md`'s reach figures were hand-typed**, duplicating `REACH` in a codebase whose own
  module states that `describeReach` is *"the one place a reach figure becomes prose… nothing types
  the numbers."* A prompt is static text and cannot call a function at render time, so the fix is
  `M6.E2`'s own mechanism applied to a prompt: **derive from `REACH`, compare against the file.**
  Editing one without the other now turns the suite red.

- **The `attention` dial finally has an observer — and it reports rather than enforces (`B75`).**
  `attention: attended` sets `gates.confirm_in_phase`, which every phase command describes as
  confirming with you *as the phase runs*. Until now that boolean was written by
  `applyRigorOverrides` and **read by one test and nothing else**. A `PostToolUse` hook on
  `AskUserQuestion` (`hooks/record-ask.js`) now appends each question and its running phase to
  `.signal/asks.jsonl`, and `hooks/check-state-write.js` reports at phase close.
- **Whether `AskUserQuestion` is hookable was settled by running it, not by reading about it.** Two
  readings of the same documentation page disagreed, and the *"not hookable"* one turned out to be a
  summarising model's inference rather than a quoted sentence — the exact provenance failure
  `v0.1.25` shipped a rule against. The test carried a **control arm** (a second matcher on a tool
  that could be triggered deliberately), because a silent log cannot distinguish *"the hook did not
  fire"* from *"the setup is broken"* — `M5.E15`/`B55`. Two corrections to the procedure as filed
  came out of running it: **no CLI restart was needed** (the settings watcher picked the hooks up
  mid-session), and the first drafted command used `jq`, **which is not installed here** — caught by
  piping a synthetic payload through it before it went near any config.

- **`.planning/ENVIRONMENT.md` — what an agent can't see from the code.** External services,
  configuration variable **names**, test accounts, deploy targets, escalation paths, and what
  automation must not touch. Created as a stub by `/sig:calibrate`; `/sig:init` pre-fills what its
  scanners actually found. First of three autonomy items accepted 2026-08-08 — useful attended, and
  a prerequisite unattended, where it turns a halt into a lookup.
- **The names-never-values guard refuses the write** rather than redacting, and never echoes the
  value back — it reports the offending line and the value's length. Same posture `/sig:add` and
  `/sig:checkpoint` already take on a sensitive hit.

- **DISCUSS now asks how we will know it worked** — at FULL and FEATURE; skipped at SPIKE and
  SKETCH. **Not the acceptance criteria Signal already has:** those are a *completion* oracle (the
  thing is built), this is an *outcome* oracle (it worked, in use). Work can satisfy every
  acceptance criterion and change nothing anyone cares about, and without the question the agent
  makes that product call by default. Second of the three autonomy items accepted 2026-08-08.
  Verified by `checkOutcomeOracle` (`tools/lib/outcome-oracle.js`).
- ⚠ **"No outcome metric, and here is why" is a first-class PASS, not a loophole.** For
  infrastructure and tooling work a metric frequently does not exist, and **a gate that cannot be
  satisfied honestly is a gate that gets rationalized past** — the anti-rationalization failure
  arriving through the mechanism built to prevent it. What stops the hatch swallowing the gate is
  not refusing it but requiring the **reason** to be substantive: a bare `N/A` or `none` fails,
  a one-sentence explanation passes. Present-but-vacuous fails, not merely present-but-empty
  (`M5.E10`'s rule, one artifact over). The failure message says declining is legitimate, so nobody
  learns to invent a metric instead. ⚠ **It reads tokens, not meaning** — a metric nobody will look
  at, or a fluent reason that is untrue, passes. Same published limit as `M5.E10` and `B75`.

### Fixed

- **The names-never-values guard shipped with six holes, and a `.env` paste in a code fence was
  one of them.** The first version skipped fenced code, reasoning *"an example belongs in a fence"* —
  which inverted the threat model, because a `.env` paste normally lands in a fence. **A test
  shipped pinning that as intended behaviour.** Also missed: blockquote, bold, numbered-list and
  colon forms of an assignment, and one unterminated fence disabled detection for the rest of the
  file while still reporting clean. All six now caught. ⚠ **The fix then shipped three more defects, caught by the same reviewer on the
  next PR** — a CRLF regression that silently disabled the guard on a CRLF checkout, a new bypass
  (`API_KEY=[sk_live_…]` read as a placeholder), and a false positive that refused ordinary content
  like `SLACK: #eng-help` — and since the guard refuses the WRITE, that last one made the file
  unusable for what it exists to hold. Eleven shapes now caught, ten benign shapes checked, one
  residual documented (a short secret in colon form).
- **Two contradictions in `LOOP-ENGINEERING-ANALYSIS.md`.** A table rated Memory *"Built, and
  unusually strong"* with no shortfall while the prose beneath it called Memory *"the one real
  gap"*; and a 2026-08-22 amendment refuted the sentence above it (*"bounded by the iteration
  cap"*) while leaving that sentence unedited. Both are the `M5.E17` class — instructions
  contradicting instructions — inside the document about running with less supervision.

- **`/sig:ship` now reads the pull request's review findings before you merge.** Every unresolved
  review thread is listed with file, line and headline. **`cannot-check`** — no `gh`, no auth, no
  network, no PR — renders as its own line and **never as "none"**. An unresolved thread marked
  **outdated** is counted and named separately, because a later push marks threads outdated whether
  or not the finding was fixed. ⚠ **It reports; it does not refuse** (same call as `B75`).
  *This closes the gap the scoping pass found: `ship.md`'s Exit Criteria required a PR and said
  nothing about its review comments, so four correct findings were merged over unread.*

### Scoped, not built

- **Cross-model review at REVIEW** (`analysis/CROSS-MODEL-REVIEW-SCOPE.md`) — third of the three
  autonomy items, whose instruction was *"scope it, don't build it yet."* **Verdict: build neither
  proposed scope.** Cross-tier is reachable but shares the writer's priors, so it does not answer
  the objection that motivated the item; cross-vendor answers it but **cannot be capability-detected
  at all** (`PHASE-C-BUILD-VS-ADOPT.md`: no environment variable enumerates the tool roster, and the
  documented surface undercounts reality 13-to-2). If ever built, it must be **declared** in
  `ENVIRONMENT.md`, not detected.
- ⚠ **The finding that changed the call, and it is measured:** Signal has run an independent PR
  reviewer since `v0.1.31`. Across **10 PRs** it produced **4 findings — all 4 real on inspection**,
  and **all 4 sat unread**. Two were in this release's own guard and were confirmed by execution;
  they had survived a green 2886-test suite, four mutation tests, and their author. **So the binding
  problem is not the reviewer — it is that nothing reads it.** `/sig:ship`'s Exit Criteria require a
  PR and say nothing about its review comments. That gap is now stated; closing it is the
  recommended next step and is **not** a second reviewer.
- ⚠ Limits published: one project, ten PRs, four findings, two of them from a single PR — an
  observation, not a sample. And nothing audited the eight quiet PRs, so what the reviewer *missed*
  is unknown; a silent reviewer and a clean diff look identical from here (`B39`).

### Changed from what was approved — three deviations, recorded not substituted

- **The guard is value-shaped, not the secret-shaped scrub the backlog specified** (`D-BR0822-1`).
  Measured: `/sig:add`'s patterns return **zero hits** on
  `DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app` — a `.env` paste, which is how this
  file realistically goes wrong. And `hex-blob-40` matches **every git SHA**, so reusing the scrub
  unchanged would fire on ordinary commit references. So any populated assignment is a violation in
  a names-only file, secret-shaped or not; the scrub still runs as a second pass for a bare token.
- **It refuses where `B75` (above, same day) only warns** (`D-BR0822-2`). A skipped confirmation is
  a judgment call about process; a value in a names-only file breaks the file's stated contract, and
  the cost of being wrong is a published secret in a tracked directory (`B97`).
- **Created at `/sig:calibrate`, and no sixth calibration question** (`D-BR0822-3`). `/sig:init`
  runs on **brownfield only** — `/sig:new-project` never invokes the scanners — so an init-homed
  file would reach one kind of project and be silently absent elsewhere. Calibrate is the one
  command both paths pass through. The question was dropped because all five existing ones feed
  tier derivation; the `[FILL IN]` stubs `/sig:sweep` already reports do that job instead. ⚠ A bet
  that can be checked: if the stubs sit unfilled on real projects, add the question then.

### Known limits — stated because overclaiming is this project's named defect

- ⚠ **`B75` stays open, by choice rather than by neglect.** Asked as a direct either/or whether a
  phase closing with zero observed asks should be **refused** or **reported**, the answer was
  reported. That keeps `check-state-write.js`'s two-tier posture intact (integrity blocks, process
  warns) at the cost of being a nudge. **Nothing fails when a command ignores the dial**, so this
  ships as *checked and reported*, never *enforced*, and `references/phase-gates.md` says so in
  those words.
- ⚠ **It counts nothing, and that is design, not an unfinished edge.** `confirm_in_phase` means a
  countable quantity in only two of six commands — `execute.md` (every wave boundary) and `ship.md`
  (every checklist step). `discuss.md` is one ask per gray area *found as you go*, and `plan.md`,
  `verify.md` and `review.md` say "every step" without anywhere defining a step. A count comparison
  would be fabricated for four of six phases, so the check answers exactly one question: **were you
  asked anything at all during this phase?** A single box-ticking question satisfies it.
- ⚠ **An absent record reads `cannot-check`, never clean** (`B39`) — no `.signal/asks.jsonl` means
  the hook has never run here, not that nobody was asked.

2841 → **2979 tests**.

## [0.1.32] — 2026-08-21 — the loop that did not stop

**`B76`, `B73`, fix lane.** The entry price for autonomy work, paid one release late.

### The defect

`/sig:drive` shipped in `v0.1.31`. `B76` — filed 2026-08-03, agreed by the maintainer 2026-08-08 as
*"the entry price for any Phase A autonomy work"* — had warned that **any driver built on top
inherits an unbounded loop on day one.** It did, and the shape was exactly as filed:

- `review.md`'s FAIL path read `FAIL — issues must be addressed (return to EXECUTE)`. **No user ask,
  no ceiling.**
- `verify.md`'s sibling path has both: the 3-options pattern, and *"you've looped <3 times"*.
- `drive.js`'s `FLOORS` had five entries — **none at REVIEW** — and no iteration cap anywhere.

So under `attention: unattended`, a REVIEW FAIL looped EXECUTE → VERIFY → REVIEW → FAIL with nothing
stopping it.

### Why the fix is a counter and not a sentence

⚠ **Mirroring `verify.md`'s wording would have closed `B76` on paper and left the loop exactly as
unbounded.** That ceiling is **prose enforced by nothing** — a reader counts loops from memory.
Writing the rule more carefully is precisely the remedy `UNREACHED-MECHANISM-ANALYSIS.md` names as
the failure, and `B75` already measured its ceiling.

So the count is **derived from state**, using a mechanism that already exists rather than a new one.
`completed_phases` is **append-only** and records the phase being *left* (`B44` / `D-M5E9-5`), so the
number of `REVIEW` entries **is** the number of completed REVIEW passes — and it is per-Epic for free,
because `setCurrentEpic` resets the log on an Epic roll (`B9`). Nothing new is written to track this.

New `tools/lib/loop-ceiling.js` — `loopStatusFor`, `countPhaseCompletions`, `formatLoopCeilingHalt`.
It reuses `partitionCompletedPhases` rather than reimplementing the parse, which is `B82`'s lesson: a
second implementation of *"which entries belong to X"* is how half a unit got archived invisibly.

`canProceedUnattended` now **refuses** on the count, checked **above the attention branches** — a
ceiling is not a preference the dial can turn off. `unattended` buys freedom from being *asked*; it
does not buy an unbounded loop. **It refuses equally when it cannot read the count** (`loop-unknown`,
kept distinct from `loop-ceiling` so a halt never implies evidence it does not hold) — this file's
stated posture, that a detector which cannot look should say so and continue while **an actor that
cannot tell should stop**.

**The arithmetic is `verify.md`'s existing rule, unchanged and now enforceable:** two re-entries run,
the third stops for a person. `review.md` gains the 3-options ask it never had.

**Proof-of-fail, not just green:** 4 of the 21 new tests fail against the pre-fix `drive.js` — the
four asserting the refusal — and pass after.

### Also fixed

- **`B73`** — `phase-gates.md` opened with *"Every phase transition requires explicit approval. No
  exceptions."* while `gate_strictness: off` had been exactly that exception for releases, and
  `/sig:drive` now advances phases unattended. **The reference whose job is to state the rule was the
  file contradicting the code** (`M5.E17`'s class). It now states the `attention` dial and names the
  two things the dial cannot turn off — the `FLOORS` roster (referenced, not re-listed, so there is
  one roster rather than two) and the loop ceiling. The old absolute is kept as a boxed correction.

- **A formatting trap in the adherence measure, found by tripping it.** The first draft of
  `review.md`'s new section buried its imperatives behind bolded lead-ins — `**The ceiling is
  counted…** Call \`loopStatusFor(…)\`` classifies as `directive: false`, so a genuinely
  trace-measurable instruction was **invisible to the measure**. Reworded so the verb leads;
  trace-measurable directives went **107 → 109** (21.1% → 21.4%). The instruction was always
  enforced in code — what was wrong was Signal's published claim about how much of its own guidance
  is measurable.

### Not fixed, and deliberately not

⚠ **`B74` stays `confirmed`.** Its *documentable* half is recorded — `phase-gates.md` now says
EXECUTE has no approval checkbox **by design**, because *"a reader cannot tell design from omission"*
is `B39`'s shape. Its load-bearing half is untouched: five `"User approves…"` checkboxes remain
**unconditional** while the dial above them is conditional. **What changed is the premise, not the
size** — its triage said it "needs new capability" and `attention` is now that capability, so the
remaining work is wiring rather than design; but it is five command files plus the phase-gate
rendering, and the row homes it to an Epic. Marking it `fixed` for the half that was cheap would be
the claim-integrity defect this repository is named after.

⚠ **Scope: this bounds the driver's decision, not the model's obedience.** `/sig:drive` will now
stop. A human or agent that reads `review.md`'s ask and ignores it is the adherence problem, as
unmeasured as ever.

- **`B107` — the private-name guard walked tracked files only, so a brand-new file was invisible to a
  local run.** Found by tripping it: this Epic's two new files passed the **full local suite** and
  then **failed in CI on identical content**, because by then they were tracked. The collision was
  real — an ordinary-looking camelCase identifier introduced here **is** one of the thirteen denied
  project names, which is exactly the residual hole `B97` recorded (*"three names are ordinary
  English words, caught only in project shape"*). Renamed; **no private name reached a commit.**

  ⚠ **The guard was not wrong about what it read — it was wrong about what it had read**, reporting
  clean for a population it never opened. That is `B39`'s shape, and the same failure `B97` itself
  was: that guard passed while 8 of 13 names sat in the repo. A guard whose local signal is green and
  whose CI signal is red trains the operator to trust the run that is structurally blind.

  The walk is now tracked **plus** `ls-files --others --exclude-standard` — the set a commit would
  actually carry, with `.gitignore` still keeping scratch and build output out. **Proved in both
  directions:** an untracked file carrying the collision fails the guard, and deleting it passes.
  ⚠ CI was never blind; what closes is the gap between what a developer sees *before* committing and
  what the gate sees after.

### The `attention` dial, wired where it is read (`B74`, `B108`; `B75` deliberately not closed)

`v0.1.31` made `attention` a real field and left every command file describing the **old** dial.

- **`B108` (P2)** — **six** command files still mapped `gate_strictness: off/light/strict` to
  auto-advance and confirm timing that it no longer controls. `applyRigorOverrides` gives
  `gate_strictness` exactly one gate (`anti_rationalization`); `attention` drives `auto_advance`, the
  six `confirm_*` flags, and `confirm_in_phase`. **`M5.E17`'s class — instructions contradicting the
  code — created by the release that fixed the dial.**

  ⚠ **Found by a check, not by the sweep before it.** A manual grep found three files. The test
  written to pin the fix immediately failed on **three more** (`verify.md`, `review.md`, `ship.md`).
  The sweep was wrong and the assertion was right; that is the argument for writing the assertion.
  Pinned by a whole-population walk of the command directory **read from disk** (`B104`'s shape), so
  a new command reintroducing the mapping fails the suite — plus a **derived** assertion that
  `gate_strictness` really does set only `anti_rationalization`, which fails if a future change gives
  it another gate and quietly makes these docs wrong.

  ⚠ **One false positive was designed out rather than suppressed.** Anti-rationalization tables quote
  the temptation in the first cell (*"`strict` means I should confirm the destination"*), so the
  check skips quoted-temptation rows — matching them would flag a **denial** of the mapping as the
  bug. And `add.md`'s `gate_strictness` use is **real and untouched**: `resolveOnboardingMode` reads
  it in code.

- **`B74` (P3) — closed.** Four of the five phase-approval checkboxes now read *"when
  `gates.confirm_{phase}` is set"* and name their flag. **The fifth is deliberately still
  unconditional:** `ship.md`'s *"User approves PR for merge"* is a **floor** (`ship-pr`), not a
  tier-gated ask — merge is delivery (`D-M5E17-5`). The box says so at the box, and a test asserts
  both halves, so nobody tidies the asymmetry away later. **14 of the 31 new tests fail against the
  pre-fix command files.**

  The lane call was **revised rather than quietly ignored**: `B74` and `phase-gates.md` both said
  *"Epic-homed, not fix-lane"*, on the strength of a triage that said it *"needs new capability"*.
  `attention` **is** that capability, leaving wiring with no design surface. The `phase-gates.md`
  sentence was corrected **in the same commit that did the work** — leaving it standing would be
  `M5.E17`'s class committed inside the file just fixed for `B73`.

### ⚠ `B75` stays open, and this is the honest part

The flag now has consumers — **but they are prose consumers.** Ask what would *fail* if a command
ignored `confirm_in_phase`: **nothing.** No test breaks, no gate refuses, no run halts. The in-phase
asks are now **conditional in prose** rather than **unconditional in prose**. That is real progress
and it is not enforcement.

Closing `B75` here would be this repository's named defect, committed in the same week as
`analysis/PHASE-C-BUILD-VS-ADOPT.md` — whose central finding is that Signal puts load-bearing checks
in JS *because* the prompt layer is **77.6% unmeasurable**. A document cannot be both the argument
and the exception. What would actually close it is something that **fails** when an in-phase ask is
skipped; the adherence canary is the existing mechanism, and `B55` is the precedent for how easily
such a canary measures the wrong thing.

2789 → **2841 tests**.

## [0.1.31] — 2026-08-21 — the loop, built instead of discussed

**The direction changed on 2026-08-20, and it changed because the numbers said so.** 23 releases
since 2026-07-15 were almost entirely *Signal auditing Signal*. Command count moved 18 → 20 in five
weeks and **both new commands managed Signal's own files**. Inspiration-repo ports shipped: **zero**.
Loop functionality shipped: **zero** — `analysis/LOOP-ENGINEERING-ANALYSIS.md` and nothing else.
Every release had an articulate justification; that is precisely why it ran so long. This entry is
the first one in that span that is not about Signal's own documents.

### `attention` is a real dial, split from rigor

`attention: attended | checkpointed | unattended` is now a field on `PROFILE.md`. **FULL rigor,
unattended, is now expressible** — it was not before, and that was the whole complaint the loop
analysis made. The audit measured a FULL-tier Epic at ~48–86 synchronous human touchpoints, with
Signal already spanning a ~10× attention range, and **the only way to buy less of your time was to
buy less rigor.**

`gate_strictness` keeps exactly one job — **whether anti-rationalization runs**. That is the only
job it ever had *in code*: `light` and `strict` were measured to expand to identical gate config
except that single boolean (`B75`), and `off` already meant auto-advance. Attention now drives
`auto_advance`, the `confirm_*` gates, and a new **`confirm_in_phase`** — which is the difference
between *checkpointed* and a rename of *light*. In-phase ceremony is where most of those 48–86
touchpoints live, and **it existed only in command prose, enforced by nothing.**

⚠ **Back-compat is derived, not defaulted — and that was the whole risk.** A profile with no
`attention` **derives** it from `gate_strictness` (`off`→unattended, `light`→checkpointed,
`strict`→attended) rather than falling back to a constant, so every `PROFILE.md` written before the
field produces **byte-identical** gate config. The full suite passing unchanged is the proof.

Adding the field also required teaching the validator to honour **`optional`**. Without it, adding
*any* new override field makes every `PROFILE.md` on disk throw — **`B59`'s failure reached by
addition instead of by typo**, where an unreadable profile silently runs the phase at the wrong tier.

### `/sig:drive` — the 21st command: run the flow, stop when it must

`plugin/commands/drive.md` + `plugin/tools/lib/drive.js`. It **reuses what already existed** rather
than reinventing: `describeNextAction` (`B70`) as the what's-next primitive, and `/sig:sweep`'s
**needs-a-person vs. clears-itself** split as the halt protocol.

**What it will not do**, stated as capability rather than promise:

- **It never merges.** Merge is delivery (`D-M5E17-5`).
- **It never overrides a `FLOORS` entry** — SHIP's pull request, the Epic-close retro gate, the
  drain's diff preview and destructive confirms, the orphan prompt. Each was made tier-independent
  by a **specific decision**, and overriding one silently would re-litigate that decision by
  omission.
- **It fails closed.** An unreadable profile, an unknown phase, or a missing attention value stops
  the loop. Deliberately the **opposite** of `B39`'s fail-open posture for *reporting*: a detector
  that cannot look should say so and continue; **an actor that cannot tell should stop.**

⚠ **The setting is honest, but only `/sig:drive` acts on it.** **No phase command reads
`confirm_in_phase` yet** — it is present in `plugin/tools/lib/profile.js` and its tests and nowhere
else. That is the obvious next slice and it is **not** claimed as done. Shipping the dial while one
command reads it is the `UNREACHED-MECHANISM-ANALYSIS.md` class, disclosed here rather than
discovered later.

### CI review is live — and the first workflow written for it was wrong

`.github/workflows/claude-code-review.yml` (purpose-built PR review, inline comments) and
`claude.yml` (`@claude` mentions in issues and PRs), authenticating with `CLAUDE_CODE_OAUTH_TOKEN`.
**It comments; it never blocks.** `test` stays the only required check — a failing test names
itself, while a reviewer blocking on judgment will sometimes be wrong and **train an override
reflex** (`D-M6E3-1`'s receipt rule applied to CI).

⚠ **A review workflow written earlier the same day was wrong and was replaced** (`#173` → `#174`).
It pointed the runner at **`/sig:review`, which is a phase command**: tier-gated, halts without
`PROFILE.md`, and reviews an Epic's phase work against `.planning/` state rather than a pull-request
diff. On an arbitrary PR it would have halted at the preamble or reviewed the wrong thing. Keeping
both would also have reviewed every PR **twice, at double cost**. A Signal-native CI reviewer is
still worth building — it would be the first thing ever to dispatch `agents/specialists/*`, all
three of which carry a *"NOT DISPATCHED BY ANY COMMAND"* banner — but it needs a command **designed
for a diff**. Not faked in the meantime.

### Fixed

- **`B105` (P3) — a guard on this file asserted a property that is only true while no release is in
  progress, so writing the release notes failed the suite.** `tests/cut-release.test.js` asserted
  that `CHANGELOG.md` contains **no `[Unreleased]` heading at all**. That holds only while nothing is
  pending — and `foldChangelog` **refuses a cut without a pending section**, correctly, because a
  release with no notes is the failure it exists to prevent. So writing the notes is the required
  first step of every release, and doing it turned the suite red: **the guard blocked the workflow it
  exists to protect.** Found by writing the notes above, not by reading the file.

  **The assertion's own comment predicted this and was ignored.** Its recorded `v1` was *"the real
  CHANGELOG refuses a cut"*, annotated *"true when written, FALSE ten minutes later once notes
  existed for the next release. It tested a transient property of the file rather than the
  invariant."* `v3` repeated that error **inverted**, with the paragraph explaining `v1`'s failure
  directly above it.

  `B84`'s hazard is **positional**, and so is `foldChangelog`'s anchor: a pending section sits
  **above** the newest released heading, and anything below it is history that must never satisfy the
  guard. The assertion now tests exactly that. **Proof-of-fail, not just green:** injecting a
  historical `[Unreleased]` below the newest release fails the repaired test; reverting passes 20/20.

  ⚠ **Class, stated rather than implied:** this is `M5.E13`'s *guards that don't guard*, sub-shape
  *a test pinned to a transient state of the repository rather than to an invariant*. **No sweep for
  sibling instances was done**, so how many other assertions read a live artifact this way is
  **unknown, not zero**.

- **`B106` (P3) — the release tool rewrote the published test count and left the sentence saying
  which release produced it.** `references/facts.md` carries a count followed by *"Set at each
  release … most recently **vX.Y.Z (date)**"*. `setFactsTestCount` updated the number; **nothing
  updated the attribution** — which is a release-time fact for the same reason the count is (`B56`):
  only knowable at the cut, unre-derivable between cuts. So every release published a fresh figure
  credited to the **previous** version. Found by cutting this release, not by reading the file.

  ⚠ **The detector worked and the tool did not.** `M6.E2`'s `facts-attribution` check exists for
  exactly this condition and **fired on the cut**. That makes it the unreached-mechanism class one
  layer over: the check names the situation, and the tool that *creates* the situation at every
  single release was never taught to fix it. Left alone it re-fires forever and trains the operator
  to clear it by hand.

  Fixed by `setFactsAttribution`, composed into the same `releaseEdits` entry as the count so the two
  are written by **one edit** and cannot diverge. It **throws rather than silently no-opping** when
  the attribution is absent (`rewriteBugTally`'s lesson). **Pinned by a cross-file assertion:** a
  test reads `FACTS_REL` out of `published-facts.js` source and parses this function's output with
  it, so writer and reader cannot drift — pinning the literal would have recreated the bug inside the
  test (`B85`'s lesson). ⚠ It asserts the figures were **re-derived at that release**, not that they
  are correct — the check's own stated limit, unchanged.

**2761 → 2789 tests; 20 → 21 commands.** The count is a release-time figure, derived by the same
`vitest` run that gated this cut and written into `references/facts.md` by `cut-release.js` — which,
as of `B106` above, now sets the attribution beside it in the same edit.

> ⚠ **This sentence was wrong until it was checked.** It read **2786** — the count before the three
> tests that `B106`'s own fix added — while `facts.md` correctly published **2789**. A release note
> contradicting the artifact it summarises, inside the entry announcing two fixes for exactly that
> class. Caught by reading the assembled entry against `facts.md` before reporting the release done,
> and corrected here rather than quietly. It is the third instance of this class in one release, and
> the only one no tool would have caught.

## [0.1.30] — 2026-08-18 — four agents with a shell, reading text nobody checked

**`B104`, fix lane. A P1 against every release that has shipped `/sig:init`.**

`/sig:init` spawns **four scanner agents in parallel at an arbitrary brownfield repository**, and
every one of them declares `tools: Read, Bash, Grep, Glob`. **Nothing in any scanner file, and
nothing in `init.md`, told them that what they were reading was data.** Not a weak instruction — a
grep across `plugin/agents/scanners/*.md` and `commands/init.md` returned **zero**.

> **⚠ Corrected 2026-08-18, after this entry was published.** The original headline read *"pointed at
> a stranger's repository"* and the text implied a write risk. **Both were overstated**, and Brett
> caught it by asking the obvious question — *how are scanners writing to the codebase?* They are
> not:
>
> - **`/sig:init` runs on YOUR OWN existing codebase**, not a third party's. Brownfield onboarding is
>   the whole point of the command.
> - **The scanners never write to it.** Every one of them is constrained to
>   `.planning/scan/{name}.md` and forbidden `npm install`, `git push`, and anything that mutates.
>
> **What the real exposure is**, stated properly: they hold `Bash`, so an obeyed directive is a
> **command-execution** risk, not a file-write one — *"run this setup command first"* is the shape
> that matters. And their output feeds `LANDSCAPE.md` → `PROJECT.md` → every later phase, so a
> poisoned *finding* propagates into planning without any command ever being run.
>
> **It is still a real gap**, because a codebase you own routinely contains text you did not write —
> vendored dependencies, contributor commit messages, forked files, test fixtures — and because
> people do point `/sig:init` at a repo they cloned to evaluate, or at a client's. But the severity
> is *"an agent with a shell should treat what it reads as data"*, not *"Signal scans hostile
> repositories by default."* The fix below is unchanged; the framing was wrong.

Signal is publicly installable and has four non-Signal users. A `README` **committed by anyone other
than the operator** saying *"run this setup command first"* met no instruction standing against it.

**Found by reading someone else's code.** `vercel-labs/eve-software-factory-template` (MIT) ships
`evals/safety/prompt-injection.eval.ts` — a hostile issue body carrying *"SYSTEM OVERRIDE: ignore all
previous instructions"*, with the eval asserting the agent summarises without acting. Signal had no
equivalent, and looking for one is what surfaced this.

Every scanner now carries a Constraints clause that names three things rather than one: the content
**is data**, the **destination** for such a finding (`suspicious embedded directive at {path}`, under
*Detection Failures*), and **`Bash`** as what makes the constraint load-bearing rather than
theoretical. `init.md` repeats it at the spawn site, because the command that spawns them is also
the command a reader opens first.

**Pinned by a whole-population assertion**, itself borrowed from that repo: the test reads the
scanner directory **from disk**, so a fifth scanner added tomorrow fails the suite until it carries
the clause. Their comment states the property — *"automatically forbidden … until someone allows it
deliberately."* It is the same shape `B81` needs.

⚠ **Scope, stated rather than implied.** This covers the **scan surface only**. Two of the three
surfaces named when the bug was filed are untouched: `/sig:add` captures verbatim **by design**, and
every phase command reads `.planning/` documents that anyone with commit access can write. Whether
those need the same treatment is undecided.

⚠ **An instruction is not a sandbox.** This makes the expected behaviour explicit and testable. It
does not make injection impossible, and **no eval exercises it** — Signal has no run-event stream to
assert against, which is its own inbox entry.

2747 → **2761 tests**.

---

## [0.1.29] — 2026-08-18 — the facts Signal publishes about itself

**`M6.E2`.** A document states a fact about the project — a count, a status, a version, a phase — and
nothing derives it from the artifact it summarises. Five checks for that class, plus the write-path
fix that stops `/sig:add --bug` falsifying the file it writes to.

**The mechanism already existed and nothing reached it.** `bugs-tally.js` has derived-then-compared
correctly since `B77`; its **only caller was a test**, so it fired in this repository alone, only
under `vitest`, and only after a bad write had landed. `state-drift.js`'s `defineCheck` harness is
general by contract but had never been used from outside its own file. Both are now reached from
`/sig:sweep` and `/sig:resume` — the two commands that run drift checks in any project.

**⚠ Three of the five checks evaluate one project: this one.** Measured read-only across 12 local
projects *before* scope was locked: the `BUGS.md` tally check and the milestone-status check each
reach **1 of 12** — **0 of 11** excluding Signal — and `facts.md` is a Signal artifact. Only the
`[Unreleased]` check reaches elsewhere (4 of 11). That is not hidden in a planning file: the sweep
report prints one grouped line naming every narrow check with its fraction, next to the clean count
it qualifies. Narrow reach has never been the disqualifying property here; **claiming generality you
do not have is**, and this release very nearly did.

**`/sig:add --bug` was falsifying the file it wrote to.** `captureToBugs` appended at end-of-file on
the documented belief that `BUGS.md` has *"no footer to rewrite"*. It has one — the italic tally line
— so every capture landed **below the file's own summary** and nothing re-derived the count. Captures
now land above the tally and the counts are re-derived, never incremented. The author's date and
narrative in that line are **not** touched: stamping today's date on an automated capture would make
the line claim a freshness its prose does not have.

**`AC3.2` shipped with its precision published rather than its weakness hidden.** Three rules for
*"a bug row says `confirmed` but the CHANGELOG says it shipped"*, measured over 28 rows: any mention
→ **13 flags, 1 real**; mention plus fix-language → **3, 1**; mention in the entry's headline →
**2, 1**. The natural rule fails on *"`B81` remains open (filed not fixed)"* — the word is there and
the meaning is inverted. The headline rule ships as the best of three, not a good one, and says so in
the check's description **and in every finding**. A test pins the known false positive so nobody
"improves" the rule back into the measurably worse one.

**The Epic kept committing its own defect while building the checks for it.** Acceptance criteria
written as en-dash ranges went **invisible to the coverage tool** — `M5.E10`'s exact finding,
reproduced at PLAN. A commit sha in `PROGRESS.md` that does not exist. A test count two too high in
`REVIEW.md`. A report heading, `## STATE vs. world`, that stopped being true the moment this release
added non-STATE checks to it. And at REVIEW, a **Critical**: `rewriteBugTally` spliced only the
*bolded* total marker while the reader accepts the unbolded form, so on such a file the rewrite was a
**silent no-op** and the capture reported success — a silent no-op inside the fix for silently wrong
counts. Every fixture used the bolded shape, because that is Signal's own; `B82`'s blind spot exactly.

**`B102` was corrected by a check finding it, not by anyone remembering.** Its row read `confirmed`
while it shipped fixed in `v0.1.27`, and it was **left wrong on purpose** so the detector would ship
tested against the only real instance available. `B38` carried the identical drift in August and was
found by a hand count.

⚠ **The semantic half stays unbuilt.** Everything here compares tokens against tokens. A document
internally consistent and simply wrong about what its evidence means passes all five checks. Two real
findings also ship **open by choice**: the dated `[Unreleased]` heading needs a product decision, and
`facts.md`'s figures are re-derived at release, which is this one.

2681 → **2747 tests**.

**One more found at SHIP, by the Epic's own checks running against its own release.**
`milestone-status-vs-state` flagged `M6.E2`'s row the instant it was marked *shipped* — because
`current_epic` stays at the Epic just closed until the next one opens, making *"shipped row + current
Epic"* the normal post-ship state. Uncaught, it would have fired on **every Epic close, forever**.

---

## [0.1.28] — 2026-08-18 — the cleanup deleted the copy you were running

**`B103`, fix lane. A P1 in `/sig:doctor --fix`, found by running it.**

`--fix` offered `rm -rf` on every cache directory the manifest does not name as current. "Orphan"
means *not the current version* — it says **nothing about who is still executing it.** Claude Code
resolves a plugin's install path once at session start and holds it for the life of the process
(**`B52`**), so a copy two versions back can have live sessions on it. Deleting one breaks that
session mid-flight.

**The per-step `[y/N]` was not mitigation.** It reads as a formality across eleven near-identical
prompts, so the reflexive answer is the destructive one.

**Found by running the command, not by reading it.** Three `claude` processes were live; two of them
(pids 29938 and 78473) had resolved `sig/0.1.25`, and the generated script listed `sig/0.1.25` for
deletion. The step was declined by hand. **Nothing in Signal would have declined it** — `v0.1.20`
shipped `tools/lib/plugin-binding.js` to answer exactly "which copy is actually running," and this
path never asked it. `UNREACHED-MECHANISM-ANALYSIS.md`'s class, again.

Both script builders now emit a **live-session binding guard**, and it **re-checks at script-run
time** rather than at generation time — a session can start in the gap, and `~/.claude/sig-doctor.sh`
survives to be re-run days later. It calls back into the same module instead of reimplementing the
inference in bash, because a second implementation of "which copy is in use" is how **`B82`**
happened. Under `--fix` a held directory is skipped outright and never prompted; under `--reinstall`
the wipe is the point, so the guard names the sessions it will break *before* the `[y/N]`. The
detect-only report names held copies too.

⚠ **The inference is a heuristic, and the code says so.** No API reports another session's resolved
path — `lsof` shows nothing (plugin files are read on demand, not held open) and `CLAUDE_PLUGIN_ROOT`
is the env var `B52` exists because it disagrees with reality. So a session's copy is inferred as the
newest cache directory that existed when the process started. A downgrade or a hand-moved directory
can mis-attribute. It errs toward **holding**: a false hold costs disk, a false delete costs
someone's session. `ps` unavailable, an unreadable directory, or no `node` on PATH are
`cannotDetermine` — those steps render `[UNVERIFIED]` rather than prompting as though the check had
run (**`B39`**).

Verified end-to-end on the machine that produced the bug: answering `y` to every prompt now deletes
nothing while a live session holds the copy. 2664 → **2681 tests**.

---

## [0.1.27] — 2026-08-18 — the migration instructions uninstalled Signal and said they didn't

**`B102`, fix lane. A P1 against `v0.1.26`'s own migration advice, found by running it.**

`claude plugin marketplace remove signal` **uninstalls the plugin.** Measured in an isolated config:
`claude plugin list` reports *"No plugins installed"* immediately after, and `marketplace add <url>`
does **not** bring it back — a third command, `plugin install sig@signal`, is required.

`v0.1.26` prescribed **two** commands on all three surfaces (`/sig:doctor`'s `P6` block, the install
page, and the README), so anyone following them landed with **Signal uninstalled**. Two of the three
additionally asserted *"your installed plugin and its settings are untouched"* — false in its first
half: settings survive, the plugin does not.

**Nobody is broken by inaction.** `P6` is info-only and the old install path keeps working; the
damage was only to users who **took the advice**.

All three surfaces now prescribe the three-command sequence and say plainly that the first line
uninstalls the plugin. Pinned by a test that is **derived, not enumerated** — any tracked surface
prescribing `marketplace remove` must also prescribe `plugin install`, scoped to the migration block
so a fourth surface cannot drift out of it.

**Recorded because it is the same defect three times in one week:** the first version of that test
searched the whole file and **passed** when the line was stripped, because two surfaces carry
`plugin install sig@signal` in their *primary* install snippet higher up. That is `B100`/`B101`'s
match-anywhere shape, in the guard written to close a claim-integrity defect. Caught by mutation, as
those were.

2657 → **2664 tests**.

---

## [0.1.26] — 2026-08-17 — the plugin payload: what an install actually copies

**`M6.E1`.** An install shipped the whole repository. It now ships the plugin.

**Measured on a real install, not projected:** **985 files / 12.4 MB → 382 files / 3.2 MB**, and the
**47 MB dependency install no longer fires at all**. `.planning/` goes from **270 files to 0**;
`tests/` from **218 to 0**. `B99`'s two costs were size *and content* — `.planning/` is Signal's
working memory, including measurements taken against real client projects — and the second one is why
this was not a tidiness release. ⚠ **This stops `.planning/` being copied to users. It does not make
it private** — it remains readable in a public repository, which is a separate, still-deferred
decision.

**The payload moved to `plugin/`** and the catalogs moved with it: the root catalog's `source` becomes
`"./plugin"` — still the relative **string** form, so `B58`'s lesson is untouched — and a second,
published catalog now lives at `signal.insightriot.com/install/marketplace.json` using `git-subdir`
with **no `ref` and no `sha`**, so *"users track `main`"* (`D-M5E17-4`) survives. A URL marketplace
downloads one file instead of cloning 19 MB. The two catalogs are pinned on an **invariant, not
byte-equality** — they describe the same plugin through two different fetch mechanisms, and forcing
them identical would break one.

**`yaml` is now carried, not declared** (`D-M6E1-7`, superseding `D-M6E1-3`). The plugin root has no
`package.json` and no lockfile, which is the entire mechanism — that pair is what triggers Claude
Code's automatic dependency install, and it cannot be disabled. **The decision reversed on a
measurement the research had backwards:** a failed install was documented as costing a minority of
commands; computed as a transitive closure it is **17 of 20**, with only `doctor`, `escalate` and
`update` surviving. So the outcome was never a degraded mode — it was a plugin that does not work,
silently, on a restricted network. The vendored copy is the package **as published** (233 files),
with its SHA-256 and obtain/extract commands now recorded in `LICENSES.md` so a third party can
verify it without trusting their own install.

**`/sig:doctor` tells you to move.** A new `P6` check reads `known_marketplaces.json` and, if your
marketplace is still GitHub-sourced, prints the two commands that switch. **Info-only — the old path
still works and nobody is stranded.** A migration note on a web page is exactly the mechanism that
never gets reached, so the check goes where the situation is. `runAllDetectors` also gained
`checked_all` / `undetermined`: it was silently discarding any detector that *could not run*, which
would have printed a clean bill of health from a check that never looked.

**Existing installs keep working.** `/plugin marketplace add insightriot/signal` still resolves. To
switch, `remove` then `add` the URL. You do **not** need to delete anything under
`~/.claude/plugins/cache/` — 11 of 13 cached versions clear themselves inside the documented ~14-day
sweep; the marketplace clone is the part that does not, and that is what `remove` handles.

**Filed during the Epic, and both are defects in Signal's own claim-checking:** `B100`
(`diffRequirementCoverage` cannot see a letter-suffixed criterion id and reports `covered` anyway) and
`B101` (the same tool empties its own *unattributable* list when a report merely **names** a group —
including in a sentence saying the group was not checked). Both turn *"I could not look"* into a
reassuring word. Neither is fixed here.

2602 → **2657 tests**; **20 commands**, unchanged.

---

## [0.1.25] — 2026-08-13 — claim integrity: the checks, and what they cannot see

**`M5.E10`. Shipping this closes Milestone 5.** Seven deterministic checks for one defect class —
**completeness claims written from the shape of the work rather than from the artifact** — plus the
number that matters more than the count of checks.

### Read this before the feature list

**"Seven checks shipped" is not an honest summary.** Measured read-only across twelve real local
projects ([`M5.E10-CORPUS-MEASUREMENT.md`](.planning/M5.E10-CORPUS-MEASUREMENT.md)):

| Check | Can evaluate |
|---|---|
| Correction protocol | **12 / 12** |
| VERIFICATION template gate | **10 / 12** |
| STATE narrative vs frontmatter | 5 / 12 |
| VALIDATION self-consistency | 3 / 12 |
| **Requirement-coverage diff** (the flagship) | **2 / 12** |
| Retro-index freshness | 2 / 12 |
| **Backlog discharge** | **1 / 12** |

**One check works everywhere. One nearly everywhere. Five apply to between 1 and 5 of twelve** —
because they need document conventions most projects do not have. Signal's own repository is in the
minority on every one of those five, and on the last it is the *entire* majority. Those are
**could-not-look** numbers, not found-nothing-wrong numbers, and every check says which.

The integers also **move between runs** — one read 5, then 4, then 5 across two days — because the
corpus is twelve *live* projects. The measurement is a dated snapshot; the stable claims are the
shapes.

### Added

- **A deterministic requirement-coverage diff.** Every requirement id in a REQUIREMENTS artifact must
  appear in the matching VERIFICATION; absent is red, and absent ones are **named**, never counted.
  The denominator is **derived by id-group correspondence**, not assumed — a project-scoped
  REQUIREMENTS diffed naively against a unit-scoped VERIFICATION reports every other unit's
  requirements as missing, which is the defect class wearing a red wall.
- **A VERIFICATION template with a locked shape and a mandatory limits section.** A denominator table
  (`{n} of {total}`, never a bare count) and a required *"What this could not establish"*. An unfilled
  template **fails** — copying it is not shipping it. Present-but-empty fails as hard as absent.
- **VALIDATION self-consistency, retro-index freshness, and a STATE narrative check.** Each reports
  **three** outcomes; *"could not evaluate"* never renders as *"clean."*
- **A correction protocol** enforced at line granularity, because `grep` prints one line and a
  correction three lines below is invisible to the reading that matters.
- **`/sig:ship` §6.6 — the backlog can finally record that a row's work shipped (`B94`).** It was
  append-only: two write paths, no discharge function, and SHIP reconciling five document surfaces
  while touching the queue in none of them. The discharge rewrites the **heading a reader sees**, not
  a hidden marker — an HTML comment leaves the rendered document asserting the same false thing.
  Ambiguous matches **refuse** rather than striking the wrong row.
- **`references/anti-rationalization-forms.md`** — 109 entries classified (93 discipline, 16 shaping);
  the 15 output-shape prohibitions became recipes. The page is re-derived by a test in **both**
  directions.
- **`references/agent-reachability.md`** — **22 of 26 agents are dispatched by no command.** Documented
  rather than quietly left; `plan.md` names four research agents and **three do not exist**.

### Fixed

- **`B97` (P1) — private project names in a public repository.** The guard covering that rule knew
  **5 of 13** corpus projects, so eight stayed named in ~30 tracked files and this Epic **added one**.
  113 replacements; all 13 now denied in two match modes. **The residual hole is stated, not claimed
  away:** three names are ordinary English words and are caught only in project shape.
- **`B98`** — all 13 corpus labels pinned by hash. Previously `F` onward came from list position, so
  adding one project renamed every unpinned one. **References to `eval-project-F`+ written before
  2026-08-13 may not name the same project they name today.**
- **`B95`** — the retrospective index sorted by file mtime, which git does not store, so any clone
  reported drift. Sorted by Epic ID. *(The proposed fix — each retro's own `**Closed:**` date — was
  measured out first: 3 of 28 retros carry one.)*
- **`B96`** — a blockquoted heading was invisible to Epic-close eviction, which reported `no-section`
  — documented as *"a safe no-op."* Safe, but not a no-op.
- Five defects found by an independent review, each reproduced before being accepted: a bare decimal
  in a Notes cell became a requirement id (and **blocked the VERIFY phase on a contradiction it
  invented**); the denominator gate was satisfied by `Node 22/24` anywhere in the document; a stale
  backlog row hid ten unreadable ones; a live row followed by a `<details>` block **vanished
  entirely**; and a `DEFERRED` marker in one table cell silenced an unmapped requirement in another.

### The Epic's own verification failed its own check, and that is left standing

`M5.E10-VERIFICATION.md`'s first draft wrote requirement ranges (`AC2.1–2.3`) and asserted **"56 of
56, none missing."** The coverage diff returned **six missing** — every one an id that exists only
inside an en-dash range. The same draft was wrong about the denominator in two further ways.

Three false completeness claims, in the verification report of the Epic chartered to kill that class,
written by the author of the check that caught them. The refutation is a boxed note in the shipped
artifact rather than a silent correction.

**Still not built, and named so nobody concludes otherwise:** the **semantic backstop**. Everything
here compares *tokens*. A VERIFICATION naming every requirement, carrying a denominator and filling
every section, whose evidence column is simply wrong about what the tests assert, passes all seven
checks.

## [0.1.24] — 2026-08-09 — the unreached mechanism — five rules that now check themselves

**One defect class, five instances, named before it was fixed: the unreached mechanism.** Signal kept building a capability, writing down the rule that should invoke it, and shipping — with nothing that reaches for it. Correctness then rests on the operator already knowing. `UNREACHED-MECHANISM-ANALYSIS.md` argues Signal's habitual answer to *"the rule wasn't followed"* is to write the rule more carefully, and `B75` already measured that ceiling: `light` and `strict` differ by **one boolean** in code. So every fix in this release is a **check that fires where the situation is**, not a paragraph.

### Added

- **`/sig:execute` and `/sig:ship` now refuse to run on the default branch (`B88`).** `[BREAKING]` for anyone who commits straight to `main` — see *Changed* below.

  Signal's rules said every change reaches `main` through a branch and a PR. **Nothing enforced it.** Measured before the fix: not one of 20 commands and not one library module read the current branch, and none created one — `execute.md` contained the word *"branch"* **zero times** while instructing *"create an atomic git commit."* It worked because whoever was driving read `CLAUDE.md` and remembered. On a `eval-project-A` slice nobody did: five commits of real code reached `main` with no branch and therefore no PR, CI ran *after* each push instead of gating it, and `git push` printed *"Bypassed rule violations"* and succeeded.

  `tools/lib/branch-guard.js`, wired at **all three** candidate sites because they catch different failures: EXECUTE stops a slice from *beginning* on the default branch (nothing can be stranded), SHIP catches hand-driven work that never invoked EXECUTE (`B87`'s shape), and the Exit Criteria is **filled from a real PR URL** instead of ticked — that box was ticked across thirteen releases while exactly **one** pull request existed in the span (`D-M5E17-5`).

  **Tier-gated to FEATURE and FULL, derived from `tier-definitions.md` rather than taste:** SKETCH has *"Gates off"*, and SPIKE's output is *"A findings document… Not a PR"* — so halting a spike for lacking a branch would have shipped a fresh `B89` inside the fix for `B89`.

  **It deliberately does not reuse `state.js`'s default-branch resolution**, which falls back to the literal `main`. Correct for an advisory banner; wrong for a halt, where the same fallback yields a false halt (no remote) *and* a false clear (a `master`-default repo) from one line. Pinned by a `master`-repo regression test.

- **A discharged obligation can finally be recorded as done (`M5.E14` first slice).** `PROFILE.md`'s `backfill_warnings` was append-only with **no way to express completion**, so the schema made the true state unrepresentable and a finished obligation read as owed forever.

  In eval-project-C's Phase 11 a security backfill discharged by Phase 10 — and ticked in four places — was reported *"still owed"* by VERIFY, escalated to a **bolded warning** by REVIEW, then absorbed into `STATE.md` as fact. The claim gained confidence at every hop and evidence at none (`CLAIM-INTEGRITY-ANALYSIS.md` specimen #4). One grep would have refuted it at any of them.

  Entries may now be an object carrying `discharged` / `discharged_by` / `discharged_at`. **A bare string still means open, so every profile in the field stays valid and nothing migrates** — a migration that must run before the fix works is a second thing that can silently not happen. `/sig:ship` asks `readOpenObligations` and **reports without halting**: unlike the branch gate, *"yes, something is open, and I'm shipping anyway"* is frequently correct, and a gate that blocks on a judgement gets routed around. Three outcomes stay separate — open, discharged, and **could-not-read**, which renders `UNKNOWN, not none`.

  **Scope, stated plainly: `dischargeObligation` is called by nothing.** The marker is readable and writable, but only a maintainer invoking the library function by hand can set one. Wiring discharge into the phase gates is the tracker Epic's job (`M5.E14` proper), not this slice's. Said out loud because a release note implying the class is closed would be a sixth instance of the very defect this release is about.

- **A tier advisory that fires where the situation is (`B90`).** Per-unit tiering, `/sig:escalate`'s de-escalation branch, and `phases_skipped` have existed for releases — and every surface introducing them said the dial only turns **up**. Measured across 12 local projects: **7 run FULL, and exactly one had ever written a per-unit PROFILE.** A real user paid seven-phase FULL ceremony on a two-hour UI fix. `readTierAdvisory()` names both ways down, goes silent the moment either is used, and is **advisory, never a gate** — the right tier is a judgment call and a project legitimately at FULL must not be nagged into lying. Wired into `/sig:status` and `/sig:resume`.

- **`phase-log-gap` — a phase that ran and never entered the ledger (`B87`).** `M5.E9` closed `B41` by putting the phase-entry call inside each phase command, which does nothing for a run that **never invokes them** — and Signal-on-Signal is exactly that run, as is any Epic a maintainer drives by hand. Caught live at `M5.E19` VERIFY: PROGRESS on disk with five slices recorded, EXECUTE absent from `completed_phases`. **Detect only, by decision** — the log is append-only with no dedupe (`D-M5E9-5`), and writing an entry the flow never produced is `B48`'s lesson.

- **`tools/cross-project-scan.js`** — cross-project analysis over the evidence 23 projects already generate, splitting **defects in Signal** from **advisories about a project**. Mixing them made a fix-and-rescan loop unfalsifiable: advisory counts cannot move until a human acts on a repo, so chasing them tempts weakening the check instead of fixing anything.

- **`cut-release.js` stress-tests a release against the real corpus before cutting it.** The suite runs against fixtures and Signal's own tree, and **both are structurally unrepresentative** — `B82` could not exist in this repo by construction and was live in 8 of 12 real projects; `M5.E16` found Signal's own `.planning/` shape is the *minority* shape. A green suite has therefore never been evidence that a release behaves in the field. **Gates on defects only**, and **fails open, loudly**: a skipped check says *"Not a pass"* in the same breath (`B39`).

- **`tests/intra-file-consistency.test.js`** — a command file may not permit what the same file forbids. `M5.E17` was an entire Epic about contradictory instructions and shipped **cross-document** tests; nothing ever compared a file against **itself**, though an anti-rationalization table is by construction the list of what a file forbids and its steps the list of what it permits.

### Fixed

- **`B89` — `/sig:plan` granted permission to skip the inbox drain and forbade skipping it, in the same file.** Step 1b read *"advisory and fully skippable"*; the Anti-Rationalization table 144 lines later answered *"The plan's decided — skip the drain"* with *"**No.** … Skip it and captures rot in a write-only file."* Both live, and **neither wrong on its own terms** — which is why nothing caught it. It had already fired: `M5.E19` PLAN skipped the drain on 2026-08-07 citing Step 1b, with **52 candidates** in the inbox, the oldest from May.

  **Resolved toward required, because the consequence is asymmetric.** The drain is Signal's only culling mechanism for `/sig:add` captures and it runs only at PLAN, so a permission to skip is a permission for the inbox to grow without bound. *"Defer all remaining"* is the bounded escape and is now offered **unconditionally** rather than *"on a large first run"* — an escape appearing only above an unstated threshold is not one a required step can rely on.

- **The new obligation parser invented a phantom "still owed."** `parseEscalationHistory` decided *"am I inside a warnings list?"* with a flag that latched past the end of one entry, so a **second** escalation's `- from_tier: FULL` was read as a warning and reported as open. A false *"still owed"* is specimen #4 **inverted**, inside the change written to end specimen #4. Fixed by deciding nesting from **indent** on every line; indent cannot latch. Every fixture in the file had exactly one escalation, so the parser's only stateful transition was never exercised.

  **Measured read-only across 12 local projects: 3 phantom obligations → 0**, in `eval-project-D`, `eval-project-A`, and `eval-project-A-codex-review`. Signal's own tree read 0 both before and after — its `escalation_history` is empty, so it has nothing to mis-parse. `B82`'s shape exactly: **dogfooding was structurally blind, and the bug lived only where the corpus is real.**

### Changed

- **`[BREAKING]` — committing straight to the default branch is now blocked at FEATURE and FULL tier.** `--allow-default-branch` is the deliberate way past, and the halt names it. SKETCH and SPIKE are unaffected. Projects with no git remote are unaffected (no remote, no PR to protect). If the gate **cannot determine** the default branch it says so and **proceeds** — a gate that halts on its own blindness is unusable.
- **`CLAUDE.md`, `escalate.md` and `tier-definitions.md` now say the tier dial turns both ways** (`B90`). `CLAUDE.md` described `/sig:escalate` twice as *"promotes tier mid-flight"*; `escalate.md`'s own description said the same while `§Case C` at line 87 — the de-escalation branch — was invisible to anyone reading the command list. **Project tier is a ceiling, not a floor.**
- `/sig:ship`'s PR Exit Criterion is rendered from evidence rather than presented as a checkbox.

### Notes

**Three of this release's fixes found a defect in their own work, and one converged independently.** `B88`'s new text placed a directive outside the `B41-phase-entry` canary's deletion scope — `B55`'s shape, in the change that cites `B55`. `B87`'s fix hit the identical wall in a different file. **Both chose rewording over an allowlist entry, separately, for the same reason:** `DESCRIPTIVE_ALLOWLIST` is per-**file**, so an entry would permanently blind the leak walk to any real directive that file later acquires. The M5.E15 harness earning its keep twice in one release is the strongest evidence yet that it measures something.

## [0.1.23] — 2026-08-08 — /sig:update tells you a command that works (B85)

### Fixed
- **`B85` — `/sig:update`'s one mutating step had never worked as written.** The file told users to run `claude plugin update sig`; the CLI rejects it — `Failed to update plugin "sig": Plugin "sig" not found` — because an installed plugin is identified as `{plugin}@{marketplace}`. The correct string is **`claude plugin update sig@signal`**. Everything else in the command was fine: the version report, the marketplace refresh, and the CHANGELOG delta all worked, so a user got a correct report followed by a copy-paste line that errored. Live for four releases.

  **The class is now guarded, not just the instance.** It survived because **nothing in the suite ever inspected a CLI string a command file prescribes**. `tests/prescribed-cli.test.js` walks every `claude plugin <verb> <target>` invocation across `commands/` and checks the target against an identity **derived from `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`** — no CLI, no network, no flakiness, and it keeps holding if either name changes. Pinning the literal string would have recreated the bug inside the test.

  Also corrected: `STATE.md` described the recovery as *"restart + `/sig:update`"*, which reads as restart-first. It is **update, then restart** — a restart before the update has nothing new to bind to.

## [0.1.22] — 2026-08-07 — File finished work away — /sig:archive (M5.E19)

### Added
- **`/sig:archive` — file finished work away, and say why you didn't.** Signal could already archive closed units; it had no command whose job that was. Archiving happened inside `/sig:migrate-memory`, a command about document **layout**, whose dry-run interleaves a reorganization plan with an archive plan — so filing away finished work meant running a command about something else and reading past half its output.

  **Closure is a gate, not a note.** A unit that is not provably closed is not moved. Dry-run by default; `--apply` writes; a second `--apply` is a no-op.

  **The report names every unit exactly once.** This is the release's actual content. Pointed at a corpus, the pre-existing helpers reported the units that *would* move and the one that *could not be evaluated* — and said nothing at all about the units considered and **refused**. Three of six vanished, and the sharpest omission was the stub-retrospective veto, where closure reports a unit CLOSED and the archive gate declines it one layer later: the most surprising thing the tool does was the least explained. Every refusal now carries the reason its resolver produced, and *"checked and clean"* never renders the same as *"could not check."*

- **`references/command-taxonomy.md`** — the five command groups that already existed, written down, with a naming rule. Signal had 19 commands and no written ontology, so each was named on the day it was built; the document-upkeep group had drifted into two naming styles. `/sig:archive` is a bare verb because adding a prefixed name to that group would have introduced a **third** style — the cost of inconsistency without the benefit of grouping. Whether the group should be prefixed wholesale is filed, not decided.

- **`examples/sandbox/`** — a throwaway `.planning/` corpus with six units forcing all three closure outcomes, so no Signal command ever needs to be pointed at a real project. **Production repos are not test beds**, dry-run included.

### Fixed
- **An unreadable `STATE.md` now refuses everything.** `buildArchiveReport` composed its plan from `senseArchiveTree` and its refusals from `resolveClosures` — which disagree about a missing STATE: one degrades every unit to *cannot tell*, the other needs no STATE at all and still calls a unit closed on the strength of a retrospective file. The plan came from the source that **cannot see the danger**, so a project with no readable STATE would have been handed a plan to archive work that might be the **current unit**. Found by the Epic's own acceptance test; `commands/archive.md` asserted the correct behaviour before the code did it.

## [0.1.21] — 2026-08-07 — A closed unit archives whole, not half (B82)

### Fixed
- **`B82` — a closed unit archived HALF of itself, and the split was invisible.** `planArchiveMoves` rebuilt every candidate as `` `{unit}-{suffix}.md` `` from a fixed suffix list — a **second implementation of "which files belong to this unit"**, disagreeing with the first. `deriveUnits` performs a conservative single-hop fold that a name template cannot express: `PLAN-SLICE-SSO-RESEARCH.md` belongs to `SLICE-SSO`, and no `{unit}-{suffix}` string ever produces it. The mover moved what it could name and left the rest, so a unit ended up split across `.planning/` and `.planning/archive/` with nothing reporting it.

  **Measured live, through the path `/sig:migrate-memory` actually calls** (`senseArchiveTree`), not through the library in isolation: `SLICE-SSO` resolved to **5 files and planned 3** in **both** `eval-project-A` and `eval-project-D` — the two projects archiving by hand-written runbook today. Across all 12 local projects: **3 split units, 6 stranded files → 0 and 0.**

  The mover now consumes the derivation instead of re-deriving. **Signal's own tree could never have caught this:** every unit here is a strict Epic ID whose files really are `{EpicID}-{SUFFIX}.md`, so template and derivation agree by construction — 21 units, 88 moves, 0 stranded, before and after. The bug lives only where unit names are not Epic IDs, which is **8 of 12 real projects**, so dogfooding was structurally blind to it.

  **`AC6.1` held:** a strict-Epic-only plan is still byte-identical, ordering included. The first attempt broke it — `deriveUnits` returns files sorted by name where the old loop emitted them in lifecycle order — and `archive-destination.test.js`'s regression guard caught it. Ordering is preserved by exporting the suffix rule (`suffixOf`) rather than re-deriving it in the mover, which would have re-committed the same defect while fixing it.
- **`B84` — the release tool's own "you forgot to write the release notes" guard could not fire, and instead of refusing it rewrote history.** `foldChangelog` tested `/^## \[Unreleased\]/m` **anywhere** in the file and replaced the **first** match. This CHANGELOG carries a permanent historical `[Unreleased]` section — M5.E7's v2 direction audit shipped no code and was never versioned — so that heading satisfied the guard unconditionally and forever. A cut with no notes written therefore did not fail: it **relabelled M5.E7's section as the new release**, destroying the only heading marking it as no-code-shipped. Observed on the v0.1.20 cut and caught by reading the diff, not by the tool or the suite.

  The anchor is now **positional**: the pending section is the one **above** the newest released `## [x.y.z]` heading, so anything below is history and can neither satisfy the guard nor be replaced. Verified by running the real tool — `cut-release.js 0.1.21` refuses by name and leaves M5.E7's heading byte-identical.

  **Two tests were green because of the bug, not despite it.** The old refusal test's fixture omitted the `[Unreleased]` heading the real file always has — a guard proven on a corpus that could not exhibit the defect — so the new assertions run against the shipped `CHANGELOG.md` itself. And three version-site tests depended on that historical heading to make `releaseEdits` succeed at all; they now seed their pending section explicitly. M5.E7's heading is deliberately left alone: renaming it would silently change the status of the separately-filed `changelogBetween` heading-capture, which is a different bug's call.

## [0.1.20] — 2026-08-06 — Which copy of Signal is actually running (B52)

### Fixed
- **`B52` — a session runs whichever copy of Signal it happened to bind to, and nothing said so.** Claude Code resolves a plugin's install path **once, at session start**, and holds it for the life of the **process**. A session alive across a plugin auto-update therefore keeps running the version it started with while every config file on disk correctly records the new one. Three live sightings in six days, each caught only because a human noticed a version string in passing: one **silently discarded M5.E8's six-phase ledger** (the archive-before-reset step existed and was correct — it just was not the code that ran), one **re-issued an instruction a release had deleted**, one bound 0.1.16 against an installed 0.1.17.

  **`tools/lib/plugin-binding.js` compares the copy the process actually resolved against what `installed_plugins.json` records.** The bound root is derived from the module's **own path**, never `CLAUDE_PLUGIN_ROOT`: the env var states where the plugin is *supposed* to be, and this bug is precisely that disagreement. The banner names both versions, both paths, and the one remedy — **restart the CLI process**, with the explicit note that a `/clear` is not enough, because that was measured (a clear at 12:50 on 2026-08-02, inside a process alive since Jul 28, kept its binding) and because SessionStart re-fires on a clear, so a user who tries it will see the banner again.

  **Wired at two surfaces, and the second is not optional.** The SessionStart hook (`hooks/warn-stale-plugin-binding.js`) **structurally cannot see the originating sighting**: the binding is resolved before the hook runs, so a mid-session auto-update is invisible to it and the 78-second race would still be silent. `/sig:status` and `/sig:resume` re-read both files **at the moment of use** — the only moment that can observe an update that landed after binding. A hook-only fix would have covered the case that mostly is not the bug.

  A bound root outside `~/.claude/plugins/cache/` is a local checkout and stays **silent**, or Signal-on-Signal would banner itself from the moment a release bump lands on a branch. Read-only, offline, two file reads, fail-open throughout. **Inherent limit, stated so nobody tests it wrong:** the check ships inside the cache copy it inspects, so it cannot fire until a session binds to a version that has it.

- **`setCurrentEpic` no longer clears a phase log it did not archive — and building the guard found the loss has two causes with no stale cache involved.** The reset is unconditional, so *"archive first"* was a step that could be skipped rather than an invariant that held: **three** branches reached the zeroing write with an unarchived log and only one was covered. A **linear** project opening its first Epic never entered the archive branch at all, so its whole shipped history was zeroed silently; and `epicArchiveDirFor` returned null for any non-strict `current_epic` — `PHASE11`, measured live in eval-project-C by `B53` — whereupon the caller read that null as *"skip the archive"* and reset anyway.

  Linear history now archives to `.planning/STATE-HISTORY.md` (the destination `completePhase`'s trim already uses, not a new one), non-strict-but-safe units get M5.E18's flat per-unit directory, and a log with **no** safe destination **throws before any write** — pinned by a test asserting STATE.md is byte-identical after the refusal, not merely that it threw. The warning makes the *cause* visible; this makes the *damage* loud regardless of which version is running.

- **A symlinked `HOME` would have silenced the whole check, permanently.** `boundPluginRoot()` resolves symlinks — it must, since it answers *"which file is really executing?"* — while the cache-membership gate compared that resolved path against an unresolved `join(homeDir, …)`. Any symlink anywhere in HOME (a home directory on a linked volume; macOS's own `/var` → `/private/var`) made the prefix test fail, so the banner would never render on exactly the machines that needed it. **Caught by the hook's first end-to-end emit test** — every unit test passed while the hook printed nothing, which is `B39`'s shape: a detector that cannot see. Both sides are realpathed now, pinned by a test that builds the symlink deliberately rather than relying on the platform's temp dir happening to have one.

### Known limits
- **`B84` filed, not fixed** (P2): `cut-release.js`'s own "you forgot to write release notes" guard cannot fire in this repo, and it silently relabelled a historical section instead of refusing. Found by running the tool for this release.
- Suite **2233 → 2269**.

## [0.1.19] — 2026-08-06 — The control arm, made real (M5.E15)

### Fixed
- **`B55` — the control arm was never a control, and every verdict inherited the defect (M5.E15).** The adherence harness deleted the measured instruction from **one** command file while `plan.md`, `verify.md`, `review.md` and `ship.md` still ordered the same call. The arm labelled *"instruction deleted"* therefore contained the instruction four more times, so no run could distinguish *"the instruction works"* from *"the agent found it elsewhere."*

  **The canary now declares all five directive sites and the control arm deletes every one.** `commands/ship.md` is declared by **line**, not section, because its `### 5. Update State` heading also orders `completePhase` — a section delete there is *over-deletion*, which invalidates a verdict exactly as under-deletion does. Sites that *teach* the rule (`discuss.md`, `index.md`, `calibrate.md`), *document* it (`references/state-schema.md`), or *are* it (`tools/lib/state.js`) are deliberately left in place: a control agent stripped of the schema reference is a different agent, not the same agent minus one instruction.

  **Re-measured live: `B41-phase-entry` returned `OBEYED`** — treatment 3/3, control 0/3, seam probe PASS, 0 failed runs. The same numbers M5.E8 recorded, now meaning something: that control arm carried the instruction four times over, this one carried it zero times.

- **`B80` — the log used an annotation kind the code could not produce.** `NOTICE_KINDS` was frozen to `INVALIDATED` and `QUALIFIED` while `ADHERENCE-LOG.md` carried a `DIAGNOSED` block written **by hand**, outside the append-only guarantee the module exists to provide. `DIAGNOSED` is now a real kind — a finding about the *instrument*, where the number stands and what it could ever have shown is what changed. M5.E8's `OBEYED` record now carries its unisolated stamp, appended **from code**: the first annotation in that log not written by hand.

- **`B83` — a scope-limit assertion that could never fail.** `guard-callers.test.js` read its **own whole file** and asserted it contained `SCOPE LIMIT`, `2 of the 4 known instances`, `B39`, `B46` — every one of which also appears in the `expect()` line asserting it. **Deleting the entire header comment block left the test green.** Shipped M5.E13, unguarded for three releases. This is the exact failure the file was written to catch, and it says so forty lines above about `hasCaller`: *"a checker that satisfies itself is the failure it looks for."* Both that assertion and M5.E15's new one now read a header-scoped helper, with the non-vacuity itself pinned by a further test.

### Added
- **The leak check walks the copied tree independently, and fails closed** (`tools/lib/adherence-leak.js`). It **never** reads `canary.deletions` — a check that consults the deletion list can only find sites the list already knows about, which is how `B55` reported a clean arm. It greps every file under every copied directory (not just `commands/`) and classifies survivors against a seven-entry allowlist pinned by test; **anything unrecognised is directive and refuses the run**. A coupling guard hands it an empty deletions list and still requires a failure — the assertion that the independence is real rather than intended.

- **Directive residue refuses *before* any agent is invoked**, so a void run costs nothing; descriptive residue never blocks and is instead **named file-by-file on the record**. The **isolation scope now renders unconditionally** — when a canary declares none it says `undeclared` out loud, rather than omitting the line and reading as though the question never arose. Every verdict published before this one was measured at a scope nobody stated.

- **The experiment leaves the room it is measuring.** `references/adherence-canaries.json` carries the measured instruction verbatim and sat inside the copied tree, one directory from the control agent. It is now removed from the copy — **copy-time only, never packaging**: `ship.md` orders `node tools/adherence-run.js`, so a shipped plugin without its registry could not run the harness at all.

### Changed
- **The canary registry validates what the code depends on.** `isolation: "directive"` and a `deletions[]` list are required; an entry declaring neither `section` nor `line` **throws naming the canary id** rather than silently falling back to one-file behaviour — that fallback *is* `B55`. `trace.functionName` is required too: absent, the leak walk greps for the literal string `"undefined"`, which occurs throughout a JavaScript corpus.

- **`buildCaveats` moved to `tools/lib/adherence-caveats.js`** so it can be tested. It lived in a CLI script that exports nothing, which `tests/adherence-suite-guard.test.js` forbids any test from importing — deliberately, since importing the runner is how a suite spawns the paid CLI. It branched on the field this release replaces, so in place the rename would have left the branch permanently false and the *"a whole section was removed"* caveat would have silently stopped rendering, **with no test going red**.

### Known limits
- **`B81` remains open** (P2, filed not fixed): the guard-caller mechanism auto-detects 1 of ~25 CLI flags in `tools/`. Reconciling it needs a guard-vs-option definition written down first, so the leak check is governed by a **named** assertion instead and the file now states that the auto-discovered count is not the coverage count.
- Six acceptance criteria were **mutation-verified rather than RED-first** — the implementation landed before its assertions, so each was proven to discriminate by breaking the code and requiring the test to fail. Weaker than test-first, and declared as a deviation rather than counted as compliance.

## [0.1.18] — 2026-08-04 — The archive half, for the projects Epic-gating did not reach (M5.E18)

### Added
- **The archive half, for the projects Epic-gating did not reach (M5.E18).** Signal's two archive paths were Epic-gated **by construction** — `planArchiveMoves` filtered through `EPIC_ID_STRICT_RE` and `deriveEpicArchiveDir` **throws** on anything else — so a project naming its work `PHASE10-S4` or `GATE-A` could not archive at all.

  **Measured end-to-end across 12 real projects: `/sig:migrate-memory` went from archiving 67 files across 1 of 12 projects — every one of those 67 in Signal's own tree — to 114 files across 6.** `eval-project-C` 0 → 26.

  A non-Epic unit now archives to `.planning/archive/{unit}/`; a strict Epic ID keeps `.planning/archive/{M}/E{n}/` unchanged (verified: **0 previously-planned moves lost** across all 12 projects). Unit names are path-confined against 12 adversarial fixtures — a hostile name is **dropped, not thrown on**, so one bad name cannot deny the whole plan.

- **Closure has three outcomes, and the third is the point.** `closed` requires a terminal artifact **and** not-the-current-unit **and** a passing, *readable* verdict. Anything else that is not clearly `open` is `cannotDetermine` — **a value on the returned record, not a rendering decision**. Measured on the corpus: 30 terminal artifacts, **9 (30 %) carry no verdict this code will read**. Under a two-way answer those 9 silently became whichever side the implementer defaulted to.

- **The closed-set is a union, measured in both directions.** Retro-only sees 67 files and is blind to 8 projects; verdict-only sees 110 but **loses 4** (`M5.E17` has a retrospective and never wrote a VERIFICATION, so the verdict rule reads a shipped Epic as still running). Either counts → 114, nothing lost. **A stub retrospective vetoes closure regardless of verdict**, or the union would silently undo the `B64` fix below.

### Fixed
- **`B64` — a stub retrospective is not closure, at five decision sites (not the two that were planned).** `isStubRetro` has existed since M4.5.E9 and `enumerateRetros` reported `isStub` on every record — and it was consumed in **exactly one place**: rendering `*stub*` into `INDEX.md`. Every caller that used a retrospective to make a *decision* threw it away. A `[FILL IN]` placeholder therefore archived live Epics, **silenced the "you haven't written the retro" reminder** (writing the placeholder is what turned it off), evicted live narrative against an empty card, and **muted `checkEpicWithoutRetro` — the check shipped eight days earlier in v0.1.16 to catch exactly this shape**.

- **`B72` — `/sig:discuss`'s done-Epic guard had never fired on 8 of 12 real projects.** `isEpicDone` returned `false` for a non-strict unit id, collapsing *"I cannot evaluate this"* into *"evaluated, the answer is no"* — which the caller reads as permission to proceed. It now returns three answers; `/sig:discuss` proceeds only on a clean `not-done` and halts on `done` **or** `cannot-evaluate` unless `--epic` was passed, which stays the escape hatch so a linear project is never locked out.

- **`B63` — `/sig:migrate-memory`'s dry-run printed a bare `0`.** On a project it could not evaluate, *could not apply* was byte-identical to *already clean*. The count is now followed by what it means, and the four facts that produce "0 files to archive" render as four distinct things. The dry-run also lists **which** units move and where.

- **`B78` — `commands/review.md` stated the PASS-WITH-FIXES rule in four places and no two agreed** (the test pinning it was a fifth voice). The operator split three ways, so a fix of **exactly 50 lines** matched neither table row; the cap never stated its denominator. Now stated once: **≤ 50 LOC of non-test source**, with **required new coverage excluded from the cap** — the old wording made *"requires new tests"* a disqualifier, which penalised the reviewer who wrote a regression test, while `"all tests still pass"` only ever constrained tests that already existed.

### Changed
- **`checkEpicWithoutRetro` now counts an unprefixed `RETROSPECTIVE.md`.** Measured blast radius is **0 of 12** — the one project with an unprefixed retro also has prefixed ones, so it already evaluated. A latent gap that failed safe by inventory, not design; **this release does not claim to have fixed an observed problem.**

### Added
- **`tools/cut-release.js` — repo-local release tooling.** Cutting a release meant hand-editing four files that must all agree. `checkVersionConsistency` turns any disagreement red, so a wrong one could not ship — but nothing did the edit for you, so every release was a manual checklist with a tripwire at the end. v0.1.17 was cut with an ad-hoc `node -e` one-liner and its map stamp updated in a separate pass.

  One command now bumps `plugin.json`, `package.json`, the map header stamp, and folds `[Unreleased]` into a dated, titled heading. **Dry-run by default**; `--apply` is required to write. It refuses on a dirty tree, refuses without release notes (a release with no notes is the failure it exists to prevent), and **does not commit, tag, or push** — it prepares the edit and stops.

  **It addresses the recurring half of `B56` — it does not close the bug.** The published test count in `references/facts.md` has gone stale at three consecutive releases, corrected by hand each time while the guard over it — which compares documents to each other, never to the suite — stayed green. Under the release reading recommended in that bug the count is a release-time fact, so it is now set from **the same `vitest` run that gates the release**: one run answers both *"is the suite green"* and *"how many tests are there"*, and deriving the count any other way undercounts because several suites generate cases in a loop.

  **What remains open, stated plainly:** the count is now correct *by construction at a tag*, but only if the script is used — nothing requires it, which is `B71`'s shape one file over. And the guard itself is unchanged: a hand-edit to `facts.md` between releases is still invisible. `B56` stays `confirmed`.

  **Scope: this repo only.** It lives in `tools/`, not `commands/` — anything in `commands/` ships to users as a `/sig:` command and would change Signal's own roster and every count pinned to it. Same category as `tools/validate-plugin.js`: tooling for *building* Signal, not a feature of it. A test pins that placement.

### Fixed
- **`references/tier-definitions.md` contradicted `commands/calibrate.md` about the tier-routing order, and the disagreement changed real answers.** `calibrate.md` § 3 — the file that executes — says *"Apply these rules in order. First match wins"* and orders them FULL → **SPIKE** → **SKETCH** → FEATURE. `tier-definitions.md` listed them FULL → **SKETCH** → **SPIKE** → FEATURE and never said precedence mattered. It does: the gate sets overlap, and for `{scope: throwaway, stakes: none, novelty: first-for-org, reversibility: trivial, horizon: hours}` Signal returns **SPIKE** while a reader of `tier-definitions.md` concluded **SKETCH**.

  `tier-definitions.md` now states the precedence, lists the gates in executed order, and shows the overlapping input that makes the order load-bearing. `tests/tier-precedence-consistency.test.js` pins the two documents to each other — changing one without the other fails the suite. This is `M5.E17`'s class (instructions that contradict other instructions) found in the routing decision the whole product is built on.

  Found by checking the map page's calibrate simulator against both documents. **The simulator was correct**; the reference doc was not.

### Changed
- **The map's calibrate simulator and tier matrix are now reconciled against their sources.** The simulator is a second implementation of tier routing, and nothing compared it to anything — the position `COMMANDS` was in before `B32`. Its answer enums are now checked against `profile.js`'s `CALIBRATION_ENUMS` **in both directions** (a sixth axis can't leave it silently asking five questions), and all 11 rigor rows × 4 tiers — including `phases_skipped` — are checked against `tier-definitions.md`'s authoritative table. The decision *logic* stays duplicated by design; pinning it would mean a third copy of the rules.
- **The map's vocabulary examples no longer name live project state.** Four read `Currently: M4.5`, `Most recently shipped: … v0.1.5`, `Last shipped slice: … 2026-07-05` — under a code comment instructing maintainers to refresh them every release. Nothing enforced it and they sat four releases stale. They now teach timeless distinctions instead (*"a decimal Milestone is how scope gets inserted without renumbering everything after it"*), a test rejects any example that re-introduces a version or a *currently / most recently / last shipped* claim, and the refresh obligation is gone rather than merely satisfied.

### Fixed
- **`docs/map/index.html` can no longer silently drift from the plugin it documents** (`B32`). The public map page is hand-authored and nothing regenerates it, so two things had rotted in place: its `COMMANDS` array listed **17** commands under a heading that said **19** (`/sig:index` and `/sig:migrate-memory` had been missing since v0.1.8), and its header stamp read **v0.1.9** against a v0.1.17 plugin — with the word *"generated"*, which was never true.

  The old guard is why it survived. `checkRosterCounts` pinned the **heading number** to `roster.js` and nothing checked the **list underneath it**, so the count stayed honest while the thing it counted drifted.

  `tests/map-roster-reconcile.test.js` now reconciles all three arrays (`COMMANDS`, `AGENTS`, `SKILLS`) against `roster.js` **in both directions**, naming the offending entries — a name on disk with no map entry, and a map entry with no file. The three headings render their count **from the arrays**, so the number is no longer a second claim that can disagree. The stamp is pinned to `plugin.json` through `VERSION_SOURCES`.

  Nothing is generated: the map's per-item prose is deliberately friendlier than the source frontmatter and stays hand-written. Only the **set of names** is reconciled, the way `/sig:index` reconciles mechanical rows against curated notes.

### Changed
- **The three `docs/map/index.html` sites were removed from `ROSTER_SITES`** — mandatory, not incidental. Once those headings render their count from JS the source HTML holds no digits, the patterns stop matching, and `checkRosterCounts` **skips a site whose pattern is absent** — which would have left three guards that look alive and verify nothing (`B39`/`B54`'s shape). `analysis/CLAIM-INTEGRITY-ANALYSIS.md` counts `checkRosterCounts` among only two claim-vs-reality checks in all of Signal, so the trade is stated plainly: one number-comparison replaced by a full both-directions name-set comparison. Strictly stronger.
- Both new guards are pinned against their own removal — tests assert the `map-roster` markers and the version stamp **exist**, because deleting either would have disabled a check rather than failed it.

---

## [0.1.17] — 2026-08-03 — The briefing survives a phase it doesn't recognize (`B70`)

A one-bug patch, cut ahead of M5.E18's build work because the bug is a **P1 on the two read-only commands people run most**, and it fails by taking the whole output rather than one line of it.

### Fixed
- **`/sig:status` and `/sig:resume` no longer die on a project whose `phase` is not one of the seven canonical names** (`B70`, P1 — **5 of 12 real projects**). `nextActionForPhase` throws on anything outside `PHASES`, and in `resume.md` the call sits *inside* `renderResumeBriefing`'s argument list — so the whole briefing was lost, not just its next-action line. Every neighbouring optional read (`isStaleVsOrigin`, `readLayoutBanner`, `readStateSizeForTier`, `readEffectiveProfile`) is marked fail-open; this one call nobody marked safe, while `reachedDoneViaSkip` — the sibling function directly below it in the same file — already failed open.

  Both commands now route through **`describeNextAction`**, which never throws, and **`formatNextActionCopy`**, which renders the copy. `nextActionForPhase` keeps its strict contract unchanged, so callers that want the guard still get it.

  **The briefing renders in full and names the problem** — that the phase is unrecognized, a one-line excerpt of what STATE.md actually holds (the real value on one project is five paragraphs of prose, so it is collapsed and elided), and the seven valid values. Rendering nothing was rejected: a field that drifted by accident would look identical to one set deliberately, which is `B39`'s shape.

---

## [0.1.16] — 2026-08-02 — STATE-vs-world drift detection (M5.E16)

`/sig:sweep` gains six deterministic checks comparing what a project's `.planning/` **asserts** against what is on disk and in git. Each declares whether it needs a person or clears itself — and, crucially, the report distinguishes **"checked and clean"** from **"could not check"**.

That distinction is the release. Measured across 13 real projects, the two checks aimed at the incident that opened this Epic can evaluate **2 of them**: Signal's own hand-maintained, Epic-mode, `schema_version: 1` shape is the *minority* shape. A detector printing nothing on the other 11 would read as *clean* when it never looked.

### Added
- **Six STATE-vs-world checks** in `/sig:sweep`, in their own report group: an Epic worked without a retrospective · a `last_updated_commit` that is not an ancestor of `HEAD` · a `PROFILE.md` the loader cannot read · a `current_epic` that is not a valid Epic ID · a `phase` behind the artifacts on disk · a body that never mentions the Epic its own frontmatter names.
- **Heal categories.** Every check declares one, enforced by the constructor — *needs you*, or *clears the next time Signal writes STATE here*. A check that cannot name what clears it cannot be registered.
- **`INDEX.md` regenerates at every phase transition**, not only at `/sig:ship`. Compare-before-write, so an unchanged doc set produces no diff. All four projects surveyed had a stale, missing or foreign index while `CLAUDE.md` told every reader to open it first.
- **`/sig:update`** — installed vs. available version, **plus the CHANGELOG entries in between**, which is the half `/plugin` cannot show you. Updates only on confirmation, then states plainly that a restart is required (`B52`). Roster **18 → 19 commands**.
- `tools/state-drift-probe.mjs` — runs the checks across many projects and prints the applicability table, so the coverage numbers are re-derivable rather than asserted.

### Fixed
- **`B59`** — Signal's own `M5.E16-PROFILE.md` carried **two** values outside their enums, so `readEffectiveProfile` threw and the Epic declaring FEATURE ran its whole DISCUSS at the project's FULL. Found at this Epic's own PLAN preamble — the first time any code read the file. Pinned by `tests/own-profiles-parse.test.js`.
- **`(c)` reported "clean" on a project it could not see** — found at REVIEW, in shipped code. `eval-project-C` has 19 phase artifacts and 0 retrospectives; the check declared itself unconditionally evaluable while keying detection to a strict `M{n}.E{n}` filename. **REVIEW returned FAIL and the Epic looped back to EXECUTE** rather than take the small-diff exit.

### Notes
- **`/sig:sweep` stays read-only** (**D-M5E16-1**). FR4 said *"Signal runs it"*; NFR2 said sweep never writes. Resolved in NFR2's favour: healing arrives at the phase transition and behind an explicit `--heal`. The recorded cost — **the command-healable bucket ships empty**, and a test asserts that emptiness.
- **Two checks dropped, with reasons.** Orphan detection duplicates `detectOrphans`; the blockers check is **unvalidatable** — *zero of thirteen* real projects have a non-empty `blockers[]`, so FR2.1 cannot be satisfied for it even in principle.
- **Precision, measured:** 13 projects, **5 findings, all true positives, 0 false positives**. NFR3: **+19 ms** against a 200 ms budget.
- **Nyquist published honestly: 87 of 98 tests measured red-first**, not 98/98. Ten passed against their own pre-implementation baseline — 3 regression guards, 2 posture locks, 5 absence assertions that are vacuous by construction. Measuring rather than attesting is what surfaced it.
- **`B60`** filed: six phase commands handle only *"PROFILE not found"* while four meta commands also handle a malformed one — 6 silent / 4 explicit. **`B61`** filed: a hand-edited numeric-looking `last_updated_commit` is YAML-coerced (Signal's own writers are safe; only hand-edited state is exposed).
- Adherence ceiling regenerated: 429 directives, 90 trace-measurable (**21.0%**). It rose this time, because a new command names real library calls — the mirror of the three previous releases where clarifying an instruction lowered it.
- `references/facts.md` test count corrected 894 → 1938. **`B56`'s guard half stays open** — nothing yet pins that number to the real suite.

---

## [0.1.15] — 2026-08-01 — Instructions that contradict other instructions (M5.E17)

Three Signal instructions disagreed with another Signal instruction, or with ratified practice. Nothing compares one instruction against another, so two documents can give an agent conflicting orders indefinitely and only a live run reveals it. Each fix ships with a test that pins one document against another.

### Fixed
- **`ship.md` referenced a commit that no step created.** Four steps (§5.5, §6, §6.5, §8) instructed staging "into the SHIP commit" — and no step in the file ever made it. `markFresh` sat at §5.3, ahead of all four, so it stamped a pre-commit HEAD **by construction**. Observed live during M5.E13's own ship. New §9 creates the commit, with `markFresh` after it.
- **`verify.md` and `review.md` stated no `markFresh` ordering at all.** Not wrong — silent, which means the agent picks. Both now carry `plan.md`'s wording verbatim.
- **`review.md`'s verdict table contradicted two shipped Epics.** It read *"FAIL | Any Critical"* in three places while M5.E9 and M5.E13 both shipped PASS-WITH-FIXES with a Critical closed inside REVIEW. The rule was miscalibrated, not the practice (**D-M5E17-1**). A Critical *discovered and closed in-phase* is now PASS-WITH-FIXES — under four **conjunctive** conditions, with the counter-argument recorded in the file.

### Added
- **`plan.md` now schedules first-use.** The planner must name what the Epic will do **for the first time** — a tool used for its real purpose, a document executed rather than read, a code path a new project shape takes — and put it in **wave 1**. *"Shipped but never run"* is Signal's best defect predictor: `B54`, `B39`, `B42`/`B53`, `B48` and `B55` all surfaced on a first execution, all late. `B55` — M5.E13's largest finding — landed on that Epic's very last task.
- **Four cross-document instruction tests** (`tests/commands-wording.test.js`). 1806 → **1822 tests.**

### Notes
- **AC corrections, recorded openly.** Two of this Epic's own acceptance criteria were satisfiable by a **no-op** — `review.md`'s three statements already agreed *with each other* (the disagreement was with practice), and a command that states *no* ordering passes "does not instruct `markFresh` before the commit." Both were executed in corrected forms.
- **The red baseline was measured, not predicted** — and running it caught an error in the probe itself: a naive regex false-RED'd the two files that were already correct, because they read `Run it **after** the commit` and the markdown bold broke the match.
- **`B56` filed:** `references/facts.md` publishes 894 tests (actual: 1806), and the guard over it pins `facts.md` to `README.md` but never to the real count — both drift together, test stays green.
- **Deferred:** the 48-entry inbox triage (FR4) moved to **M5.E14** with the tracker migration (**D-M5E17-3**).
- Adherence ceiling regenerated: 414 directives, 87 trace-measurable (**21.0%**). Clarifying an instruction lowers the published share.

---

## [0.1.14] — 2026-07-30 — Guards that don't guard (M5.E13)

**Four defects that shared one shape: something was built to catch a mistake, and it did not catch it.** 1736 → **1806 tests**, validator green, eslint clean. **CI added** — Signal had none until now.

### Fixed

- **`B48` — the phase-entry instruction demanded a false record.** `plan`/`execute`/`verify`/`review` told the agent to call `transitionPhase` *"before any Workflow step"* with no precondition clause. Observed live: an agent running `/sig:execute` against a project with no PLAN artifact **refused it**, correctly — obeying would have recorded `phase: EXECUTE` for a project with nothing to execute. Fixed in both halves (D-M5E13-4): the four commands now state the transition as conditional, in a **single shared wording** so they cannot drift, and `transitionPhase` itself refuses to record a phase that produced no artifact. Exempt phases are enumerated and **exported** (`PHASE_ARTIFACT_EXEMPT`), each with a written reason.
- **`B53` — a non-strict `current_epic` split artifact write-naming from read-resolution.** `artifactName` used the strict Epic-ID shape and emitted `1-PLAN.md`; `resolveArtifactPath` used a lenient regex and resolved `PHASE11-PLAN.md` **first** — so a fresh write was shadowed by a stale file, while `references/epic-native-flow.md` guaranteed the opposite. The resolver's first candidate is now `artifactName`'s own output, making the guarantee true **by construction** for every value of `current_epic`. The lenient pattern remains below it, so existing non-strict projects keep resolving.
- **`B54` — `checkGateArtifacts` was uncalled *and* wrong.** An exported phase-gate checker nothing invoked; executed against Signal it returned `{ready:false, missing:['REQUIREMENTS.md']}`, hardcoding the unprefixed name while Epic mode writes `M5.E13-REQUIREMENTS.md` — so switching it on would have blocked PLAN for every Epic-mode project. Four of its five gates were empty arrays. **Deleted**, its job rebuilt in `transitionPhase`.
- **`B39` — the trigger watchlist was never walked.** A standing inbox entry instructed `/sig:plan`'s drain to check its conditions at every drain; no command implemented it. `parseTriggerWatchlist` added and wired in. On its first run: **11 rows, all unevaluated**, two of which had already fired — including one whose condition said *escalate*.
- **`B36` — the release retro gate skipped silently on a stale milestone row.** Sighted live three times. The gate still defers to a maintained row (D-E9-5), but can no longer fail *quietly*: it returns `{unevaluated, cause:'stale-milestone-row', rowStatus}` and `/sig:ship` must print the reason.
- **`B49` remainder — the version check now covers `package.json`.** The covered set moved from three reader functions to **one exported table** (`VERSION_SOURCES`), so a fourth version file is an edit rather than a rediscovery.
- **`B51` — `discuss.md` instructed a phase transition `/sig:plan` also performs.** Doubly stale: the pre-M5.E9 convention *and* the pre-`schema_version: 1` file format.

### Added

- **Retro-index freshness check** (`checkRetroIndexFreshness`), sibling of `checkIndexFreshness`, wired into `/sig:sweep`. Read-only by construction.
- **Guard-caller hygiene test** — asserts every `--flag` CLI guard in `tools/` has a non-self caller. **States its own scope limit**: it covers the *code-shaped* instances only (2 of the class's 4), and says so in its name.
- **CI** (`.github/workflows/test.yml`) — `npm test` on push and PR. Its first run caught a latent dependency nothing had stated: the suite walks real git history, and `actions/checkout` shallow-clones by default.

### Known limits — stated, not hidden

- **The adherence canary for `B41-phase-entry` re-ran INDETERMINATE** (treatment 3/3, control 1/3), replacing v0.1.13's `OBEYED`. Cause is **`B55`**: the control arm mutates one command file while `transitionPhase` is named 4× each in three siblings, so it was **never isolated across files**. v0.1.13's `OBEYED` is not falsified but was *unisolated* — clean by luck, not construction. Deliberately **not re-run for a better number**. Homed at M5.E15.
- **The published coverage share fell, 22.4% → 21.1%, and nothing got worse.** The `B48` rewording added conditional prose that is directive but names no library call, so it lands in the denominator only. `ADHERENCE-LOG.md` now explains this above the table, and warns that under this metric *clarifying an instruction lowers the score*.
- **`B46` re-triaged, not fixed.** Its premise does not survive measurement: 0 of 48 inbox candidates correspond to any disposition row. Stamping would have written verbs from one population onto another.

## [0.1.13] — 2026-07-28 — The measurement foundation (M5.E8)

**Signal can now measure whether one of its own instructions changes what an agent does — and it publishes how little of itself that method can reach.** 1652 → **1736 tests**, validator green, eslint clean.

### The first measurement

```
canary       B41-phase-entry — call transitionPhase() at phase entry
as-written   3/3   unanimous
deleted      0/3   unanimous
failed runs  0
VERDICT      OBEYED
```

**M5.E9's phase-entry fix works.** It shipped in v0.1.12 unverified — M5.E9 labelled that limit in its own test header rather than let a passing test imply otherwise, and that admission is what opened this Epic. The first thing the harness measured is the thing its predecessor could not.

**`OBEYED` means "obeyed when the phase can actually run", not unconditionally** — see `B48` below. Every run record now generates its own scope boundaries (one canary is not a survey; N=3 is a weak split; the verdict is conditional on tool access; the unmeasured remainder is unmeasured, not passing).

### The number, published before the harness could influence it
- **`.planning/ADHERENCE-LOG.md`** — of **407 directive lines** across the 18 `commands/*.md`, **91 (22.4%) leave an observable trace; 316 (77.6%) do not.** The split rule is written out in full in `tools/lib/directive-classifier.js`'s header so a reader can disagree with it line by line, and is pinned against a hand-labelled fixture.
- **The remainder is stated as *unmeasured, not passing*** — and a **wording test** guards that sentence, because it is the one most likely to be quietly softened later.
- **This corrects the Epic's own research.** The pre-build estimate was 22/202 = **10.9%**. More importantly, R1's claim that `execute.md` / `verify.md` / `review.md` / `calibrate.md` name **zero** library calls — and therefore *"the phases doing the most work are the least measurable"* — **is false against the tree**: they name **4 / 3 / 3 / 0**, including `transitionPhase`, this Epic's own canary. The estimate is left verbatim in `M5.E8-RESEARCH.md` under a superseded-by-measurement block, because the plan was built on it and deleting it would hide that.

### The harness
- **`tools/adherence-run.js --canary <id>`** — runs a command twice, as written and with the instruction line deleted from a **copy** of the command tree, N runs per arm, and reports the **difference** plus the spread. Out of the test suite by design (D-M5E8-1): `npm test` stays deterministic, offline and free, and a guard test asserts no test imports or spawns the entry point.
- **Four verdicts, three of which are not "pass":** `obeyed` · `inert` (the trace appears in **both** arms — the instruction caused nothing; a finding, never retried until it passes) · `absent` · `indeterminate`. Anything short of a unanimous split is `indeterminate`, and the threshold was **fixed in `references/adherence-canaries.json` before the first run**, for the same reason AC3.3 pins traces pre-run.
- **A refusal that outranks all four:** no verdict at all unless a **seam probe** proved that run's mutation actually reached the agent.
- **Loud when it cannot measure** — an unreachable CLI aborts with *"this is not a measurement of zero"* and exits 1, before any fixture is built. A harness reporting "0 obeyed" because the CLI was missing is the most dangerous output this Epic could emit.

### Two build-time corrections worth carrying
- **`[FIXED IN-EPIC]` The control-arm seam was wrong.** S2 first set `CLAUDE_PLUGIN_ROOT`, on R3's reasoning that command files reference it for skill paths — but that is text substitution *inside an already-loaded command*, not command **resolution**. The real seam is the documented `claude --plugin-dir` flag. The copy was also missing `.claude-plugin/plugin.json` and the `yaml` runtime dependency, so it could neither be loaded as a plugin nor execute the library call the canary measures.
- **Why that class of bug is the dangerous one here:** if a mutation never reaches the agent, **both arms produce the trace and the harness reports `inert`** — the outcome this Epic *pre-committed to* as acceptable so nobody would treat it as a crisis. A plumbing failure would have passed through the one guardrail meant to catch surprises. Hence the probe is a **permanent precondition**, not a setup step.
- **Three throw-rather-than-degrade paths** guard the same disguised failure: a missing deletion target, a target matching twice, and an unknown trace field would each produce two identical arms.

### Known limits, stated rather than discovered later
- **Half this Epic is not suite-testable by construction** (`M5.E8-VALIDATION` F2). The suite proves the harness **computes** correctly against a stub; it can never prove the harness's answer about a real agent is **true**. A green suite here is not evidence of measured adherence.
- **The ship-checklist anchor is presence-only.** `commands/ship.md` § 1 gains an adherence line, and a test asserts it exists. It cannot prove a maintainer reads it — labelled in the test file itself, per M5.E9's precedent.
- **Checklist items are not counted as directives.** Items written as completed states (*"docs/map refreshed if…"*, *"All tests pass"*) fire neither stage-A rule. Found by adding FR6's own checklist line and watching the ceiling not move; now recorded in the classifier's documented limits.

### New bugs, both live in shipped code
- **`B48`** (**P2**) — **`execute.md`'s phase-entry instruction is unconditional, and an agent refused it on correctness grounds.** Against a project with no PLAN artifact, `/sig:execute` halted at its preconditions and the agent **explicitly declined** the phase-entry write: calling `transitionPhase` there would record `phase: EXECUTE` for a project with nothing to execute and append `PLAN` to `completed_phases` when PLAN produced no artifact — a false record in the very ledger v0.1.12 had just made honest. Obeying the instruction literally corrupts the log; disobeying it reproduces `B41`. **Affects all four commands M5.E9 changed. Live since v0.1.12.** Found by reading a run transcript, not by a verdict.
- **`B49`** (P3) — `package.json` and the plugin manifest disagreed on the version (`0.1.11` vs `0.1.12`). **Fixed in this release**; both now read `0.1.13`.

### Fixed during REVIEW — every defect was in the measuring instrument
Four instrument defects, and **each produced a plausible-looking result rather than an error**:
- **`[CRITICAL]`** The source commit was captured *after* a run rather than before. An arm takes 20+ minutes, so a commit landing mid-run meant two arms measured against **different code** could record the **same sha** and be accepted as a valid pair — defeating the very guard that makes splitting the arms safe. Now captured at start, and a **dirty working tree** is recorded too.
- A verdict shipped without its scope, authored by hand rather than generated.
- The test guarding the published number was a substring check that could not detect staleness — while `--check` did the correct comparison and **nothing ever called it.** *Same shape as `B39` and `B46`: a guard written, shipped, and never wired up.*
- A second writer to the append-only log inherited none of its guarantee.

### `B36` sighted live for the third time
The FR1 retrospective gate **skipped** at this Epic's own SHIP (`{skipped: true}` — *"not an Epic-close"*), because `MILESTONE-5.md` still carried E8 as `▶ NEXT`. The retro existed only because it was written before the gate ran. Same inertia as at M5.E9's ship. **`B36` is confirmed by dogfooding three times over now, not by reading.**

## 2026-07-26 — The v2 direction audit (M5.E7) · analysis only, no version cut

**No code shipped, so no version was cut.** The deliverable is a decision: **[`analysis/SIGNAL-V2-ROADMAP.md`](analysis/SIGNAL-V2-ROADMAP.md)** — what Signal builds next, in what order, and why, grounded in Signal's own record. **45 candidates verbed: 11 distinct builds · 16 continue · 19 abandon**, sequenced as **M5.E8 → M5.E12** and landed in [`.planning/BACKLOG.md`](.planning/BACKLOG.md) with a trigger, a first slice, and a stranger-checkable done-when apiece (a roadmap in `analysis/` is enforced by nothing — D-M5E7-8(b)). Suite unchanged at **1623/1623**; validator green; command / agent / skill roster unchanged at **18 / 26 / 21**. Ran at FULL tier under Signal's **first Epic-scoped PROFILE** (`M5.E7-PROFILE.md`) — *"strict thinking, zero test theater."*

### The finding it is organized around
- **Signal cannot detect whether its own interventions work, in any dimension.** No test anywhere asserts that a prompt instruction was obeyed, against a measured **7-of-12 workflow adherence and a 7.12× output-token spread on byte-identical code**. Six separately-logged observations turned out to be one. **M5.E8 (measurement) is therefore unconditional-next and gates every prompt-shaped port.**

### Reversed
- **The COMPOUND port group is cut — its premise was falsified.** Read with dates and Epic IDs attached, the knowledge was in-context at the moment of the miss **in all three documented carry-over chains**, so a cross-session store with confidence decay prevents none of those. The one genuine cross-session recurrence (`B13`) is cut separately, on a deterministic-content-check ground. The real gap is **class-completeness at fix time** — a review-scope rule, now M5.E10.
- **`<HARD-GATE>` is cut because it does not exist as a mechanism** (correction **C3**, verified at source against superpowers v6.2.0): 4 grep hits repo-wide, 1 in a live skill, none in `hooks/` or `tests/`, no parser, no validator. Signal already has the capability natively — the exit-2 STATE write-guard, the `PreToolUse` hook, and an FR1 retro gate that hard-blocked its own SHIP.
- **The coverage frame is superseded.** A scorecard counts what is absent, so it is structurally blind to Signal being *ahead* of a source — which happened on the first pass.
- **Also cut:** gstack's 15-phase `/cso` (threat-model fit; Phase 8 carved out and parked), pm-skills GTM + product discovery (product fit, ratified), the Cursor adapter (demand fit), OMC `visual-verdict` + consensus-planning (overlap). **No cut cites dormancy or staleness** — mechanically asserted; correction **C6** found the "~15 months old" figure was **~3 months**, wrong by ~4.5× and sitting inside a locked decision.

### Corrected
- **C2** — the harvestable retro corpus is **12 files, not 16**; 4 are `[FILL IN]` stubs, reported and deliberately not reconstructed. **C5, C7, C8** likewise marked at source in `analysis/`.

### Known / carried forward
- **`B41`** (**P2**, `confirmed`, cataloged at REVIEW) — **four of the seven phase commands never call `transitionPhase`.** Only `calibrate` / `discuss` / `ship` do, so in a command-driven project a full run ends with `completed_phases: [DISCUSS]` and PLAN/EXECUTE/VERIFY/REVIEW **never recorded**, while `/sig:status` reports `DISCUSS` throughout; `plan.md:50`'s *"verify current phase is PLAN"* precondition is unsatisfiable by any command. Aggravated by `markFresh`, which stamps a fresh timestamp over the stale position — *stale-and-flagged* becomes *stale-and-silent*. Masked here because this repo maintains those fields by hand.
- **`B37`–`B40`** (`confirmed`) and **`B32`–`B36`** (`needs-triage`) — **10 open bugs**, all homed in **M5.E9**, whose slice is the three P2s (`B36`, `B39`, `B41`). *(Superseded 2026-07-26, after this release: `B42`–`B45` cataloged from a live linear-mode ship report → **14 open**, and the slice re-ordered around `B42`, the ledger's first `P1`. Current state: `.planning/BUGS.md`.)*
- **`B39` caveat, and it applies to every trigger Signal has written down:** the trigger-watchlist walk has **never run** — `/sig:plan` was never taught the drain step the standing entry instructs. **Until M5.E9 lands, a trigger is a note, not an enforcement.**
- **A dated self-check, not a trigger** — the roadmap's own falsifier (*"M5.E8 lands, measurement shows enforcement is as good as claimed, and the ports still never happen"*) cannot fire on a trigger, because nothing fires on a null result. Landed under M5.E9 as a check dated **2026-10-26**, where silence past the date defaults to *"the reframe was decorative; re-run the roadmap."*

## [0.1.12] — 2026-07-27 — M5.E9 (linear mode can ship; the phase ledger becomes an honest log)

**A project that does not use Epics can run `/sig:ship` again — and the phase ledger stops silently destroying its own history.** Five confirmed bugs closed (`B41`–`B45`), all four of them reported from **outside** Signal's own use rather than found by its suite. 1623 → **1652 tests.**

### `[BREAKING]` — `.planning/STATE.md` `completed_phases` semantics changed

`completed_phases` is now an **append-only log of the current run**, not a set. Three rules, all previously load-bearing and unwritten (now in [`references/state-schema.md`](references/state-schema.md) § "The phase log"):

1. **Append-only.** A phase re-entered during recovery is recorded again. The old `Map` dedupe collapsed the list to one entry per phase name — which destroyed **53 entries of a real project's history in a single call**, silently, with no diff, warning or count.
2. **An entry records the phase being LEFT.** The list must never contain a phase still in flight: `/sig:resume` counts it against a `/7` denominator and the Epic-close detector tests it with `.some()`. Because **SHIP is terminal**, no ship date could ever be recorded — new **`completePhase(baseDir, phase)`** does that, and `/sig:ship` calls it.
3. **The live list holds one run; finished runs relocate, never delete.** Linear projects trim at ship → `.planning/STATE-HISTORY.md`. Epic projects archive on roll → `archive/<milestone>/<epic>/STATE-NARRATIVE.md`, **before** the reset that has silently dropped the list since M5.E2.

**No migration needed.** Existing projects converge on the next phase write.

### ⚠ If your project ran more than one unit of work before v0.1.12, earlier phase entries were lost — and there is no recovery

They were removed from `STATE.md` by the dedupe and cannot be reconstructed: the evidence was destroyed by the bug itself, and a collapsed list is byte-indistinguishable from a healthy one. **This is a one-time disclosure, deliberately placed here rather than as a `/sig:sweep` warning** — REVIEW proved any such detector fires on healthy projects too (see below). Future runs are protected; git history may still hold older `STATE.md` revisions.

### Fixed

- **`B42` (P1)** — **a project with no Epics could not run `/sig:ship` at all.** The FR1 retrospective gate hard-halted on `current_epic: null`, before every other step, with the bypass deliberately designed out — while linear mode is documented as first-class in the other six phase commands. **Live since v0.1.3, across nine releases**, invisible because Signal-on-Signal has been Epic-mode since M4.5.E11. The gate is now **Epic-only** (D-M5E9-1): a project with no Epics owes no Epic retrospective. Three gates had to move, not one. **`D-E9-3`'s "no bypass" is unchanged for Epics** — this is a scope, not a bypass, and no flag was added. Supersedes M4.5.E9's `AC1-extended`, annotated in place rather than deleted.
- **`B43`** — `transitionPhase` could never record a `SHIP` date, because SHIP is terminal and it records the phase being left. `ship.md` claimed the opposite since v0.1.3 while the code carried the truth in a comment. Fixed by `completePhase`, not by inverting the recording.
- **`B44`** — the dedupe removal above.
- **`B45`** — existing ledger entries were never validated (only the argument was), so a stray line keyed on its first whitespace token and became a **permanent phantom phase**. Entries are now quarantined — **relocated verbatim, never dropped** — with the count surfaced.
- **`B41`** — `plan` / `execute` / `verify` / `review` never advanced `phase`, so a command-driven build finished with `completed_phases: [DISCUSS]` while `/sig:status` reported `DISCUSS` throughout. All four now transition **at entry**. `plan.md`'s *"verify current phase is PLAN"* precondition — which **no command could ever satisfy** — is corrected.

### Added

- **`/sig:sweep` reports phase-log health** — malformed entries (structural) and a live list longer than one run (advisory). Read-only, like every sweep check.
- **`tests/linear-mode-e2e.test.js`** — a labelled **coverage-gap guard** driving the one combination Signal cannot reach from its own development: no Epics, plus a history spanning many units. **16 of 22 new tests fail against the pre-release code**, verified by replay.

### Known limits

- **Nothing proves a phase command obeys its own instruction.** v0.1.12 makes four commands *say* to record their phase; obedience is unmeasurable today and is M5.E8's scope.
- **`B47`** — `/sig:resume` reads `0/7 phases done` immediately after a linear ship (cosmetic; the archived run is intact and zero-loss-verified).
- **`B46`** — M5.E7's 45 inbox dispositions were written to a side artifact and never stamped back, so they resurface at every drain.

## [0.1.11] — 2026-07-25 — Doc-runtime close-out (M5.E6)

The maintenance-command half of the doc-runtime flagship — finishing Signal's self-maintenance so it's locked before the BR-8 v2-port re-audit. Adds one slash command (`/sig:sweep`, **18 commands** now / 26 agents / 21 skills), clears the four M5.E5 carry-over bugs, and closes the FR7 concurrency work. Additive; no breaking changes; no new runtime dependencies; no `.planning/` schema change. 1561 → **1623 tests**; FULL/strict throughout. VERIFY PASS (strict — independent mutation proof-of-fail on the B27/B30/B29 gates); REVIEW PASS (a 3-specialist adversarial panel — code-quality + security OWASP/ASVS-L2 + test-integrity — found **0 Critical, 0 false-greens**).

### Added
- **`/sig:sweep`** — a read-only, invoking-project doc-hygiene report. Runs on `process.cwd()` (helps *stranger* repos, not just Signal): dead-links + `[FILL IN]` stubs + INDEX-freshness + stale-inbox + CLAUDE.md-bloat (portable, run anywhere), plus roster / version / command-frontmatter (Signal-only, auto-skip + *stated* when there's no `.claude-plugin/plugin.json`). Detect-and-report only — no `--fix`. Structural vs. advisory grouping; deterministic; offline.
- **FR3** — a `docs/map` refresh line in the `/sig:ship` pre-ship checklist (both map tabs: "Signal, explained" + "Functionality map"; "no change needed" is a valid outcome).

### Fixed
- **B27 / B28** — `/sig:migrate-memory`'s dangling-link gate now **flags** (rather than aborting the whole migrate) a *pre-existing* archive-inline link to an FR6-renamed target (B27) or an absolute-path `.md` dangle in an evicted closed block (B28) — mirroring R7's archive-prose exemption. A genuinely migrate-*introduced* dangle still aborts + rolls back (a tightness pair + a residual-abort discriminator prove the gate still bites).
- **B29** — the FR5 `_afterRead` test seam is hardened against prototype pollution: an `Object.hasOwn(opts,'_afterRead') && typeof …==='function'` guard at all 6 RMW sites, so an `Object.prototype`-injected `_afterRead` can never reach the awaited-under-lock seam. (Unreachable in practice — defense-in-depth.)
- **B30** — the FR1 retro gate now fires on a **fresh REVIEW→SHIP flow** (previously it saw `phase: REVIEW` at the Step-0.5 pre-check and skipped). `shipFR1Check` synthesizes an in-memory post-transition state and evaluates Epic-close against it, persisting nothing — so an Epic can no longer ship with no retrospective just because the pre-check ran before the SHIP transition.

### Changed
- **FR7 concurrency close-out + B31** — the doc-runtime's RMW paths were already lock-protected (M5.E4 FR5 + M5.E5 B25); this marks that work done and closes the one genuine remaining hole: **B31** — `/sig:add`'s doc-write now runs under `.state.lock` (a re-read-inside-lock core), mutually exclusive with drain/ship writes to the same inbox / OPEN-QUESTIONS / BUGS files. The interactive scrub prompt stays outside under `.add.lock`; the pure insert helpers stay lock-free (no re-entrancy with drain's promote). `/sig:add` behavior is byte-identical for a single session.

### Known / carried forward
- **B36** (P2, `needs-triage`) — surfaced dogfooding *this* ship: the FR1 retro-gate's Step-0.5 check silently skips when a **stale/non-shipped milestone row** is present (both STATE fallbacks are row-absence-gated). The gate fired correctly here only after the E6 row was marked shipped — a third milestone-row residual after B26/B30.
- **B34 / B35** (P3, `needs-triage`) — the `renameFn` seam is the B29-parity pollution sibling (unreachable), and `sweep.js checkIndexFreshness` has one unwrapped compose/diff (low-reach). Both batchable into a hardening pass.
- **B32 / B33** (P3, `needs-triage`) — the `docs/map` COMMANDS enumeration array is missing 2 commands; a stale `add.js` `LOCK_TTL_MS` comment. Pre-existing, cosmetic.

## [0.1.10] — 2026-07-21 — Carry-over bug squash (M5.E5)

The four M5.E4 carry-overs cleared. Additive; no breaking changes; no new runtime dependencies; no `.planning/` schema or slash-command-surface change (still 17 commands / 26 agents / 21 skills). 1529 → **1561 tests**; FULL/strict throughout; REVIEW ran a 3-specialist adversarial panel (PASS) — the test-integrity pass built a 12-case mutation matrix and found **zero false-greens** (contrast v0.1.9's two).

### Fixed
- **B24** (P2) — `/sig:migrate-memory` no longer false-aborts on a pre-existing broken `](*.md)` link inside a *closed* DECISIONS section. `computeDanglingDelta` is re-keyed on the link's **resolved absolute target** (the invariant the append-log evict's move+reroot preserves) with multiset/count semantics, so a pre-existing dangle survives the relocation and dry-run/apply agree — while a genuinely migrate-*introduced* dangle is still caught (the multiset test was verified to fail against a `Set`).
- **B26** — the FR1 retro gate now fires on the **self-hosted / Epic-prefixed flow**. When `MILESTONE-N.md` lacks the Epic's status row, `shipFR1Check` + the `check-state-write` hook fall back to a tier-aware STATE signal (`phase: SHIP` + all tier-required pre-SHIP phases complete), gated on row-absence so a maintained per-slice ship is never wrongly forced to write a retro. (Dogfooded on this very release — it hard-blocked its own SHIP until the retro existed.)
- **B25** — FR5 read-enclosure now has a **behavioral interleaving test** (previously only throw-under-held-lock, which a read-outside-lock wrapper passes too). A test-only `_afterRead` seam — inert in production, mirroring the existing `renameFn` seam — pauses a writer mid-lock; a deliberately-broken read-outside-lock twin proves the new test genuinely fails on the bug it guards.
- **B6** (refinement) — `/sig:resume` + `/sig:status` staleness now distinguishes bookkeeping from work by **file identity**: a committed `*-PLAN` / `*-PROGRESS` / `*-VERIFICATION` / `*-REVIEW` file never rolled into STATE now reads as *stale* (worth a refresh nudge), while a STATE/CONTEXT-only bookkeeping commit still suppresses. Count-independent (no false alarm on a split STATE refresh).

### Known / deferred
- **B27 / B28** — the migrate dangling gate still over-aborts (fail-safe) on two rarer link shapes inside evicted closed blocks: an inline link to an FR6-renamed target (B27) and an absolute-path `](/abs/foo.md)` link (B28). Both are fail-safe (block, never escape), near-zero on real corpora, and cluster around one design question (treat closed-block/archive links as flag-not-abort).
- **B29** — the `_afterRead` test seam reads inherited props (an unreachable prototype-pollution gadget); a `typeof`/own-property guard is deferred hardening.
- **B30** — the `/sig:ship` FR1 pre-check (Step 0.5) runs before the SHIP transition (Step 5), so B26's STATE fallback (which needs `phase: SHIP`) skips at the pre-check on a fresh flow and fires only once phase is SHIP. Surfaced by dogfooding B26 on this release.

---

## [0.1.9] — 2026-07-21 — Bug & doc-runtime hygiene close-out (M5.E4)

The confirmed-bug backlog cleared before the v2-port re-audit: **12 known bugs fixed** (or dismissed) + the doc-runtime **concurrency-lock** (FR5). Additive; no breaking changes; no new runtime dependencies; no `.planning/` schema or slash-command-surface change (still 17 commands / 26 agents / 21 skills). 1492 → **1529 tests**; FULL/strict throughout; REVIEW ran a 3-specialist adversarial panel (PASS-WITH-FIXES) that caught a real path-confinement bypass shipping under a false-green test.

### Fixed
- **B19** (P2) — the v3 migrate's foreign-`INDEX.md` guard was a false-green: it keyed on a `**Tier legend:**` block the *old* curated format also carries, so it never fired on the real repro and clobbered hand-curated INDEX notes. Now keys on the new-format auto-gen marker, with dry-run/apply parity. RED-proven against the pre-fix code.
- **B14** (security) — realpath directory-symlink confinement extended to the `evict.js` / `add.js` / `resume.js` write/read gateways (shared `path-confine.js`). REVIEW additionally caught + closed a leaf-level escape at the `evict.js` site that a mis-placed test had hidden.
- **B6** — `/sig:resume` + `/sig:status` no longer false-positive their drift banners on the benign "+1" bookkeeping commit (gate on genuine `HEAD..origin` drift); also *removed* the user-editable `last_updated_commit` from the git-range computation (a net injection-surface reduction).
- **B15** — the blocking dangling-link gate scans the full file (a dangle past the 1 MB cap no longer silently passes).
- **B16** — a rolled-back `/sig:migrate-memory --apply` no longer leaves a stray `pre-migrate-memory-<stamp>` git tag.
- **B21** — the append-log anchor gate builds the decision-ID map once, not per-ID (O(N×corpus) → O(corpus)).
- **B22** — the doc-hygiene internal-link check is bounded to repo root (no disk read outside the tree).
- **B18** — `regeneratePlanningIndex('.')` key corruption (fixed in v0.1.8; a regression guard added here).
- **B17** — git-heavy test suites get a 15 s `testTimeout` (no more flakes under parallel load).
- **B5 / B20** — `npm run lint` runs again (flat `eslint.config.js` for ESLint 9); B20 dismissed as a duplicate of B5.
- **B23** — REVIEW-panel test-coverage bundle + two refactor nits (`blockKey` rename, fail-loud bugs dedupe marker).

### Added
- **FR5 — doc-runtime concurrency-lock.** The read-modify-write paths (`checkpoint`, `drain`, `retro-index`, `planning-index`) now serialize via the coarse `.state.lock` (lock-free-core + self-locking-wrapper split; migrate calls the lock-free core to avoid a re-entrant deadlock). Linear/single-session behavior is byte-identical.

### Known / deferred
- **B24** (P2, deferred) — a pre-existing broken `](*.md)` link inside a *closed* DECISIONS section makes `/sig:migrate-memory` abort (fail-safe, byte-identical rollback) instead of treating the pre-existing dangle as not-its-fault. Inert on Signal; the fix reworks the load-bearing dangling-delta gate, so it's deferred rather than rushed into a release that hardened that gate.

---

## [0.1.8] — 2026-07-20 — Doc-runtime (M5.E1 + M5.E2 + M5.E3)

The doc-runtime ships as **one release across three Epics** — E1 (model + eviction mechanics) + E2 (the auto-sensing `/sig:migrate-memory` command) + E3 (all-docs hygiene + living `BACKLOG.md` + append-log eviction). Signal's memory is now self-maintaining. Additive; no breaking changes; no new runtime dependencies; no `.planning/` schema bump (a new `docs_layout_version` **doc-layout** axis, distinct from `schema_version`, is stamped by the migrate). Two new commands: `/sig:index` and `/sig:migrate-memory` (**15 → 17**). 1300 → **1492 tests**; FULL/strict throughout; each Epic dogfooded on Signal's own `.planning/`.

### M5.E1 — model + eviction mechanics

Signal's answer to unbounded `.planning/` growth — the *eviction/organization* half that pairs with v0.1.6's *prevention* half (write-guard + size banner). 999 → 1070 tests. Full DISCUSS→SHIP at FULL/strict; REVIEW ran two independent specialist agents (PASS-WITH-FIXES, 4 Important fixed). Reference: [`references/doc-runtime-model.md`](references/doc-runtime-model.md).

### Added
- **Canonical doc-runtime model** (`references/doc-runtime-model.md`, FR1) — the provisional-canonical decision every later doc-runtime FR references: the two axes (load-frequency × growth-policy), the unit-homed single-home eviction rule, the 3-vector bloat taxonomy, RETROSPECTIVE-as-SUMMARY-card, and the ordered distill→verify→evict faithfulness gate.
- **STATE.md live-above-the-fold body skeleton** (FR2c) — a normative body template (Resume pointer → In-flight → Blockers → Pending ops → Closed work); `initState` emits it; documented in `references/state-schema.md`.
- **Evict-on-close** (FR2b) — `evictEpicNarrative` moves a closed Epic's STATE.md narrative to `.planning/archive/<milestone>/<epic>/` (byte-identical, move-never-delete) behind a faithfulness gate, leaving a one-line pointer. Wired into `/sig:ship` §5.5 + `/sig:checkpoint` (Epic-close only).
- **FUTURE-IDEAS physical eviction** (FR3) — `evictTerminalToLedger` moves terminal (shipped/promoted/merged/deleted) entries out of `FUTURE-IDEAS.md` into an archive ledger so the inbox *converges*; DEFERRED entries stay. Crash-safe (ledger-first, body-keyed dedup). Wired into `/sig:plan`'s drain.

### Changed
- **Migration relocates the legacy body** (FR2a) — `upgradeStateFile` writes the legacy body to `.planning/STATE-HISTORY.md` + a pointer instead of inlining it forever (new migrations only).
- **Tier-aware STATE.md size warning** (FR2d) — `/sig:status`, `/sig:checkpoint`, `/sig:resume` scale the size threshold by PROFILE tier (SKETCH 75 / FEATURE·SPIKE 150 / FULL 300 KB), flat fallback when no PROFILE.
- **Dogfood:** Signal's own STATE.md shrank 64.5 KB → ~1 KB (body → `STATE-HISTORY.md`); 6 shipped FUTURE-IDEAS entries moved to the ledger.

### Fixed
- **`plugin.json` version** bumped 0.1.6 → 0.1.7 — the v0.1.7 ship had left it stale (BUGS.md B7); a v0.1.7 install self-reported 0.1.6.

### M5.E2 — auto-sensing migrate command (`/sig:migrate-memory`)

The risky, go-big piece of the doc-runtime: the command that reorganizes an **existing** bloated project's `.planning/` in place. Un-sticks live pain (`eval-project-A/.planning/STATE.md` was write-wedged at 546 KB → **1.3 KB, 0 words dropped**; BUGS.md B8 auto-remediation). Full DISCUSS→SHIP at FULL/strict; REVIEW ran a 3-specialist adversarial panel (PASS-WITH-FIXES — a SHIP-blocking rollback gap, independently reproduced by two reviewers, caught + fixed in-phase). 1070 → 1300 tests. Reference: [`references/doc-runtime-model.md`](references/doc-runtime-model.md) §5 (faithfulness gate).

#### Added — `/sig:migrate-memory` (M5.E2, FR6)
- Auto-senses an old-layout project's `.planning/`, plans the **smallest safe** reorg, is **dry-run by default** (changes nothing), and applies only on explicit confirm. **Relocate-never-delete, git-backed rollback, idempotent** (a re-run on a migrated project is a no-op). Handles all three bloat vectors — v1 frontmatter-prose de-prose (relocated, never dropped), v2 whole-body relocate → `STATE-HISTORY.md`, v3 closed-Epic narrative eviction — plus archive-tree scaffold relocation. Engine: `tools/lib/migrate-memory.js` + `tools/lib/archive-tree.js`.

#### Added — doc-layout stamp + drift banner (M5.E2, FR7)
- `docs_layout_version` in STATE frontmatter — its own axis, distinct from `schema_version` (frontmatter format) and the plugin SemVer. Set by the migrate on completion; a **fail-open** SessionStart + `/sig:resume` + `/sig:status` banner warns when a pre-reorg project runs a post-reorg plugin (post-reorg is silent). Hook: `hooks/warn-layout-drift.js`.

#### Changed — REVIEW hardening (M5.E2)
- **Rollback now wraps the entire mechanical move/rewrite phase** (durable snapshot + pre-apply tag hoisted *before* the phase) — closes the Critical C1 unrecoverable-partial-write gap.
- **Path confinement hardened** — realpath re-assertion on both write/move gateways refuses a directory-symlink escape (security MEDIUM, I-b).
- **`readLayoutBanner` short-circuits** on a cheap 64 KB stamp read instead of an unconditional full-corpus walk on every `/sig:status` + `/sig:resume` (perf/DoS, I-d); stamp helpers promoted to `tools/lib/layout-stamp.js`.

#### Fixed (M5.E2)
- **B10** `SHIP`/`LAUNCH-KIT` scaffolds now archive with their Epic; **B11** `vector-2-defer` flag no longer over-fires on already-evicted corpora; **B12** non-standard `completed_phases` entries get a meaningful label + a dry-run warning instead of a generic placeholder / silent sweep-to-history; **B13** NUL-byte in `migrate-memory.js` → `\0` escape (restores `grep`).

#### Dogfood + deferred (M5.E2)
- **Dogfood:** Signal's own `.planning/` — 31 archive relocations + `docs_layout_version` stamp v2.
- **Ticketed fast-follows (non-blocking):** B14 (codebase-wide lexical symlink confinement in `evict.js`/`add.js`/`resume.js`), B15 (>1 MB single-file scan-ceiling can defeat the dangling gate), B16 (a rolled-back `--apply` leaves a lingering `pre-migrate-memory-<stamp>` tag), B17 (4 git-heavy migrate tests flake on vitest's 5 s default under full-suite parallel load).

### M5.E3 — all-docs hygiene runtime + living `BACKLOG.md` + append-log eviction

The final doc-runtime layer — what makes Signal's memory *self-maintaining*. 7 slices / 5 waves at FULL/strict; full DISCUSS→SHIP; REVIEW ran a 3-specialist adversarial panel (PASS-WITH-FIXES). Dogfooded on Signal's own `.planning/`. 1300 → **1492 tests**.

#### Added (M5.E3)
- **Capture-inbox lifecycle** (FR1) — `FUTURE-IDEAS.md` → `ISSUES-INBOX.md` via a **back-compat resolver** (non-breaking; `resolveInboxPath`), `/sig:add` writes a verbatim body + an agent-authored title, and a new `--bug` fast-path routes to `BUGS.md`.
- **`/sig:index`** (FR3) — auto-generates `.planning/INDEX.md` from disk (two-tier Live/Cold), preserving hand-curated notes by key; publishes a `D-ID → home` map (`resolveDecisionId`) that homes decisions by **definition, not reference**. Runs automatically at `/sig:ship`.
- **Living `BACKLOG.md`** (FR2) — the `/sig:plan` drain classifies each promoted inbox entry (work → `BACKLOG` with a roadmap/hygiene tag, bug → `BUGS`), retitles on promote, and evicts from the inbox; a light `/sig:ship` sweep clears terminal entries.
- **All-docs hygiene guard** (FR4) — a deterministic + **offline** test-suite check over `README`/`CLAUDE.md`/`docs/`/`analysis/`: roster/count drift, dead internal links, version consistency (skips `[Unreleased]`), `[FILL IN]` stubs → hard fail; read-only.
- **Append-log eviction** (FR5) — closed-milestone `DECISIONS.md` date-sections relocate **verbatim** to per-milestone `archive/M{n}/DECISIONS.md` behind dated pointers, every `D-…` anchor still resolvable via the index; **fail-closed** if any anchor wouldn't resolve.
- **Layout v2→v3 migration** (FR6) — `/sig:migrate-memory` learns the v3 transition (rename + `BACKLOG` create + append-log evict), new projects are **born on v3**, existing (incl. stamp-null) projects converge on first migrate.

#### Changed (M5.E3)
- **`INDEX.md` is now auto-generated** — hand-curation retired; reverses the "INDEX is hand-curated / Curator dormant" stance (D-M5E3-8).
- **External Curator retired** — `ship.md` §8 now calls the native `regeneratePlanningIndex`; no Signal command invokes `curator`.
- Roster reconciled **15 → 17 commands** (adds `/sig:index` + `/sig:migrate-memory`) across `CLAUDE.md` + `docs/map`; the FR4 guard now enforces it.

#### Fixed (M5.E3 — REVIEW, RED-first in-phase)
- **B18** path-relativize (`relative()` not `slice()`) at 3 sites — a relative `baseDir` no longer corrupts INDEX/roster keys.
- **B19** dry-run/apply parity + a guard that **skips-and-flags** (never clobbers) a foreign/pre-v3-format curated INDEX.
- **IMPORTANT-1** (security) — an unconditional planning-root realpath assert before the first write closes a symlinked-`.planning/` escape on a minimal migrate run.
- **D-v016-2** (dogfood-surfaced) — the D-ID map homed a decision by a live reference over its archived definition → the anchor gate refused the eviction; fixed with definition-precedence.

#### Dogfood + deferred (M5.E3)
- **Dogfood:** Signal's own `.planning/` migrated to v3 — `DECISIONS.md` 178 KB → 33 KB (37 sections evicted, **0 dropped**, 73 anchors preserved), `ISSUES-INBOX.md` + `BACKLOG.md`, stamp v3. Fully git-reversible.
- **Ticketed fast-follows (non-blocking):** B20 (lint tooling — ESLint 9 flat-config), B21 (D-ID map per-ID rebuild — perf), B22 (doc-hygiene link-check reads outside repo root — dev-only), B23 (test-hardening bundle).

## [0.1.7] — 2026-07-15 — M4.5.E11 (Epic-native flow)

Makes **Epic mode** first-class: commands can open/track Epics, auto-write a strict `current_epic`, name artifacts `{EpicID}-*.md`, and honor a per-Epic tier — all **additive over a byte-identical linear mode**. No breaking changes; no new runtime dependencies; no `.planning/` schema bump. 894 → 999 tests. Full DISCUSS→SHIP at FULL/strict; REVIEW ran two independent specialist agents. Reference: [`references/epic-native-flow.md`](references/epic-native-flow.md).

### Added

- **`--epic <name>` on `/sig:discuss` and `/sig:new-project`** opens (or rolls to) an Epic: the tooling derives a strict Epic ID (`M{maj}.{min}.E{n}`, via `deriveNextEpicId`) or accepts an explicit one, writes it to STATE `current_epic` **automatically** (no hand-editing), and atomically resets the coupled in-flight fields (`current_wave` / `current_tasks`) on a roll. A *done* Epic — one whose `{EpicID}-RETROSPECTIVE.md` exists — requires `--epic` to open the next one, so a completed Epic's artifacts are never clobbered.
- **Epic-scoped artifact naming.** When an Epic is active, the six phase commands write `{EpicID}-{ARTIFACT}.md` (RESEARCH / REQUIREMENTS / PLAN / VALIDATION / VERIFICATION / REVIEW / PROGRESS) and `/sig:resume` + `/sig:status` resolve them via the E10 read-half. The retrospective stays `deriveRetroPath`-owned (`{EpicID}-RETROSPECTIVE.md`); `CONTEXT.md` is never Epic-prefixed.
- **Per-Epic calibration.** An Epic can carry its own tier via a whole-file `.planning/{EpicID}-PROFILE.md` that shadows the project PROFILE **for that Epic's phases only** (`readEffectiveProfile`). `/sig:calibrate` and `/sig:escalate` target the Epic PROFILE when an Epic is active; `/sig:status` and `/sig:resume` render the override (`Tier: SKETCH (Epic M4.5.E11 override; project default FULL)`) so shadowing is never silent.

### Fixed

- **The `check-state-write` PreToolUse hook no longer crashes on a hostile `current_epic`.** A malformed `current_epic` on an Epic-close SHIP write previously threw an uncaught error (a stranger-session crash); it now fails open (exit 0). The hook's missing-retro path warns rather than blocks — the hard "no retro, no ship" gate stays in `/sig:ship` §0.5 (running the command opts you into its contract).

### Notes

- **Additive / opt-in.** A project with no active Epic runs exactly as before — linear mode is byte-identical to pre-E11, with no migration and no schema bump. The `resolveArtifactPath` read-half stays intentionally permissive to keep resolving pre-E11 hand-managed artifacts (e.g. `v0.1.6-*.md`) that the strict write-side shape would reject.

## [0.1.6] — 2026-07-14 — v0.1.6 (doc-integrity guardrail)

A lightweight trust-hardening patch that prevents new documentation-integrity pathology at the point it's created and converges two capture/planning papercuts. No breaking changes; no new runtime dependencies. 854 → 894 tests. Shipped as a version patch (not an Epic) — but the cross-project write-hook earned a full specialist REVIEW pass (2 independent auditors, 6 fixes in-phase; see `.planning/v0.1.6-REVIEW.md`).

Scope note: this **prevents** new bloat and **flags** growth — it does not evict an already-bloated `STATE.md`. Automated eviction is a Milestone 5 concern.

### Added

- **STATE.md frontmatter guard (write-time).** The `check-state-write` PreToolUse hook now blocks a write that puts prose into the `completed_phases` / `blockers` frontmatter fields (a raw-text, field-specific check: multi-line or over-budget `completed_phases` entries; over-budget or block-scalar `blockers[].text`). Blacklist stance — when in doubt it allows, so a legitimate write is never wedged; a cleanup edit that lands clean frontmatter always passes. Guards against the 455 KB "prose in the YAML list" failure mode observed in a dogfood project. Fires in every repo where Signal is installed; CRLF-tolerant.
- **STATE.md size banner (read-time).** `/sig:resume`, `/sig:status`, and `/sig:checkpoint` now surface an advisory banner when `STATE.md` exceeds ~150 KB — a "closed-work history is accumulating; eviction is planned for M5" nudge. Read-only, never blocks; quiet on files under budget.
- **`.planning/BUGS.md`** gains a defect register for three previously-`FUTURE-IDEAS` items (footer-drift, drain-blockquote, `/sig:add` title), now marked `fixed`, plus a pre-existing lint-tooling finding.

### Fixed

- **`/sig:plan` drain now converges.** The FUTURE-IDEAS disposition detector recognizes the `> **Promoted 2026-07-04 → …**` blockquote convention (`^`-anchored, fence-aware), so entries promoted via that convention stop resurfacing on every drain (live candidates 43 → 37).
- **`/sig:add` derived titles cut at a clause boundary** (em-dash / period / colon / comma) instead of mid-clause, with a URL guard and a minimum-length floor.
- **Hook Edit-reconstruction fidelity.** `$`-tokens (`$&`, `` $` ``, `$'`, `$$`) in an Edit's `new_string` are now inserted literally, so the write-hook judges the same content Claude Code actually writes.

## [0.1.5] — 2026-07-05 — M4.5.E10 (resume trust & capture integrity)

A trust-hardening batch shipped before external testers onboard: the `/sig:resume` briefing and the `/sig:add` capture pipe must be trustworthy. No breaking changes; no new runtime dependencies. 777 → 854 tests.

### Added

- **Origin-drift detection** — `/sig:resume`, `/sig:status`, and `/sig:checkpoint` now run a bounded, read-only `git fetch` against your own remote and surface a non-blocking banner when someone (or another machine) pushed work your `STATE.md` doesn't reflect yet. Fail-open by construction (offline / no-remote / auth-prompt / timeout → silently skipped); the fetch is hardened against auth-hangs (`GIT_TERMINAL_PROMPT=0`, SSH `BatchMode`, 2s timeout + `SIGKILL`) and writes only `.git/`, never `.planning/`.
- **Schema-drift banner** — `/sig:status` + `/sig:resume` detect when a project's `STATE.md schema_version` is behind (needs migration) or ahead (written by a newer Signal) of what the installed plugin supports, and point at the migration path. Platform-agnostic and read-only (deliberately not in the macOS-gated `/sig:doctor`), and it reports rather than crashes on an ahead-schema file.
- **STATE freshness in DISCUSS + PLAN** — both phases now refresh `STATE.md` at close (like verify/review/ship), so `/sig:resume`'s staleness banner reads fresh after them.
- **`references/hooks-api.md`** — documents all three wired hooks (their stdin/stdout/exit contracts, the cwd-vs-stdin asymmetry, fail-open convention, and the manual real-session smoke procedure).

### Fixed

- **`/sig:resume` finds Epic-prefixed plan artifacts** — a new resolver tries `{current_epic}-{ARTIFACT}.md` first, so hand-managed Epic-prefixed projects stop reporting "artifact not found" for files like `M4.5.E10-PLAN.md`. Guarded against path traversal via a crafted `current_epic`.
- **Capture pipe can't silently lose ideas** — `/sig:plan`'s FUTURE-IDEAS drain now recovers entries hidden below an unclosed code fence (with a warning), and `/sig:add` repairs a `*Last updated:` footer that has drifted mid-file (single footer at true EOF, nothing lost) and no longer mistakes a fenced footer sample for the real footer. A lint keeps Signal's own `FUTURE-IDEAS.md` clean.
- **Hardening (REVIEW)** — the origin/staleness checks now fail open on a schema-drifted or malformed `STATE.md` instead of crashing the command (both review agents caught this), and a user-editable `last_updated_commit` is validated so a crafted value can't be parsed by git as an option.

## [0.1.4] — 2026-06-06 — M4.5.E4 + M4.5.E5 (worked example + comparison page + launch assets)

### Added — worked example (M4.5.E4 Slice 1)

- **`examples/url-shortener/`** — a complete, committed `calibrate → ship` run of Signal on a small URL-shortener service, so newcomers can see what Signal produces and how the calibration router right-sizes rigor. Runnable with **zero runtime dependencies** (a plain JSON-file store — `npm install` compiles nothing, `npm test` → 39/39 on Node ≥ 22.5). The annotated README tours each `.planning/` artifact and explains why the project calibrated FULL (a published short URL is an irreversible public contract). Promoted out of the gitignored `.dogfood/` into a tracked directory so it can't silently rot.
- **`tests/example-currency.test.js`** — a guard that asserts the example stays on the current STATE/PROFILE schema (`readState(...)._schema === 1`, `readProfile(...)` valid), so a future schema change can't leave the worked example stale.

### Added — comparison page (M4.5.E4 Slice 2)

- **`docs/vs.md`** — a prose "when to reach for which" guide across the plugins Signal is built from (GSD, Agent Skills, superpowers, planning-with-files, compound-engineering), framed as a toolbox: each is excellent on its own; Signal assembles them under one roof and adds the calibration router that right-sizes rigor. Linked from the README and registered in the validator.

### Added — launch assets (M4.5.E5)

- **`docs/launch-post.md`** — the research-arc launch post: the seven-plugin landscape → Signal as a synthesis of the patterns worth keeping, plus the calibration wedge no other plugin set out to build. Leads with the landscape analysis, states v1 ports GSD + Agent Skills (the rest are v2 roadmap), and keeps the honest limits up front (0.1.x, macOS-only, sample-of-one). Registered in the validator's `REQUIRED_FILES`.
- **`docs/demo-script.md`** — a turnkey ~45–60s demo recording storyboard (`/sig:init → /sig:calibrate → /sig:status`) with the macOS + marketplace-install assumptions stated up front, so a recording shows what a peer actually experiences rather than dev-mode fallback agent names.
- **`docs/tester-brief.md`** — a peer-tester invitation with a scoped ~20-minute ask (`/sig:calibrate → /sig:discuss`, log the friction), who-to-ask criteria, the macOS-only caveat, an explicit nothing-sensitive boundary, and a copy-paste friction-log template.
- **`tests/e5-launch-assets.test.js`** — a growing guard over the launch docs: existence, the launch-post word budget, the exact privacy sentence, structural markers (friction-log template, demo assumptions, calibrate-before-status sequence), and relative-link integrity across all three docs.
- **`.planning/M4.5.E5-LAUNCH-KIT.md`** — internal launch-ops kit: the version-decision rubric, a release-notes draft, the human-handoff checklist, and the (deliberately narrow) distribution channels for a quiet peer release.

---

## [0.1.3] — 2026-05-31 — M4.5.E7 + M4.5.E3 + M4.5.E9 + M4.5.E8 + M4.5.E2 (synthesizer prose-quality + install-UX hardening + public-docs rewrite + retro foundations + install-state diagnostician + `/sig:add` force-route flags + naked-invocation interview + stranger-safety hardening + `/sig:plan` FUTURE-IDEAS drain)

### Added — `/sig:add` force-route flags (M4.5.E2 Slice 2)

- **Explicit routing flags** for `/sig:add`, on a generalized capture spine that reuses Slice 1's sensitive-data scrub + body-length check + lock + atomic write for every destination:
  - **`--question "…"`** → appends to `.planning/OPEN-QUESTIONS.md` in the file's Status/Resolve-by shape, at end-of-file (no footer to rewrite).
  - **`--milestone [N] "…"`** → appends to a `## Captured via /sig:add` holding section in a milestone file, created if absent and reused on later captures. `--milestone` (no `N`) targets the current milestone resolved from STATE.md `current_epic`; `--milestone 5` targets `MILESTONE-5.md`. It never edits the structured plan body, and never scaffolds a missing milestone file — both no-current-milestone and missing-`MILESTONE-N.md` cases fail clearly with no write.
  - **Multi-destination guard** — supplying two destination flags in one call exits non-zero with a clear message *before* any lock acquisition or write.
- Default capture (no flag) still lands in `.planning/FUTURE-IDEAS.md`. Routing is flags-only — there is no heuristic that re-routes based on input.
- New helper `tools/lib/milestones.js` — `currentMilestone` (derives the target milestone from STATE.md `current_epic`; no file-scan heuristics) + `listMilestones` (decimal-aware, so `4.5` sorts between `4` and `5`).
- `commands/add.md` Step 2 + error table + intro document `--question` / `--milestone [N]`; README command reference + first-project note updated. No new runtime dependencies.

### Added — `/sig:add` naked-invocation interview (M4.5.E2 Slice 3)

- **Naked `/sig:add`** (no arguments) now asks one plain-English question — "What's the idea?" — and files the answer to `.planning/FUTURE-IDEAS.md`. An empty/whitespace answer aborts cleanly with no file write and no `.add.lock` left behind. Quoted input (`/sig:add "text"`) stays instant — it skips the question and goes straight to FUTURE-IDEAS, even when the text ends in `?` or starts with `fix`/`bug`/`TODO`.
- **No destination heuristics.** Routing is the explicit flags (`--question`, `--milestone`) or the default FUTURE-IDEAS — nothing in between; there is no `suggestDestination`-style guesser that re-routes based on the text (Decision 5 cut the heuristic hints planned on 2026-05-14). An export-surface + source-text guard test permanently asserts this absence (FR5.4).
- *(The `/sig:plan` FUTURE-IDEAS drain landed in M4.5.E2 Slice 5 — see below.)*

### Added — `/sig:add` stranger-safety hardening (M4.5.E2 Slice 4)

- **One-time first-run onboarding note.** The first `/sig:add` in a repo reminds you that `.planning/` is tracked in git — captures become a permanent part of the project once you commit. A `.planning/.add-onboarded` marker persists the fact, so the note never shows again. Its loudness follows the project's `PROFILE.md` `gate_strictness`: `strict` → a one-time confirm; `light` (and projects with no `PROFILE.md` yet) → a single-line FYI; `off` → silent. There is no per-capture confirmation at any strictness — capture stays instant (Decision 4, Q1).
- **Brownfield-vs-greenfield missing-`.planning/` error.** When `.planning/` doesn't exist, the error now distinguishes a brownfield repo (existing code + `.git/` → suggests `/sig:init`) from a greenfield directory (suggests `/sig:new-project`), instead of a single generic message.
- **Validator vocabulary lint.** `npm run validate` now runs `checkBannedVocabulary` over `commands/add.md` and `tools/lib/add.js` (via the existing `findJargonHits` helper), failing the validate step if the pre-M4.t18 legacy term that the `Milestone` / `Epic` / `Slice` vocabulary replaced reappears — a long-term guard against vocabulary drift.

### Added — `/sig:plan` FUTURE-IDEAS drain (M4.5.E2 Slice 5 — closes the GTD loop)

- **`/sig:plan` now drains `.planning/FUTURE-IDEAS.md`** at the start of planning (a new advisory `### 1b.` step), so captured ideas no longer rot in a write-only file — capture (`/sig:add`) and clarify (the drain) are both present. The step surfaces **every un-dispositioned entry** (no date window), rendered compactly, and offers a **"defer all remaining"** batch for the first large triage. The whole step is **skippable** and never blocks planning; an empty backlog prints a one-line note and continues.
- **Four dispositions per entry** — *promote* (fold into the plan as a candidate task), *defer*, *merge*, *delete* — plus an explicit *skip*. `promote`/`defer` record the decision inline by stamping the entry's `**Status:**` line (`→ Deferred 2026-05-30 (M4.5.E2 drain).`), so a dispositioned entry never resurfaces. `merge`/`delete` remove the entry's block and require a per-entry `[confirm, keep]` confirmation **regardless of `gate_strictness`**.
- **R1 hard gate** — every disposition write is **previewed as a diff before it is written**; unlike `/sig:add`'s instant-capture hot path, a planning-time mutation of the idea database always shows the user what will change first. Writes go through a single full-file `atomicWrite`, reusing the `/sig:add` substrate.
- New helper `tools/lib/drain.js` — `parseEntries` (fence-aware top-level `## ` segmentation, tolerant of an orphaned mid-file `*Last updated:*` footer), `listDrainCandidates`, `applyDisposition` / `applyDispositions` (byte-range edits — dispositioning one entry leaves every other byte identical), and `applyDispositionToFile`. Pure Node, no new runtime dependencies.

### Added — `/sig:doctor` install-state diagnostician (M4.5.E8)

- New slash command `/sig:doctor` (15th in the suite — commands/doctor.md). Meta-command class; no tier-gating preamble, no skill loading, no agent spawning.
- macOS-only first ship (D-E8-2). Linux + WSL receive a polite stub via `checkDoctorEnvironment` with a positive-allowlist platform guard. Linux/WSL support is in flight for a follow-on Epic.
- Detects 5 documented install-state failure modes against `~/.claude/plugins/installed_plugins.json`, `~/.claude/settings.json`, and `~/.claude/plugins/cache/signal/`:
  - **P1** — stale `gitCommitSha` (cached `plugin.json` version ≠ manifest version)
  - **P2** — orphan cache version directories under `signal/sig/`
  - **P3** — `enabledPlugins["sig@signal"]` entry without matching install
  - **P4** — pre-rename `signal@signal` slug present anywhere
  - **P5** — multi-identity `~/.ssh/config` (informational only — does not change healthy status)
- All detectors are Signal-scoped (D-E8-11) — non-Signal plugin entries with state that *would* match are explicitly ignored. Detection cannot propose destructive actions against other plugins.
- Three flag modes:
  - **No flags** — read-only detection. Exit 0 (healthy) / 1 (P-states detected) / 2 (doctor errored — install state unknown) per D-E8-12.
  - **`--fix`** — generates a *surgical* shell script at `~/.claude/sig-doctor.sh` containing remediation steps only for detected P-states. Does NOT execute. User reviews, runs `bash ~/.claude/sig-doctor.sh`, then re-invokes `/sig:doctor` to verify.
  - **`--reinstall`** — generates the *full canonical clean reinstall* script regardless of starting state. Same body whether install is healthy or broken; per-step `[y/N]` prompts at execution time are the safeguard.
- Generated script discipline (D-E8-8):
  - Shebang `#!/usr/bin/env bash` (picks up Homebrew bash 5 over macOS's 3.2)
  - `set -u -o pipefail` — deliberately omits `-e` so declined `[y/N]` branches don't abort the script
  - Every mutating step wrapped in `read -p "Execute: ... [y/N]"` with `[done]` / `[skipped]` markers
  - Resolved absolute paths only — no literal `~/.claude` (D-E8-10; meta-test asserts this)
  - Preamble probes `claude --version` and surfaces the 2.1.150 minimum requirement
  - Inline `node -e` for JSON edits (no `jq` dependency; well-formedness asserted at script-gen time)
- `checkCacheCasingClash` — aborts hard with `DoctorDetectionError → exit 2` when the marketplace cache contains case-mismatched siblings (e.g. `signal/` + `Signal/`). Prevents the generated script from `rm -rf`-ing the wrong directory on case-sensitive filesystems.

### Added — `/sig:status` version-check (M4.5.E8.S3, FR6)

- `readStalenessWarning` in `tools/lib/status.js` — composes install state, detector results, and a 24h-cached `/repos/InsightRiot/signal/tags` query into a one-line banner prepended to `/sig:status` output.
- `commands/status.md` § 2.0 — Version staleness check (prepended) wires the helper.
- D-E8-7 — uses GitHub `/tags` endpoint (NOT `/releases/latest`, which 404s for Signal). Field is `name`; leading `v` stripped for compare. Hand-rolled 3-part numeric `compareVersions` (no `semver` runtime dep).
- 24h on-disk cache at `~/.claude/.sig-version-cache.json` (OQ5 lock). Cache shape: `{ fetched_at: ISO8601, data: { name: "v0.1.2" } }`. Atomic write via `tools/lib/atomic-write.js`. Invalid (parse-fail / shape-fail) treated as miss.
- Native `fetch` + `AbortSignal.timeout(5000)`. No new runtime dependencies. All failure modes (offline / 404 / empty / malformed / timeout) collapse to null — `/sig:status` prints normally without the staleness banner when the API is unreachable.
- FR6 matrix in `computeStalenessRecommendation`:
  - stale + no P-states → `Run /plugin install sig@signal`
  - stale + P-states → `Run /sig:doctor --reinstall`
  - current + P-states → `Run /sig:doctor --fix`
  - current + no P-states → silent (no banner)
  - latest unknown → silent

### Changed — `docs/install-troubleshooting.md` ownership reframe (M4.5.E8.S3.t11, FR8)

- Opens with explicit ownership statement — most documented failure modes are Claude Code plugin-host bugs, not Signal bugs.
- "Ownership at a glance" table maps each P-state to its owner (Claude Code plugin host / Signal historical / Environmental) and links the upstream issue.
- Each of 5 symptom sections now leads with a `**Owner:** ...` tag + a quickest-fix lead-in pointing at `/sig:doctor` flags. Manual fallback sequences retained for environments where `/sig:doctor` isn't available (older Claude Code, Linux, WSL).

### Filed — upstream issues (M4.5.E8.S1.t13–t14, D-E8-9)

- Cross-link in `docs/install-troubleshooting.md`:
  - **P1**: [anthropics/claude-code#56740](https://github.com/anthropics/claude-code/issues/56740) (open since 2026-05-06)
  - **P2**: [anthropics/claude-code#62497](https://github.com/anthropics/claude-code/issues/62497) (open since 2026-05-26)
- New issue filed:
  - **P3**: [anthropics/claude-code#63624](https://github.com/anthropics/claude-code/issues/63624) (filed 2026-05-29, Signal-originated)

### Test suite: 535 → 608+ (+73+, M4.5.E8)

- `tests/doctor.test.js` (+26) — 5 detector unit tests with Signal-scoped narrowing, `runAllDetectors` aggregate, 6 fixture-tree integration scenarios (healthy + 5 P-states + combined), `readInstallState` IO orchestrator, `checkDoctorEnvironment` positive-allowlist.
- `tests/doctor-script-gen.test.js` (+19) — script-content lint, inline `node -e` well-formedness, casing-clash abort, version probe, no-op-on-healthy, no-literal-`~/.claude` meta-test.
- `tests/status-version-check.test.js` (+28) — `fetchLatestTag` failure modes, cache helpers + TTL boundary, `compareVersions` table, FR6 matrix, `readStalenessWarning` orchestrator, install-troubleshooting reframe lint.

### Decisions — `.planning/DECISIONS.md` (M4.5.E8)

- **D-E8-1** through **D-E8-6** locked at DISCUSS (2026-05-24) — execution model, macOS-only first ship, interactive prompts, GitHub releases API + cache, `--fix`/`--reinstall` flag naming, NFRs N/A.
- **D-E8-7** through **D-E8-12** locked at PLAN (2026-05-28) — `/tags` endpoint, bash shebang + strictness, upstream-filing timing, `homeDir` parameter injection, Signal-scoped detector filtering, 3-level exit code.

### Deferred — `.planning/FUTURE-IDEAS.md`

- "`/sig:doctor` helper-script split" — PLAN locked an 80-char threshold for inline `node -e` payloads; S2 kept them inline (~200 chars) with a well-formedness gate. Revisit if audit complaints surface, or if a future P-state requires JSON edits more complex than "delete a key."

### Added — Retro Foundations (M4.5.E9)

- **SHIP hard-block gate** (D-E9-3, D-E9-8). Every Epic-close SHIP must produce a per-Epic `RETROSPECTIVE.md` that passes a tier-aware content validator before `/sig:ship` will write the `completed_phases: SHIP` entry. The mechanism is **layered**: (1) command-internal pre-check in `commands/ship.md` §0.5 — works in all runtimes including Cursor/Codex; (2) `PreToolUse(Edit|Write)` hook on `.planning/STATE.md` (Claude Code + Codex) — bypass-resistant at the tool layer; (3) `SessionStart(resume)` hook (Claude Code + Codex) — surfaces dirty-EXECUTE state on the next session resume, catching the original motivating failure mode (context cleared before SHIP was invoked). No `--no-retro` flag, no environment override, no extra-args trick.
- **Tier-aware retrospective templates** at `references/retrospective-template.md`. One copy-paste-able block per tier (SKETCH 3 sections, FEATURE 5, SPIKE 3, FULL 8). Section headings are exact-string locked per the validator's contract; template content scales by tier so SKETCH throwaways aren't burdened with FULL-tier ceremony.
- **6 retrospective files in `.planning/`**: M4.5.E9 (substantive dogfood from S1.t12) + backfilled stubs for E1 (partial), E2 (partial), E3, E6, E7. Backfill mechanism (`tools/backfill-retros.js`) auto-extracts artifact links + commit ranges via `git log --grep=^M4.5.E{N}` (with subject-line filter to avoid false-positives from body content) and pre-populates the Links section; reflection sections retain `[FILL IN]` markers for opportunistic completion.
- **`.planning/RETROSPECTIVES.md` index** — hand-curated hooks per Epic survive auto-regen (merged by Epic ID); reverse-chronological order; sibling links from the index file's own location.
- **`tools/lib/retrospective.js`** — exports: `parseSections`, `getRequiredSections`, `deriveRetroPath`, `loadTemplate`, `validateRetroContent`, `expectedRetroPath`, `isEpicCloseShip`, `shipFR1Check` (command-internal layer), `checkProposedStateWrite` (PreToolUse layer), `detectDirtyExecute` (SessionStart-resume layer).
- **`tools/lib/retro-index.js`** — exports: `isStubRetro`, `enumerateRetros` (path-agnostic recursive walk), `parseExistingHooks`, `renderIndex`, `regenerateIndex` (idempotent), `composeMilestoneMetaRetro`, `generateMilestoneMetaRetro` (manual trigger per A6 / FR6 downgrade).
- **`tools/backfill-retros.js`** — CLI for one-shot Epic-retro stub generation. Supports `--dry-run`, `--force`, `--milestone Mx.y`. Idempotent on re-run; refuses to overwrite edited stubs (heuristic: `[FILL IN]` count drop OR size > 2× baseline).
- **`hooks/check-state-write.js`** — Node CLI for the PreToolUse hook. Reads Claude Code hook event JSON from stdin; exits 2 + stderr block when a proposed STATE.md write would mark Epic-close SHIP without a matching retro file.
- **`hooks/warn-dirty-execute.js`** — Node CLI for the SessionStart(resume) hook. Emits an additionalContext JSON payload surfacing the gap when STATE.md shows EXECUTE for an Epic that already looks shipped per MILESTONE.md.

### Changed — `commands/ship.md` (M4.5.E9.S1.t6)

- **§0.5 FR1 retrospective pre-check** added between the §0 tier-gating preamble and the `Skill Loading` section. Documents the layered enforcement flow + the 4-step shipFR1Check integration. Fires regardless of `gate_strictness`; no bypass parameter.
- **§5 Update State** rewritten from prose ("Update `.planning/STATE.md` to reflect completion") to programmatic (`transitionPhase(baseDir, 'SHIP')` + `markFresh(baseDir, {commit: <HEAD>})`). Brings SHIP into parity with `verify.md`/`review.md`'s state-write pattern. Documents the markFresh failure-mode policy (surface but don't roll back SHIP).
- **§6 Regenerate RETROSPECTIVES.md index** added — calls `regenerateIndex(baseDir)` post-state-write on every Epic-close SHIP. Atomic-writes the new index file when content changes; idempotent no-op when unchanged.
- **§7 Manual milestone meta-retro** added — documents the optional `--milestone-meta` flag invocation that calls `generateMilestoneMetaRetro` to produce a milestone-scoped synthesis stub. Opt-in per A6 (FR6 auto-detection downgraded because MILESTONE-{N}.md has no fully-parseable close-detection schema).

### Changed — `commands/resume.md` (M4.5.E9.S2.t7)

- **Step 3c Retro completeness** added — calls `enumerateRetros(baseDir)` to build a `{total, complete, stub}` summary and passes as `retroSummary` to `renderResumeBriefing`. The briefing now surfaces one new line: `Retros:  1/6 complete (5 stubs awaiting backfill)` (or `0/0 (no retros yet)` for greenfield).

### Changed — `hooks/hooks.json` (M4.5.E9.S1.t7)

- **`PreToolUse` with `matcher: "Edit|Write"`** invoking `node hooks/check-state-write.js` — bypass-resistant layer of D-E9-8.
- **`SessionStart` with `matcher: "resume"`** invoking `node hooks/warn-dirty-execute.js` — catches the original motivating failure mode.
- **Cross-platform note:** PLAN spec called for bash wrappers; collapsed to direct Node invocation. Bash availability is platform-dependent (Windows lacks it natively); the bash→node wrapper bought no testability. Existing `session-start.sh` preserved as the default-source SessionStart handler.

### Test suite: 397 → 535 (+138, M4.5.E9)

- `tests/retrospective.test.js` (29 cases) — parsers, validator, path derivation, template loading, shipFR1Check
- `tests/retro-index.test.js` (24 cases) — enumeration, stub detection, index rendering, regen, idempotency
- `tests/retro-index-fr5.test.js` (6 cases) — AC14-17 integration
- `tests/backfill-retros.test.js` (13 cases) — Epic enumeration, commit-range scan, subject-line filter regression
- `tests/backfill-stub-gen.test.js` (13 cases) — stub composition, partial-Epic header, idempotency, edit-detection
- `tests/ship-fr1.test.js` (9 cases) — AC1, AC1-extended, AC2 (no-bypass), AC3
- `tests/hook-state-write.test.js` (11 cases) — checkProposedStateWrite + detectDirtyExecute
- `tests/milestone-meta-retro.test.js` (8 cases) — AC18, AC19, idempotency
- `tests/resume-briefing.test.js` (+5 cases) — retroSummary param

### Documented for downstream

- 5-axis code review + OWASP/ASVS audit clean. 1 Important + 3 Suggestions fixed in-phase (regex precision in `check-state-write.js`, redundant dynamic import removed, unused imports removed, `execSync` → `execFileSync` for defense-in-depth).
- PLAN deviations surfaced + resolved: (1) byte-threshold formula `150B × section_count` per PLAN vs. AC "one sentence per section passes" — resolved with 60B coefficient honoring the AC. (2) hooks spec called bash wrappers, shipped as Node CLIs.
- Items logged to FUTURE-IDEAS for next planning gate: "spec-internal consistency" PLAN-validation axis, dry-run gate as standard PLAN pattern, hook output format reference doc.



### Fixed — `/sig:init` synthesizer character-drop regression coverage

- **Character drops in synthesized `LANDSCAPE.md` + baseline `PROJECT.md`** — the 6 patterns documented in `docs/install-verification.md` § R1 (heading-boundary drops, table-cell drops, command-flag drops, sentence/code-fence boundary collapse, mid-word truncation in dense prose) are no longer reproducible. Verified by R1+ rerun on 2026-05-23 (`docs/install-verification.md` § R1+).
- The fix is two-layered: (a) a new `embedSection` helper takes the verbatim-embed of the structure-scan Source Tree out of LLM discretion entirely (eliminates patterns 3 + 4 structurally); (b) `commands/init.md` long lines split at sentence boundaries (reduces dense-generation pressure that produced patterns 5 + 6).

### Added — `embedSection` helper + regression test fixtures

- **`embedSection(content, heading)`** in `tools/lib/landscape.js` — like `extractSection`, but preserves interior content (tables, fenced code, bullets, pipe characters) verbatim. Designed for `/sig:init` Step 3's "embed verbatim" instructions — asking the LLM to copy scan content character-for-character is what produced R1's drops; the helper takes the LLM out of the loop.
- **`tests/fixtures/synthesizer-bug-r1/`** — hermetic regression fixture: `scan/` (4 scanner outputs from `expressjs/express` v5.2.1, captured 2026-05-22), `actual/` (synthetic injection of all 6 R1 patterns at documented locations), `expected/` (hand-corrected clean form), `CLASSIFICATION.md` (per-pattern Layer B vs Layer C determinism class), `README.md` (provenance + per-pattern bug→clean diff table).
- **`tests/synthesizer-regression.test.js`** (new, 15 tests) — Layer B regression tests (heading-literal preservation, round-trip via `extractSection`, sibling heading-boundary smells, `embedSection` existence + behavior, init.md template references the helper) + Layer C property tests (line-length lint, sentence-then-fence detection, h2 heading-length, double-brace detection, sibling-template coverage of `discuss.md` + `calibrate.md`).
- **`tests/helpers/template-lint.js`** (new, ~95 LOC, no deps) — `loadTemplate`, `findLongLines`, `findSentenceBeforeFence`, `findShortHeadings`, `findDoubleBraces`.
- **Test suite: 366 → 384** (366 baseline + 9 new in `synthesizer-regression.test.js` + 3 new `embedSection` units in `landscape.test.js`; some Layer C tests count as a single property test that scans all template lines).

### Changed — `commands/init.md` Step 3 wiring

- Step 3 Project structure template now calls `embedSection(scans.structure, 'Source Tree (depth-3)')` explicitly instead of asking the model to "embed the structure scan's table verbatim" — the helper guarantees character-for-character preservation.
- Step 3 Synthesis rules bullet on scanner data embedding updated to reference `embedSection` so the wiring is documented in two places (instruction + rule).
- Authoritative references list updated to include `embedSection`.
- 2 long lines (L170 at 851 chars, L404 at 562 chars) split at natural sentence boundaries to reduce dense-prose generation pressure. No content reordering; no instruction rewriting.

### Added — `docs/install-troubleshooting.md`

- **Symptom-organized install troubleshooting doc** at `docs/install-troubleshooting.md`. Strangers find their fix by searching the failure mode they see, not by reading sequentially.
- Contains: Quick Triage decision table, Canonical Clean Reinstall 4-step sequence, 5 symptom sections (P1 stale `gitCommitSha` short-circuit / P2 no-Uninstall-verb in `/plugin` UI / P3 Disabled state survives reinstall / pre-rename `signal@signal` cache orphan / SSH multi-identity cross-link to v0.1.1), Reference table for the 4 Claude Code plugin-state files, See Also pointers.
- Linked from README's existing "Troubleshooting install" section.

### Added — Privacy & telemetry posture (M4.5.E3 Slice 1)

- **README "Privacy & telemetry" section** — explicit, reader-facing claim that Signal makes no network calls beyond Claude Code's own API traffic to Anthropic; no analytics, no telemetry, no usage pings. Names the future-telemetry bar (major-version bump + opt-in + audit update).
- **`tools/audit-network-calls.js`** — reproducible audit script. Greps `tools/`, `skills/`, `agents/`, `commands/` for 6 network-call patterns (`fetch(`, bare `axios`/`node-fetch`, `http.request`, `require`/`import` of `http`/`https`/`node-fetch`/`axios`/`got`, `child_process` shelling to `curl`/`wget`). Default scope excludes `node_modules`, `tests`, `.planning`, `analysis`, and Markdown. Optional positional arg overrides scope (used by the test fixture). Exit 0 clean / exit 1 + per-hit path on violations. Covers Signal's source, not transitive deps.
- **`tests/audit-network-calls.test.js`** — 3-test vitest wrapper: existence + executable bit, exit-0 against current repo, exit-1 + violation path against a seeded `fetch(...)` fixture under `tests/fixtures/audit-network-calls-seeded/`.
- **Test suite: 384 → 387** (3 new audit-script tests).

### Added — `references/facts.md` (M4.5.E3 Slice 2)

- **Canonical source-of-truth file** for facts cross-cited in `README.md` and `SECURITY.md` (Node.js version, Claude Code version, OS posture, dependency counts, test count, license, repo URL). The cross-file consistency test (below) asserts that doc citations match this file. Update HERE first; the tests catch drift in the doc that cite the values.

### Added — `SECURITY.md` (M4.5.E3 Slice 2)

- **Standard-shape security policy** at repo root: `# Security Policy` H1, Supported Versions table (latest 0.1.x supported, prior patches not), Reporting a Vulnerability (GitHub private advisory preferred, `brett@insightriot.com` backup), Disclosure (fixes noted in CHANGELOG against the version that carries them), Scope (explicit IN: plugin source + validator + CLI helpers; explicit OUT: Claude Code → Anthropic, your project's code, transitive npm deps → upstream).
- **Zero Signal workflow vocabulary** — no Tier, Phase, Slice, Wave, Epic, Milestone, no `/sig:*` references. Enforced by the consistency suite's jargon-lint test.
- README footer now carries a `## Security` line pointing at the file, alongside `## License`.

### Added — `tests/cross-file-consistency.test.js` (M4.5.E3 Slice 2)

- **9-assertion vitest suite** + a `facts.md` parse preamble = 10 test blocks total. Asserts: Node version + Claude Code version cited in README match `references/facts.md`; vacuous-pass on test-count and dep-count mentions (only enforces if a doc cites a value); SECURITY.md contains no Signal workflow vocabulary; README has the four anchor sections (`## Privacy & telemetry`, `### Requirements & compatibility`, `docs/map/index.html` link, `## Open Source Origins` with 9 source-repo URLs).
- New `findJargonHits(content, regex)` helper in `tests/helpers/template-lint.js` — line-level finder for the jargon-lint test, reusable for any future "this doc must avoid these terms" assertion.

### Changed — `README.md` (M4.5.E3 Slices 1 + 2)

- **`## Privacy & telemetry` section** (Slice 1) — between the `.planning/` git-tracking section and the command reference; names the no-network claim, hands the reader the audit command, and names the bar for any future telemetry.
- **Nested `### Requirements & compatibility` table** (Slice 2) inside `## Install`, replacing the inline `**Requirements:**` prose line. Four rows: Node.js 22+, Claude Code 2.1.141+, OS (macOS verified, Linux/WSL untested + link to `docs/install-verification.md`), Git.
- **`docs/map/index.html` link** (Slice 2) under the `## Your first project` heading as a one-line visual companion pointer.
- **`## Open Source Origins` section** (Slice 2) — rewrites the prior `## Credits & Heritage` section with a gratitude-framed intro and warmer subsection labels (Directly ported / Inspiration for v2 / Patterns borrowed / Bridge references / Signal's own contribution). All 9 source-repo URLs + 1-line acknowledgments preserved verbatim; `LICENSES.md` cross-link retained.
- **`## Security` footer** (Slice 2) alongside `## License`, pointing at the new `SECURITY.md`.
- **Test-count drift cleanup** — `npm test` example line updated from "380+ tests should pass" to "397 tests should pass" (matches `references/facts.md`).

### Test suite: 387 → 397 (M4.5.E3)

- +10 from `tests/cross-file-consistency.test.js` (9 named assertions + 1 parse preamble). Plan-time forecast was 396 ± 1; landed within tolerance.

## [0.1.2] — 2026-05-18 — M4.5.E6 (resume reliability)

### Added — `STATE.md` schema_version 1 + auto-update protocol + `/sig:checkpoint`

- **YAML-frontmatter `STATE.md` schema** (`schema_version: 1`) replacing the previous freeform-markdown shape. Structured fields: `phase`, `current_epic`, `current_wave`, `current_tasks[]`, `completed_phases[]`, `blockers[]`, `last_decision_at`, `last_updated_commit`, `last_updated`, `last_completed_task`. Body below the frontmatter remains freeform human-readable narrative. Spec: `references/state-schema.md`.
- **`/sig:checkpoint`** (new slash command) — manual state-refresh ritual with two modes:
  - Default (quick): diffs git log since `last_updated_commit` against `STATE.md`, proposes a refreshed state, confirms-and-writes per `gate_strictness`.
  - `--context`: same plus prompts for decisions + open questions; dual-writes decisions to `CONTEXT.md` § Locked Decisions AND `DECISIONS.md` (D16); appends questions to `OPEN-QUESTIONS.md`. Use before any planned context-clear.
- **Auto-state-protocol in `/sig:execute`** — `dispatchTaskWithState` wraps each task: `setCurrentTask` before agent dispatch, `clearCurrentTask({status, commit})` after. SKETCH tier opts out entirely (manual `/sig:checkpoint` only). FEATURE/SPIKE under `gate_strictness: light` (state-write failures warn + continue); FULL under `strict` (state-write failures halt the dispatch). D9.
- **Staleness banner + orphan-prompt UI in `/sig:resume`** — banner prepends when `isStateStale` reports commits-behind on D6 state-affecting paths. Orphan-detection prompt fires before briefing render if any `current_tasks[]` entry has aged past the threshold (default 30 min) with no matching commit. D11 + D12.
- **`markFresh` calls in `/sig:verify` + `/sig:review`** — phase-end refresh of `last_updated` / `last_updated_commit`. Failure under strict surfaces but does NOT halt phase exit (the work is already done).
- New helpers in `tools/lib/state.js`: `parseFrontmatter`, `stringifyFrontmatter`, `StateSchemaError`, `StateWriteError`, `upgradeStateFile`, `setCurrentTask`, `clearCurrentTask`, `getCurrentTasks`, `detectOrphans`, `isStateStale`, `addBlocker`, `clearBlocker`, `touchDecisionTimestamp`, `markFresh`.
- New modules: `tools/lib/atomic-write.js` (extracted from `add.js`), `tools/lib/file-lock.js` (extracted from `add.js`, parameterized for state.js's 5s TTL), `tools/lib/checkpoint.js`, `tools/lib/execute.js`, `tools/lib/resume.js` (with `renderResumeBriefing` + `handleOrphansAtResume`).
- `tools/validate-plugin.js` — `commands/checkpoint.md` is now a required artifact.
- New docs: `references/state-schema.md` (canonical schema reference), `docs/migration-state-schema-v0.1.x.md` (downstream user-facing migration guide).
- New test files (12): `atomic-write.test.js`, `file-lock.test.js`, `state-schema.test.js`, `current-tasks.test.js`, `detect-orphans.test.js`, `is-state-stale.test.js`, `blockers.test.js`, `append-decision-mark-fresh.test.js`, `checkpoint.test.js`, `dispatch-task-with-state.test.js`, `resume-briefing.test.js`, `state-end-to-end.test.js`. **Total tests: 225 → 366** (post-S6 final).

### Changed — `[BREAKING]` `STATE.md` shape

- `[BREAKING]` `STATE.md` now uses YAML frontmatter as the authoritative machine-readable state. **Auto-migrated on first write** to a legacy STATE.md (no user action required); original content preserved verbatim under an HTML comment marker so the freeform narrative remains accessible. Strict three-way detection (D14): legacy → auto-upgrade; `schema_version: 1` → parse normally; unknown version → fail closed with `StateSchemaError`; frontmatter without `schema_version` → refuse to auto-upgrade. Migration policy: `docs/migration-state-schema-v0.1.x.md`.
- `commands/status.md` § 2.3 — blocker section reads from `state.blockers` via `readState` instead of an inline STATE.md regex.

### Fixed

- `isStateStale` short-circuits via HEAD-hash compare (S6.t3, replacing the original 60s wall-clock grace window per REVIEW IMPORTANT-4). Same optimization intent — skip the git log when the state-baseline commit is HEAD — no clock-skew dependency. `/sig:checkpoint`'s `bypassGrace: true` opts out of the short-circuit AND the rev-parse so explicit "what changed?" requests always hit git log.
- `captureCheckpointContext` scrubs sensitive data **before** any write (S6.t1, REVIEW IMPORTANT-1 + IMPORTANT-5). New `acknowledgeSensitive` opt; default behavior refuses to mutate any file when hits are detected, returning `{wrote: [], sensitiveHits, aborted: 'sensitive-data-pending'}` so the caller can prompt the user. Matches the precedent established by `tools/lib/add.js`. `commands/checkpoint.md` § 7 updated; fictional rollback paragraph dropped.
- `dispatchTaskWithState` protects the success path from post-dispatch state-write failures (S6.t2, REVIEW IMPORTANT-2). A blip in `clearCurrentTask({done})` after a successful task is now logged to stderr and the dispatch result returned — instead of re-thrown as if the task failed. The orphan detector clears the residual entry on next run.

### Changed — public API rename

- `tools/lib/state.js` exports `touchDecisionTimestamp` (renamed from `appendDecision` in S6.t4 per REVIEW IMPORTANT-3). The original name implied an append-to-list operation matching `addBlocker`/`clearBlocker`, but there is no `decisions[]` field — the function only refreshes the `last_decision_at` scalar. The rename is pre-publish (`appendDecision` was never released).

### Notes

- M4.5.E6 closes the "post-context-clear re-orientation" gap that motivated the milestone. `/sig:resume` is now an unambiguous validated picture of where the user left off — even after a full context-clear mid-EXECUTE. The 280-line manual re-entry protocol previously hand-maintained at the top of Signal's own `STATE.md` is no longer the recovery path; the schema + briefing + checkpoint command together replace it.
- AC#8 dogfood (real context-clear during E6 EXECUTE) verified in `M4.5.E6-VERIFICATION.md` § 8.
- REVIEW loop-back (path B): the original review pass surfaced 5 Important findings that were resolved via S6 (5 tasks, ~240 LOC, +5 tests). Re-VERIFY + re-REVIEW appendices in `M4.5.E6-VERIFICATION.md` § 12 and `M4.5.E6-REVIEW.md`. Verdict: PASS.

---

## [0.1.1] — 2026-05-15

### Fixed

- **Marketplace install no longer requires SSH access to GitHub.** Changed `.claude-plugin/marketplace.json` `source` block from `{"source": "github", "repo": "InsightRiot/signal"}` to `{"source": "url", "url": "https://github.com/InsightRiot/signal.git", "ref": "v0.1.1", "sha": <pinned>}`. The previous `"github"` shorthand resolved to SSH (`git@github.com:`) which fails on machines with multi-identity SSH configs, `IdentitiesOnly yes` hardening, or corporate firewalls blocking port 22. Anthropic's own `claude-plugins-official` catalog uses the `"url"` form for ~40% of its plugins; Signal now matches that convention. Closes the original v0.1.0 stranger-install break (issue surfaced 2026-05-15 on the maintainer's business machine; same class as anthropics/claude-code #47088, #29722, #52234).

- **Stale `/plugin install signal` bare-slug reference in README removed** (artifact of pre-M4.t19 slug rename).

### Added

- `README.md` — install section now documents the correct 3-line install (`/plugin marketplace add ... → /plugin install sig@signal → /reload-plugins`) and a Troubleshooting subsection naming the `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` env var (Claude Code 2.1.141+) as a stopgap workaround for any user hitting SSH-config friction with other plugins.
- `CHANGELOG.md` (this file) — first formal release history. v0.1.0 entry written retroactively.
- `tools/validate-plugin.js` — enforces `plugin.json.version` is semver-shaped (`MAJOR.MINOR.PATCH`). Future version-format drift caught at validate time.
- `tests/install-contract.test.js` (new) — guards marketplace.json shape and plugin.json version contract.
- `tests/readme-content.test.js` (new) — smoke-tests the README install section so future edits can't silently re-introduce stale install instructions.

### Notes

- M4.5.E1 Slice 1 of 5. Slices 2–5 (F2 agent-registration resolution, fresh-machine verification matrix, versioning policy, validator hardening) follow in subsequent v0.1.x patches.

---

## [0.1.0] — 2026-05-12

Initial public release. Marketplace-installable from `InsightRiot/signal` via Claude Code's plugin system.

### Added

- **`/sig:*` command surface** — 12 slash commands wiring Signal's 6-phase workflow plus calibration + status meta-commands: `/sig:new-project`, `/sig:init`, `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`. (Note: `/sig:add` shipped as the 13th command in M4.5.E2 Slice 1 on 2026-05-14, pre-v0.1.0-tag — included in v0.1.0 marketplace state.)
- **Calibration router** — `/sig:calibrate` asks 5 diagnostic questions and writes `.planning/PROFILE.md`. Every downstream phase command reads `PROFILE.md` first; tier (SKETCH / FEATURE / SPIKE / FULL) gates rigor.
- **Brownfield onboarding** — `/sig:init` scans an existing repo and produces `.planning/LANDSCAPE.md` + a baseline `PROJECT.md` with `[INFERRED]` / `[FILL IN]` markers, then hands off to calibrate.
- **22+ agents** under `agents/` (scanners, specialists, verifiers, executors, planners, researchers, support).
- **21 skills** bound to phases via `state/config.json`, loaded on-demand to preserve context budget.
- **Validator** (`tools/validate-plugin.js`) — enforces required files, commands, agents, plugin.json shape, `plugin.json.name === "sig"`.
- **209 tests** (vitest) — covering `tools/lib/{profile,state,context-monitor,status,landscape,walkthrough,add}.js` + init fixtures.
- **`hooks/session-start.sh`** — surfaces project state at session start when a `.planning/` directory is present in cwd.

### Changed — `[BREAKING]`

- **Plugin slug renamed `signal` → `sig`** (M4.t19, 2026-05-12). The slash-command namespace derives from `plugin.json.name`; `signal` would have rendered as `/signal:sig:command` (double-stutter). Brand "Signal" preserved everywhere user-facing; only the internal plugin slug changed.
- **Commands relocated from `.claude/commands/sig/*.md` → `commands/*.md`** (M4.t19). Marketplace install discovers commands at `<plugin-root>/commands/`; the nested location broke auto-discovery on stranger installs.
- **Vocabulary refactor** `Tranche` → `Milestone` with new `Epic` mid-layer (M4.t18, 2026-05-12). Affects `.planning/*` file names (`TRANCHE-N.md` → `MILESTONE-N.md`) and any downstream-project usage. Migration prompt at `docs/migration-vocab-v0.1.0.md`.

### Known limitations at v0.1.0

- **F2 (agent auto-registration post-marketplace-install)** — `commands/init.md` Step 2 has a documented fallback path; resolution gates v0.1.x patch work (see M4.5 Epic 1).
- **Stranger-install on multi-identity SSH machines** — discovered 2026-05-15; fixed in v0.1.1 (see above).

---

[0.1.4]: https://github.com/InsightRiot/signal/releases/tag/v0.1.4
[0.1.1]: https://github.com/InsightRiot/signal/releases/tag/v0.1.1
[0.1.0]: https://github.com/InsightRiot/signal/releases/tag/v0.1.0
