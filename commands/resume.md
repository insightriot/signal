---
name: sig:resume
description: "Resume work on a Signal project. Reads PROFILE.md + STATE.md + the current phase's artifact, prints a re-orientation, and asks if you're ready to continue."
args: ""
---

# `/sig:resume` — Re-orient and Continue

You are running `/sig:resume`, a meta command that loads enough context for the user to pick up where they left off. Same class as `/sig:status`, `/sig:calibrate`, `/sig:escalate`, `/sig:new-project` — no tier-gating preamble, no skill loading, no agent spawning, no state mutation.

Where `/sig:status` is a snapshot, `/sig:resume` is a **briefing**: it actively reads the current phase's artifact(s) so you can re-anchor on the locked decisions, work done, and work remaining without manually opening 5 files.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/profile.js` — `readProfile`, `readEffectiveProfile`, `ProfileSchemaError`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `readState`, `isStateStale`, `isStaleVsOrigin`, `readSchemaDrift`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/resume.js` — `renderResumeBriefing`, `handleOrphansAtResume`, `resolveArtifactPath`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/status.js` — `nextActionForPhase`, `formatEscalationSummary`, `readOpenQuestions`, `readLandscapeMeta`, `readStateSizeForTier`, `readLayoutBanner`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/landscape.js` — `extractSection` (used to pull "What this project is" from LANDSCAPE.md when PROJECT.md Vision is still `[INFERRED]` or `[FILL IN]`)

## Workflow

### 1. Detect project state — same three branches as `/sig:status`

Try `readProfile(baseDir)`. If it throws `ProfileSchemaError`:
- "not found" → emit `Project not calibrated. Run /sig:calibrate to begin.` Exit.
- contains "schema_version" → emit `PROFILE.md uses an unsupported schema version. Upgrade Signal or run /sig:calibrate --re-calibrate.` Exit.
- otherwise → emit `PROFILE.md is malformed: {err.message}\nRun /sig:calibrate --re-calibrate to rewrite.` Exit.

If `readState(baseDir)` is `null` OR returns `state.phase === null`:
- emit the tier line + escalation summary if any + `Calibrated as {tier}; no work started yet. Run /sig:discuss to begin.` Exit.

Else continue.

### 2. Load PROJECT.md and LANDSCAPE.md (if present)

Read `.planning/PROJECT.md` (or repo-root `PROJECT.md` as a fallback for self-managed projects like the Signal build itself). Pull the **Vision / Problem Statement** (whichever heading is first) — keep to ≤ 3 sentences in the briefing.

Also call `readLandscapeMeta(baseDir)` to detect a brownfield-init'd project. If LANDSCAPE.md exists, use `extractSection(content, 'What this project is')` to pull the inferred-purpose paragraph. **Use this paragraph as the Vision fallback when PROJECT.md's Vision is still `[INFERRED — please verify]` or `[FILL IN — ...]`** — that signals the user hasn't yet vetted the auto-generated brownfield draft, and showing the inferred paragraph is more useful than showing the raw marker.

If both PROJECT.md and LANDSCAPE.md are present, prefer PROJECT.md's vetted content and fall back to LANDSCAPE.md only when markers indicate it isn't vetted yet.

### 3. Load the current phase's artifact

Use `state.phase` to pick which file(s) to read:

| Phase | Artifact(s) to load | Section to surface |
|---|---|---|
| CALIBRATE | `PROFILE.md` | Tier + calibration answers |
| DISCUSS | `CONTEXT.md`, `REQUIREMENTS.md` | "Locked Decisions"; "Functional Requirements" first 5 |
| PLAN | `{phase}-PLAN.md` | "Phase goal"; "Tasks" with checked/unchecked status |
| EXECUTE | `{phase}-PROGRESS.md` (fall back to `{phase}-PLAN.md`) | Wave / task status |
| VERIFY | `{phase}-VERIFICATION.md` | Verdict + outstanding criteria |
| REVIEW | `{phase}-REVIEW.md` | Critical / Important issue counts |
| SHIP | `{phase}-SHIP.md` (if present) or pre-ship checklist from STATE.md | Ship-checklist completion |

**Resolving `{phase}-` artifact names** — the v1 convention isn't yet locked (see `.planning/OPEN-QUESTIONS.md`). Call `resolveArtifactPath(planningDir, ARTIFACT, {currentEpic: state.current_epic, phase: state.phase})` from `tools/lib/resume.js`; it returns the first match (absolute path) or `null`, trying this precedence:

0. `{current_epic}-{ARTIFACT}.md` — the Epic-prefixed form (e.g., `M4.5.E10-PLAN.md`). **Fires only when `current_epic` is set** (a sanitized, path-confined token); a crafted `current_epic` is rejected and falls through. This pattern serves **Epic-prefixed / hand-managed projects** (Signal-on-Signal), where the maintainer writes Epic-scoped artifacts and hand-sets `current_epic` — command-driven projects write phase-prefixed artifacts and leave `current_epic` null, so pattern 0 simply never fires for them (they resolve via 1–3, unchanged).
1. `{N}-{ARTIFACT}.md` for any `N` in `[1..9]` — the numeric/GSD-style prefix (ascending-N tie-break)
2. `{ARTIFACT}.md` — the no-prefix simplified form
3. `{PHASE_NAME}-{ARTIFACT}.md` — the literal-substitution form (e.g., `PLAN-PLAN.md`)

If it returns `null`, emit a one-line note: `Note: expected artifact for {state.phase} not found — looked for {current_epic}-{ARTIFACT}.md (if current_epic set), 1-{ARTIFACT}.md, {ARTIFACT}.md, {PHASE}-{ARTIFACT}.md.` Continue with the briefing using whatever data is available.

### 3b. Staleness check + orphan detection (M4.5.E6.S4)

Two pre-render checks routed through `tools/lib/state.js` + `tools/lib/resume.js`:

1. **Staleness (local)** — call `isStateStale(baseDir)`. If `stale: true`, capture the result and pass to `renderResumeBriefing` so the banner prepends to the output (D11 + D6 scope). The 60s grace window is intentionally kept for resume (a write-then-resume burst shouldn't flag stale); the user wants the explicit "what changed?" view via `/sig:checkpoint` (which passes `bypassGrace: true`).

1a. **Staleness (origin)** — call `isStaleVsOrigin(baseDir)` from `tools/lib/state.js` and pass the result to `renderResumeBriefing` as `originDriftResult`. This reaches the network via a **bounded, hardened `git fetch`** (2s timeout + SIGKILL, `GIT_TERMINAL_PROMPT=0`, neutralized askpass, SSH BatchMode) and is **fail-open**: any failure (offline, no remote, auth-hang, timeout, diverged history) returns `{stale:false}` and renders no banner — it never blocks the briefing. The fetch writes `.git/` (FETCH_HEAD, remote refs), **not** `.planning/`, so the read-only-`.planning/` posture holds. The origin banner is **distinct** from the local one (D-E10-8): local = "your working tree moved past STATE.md"; origin = "someone pushed work you don't have" (the multi-machine case).

1b. **Schema drift** — call `readSchemaDrift(baseDir)` from `tools/lib/state.js` and pass the result to `renderResumeBriefing` as `schemaDriftResult`. It's read-only + platform-agnostic (AD2 — deliberately NOT in `/sig:doctor`, which is macOS-gated), routes through `parseFrontmatter` (not `readState`, which throws on an ahead schema), and returns `null` when there's no drift. The briefing renders this banner **above** all others: a STATE.md schema mismatch means every field the briefing reads below could be misparsed.

1c. **STATE.md size** (v0.1.6, FR2; tier-aware M5.E1.S2, FR2d) — call `readStateSizeForTier(baseDir)` from `tools/lib/status.js` and pass the result to `renderResumeBriefing` as `stateSizeResult`. Read-only + fail-open (never throws → `null` on a missing/unreadable file, or when PROFILE.md is absent/malformed). Async because it resolves the size threshold from the project tier (SKETCH 75 KB < FEATURE/SPIKE 150 KB < FULL 300 KB, flat 150 KB fallback). It's the **lowest-priority, advisory** banner (rendered last, just above the body — it doesn't cast doubt on the briefing's correctness the way schema/staleness/origin drift do).

1d. **Pre-reorg layout nudge** (M5.E2.S3.t2, FR7.2) — call `readLayoutBanner(baseDir)` from `tools/lib/status.js` and pass the returned string (or `null`) to `renderResumeBriefing` as `layoutBanner`. Read-only + **fail-open** (never throws → `null` on any error). It reads in **two tiers** (M5.E2 REVIEW, perf): a cheap capped-prefix `docs_layout_version` stamp read first (an integer stamp at/above CURRENT → silent, below → nudge — returning WITHOUT the full-corpus `senseProject` walk), then a **structural sniff** via the migrate engine's `senseProject` ONLY when the stamp is absent/unparseable (an unstamped project stays silent unless it carries pending reorg work — so a clean-but-unstamped project is never false-bannered). Same **advisory tier** as the size banner (rendered near it, never above the schema-drift banner). It's the command-path counterpart to the SessionStart hook (`hooks/warn-layout-drift.js`, S3.t1), whose stamp-first-only read the structural sniff here corrects.

#### 3c. Retro completeness (M4.5.E9.S2.t7)

Call `enumerateRetros(baseDir)` from `tools/lib/retro-index.js`. Build a summary `{total, complete, stub}` where `complete = total - stub` (and `stub = records.filter(r => r.isStub).length`). Pass as `retroSummary` to `renderResumeBriefing`. The renderer adds one line:

  `Retros:  1/6 complete (5 stubs awaiting backfill)`

or, when `total === 0` (greenfield or pre-backfill projects):

  `Retros:  0/0 (no retros yet — the first one lands at the next Epic close)`

The retro count is independent of phase / tier — it's just a hint at the index health. Greenfield projects always show `0/0` until they ship their first Epic; mid-flight projects show their current backfill state.

2. **Orphan detection** — call `handleOrphansAtResume(baseDir, {prompt})` where `prompt(orphans)` issues an `AskUserQuestion(strict-enum, [clear, keep])`:
   - Header: `Orphan tasks`
   - Question: `{N} task(s) older than 30 min with no matching commit. Clear?`
   - Options: `clear` (mark each as `aborted` via `clearCurrentTask`), `keep` (you may be mid-work; leave them).

The orphan prompt fires regardless of `gate_strictness` — orphan detection is interactive by design (per D12). Run **before** the briefing render so the briefing reflects post-clear state if the user chose `clear`.

### 4. Print the re-orientation

**Effective profile (M4.5.E11 / FR3).** The `profile` passed below is the **effective** profile: `readEffectiveProfile(baseDir, { currentEpic: state.current_epic })` (`tools/lib/profile.js`), so an Epic-scoped `{EpicID}-PROFILE.md` is honored. `readProfile(baseDir)` from Step 1 stays the **project** profile — pass its `.tier` as `projectTier` so the renderer can surface a per-Epic override (`Tier: SKETCH (Epic … override; project default FULL)`). Fail-open for this read-only briefing: if `readEffectiveProfile` throws (e.g. a malformed Epic PROFILE), fall back to the project profile so the briefing never breaks.

Call `renderResumeBriefing` from `tools/lib/resume.js` with the data loaded above. The helper handles the shape; this section documents what the helper renders so you know what to inspect / adjust.

```js
renderResumeBriefing({
  cwd: baseDir,
  state,                          // readState() output
  profile,                        // readEffectiveProfile(baseDir, {currentEpic}) — the EFFECTIVE profile
  projectTier,                    // project PROFILE .tier — surfaces the Epic override (S3.t3); null in linear
  visionText: resolvedVision,     // PROJECT.md Vision OR LANDSCAPE fallback per Step 2
  landscapeCapturedOn: lm?.capturedOn ?? null,
  lockedDecisions: …,             // first 5 bullets from CONTEXT.md § Locked Decisions
  openQuestions: …,               // first 3 headings from OPEN-QUESTIONS.md
  isStaleResult: staleResult,     // local staleness — from Step 3b(1)
  originDriftResult,              // origin drift — from Step 3b(1a); fail-open
  schemaDriftResult,             // schema drift — from Step 3b(1b); read-only
  stateSizeResult,               // STATE.md size — from Step 3b(1c); advisory, read-only
  layoutBanner,                  // pre-reorg layout nudge string|null — from Step 3b(1d); advisory, fail-open
  nextAction: nextActionForPhase(state.phase, profile.phases_skipped),
  retroSummary,                   // {total, complete, stub} — see Step 3c
});
```

The rendered briefing has these blocks (in order):

```
{If schema-drift banner active (S4.t2) — topmost, most fundamental trust signal:}
⚠ STATE.md schema drift ({status}).
   {migration pointer (behind) / upgrade-Signal note (ahead) / unreadable note}

{If local-staleness banner active (S4.t2):}
⚠ STATE.md is {N} commit(s) behind work history.
   Run /sig:checkpoint to refresh, or continue with potentially stale info.

{If origin-drift banner active (S1.t3):}
⚠ origin is {N} commit(s) ahead of your STATE.md baseline — someone pushed work you don't have.
   {If .planning/ touched:} Includes .planning/ changes — git pull before continuing so project memory doesn't fork.
   {else:} Run git pull to sync, or continue (this was a read-only check).

== Project Briefing ==

Project: {cwd}
Tier:    {formatTierLine — effective tier, with a per-Epic override surfaced: "SKETCH (Epic M4.5.E11 override; project default FULL)"; bare tier in linear mode}
Phase:   {state.phase}  ({completed-count}/{total-non-skipped} phases done)
{If LANDSCAPE.md exists, add:}
Landscape: captured {capturedOn or "date unknown"} (brownfield init)

— Vision —
{resolvedVision — see Step 2 for the LANDSCAPE fallback rule}

{If current_tasks non-empty (M4.5.E6 addition):}
— In-flight ({N}) —
{comma-separated current_tasks[].id}

{If last_completed_task present (M4.5.E6 addition):}
— Last completed —
{id} ({status}) at {shortSha}

{If blockers non-empty (M4.5.E6 addition):}
— Blockers ({N}) —
{text} ({id}, raised {age})

— Decisions locked (DISCUSS) —
{numbered list, first 5; "…and N more" if longer}

— Current phase: {state.phase} —
{phase-specific summary from the artifact loaded in Step 3}

— Open questions ({count}) —
{first 3 truncated headings; section omitted if file absent}

— Work remaining —
Next phase: {nextActionForPhase result}

Ready to continue with {next-command}? (Reply "yes" to proceed, or run any /sig:* command directly.)
```

### 5. Final prompt — "Ready to continue?"

End with the literal one-line prompt. Do **not** auto-invoke the next phase command; the user explicitly confirms (this is the safety gate that distinguishes `/sig:resume` from "auto-continue"). The user's reply lands as a normal turn — they can type `yes` (and Claude can then offer to invoke the next command), or type any other `/sig:*` command directly, or say "let me think" without anything happening.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Auto-invoke the next phase to save the user a step." | No. `/sig:resume` is a briefing, not a launcher. Auto-invocation collapses the value of explicit phase entry — users sometimes want to re-read PROFILE before continuing, or escalate first. The safety gate is the entire point. |
| "Load every artifact for every phase, just in case." | Token cost is real; load only the most-recent artifact for the current phase plus PROJECT.md + CONTEXT.md. Users who want more depth `cat` the file. |
| "Refresh STATE.md with a 'last resumed' timestamp." | `/sig:resume` is read-only by design (matches `/sig:status`). Mutation muddies the trust contract. |
| "Render the full PROJECT.md / CONTEXT.md verbatim." | Summarize. The briefing is for re-anchoring, not re-reading from scratch. |
| "Move the staleness banner to the bottom of the briefing so users see it after the situational read." | No. The banner is a **trust signal** about the briefing itself — if STATE.md is stale, every line below is potentially wrong. The banner goes **at the top**, where a user who's deciding whether to continue can see it before they invest attention in the rest. |
| "Skip the orphan prompt under `gate_strictness: off` — too chatty." | Per D12, orphan detection is always-on regardless of strictness. Without it, a crashed mid-task wedges `current_tasks[]` forever and `/sig:resume` can't recover. The prompt itself **is** the recovery mechanism. |

## Gate: Briefing Complete

- [ ] One of the 3 branches fired (uncalibrated / unbegun / in-flight) — for in-flight, the four sections all rendered
- [ ] Output ≤ 50 lines
- [ ] No `.planning/*` mtime changed
- [ ] User saw the "Ready to continue with /sig:{phase}?" prompt
