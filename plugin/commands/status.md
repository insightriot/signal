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
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/profile.js` — `readProfile`, `readEffectiveProfile`, `ProfileSchemaError`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `readState`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/status.js` — `describeNextAction`, `formatNextActionCopy`, `readOpenQuestions`, `formatEscalationSummary`, `reachedDoneViaSkip`, `readLandscapeMeta`, `readLayoutBanner`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/plugin-binding.js` — `readBindingBanner`

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

#### 2.0-pre Stale plugin binding (prepended above everything)

Call `readBindingBanner({ homeDir: os.homedir() })` from `tools/lib/plugin-binding.js`. If it returns a string, prepend it **above every other banner**, including 2.0's staleness warning. If `null`, skip silently. Read-only, offline, two file reads, **fail-open** (never throws).

This is B52: Claude Code resolves a plugin's install path **once, at session start**, and holds it for the life of the process — so a session alive across an auto-update keeps running the version it started with while every config file on disk correctly records the new one. Three live sightings in six days; one silently discarded a six-phase ledger, another re-issued an instruction a release had deleted.

It compares the copy **this process actually resolved** (derived from the module's own path — `CLAUDE_PLUGIN_ROOT` states where the plugin is *supposed* to be, and this bug is exactly the disagreement) against what `installed_plugins.json` records. A bound root outside the plugin cache is a local/dev install and stays silent.

**Why here and not only in the SessionStart hook** (`hooks/warn-stale-plugin-binding.js`): the binding is resolved before that hook runs, so an update landing mid-session is invisible to it. `/sig:status` re-reads both files at the moment of use — the only moment that can observe it. It sorts above 2.0 because 2.0 asks *is a newer release available?* while this asks *is the code answering you the code you installed?* — and a stale binding makes every other line in the report, this one included, the output of a retired release.

#### 2.0 Version staleness check (prepended)

Before rendering 2.1, call `readStalenessWarning({ homeDir: os.homedir() })` from `tools/lib/status.js`. If it returns a string, prepend that line to the briefing (single line, no extra blank line above). If it returns null, skip silently. This is the FR6 surface added in M4.5.E8.S3 — version-check is **advisory only** and MUST NOT break `/sig:status` if the GitHub API is unreachable (try/catch is inside `readStalenessWarning`; callers don't need to wrap).

```
{bindingBanner if non-null}
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

Call `readStateSizeBannerForTier(baseDir)` from `tools/lib/status.js` (tier-aware — M5.E1.S2, FR2d). If it returns a string, append it **below** the drift banners (it's the lowest-priority, advisory signal — the file being large doesn't make the status *wrong*, unlike schema/origin drift). If `null`, skip silently. Read-only whole-file `statSync`; threshold is resolved from the project tier (SKETCH 75 KB < FEATURE/SPIKE 150 KB < FULL 300 KB, flat 150 KB fallback when no PROFILE). Fail-open — like the other banners, advisory-only, it MUST NOT break `/sig:status`.

#### 2.0e Pre-reorg layout check (advisory) — M5.E2.S3.t2, FR7.2

Call `readLayoutBanner(baseDir)` from `tools/lib/status.js`. If it returns a string, append it in the **advisory tier** alongside the size banner (below the schema/origin/staleness drift banners — a project predating the current docs layout doesn't make the status *wrong*). If `null`, skip silently. It nudges a project whose `.planning/` predates the current docs layout to run `/sig:docs-migrate`. Read-only and **fail-open**, with a **two-tier** read (M5.E2 REVIEW, perf): a cheap capped-prefix `docs_layout_version` stamp read first — an integer stamp at/above CURRENT is silent, below CURRENT nudges, and either way it returns WITHOUT the full-corpus `senseProject` walk — and only an absent/unparseable stamp falls through to the migrate engine's **structural sniff** (`senseProject`: an unstamped project stays silent unless it actually carries pending reorg work, so a clean-but-unstamped project is never false-bannered). ANY error (unreadable STATE.md, a parse hiccup) degrades to `null` — advisory-only, it MUST NOT break `/sig:status`. This is the command-path counterpart to the SessionStart hook (`hooks/warn-layout-drift.js`, S3.t1); the hook's stamp-first-only read would false-banner an unstamped-conformant project, which the structural sniff here fixes.

#### 2.1 Project + tier

Project root path (use the working directory). **Effective tier (M4.5.E11 / FR3):** compute the tier body with `formatTierLine({ effectiveTier: effective.tier, projectTier: project.tier, currentEpic: state.current_epic })` (`tools/lib/status.js`), where `effective = readEffectiveProfile(baseDir, { currentEpic: state.current_epic })` and `project = readProfile(baseDir)` (the Step 1 read). When an Epic overrides the project tier this renders `SKETCH (Epic M4.5.E11 override; project default FULL)` — shadowing is never silent; in linear mode it's the bare tier, byte-identical to pre-E11. Fail-open: if `readEffectiveProfile` throws (malformed Epic PROFILE), use the project profile so `/sig:status` never breaks. Then, if `profile.metadata.escalation_history` is non-empty, append `formatEscalationSummary(...)`. Calibration date from the `YYYY-MM-DD` portion of `profile.metadata.created_at` (the effective profile's).

```
Project: {cwd}
Tier:    {formatTierLine result}{escalation_summary or ''}
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

Compute `desc = describeNextAction(state.phase, profile.phases_skipped)` — the **fail-open** read (`B70`). `nextActionForPhase` **throws** on a `phase` outside the canonical seven, which is 5 of 12 real projects; every neighbouring optional read here is fail-open and this one was not. Then:

- If `desc.recognized` is `false` → emit `formatNextActionCopy(desc)`: the phase is not one Signal recognizes, a one-line excerpt of what STATE.md holds, and the seven valid values. **Emit the rest of the report normally** — an unrecognized phase invalidates the next-action line, not the whole status.
- Else if `desc.action` starts with `/sig:` → emit `Next: {desc.action}`.
- Else if `desc.action === 'done'`:
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

### Decision queue depth (`B113`'s neighbour) — say what a run parked

Call `readQueueAdvisory(baseDir)` from `tools/lib/status.js` and print the returned string (or
nothing on `null`). Read-only, offline, **fail-open**.

It renders only when `.planning/DECISION-QUEUE.md` has entries: unanswered count when any are
open, a one-line all-answered note otherwise, and **silence when the queue has never been used**
— which must not render as `0 of 0`, because that implies a run happened.

**Advisory, never a gate.** An unanswered queue is a fact about a run that already finished, not
an error. What it measures is the *attention setting*: a queue filling faster than it drains means
the dial is wrong for this project, and that is the reading it exists to produce.

⚠ **This is the read half only.** Nothing writes to the queue outside tests yet, so `all answered`
is honest about the file and says nothing about whether deferral is happening.

Render it in the **advisory tier**, alongside the tier advisory — never above the schema-drift or
stale-binding banners, which cast doubt on the reading itself.

### Tier advisory (B90) — say that the dial turns down

Call `readTierAdvisory(baseDir)` from `tools/lib/status.js` and print the returned string (or
nothing on `null`). Read-only, offline, **fail-open**.

It fires on exactly one situation: **project tier is FULL and no `{UnitID}-PROFILE.md` exists
anywhere** — i.e. every unit of work is paying all seven phases and the per-unit dial has never
been used. It states that FULL is a **ceiling, not a floor**, and names the two ways down (a
per-unit profile; `/sig:escalate` downward).

**Advisory, never a gate.** The right tier is a judgment call, and a project legitimately at FULL
for everything must not be nagged into lying about its work. It says the thing once and stops.

**Why a check and not a paragraph** (`B90`): per-unit tiering, de-escalation and `phases_skipped`
have all existed for releases, and every doc that introduced them said the dial only turns up.
Measured 2026-08-08 across 12 local projects — **7 ran FULL, exactly 1 had ever written a per-unit
profile.** Writing the rule more carefully is the remedy that produced that number
(`analysis/UNREACHED-MECHANISM-ANALYSIS.md`).

Render it in the **advisory tier**, alongside the STATE-size and layout banners — never above the
schema-drift or stale-binding banners, which cast doubt on the reading itself.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Users can read .planning/ themselves; this is redundant." | `/sig:status` is the diff between *has memory* and *doesn't* for project resumption. Reading 5 files manually every time you context-switch is the opposite of what `.planning/` exists to provide. |
| "Add a `--json` flag for hooks." | v1 has no hook needing it. Adding flags before there's a use case adds maintenance for nothing. Log to FUTURE-IDEAS if a real hook lands. |
| "Mutate state to record 'last checked' so we can show recency." | `/sig:status` is read-only by design. Mutating breaks its value as the check-without-disturbing tool. If you want recency, look at `git log -1 .planning/STATE.md`. |

### Output contract (shaping failures — stated as recipes, `B38`)

These are not prohibitions. A prohibition is the right form when the failure is *discipline* —
knowing the rule and skipping it under pressure. It is the **wrong** form when the output merely
comes out the wrong shape, where head-to-head wording tests measured the prohibition arm producing
**more** of the unwanted content than a positive recipe, and worse than no guidance at all.
So these say what the output IS. See `references/anti-rationalization-forms.md`.

- **The report is one screen: the blocks specified below, and nothing else.** A status nobody finishes reading is a status nobody read.


## Gate: Status Complete

- [ ] One of the 3 branches fired (A / B / C) — or one of the A-error subvariants
- [ ] Output ≤ 30 lines for typical projects
- [ ] No `.planning/*` mtime changed (read-only; verify with `stat` if uncertain)
- [ ] No skills loaded, no agents spawned, no tier-gating preamble run
- [ ] Next-action recommendation honors `phases_skipped`
