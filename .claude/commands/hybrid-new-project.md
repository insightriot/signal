---
name: hybrid-new-project
description: Initialize a new project with the hybrid GSD + Agent Skills workflow. Creates .planning/ directory, PROJECT.md, and kicks off the DISCUSS phase.
---

# Initialize New Hybrid Project

You are starting a new project using the skills-gsd hybrid workflow. This command sets up the project foundation and transitions into the DISCUSS phase.

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
DISCUSS

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

### 4. Transition to DISCUSS

Update `STATE.md` to reflect DISCUSS phase is active. Inform the user they can now run `/hybrid-discuss` to begin the structured discussion phase, or continue the conversation naturally.

## Gate: Project Initialized
- [ ] `.planning/` directory created
- [ ] `STATE.md` initialized
- [ ] `PROJECT.md` captures user's intent
- [ ] User understands the six-phase workflow ahead
