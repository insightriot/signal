---
name: sig:resume
description: "Resume work on a Signal project. Reads PROFILE.md + STATE.md + the current phase's artifact, prints a re-orientation, and asks if you're ready to continue."
args: ""
---

# `/sig:resume` — Re-orient and Continue

You are running `/sig:resume`, a meta command that loads enough context for the user to pick up where they left off. Same class as `/sig:status`, `/sig:calibrate`, `/sig:escalate`, `/sig:new-project` — no tier-gating preamble, no skill loading, no agent spawning, no state mutation.

Where `/sig:status` is a snapshot, `/sig:resume` is a **briefing**: it actively reads the current phase's artifact(s) so you can re-anchor on the locked decisions, work done, and work remaining without manually opening 5 files.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/profile.js` — `readProfile`, `ProfileSchemaError`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `readState`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/status.js` — `nextActionForPhase`, `formatEscalationSummary`, `readOpenQuestions`

## Workflow

### 1. Detect project state — same three branches as `/sig:status`

Try `readProfile(baseDir)`. If it throws `ProfileSchemaError`:
- "not found" → emit `Project not calibrated. Run /sig:calibrate to begin.` Exit.
- contains "schema_version" → emit `PROFILE.md uses an unsupported schema version. Upgrade Signal or run /sig:calibrate --re-calibrate.` Exit.
- otherwise → emit `PROFILE.md is malformed: {err.message}\nRun /sig:calibrate --re-calibrate to rewrite.` Exit.

If `readState(baseDir)` is `null` OR returns `state.phase === null`:
- emit the tier line + escalation summary if any + `Calibrated as {tier}; no work started yet. Run /sig:discuss to begin.` Exit.

Else continue.

### 2. Load PROJECT.md (if present)

Read `.planning/PROJECT.md` (or repo-root `PROJECT.md` as a fallback for self-managed projects like the Signal build itself). Pull the **Vision / Problem Statement** (whichever heading is first) — keep to ≤ 3 sentences in the briefing.

### 3. Load the current phase's artifact

Use `state.phase` to pick which file(s) to read:

| Phase | Artifact(s) to load | Section to surface |
|---|---|---|
| CALIBRATE | `PROFILE.md` | Tier + calibration answers |
| DISCUSS | `CONTEXT.md`, `REQUIREMENTS.md` | "Locked Decisions"; "Functional Requirements" first 5 |
| PLAN | `{phase}-PLAN.md` | "Phase goal"; "Tasks" with checked/unchecked status |
| EXECUTE | `{phase}-PROGRESS.md` (fall back to `{phase}-PLAN.md`) | Wave / task status |
| VERIFY | `{phase}-VERIFICATION.md` | Verdict + outstanding criteria |
| REVIEW | `{phase}-REVIEW.md` | Critical / Important issue counts |
| SHIP | `{phase}-SHIP.md` (if present) or pre-ship checklist from STATE.md | Ship-checklist completion |

**Resolving `{phase}-` artifact names** — the v1 convention isn't yet locked (see `.planning/OPEN-QUESTIONS.md`). For each `{ARTIFACT}` above, look in `.planning/` for the first match in this order, then read the first one found:

1. `{N}-{ARTIFACT}.md` for any `N` in `[1..9]` — the numeric/GSD-style prefix
2. `{ARTIFACT}.md` — the no-prefix simplified form
3. `{PHASE_NAME}-{ARTIFACT}.md` — the literal-substitution form (e.g., `PLAN-PLAN.md`)

If none match, emit a one-line note: `Note: expected artifact for {state.phase} not found — looked for 1-{ARTIFACT}.md, {ARTIFACT}.md, {PHASE}-{ARTIFACT}.md.` Continue with the briefing using whatever data is available.

### 4. Print the re-orientation

Render in this shape (aim for 30–50 lines — longer than `/sig:status` because it includes content from artifacts):

```
== Project Briefing ==

Project: {cwd}
Tier:    {profile.tier}{escalation_summary or ''}
Phase:   {state.phase}  ({completed-count}/{total-non-skipped} phases done)

— Vision —
{first paragraph of PROJECT.md "Vision" or "Problem Statement", ≤3 sentences}

— Decisions locked (DISCUSS) —
{numbered list from CONTEXT.md "Locked Decisions" — first 5; if more, append "…and N more"}

— Current phase: {state.phase} —
{phase-specific summary from the artifact loaded in Step 3}

— Open questions ({count}) —
{first 3 truncated headings from OPEN-QUESTIONS.md, or omit section if file absent}

— Work remaining —
Next phase: {nextActionForPhase result, with skip-aware copy from /sig:status conventions}

Ready to continue with {next-command}? (Reply "yes" to proceed, or run any /sig:* command directly.)
```

### 5. Final prompt — "Ready to continue?"

End with the literal one-line prompt. Do **not** auto-invoke the next phase command; the user explicitly confirms (this is the safety gate that distinguishes `/sig:resume` from "auto-continue"). The user's reply lands as a normal turn — they can type `yes` (and Claude can then offer to invoke the next command), or type any other `/sig:*` command directly, or say "let me think" without anything happening.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Auto-invoke the next phase to save the user a step." | No. `/sig:resume` is a briefing, not a launcher. Auto-invocation collapses the value of explicit phase entry — users sometimes want to re-read PROFILE before continuing, or escalate first. The safety gate is the entire point. |
| "Load every artifact for every phase, just in case." | Token cost is real; load only the most-recent artifact for the current phase plus PROJECT.md + CONTEXT.md. Users who want more depth `cat` the file. |
| "Refresh STATE.md with a 'last resumed' timestamp." | `/sig:resume` is read-only by design (matches `/sig:status`). Mutation muddies the trust contract. |
| "Render the full PROJECT.md / CONTEXT.md verbatim." | Summarize. The briefing is for re-anchoring, not re-reading from scratch. |

## Gate: Briefing Complete

- [ ] One of the 3 branches fired (uncalibrated / unbegun / in-flight) — for in-flight, the four sections all rendered
- [ ] Output ≤ 50 lines
- [ ] No `.planning/*` mtime changed
- [ ] User saw the "Ready to continue with /sig:{phase}?" prompt
