---
name: sig:ship
description: "SHIP phase — pre-ship checklist, clean git history, PR creation with quality documentation."
args: "<phase-number>"
---

# SHIP Phase

You are running the SHIP phase. Your goal: get reviewed, verified code into a merge-ready PR with complete documentation.

## 0. Tier-gating preamble (run before anything else)

Read `.planning/PROFILE.md` before any other workflow step.

- **If `PROFILE.md` is missing:** halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:ship`."* Do not proceed.
- **If `SHIP` is in `phases_skipped`:** exit with *"This tier ({tier}) skips SHIP. The project's output is internal (e.g., a SPIKE finding doc, not a shipping artifact). If output should ship, run `/sig:escalate` to upgrade tier."* Do not proceed. (SPIKE tier skips SHIP by default.)
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `gate_strictness: off` | Auto-advance through pre-ship checklist; confirm only at PR creation. |
| `gate_strictness: light` | Confirm at PR creation (default). |
| `gate_strictness: strict` | Confirm at every checklist step + run final anti-rationalization (existing Step 5 / "Final Anti-Rationalization" already does this — make it mandatory under strict). |

Tooling: `tools/lib/profile.js` exposes `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question convention: `references/question-patterns.md`.

## 0.5 FR1 retrospective pre-check (M4.5.E9, command-internal layer)

Run **before any other Workflow step**, regardless of `gate_strictness`. This is the command-internal layer of the layered enforcement locked in D-E9-8 (`PreToolUse` hook + `SessionStart-resume` hook are the other two layers; this layer is the only one that fires across all runtimes including Cursor/Codex).

**Steps:**

1. Load STATE.md via `readState(baseDir)` — gives the `state` object.
2. Determine the current milestone file: parse `state.current_epic` (e.g., `M4.5.E9`), drop the trailing `.E{N}`, prefix with `MILESTONE-`, append `.md`. Load `.planning/MILESTONE-{n}.md` content; if file missing, halt with *"current_epic `{epicId}` points to a milestone whose MILESTONE-{n}.md does not exist. Set current_epic to a real Epic or create the milestone file."*
3. Call `shipFR1Check({state, profile, milestoneContent, baseDir})` from `tools/lib/retrospective.js`.
4. Interpret the result:
   - `{halt: false, skipped: true, reason}` — this is a per-Slice SHIP, not an Epic-close. Continue with normal Workflow. No retro enforcement.
   - `{halt: false, retroPath, isEpicClose: true}` — retro exists + passes validation. Continue with Workflow. The eventual STATE.md commit will include the Epic-close.
   - `{halt: true, code, message, retroPath?}` — emit `message` verbatim to the user and **halt**. Do not proceed to Workflow. The user creates / fixes the retro file, then re-invokes `/sig:ship`.

**No bypass.** Per D-E9-3 there is no `--no-retro` flag, no environment variable escape hatch, and no extra-args trick. `shipFR1Check` ignores any extra properties passed to it.

**Layered enforcement context:** even if a user manually edits STATE.md to skip `/sig:ship`, the `PreToolUse(Edit|Write)` hook in `hooks/hooks.json` (added in M4.5.E9.S1.t7) blocks that write. Even if the user clears context mid-EXECUTE without invoking SHIP, the `SessionStart(resume)` hook surfaces the missing retro on the next session resume.

## Skill Loading

Load from `${CLAUDE_PLUGIN_ROOT}/skills/ship/`:
- `git-workflow-and-versioning/SKILL.md`
- `ci-cd-and-automation/SKILL.md`
- `documentation-and-adrs/SKILL.md`
- `shipping-and-launch/SKILL.md`
- `deprecation-and-migration/SKILL.md`

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

### 5. Update State (programmatic, not prose)

The PR is open and the Epic has shipped end-to-end. Bring STATE.md frontmatter into parity with the rest of the phase commands (RESEARCH § 1.1 surfaced that SHIP previously relied on prose "Update STATE.md" rather than programmatic state-writes — that gap is now closed):

1. `await transitionPhase(baseDir, 'SHIP')` from `tools/lib/state.js` — appends `SHIP (YYYY-MM-DD)` to `completed_phases` and updates `phase: SHIP` if not already there.
2. `await markFresh(baseDir, {commit: <git HEAD short>})` — advances `last_updated` to now and `last_updated_commit` to HEAD so `/sig:resume`'s staleness banner reads as fresh.

If `markFresh` fails (lock contention, git unavailable):
- Under `gate_strictness: strict`, surface the failure but **do not roll back the SHIP** — the work and PR are done; the state-write blip is a recovery item, not a SHIP failure.
- Under `light` / `off`, log to stderr and continue.

This step is now required even if no PR was created (e.g., direct-to-main shipping for the Signal-on-Signal flow) so STATE.md never lags behind the Epic-close.

### 6. Regenerate RETROSPECTIVES.md index (M4.5.E9.S2)

After the FR1 retro file and the state-write have both landed, call `regenerateIndex(baseDir)` from `tools/lib/retro-index.js` to refresh the index. The helper:

1. Walks `.planning/` recursively for `*-RETROSPECTIVE.md` files.
2. Parses any existing `RETROSPECTIVES.md` to preserve hand-written hook lines per Epic ID.
3. Renders the new index (reverse-chronological by lastModified) with hooks merged.
4. Atomic-writes IF content differs from existing (idempotent — no spurious diffs on re-runs that don't change retro state).

The index regen runs only on Epic-close SHIP (when `shipFR1Check` returned `{halt: false, isEpicClose: true}` in §0.5). Per-slice SHIPs skip both FR1 and the regen — the index doesn't change because no new retro lands.

Stage the modified `.planning/RETROSPECTIVES.md` (when `result.written === true`) into the SHIP commit alongside the retro file + state-write. One atomic commit captures all three.

### 7. Manual milestone meta-retro (`--milestone-meta` flag, optional)

If the user invokes `/sig:ship --milestone-meta` (or otherwise explicitly requests a milestone-level meta-retrospective), call `generateMilestoneMetaRetro(baseDir, milestoneId, opts)` from `tools/lib/retro-index.js` where `milestoneId` is derived from `state.current_epic` (drop the trailing `.E{N}` segment, e.g., `M4.5.E9` → `M4.5`).

The helper writes `.planning/{milestoneId}-RETROSPECTIVE.md` as a stub with:
- Auto-generated list of per-Epic retros under the milestone (sorted naturally, each with stub/complete status flag)
- `[FILL IN]` markers in three reflection sections (Synthesis, Compound learnings, Forward-looking)
- A Links footer pointing back at the index

The helper **refuses to overwrite** an existing meta-retro unless `{force: true}` is passed — confirms user intent before destroying prior content. If the file already exists, surface the refusal message; the user can re-invoke with `--force` after deciding to regenerate, or hand-edit the existing file.

The meta-retro is **opt-in / manual only** per A6 (the auto-detection of milestone close was downgraded because MILESTONE-{N}.md has no fully-parseable close-detection schema). FR1 enforcement does NOT extend to milestone meta-retros — they're additive, not gating.

Stage the new file into the SHIP commit (or its own commit if SHIP isn't running). The index regen in §6 will pick up the milestone meta-retro automatically on the next regen if you want it indexed alongside per-Epic retros — though typically it's tracked separately because it spans Epics.

### 8. Reconcile docs (Curator — optional, skips cleanly if not installed)

If the [Curator](https://github.com/insightriot/curator) CLI is available, regenerate the doc indexes so `.planning/` (and any other curated zone) ships reconciled. This is the milestone-level complement to Curator's per-commit `post-commit` hook: it guarantees the reconcile runs at SHIP even on machines or CI where that local git hook isn't installed (hooks live in `.git/hooks/`, which isn't version-controlled).

Detect the CLI the same way the hook does, then run a structural refresh from the repo root — no file moves, no model calls:

```bash
if command -v curator >/dev/null 2>&1; then CUR=curator
elif command -v python3 >/dev/null 2>&1 && python3 -c "import curator" >/dev/null 2>&1; then CUR="python3 -m curator"; fi
[ -n "${CUR:-}" ] && $CUR --root "$(git rev-parse --show-toplevel)" refresh --all || true
```

`refresh --all` discovers every `.curator.yml` under the repo, regenerates each zone's `INDEX.md` from its own config, and skips vendored trees (`node_modules`, etc.). It is idempotent — no spurious diffs when docs haven't changed.

Stage any regenerated `**/INDEX.md` into the SHIP commit alongside the state-write (§5) and retro index (§6). If Curator isn't installed the step is a clean no-op — it never blocks the SHIP.

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
