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
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/landscape.js` — `readAllScans`, `extractSection`, `extractField`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/walkthrough.js` — `countMarkers`, `appendNote` (Step 5 helpers)

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

If `.planning/` directory exists but `readProfile` threw with `not found` — this is the ambiguous case. Could be a partial init that crashed, an abandoned attempt, or a hand-rolled `.planning/` (like Signal's own bootstrap directory). **Halt and ask** using a 3+other pattern (per `references/question-patterns.md`). **Render via `AskUserQuestion(multiSelect: false)` per § Rendering — the markdown below describes option content, not literal output.**

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

Create the scan output directory: `mkdir -p .planning/scan` (idempotent).

Spawn **all 4 scanner agents in parallel** in a single message via the Task tool. Each scanner is registered as a sub-agent and writes its output to `.planning/scan/{name}.md`:

| Agent | `subagent_type` | Output file |
|---|---|---|
| Stack scanner | `stack-scanner` | `.planning/scan/stack.md` |
| Structure scanner | `structure-scanner` | `.planning/scan/structure.md` |
| Activity scanner | `activity-scanner` | `.planning/scan/activity.md` |
| Quality scanner | `quality-scanner` | `.planning/scan/quality.md` |

Each agent's prompt is identical: `"Run the {name} scan per your agent definition. The working directory is the project root. Write your output to .planning/scan/{name}.md per the Output Format section. You are read-only — do not modify any other file. Report back when done."`

**Dev-mode + pre-marketplace fallback.** If the Task tool returns `Agent type '{name}-scanner' not found` (which happens in dev mode and possibly after marketplace install if agent namespacing applies), fall back to spawning `general-purpose` subagent with the agent's full markdown definition embedded in the prompt:

```
You are the {name} scanner per the definition below. Follow it exactly.
Output to .planning/scan/{name}.md per the file's Output Format section.
You are read-only.

---
{contents of agents/scanners/{name}-scanner.md verbatim}
---

Working directory: {cwd}
```

This fallback path is documented at M4.t15 (dogfood pass found that dev-mode plugin agents don't auto-register with the Task tool). Verify the marketplace-install behavior + plugin-agent namespacing convention before relying on the named-subagent path in production. If marketplace install applies a `signal-` prefix (parallel to how `gsd-*` prefixed agents from the gsd plugin appear), update this section's table to reference the prefixed names.

`/sig:init` runs **before** PROFILE.md exists, so all 4 scanners always fire. The MILESTONE-4 spec mentions tier-aware scanner counts (SKETCH = 2), but that's moot for brownfield onboarding — calibration happens *after* this scan, and brownfield projects rarely calibrate to SKETCH anyway. (Locked design decision: scanner count is fixed at 4. Logged in DECISIONS.md.)

Wait for all 4 scanners to complete. If any scanner fails (exception, timeout, refused write), record the failure but **continue** — Step 3's synthesizer degrades gracefully and marks the corresponding LANDSCAPE.md section as `(scan output unavailable — {scanner} failed: {reason})`. Do not retry within `/sig:init`; surface the failure so the user can re-run the scanner manually.

### 3. Write `.planning/LANDSCAPE.md`

Read the 4 scan outputs:

```js
const scans = await readAllScans(baseDir); // { stack, structure, activity, quality }
```

Synthesize them into `.planning/LANDSCAPE.md` using the template below. **Sections 2-6 are mechanical reformat from scan data** (use `extractSection` and `extractField` from `tools/lib/landscape.js`). **Sections 1 and 7 are narrative synthesis** by you — drawing across multiple scans to infer purpose and surface uncertainties.

#### Template

```markdown
# Landscape

## What this project is

{1-paragraph synthesis. Sources: the README excerpt (quality scan → "## README" → first 30 lines), top language (stack scan → "## Languages" → first row), dominant framework (stack scan → "## Frameworks Detected" → first row), and project age + health (activity scan → "## Repo Lifetime", "## Health Classification"). Combine into a sentence like:

  "{ProjectName} is a {framework} project written primarily in {language}, {age} old and currently {health-status}. {One-sentence purpose drawn from README, marked [INFERRED — confidence-level] if not stated explicitly}."

If the README explicitly states the project's purpose, mark that part `[INFERRED — high confidence]`. If purpose is inferred from framework + structure alone, mark `[INFERRED — low confidence]`. If you can't infer at all, write `[FILL IN — Signal could not infer purpose from available signals; please describe what this project does]`.}

## Tech stack

- **Languages:** {extract from stack scan "## Languages" table — top 3-5 by file count, formatted "TypeScript (74%), JavaScript (12%), Shell (4%)"}
- **Frameworks:** {extract from stack scan "## Frameworks Detected" — name + version per row, comma-separated; or "(none detected)"}
- **Test runner:** {extract from quality scan "## Test Runners" — first row name + version; or "(none configured)"}
- **CI:** {extract from quality scan "## CI Configuration" — platform name + "runs tests on PRs: yes/no/unknown"; or "(no CI detected)"}
- **Container / deployment:** {extract from stack scan "## Runtime / Deployment" — if present; else omit this line}

## Project structure

{Embed the structure scan's "## Source Tree (depth-3)" table verbatim. Above the table, prepend a one-line monorepo summary from "## Monorepo Detection" — e.g., "Single-repo project." or "Monorepo (pnpm workspaces, 4 sub-packages: api, web, shared, cli)."}

## Activity signals

- **Last commit:** {activity scan "## Repo Lifetime" → "Last commit" field}
- **Project age:** {activity scan "## Repo Lifetime" → "Project age" field}
- **Cadence (90 days):** {activity scan "## Commit Cadence" → 90-day commits + avg/week}
- **Active contributors (90 days):** {activity scan "## Contributors (90 days)" → "Total unique" field}
- **Hot files:** {activity scan "## Hot Files" → top 5 paths only, comma-separated; or "(insufficient activity)"}
- **Health:** {activity scan "## Health Classification" → "Status" field + "Reasoning" field in parens}

## Test surface

- **Test runner:** {quality scan "## Test Runners" → first row, or "none configured"}
- **Tests detected:** {structure scan "## Test Surface" → "Net assessment" field}
- **CI runs tests:** {quality scan "## CI Configuration" → "CI runs tests" field}
- **Coverage tooling:** {if quality scan "## Lint / Format Tooling" or "## Notes" mentions coverage, surface it; else "(no coverage tooling detected)"}

## Open work signals

- **TODO/FIXME/HACK count:** {quality scan "## Open Work Signals" → "TODO/FIXME/HACK count" field}
- **Top files by marker:** {quality scan "## Open Work Signals" → top 3 paths from "Top files" table}
- **CHANGELOG state:** {quality scan "## CHANGELOG" → "Freshness" field + "Latest declared version" field}
- **License:** {quality scan "## License" → "Detected" field}

## Inferred goals & uncertainties

**INFERRED — please verify before relying on:**
- {Goal 1: synthesize from README + framework + hot-file paths. E.g., "Appears to be a public-facing API service — Express framework, hot files in `src/routes/` and `src/middleware/`, README mentions REST endpoints. Confidence: high."}
- {Goal 2: secondary inference from CHANGELOG / recent commits. E.g., "Recent commits suggest active work on auth (3 commits to src/auth/* in last 30d). Confidence: medium."}
- {Add 1-3 more if the data supports them; otherwise stop. Don't fill out a quota of guesses.}

**Open questions for the user:**
- {Question 1: a real gap the scan couldn't fill. E.g., "What's the production deployment target? `Dockerfile` is present but no `vercel.json` / `wrangler.toml` / etc. — could be self-hosted, Kubernetes, or something else."}
- {Question 2: ambiguity worth surfacing. E.g., "README is from 18 months ago (last commit to README.md: 2024-08-15). Has the project's purpose changed since then?"}
- {Question 3: scope-relevant uncertainty. E.g., "Active contributors in 90d: 1. Is this a solo project, or is the team's activity hidden in a different branch / fork?"}
- {Add only as many as the data warrants. Better to ask 2 sharp questions than 6 generic ones.}

## Last Updated

{ISO date — current YYYY-MM-DD}
```

#### Synthesis rules

- **Mechanical sections (2-6):** Use `extractSection` + `extractField` to pull values; if a field is missing or the source scan failed, write `[scan output unavailable]` rather than guessing.
- **Narrative sections (1 + 7):** Confidence labels are mandatory. Every inferred fact has one of `[INFERRED — high confidence]` / `[INFERRED — low confidence]` / `[FILL IN]`. **Do not fabricate.** If you can't infer, mark `[FILL IN]`.
- **Don't aggregate weak signals into strong claims.** Two low-confidence inferences don't compose into a high-confidence one. Mark them both as low.
- **Embed scanner data; don't re-summarize.** "Project structure" should mostly be the structure scanner's output verbatim — your job is template-fill, not paraphrase. Paraphrase introduces drift.

Write the file to `.planning/LANDSCAPE.md`.

### 4. Generate baseline `.planning/PROJECT.md`

Draft a baseline PROJECT.md in Signal's standard shape, drawn from LANDSCAPE.md + scan data. **Every inferred field is marked `[INFERRED — please verify]`**. **Every blank field is marked `[FILL IN — Signal could not infer this]`**. Never fabricate.

#### Template

```markdown
# {ProjectName} — Project Spec

> **Brownfield onboarding draft** — generated by `/sig:init` from codebase scan.
> Every `[INFERRED]` and `[FILL IN]` marker is your responsibility to resolve.
> Do this *before* `/sig:calibrate` so tiering reflects reality, not Signal's guesses.

## Vision

{One-sentence vision. Source: LANDSCAPE.md "What this project is" → drop the technical descriptors, keep the purpose. If purpose is `[FILL IN]` in LANDSCAPE.md, mirror that here as `[FILL IN — what is this project for, in one sentence?]`.}

`[INFERRED — please verify]` (or `[FILL IN — ...]`)

## Problem Statement

{1-3 sentences: what problem does this codebase solve, for whom? Source: README "Why" / "Motivation" / introduction sections (quality scan extracted these). If README doesn't articulate this, `[FILL IN — what user problem does this address?]`.}

`[INFERRED — please verify]` (or `[FILL IN — ...]`)

## Success Criteria

`[FILL IN — what does success look like for this project today? List 3-5 measurable criteria. Examples: "P95 latency under 200ms", "Free-tier user growth >10%/month", "Zero P0 incidents in 90 days". Signal cannot infer these from code alone — they're forward-looking.]`

## Scope

### In Scope
- {Inferred from hot files + recent commits — e.g., "Authentication subsystem (active 30d work in `src/auth/*`)"}
- {Inferred from declared dependencies — e.g., "REST API endpoints (Express framework, `src/routes/` directory)"}
- {Add 3-5 more from observable signal.}

`[INFERRED — please verify]`

### Out of Scope
`[FILL IN — what is *explicitly* not part of this project? Signal cannot infer absence; you have to declare it. Examples: "Mobile clients (web only)", "Legacy v1 API (read-only maintenance, no new features)".]`

## Constraints

- **Language / runtime:** {LANDSCAPE → Tech stack → languages + runtime constraint, e.g., "Node 22+, TypeScript"}
- **Frameworks:** {LANDSCAPE → Tech stack → frameworks, e.g., "Next.js 14, React 18"}
- **Deployment target:** {LANDSCAPE → Tech stack → container/deployment if detected; else `[FILL IN — where does this deploy?]`}
- **Team / contributors:** {Activity scan → contributors count + names if useful for context, or `[FILL IN — team size?]`}
- **Hard constraints not in code:** `[FILL IN — anything else that constrains design choices? Compliance, license obligations, integrations, partner SLAs.]`

## Done When

`[FILL IN — what's the next concrete milestone for this project? Signal can't infer "done" from code alone. Examples: "Public beta launch with 100 paying customers", "All P0 features in CHANGELOG-v2.0.md shipped", "Replace legacy auth (TODO count in src/auth/* drops to 0)".]`

## Notes

- Generated by `/sig:init` on {YYYY-MM-DD}.
- Source signals: see `.planning/LANDSCAPE.md` and `.planning/scan/{stack,structure,activity,quality}.md`.
- Project state at brownfield onboarding: {LANDSCAPE.md activity signals "Health" field}, {project age}, {commits} total commits.
```

#### Generation rules

- **Vision + Problem:** May be auto-filled from LANDSCAPE if `[INFERRED — high confidence]` was assigned there; mirror as `[INFERRED]` here. Otherwise `[FILL IN]`.
- **Success Criteria + Done When:** **Always** `[FILL IN]`. These are forward-looking; no scan can produce them. Do not fabricate placeholder criteria like "code works" — those have negative value (the user has to delete them later).
- **Scope (In):** Auto-fill from observable signal (hot files, frameworks, recent commits). Mark `[INFERRED — please verify]`.
- **Scope (Out):** **Always** `[FILL IN]`. Absence isn't observable from code.
- **Constraints:** Mix of inferred (language, framework) and `[FILL IN]` (compliance, partner SLAs). Inferred fields don't need a marker if they're 100% derived from manifest (e.g., "Node 22+" from `package.json` engines field is fact, not inference).
- **Notes:** Always auto-filled. Provides traceability to scans.

Write the file to `.planning/PROJECT.md`.

### 5. Surface assumptions — PROJECT.md walkthrough

The synthesizer (Steps 3–4) generated a PROJECT.md scattered with `[INFERRED — please verify]` and `[FILL IN — ...]` markers. This step is the conversational layer that turns "scan output" into "vetted artifacts the user trusts to feed `/sig:calibrate`." Walk each marker individually and resolve it Accept / Edit / Defer (for `[INFERRED]`) or Open-ended / Defer (for `[FILL IN]`).

**Scope locked at v1: PROJECT.md only.** LANDSCAPE.md also has `[INFERRED]` markers (in "What this project is" + "Inferred goals & uncertainties"), but those are reference material the user can read manually before `/sig:calibrate`. Surfacing them here would double the token cost of the walkthrough for a smaller marginal benefit. Revisit if dogfood-2 surfaces real friction.

#### 5.1 Pre-walkthrough zero-marker check

Read `.planning/PROJECT.md`. Use `countMarkers(content)` from `tools/lib/walkthrough.js` to count unresolved markers. If the total is 0 (the user pre-edited the file before / between commands), **skip Step 5 entirely** and emit:

```
0 unresolved markers in PROJECT.md — skipping the assumption walkthrough.
Proceeding to handoff.
```

Then jump straight to Step 6.

If `total > 0`, announce the walkthrough briefly so the user knows what's coming:

```
{N} unresolved markers in PROJECT.md ({inferred} inferred, {fillIn} fill-in).
I'll walk each one — Accept / Edit / Defer for inferences, open-ended for fill-ins.
Defer is always available; calibration accuracy may dip on deferred fields.
```

#### 5.2 Walkthrough order (locked)

For each field in this order, check whether PROJECT.md's section contains an unresolved marker. If yes, ask the corresponding question pattern below. If no (the user already resolved it during template generation, or pre-edited), skip to the next field silently.

1. **Vision** — `[INFERRED]` or `[FILL IN]`
2. **Problem Statement** — `[INFERRED]` or `[FILL IN]`
3. **Scope (In Scope)** — `[INFERRED]`
4. **Constraints** — only `[FILL IN]` items (manifest-derived facts have no marker; skip them)
5. **Success Criteria** — always `[FILL IN]`
6. **Done When** — always `[FILL IN]`
7. **Scope (Out of Scope)** — always `[FILL IN]`

Order rationale: Vision + Problem are prerequisites for Success Criteria + Done When + Scope-out (the forward-looking fields require knowing the goal first). Constraints come before Success Criteria because constraints often shape what success looks like.

#### 5.3 Question pattern for `[INFERRED]` markers (3+other)

Per `references/question-patterns.md`. **Render via `AskUserQuestion(multiSelect: false)` per § Rendering — one call per marker.** The shape below describes the per-option content (name / one-line description / recommendation marker), not literal markdown to print to the user.

```
{Field name} (inferred from {source — e.g., "README + framework + activity signals"}):

  "{the inferred content from PROJECT.md, quoted verbatim}"

Three options:

A. Accept — the inferred content is correct as-is. Strip the [INFERRED] marker.

B. Edit — give me the corrected version (one paragraph or a few bullets).
   Captures the original inference + your reason in PROJECT.md "## Notes."

C. Defer — leave the [INFERRED] marker. You'll vet later.
   Captured in "## Notes" so future Claude sessions see what's unvetted.

Recommendation: {A | B | C}, because {one-line rationale, see below}.

If none of these fit, describe what you'd prefer and I'll capture it.
```

**Recommendation rules:**
- **Recommend A** if the inferred content is sourced from a high-confidence signal (e.g., README "Overview" section, package.json `description` field, recent commit messages on a focused topic). Surfaced confidence cues in LANDSCAPE.md (`[INFERRED — high confidence]`) carry forward here.
- **Recommend B (Edit)** if the inferred content is sourced from a low-confidence signal (e.g., README is 18+ months old, no clear purpose statement, framework + structure inference only) — the user has more context than the scan does.
- **Recommend C (Defer)** only if you genuinely have no signal AND the field isn't load-bearing for calibration. Note explicitly: "calibration depends on this field — Defer means tier accuracy may be reduced."

#### 5.4 Question pattern for `[FILL IN]` markers (open-ended-or-defer)

`[FILL IN]` markers exist because Signal couldn't infer the field. There's no inferred content to accept, so the 3+other shape doesn't fit cleanly. Use the open-ended-justified pattern from `references/question-patterns.md` (the workflow-opening exception). **Render as plain-text question — do NOT use `AskUserQuestion`** (open-ended answers are free-text by design; the tool's option chrome is misleading for them). The "Or pick: A. Defer / B. Skip" fallback at the end of the prompt stays as literal markdown — let the user reply with prose or with "A" / "B".

```
{Field name} — Signal can't infer this; you have to articulate it.

{One-line framing of why this matters, e.g.: "Calibration's stakes / horizon
questions depend on knowing what success looks like."}

Open-ended: {field-specific prompt}

Or pick:
A. Defer — leave the [FILL IN] marker. Calibration may land at a less-accurate
   tier without this. Captured in "## Notes."
B. Skip — explicitly mark "no fixed criteria for this project" (rare; mostly
   applies to research SPIKE work where success is "we learned something").

Recommendation: take the open-ended path; even rough criteria help calibration.
```

**Field-specific framing + prompt for each `[FILL IN]` field:**

| Field | Framing | Open-ended prompt |
|---|---|---|
| Success Criteria | Calibration's `stakes` and `horizon` answers depend on knowing what "done" looks like. | List 3–5 measurable criteria. Examples: "P95 latency under 200ms", "Free-tier user growth >10%/month", "v0.1.0 shipped to plugin marketplace by 2026-05-15". |
| Done When | Tells future Claude sessions when to stop adding scope to this milestone. | Name the next concrete milestone in one sentence. Examples: "Public beta launch with 100 paying customers", "All P0 features shipped", "Replace legacy auth (TODO count drops to 0)". |
| Scope (Out of Scope) | Absence isn't observable from code; declaring out-of-scope prevents scope creep during PLAN. | List 3–5 things that are *explicitly not* part of this project. Examples: "Mobile clients (web only)", "Legacy v1 API (read-only maintenance)". |
| Constraints (per `[FILL IN]` item) | Hard constraints shape every PLAN decision. | Name the constraint (or pick Defer if not applicable). Examples for "Deployment target": "AWS us-east-1 ECS", "Cloudflare Workers", "On-prem Kubernetes". |

#### 5.5 Capture rules

For every answer, edit `.planning/PROJECT.md` directly using the Edit tool:

- **Accept (A on `[INFERRED]`):** Replace the marker line (`` `[INFERRED — please verify]` ``) with empty content — strip just the marker, leaving the inferred paragraph/bullets above it. No "## Notes" entry needed.
- **Edit (B on `[INFERRED]`, or open-ended answer on `[FILL IN]`):** Replace the section body with the user's content. Then call `appendNote(content, note)` from `tools/lib/walkthrough.js` to append a history entry to `## Notes`:
  - For `[INFERRED]` Edit: `Edited at /sig:init walkthrough on {YYYY-MM-DD}: {field name}. Original inference: "{quote}". User reason: {reason or "not provided"}.`
  - For `[FILL IN]` open-ended: no Notes entry — there was no inference to record. The user's content replaces the marker and that's the audit trail.
- **Defer (C on `[INFERRED]` or A on `[FILL IN]`):** Leave the marker in place. Append to `## Notes` via `appendNote`: `Deferred at /sig:init walkthrough on {YYYY-MM-DD}: {field name}.`
- **Skip (B on `[FILL IN]`):** Replace the marker with literal text `(no fixed criteria for this project — see Notes)`. Append to `## Notes`: `Skipped at /sig:init walkthrough on {YYYY-MM-DD}: {field name} — no fixed criteria.`
- **"Other" / free-text reasoning:** Capture verbatim in `## Notes` per the question-patterns convention. The user's reasoning is institutional memory.

For Constraints, walk each `[FILL IN]` line individually — each is its own micro-question with the same shape. Manifest-derived rows (Language / Frameworks) have no marker and are skipped silently.

#### 5.6 Post-walkthrough summary

After every applicable field is resolved or deferred, count outcomes and emit:

```
Walkthrough complete: {accepted} accepted, {edited} edited, {answered} filled in,
{deferred} deferred{, {skipped} skipped if any}.

{If deferred + skipped > 0}: Deferred / skipped fields are noted in
PROJECT.md "## Notes"; calibration will proceed but tier accuracy may be
reduced for those dimensions.
```

The user reads this and proceeds knowing exactly where the gaps are.

### 6. Initialize `.planning/STATE.md` and hand off to `/sig:calibrate`

Call `initState(baseDir, 'CALIBRATE')` from `tools/lib/state.js`. This writes:

```markdown
# Project State

## Current Phase
CALIBRATE

## Completed Phases
(none)

## Blockers
(none)

## Last Updated
{YYYY-MM-DD}
```

Then print the handoff message. Compute `{age phrase}` from the activity scan's "Project age" field (e.g., "2 years 4 months"); if unavailable, use "(unknown duration)".

```
Landscape captured at .planning/LANDSCAPE.md.
Baseline PROJECT.md drafted at .planning/PROJECT.md (review the [INFERRED] / [FILL IN] markers).

Next: /sig:calibrate to tier the work — given this is a brownfield project with
{age phrase} of git history, the calibration questions will lean toward higher
tiers (reversibility tends to be painful or worse for established codebases).

Reminder: review LANDSCAPE.md and PROJECT.md before /sig:calibrate so the
tiering reflects what's *actually true* about your project, not what Signal
inferred.
```

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "The user clearly wants /sig:init; skip the pre-flight checks." | No. The pre-flight prevents two failure modes that *kill* adoption: silently overwriting an existing PROFILE.md (loses calibration history), and writing `.planning/` into a non-git directory (memory lost on first clone). Both are recoverable only by accident, not by design. |
| "Auto-run `git init` if no .git/ — saves the user a step." | No. Git initialization is a ceremony some users care about (default branch name, initial commit content, signed commits, etc.). Auto-running strips that choice. The 5-second cost of "run `git init` first, then re-run" is worth the user's autonomy on their own repo's history root. |
| "If `.planning/` exists, just merge into it." | No — surface the ambiguity. The 3+other in 1.4 exists because partial state is *load-bearing when it's real* and *catastrophic when it's stale*. Auto-merge picks the wrong default in the second case. |
| "Skip the gitignore check; the user knows what they're doing." | No, never. Same rule as new-project + calibrate. Without the check, `.planning/` gets silently ignored on clone and the project's memory is lost. Surface it; let the user override if they have a reason; but always surface. |
| "Empty repo? Just proceed — the scanners will return empty data, no harm done." | Wrong tool for the job. Empty repo = no codebase to brownfield. Proceeding means generating an empty LANDSCAPE.md and a baseline PROJECT.md that's pure `[FILL IN]` markers — strictly worse than what `/sig:new-project` does for the same case. Redirect. |
| "Walk LANDSCAPE.md too — it has markers." | No (v1). Scope locked to PROJECT.md-only. LANDSCAPE.md is reference material the user reads manually before `/sig:calibrate`. Walking it would double the question count for marginal benefit; revisit if dogfood-2 surfaces real friction. |
| "Skip Step 5's Defer option to force completeness." | No. Forcing completeness on the brownfield entry-point command kills adoption. Defer must be a first-class option for every marker; the cost of "calibration is slightly less accurate on this dimension" is dramatically lower than "user abandoned `/sig:init` halfway through." |
| "Auto-accept high-confidence `[INFERRED]` markers without asking." | No. Even if Signal's confidence is high, the user is the source of truth on their own project's purpose. The walkthrough exists to surface, not to auto-decide — the recommendation steers, the user decides. |
| "Make each Step 5 question multi-paragraph and exhaustively framed." | No. Keep the per-marker question to ≤ 8 lines (option enumeration + recommendation). Brevity matters; the walkthrough has 7 fields and a 50-line question per field is fatigue-inducing — exactly the failure mode the question-pattern convention exists to prevent. |

## Gate: Init Complete

- [ ] Pre-flight detected one of 5 states (1.1 already-Signalized / 1.2 no-git / 1.3 empty-repo / 1.4 ambiguous-`.planning/` / 1.5 happy-path)
- [ ] `.gitignore` does not ignore `.planning/` (or override is logged)
- [ ] All 4 scanner agents ran; results captured to `.planning/scan/{name}.md` (or failures recorded for the synthesizer)
- [ ] `.planning/LANDSCAPE.md` written with all template sections; narrative sections use `[INFERRED — confidence-level]` or `[FILL IN]` markers
- [ ] `.planning/PROJECT.md` drafted with `[INFERRED — please verify]` / `[FILL IN — Signal could not infer this]` markers; no fabrication
- [ ] PROJECT.md walkthrough run: every `[INFERRED]` and `[FILL IN]` marker resolved (Accept / Edit / open-ended / Defer / Skip), or the zero-marker skip path emitted; deferred + edited fields captured in PROJECT.md "## Notes"; post-walkthrough summary printed
- [ ] `.planning/STATE.md` written with `Current Phase: CALIBRATE`
- [ ] User saw the next-step message pointing at `/sig:calibrate`
