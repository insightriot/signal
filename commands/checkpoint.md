---
name: sig:checkpoint
description: "Manual state refresh — diffs git log against STATE.md and refreshes it. Default quick mode shows a one-line readout + diff; --context adds decision + open-question capture so a context-clear that follows can re-orient cleanly."
args: "[--context]"
---

# `/sig:checkpoint` — Manual State Refresh

You are running `/sig:checkpoint`, a not-phase-gated state-refresh command. Same class as `/sig:status`, `/sig:resume`, `/sig:add` — no tier-gating preamble, no skill loading, no agent spawning. Two modes:

- **Quick mode** (default): walk the git log since `last_updated_commit`, propose a refreshed STATE.md, confirm-and-write per `gate_strictness`. Use this any time you want the current `STATE.md` to reflect the actual state of the work.
- **`--context` mode**: as above, plus prompt the user for **decisions** and **open questions** worth preserving, then dual-write decisions to `CONTEXT.md` § Locked Decisions AND `DECISIONS.md` (per D16), and questions to `OPEN-QUESTIONS.md`. Use this **before any planned context clear** — it's the ritual that makes the next session's `/sig:resume` valuable.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/checkpoint.js` — `parseCheckpointArgs`, `detectStateChanges`, `renderStateDiff`, `captureCheckpointContext`, `handleCheckpointOrphans`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `readState`, `markFresh`, `detectOrphans`, `clearCurrentTask`, `appendDecision`
- `${CLAUDE_PLUGIN_ROOT}/references/question-patterns.md` — strict-enum used for `apply` / `discard` and orphan `clear` / `keep` prompts

## Workflow

### 1. Pre-flight

- Resolve project root (typically cwd; verify `.planning/` is present).
- If `.planning/` is absent → "No project detected. Run `/sig:new-project` or `/sig:init` first." Exit.
- If `.planning/STATE.md` is absent → "STATE.md missing. Run `/sig:calibrate` first to initialize project state." Exit.
- Call `readState(baseDir)`. If `state.phase === 'CALIBRATE'` AND `state.completed_phases` is empty:
  - Emit: "Project is in CALIBRATE phase with no work captured yet. `/sig:checkpoint` has nothing to refresh until `/sig:discuss` runs." Exit cleanly. (Scope-cut from PLAN: pre-CALIBRATE refresh adds no value.)
- `.gitignore` check (same pattern as the other `.planning/`-writing commands): if any line would silence `.planning/`, warn + offer to remove + halt until confirmed.

### 2. Parse args

Call `parseCheckpointArgs($ARGUMENTS)`. Branch on the returned `{contextMode, unknownFlags}`:
- `unknownFlags.length > 0` → warn the user with the literal tokens ("Ignoring unknown args: foo, bar.") and continue. Never abort on unknown — they're forgivable.

### 3. Detect changes

Call `detectStateChanges(baseDir)`. Returns `{current, proposed, diff}` where `diff = {commitsBehind, commits, taskIdsInCommits}`.

### 4. Diff + confirm (per D8 + `gate_strictness`)

Read `gate_strictness` from PROFILE.md (via `readProfile`):

- **`off`** → write `proposed` via `markFresh` + supporting writes (no prompt). Surface a one-line confirmation summary.
- **`light`** → render the diff via `renderStateDiff(current, proposed)` and the count summary, then write. No interactive prompt.
- **`strict`** → render the diff and surface an `AskUserQuestion(strict-enum, [apply, discard])`:
  - Header: `Apply state refresh`
  - Question: `{diff.commitsBehind} commits behind. Apply this refresh?`
  - Options: `apply` (write proposed state), `discard` (no changes — STATE.md left as-is).
  - On `discard`, exit cleanly with no writes.

### 5. Write — quick mode

When applying:
1. For each `taskId` in `diff.taskIdsInCommits` that's currently in `state.current_tasks`, call `clearCurrentTask(baseDir, {id, status: 'done', commit: <first matching commit sha>})`. This removes the in-flight task and records the completion metadata.
2. Call `markFresh(baseDir)` so `last_updated` + `last_updated_commit` advance to HEAD.

After writes, emit the **D2 mitigation banner** verbatim (the explicit "what was refreshed" readout that prevents silent-no-op confusion):

```
✓ STATE.md refreshed
  - Behind by: {diff.commitsBehind} commits since {current.last_updated_commit ?? '<none>'}
  - Tasks cleared: {comma-separated ids or '(none)'}
  - Now fresh at: {HEAD sha (short)}
```

### 6. Orphan check

Call `handleCheckpointOrphans(baseDir, {prompt})` where `prompt(orphans)` is an `AskUserQuestion(strict-enum, [clear, keep])`:
- Header: `Orphan tasks`
- Question: `{orphans.length} task(s) older than 30 min with no matching commit. Clear?`
- Options: `clear` (mark each as `aborted`), `keep` (leave them; you may be mid-work).

If `--context` mode, this fires regardless of `gate_strictness` — orphan detection is interactive by design (per D12).

### 7. `--context` mode — decisions + questions

Skip this step if `contextMode === false`.

Surface two open-ended prompts in plain prose:
1. "**Decisions to lock in?** List any architecture / scope / approach decisions worth remembering across sessions. Type a blank line to skip." (One decision per line.)
2. "**Open questions to record?** List any unresolved questions worth surfacing on next `/sig:resume`. Type a blank line to skip." (One question per line.)

For each non-empty response, split into trimmed lines, then call:
```
const result = await captureCheckpointContext(baseDir, { decisions, questions });
```

If `result.sensitiveHits.length > 0`, surface the hits via `AskUserQuestion(strict-enum, [keep, abort])` (same shape as `/sig:add`'s sensitive-data prompt):
- Header: `Sensitive data`
- Question: `Detected {N} potential secret(s) in the input — {types}. Capture verbatim?`
- Options: `keep`, `abort`.

If `abort`, **roll back the writes** — `result.wrote` lists the files that received the appended content; the entries are appended at the tail of each file, so removing the appended block is straightforward by file length comparison. (Slice 2 ships the simple path: re-run `captureCheckpointContext` with no decisions/questions is the equivalent of "discard." Slice 3+ can build a true rollback if `abort` proves to fire frequently.)

If `keep`, proceed — files are already written.

### 8. Success message

Emit a one-screen summary:
```
✓ Checkpoint complete
  - Quick mode  → STATE.md refreshed (or "left unchanged" on discard)
  - --context   → {N} decisions, {M} questions captured (or skip)
  - Next        → continue working, or run /sig:resume after a context clear
```

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Auto-apply the refresh without confirming — saves a step." | No. `gate_strictness: strict` requires explicit user approval before any state mutation; that's the whole point of strict. |
| "Skip the orphan prompt under strict — too chatty." | D12 specifically rules orphan detection in. Without it, a crashed mid-task wedges `current_tasks[]` forever — `/sig:resume` can't recover. |
| "Auto-redact sensitive data in `--context` capture." | Never. Same rule as `/sig:add`: surface the hits, let the user decide. Auto-redact corrupts the captured decision. |
| "If `--context` is given, skip the quick-mode refresh." | No. `--context` is **additive**, not exclusive. The quick refresh has to run for the captured decisions to be situated against a fresh STATE.md. |
| "Don't bother running pre-CALIBRATE — just emit empty diff." | Wasted I/O + confusing UI. Scope-cut: refuse cleanly with the "nothing to refresh yet" message. |
| "Render the diff differently from `renderStateDiff` — make it prettier." | Use the canonical renderer. Ad-hoc rendering drifts from what other commands (S4 resume.md banner) display, fragmenting the user's mental model. |

## Gate: Checkpoint Complete

- [ ] Pre-flight scenarios handled (no `.planning/`, no STATE.md, pre-CALIBRATE).
- [ ] `gate_strictness` honored at the diff/confirm step.
- [ ] `markFresh` called on apply (last_updated + last_updated_commit advance).
- [ ] Orphan check fired (interactive prompt regardless of strictness, per D12).
- [ ] In `--context` mode: D16 dual-write hit both CONTEXT.md and DECISIONS.md.
- [ ] No new `.planning/*` writes during a `discard` path.
