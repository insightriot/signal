---
name: sig:add
description: "Capture-and-route new work — appends a stamped entry to .planning/FUTURE-IDEAS.md (default) after verbatim capture, sensitive-data scrub, and atomic write. Route explicitly with --question (OPEN-QUESTIONS.md) or --milestone [N] (a milestone holding section). Not phase-gated. Naked-invocation interview lands in a subsequent slice of M4.5.E2."
args: "[idea text]"
---

# `/sig:add` — Capture and Route

You are running `/sig:add`, a not-phase-gated capture command. Same class as `/sig:status`, `/sig:resume`, `/sig:escalate`, `/sig:calibrate` — no tier-gating preamble, no skill loading, no agent spawning. The **hot path** is `/sig:add "idea text"`, which writes the entry to `.planning/FUTURE-IDEAS.md` after verbatim capture, atomic-write, lock, and sensitive-data scrub.

Two force-route flags send the capture somewhere other than the default:
- `--question "…"` → `.planning/OPEN-QUESTIONS.md` (the unresolved-design-question shape).
- `--milestone [N] "…"` → a `## Captured via /sig:add` holding section in a milestone file (`--milestone` with no `N` targets the current milestone from STATE.md; `--milestone 5` targets `MILESTONE-5.md`).

Routing is **flags or nothing in between**: with no flag, capture always lands in `FUTURE-IDEAS.md` — there is no heuristic that re-routes based on what you typed. Naked invocation (`/sig:add` with no args) prompts once for the idea and lands in a subsequent slice of M4.5.E2.

**Where work lives in Signal:**
- `FUTURE-IDEAS.md` — "someday" ideas (the default; planning phases promote from here)
- `OPEN-QUESTIONS.md` — unresolved design questions (`--question`)
- `MILESTONE-*.md` — concrete tasks fitting an active scope (`--milestone [N]`, captured to a holding section — never into the structured plan body)
- `DECISIONS.md` / `STATE.md` — **never** written by `/sig:add` (DECISIONS is post-deliberation; STATE is regenerated)

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/add.js` — `parseInput`, `resolveDestination`, `scrubSensitive`, `buildFutureIdeasEntry`, `buildOpenQuestionsEntry`, `buildMilestoneEntry`, `insertAboveFooter`, `rewriteFooter`, `atomicWrite`, `acquireLock`, `releaseLock`, `captureToFutureIdeas`, `captureToOpenQuestions`, `captureToMilestone`, `checkBodyLength`, `BODY_LENGTH_SOFT_CAP`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/milestones.js` — `currentMilestone`, `listMilestones` (target resolution for `--milestone [N]`)
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/state.js` — `readState` (for trigger-context detection in mid-phase captures)
- `${CLAUDE_PLUGIN_ROOT}/references/question-patterns.md` — `3+other` and `strict-enum` patterns for the prompts below
- `.planning/FUTURE-IDEAS.md` — the default destination; entry shape is defined by `buildFutureIdeasEntry`

## Workflow

### 1. Pre-flight

- Resolve the project root (typically cwd, but verify by checking for `.planning/`).
- If `.planning/FUTURE-IDEAS.md` does **not** exist:
  - If `.git/` exists with tracked source files → "This looks like a brownfield repo. Run `/sig:init` first, then `/sig:add` will work."
  - Else → "No project detected. Run `/sig:new-project` to start fresh."
  - Exit non-zero. (Brownfield-vs-greenfield enrichment lives in Slice 4; Slice 1 surfaces the generic "Run `/sig:init` first" error from `tools/lib/add.js`.)
- `.gitignore` check (same rule as every other write-to-`.planning/` command): if any line would silence `.planning/`, warn the user, explain why `.planning/` must be tracked, offer to remove. Do not proceed without confirmation. See `commands/calibrate.md:98-102` for the canonical pattern.

### 2. Parse input and resolve the destination

Call `parseInput($ARGUMENTS)` → `{body, flags}`. The bare-body form (`/sig:add "idea text"`) returns `{body: "idea text", flags: {}}`. The recognized destination flags are:

- `--question` — boolean; routes to `.planning/OPEN-QUESTIONS.md`.
- `--milestone [N]` — `--milestone` alone routes to the current milestone (resolved from STATE.md `current_epic`); `--milestone 5` / `--milestone 4.5` routes to `MILESTONE-{N}.md`. A non-numeric token after `--milestone` is treated as body, not as `N`.

Everything that isn't a flag (or a flag's consumed value) is the verbatim body — `parseInput` never smart-quotes or normalizes the words.

Then call `resolveDestination(flags)` to classify the target **before** acquiring the lock or touching any file:

- No destination flag → `{destination: 'future-ideas'}` (the default).
- `--question` → `{destination: 'open-questions'}`.
- `--milestone [N]` → `{destination: 'milestone', milestoneArg}` (`milestoneArg` is `null` for the current milestone, else the `N` string).
- **More than one destination flag** (e.g. `--question --milestone`) → `resolveDestination` throws. Surface the message and exit non-zero — no lock, no write (FR4). This is why `resolveDestination` runs first: a conflicting-flags invocation must fail before any side effect.

Empty-body handling — the **naked-invocation interview** (S3 / FR5):

- If `body` is non-empty → this is an **instant capture** (the hot path). Per Decision 4, quoted capture is *always* instant: even when the body ends in `?` or starts with `fix`/`bug`/`TODO`, there is no routing prompt and no interview. Proceed to the scrub/capture steps with that body.
- If `isBlank(parseInput($ARGUMENTS).body)` (no `$ARGUMENTS`, or only whitespace) **and no destination flag is present** → run the naked-invocation interview:
  1. Ask exactly ONE question using the `open-ended` pattern in `references/question-patterns.md` (`§ 3. Open-ended` → plain text question, **not** `AskUserQuestion`): **"What's the idea?"** Plain English only — no Signal vocabulary (R6); don't say "FUTURE-IDEAS altitude" or "capture spine," just ask for the idea.
  2. If the user's answer `isBlank(answer)` (empty or only whitespace) → **abort cleanly**: print "No idea captured." and exit 0. Do **not** call any capture function. Because the lock is acquired only inside Step 6 (capture), an abandoned/empty naked invocation never creates `.planning/.add.lock` (FR5.2 — no write, no lock).
  3. Otherwise use the answer verbatim as the `body` and continue to Step 3 (scrub). A naked invocation always files to `FUTURE-IDEAS.md` — there are **no** destination heuristics (Decision 5): naked = ask once, file to the default.

> This is an `open-ended` question used outside `new-project` / `escalate` / phase openings, justified here per the question-patterns escape clause: `/sig:add` naked invocation *opens* a capture flow with genuinely unknown intent ("what's the idea?"), which no enum or 3+other option set could anticipate. Decision 5 explicitly cuts the heuristic 3+other reroute the 2026-05-14 plan once proposed.

### 3. Sensitive-data scrub

Call `scrubSensitive(body)`. If `hits.length > 0`:
- Surface the matches via `AskUserQuestion(strict-enum, [keep, abort])` per `references/question-patterns.md § Rendering`. Question wording:
  - Header: `Sensitive data`
  - Question: `Detected {N} potential secret(s) in the body — {comma-separated hit types}. Capture verbatim?`
  - Options: `keep` (write verbatim — body is yours), `abort` (don't write).
- On `abort`, exit cleanly (no file write). On `keep`, proceed.
- **Never auto-redact silently** — fidelity-loss is worse than the false-positive prompt cost.

### 4. Body-length check

Call `checkBodyLength(body)`. If `tooLong`:
- Surface via `AskUserQuestion(strict-enum, [keep, abort])`:
  - Header: `Long body`
  - Question: `Body is {length} chars (soft cap {BODY_LENGTH_SOFT_CAP}). Continue?`
  - Options: `keep`, `abort`.
- On `abort`, exit cleanly. On `keep`, proceed.

### 5. Optional trigger-context derivation

If `readState(baseDir)` returns a non-null phase, derive a one-phrase trigger context for the entry's Status line:
- Phase `EXECUTE` + current milestone `M4.5.E2` (from STATE.md) → `mid-EXECUTE on M4.5.E2`
- Phase `PLAN` → `during PLAN on {milestone}`
- Otherwise → omit.

Pass this as `triggerContext` to `captureToFutureIdeas`.

### 6. Capture

Dispatch on the destination resolved in Step 2. Every capture function shares the same `opts`:
- `body`: from Step 2 (verbatim — never modify).
- `today`: ISO `YYYY-MM-DD` from `new Date()`.
- `triggerContext`: from Step 5 (optional).
- `sensitivePrompt`: already-resolved decision wrapped in an async function (Step 3 ran the prompt; pass an `async () => 'keep'` since you've already decided).
- `bodyLengthPrompt`: same pattern from Step 4.

- `future-ideas` → `captureToFutureIdeas(baseDir, opts)` — inserts above the `*Last updated:*` footer and rewrites the footer date.
- `open-questions` → `captureToOpenQuestions(baseDir, opts)` — appends at end-of-file in the OPEN-QUESTIONS Status/Resolve-by shape (no footer to rewrite).
- `milestone` → `captureToMilestone(baseDir, {...opts, milestoneArg})` — find-or-create the `## Captured via /sig:add` holding section near the end of the target milestone file and append the entry there. It **never** edits the structured plan body. `milestoneArg: null` resolves the current milestone from STATE.md; if there is none, it throws the no-current-milestone error (FR2.2). An explicit `--milestone N` whose `MILESTONE-N.md` does not exist throws the file-absent error (FR2.4 — no scaffolding).

All four share the same spine: scrub + body-length check run before the lock; then lock acquisition, read-current, build-entry, insert, atomic-write, lock-release.

### 7. Success message

Print exactly, substituting the destination's actual relative path (`result.path` relative to the project root) — `.planning/FUTURE-IDEAS.md` for the default, `.planning/OPEN-QUESTIONS.md` for `--question`, the resolved `.planning/MILESTONE-{N}.md` for `--milestone [N]`:

```
Added to {path} (line {result.line}).
Review with: git diff {path}
Revert with: git checkout -- {path}
```

Do **not** preview the entry before write (capture latency dies on every confirmation step — see Anti-Rationalization below). The diff *after* write is the confirmation.

### 8. Error handling

| Error | User-facing message |
|---|---|
| Destination file missing | (from `tools/lib/add.js`) "Run `/sig:init` first ..." — names the resolved destination. |
| Multiple destination flags | (from `resolveDestination`) "`/sig:add` accepts only one destination flag ... Pick one." Exit non-zero **before** any lock or write (FR4). |
| `--milestone` with no current milestone | (from `captureToMilestone`) "no current milestone is set in STATE.md ... Pass an explicit `--milestone N`." No write (FR2.2). |
| `--milestone N` file absent | (from `captureToMilestone`) "that milestone file does not exist ... Scaffolding a new milestone is out of scope for `/sig:add`." No auto-create, no write (FR2.4). |
| Lock contention | "Another `/sig:add` is running; retry in <30s." |
| Sensitive-data abort | "Capture aborted — sensitive content detected. No file written." |
| Body-length abort | "Capture aborted — body too long. No file written." |
| `EXDEV` cross-FS | Silent fallback in atomicWrite; user sees normal success. |
| Other I/O failure | Propagate the error verbatim. The user has `git diff` to inspect any partial state. |

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Just use `appendFile` — `atomicWrite` is overkill." | No. Markdown files are the entire product database. `appendFile` isn't atomic on crash. Per plan locked decision #7. |
| "Skip the lock — solo dev never races." | Cheap to keep; the corruption mode is silent. Per plan locked decision #8. |
| "Auto-redact secrets without asking." | No. Silent modification of user input is the worst failure mode — user can't trust what was captured. Always prompt; never auto-redact. Per plan locked decision #14. |
| "Show entry preview before write so user can confirm." | No. Capture latency dies on confirmation steps. Diff *after* write is the confirmation. Linear "C" lesson; GSD `--note` pattern. Per plan locked decision #6. |
| "Tidy / smart-quote / capitalize the body." | No. **Verbatim capture is non-negotiable.** The user's exact phrasing is the signal. From GSD `note.md`: *"Never modify the note text — capture verbatim, including typos."* Per plan locked decision #5. |
| "Add a `## Recently captured` summary at the top of the file." | No. The file's existing structure (heading → entries separated by `---` → footer) is the contract. New entries land above the footer in the same shape as existing ones. |
| "Write to a different file if FUTURE-IDEAS.md is too long." | No. File size isn't a concern at scale. Single file = single grep target = single read. |

## Gate: Capture Complete

- [ ] Either the destination file was written and the success message printed, OR an explicit abort/error message surfaced.
- [ ] No `.planning/*` files mutated on abort paths (incl. the multi-flag and milestone-resolution errors, which refuse before any lock or write).
- [ ] For a FUTURE-IDEAS write: footer date matches today afterward (OPEN-QUESTIONS and milestone holding sections have no footer to rewrite).
- [ ] `.planning/.add.lock` removed (released or never acquired).
- [ ] Entry body matches user input verbatim (verifiable via `git diff`).
