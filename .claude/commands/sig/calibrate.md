---
name: sig:calibrate
description: "Phase 0 — classify project into SKETCH / FEATURE / SPIKE / FULL and write .planning/PROFILE.md to drive downstream rigor."
args: "[--re-calibrate]"
---

# CALIBRATE Phase (Phase 0)

You are running Phase 0 of the Signal workflow. Your goal: classify the project into one of four tiers (SKETCH / FEATURE / SPIKE / FULL) via 5 diagnostic questions, then write `.planning/PROFILE.md`. Every downstream phase command reads this file as its first action, so the profile must be complete and schema-conformant.

No skills are loaded, no agents are spawned. This is the smallest command in the plugin — ask, derive, write.

Authoritative references (read if you need to refresh):
- `${CLAUDE_PLUGIN_ROOT}/references/profile-schema.md` — PROFILE.md format + validation rules
- `${CLAUDE_PLUGIN_ROOT}/references/tier-definitions.md` — tier-to-defaults mapping

## Workflow

### 1. Pre-flight — detect project state, then branch

Scan `.planning/` to identify which scenario applies before doing anything else.

**Scenario A — No `.planning/` directory.**

Before asking, detect which sub-case applies by checking the working directory:

- **Likely brownfield** — `.git/` exists AND `git rev-list --count HEAD` ≥ 1 AND there are tracked source files (use `git ls-files | head -20` to spot-check). The project has code and history but no Signal touch yet.
- **Likely greenfield** — no `.git/` OR no commits OR no tracked source files. The project is fresh / pre-code.

Then ask using the 3-options-plus-other shape (per `references/question-patterns.md`). **Render via `AskUserQuestion(multiSelect: false)` per § Rendering — the markdown shape below describes the option content (header + per-option name / description / "Pick this if" / recommendation marker), not literal output to print.**

```
I don't see a `.planning/` directory here.

Three options:

A. Brownfield codebase — existing code, no Signal yet
   Run /sig:init first to scan the codebase, generate a LANDSCAPE.md ("lay of the land"
   from your code), and a baseline PROJECT.md. Then come back here to calibrate.
   Pick this if: you have existing source code with git history and you want Signal
   applied to it. /sig:init removes the friction of reverse-engineering Signal's
   mental model onto an established codebase.

B. Brand-new project — no code yet
   Run /sig:new-project first to set up the project spec (PROJECT.md), then come
   back here to calibrate.
   Pick this if: this is a fresh project where you haven't written code yet —
   /sig:new-project asks you 5 questions to capture vision/scope/done-when.

C. Wrong directory — cancel
   Exit without changes. You may have cd'd somewhere unexpected.
   Pick this if: you don't recognize this directory or didn't mean to run a Signal
   command here.

Recommendation: {if "Likely brownfield" detected → "A — your codebase has git
history and source files; /sig:init will make calibration much sharper."}
                {else if "Likely greenfield" detected → "B — this looks like a
fresh directory with no code yet; /sig:new-project is the entry point."}

If none of these fit, describe what you're trying to do and I'll work from there.
```

Do not auto-create `.planning/` without confirmation — under-tiering a project because the user is in the wrong directory is the failure mode this scenario exists to prevent.

If the user picks A, exit calibrate and instruct them to run `/sig:init`. If they pick B, exit calibrate and instruct them to run `/sig:new-project`. If they pick C, exit cleanly. If they pick "other," capture their reasoning verbatim and proceed only if their stated intent is unambiguously "calibrate this codebase standalone without /sig:init or /sig:new-project."

**Scenario B — `.planning/PROJECT.md` exists, no `PROFILE.md`.**
This is the happy path — a first-time calibration. Proceed to step 2.

**Scenario C — `.planning/PROFILE.md` already exists.**
The user is doing one of: (i) resuming in-flight work, (ii) adjusting tier because scope grew, (iii) starting over, or (iv) adding a new feature to an already-calibrated project.

If `--re-calibrate` was **not** passed, refuse with:

```
PROFILE.md already exists (tier: {TIER}, last calibrated {DATE}).

Pick the right tool for what you're doing:
- Resuming work on the existing scope? Read .planning/STATE.md for current phase.
  (A dedicated /sig:status and /sig:resume are on the roadmap — Tranche 3. For
   now, `cat .planning/STATE.md` gives you the snapshot.)
- Scope grew, need more rigor? Run /sig:escalate to promote tier and log why.
- Starting over from scratch? Run /sig:calibrate --re-calibrate (overwrites
  PROFILE.md, but escalation_history is preserved).
- Adding a new feature to an already-calibrated project? v1 doesn't yet have
  first-class support for this. Either use the existing tier (if the new
  feature fits it) or run /sig:calibrate --re-calibrate if the risk profile
  is materially different. Multi-feature lifecycle is logged in
  .planning/FUTURE-IDEAS.md for post-v1 design work.
```

If `--re-calibrate` **was** passed:
- Read the old PROFILE.md first.
- **Preserve `metadata.escalation_history`** — carry it forward into the new profile. Never wipe it.
- Append a synthetic entry to the history recording the re-calibration (so future reviewers see the decision trail): `{from_tier: <old>, to_tier: <new>, timestamp: <now>, reason: "re-calibrated from scratch via --re-calibrate", backfill_warnings: [...]}`.
- Proceed with the 5 questions.

### 1b. `.gitignore` check (applies to all scenarios)

Signal's architecture requires `.planning/` to be tracked in git — it's the project's memory, not scratch state. Search the repo-root `.gitignore` (and any nested `.gitignore` above `.planning/`) for lines that would ignore `.planning/` (e.g., `.planning`, `.planning/`, `/.planning/`, `**/.planning/`).
- If found: warn the user, explain why `.planning/` must be tracked, and offer to remove the offending line. Do not proceed until the user confirms removal or explicitly overrides (and log the override in the PROFILE.md body).
- If clean: proceed silently.

### 2. Ask the 5 diagnostic questions

Ask one at a time. **Render each question via `AskUserQuestion(multiSelect: false)` per `references/question-patterns.md` § Rendering** — the markdown below describes the per-option `description` content. Use the **exact enum values** below as option labels — no synonyms, no free text. The tool's auto-added "Other" choice should be treated as a request to restate the question (strict-enum rule); re-issue the same `AskUserQuestion` call.

1. **Scope** — How big is this work?
   - `throwaway` — one-shot, will be deleted
   - `feature` — a single feature in a larger system
   - `subsystem` — a whole subsystem (auth, billing, ingestion, etc.)
   - `product` — a standalone product or major release

2. **Stakes** — If it breaks in production, what happens?
   - `none` — nobody notices
   - `minor` — inconvenience; easy to recover
   - `major` — real user pain or revenue loss
   - `catastrophic` — user harm, data loss, legal/financial exposure

3. **Novelty** — How much prior experience do you have with this kind of work?
   - `familiar` — done it many times
   - `rare` — done it occasionally
   - `first-for-org` — first time for this team/org
   - `first-in-industry` — genuinely novel; no prior art to lean on

4. **Reversibility** — If the approach turns out wrong, how costly is undoing it?
   - `trivial` — delete and redo in an hour
   - `moderate` — a day or two of rework
   - `painful` — weeks of migration
   - `irreversible` — cannot undo (published API, shipped data model, etc.)

5. **Horizon** — How long will this output live?
   - `hours` — today only
   - `days` — this sprint
   - `months` — a release cycle or two
   - `years` — long-lived core infrastructure

### 3. Derive the tier

Apply these rules **in order**. First match wins.

1. **FULL** if any one of:
   - `stakes: catastrophic`, OR
   - `reversibility: irreversible`, OR
   - `horizon: years`.
2. Else **SPIKE** if **all** of:
   - `stakes` in `{none, minor}`, AND
   - `novelty` in `{first-for-org, first-in-industry}`, AND
   - `horizon` in `{hours, days}`, AND
   - `scope` in `{throwaway, feature}`.
3. Else **SKETCH** if **all** of:
   - `scope: throwaway`, AND
   - `stakes: none`, AND
   - `reversibility: trivial`, AND
   - `horizon` in `{hours, days}`.
4. Else **FEATURE** (the default — most work lands here).

### 4. Show tier + defaults, get confirmation

Present the derived tier, the reasoning (which rule fired, citing the triggering answer), and the defaults that will be written. Use this table to show the user what rigor they're getting:

| Override | SKETCH | FEATURE | SPIKE | FULL |
|---|---|---|---|---|
| `tdd_required` | `false` | `true` | `false` | `true` |
| `security_audit` | `none` | `basic` | `none` | `full` |
| `performance_pass` | `false` | `true` | `false` | `true` |
| `simplification_pass` | `false` | `true` | `false` | `true` |
| `nyquist_enforcement` | `off` | `basic` | `off` | `strict` |
| `plan_validation_dims` | `none` | `core` | `none` | `all` |
| `research_parallelism` | `0` | `2` | `2` | `4` |[^rp]
| `gate_strictness` | `off` | `light` | `light` | `strict` |
| `context_rot_reread` | `false` | `true` | `false` | `true` |
| `review_depth` | `none` | `quality-only` | `none` | `full` |
| `phases_skipped` | `[REVIEW]` | `[]` | `[REVIEW, SHIP]` | `[]` |

[^rp]: `research_parallelism: 4` (FULL) assumes the domain has enough surface that 4 distinct angles each return non-redundant signal. For well-trodden domains (e.g., URL shorteners, CRUD APIs, common framework patterns), the 4 agents tend to overlap; consider downward-overriding to 2 in the override step below. The token cost of 4 vs 2 agents is ~30K tokens, which adds up across phases.

Ask: **"Derived tier is {TIER}. Accept, or override?"**

**Override handling — two cases, different treatment:**

- **Downward override** (user forces a *lower* tier — e.g., SKETCH on what calibrated FULL). Warn clearly. Name the specific escalator that fired (`stakes: catastrophic`, `reversibility: irreversible`, or `horizon: years`) so the user is staring at the exact reason Signal recommended FULL. Under-tiering is the failure mode Signal exists to prevent — surface the risk before accepting. Accept on explicit confirmation; record the override and the user's stated reasoning in the PROFILE.md body.

- **Upward override** (user forces a *higher* tier — e.g., FULL on what calibrated FEATURE, the cautious-overshoot case). **Brief confirm with implications.** Briefly enumerate what changes: more phases run (e.g., REVIEW always fires), deeper rigor (full security audit, all 8 plan-validation dimensions, 4 research agents instead of 2, strict gates with anti-rationalization checks at every phase). State the trade plainly: over-tiering doesn't hide risk, but it does cost real time and tokens — typical FULL-vs-FEATURE delta on a small feature is hours, not minutes. Accept on confirmation; record the override in the PROFILE.md body.

In both cases, Signal's job is to surface the signal, not to dictate. Once the user understands what they're choosing, accept the choice.

### 5. Write `.planning/PROFILE.md`

Write the file literally — do not reference the tier-definitions table at runtime, inline the values. Use this shape:

```markdown
---
tier: {TIER}
schema_version: 1

calibration:
  scope: {scope_answer}
  stakes: {stakes_answer}
  novelty: {novelty_answer}
  reversibility: {reversibility_answer}
  horizon: {horizon_answer}

phases_skipped: {phases_skipped_literal}

rigor_overrides:
  tdd_required: {value}
  security_audit: {value}
  performance_pass: {value}
  simplification_pass: {value}
  nyquist_enforcement: {value}
  plan_validation_dims: {value}
  research_parallelism: {value}
  gate_strictness: {value}
  context_rot_reread: {value}
  review_depth: {value}

metadata:
  created_at: {ISO-8601 timestamp, current UTC, with trailing Z}
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

{1–3 sentences: what kind of project this is, which tier fired and why (cite the specific answer that triggered the tier rule), and anything notable about the override or gitignore handling.}

## Notes

- {Optional bullets: user overrides, gitignore adjustments, context for future `/sig:escalate` runs.}
```

**Values per tier** — write these literally, not by reference:

- **SKETCH:** `tdd_required: false`, `security_audit: none`, `performance_pass: false`, `simplification_pass: false`, `nyquist_enforcement: off`, `plan_validation_dims: none`, `research_parallelism: 0`, `gate_strictness: off`, `context_rot_reread: false`, `review_depth: none`. `phases_skipped: [REVIEW]`.
- **FEATURE:** `tdd_required: true`, `security_audit: basic`, `performance_pass: true`, `simplification_pass: true`, `nyquist_enforcement: basic`, `plan_validation_dims: core`, `research_parallelism: 2`, `gate_strictness: light`, `context_rot_reread: true`, `review_depth: quality-only`. `phases_skipped: []`.
- **SPIKE:** `tdd_required: false`, `security_audit: none`, `performance_pass: false`, `simplification_pass: false`, `nyquist_enforcement: off`, `plan_validation_dims: none`, `research_parallelism: 2`, `gate_strictness: light`, `context_rot_reread: false`, `review_depth: none`. `phases_skipped: [REVIEW, SHIP]`.
- **FULL:** `tdd_required: true`, `security_audit: full`, `performance_pass: true`, `simplification_pass: true`, `nyquist_enforcement: strict`, `plan_validation_dims: all`, `research_parallelism: 4`, `gate_strictness: strict`, `context_rot_reread: true`, `review_depth: full`. `phases_skipped: []`.

**Validate before writing:**
- `tier` is one of `SKETCH | FEATURE | SPIKE | FULL`.
- All 5 `calibration` fields present with valid enum values.
- All 10 `rigor_overrides` keys present with correct types.
- `phases_skipped` is a YAML array using the valid phase names (`DISCUSS`, `PLAN`, `EXECUTE`, `VERIFY`, `REVIEW`, `SHIP`).
- `created_at` is ISO-8601 UTC.

### 5b. Initialize `.planning/STATE.md` (if absent)

After PROFILE.md is written, ensure STATE.md exists with `Current Phase: DISCUSS`. `/sig:new-project` initializes STATE.md to `CALIBRATE`; calibrate then transitions it. **If calibrate runs standalone (no prior `/sig:new-project`), STATE.md may be missing** — and downstream phases (especially `transitionPhase`) will fail without it.

Programmatic equivalent: `await initState(baseDir, 'DISCUSS')` from `tools/lib/state.js`. If STATE.md already exists, leave it alone (idempotent — `initState` overwrites, but that's fine on a clean post-calibrate path because the state should be `DISCUSS` anyway).

### 6. Print next-step message

Exactly:

```
Profile written to .planning/PROFILE.md — tier: {TIER}.

Next: /sig:discuss to continue the workflow.
Later: /sig:escalate if scope changes and rigor needs to shift.
```

If the derived tier was one that skips phases (SKETCH skips REVIEW; SPIKE skips REVIEW + SHIP), include a one-liner noting which phases will be skipped and that `/sig:escalate` is the way to re-enable them.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "I know this is a FULL project, skip the questions." | Answer all 5 anyway — each dimension catches details you may have skipped. Over-confident skipping is how "FULL" projects accidentally under-audit reversibility or novelty. |
| "This feels like SKETCH but I should say FEATURE to be safe." | Over-tiering IS the failure mode Signal exists to prevent. If the answers honestly derive to SKETCH, trust SKETCH — you can always `/sig:escalate` later. Under-tiering is recoverable; over-tiering wastes days on ceremony. |
| "The user said to skip the .gitignore check." | Don't. Without the check, `.planning/` gets silently ignored on clone and the project's memory is lost. Non-negotiable. Surface it, then let the user decide — but always surface it. |
| "Writing all 10 rigor_overrides is verbose; I'll just note the tier." | No. Downstream commands read the literal values, not the tier. A partial profile breaks every phase command's first action. Write all 10. |

## Gate: Calibration Complete

- [ ] `.planning/PROFILE.md` exists
- [ ] YAML frontmatter parses (all 5 `calibration` fields, all 10 `rigor_overrides`, `phases_skipped` array, `metadata` block)
- [ ] Tier matches the derivation (or override is documented in body)
- [ ] `.gitignore` does not ignore `.planning/`
- [ ] User has seen the tier summary and next-step message
