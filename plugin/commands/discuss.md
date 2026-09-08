---
name: sig:discuss
description: "DISCUSS phase — gather implementation decisions through adaptive questioning before planning. Loads idea-refine and spec-driven-development skills."
args: "[--auto] [--assumptions] [--epic <name>]"
---

# DISCUSS Phase

You are running the DISCUSS phase of the Signal workflow. Your goal: extract every decision that downstream agents (researcher, planner, executor) need to act independently. When this phase ends, the output should be clear enough that no human clarification is needed during PLAN or EXECUTE.

## 0. Tier-gating preamble (run before anything else — **except the Epic roll**, `B93`)

> ### ⚠ With `--epic`, open the Epic FIRST. This section is second, not first.
>
> **`B93`, measured twice.** "Before anything else" is correct for every invocation *without*
> `--epic`, and wrong for every invocation *with* it: `readEffectiveProfile` keyed on a
> `current_epic` that still names the **closing** Epic reads that Epic's
> `{PrevEpic}-PROFILE.md`, and the new Epic is then gated on a profile belonging to finished work.
>
> The two measurements, neither reasoned:
>
> | When | Pre-roll read | Post-roll read |
> |---|---|---|
> | `M5.E10` open, 2026-08-11 | FEATURE / `light` (`M5.E19-PROFILE.md`) | project **FULL / strict** |
> | `M6.E8` open, 2026-09-07 † | FEATURE / `light` (`M6.E7-PROFILE.md`) | project **FULL / strict** |
>
> The 2026-09-07 run reported a `checkpointed` confirm cadence for an Epic that inherits `attended`,
> and nothing caught it until the dial was audited the next day. These differ in behaviour the phase
> actually branches on, so this is not a cosmetic ordering preference.
>
> ⚠ **† Where that second measurement can be checked, because it is NOT on `main`.** The `M6.E8` DISCUSS
> run lives on the unmerged branch `feat/m6.e8-advisor-ranking-inputs` (`7e9c288`), whose `STATE.md`
> carries `current_epic: M6.E8` and which holds the only `M6.E8-*` artifact on disk. **`main`'s
> `STATE.md` still reads `current_epic: M6.E7` and `CLAUDE.md` still says nothing is in flight** — both
> correct for `main`, and both reasons a reader of this file could reasonably conclude the incident was
> invented. It was not; it was cited from a place the citation did not name. Flagged by the PR reviewer,
> whose objection was right even though its conclusion was not.
>
> **So: if `--epic <name>` was passed, run § *Epic mode* below, THEN return here.** In every other
> invocation this section really is first. `/sig:calibrate` for a per-Epic tier comes after the roll
> too, which means a freshly-calibrated Epic profile is in force for the very phase that wrote it.
>
> ⚠ **The five sibling phase commands were checked and need no equivalent change** (`B93` asks for
> the check explicitly, and a checked-and-declined trigger must be distinguishable from an unchecked
> one — `B39`). `plan.md`, `execute.md`, `verify.md`, `review.md` and `ship.md` all carry this same
> preamble, and **none of them accepts `--epic`** — their `args` is `<phase-number>`. They never roll
> an Epic, so the ordering hazard cannot arise in them. `new-project.md` does take `--epic` and is
> also fine: it has no tier preamble (it *creates* the profile) and its § 1b roll already runs before
> its phase set.

### 0-pre. The two halts run BEFORE the Epic roll — no STATE write may precede a "do not proceed"

⚠ **This split exists because the `B93` reorder created a wedge, caught by the PR reviewer.** Moving
the whole of §0 after the roll put `setCurrentEpic` **and** `transitionPhase(baseDir, 'DISCUSS')` —
both unconditional — ahead of §0's own two halts. The damage on a freshly-`/sig:init`'d project
(valid `STATE.md`, no `PROFILE.md` yet, which is exactly what `init.md` hands to `/sig:calibrate`):
`/sig:discuss --epic M1.E1` rolls the Epic, overwrites `phase: CALIBRATE` with `phase: DISCUSS`, and
*then* prints *"Run `/sig:calibrate` first … Do not proceed."* **There is no `clearCurrentEpic`**
(`state.js` says so in its own source), so `current_epic` is now set permanently and the subsequent
`/sig:calibrate` writes an Epic-scoped `{EpicID}-PROFILE.md` instead of the project `PROFILE.md` —
the halt then fires forever, on every linear-mode command. A halt that damages the project it
refuses to run on is worse than the bug being fixed.

**So run these two, against the PROJECT `PROFILE.md`, before § *Epic mode* touches STATE:**

1. **Is there a `PROFILE.md` at all?** `existsSync(.planning/PROFILE.md)` — halt with *"No PROFILE.md
   found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run
   `/sig:discuss`."* Do not proceed, and **do not roll**.
2. **Is `DISCUSS` in the project profile's `phases_skipped`?** Halt with the message in §0 below. An
   Epic profile can only *narrow* a phase set it has not been written yet to narrow, so the project
   answer is the only one available pre-roll and is the safe one: a false stop costs a re-run, a
   false start costs an unrollable `current_epic`.

Neither reads a tier and neither needs the Epic, which is what makes them safe here. Everything in
§0 that *does* depend on which Epic is live stays in §0, after the roll.

Read the **effective profile** before any other workflow step: `readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`), where `currentEpic` is `current_epic` from STATE.md (via `readState`). In **Epic mode** (a strict `current_epic`) an Epic-scoped `.planning/{EpicID}-PROFILE.md` shadows the project PROFILE for this Epic's phases; in **linear mode** (null / absent / non-strict `current_epic`) it reads `.planning/PROFILE.md` unchanged — byte-identical to pre-E11. Fail-open on the STATE value: a hand-edited or garbage `current_epic` degrades to the project PROFILE, never throws. PROFILE.md drives every phase's behavior; bypassing it defeats the calibration layer.

- **If neither PROFILE.md is present:** `readEffectiveProfile` throws the same not-found error — halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:discuss`."* Do not proceed.
- **If `DISCUSS` is in `phases_skipped`:** exit with *"This tier ({tier}) skips DISCUSS. Run `/sig:plan` next, or `/sig:escalate` if scope has grown and DISCUSS should run."* Do not proceed.
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `attention: unattended` | Auto-advance — present recommendations as a batch, accept all without confirmation. |
| `attention: checkpointed` | Confirm once at the end of Step 4 (batch approval). No per-decision ask. |
| `attention: attended` | Confirm each gray-area decision individually (`gates.confirm_in_phase`) — one `AskUserQuestion` per gray area. |
| `gate_strictness: strict` | Runs the anti-rationalization check at the gate. **That is all `gate_strictness` does to gates** (`v0.1.31`) — it no longer sets confirm cadence. |

Tooling: `tools/lib/profile.js` exposes `readProfile`, `readEffectiveProfile`, `isPhaseEnabled`, and `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question-asking convention: `references/question-patterns.md`.

## Skill Loading

Load these skills from `${CLAUDE_PLUGIN_ROOT}/skills/define/`:
- `idea-refine/SKILL.md` — for structuring and stress-testing the idea
- `spec-driven-development/SKILL.md` — for converting ideas into testable specs

Read each skill file and apply its guidance throughout this phase.

## Mode Selection

Check args or ask the user:
- **discuss** (default): Open-ended exploration of requirements, trade-offs, and gray areas
- **assumptions** (`--assumptions`): For existing codebases — analyze code first, then surface assumptions for validation
- **auto** (`--auto`): Claude picks recommended defaults for all gray areas, user reviews at the end

## Epic mode (`--epic <name>`) — run before **§ 0** and before Step 1 (`B93`)

Epic mode is **opt-in and additive** (M4.5.E11). Without `--epic`, this phase runs in whatever mode STATE already reflects — linear (`current_epic` null) is byte-identical to pre-E11. With `--epic <name>`, this DISCUSS opens (or rolls to) an Epic **before** loading context, so `current_epic` is written automatically (no hand-editing STATE) and every artifact this phase writes is Epic-scoped (`{EpicID}-*.md`, per the artifact-naming rule).

Resolve the Epic ID from `<name>`:
- If `<name>` is already a strict Epic ID (matches `EPIC_ID_STRICT_RE` from `tools/lib/state.js`, e.g. `M5.E1` — typically the first Epic of a new milestone), use it verbatim.
- Otherwise treat `<name>` as a human label and derive the next ID under the current milestone with `deriveNextEpicId(baseDir)` (`tools/lib/milestones.js`). If it returns `null` (no milestone context — e.g. a project with no prior Epic), ask the user for the milestone and retry as `deriveNextEpicId(baseDir, { milestone })`, or accept a literal `--epic M{N}.E{K}` ID.

Then call `setCurrentEpic(baseDir, resolvedId)` (`tools/lib/state.js`) — it validates the shape, writes `current_epic`, and on a roll resets the coupled `current_wave`/`current_tasks` **and the per-Epic `phase`/`completed_phases`/`last_completed_task`** atomically (B9, M5.E2.S1.t0): a new Epic never inherits the previous one's phase progression, so it leaves `phase: null`. **Set the DISCUSS phase next** — `transitionPhase(baseDir, 'DISCUSS')` — which, because `phase` is null post-roll, records a clean per-Epic `completed_phases` (no stale prior-Epic phase leaks in). `blockers` are preserved (a blocker can span Epics). Record the human label alongside the resolved ID in `CONTEXT.md` so later phases can show it.

**Per-Epic tier (optional, M4.5.E11 / FR3).** After opening the Epic, offer to calibrate it: if this Epic should run at a different tier than the project (e.g. a SKETCH spike inside a FULL project, or a FULL security Epic inside a FEATURE project), run `/sig:calibrate` for it — with an Epic active, calibrate writes `.planning/{EpicID}-PROFILE.md`, which `readEffectiveProfile` then honors **for this Epic's phases only**. Skip it and the Epic inherits the project PROFILE (the default). Either way, every phase's gate-read uses the effective profile — Epic PROFILE if present, else project — so the tier is never ambiguous.

**Done-Epic guard.** Call `isEpicDone(baseDir, current_epic)` (`tools/lib/retrospective.js`). It returns **three** answers, not a boolean — `{status: 'done' | 'not-done' | 'cannot-evaluate'}` — and the rule is: **proceed only on a clean `not-done`.** On `done` (a **complete** retrospective is on disk) or on `cannot-evaluate` (the unit id is not a strict Epic ID, so this project names its units by another convention and closure cannot be read from here), **halt** unless `--epic <name>` was passed. `--epic` is the escape hatch and it always works: with it, DISCUSS opens the named unit normally, so a linear project is never locked out. **`cannot-evaluate` is not permission to proceed** — collapsing it into "not done" is `B72`, and it is why this guard never once fired on the 8-of-12 real projects that are not in Epic mode. Note `done` requires a *complete* retro: a **stub** still holding `[FILL IN]` placeholders reads as `not-done`, because the file existing is not the unit being finished. Never silently re-run DISCUSS into a completed Epic's artifacts (it would clobber `{EpicID}-REQUIREMENTS.md`); when you halt, print the returned `reason` so the user knows which of the two halts they hit.

⚠ **NOW go back and run § 0 — after everything above, not after the roll** (`B93`).

The tier gate must read the profile of the Epic this phase is about to run, which only exists as
`current_epic` once `setCurrentEpic` has been called. **The placement inside this section matters as
much as the reorder:**

- After the **per-Epic tier** step, or a `{EpicID}-PROFILE.md` that `/sig:calibrate` just wrote is not
  yet on disk when §0 reads it — `B93` one step downstream, which is what an earlier draft of this
  file did.
- After the **Done-Epic guard**, or a halt that exists to stop a run gets evaluated *after* the gate
  it was meant to precede.

**The full order, naming every section it passes through — because a three-item sentence here
silently skipped two of them** (PR reviewer, second pass):

1. **§ 0-pre** — the two halts. No STATE write yet.
2. **§ Epic mode** — this section, to completion: resolve, `setCurrentEpic`, `transitionPhase`,
   per-Epic tier, Done-Epic guard.
3. **§ 0** — the tier gate, now reading the profile of the Epic that is actually live.
4. **§ Skill Loading** — `idea-refine` + `spec-driven-development`. Skipped by an agent that jumps
   from § 0 straight to Step 1, and then the phase runs with neither skill loaded.
5. **§ Mode Selection** — resolve `--auto` / `--assumptions`. Skipped the same way, and the failure is
   silent: it defaults to interactive.
6. **§ Workflow**, Step 1 onward.

⚠ **§ Epic mode is entered ONCE and never re-entered.** Reading "return to § 0 and continue top-down"
as *resume from the top of the file* walks back into this section, where `deriveNextEpicId` now
derives off the `current_epic` just written and `setCurrentEpic` rolls again — `M6.E8` becomes
`M6.E9`, a phantom Epic, and the real one is abandoned mid-phase. If step 2 has run, step 2 is done.


## Workflow

**Artifact naming (M4.5.E11).** In **Epic mode** (a strict `current_epic`) write REQUIREMENTS via `artifactName('REQUIREMENTS', { currentEpic })` (`tools/lib/resume.js`) → `{EpicID}-REQUIREMENTS.md`; in **linear mode** it stays `REQUIREMENTS.md`, byte-identical to pre-E11. `CONTEXT.md` is a project-level running doc — **never** Epic-prefixed, in either mode.

### 1. Load Prior Context

Read from `.planning/`:
- `PROJECT.md` — the project spec
- `PROFILE.md` — tier + rigor overrides from /sig:calibrate
- `STATE.md` — current state
- Any existing `CONTEXT.md` files from prior phases

### 2. Scout Codebase (if existing code)

If there's an existing codebase, scan it to understand:
- Tech stack and frameworks
- Existing patterns and conventions
- Reusable assets
- Integration points

### 3. Identify Gray Areas

Based on PROJECT.md and codebase analysis, identify decisions that aren't yet locked:
- Architecture choices (monolith vs services, framework selection)
- Data model design
- Authentication/authorization approach
- Third-party integrations
- Deployment strategy
- Testing strategy

### 4. Structured Discussion

For each gray area, render the question via `AskUserQuestion` per `references/question-patterns.md` § Rendering. **One `AskUserQuestion` call per gray area — never bundle multiple gray areas into a single markdown response.** Wall-of-text bundling forces the user to scroll, track state mentally, and answer in unstructured prose; it defeats the point of a structured ask.

For each call:

1. **`header`** — the one-line ask for this gray area.
2. **`options`** — exactly three named options. Each option's `description` carries: a one-line summary, a "Pick this if:" trade-off naming a real cost or benefit, and (on the recommended option) a "(recommended — {one-line rationale})" note. Force a third option if only two are natural (e.g., "do nothing for now" / "defer to PLAN") so the user sees the do-nothing trade-off explicitly.
3. **`multiSelect: false`.** The tool auto-adds "Other."
4. **On "Other"** — accept the user's free-text reply at the next plain-prompt turn (don't issue another `AskUserQuestion`). Write the verbatim reasoning to `CONTEXT.md` "Locked Decisions" so future phases see *why* the user went off-pattern.
5. **Lock the decision** before moving to the next gray area.

In `--auto` mode: select the recommended option for every gray area without invoking `AskUserQuestion`. Log each auto-pick to STDOUT and write to `CONTEXT.md`. Then ask once at the end for batch approval (plain prompt, not `AskUserQuestion`).

**`attention` from the effective profile modulates this**, not `gate_strictness` (`B108`): `unattended` → batch-approve at end (`--auto` shape); `checkpointed` → confirm once at the end; `attended` → confirm each decision individually as it is made, one `AskUserQuestion` per gray area. Read it from the expanded config as **`gates.confirm_in_phase`** (true only at `attended`) rather than re-deriving it here — `applyRigorOverrides` already computed it, and a second derivation is how two dials drift apart.

### 5. Capture Decisions

Write all locked decisions to `.planning/CONTEXT.md`:
```markdown
# Implementation Context

## Locked Decisions
{numbered list of decisions with rationale}

## Deferred Decisions
{decisions explicitly pushed to later phases}

## Assumptions
{assumptions that need validation during EXECUTE}

## Last Updated
{current_date}
```

### 6. Generate Requirements

If the discussion surface enough detail, generate the REQUIREMENTS artifact (`artifactName('REQUIREMENTS', { currentEpic })` — `REQUIREMENTS.md` linear / `{EpicID}-REQUIREMENTS.md` Epic) with:
- Functional requirements (what it must do)
- Non-functional requirements (performance, security, accessibility)
- Acceptance criteria for each requirement

**Tier-aware NFR prompt.** Before finalizing REQUIREMENTS.md, check what the tier expects users to think about — production-shaped projects often need NFRs that less-experienced users would miss:

| Tier | NFR prompt — surface and confirm or explicitly defer |
|---|---|
| FULL | Ask: "Have we covered — health/liveness probe, graceful shutdown signal handling, structured request logging, security headers (CSP/HSTS/X-Content-Type-Options), and rate limiting if exposed publicly?" Each item: in-scope, deferred-with-rationale, or N/A. |
| FEATURE | Ask: "Have we covered — error handling at boundaries, log lines for failures, basic input validation?" |
| SPIKE | Skip — exploratory work doesn't need ops hygiene. |
| SKETCH | Skip — one-shot work. |

**Blast radius — ask at FULL and FEATURE; skip at SPIKE and SKETCH.** Alongside the NFR prompt, ask: *"What does this change touch that we are not changing — callers, stored data, published artifacts, anything downstream already consuming it?"* Record the answer in REQUIREMENTS.md next to the NFRs. **Not already covered by calibration:** `reversibility` is one of the five `/sig:calibrate` questions, but it tiers the **project**; this is the same question at the altitude of **one change**, and nothing else in the six phases asks it. The knowledge to act on the answer already lives in the `incremental-implementation`, `ci-cd-and-automation` and `shipping-and-launch` skills — the gap was that no phase asked. Pairs with `ship.md`'s rollback line, which asks the other half at the other end.

**Outcome oracle — ask at FULL and FEATURE; skip at SPIKE and SKETCH.** Alongside the two prompts above, ask: *"How will we know this worked?"* Write the answer into REQUIREMENTS.md under a `## Outcome` heading.

**This is not the acceptance criteria you already have.** Those are a **completion** oracle — they say when the thing is *built*. This is an **outcome** oracle: how you would know it *worked*, in use. Work can satisfy every acceptance criterion and change nothing anyone cares about, and without the question the agent makes that product call by default — the standing *"gate at product altitude"* norm arriving as an input rather than an interrupt.

> ⚠ **"No outcome metric, and here is why" is a VALID answer, and for tooling it is usually the honest one.** Say so out loud when you ask. For infrastructure work an outcome metric frequently does not exist, and **a gate that cannot be satisfied honestly is a gate that gets rationalized past** — the anti-rationalization failure arriving by way of the mechanism built to prevent it. What keeps the hatch from swallowing the gate is not refusing it but requiring the **reason** to be substantive: `checkOutcomeOracle` fails an unexplained decline (`N/A`, `none`, a bare "not applicable") and passes a one-sentence explanation. Present-but-vacuous fails, not merely present-but-empty (`M5.E10`'s rule, one artifact over).

Verify with `checkOutcomeOracle(requirementsContent, tier)` from `tools/lib/outcome-oracle.js`. It returns `metric`, `declined-with-reason`, `not-required` (ok) or `missing` / `empty` / `vacuous` (not ok, each with a message naming the fix). ⚠ **It reads tokens, not meaning** — a metric nobody will look at, or a fluent reason that is untrue, passes. Same published limit as `M5.E10`'s checks and `B75`'s ask record.

For FULL specifically, REQUIREMENTS.md is effectively mandatory (strict Nyquist in PLAN needs acceptance criteria to map tests against). For SKETCH, REQUIREMENTS.md is usually unnecessary — PROJECT.md "Done when" carries the same weight.

## Phase Gate

Before transitioning to PLAN, verify:

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "We can figure out the details during planning" | Are there unresolved gray areas that will block the planner? |
| "The requirements are obvious" | Has every requirement been explicitly stated with acceptance criteria? |
| "We don't need a spec for something this simple" | Even simple projects benefit from explicit scope boundaries |
| "The user seems impatient, let's move on" | Rushing DISCUSS creates compounding problems in every downstream phase |

### Exit Criteria
- [ ] PROJECT.md is complete and approved
- [ ] CONTEXT.md captures all locked decisions
- [ ] REQUIREMENTS.md exists with acceptance criteria
- [ ] **At FULL and FEATURE:** `checkOutcomeOracle(requirementsContent, tier)` returns `ok` — a stated measure, or a decline with a substantive reason. Skipped at SPIKE and SKETCH, where it returns `not-required`.
- [ ] No unresolved gray areas that would block PLAN
- [ ] User explicitly approves transition to PLAN — **when `gates.confirm_discuss` is set** (`attention` ≠ `unattended`). Unattended: no ask; the transition is recorded, not approved (`B74`).

**Do NOT set `phase: PLAN` here** (M5.E13, `B51`). `/sig:plan` performs its own at-entry `transitionPhase` — since M5.E9 the **incoming** command advances the phase, not the outgoing one. This file used to instruct the DISCUSS close to set it too, and both instructions survived the change. Obeying both makes `/sig:plan`'s at-entry call resolve the phase being *left* as **PLAN** and append `PLAN (date)` **before PLAN has run**; `completed_phases` is deliberately append-only with no dedupe (D-M5E9-5), so that false entry is permanent.

The stale block was wrong twice over: the **convention** (outgoing-sets-phase, superseded by M5.E9) and the **file format** — it showed `## Current Phase` / `## Completed Phases` markdown headings, which predate `schema_version: 1` and mean nothing to `parseFrontmatter`. An agent obeying it literally appended dead markdown to STATE.md's body.

DISCUSS's own close is recorded by `/sig:plan` when it transitions in. Nothing to write here.

### Mark STATE.md fresh (M4.5.E10.S1.t5, FR3)

**SKETCH tier:** skip this step. STATE.md updates only via manual `/sig:checkpoint`.

**FEATURE/SPIKE/FULL:** after the DISCUSS artifacts (PROJECT.md / CONTEXT.md / REQUIREMENTS.md) are committed, call `markFresh(baseDir, {commit: <git HEAD>})` from `tools/lib/state.js`. This advances `last_updated` + `last_updated_commit` to the phase-close commit so the staleness banner in `/sig:resume` reads fresh after DISCUSS. Run it **after** the commit — passing a pre-commit HEAD records a stale sha and silently defeats the freshness check (AC3.4).

Wrap the call in a **catch-all**: if `markFresh` throws for *any* reason — `StateSchemaError` on a schema-mismatched STATE.md, `StateWriteError` on lock contention, git unavailable — warn and continue. The phase work is done; a state-write blip is a recovery item, not a DISCUSS failure. (Mirrors verify/review/ship; a bare git/lock guard is not enough — `markFresh` can throw `StateSchemaError` too.)
