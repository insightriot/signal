---
name: sig:update
description: "Report the installed Signal version against what's available, show the CHANGELOG entries in between, update on confirmation, and state plainly that a restart is required. Read-only until you confirm; fail-open offline. Not phase-gated."
---

# `/sig:update` — What would I be getting?

You are running `/sig:update`, a not-phase-gated meta command. Same class as `/sig:status`, `/sig:index`, `/sig:doctor` — no tier-gating preamble, no skill loading, no agent spawning, no `.planning/` writes.

**Why this exists.** `/plugin` tells you a *number* changed. It cannot tell you **what you would be getting**, so deciding whether to update means leaving the tool and reading a changelog — and menu-diving for something that should be one command.

**And it exists because of `B58` specifically.** `marketplace.json` pinned a `sha` two releases behind its `ref`, so every install since v0.1.14 silently delivered v0.1.13. The user found it **by chance**, while menu-diving, twenty minutes after v0.1.15 shipped — having been told *"sig is already at the latest version (0.1.13)."* The report was truthful; the manifest was lying to it. Signal, whose entire premise is noticing drift, had nothing to say about its own.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/update.js` — `parsePluginList`, `findPluginVersion`, `compareVersions`, `changelogBetween`, `renderUpdateReport`, `RESTART_NOTICE`

## Workflow

### 1. Read the installed version

Prefer the **structured** source: `plugin.json` in the installed plugin directory (`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`). It is a version-stamped JSON file and cannot be mis-parsed.

Fall back to `claude plugin list` → `findPluginVersion(stdout, 'sig')`. **That output has no `--json` flag** (confirmed by running it), so the fallback parses a human format that is not a contract. When it does not match, `findPluginVersion` returns `null` and the report says *"could not determine"* — it never guesses. Inventing a version is precisely how `B58` stayed invisible for two releases.

### 2. Read the available version

Run `claude plugin marketplace update` to refresh the marketplace, then read the version it now reports for `sig`.

**Fail open.** Any failure — offline, no marketplace, a non-zero exit, a timeout — means `available` is `null`, and `renderUpdateReport` prints one honest line saying the marketplace could not be reached. **Nothing is changed and no version is guessed at** (FR6.4).

### 3. Show the delta — the half `/plugin` cannot do

Call `changelogBetween(changelogText, installed, available)` against the marketplace copy of `CHANGELOG.md`. It returns every released version strictly newer than what you have, newest first, each with its one-line release name and body. `[Unreleased]` is skipped — it is not a version anyone can install.

If no changelog can be read, the report says the delta is **unknown** and still prints both version numbers. A number you can trust plus an admitted gap beats a confident summary of nothing.

### 4. Render, then ask

Print `renderUpdateReport({installed, available, entries, offline})` verbatim.

If — and only if — the installed version is behind, ask a `strict-enum [update, not now]`:
- Header: `Update Signal`
- Question: `Update sig {installed} → {available}?`

**`not now` changes nothing.** This command is read-only until the user says otherwise.

### 5. On confirm: update, then state the restart

Run `claude plugin update sig`, then print `RESTART_NOTICE` verbatim:

> Restart Claude Code to pick this up — a session binds to one plugin version for its whole life, so the update is inert until you do.

**Never restart anything, and never imply it happened.** This is `B52`, and the user explicitly asked for the restart to be *surfaced* so the timing is theirs to choose. The notice is a statement, not an action.

The constraint is real, not a rough edge: the session that built this command ran bound to **v0.1.13** while the repo was at **v0.1.15** — and the v0.1.15 payload was already in the cache. Two releases of command text were sitting on disk, unreachable, for the life of that session.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Parse the version out of `claude plugin list` and move on." | Prefer the structured `plugin.json`. The list output has no `--json` and its format is not a contract; when it changes, report *unknown* rather than a plausible wrong number. `B58` was two releases of a plausible wrong number. |
| "Just show the version numbers — the changelog is a nice-to-have." | The changelog delta **is** the requirement. A number tells you something changed; it does not tell you whether you want it, which is the exact gap this command was asked for. |
| "Restart for the user — it's one more step otherwise." | No. `B52` makes the restart consequential, and the user asked to own the timing. State it; never do it. |
| "Skip the restart line when the update is small." | It is stated on **every** successful update, and a test pins the wording. A session on the old version does not care how small the release was. |
| "Offline? Assume they're current." | That is `B58`'s failure exactly — a confident, wrong "you're up to date." Say the marketplace could not be reached and change nothing. |

## Gate: Update Complete

- [ ] Both versions reported, or an honest statement of which one could not be read
- [ ] When behind: the CHANGELOG entries in between were shown, or the delta was declared unknown
- [ ] Nothing was changed without an explicit confirmation
- [ ] On a successful update, `RESTART_NOTICE` was printed verbatim
- [ ] No `.planning/` file was written
