---
name: sig:status
description: "Read-only project inspection — synthesizes PROFILE.md + STATE.md (and OPEN-QUESTIONS.md if present) into a one-screen status report with tier-aware next-action guidance."
args: ""
---

# `/sig:status` — Project Inspection

You are running `/sig:status`, a read-only meta command. Your goal: read the project's `.planning/` state, render a compact one-screen summary, and tell the user what to run next.

This command is **meta** — same class as `/sig:calibrate`, `/sig:escalate`, and `/sig:new-project`. It does **not** run a tier-gating preamble (tier-gating a status command is nonsensical), does **not** load skills, and does **not** spawn agents. It also does **not** mutate any file. Re-running `/sig:status` produces the same output (modulo timestamps in the data being read).

Authoritative references (read if you need to refresh):
- `${CLAUDE_PLUGIN_ROOT}/references/profile-schema.md` — PROFILE.md format
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/profile.js` — `readProfile`, `ProfileSchemaError`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `readState`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/status.js` — `nextActionForPhase`, `readOpenQuestions`, `formatEscalationSummary`, `reachedDoneViaSkip`, `readLandscapeMeta`

## Workflow

### 1. Detect project state — three branches

Try to read `.planning/PROFILE.md` via `readProfile(baseDir)`. Three possible outcomes:

**Branch A — Not calibrated.**
`readProfile` throws `ProfileSchemaError` and `err.message` contains the substring `not found`. Before emitting, call `readLandscapeMeta(baseDir)` to see if the project was brownfield-init'd:

- **If `readLandscapeMeta` returns null** (no LANDSCAPE.md), this is a fresh, never-init'd project. Emit:

  ```
  Project not calibrated. Run /sig:calibrate to begin.
  ```

- **If `readLandscapeMeta` returns `{capturedOn}`** (LANDSCAPE.md exists), this project was init'd via `/sig:init` but the user hasn't yet calibrated. Emit:

  ```
  Brownfield init complete (landscape captured {capturedOn or "date unknown"}); not yet calibrated.
  Next: /sig:calibrate to tier this project.

  Reminder: review .planning/LANDSCAPE.md and .planning/PROJECT.md before calibrating
  so tiering reflects what's actually true (not what /sig:init inferred).
  ```

Then exit.

**Branch A.1 — schema_version mismatch.**
`readProfile` throws and `err.message` contains `schema_version`. Emit:

```
PROFILE.md uses an unsupported schema version. Upgrade Signal or run /sig:calibrate --re-calibrate to rewrite.
```

**Branch A.2 — generic malformed PROFILE.md.**
`readProfile` throws any other `ProfileSchemaError`. Emit:

```
PROFILE.md is malformed: {err.message}
Run /sig:calibrate --re-calibrate to rewrite.
```

**Branch B — Calibrated but unbegun.**
`readProfile` succeeds, but `readState(baseDir)` returns `null` OR returns an object with `phase === null` (corrupted STATE.md heading regex miss). Render the **tier line** (see Step 2.1 below) plus the escalation summary if any. If `readLandscapeMeta(baseDir)` returns non-null, also emit a `Landscape: captured {capturedOn or "date unknown"}` line. Then:

```
Calibrated as {tier}; no work started yet.
Next: /sig:discuss
```

If `readState` returned non-null but `phase === null`, append: `Note: STATE.md is missing or corrupted; showing calibrated state only.`

**Branch C — In-flight.**
Both succeed. Continue to Step 2.

### 2. Render the in-flight status report

Emit the following six fields in this order, as a markdown report. Aim for ≤30 lines of output.

#### 2.0 Version staleness check (prepended)

Before rendering 2.1, call `readStalenessWarning({ homeDir: os.homedir() })` from `tools/lib/status.js`. If it returns a string, prepend that line to the briefing (single line, no extra blank line above). If it returns null, skip silently. This is the FR6 surface added in M4.5.E8.S3 — version-check is **advisory only** and MUST NOT break `/sig:status` if the GitHub API is unreachable (try/catch is inside `readStalenessWarning`; callers don't need to wrap).

```
{stalenessWarning if non-null}

Project: {cwd}
...
```

#### 2.0b Origin-drift check (prepended)

Also before 2.1, call `isStaleVsOrigin(baseDir)` from `tools/lib/state.js`. If it returns `{stale: true}`, prepend a banner:

```
⚠ origin is {aheadCount} commit(s) ahead of your STATE.md baseline — someone pushed work you don't have.
   {if touchedPlanning:} Includes .planning/ changes — git pull before continuing so project memory doesn't fork.
   {else:} Run git pull to sync, or continue (this was a read-only check).
```

If `{stale: false}`, skip silently. Like the version check this is **advisory only** and MUST NOT break `/sig:status`: `isStaleVsOrigin` is **fail-open** (offline / no-remote / auth-hang / timeout / diverged → `{stale:false}`, never throws), and its `git fetch` is bounded (2s timeout + SIGKILL, `GIT_TERMINAL_PROMPT=0`, neutralized askpass, SSH BatchMode) — that timeout is what protects the ≤30-line, low-latency `/sig:status` contract. **Read-only note (AD7):** the fetch writes `.git/` (FETCH_HEAD, remote refs), **not** `.planning/`, so `/sig:status`'s "no `.planning/*` mtime changed" gate literally still holds.

#### 2.0c Schema-drift check (prepended, topmost)

Also before 2.1, call `readSchemaDriftBanner(baseDir)` from `tools/lib/status.js`. If it returns a string, prepend it **above** the version + origin banners — a STATE.md schema mismatch is the most fundamental trust signal (every field below is read from that STATE.md). If it returns `null`, skip silently. This is **platform-agnostic and read-only** (per AD2 — it deliberately does *not* live in `/sig:doctor`, which is macOS-gated and `~/.claude`-scoped, so a Linux/WSL tester still sees the warning). It routes through `parseFrontmatter`, not `readState`, so an ahead-schema STATE.md reports rather than crashes.

#### 2.0d STATE.md size check (advisory) — v0.1.6, FR2

Call `readStateSizeBanner(baseDir)` from `tools/lib/status.js`. If it returns a string, append it **below** the drift banners (it's the lowest-priority, advisory signal — the file being large doesn't make the status *wrong*, unlike schema/origin drift). If `null`, skip silently. Read-only whole-file `statSync`, 150 KB threshold; detect + flag only (eviction is M5). Like the other banners, advisory-only — it MUST NOT break `/sig:status`.

#### 2.1 Project + tier

Project root path (use the working directory). Tier from `profile.tier`. If `profile.metadata.escalation_history` is non-empty, append `formatEscalationSummary(profile.metadata.escalation_history)` to the tier line. Calibration date from the `YYYY-MM-DD` portion of `profile.metadata.created_at`.

```
Project: {cwd}
Tier:    {profile.tier}{escalation_summary or ''}
Calibrated: {YYYY-MM-DD from profile.metadata.created_at}
```

#### 2.2 Current phase + completed phases

```
Phase:   {state.phase}
Done:    {state.completedPhases.join(', ') or '(none)'}
```

#### 2.3 Blockers

Read `state.blockers` from the `readState` return value (schema_v1 exposes it as a structured array; legacy STATE.md callers see `[]` and should treat that as "no blockers"). If empty:

```
Blockers: (none)
```

Otherwise list each blocker — render `{blocker.text} (blk-XXXX)` per entry. Optionally include `state.current_tasks` (also from `readState`) on the same screen so the user sees what's in flight alongside what's blocked. No raw STATE.md regex here — the schema layer in `tools/lib/state.js` is the only authoritative reader.

#### 2.4 Open questions

Call `readOpenQuestions(baseDir)`. If `null` (file absent), **omit this section entirely**. Otherwise:

```
Open questions ({count}):
  - {top[0]}
  - {top[1]}
  - {top[2]}
```

(If `count > 3`, append `…and {count - 3} more`.)

#### 2.5 Last calibration / last escalation

```
Last calibrated: {YYYY-MM-DD from profile.metadata.created_at}
```

If `escalation_history` is non-empty, also emit:

```
Last escalation: {YYYY-MM-DD from history[history.length-1].timestamp}
```

If `readLandscapeMeta(baseDir)` returns non-null, also emit:

```
Landscape: captured {capturedOn or "date unknown"}
```

(This signals the project was brownfield-init'd via `/sig:init`. Greenfield projects via `/sig:new-project` won't have a LANDSCAPE.md, so the line is omitted.)

#### 2.6 Next action

Compute `next = nextActionForPhase(state.phase, profile.phases_skipped)`. Then:

- If `next` starts with `/sig:` → emit `Next: {next}`.
- If `next === 'done'`:
  - If `reachedDoneViaSkip(state.phase, profile.phases_skipped)` is `true` → `Next: done — all remaining phases are skipped for this tier.`
  - Else → `Next: done — work is complete.`

### 3. Recommended output shape

Produce the report as a single markdown block. Example for an in-flight FEATURE-tier project at PLAN with 7 open questions and no escalations:

```
Project: /Users/me/projects/url-shortener
Tier:    FEATURE
Calibrated: 2026-04-25

Phase:   PLAN
Done:    CALIBRATE (2026-04-25), DISCUSS (2026-04-25)
Blockers: (none)

Open questions (7):
  - {phase}- artifact naming convention — multi-phase semantics in a single-…
  - REVIEW and SHIP could read prior-phase artifacts more explicitly
  - state.js initState writes DISCUSS; /sig:new-project writes CALIBRATE
  …and 4 more

Last calibrated: 2026-04-25

Next: /sig:execute
```

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Users can read .planning/ themselves; this is redundant." | `/sig:status` is the diff between *has memory* and *doesn't* for project resumption. Reading 5 files manually every time you context-switch is the opposite of what `.planning/` exists to provide. |
| "Make it longer with more sections / artifact lists / activity logs." | Every line earns its place. Aim for ≤30 lines. Users wanting depth use `/sig:resume` (which reads the current-phase artifact) or `cat .planning/*.md` directly. |
| "Add a `--json` flag for hooks." | v1 has no hook needing it. Adding flags before there's a use case adds maintenance for nothing. Log to FUTURE-IDEAS if a real hook lands. |
| "Mutate state to record 'last checked' so we can show recency." | `/sig:status` is read-only by design. Mutating breaks its value as the check-without-disturbing tool. If you want recency, look at `git log -1 .planning/STATE.md`. |

## Gate: Status Complete

- [ ] One of the 3 branches fired (A / B / C) — or one of the A-error subvariants
- [ ] Output ≤ 30 lines for typical projects
- [ ] No `.planning/*` mtime changed (read-only; verify with `stat` if uncertain)
- [ ] No skills loaded, no agents spawned, no tier-gating preamble run
- [ ] Next-action recommendation honors `phases_skipped`
