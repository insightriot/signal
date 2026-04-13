---
name: hybrid-execute
description: "EXECUTE phase — wave-based parallel execution with fresh context per task, atomic commits, and context rot prevention."
args: "<phase-number>"
---

# EXECUTE Phase

You are running the EXECUTE phase of the hybrid workflow. Your goal: implement every task in the plan with atomic commits and passing tests.

## Skill Loading

Load from `${CLAUDE_PLUGIN_ROOT}/skills/build/`:
- `incremental-implementation/SKILL.md`
- `test-driven-development/SKILL.md`
- `context-engineering/SKILL.md`

## Workflow

### 1. Load Plan

Read `.planning/{phase}-PLAN.md` and `.planning/{phase}-VALIDATION.md`.
Verify all tasks have acceptance criteria and test mappings.

### 2. Wave-Based Execution

Group tasks into waves based on dependencies:
- **Wave 1**: Tasks with no dependencies (can run in parallel)
- **Wave 2**: Tasks depending only on Wave 1 outputs
- **Wave N**: Continue until all tasks are scheduled

For each task in a wave:
1. Read the task's acceptance criteria and test mapping
2. Write tests first (TDD) where applicable
3. Implement the minimum code to pass tests
4. Run the test suite
5. Create an atomic git commit with a descriptive message
6. Update `.planning/STATE.md` with progress

### 3. Context Rot Prevention

Every ~45 minutes of execution:
- Re-read `.planning/CONTEXT.md` to refresh locked decisions
- Re-read the current task's acceptance criteria
- Check context budget (warn at 35% remaining, critical at 25%)

### 4. Progress Tracking

After each task, update `.planning/{phase}-PROGRESS.md`:
```markdown
## Wave {n}
- [x] Task 1 — commit {hash}
- [ ] Task 2 — in progress
- [ ] Task 3 — pending
```

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "The tests are too slow, I'll skip them for now" | Skipped tests compound — write them now |
| "This works but I'll refactor it later" | Later never comes. Write it clean the first time |
| "I'll commit everything together at the end" | Atomic commits enable safe rollback. Commit per task |
| "The plan says X but I think Y is better" | Update the plan first. Don't silently diverge |

### Exit Criteria
- [ ] All plan tasks completed with atomic commits
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No silently skipped tasks
- [ ] Progress file reflects completion
