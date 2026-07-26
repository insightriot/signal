# Agent-Effectiveness Alignment — Signal vs. the field evidence

**What this is:** Signal measured, rec by rec, against an external study of what actually
distinguishes effective agentic development. It answers one question — *where does Signal already
do the thing, and where does it not?* — and hands the gaps to existing Epics.

**Source, stamped:** *Beyond the Model: What Distinguishes Effective Agentic Development*, Span,
Q3 2026. 18pp PDF, read in full (text extracted with `pymupdf`, not summarized second-hand).
`verified-against: Span "Beyond the Model" Q3 2026 on 2026-07-26.`
**Assessed against:** Signal at **v0.1.11**, M5.E7 closed (2026-07-26).

**Citation rule, inherited from M5.E7 (P2):** every claim about Signal below cites a path and line,
or is labelled as judgment.

**What this is not:** a roadmap. `analysis/SIGNAL-V2-ROADMAP.md` governs sequence. Nothing here
displaces M5.E8's position as unconditional-next; §6 records how the two Brett calls resolved.

---

## 1. Bottom line

Signal is **strong on two of the study's three axes and effectively absent on the third** — and the
absent one carries the largest measured effect.

| Axis | What it measures | Effect per point | R² | Signal |
|---|---|---|---|---|
| **Prompt clarity** | Is the task specified? | 27% lower token cost per merged AI line | 0.878 | **Strong.** DISCUSS + PLAN + 8-dimension validation. Three leaks. |
| **Environment readiness** | Can the agent build, test, self-check? | **88% higher turn yield** | **0.949** | **Unowned.** Detected, never verified, never acted on, never gated. |
| **Quality stewardship** | Was quality pushed upstream of review? | 39% fewer review cycles per 1k lines | 0.879 | **Strong; ahead in two places.** Two recs uncovered. |

The study's own framing of the environment axis is the blunt version: *"Autonomy is less a property
of the model and more a property of the workspace you hand it."*

**Convergence worth naming.** The study's conclusion — these three are *"trainable, toolable, and
**measurable**… scored from the trajectory itself"* — is independent outside corroboration of
M5.E7's headline finding (*Signal cannot detect whether its own interventions work*,
`SIGNAL-V2-ROADMAP.md` §1). Two teams reached the same place from opposite directions. That
strengthens M5.E8's priority; it does not change its scope (§6, Call B).

---

## 2. Prompt clarity — strong, with three leaks

Signal is a more serious version of REC 1.5 (*"adopt lightweight prompt templates for recurring task
types"*) than most teams will build: the template is a phase, and it has a gate.

| REC | Signal's answer |
|---|---|
| **1.1** State acceptance criteria explicitly | `commands/plan.md:105` (ACs per task) · dimension 4 *testability* (`:117`) · Nyquist mapping (`:121-127`). Anti-rationalization: *"This task is too small to need acceptance criteria"* (`:159`). **Covered.** |
| **1.2** Scope the change, including the negative space | Project-level Out of Scope exists (`commands/init.md:305`); dimension 5 *scope discipline* (`:120`) checks gold-plating. **Per-task negative space exists nowhere** — leak 3. |
| **1.3** Provide pointers, not archaeology assignments | Produced by the codebase researcher, **not delivered to the implementing agent** — leak 1. |
| **1.4** State constraints and conventions up front | PROJECT.md Constraints (`commands/init.md:308`) · CONTEXT.md locked decisions (`commands/discuss.md:108`) · re-read every ~45 min (`commands/execute.md:70`). **Covered.** |
| **1.5** Lightweight templates for recurring task types | Signal *is* the template. No per-task-type variants (bug fix / refactor / new endpoint). **Minor, arguably unnecessary** — Signal's tiering already varies rigor by a better axis than task type. |
| **1.6** Front-load ambiguity resolution | **The DISCUSS phase** (`commands/discuss.md`). The strongest single alignment in this comparison: the study recommends a two-minute clarification chat; Signal made it a gated phase with a decisions artifact. **Ahead.** |

### Leak 1 — research findings never reach the agent doing the work

`commands/plan.md:89-97` spawns up to four research agents, one of them explicitly the **codebase
researcher** — *"existing patterns, reusable code, integration points."* That is REC 1.3 nearly
verbatim. Output lands in `{phase}-RESEARCH.md`.

`agents/executors/executor.md:17-21` declares its Inputs as **the PLAN task, `.planning/CONTEXT.md`,
and `.planning/{phase}-VALIDATION.md`.** `{phase}-RESEARCH.md` is not among them, and nothing in
`commands/execute.md:58-65`'s dispatch injects research findings into the task handoff.

So Signal pays for exactly the exemplar-and-pattern discovery the study identifies as the cheapest
available token saving, then hands the implementing agent a task that does not carry it. This is the
highest-value/lowest-cost finding in the document.

### Leak 2 — "files likely touched" is advisory at best

`skills/plan/planning-and-task-breakdown/SKILL.md:99` includes a **Files likely touched** field in
the task template. `commands/plan.md:101-107` — the command's authoritative list of what a PLAN must
contain (goal · vertical slices · dependencies · ACs · test strategy · complexity) — omits it. The
skill is guidance; the command is the contract. They disagree, and the contract wins.

### Leak 3 — no per-task out-of-scope

REC 1.2's negative space (*"don't touch the public API," "no dependency changes"*) has no field
anywhere. The nearest thing is `agents/executors/executor.md:45` — *"every changed line should trace
directly to the task's acceptance criteria"* — a general discipline rule, not the named boundary the
study asks for.

---

## 3. Quality stewardship — strong, ahead in two places

REVIEW-before-SHIP is the study's Result 03 as an architecture rather than a habit. Two of seven
recs are uncovered.

| REC | Signal's answer |
|---|---|
| **3.1** Demand explicit failure handling in the code | `commands/discuss.md:132-133` production-readiness questions (FULL: probes · shutdown · structured logging · security headers · rate limiting; FEATURE: boundary errors · log lines · input validation) + REVIEW axis 1. **Covered.** |
| **3.2** Review the diff before opening the PR | **The entire REVIEW phase** (`commands/review.md`) — 5 axes, Critical/Important/Suggestion/Nit, PASS / PASS-WITH-FIXES / FAIL. **Ahead:** the study asks the developer to read the diff; Signal runs a specialist panel and gates on it. |
| **3.3** Steer toward reusable conventions in the repo | `commands/review.md:81` (project conventions) + the codebase researcher. **Covered**, but inherits leak 1 — conventions are discovered at PLAN and not delivered at EXECUTE. |
| **3.4** Surface blast radius before merge | **Gap** — see below. |
| **3.5** Treat production readiness as part of the change | `skills/ship/shipping-and-launch/SKILL.md:162` (observability) + `commands/discuss.md:132`. **Covered.** |
| **3.6** Make the agent prove its work | **Ahead.** `commands/verify.md:23` — `nyquist_enforcement: strict` requires documented evidence each test **failed before it passed** (per-test red→green git evidence, or a written attestation naming the file and the implementation commit it predates). The study asks for "run the suite." |
| **3.7** Ask the agent to self-critique | **Gap** — see below. |

### Gap A — blast radius and rollback are known but never asked

The knowledge is present across four skills: `skills/build/incremental-implementation/SKILL.md:147`
(feature flags), `:174` (Rollback-Friendly), `skills/ship/ci-cd-and-automation/SKILL.md:247`
(Rollback Plan), `skills/ship/shipping-and-launch/SKILL.md:129` (canary vs. baseline).

**No phase asks the question.** DISCUSS's FULL production-readiness row (`commands/discuss.md:132`)
covers probes / shutdown / logging / headers / rate limiting — not *what does this reach, and how do
we undo it*. SHIP's pre-ship checklist (`commands/ship.md:61-69`) covers secrets, env vars, README,
CHANGELOG, `docs/map`, tests, build, linter, review issues — **no rollback line**.

Worth distinguishing: `reversibility` is one of calibrate's five diagnostic questions
(`commands/calibrate.md:104-136`), but that tiers **the project**. Per-change blast radius is a
different question at a different altitude, and nothing asks it.

### Gap B — no self-critique step

REC 3.7 — *"before finishing, have the agent list edge cases it may have missed, assumptions it
made, and anything it couldn't verify"* — which the study calls *"a cheap, high-yield step"* that
*"converts unknown unknowns into an explicit checklist."*

Signal has two adjacent things that are not this: `agents/researchers/assumptions-analyzer.md` runs
at **PLAN** time against the *approach*, and `skills/build/source-driven-development/SKILL.md:155`
flags unverified **documentation claims**. Neither is a post-implementation self-critique.

`commands/verify.md:64-66` says only *"Generate the VERIFICATION artifact with results"* — no
template, therefore no required "what this could not establish" section. **Signal did exactly this
by hand in `M5.E7-VERIFICATION.md` §4** and it was among that Epic's most useful outputs. It is a
practice Signal reaches for under pressure, not an instruction it carries.

---

## 4. Environment readiness — the real gap

Largest effect in the study (**88% more merged AI-authored lines per human turn, per point** —
roughly 5 → 17 across readiness scores of 2.5 → 4.5) and the tightest fit (**R² = 0.949**).

| REC | Signal |
|---|---|
| **2.1** Make setup one command | Nothing. |
| **2.2** Guarantee a fast, runnable test suite | Detects the runner. Never runs it. Never establishes it is green. **Flaky detection: nothing** — and the study is explicit that *"a flaky suite was worse than none, because the agent couldn't distinguish its errors from the environment's."* |
| **2.3** Expose fast feedback loops beyond tests | Detects the lint / type / format config files. Never runs them. |
| **2.4** Write agent-facing repo documentation | Nothing. Signal writes `.planning/*` **for itself**; it never authors or refreshes the project's own `CLAUDE.md` / `AGENTS.md`. The only repo-wide hit for `AGENTS.md` is `skills/build/context-engineering/SKILL.md:72`, listing it as an OpenAI Codex convention. The study calls this *"the cheapest environment-readiness investment we know of."* |
| **2.5** Reduce hidden state and permissions friction | Nothing. |
| **2.6** Keep the codebase legible | `skills/review/code-simplification` — per-change only, never repo-wide. |

Four verified specifics:

**(a) The scanners are forbidden from executing anything.**
`agents/scanners/quality-scanner.md:209` — *"Never run `npm install`, `npm test`, `pytest`, etc. —
those mutate the environment and consume time."* Same rule at `agents/scanners/stack-scanner.md:150`.
**This is a deliberate, defensible constraint** (read-only onboarding into a stranger's repo, and
Signal never auto-commits someone else's work — `commands/migrate-memory.md:17` carries the same
posture). Its consequence is that Signal can report a project *has* vitest and can never report that
the suite passes.

**(b) What is detected is written once and read by nothing.**
`/sig:init` writes LANDSCAPE.md § Test surface — test runner · tests detected · CI-runs-tests ·
coverage tooling (`commands/init.md:228-232`). The only consumer is `readLandscapeMeta`
(`tools/lib/status.js:194-201`), which extracts **the captured-on date and nothing else**.
`/sig:status` prints `Landscape: captured {date}`; `/sig:resume` uses the purpose paragraph as a
Vision fallback (`commands/resume.md:38`). **No command reads the readiness fields; nothing gates
on them.**

**(c) Calibration never asks.**
The five diagnostic questions (`commands/calibrate.md:104-136`) are scope · stakes · novelty ·
reversibility · horizon — all **risk** axes. None asks whether the agent can build and test the
thing. Tier therefore governs how much ceremony to apply, never whether the workspace can support
any of it.

**(d) Even the queued readiness scorecard misses this axis.**
The `/sig:audit` spec (`.planning/ISSUES-INBOX.md` § *"`/sig:audit` — engineering-readiness audit"*,
BACKLOG Sprint 5) scores six dimensions: modularity & boundary clarity · test coverage & test
quality · documentation & explicitness · dependency health · tribal-knowledge risk · security-model
explicitness. **Every one is a human-maintainability dimension. None is "can an agent set this up,
run it, and read the errors."**

The nearest existing machinery is `commands/plan.md:130-143`'s environment check — install dry-run,
prebuilt-binary confirmation, yanked-version check. That is dependency **resolution** drift, not
agent **executability**.

---

## 5. What follows — three edits and a checklist line

All four are markdown, all four have an existing home, none needs a new Epic. Captured to
`ISSUES-INBOX.md` 2026-07-26 for disposition at the next `/sig:plan` drain — **not** written
straight to `BACKLOG.md`, so the capture lifecycle stays the single path in.

1. **Deliver research to the executor.** Add `{phase}-RESEARCH.md` to
   `agents/executors/executor.md` § Inputs, or have the orchestrator inject the task-relevant
   excerpt at dispatch (`commands/execute.md:58-65`). → proposed home **M5.E9**, which already owns
   EXECUTE dispatch guidance. *Done-when:* an executor dispatched on a task whose research names an
   exemplar file follows that exemplar instead of re-deriving the pattern.
2. **Two task-template fields — `Relevant files / exemplar:` and `Out of scope:`** — promoted into
   `commands/plan.md:101-107`'s required contents so command and skill agree. → ships with (1).
   *Done-when:* a plan whose tasks lack either field fails the 8-dimension pass at *scope
   discipline*.
3. **A required "Assumptions, unverified, and edge cases not covered" section in the VERIFICATION
   artifact**, plus a one-line self-critique at executor task close. → proposed home **M5.E10**
   (review hardening): it is the false-green instinct pointed one phase earlier, and it feeds the
   false-green audit directly. *Done-when:* a VERIFICATION artifact with the section absent or empty
   fails the phase gate.
4. **A rollback / blast-radius line** on the SHIP pre-ship checklist (`commands/ship.md:61-69`) and
   in DISCUSS's production-readiness row (`commands/discuss.md:132`). → **M5.E9**, hygiene.

---

## 6. The two product calls, and how they resolved

### Call A — environment execution → **reframed as a permission model** (Brett, 2026-07-26)

The question posed was narrow: *should Signal start executing build/test/lint commands in a
stranger's repo?* **Brett rejected the framing as too small.** The right shape is not a one-off
exception to the read-only scanner rule but **a declared permission model** — graded levels of
execution authority, most likely established at onboarding, with a future in which *"the user is
really only required for decisions on what/why — everything else is left to Signal to execute
against,"* conceivably running unattended from EXECUTE onward.

That reframe is correct and it subsumes the gap. Every item in §4 is blocked on the same missing
thing: Signal has **no vocabulary for what it is allowed to do in a given repo.** Read-only is not a
principle Signal chose per project; it is a hard-coded default in two scanner files. A permission
model turns a hard-coded default into a per-project setting, and the environment-readiness work
becomes a consumer of it rather than an exception to it.

It also makes mechanical a norm Brett already holds — *gate at product altitude*: decide plumbing
yourself, interrupt only for product and scope calls. Today that norm lives in prose and depends on
each agent honoring it. A permission model is that norm with a schema.

Captured to `ISSUES-INBOX.md` as its own entry (*"`/sig:permissions` — declared execution-authority
levels"*). **It is not scoped here**; the entry is its single home. Two things recorded now: the
environment-readiness gap is **downstream of it**, and `/sig:audit`'s seventh dimension is
downstream of it too (you cannot score executability you are not permitted to test).

### Call B — M5.E8 scope → **posture held** (Brett, 2026-07-26)

Proposed: widen M5.E8 from instruction-adherence to full trajectory scoring on the study's three
axes. **Declined — and the reasoning is the right one.** M5.E8 stays limited to
**instruction-adherence**: does a Signal prompt instruction actually get obeyed. Trajectory tracking
is *"another level / dimension of that,"* better served as **a separate but complementary
endeavor.**

The distinction the study blurs and this call preserves: the study measures **human→agent prompt
clarity**; Signal's measured problem is **Signal's own instruction→agent adherence** (7 of 12,
`SIGNAL-V2-ROADMAP.md` §1). Different failure modes. The 27%-per-point coefficient does not transfer,
and a single Epic chasing both would ship neither cleanly.

What the study still contributes to M5.E8, without changing its scope: **a validated method for
building the rubric**, from its Appendix — (1) qualitative trace review over the best and worst
tails, (2) rubrics written as **observable** criteria (*"the prompt states acceptance criteria," "the
agent successfully executed the test suite at least once"*) with any dimension that cannot be
operationalized **dropped**, (3) automated scoring of full trajectories, (4) validation against blind
human ratings. That is directly reusable when trajectory scoring is eventually built, and the
"observable or dropped" rule is worth adopting in E8(a) now.

One thing not to over-assume: `tools/measure-phase-costs.js` and `tools/lib/context-monitor.js`
measure the **static** token cost of loading skill markdown (`estimateTokens`, a ~4-chars/token
heuristic over files). They are **not** per-run trajectory instrumentation. The primitive exists; the
run-level capture does not.

---

## 7. Tensions and caveats

**The tier-calibration tension, stated as an open question rather than a finding.** The study found
no threshold below which clarity and stewardship stop paying. Signal's calibration assumes one:
SKETCH drops TDD and skips REVIEW; FEATURE sets `review_depth: quality-only`. That is defensible —
the study examined **merged production PRs across 103 teams over 12 weeks** and says nothing about
throwaway code, so it cannot refute tier-calibration. But Signal adopted the threshold on judgment,
not measurement, which is the same shape as **`B38`** (the anti-rationalization generalization
adopted universally on no measurement). **Untested assumption, worth a line in M5.E8's scope, not a
redesign.**

**Caveats on the source, so its numbers are not over-weighted.**
- Observational, not experimental — the report says so plainly, and warns that *"teams that write
  clear prompts may also differ in other disciplined ways."*
- R² values of 0.878 / 0.949 / 0.879 across 103 teams are almost certainly fits to **binned
  averages** rather than per-trajectory points. (Judgment, not stated in the report.)
- **The Appendix carries literal unfilled placeholders** where the inter-rater agreement statistic
  and the list of controlled confounds should be: *"[agreement statistic, e.g., Cohen's κ …]"* and
  *"[and, e.g., team, repository, model version — list actual controls]."* The methodological
  documentation is incomplete.
- **Vendor research.** Span sells the evals, and every recommendation is a reason to buy them.

**Treat as directional. Do not hard-code the coefficients into anything Signal builds** — which is
the same rule correction **C6** produced, applied on arrival rather than three months late.

---

## Last Updated

2026-07-26 — written after M5.E7 closed. Findings captured to `ISSUES-INBOX.md` the same day;
decisions recorded in `DECISIONS.md` (2026-07-26, the alignment pass).
