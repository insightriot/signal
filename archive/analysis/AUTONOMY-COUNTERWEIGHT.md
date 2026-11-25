# The autonomy counterweight — Signal's loop plan vs. a collapse-avoidance workflow

**Signal's `LOOP-ENGINEERING-ANALYSIS.md` compared against Dexter Horthy's implementation guide for agentic engineering workflows that don't collapse. Where they agree, where the guide corrects Signal, where Signal corrects the guide, and what to change.**

**Date:** 2026-08-08
**Status:** Analysis. Companion to [`LOOP-ENGINEERING-ANALYSIS.md`](LOOP-ENGINEERING-ANALYSIS.md); proposes two amendments to that doc and one new artifact. Not a committed plan; **not in the agreed next-work sequence** ([`.planning/BACKLOG.md`](../.planning/BACKLOG.md) — the `M5.E14` slice, `B87`, and the namespace decision come first).

**Source:** "How to Build and Maintain an Agentic Engineering Workflow That Doesn't Collapse" — 10 steps plus 4 failure modes, transcribed from a Dexter Horthy (HumanLayer) talk with David. **The transcript supplied is OCR-damaged** in several places ("Deays", "fulentations", "pre-dcks", a truncated Step 10 and a truncated final paragraph). No argument below rests on a garbled clause; where a step's text is incomplete, that is stated.

**Method:** Signal-side claims are grounded in a repo scan on 2026-08-08, not memory: `commands/{discuss,plan,execute,verify,review,ship,add}.md`, `agents/researchers/ui-researcher.md`, `agents/verifiers/{ui-checker,ui-auditor}.md`, `tools/lib/branch-guard.js`, `.planning/{BUGS,BACKLOG,STATE}.md`, and repo-wide greps for diff-reading, model pinning, success metrics, and UI-agent callers.

---

## 1. The correction that reframes everything

**This is not an autonomy methodology. It is an anti-autonomy methodology**, and its central cautionary case is the endpoint Signal's loop plan walks toward.

Horthy's Step 9 and Failure Mode 2 describe a "lights-off factory" his team ran in July 2025: they stopped reading code and reviewed only plans and tickets. A bug appeared that weeks of agent prompting couldn't fix, in a codebase they'd stopped reading. His summary — *"the odds of this happening to you if you stop reading the code are much higher than the odds of it not happening to you."*

Signal's `LOOP-ENGINEERING-ANALYSIS.md` §2 relocates the human to three positions: **policy author** (before), **async exception handler** (during), **batch auditor** (after). None of the three requires reading code. §8 then names the primary success metric: **"Minutes of human attention per shipped Epic,"** minimized.

That is the July-2025 experiment with a KPI attached.

**This does not refute the loop plan.** Two things are separately true, and Signal's own audit established the first one with line citations: (a) 48–86 synchronous confirms per FULL Epic are ceremony — `B75` proves `light` and `strict` differ by **one boolean** in code, so most of that gating is enforced by nothing; and (b) the human's comprehension of the codebase is load-bearing and cannot be delegated to a report. Removing (a) is right. The plan's error is that it has no floor preventing the removal from reaching (b).

---

## 2. Bottom line

The two documents **optimize the same variable in opposite directions and are both correct about a different half of it.**

| | Signal's loop plan | Horthy's guide |
|---|---|---|
| Where the human's time goes | **Out** — from mid-flight to a batch audit after | **Forward** — from mid-flight to design before, plus the diff after |
| What mid-flight interrupts are | Ceremony to remove | Symptoms of underspecified inputs |
| Enforcement | Executable gates, measured (`adherence-run.js`) | Prose discipline, unmeasured |
| Work sizing | A dial (SKETCH/FEATURE/SPIKE/FULL) | One process, with a blanket exclusion for pre-PMF founders |

**The synthesis: attention should move *forward* and *to the far end*, not merely *out*.** Spend it on inputs (measurable outcome, architecture, program design) and on the diff at merge; remove it from the middle. That is a sharper form of Signal's own thesis, fully compatible with the `attention` axis, and it supplies the floor the plan is missing.

---

## 3. Alignment matrix — the ten steps against Signal

| # | Horthy step | Signal today | Verdict |
|---|---|---|---|
| 1 | PRD with a **measurable success metric** + working-backwards blog post | REQUIREMENTS carry stranger-verifiable acceptance criteria. No prompt anywhere asks for a business-outcome metric (grepped `discuss.md`, `plan.md`, `references/*.md` for "success metric"/"business outcome"/"how will we know" — zero hits). | **Partial** — Signal has a *completion* oracle, not an *outcome* oracle |
| 2 | HTML mockups of every affected view before production code | `ui-researcher` produces UI-SPEC.md; `ui-checker` validates against it; `ui-auditor` does retroactive audit. **No command spawns any of the three** (see §6, observation O-2). | **Machinery exists, no caller** |
| 3 | Architecture in a **fresh, low-token** session | Each phase is its own command invocation with its own context; DISCUSS→PLAN separation is exactly this | **Aligned; Signal enforces it structurally** |
| 4 | Program design — file placement, call stack, tests-before-code | PLAN enumerates touched files; Nyquist maps every acceptance criterion to a test at plan time. **Call-stack / control-flow ordering: absent.** | **Mostly aligned**, one gap |
| 5 | **Vertical slices, not horizontal layers** | The `planner` agent does vertical slicing mechanically, every plan, unprompted | **Signal is ahead — see §5.1** |
| 6 | Compact and restart at ~50% of the context window | `execute.md:84` — warn at 35% *remaining*, critical at 25% *remaining* (i.e. acts at ~65–75% **consumed**); fresh context per task; `/sig:checkpoint --context` | **Aligned in mechanism; Horthy's threshold is stricter** |
| 7 | `/docs/adr` + `/docs/external` | `DECISIONS.md` with `D-` IDs and single-home discipline is a stronger ADR store. **`/docs/external` has no equivalent** — `ship.md:77` (".env.example updated") is a product checklist line, not an agent-facing environment doc. | **ADR: Signal ahead. External: absent — see §4.3** |
| 8 | Review with a **second frontier model** before merge | REVIEW runs `code-reviewer`, `security-auditor`, `test-engineer` — all the same model. **No agent pins `model:` in frontmatter** (grepped `agents/`). | **Gap — the model-diversity axis is missing** |
| 9 | **Human reads the diff, every non-trivial PR** | **Nothing in 20 commands requires it.** `review.md:162` = "User approves review *results*"; `ship.md:219` = "User approves PR for merge"; the pre-ship checklist (`ship.md:76-85`) is entirely machine and doc checks. `git diff` appears in commands only at `add.md` (capture preview) and `plan.md:93` (drain preview). The *agent* reads the code; the human approves a report about it. | **The central gap — see §4.1** |
| 10 | Route incidents/support tickets into the agent pipeline | Absent. Already named as the biggest gap in [`SOFTWARE-FACTORY-COMPARISON.md`](SOFTWARE-FACTORY-COMPARISON.md) §"three concrete gaps" #3. *(This step's text is OCR-truncated; the pattern is legible, the details are not.)* | **Corroborates an existing finding from a second independent source** |

---

## 4. Where the guide is better than Signal's thinking

### 4.1 It has a comprehension floor. Signal's plan has none.

Horthy's Step 9 is the only rule in his guide with no exception clause. Signal's plan has no equivalent, and its §5.2 conversion table sorts every touchpoint into five roles — information source, rubber stamp, circuit breaker, irreversibility guard, delivery authority — **none of which is "maintaining the operator's mental model."** The role isn't downgraded; it was never enumerated.

**There is also an internal contradiction in the loop doc itself, which is the `M5.E17` defect class appearing inside a document about autonomy:** §2 says the batch auditor reviews *"the decision log + **diff** + retro."* FM-3 (line 205) lists the audit inputs as *"the decision queue…, the retro, a **diffstat**, and a one-screen summary."* A diffstat is a summary of the diff — a count of files and lines. One sentence asks for the code; the other asks for a report about the code, and the second is the one that appears in the section defining the success criteria. Signal's own history says which one wins when a document disagrees with itself: the one nothing checks loses.

### 4.2 Front-loading, not gate-removal, is the primary lever

Steps 1–4 are all pre-agent work. The implicit claim: **most mid-flight interrupts are symptoms of underspecified inputs, not of excessive ceremony.** Signal's audit counted the interrupts and asked how to remove them; it never asked how many exist because DISCUSS ended without an outcome metric or a call-stack decision.

The two framings predict different fixes. Signal's predicts: convert confirms to evidence records. Horthy's predicts: strengthen DISCUSS/PLAN outputs and the confirms have less to catch. **Both are available and they compose** — but only Horthy's addresses FM-4 ("a wrong auto-decision compounds") at its source rather than at its blast radius.

Concretely additive to Signal: (a) the **measurable outcome** in REQUIREMENTS — Horthy's argument is that without one *"the agent will make product decisions by default,"* which is the same concern as the standing "gate at product altitude" norm, stated as an input rather than an interrupt; (b) the **call stack** as a plan artifact — Signal plans say which files, not which function calls which in what order.

### 4.3 `/docs/external` is the unblocked half of an axis Signal already named

[`AGENT-EFFECTIVENESS-ALIGNMENT.md`](AGENT-EFFECTIVENESS-ALIGNMENT.md) names **environment readiness** as Signal's absent axis and blocks it on a permission model (`/sig:permissions`). Horthy's Step 7 shows half of it is not blocked on anything: a plain markdown file listing env var *names*, external service setup, test accounts, and support channels. An unattended loop that must stop to ask "which env var holds the Stripe key?" has halted on a question a file answers.

An independent source arriving at the same absent axis, and supplying a version that needs no permission model, is the strongest reason in this document to build something.

### 4.4 Model diversity as an answer to claim integrity

Signal's FM-1 correctly identifies claim integrity as the central risk of autonomy, and its countermeasure is *"adversarial verification — verifier agents prompted with fresh context to refute."* Fresh context removes the writer's *conversation*; it does not remove the writer's *priors*. Horthy's Step 8 removes both by changing the model.

This matters because FM-1's own evidence says every major catch in this project came from **a human reading documents against each other** — two different readers, not one reader twice. A second model is the closest mechanical analog available.

---

## 5. Where Signal is better

### 5.1 Vertical slicing is mechanical here, manual there

Horthy, Step 5: he has *"never seen a model do this without a human getting in the loop and telling it what order to do the things."* Signal's `planner` agent does it on every plan as a defined responsibility. His FM-3 (horizontal build with no checkpoints) is a failure mode Signal's PLAN phase structurally prevents.

This is the cleanest instance of Signal having already solved something the guide treats as permanent manual labor — and it is direct support for the front-loading synthesis: a stronger plan removed an entire class of mid-flight steering.

### 5.2 Rigor is a dial; the guide has one process and an exclusion

The guide's own scope note excludes pre-PMF solo founders who need to move fast. That exclusion **is** the problem `/sig:calibrate` solves — the same observation [`SOFTWARE-FACTORY-COMPARISON.md`](SOFTWARE-FACTORY-COMPARISON.md) made about Marks's binary `auto` label. A SKETCH throwaway should not carry a PRD with a conversion-rate target.

### 5.3 Everything in the guide is prose, which is the failure class Signal named today

[`UNREACHED-MECHANISM-ANALYSIS.md`](UNREACHED-MECHANISM-ANALYSIS.md) (2026-08-08): *"A mechanism exists, is correct, and is never reached — because reaching it depends on a person remembering, and nothing observes whether they did."* Its remedy #1: **make the rule executable, or delete it.**

Nothing in Horthy's guide observes whether you wrote the PRD, whether you compacted at 50%, or whether you read the diff. His own Step 9 is a discipline that a team of experienced engineers — including the author — abandoned for a month without noticing. **That is the strongest possible demonstration of why Signal's approach is right**, and it sets the terms for adopting anything here: *adopt these as gates, or don't adopt them.* Copying them in as instructions reproduces the class.

### 5.4 Measurement

Horthy gates trust on **~70 hours of prior agent use** — the operator's calibration, unmeasurable and unauditable. Signal's trust ramp gates on **N consecutive Epics whose batch audits surfaced no decision the human would have made differently**, which is a claim about the *system* and is checkable. Signal's ramp is better; it is also missing Horthy's half (the operator's own competence), and neither doc has both.

---

## 6. Two observations filed, not asserted as bugs

**O-1 — Signal's loop terminus became mechanical on 2026-08-08, mid-analysis.** The plan terminates unattended runs at **PR-open**. `B88` (P1) said Signal was branch-blind: nothing created a branch and nothing checked one existed, so `ship.md`'s PR step was unreachable once commits had landed on the default branch. Humans opened PRs anyway; the point is that an *unattended* loop had no mechanical way to guarantee its own stopping condition. **`B88` is now `fixed`** — `tools/lib/branch-guard.js` (`checkBranchPosture`, `readPullRequestEvidence`) landed as PR #118 (`57721f8`) while this document was being written, wired at `execute.md:46` and `ship.md:48`, with the PR line at `ship.md:214` converted from a checkbox to rendered evidence. **The loop plan should note the dependency explicitly:** Phase B's stopping condition rests on this module, and `checkBranchPosture`'s `--allow-default-branch` override is the thing an unattended run must never be permitted to pass.

**O-2 — No command spawns `ui-researcher`, `ui-checker`, or `ui-auditor`.** Grepped repo-wide: the three appear in their own agent files, [`docs/install-verification.md`](../docs/install-verification.md), `docs/map/index.html`, and analysis docs — in no command, skill, or tool. That is the shape of the unreached-mechanism class, **but the ambiguity should be named before it is filed as a defect**: no command has a conditional frontend branch at all, and Signal itself has no UI, so these may be deliberately ad-hoc for consumer projects. The question to answer first is whether a frontend project running `/sig:plan` is *supposed* to get a UI-SPEC.

---

## 7. Recommended integration — ranked, each with a home

> **Dispositions, 2026-08-08 (Brett).** All six accepted. **1 and 2: DONE** — applied to `LOOP-ENGINEERING-ANALYSIS.md` the same day (§2, §5.2, FM-3, §8). **3: accepted as TBD, explicitly not urgent** — the principle is recorded as §5.2's sixth row; the enforcement mechanism is deferred. **4, 5, 6: accepted**, queued in [`.planning/BACKLOG.md`](../.planning/BACKLOG.md) behind the agreed sequence. **7 (the `B73`–`B76` prerequisites): accepted** as the entry price for any Phase A work.

**1. Amend `LOOP-ENGINEERING-ANALYSIS.md` §5.2 — add the sixth row.** ✅ **DONE.** *(One table row. Highest leverage in this document.)*

| The human is… | Examples | Conversion |
|---|---|---|
| **Maintaining the mental model** | reading the diff of shipped work | **Does not convert.** Survives every attention level. |

**2. Amend §8 — the success metric points the wrong way.** ✅ **DONE** (and FM-3's `diffstat`→`diff` with it). *"Minutes of human attention per shipped Epic,"* minimized, rewards the July-2025 behavior exactly. Replace with a split target: **minutes of mid-flight attention → down; minutes at inputs and at the diff → held or up.** Add the comprehension probe as a health signal: *can the operator describe what a module does without asking the agent?* Retain the existing "defects caught late" metric — under the corrected target it becomes the check on whether the split is working.

**3. Make the diff-read a gate, not a discipline.** 🕓 **TBD — accepted, not urgent (2026-08-08).** The principle now lives in §5.2's sixth row; what follows is the mechanism when it is built. **Stated honestly: until it exists, the floor is a preference, and this repo's own `UNREACHED-MECHANISM-ANALYSIS.md` says preferences are not reached.** That is an accepted risk while the operator is reading diffs by habit; it becomes urgent the moment `attention: unattended` is real. The merge gate is already human (`ship.md:219`, `D-M5E17-4`) — it is the only place in Signal where a person is structurally required, which makes it the one place a comprehension floor can be enforced rather than requested. The executable form: SHIP presents diff size (files, lines, hunks) from the artifact, not from memory; above a threshold the checkbox is replaced by evidence, in the exact shape `B88`'s fix just established for the PR line (`ship.md:214` — *"filled from evidence, never ticked from memory"*). What that evidence is, is a DISCUSS question; that a checkbox is insufficient, is settled by thirteen releases of precedent.

**4. Adopt `/docs/external` as `.planning/ENVIRONMENT.md`.** ✅ **Accepted 2026-08-08; queued in `BACKLOG.md`.** Env var *names* only, external services, test accounts, support channels. Drafted at `/sig:init` (the four scanners already detect stack, CI, and quality signals), one prompt at `/sig:calibrate` for what a scanner can't see. Independent of the loop work, useful attended, and a prerequisite for unattended: it converts a halt into a lookup. Closes the unblocked half of the environment-readiness axis without waiting on `/sig:permissions`.

**5. Add the measurable-outcome question to DISCUSS, tier-gated.** ✅ **Accepted 2026-08-08; queued in `BACKLOG.md`.** FULL and FEATURE ask; SKETCH and SPIKE don't. Honest limit: for infrastructure and tooling work an outcome metric often doesn't exist, so the gate must accept *"no outcome metric, and here's why"* as a valid answer — otherwise it becomes ceremony that gets rationalized past, which the anti-rationalization tables exist to prevent.

**6. Cross-model review — scope it honestly before promising it.** ✅ **Accepted 2026-08-08; queued in `BACKLOG.md`** (as a scoping question first, not a build). Cross-*tier* (a different-strength model on the same family) is reachable: no agent pins `model:` today, so this is new frontmatter plus a decision about which agent gets it. Cross-*vendor* (write with Claude, review with Codex) is **not** something Signal can assume — it depends on a plugin the user may not have installed, which makes it a capability-checked optional path at best. Fold whichever is chosen into FM-1's adversarial-verification countermeasure rather than adding a step.

**Sequencing note.** Items 1–2 are edits to an analysis doc and cost minutes. Items 3–6 are Epic-lane work and belong *behind* the agreed queue (`M5.E14` slice → `B87` → namespace). Phase A of the loop plan additionally still owes its own prerequisites: **`B73`, `B74`, `B75`, `B76` are all `confirmed` and unfixed** as of 2026-08-08, and `B76` (REVIEW's FAIL path has no user ask and no loop ceiling) is the unbounded-loop hazard that any driver would inherit. Item 3 has a natural pairing with `B74` — both are about a checkbox in Exit Criteria that asserts rather than reads.

---

## 8. What not to adopt

- **HTML mockups as a universal step.** Signal has a UI path (O-2 notwithstanding); mandating mockups for a CLI plugin is noise. Tier-and-domain-gated or not at all.
- **The 70-hour threshold.** Unmeasurable, unauditable, and Signal's track-record ramp is the better instrument. Keep the *idea* that trust is earned; keep Signal's way of measuring it.
- **Any of it as prose.** §5.3. A step added to a command file that nothing checks is a step that will be skipped, and the skipping will be invisible — which is the defect class this repo named today.
- **Step 10's incident routing, now.** Corroborated as a real gap by two independent sources, and still the outer loop — it belongs after single-lane autonomy has a track record, per the loop plan's own sequencing. Horthy's constraint is worth carrying forward when it happens: *automate only incident types you've seen before.*

---

*Companion docs: [`LOOP-ENGINEERING-ANALYSIS.md`](LOOP-ENGINEERING-ANALYSIS.md) (the plan this amends), [`CLAIM-INTEGRITY-ANALYSIS.md`](CLAIM-INTEGRITY-ANALYSIS.md) (FM-1's defect class), [`UNREACHED-MECHANISM-ANALYSIS.md`](UNREACHED-MECHANISM-ANALYSIS.md) (why prose adoption fails), [`SOFTWARE-FACTORY-COMPARISON.md`](SOFTWARE-FACTORY-COMPARISON.md) (the outer loop Step 10 corroborates), [`AGENT-EFFECTIVENESS-ALIGNMENT.md`](AGENT-EFFECTIVENESS-ALIGNMENT.md) (the environment-readiness axis Step 7 unblocks half of).*
