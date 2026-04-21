---
name: sig:new-project
description: Initialize a new project with the Signal workflow. Creates .planning/ directory, PROJECT.md, and kicks off the CALIBRATE phase.
---

# Initialize New Signal Project

You are starting a new project using the Signal workflow. This command sets up the project foundation and transitions into Phase 0 (CALIBRATE).

## Steps

### 1. Create Project State

Create the `.planning/` directory in the current working directory with:
- `STATE.md` — tracks current phase, completed phases, and blockers
- `config.json` — copy from `${CLAUDE_PLUGIN_ROOT}/state/config.json`
- `PROJECT.md` — to be populated during DISCUSS

Initialize `STATE.md` with:
```markdown
# Project State

## Current Phase
CALIBRATE

## Completed Phases
(none)

## Blockers
(none)

## Last Updated
{current_date}
```

### 2. Gather Project Context

Ask the user:
1. What are you building? (one paragraph)
2. What's the target audience?
3. Are there existing codebases or repos to integrate with?
4. What are the hard constraints? (language, framework, deployment, timeline)
5. What does "done" look like?

### 3. Generate PROJECT.md

From the answers, generate `.planning/PROJECT.md` following the format in the plugin's `PROJECT.md` as a reference — include Vision, Problem Statement, Success Criteria, Scope (in/out), Constraints, and Done When.

### 4. Transition to CALIBRATE

Update `STATE.md` to reflect CALIBRATE phase is active. Inform the user they can now run `/sig:calibrate` to tier the project (SKETCH / FEATURE / SPIKE / FULL) before entering structured phases.

## Gate: Project Initialized
- [ ] `.planning/` directory created
- [ ] `STATE.md` initialized
- [ ] `PROJECT.md` captures user's intent
- [ ] User understands Phase 0 + six-phase workflow ahead
