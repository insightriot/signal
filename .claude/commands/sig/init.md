---
name: sig:init
description: "Brownfield onboarding — bring Signal to an existing codebase. Scans the repo, writes .planning/LANDSCAPE.md, drafts a baseline PROJECT.md, then hands off to /sig:calibrate."
---

# `/sig:init` — Brownfield Onboarding

You are running `/sig:init`, the entry-point command for bringing Signal to an **existing codebase** that wasn't built with Signal. Same class as `/sig:new-project`, `/sig:calibrate`, `/sig:escalate`, `/sig:status`, `/sig:resume` — meta command, **no tier-gating preamble** (no PROFILE.md exists yet), no skill loading at the command level (scanner agents may load their own).

Where `/sig:new-project` is "starting fresh" and `/sig:resume` is "coming back," `/sig:init` is "I have a codebase already and I want Signal applied to it." It produces a `.planning/LANDSCAPE.md` ("lay of the land" derived from the code itself) plus a baseline `.planning/PROJECT.md` with explicit `[INFERRED]` / `[FILL IN]` markers, then transitions into Phase 0 (CALIBRATE).

Authoritative references (read if you need to refresh):
- `${CLAUDE_PLUGIN_ROOT}/references/profile-schema.md` — PROFILE.md format (relevant to handoff)
- `${CLAUDE_PLUGIN_ROOT}/references/question-patterns.md` — strict enum / 3+other / open-ended conventions (Step 1's ambiguous case + Step 5 use 3+other)
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `initState`, `PHASES`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/profile.js` — `readProfile`, `ProfileSchemaError`

## Workflow

### 1. Pre-flight — detect repo state, then branch

Scan the working directory before any writes. Determine which of five states applies. Order matters: each check assumes the prior ones passed.

#### 1.1 Already-Signalized?

Try `readProfile(baseDir)`. If it succeeds (PROFILE.md exists and validates), this project has already been Signal-ized. Emit and exit:

```
This project is already calibrated (tier: {profile.tier}, last calibrated {YYYY-MM-DD from profile.metadata.created_at}).

/sig:init is for bringing Signal to a fresh existing codebase, not for re-onboarding.

Pick the right tool:
- Resuming work? Run /sig:resume for a project briefing.
- Status check? Run /sig:status for a one-screen snapshot.
- Scope grew, need more rigor? Run /sig:escalate.
- Genuinely starting over? Run /sig:calibrate --re-calibrate to rewrite PROFILE.md
  (preserves escalation_history).
```

If `readProfile` throws because PROFILE.md is malformed (`ProfileSchemaError` not containing "not found"), surface the error and refuse:

```
PROFILE.md exists at .planning/PROFILE.md but is malformed: {err.message}

/sig:init won't overwrite a malformed profile — fix it manually or run
/sig:calibrate --re-calibrate to rewrite cleanly.
```

#### 1.2 No `.git/`?

Check for the existence of `.git/` (directory or file — git worktrees use a `.git` file pointer). If absent:

```
This directory isn't a git repository. Signal requires git — `.planning/` is the
project's institutional memory and must be tracked alongside the code.

Run `git init` here first (and consider `git add . && git commit -m "initial commit"`
to capture current state), then re-run /sig:init.

If you're in the wrong directory, cd to the project root and try again.
```

Exit. Do **not** auto-run `git init` — the user might be in the wrong directory, or have a specific git ceremony (initial commit conventions, default branch name, etc.) they want to do by hand.

#### 1.3 Genuinely empty repo?

Run `git rev-list --count HEAD 2>/dev/null` (count of commits). If `0` or the command errors (no commits yet), check `git ls-files | wc -l` (count of tracked files). If both are zero **and** the working tree contains no obvious source files (no `*.js`, `*.ts`, `*.py`, `*.rs`, `*.go`, `*.rb`, `*.java`, etc., and no top-level package manifest), the repo is genuinely empty:

```
This repo has no commits and no source files yet — it's empty.

/sig:init is for *existing* codebases. For a fresh project where you haven't
written code yet, run /sig:new-project — it'll set up Signal's project spec
(PROJECT.md) and route you straight into /sig:calibrate.
```

Exit.

(Heuristic note: if there's a `README.md` and a `LICENSE` but no source files, still treat as empty — README + LICENSE alone don't constitute a codebase to scan.)

#### 1.4 `.planning/` exists but no `PROFILE.md`?

If `.planning/` directory exists but `readProfile` threw with `not found` — this is the ambiguous case. Could be a partial init that crashed, an abandoned attempt, or a hand-rolled `.planning/` (like Signal's own bootstrap directory). **Halt and ask** using a 3+other pattern (per `references/question-patterns.md`):

```
.planning/ exists but no PROFILE.md was found. This is ambiguous — could be a
partial /sig:init that didn't finish, an abandoned attempt, or a hand-rolled
.planning/ from another workflow.

Three options:

A. Continue init from existing .planning/
   Use whatever's already there as a starting point; don't overwrite existing files.
   New artifacts (LANDSCAPE.md, PROJECT.md drafted from scan) get written; existing
   ones are left in place.
   Pick this if: a previous /sig:init was interrupted; the directory has partial
   work you want to preserve.

B. Start over — delete .planning/ and recreate
   Wipe the existing directory and start init fresh. **Destructive** — anything
   in .planning/ that isn't in git is lost.
   Pick this if: the existing .planning/ is from a different abandoned project or
   experiment, you've checked git history, and confirmed nothing is worth keeping.

C. Cancel — investigate first
   Exit without changes. Inspect .planning/ yourself (cat the files, check git log)
   and re-run /sig:init when you've decided.
   Pick this if: you don't recognize what's in .planning/, or you want to be sure
   before any destructive action.

Recommendation: C. Partial state is rare-but-load-bearing — when in doubt,
inspect first. Cost of cancelling is one re-run; cost of an unintended wipe
is irrecoverable.

If none of these fit, describe what you'd prefer and I'll work from there
(your reasoning will be captured in PROJECT.md notes).
```

If the user picks B, **always** confirm explicitly before deleting (`rm -rf .planning/` is destructive; auto-mode does not authorize it). Treat the destructive action like the `git push --force` class — explicit user "yes, delete" required even after they pick B.

If the user picks C, exit cleanly with no writes.

If the user picks A, proceed but skip writes for any artifact already present (Step 4 / Step 6 must respect existing files).

#### 1.5 Happy path — brownfield codebase, no `.planning/`

If none of 1.1–1.4 fired, this is the canonical brownfield case: an existing codebase with git history, source files, no prior Signal touch. Proceed to Step 1b.

### 1b. `.gitignore` check (applies to all non-exit paths)

Same rule as `/sig:new-project` and `/sig:calibrate`. Search the repo-root `.gitignore` (and any nested `.gitignore` above the working directory) for lines that would ignore `.planning/` (e.g., `.planning`, `.planning/`, `/.planning/`, `**/.planning/`).

- **If found:** halt before any writes. Tell the user that `.planning/` must be tracked, explain why (project's institutional memory — state, decisions, plans, verification reports — is lost on clone if ignored), and offer to remove the offending line. Do not proceed until the user confirms removal or explicitly overrides (and log the override in the eventual PROJECT.md body so future sessions see it).
- **If clean:** proceed silently.

This check is non-negotiable. It's the same contract every Signal entry-point command enforces.

### 2. Codebase scan (parallel scanners)

> **Status: T4.2–T4.5 — not yet implemented in this skeleton.**
>
> When implemented, this step will spawn up to 4 parallel scanner agents (stack / structure / activity / quality) per the TRANCHE-4 spec. Each scanner is read-only; results merge into the LANDSCAPE.md draft in Step 3. Scanner count is tier-aware (FULL = 4, FEATURE = 4, SPIKE = 2, SKETCH = 2) — but `/sig:init` runs *before* calibration, so default to 4 unless future work surfaces a way to pre-tier from the scan itself (see TRANCHE-4 design decision #5).
>
> Skeleton for now: emit a placeholder line acknowledging the gap.
>
> ```
> [Step 2 — Codebase scan: not yet implemented. T4.2–T4.5 wave will add the
> 4 scanner agents (stack / structure / activity / quality).]
> ```

### 3. Write `.planning/LANDSCAPE.md`

> **Status: T4.6 — not yet implemented in this skeleton.**
>
> When implemented, this step will synthesize scanner outputs into the LANDSCAPE.md template defined in `.planning/TRANCHE-4.md` (sections: What this project is / Tech stack / Project structure / Activity signals / Test surface / Open work signals / Inferred goals & uncertainties / Last Updated). Inferred fields use confidence-marker labels (`[INFERRED — high confidence]`, `[INFERRED — low confidence]`, `[FILL IN]`).
>
> Skeleton for now: emit a placeholder.

### 4. Generate baseline `.planning/PROJECT.md`

> **Status: T4.7 — not yet implemented in this skeleton.**
>
> When implemented, this step will draft a baseline PROJECT.md in Signal's standard shape (Vision / Problem / Success Criteria / Scope / Constraints / Done When), with every inferred field marked `[INFERRED — please verify]` and every blank field marked `[FILL IN — Signal could not infer this]`. Never fabricate; mark and move on.
>
> Skeleton for now: emit a placeholder.

### 5. Surface assumptions for user validation

> **Status: T4.8 — not yet implemented in this skeleton.**
>
> When implemented, this step will walk the user through the inferred-content checkpoints from LANDSCAPE.md and the draft PROJECT.md. Use the locked question-pattern conventions:
> - **3+other** for genuine tradeoff questions (e.g., "Should we treat this project as FEATURE / SUBSYSTEM / PRODUCT scope?")
> - **Open-ended** for clarifying genuinely unknown intent (e.g., "What's the *current* problem you're solving — the README is from 18 months ago.")
>
> User's responses (especially "other" answers) get captured verbatim in PROJECT.md's Notes section.
>
> Skeleton for now: emit a placeholder.

### 6. Initialize `.planning/STATE.md` and hand off to `/sig:calibrate`

> **Status: T4.9 — not yet implemented in this skeleton.**
>
> When implemented, this step will:
> 1. Call `initState(baseDir, 'CALIBRATE')` from `tools/lib/state.js` to write STATE.md with `Current Phase: CALIBRATE`.
> 2. Print the next-step message:
>
>    ```
>    Landscape captured at .planning/LANDSCAPE.md.
>    Baseline PROJECT.md drafted at .planning/PROJECT.md (review the [INFERRED] markers).
>
>    Next: /sig:calibrate to tier the work — given this is a brownfield project
>    with {N months/years} of git history, the calibration questions will lean
>    toward higher tiers (reversibility tends to be painful or worse for established
>    codebases).
>
>    Reminder: review LANDSCAPE.md and PROJECT.md before /sig:calibrate so the
>    tiering reflects what's *actually true* about your project, not what Signal
>    inferred.
>    ```
>
> Skeleton for now: emit a placeholder + actually call `initState(baseDir, 'CALIBRATE')` so the pre-flight skeleton at least delivers a usable post-state for downstream commands during T4.2–T4.9 development. (Caveat: this means the T4.1 skeleton will leave a project in `Current Phase: CALIBRATE` state without a real LANDSCAPE.md — fine for skeleton-mode dogfooding, not for end users.)

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "The user clearly wants /sig:init; skip the pre-flight checks." | No. The pre-flight prevents two failure modes that *kill* adoption: silently overwriting an existing PROFILE.md (loses calibration history), and writing `.planning/` into a non-git directory (memory lost on first clone). Both are recoverable only by accident, not by design. |
| "Auto-run `git init` if no .git/ — saves the user a step." | No. Git initialization is a ceremony some users care about (default branch name, initial commit content, signed commits, etc.). Auto-running strips that choice. The 5-second cost of "run `git init` first, then re-run" is worth the user's autonomy on their own repo's history root. |
| "If `.planning/` exists, just merge into it." | No — surface the ambiguity. The 3+other in 1.4 exists because partial state is *load-bearing when it's real* and *catastrophic when it's stale*. Auto-merge picks the wrong default in the second case. |
| "Skip the gitignore check; the user knows what they're doing." | No, never. Same rule as new-project + calibrate. Without the check, `.planning/` gets silently ignored on clone and the project's memory is lost. Surface it; let the user override if they have a reason; but always surface. |
| "Empty repo? Just proceed — the scanners will return empty data, no harm done." | Wrong tool for the job. Empty repo = no codebase to brownfield. Proceeding means generating an empty LANDSCAPE.md and a baseline PROJECT.md that's pure `[FILL IN]` markers — strictly worse than what `/sig:new-project` does for the same case. Redirect. |

## Gate: Init Complete

> The full gate (post-T4.9) will look like the gate below. T4.1 only delivers items marked `[T4.1]`; later waves fill in the rest.

- [ ] **[T4.1]** Pre-flight detected one of 5 states (1.1 already-Signalized / 1.2 no-git / 1.3 empty-repo / 1.4 ambiguous-`.planning/` / 1.5 happy-path)
- [ ] **[T4.1]** `.gitignore` does not ignore `.planning/` (or override is logged)
- [ ] **[T4.2–T4.5]** Scanner agents ran; results captured
- [ ] **[T4.6]** `.planning/LANDSCAPE.md` written with all template sections
- [ ] **[T4.7]** `.planning/PROJECT.md` drafted with `[INFERRED]` / `[FILL IN]` markers
- [ ] **[T4.8]** Inferred content surfaced to user; assumptions accepted / corrected / deferred
- [ ] **[T4.9]** `.planning/STATE.md` written with `Current Phase: CALIBRATE`
- [ ] **[T4.9]** User saw the next-step message pointing at `/sig:calibrate`
