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
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `readState`, `markFresh`, `detectOrphans`, `clearCurrentTask`, `touchDecisionTimestamp`, `isStaleVsOrigin`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/status.js` — `readStateSizeBannerForTier`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/evict.js` — `evictEpicNarrative` (M5.E1 FR2b evict-on-close tidy)
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
3. **Evict-on-close tidy (M5.E1 FR2b).** If `state.current_epic` is set, call `evictEpicNarrative(baseDir, state.current_epic)` from `tools/lib/evict.js`. It **self-guards** — returns `{evicted:false, reason:'not-closed'}` and changes nothing unless that Epic is genuinely closed (its `{EpicID}-RETROSPECTIVE.md` exists) and still has body narrative to evict, so a routine checkpoint on an in-flight Epic is a no-op. When it does evict (`{evicted:true}`), it moves the closed narrative to `.planning/archive/<milestone>/<epic>/STATE-NARRATIVE.md` + leaves a pointer + lifts carry-overs UP; add a `- Evicted: {archivePath}` line to the refresh banner and stage the archive file. On `{reason:'lossy-card'}`, surface the `missing` items and do **not** force — the ordered gate (`references/doc-runtime-model.md` §5) proves no-loss, not faithfulness; fix the retrospective, then re-run.

After writes, emit the **D2 mitigation banner** verbatim (the explicit "what was refreshed" readout that prevents silent-no-op confusion):

```
✓ STATE.md refreshed
  - Behind by: {diff.commitsBehind} commits since {current.last_updated_commit ?? '<none>'}
  - Tasks cleared: {comma-separated ids or '(none)'}
  - Now fresh at: {HEAD sha (short)}
```

Then call `isStaleVsOrigin(baseDir)` from `tools/lib/state.js` (after `markFresh`, so the baseline is the just-advanced HEAD). If it returns `{stale: true}`, append one advisory line — the refresh made STATE.md match local reality, but the *remote* is still ahead, so a `git pull` is the next move:

```
⚠ origin is {aheadCount} commit(s) ahead — git pull to sync{ (includes .planning/) if touchedPlanning}.
```

`isStaleVsOrigin` is **fail-open** (offline / no-remote / auth-hang / timeout → `{stale:false}`, never throws) with a bounded hardened fetch; if it returns `{stale:false}`, skip the line silently. The fetch writes `.git/`, not `.planning/`.

Then (v0.1.6, FR2; tier-aware M5.E1.S2, FR2d) call `readStateSizeBannerForTier(baseDir)` from `tools/lib/status.js`. If it returns a string, append it as a final advisory line — a checkpoint is exactly when a growing STATE.md is worth flagging (`/sig:checkpoint` is the refresh surface). If `null`, skip silently. Read-only + fail-open whole-file `statSync`; the threshold is resolved from the project tier (SKETCH 75 KB < FEATURE/SPIKE 150 KB < FULL 300 KB, flat 150 KB fallback when no PROFILE).

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

For each non-empty response, split into trimmed lines, then call (default `acknowledgeSensitive: false`):
```
const result = await captureCheckpointContext(baseDir, { decisions, questions });
```

`captureCheckpointContext` (S6.t1 contract — matches `tools/lib/add.js`) scrubs **before** any write. There are three outcomes:

1. **No hits, writes proceed.** `result.wrote.length > 0`, `result.sensitiveHits === []`. Continue to step 8.
2. **Hits found, default refuse-to-write.** `result.wrote === []`, `result.aborted === 'sensitive-data-pending'`, `result.sensitiveHits` lists the matches. **No files mutated.** Surface the hits via `AskUserQuestion(strict-enum, [keep, abort])`:
   - Header: `Sensitive data`
   - Question: `Detected {N} potential secret(s) in the input — {types}. Capture verbatim?`
   - Options: `keep`, `abort`.
   - On `keep`: re-call `captureCheckpointContext(baseDir, { decisions, questions, acknowledgeSensitive: true })`. Writes happen now; `result.sensitiveHits` is still surfaced for audit. Continue to step 8.
   - On `abort`: do nothing — no writes happened, nothing to roll back. Continue to step 8 with the discard-summary line.
3. **Acknowledged path.** When the caller already passed `acknowledgeSensitive: true` (the re-call above), writes proceed and `result.aborted` is `undefined`.

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
