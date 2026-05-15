---
name: sig:add
description: "Capture-and-route new work — appends a stamped entry to .planning/FUTURE-IDEAS.md (default) after verbatim capture, sensitive-data scrub, and atomic write. Not phase-gated. Slice 1 of M4.5.E2; cold-path interview + multi-destination routing land in Slices 2-4."
args: "[idea text]"
---

# `/sig:add` — Capture and Route

You are running `/sig:add`, a not-phase-gated capture command. Same class as `/sig:status`, `/sig:resume`, `/sig:escalate`, `/sig:calibrate` — no tier-gating preamble, no skill loading, no agent spawning. Slice 1 ships the **hot path** only: `/sig:add "idea text"` writes the entry to `.planning/FUTURE-IDEAS.md` after verbatim capture, atomic-write, lock, and sensitive-data scrub.

Cold-path naked invocation (`/sig:add` with no args) and force-route flags (`--question`, `--milestone`, `--milestone N`) land in subsequent slices (S2-S3 of M4.5.E2).

**Where work lives in Signal:**
- `FUTURE-IDEAS.md` — "someday" ideas (the default; planning phases promote from here)
- `OPEN-QUESTIONS.md` — unresolved design questions (S2)
- `MILESTONE-*.md` — concrete tasks fitting an active scope (S2)
- `DECISIONS.md` / `STATE.md` — **never** written by `/sig:add` (DECISIONS is post-deliberation; STATE is regenerated)

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/add.js` — `parseInput`, `scrubSensitive`, `buildFutureIdeasEntry`, `insertAboveFooter`, `rewriteFooter`, `atomicWrite`, `acquireLock`, `releaseLock`, `captureToFutureIdeas`, `checkBodyLength`, `BODY_LENGTH_SOFT_CAP`
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

### 2. Parse input

Call `parseInput($ARGUMENTS)`. Slice 1 supports only the bare-body form: `/sig:add "idea text"` → `{body: "idea text", flags: {}}`.

- If `body` is empty (no `$ARGUMENTS` or only whitespace): **Slice 3 will surface a single AskUserQuestion prompt here** ("What's the idea?"). For Slice 1, exit cleanly with: "No idea provided. Pass the idea as an argument: `/sig:add \"your idea here\"`."

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

Call `captureToFutureIdeas(baseDir, opts)` with:
- `body`: from Step 2 (verbatim — never modify).
- `today`: ISO `YYYY-MM-DD` from `new Date()`.
- `triggerContext`: from Step 5 (optional).
- `sensitivePrompt`: already-resolved decision wrapped in an async function (Step 3 ran the prompt; pass an `async () => 'keep'` since you've already decided).
- `bodyLengthPrompt`: same pattern from Step 4.

This handles: lock acquisition, read-current, build-entry, insert-above-footer, rewrite-footer-date, atomic-write, lock-release.

### 7. Success message

Print exactly:

```
Added to .planning/FUTURE-IDEAS.md (line {result.line}).
Review with: git diff .planning/FUTURE-IDEAS.md
Revert with: git checkout -- .planning/FUTURE-IDEAS.md
```

Do **not** preview the entry before write (capture latency dies on every confirmation step — see Anti-Rationalization below). The diff *after* write is the confirmation.

### 8. Error handling

| Error | User-facing message |
|---|---|
| `.planning/FUTURE-IDEAS.md` missing | (from `tools/lib/add.js`) "Run `/sig:init` first ..." |
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

- [ ] Either the file was written and the success message printed, OR an explicit abort/error message surfaced.
- [ ] No `.planning/*` files mutated on abort paths.
- [ ] `FUTURE-IDEAS.md` footer date matches today after a successful write.
- [ ] `.planning/.add.lock` removed (released or never acquired).
- [ ] Entry body matches user input verbatim (verifiable via `git diff`).
