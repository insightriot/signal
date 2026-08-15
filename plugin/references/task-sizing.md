# Task Sizing Reference

Merged guidance from GSD and Agent Skills for right-sizing tasks in AI-assisted development.

## Core Principle

Every task must be completable within a single agent context window. If the agent will run out of context mid-task, the task is too large.

## Sizing Rules

1. **Single context window** -- A task should be plannable, executable, and verifiable without a context reset. If it requires handoff notes, it is too big.

2. **Vertical slice, not horizontal layer** -- Each task should deliver a working increment from top to bottom (e.g., "add the /discuss command with skill loading and phase gate") rather than a layer across the system (e.g., "add all command stubs").

3. **Clear acceptance criteria** -- Every task needs 2-5 concrete, testable conditions that define "done." If you cannot write acceptance criteria, the task is not well-enough understood to execute.

4. **Three-sentence heuristic** -- If a task description requires more than three sentences to explain, it probably contains multiple tasks. Split it.

5. **One commit, one purpose** -- A well-sized task produces a single atomic commit. If the commit message needs "and" more than once, the task was too broad.

## Smell Tests

| Smell | What it means | Action |
|---|---|---|
| Task description > 3 sentences | Multiple tasks bundled | Split into vertical slices |
| Acceptance criteria > 5 items | Scope too wide | Extract sub-tasks |
| Estimated touch points > 4 files | Risk of context overrun | Narrow the slice |
| Dependencies on other incomplete tasks | Ordering problem | Resequence or merge |
| "Set up" or "scaffold" as the verb | Horizontal layer, not a slice | Attach a vertical deliverable |

## Examples

**Too big:** "Implement the quality gates system with skill loading, exit criteria checking, and anti-rationalization tables."

**Right-sized:**
- "Add skill loader that reads a single skill file by phase and name"
- "Add exit criteria checker that validates a checklist against current state"
- "Add anti-rationalization table lookup for the PLAN phase"

## GSD Wave Compatibility

Tasks feed into GSD's wave-based execution. Tasks within the same wave run in parallel, so they must be independent. A well-sized task:
- Has no runtime dependency on other tasks in the same wave
- Reads shared state but does not write to files another parallel task writes
- Can be verified in isolation
