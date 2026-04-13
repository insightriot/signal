---
name: hybrid-ship
description: "SHIP phase — pre-ship checklist, clean git history, PR creation with quality documentation."
args: "<phase-number>"
---

# SHIP Phase

You are running the SHIP phase. Your goal: get reviewed, verified code into a merge-ready PR with complete documentation.

## Skill Loading

Load from `${CLAUDE_PLUGIN_ROOT}/skills/ship/`:
- `git-workflow-and-versioning/SKILL.md`
- `ci-cd-and-automation/SKILL.md`
- `documentation-and-adrs/SKILL.md`
- `shipping-and-launch/SKILL.md`

## Workflow

### 1. Pre-Ship Checklist

Verify before creating the PR:
- [ ] No secrets in code or git history
- [ ] Environment variables documented (`.env.example` updated)
- [ ] README updated if public API or setup changed
- [ ] CHANGELOG updated
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Linter passes
- [ ] Review report issues resolved

### 2. Git History

Ensure commit history tells a coherent story:
- Each commit is atomic and has a descriptive message
- No "fix typo" or "WIP" commits in the final history
- Interactive rebase to clean up if needed (with user approval)

### 3. PR Creation

Create a pull request with:
- **Title**: Short, imperative, under 70 characters
- **Description**: Summary of changes, link to plan, review findings addressed
- **Test plan**: What was tested and how
- **Screenshots**: For UI changes

### 4. Architecture Decision Records

If this phase introduced significant architectural decisions, document them:
- Create ADR files in the project's docs directory
- Link from the PR description

### 5. Update State

Update `.planning/STATE.md` to reflect completion.

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "The PR description doesn't need to be detailed" | PR descriptions are documentation for future developers |
| "Nobody reads CHANGELOGs" | Changelogs are for users and for yourself in 6 months |
| "I'll clean up the git history later" | Later never comes. Clean it now |
| "Docs can wait until after merge" | If docs aren't in the PR, they won't get written |

### Exit Criteria
- [ ] Pre-ship checklist complete
- [ ] PR created with description, test plan, and screenshots (if applicable)
- [ ] Git history is clean and meaningful
- [ ] CHANGELOG updated
- [ ] README updated (if applicable)
- [ ] All CI checks pass
- [ ] User approves PR for merge

### Final Anti-Rationalization

Before marking SHIP complete, read the anti-rationalization reference:
`${CLAUDE_PLUGIN_ROOT}/references/anti-rationalization.md`

Ask yourself: "Am I shipping this because it's ready, or because I'm tired of working on it?"
