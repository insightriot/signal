# Signal Hooks — API Reference

Signal wires three Claude Code hooks (`hooks/hooks.json`). All three are
**fail-open**: any error, missing file, or unexpected input results in a clean
exit that lets Claude Code proceed normally — a hook must never break a session.
Only one hook can *block* an action (`check-state-write.js`, by design), and it
blocks exactly one thing: a STATE.md SHIP write that would skip the retro gate.

This file is the contract for anyone editing the hooks or debugging why one did
(or didn't) fire. It mirrors `references/state-schema.md` in structure.

## Wiring (`hooks/hooks.json`)

| Event | Matcher | Command | Reads stdin? | Can block? |
|---|---|---|---|---|
| `SessionStart` | *(none — every start)* | `bash …/hooks/session-start.sh` | no | no |
| `SessionStart` | `resume` | `node …/hooks/warn-dirty-execute.js` | **no** (cwd-driven) | no |
| `PreToolUse` | `Edit\|Write` | `node …/hooks/check-state-write.js` | **yes** | **yes** (exit 2) |

The command paths use `${CLAUDE_PLUGIN_ROOT}`, so the hook scripts resolve
relative to the installed plugin, while the *project* they act on is the
session's working directory (see the cwd-vs-stdin asymmetry below).

## The three events

### `SessionStart` (unmatched) → `session-start.sh`

- **Trigger:** every session start — `startup`, `resume`, and `clear`.
- **stdin:** ignored.
- **Reads:** `.planning/STATE.md` in the **current working directory** (if present).
- **stdout / exit:** prints the `[signal] Active project detected…` banner + the
  first 20 lines of STATE.md, then `[signal] Plugin loaded. Commands: …`. Always
  exits 0. (This is the banner you see at the top of a fresh Signal session.)
- **Fail-open:** if the plugin `state/` dir or `.planning/STATE.md` is absent, it
  prints a reduced banner and still exits 0.

### `SessionStart(resume)` → `warn-dirty-execute.js`

- **Trigger:** session `resume` only (the `matcher: "resume"` restricts it).
- **stdin:** **ignored** (AD9). The lever is `process.cwd()`, not the payload.
- **Reads:** `.planning/STATE.md` + the matching `.planning/MILESTONE-{N}.md`
  (derived from `current_epic`, e.g. `M4.5.E3` → `MILESTONE-4.5.md`) in the cwd.
- **What it does:** if the project is mid-`EXECUTE` for an Epic that the milestone
  shows shipped but which has **no retro file**, it emits a high-visibility
  warning so the gap surfaces the moment the session opens (the D-E9-8 layer-3
  net for "context cleared between EXECUTE finishing and `/sig:ship`").
- **stdout / exit:** on a dirty match, one line of JSON:

  ```json
  {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…warning…"}}
  ```

  `exit 0` is required for the `additionalContext` to be injected. On no match
  (or any missing/unreadable file), it writes nothing and exits 0.
- **Fail-open:** no STATE.md / no frontmatter / no `current_epic` / no milestone
  file → silent `exit 0`.
- **Covered by:** `tests/hook-warn-dirty-execute.test.js` (spawn harness) proves
  the stdout/exit contract; `tests/hook-state-write.test.js` proves the
  `detectDirtyExecute` decision logic.

### `PreToolUse(Edit|Write)` → `check-state-write.js`

- **Trigger:** before every `Edit` or `Write` tool call (`matcher: "Edit|Write"`).
- **stdin:** **required** — the Claude Code hook event JSON:

  ```json
  {"tool_name":"Edit|Write","tool_input":{"file_path":"…","content":"…","old_string":"…","new_string":"…","replace_all":false}}
  ```

- **What it does:** ignores everything except a write whose `file_path` matches
  `(^|/)\.planning/STATE\.md$`. For that, it computes the *proposed* post-write
  content (Write → `content`; Edit → apply `old_string`→`new_string` to the
  current file) and runs `checkProposedStateWrite`. If the write marks an
  Epic-close SHIP without a retro on disk, it **blocks**.
- **exit:** `2` + a `[signal:check-state-write]` stderr line to **block** the
  write (surfaces to the user); `0` to allow. `baseDir` is derived from the
  file path (`resolve(file_path, '..', '..')`), NOT from cwd.
- **Fail-open:** no stdin, malformed JSON, non-Edit/Write tool, a non-STATE path,
  a missing Edit target, or a malformed Edit (no `old_string`) → `exit 0` (allow).
  A hook bug must never wedge normal editing.

## The cwd-vs-stdin asymmetry (read this before editing a hook)

The two `SessionStart` hooks and the `PreToolUse` hook derive the **project
directory** three different ways — mixing them up is the most likely way to
break a hook silently:

- `session-start.sh` and `warn-dirty-execute.js` use **`process.cwd()`** — they
  assume Claude Code spawns the hook with cwd = the project root. They ignore
  stdin entirely.
- `check-state-write.js` uses the **`tool_input.file_path` from stdin** and walks
  up two directories. It never trusts cwd (an Edit can target any path).

So: a `SessionStart` hook that can't find `.planning/` is almost always a
**cwd** problem; a `PreToolUse` hook that misfires is almost always a **stdin /
file_path** problem. Piping a payload into a SessionStart hook does nothing;
setting cwd on a PreToolUse hook does nothing.

## SessionStart stdin/stdout contract (the external Claude Code shape)

For reference — the shape Claude Code sends/expects, even though Signal's
SessionStart hooks ignore the stdin half:

- **stdin:** `{session_id, transcript_path, cwd, hook_event_name:"SessionStart", source}`
  where `source ∈ {startup, resume, clear}` (`compact` is documented but
  unconfirmed). `matcher:"resume"` fires only when `source === "resume"`.
- **stdout:** `{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:"…"}}`.
  **`exit 0` is mandatory** for the injection to take effect; a SessionStart hook
  cannot block.

## Fail-open convention

Every Signal hook treats "I'm not sure" as "allow / stay silent." Concretely:
wrap file reads and `JSON.parse` in try/catch and `exit 0` on failure; guard on
the exact tool / path / phase before doing anything; never let an exception
propagate as a non-zero exit unless blocking is the explicit intent
(`check-state-write.js` exit 2). This is why a broken hook degrades to "no hook"
rather than "no Claude Code."

## Manual real-session smoke procedure (AC6.4 — the essential leg)

The spawn harness proves the hook *process* honors its contract, but it **cannot**
prove that Claude Code (a) fires the `resume` matcher, (b) spawns the hook with
cwd = the project root, and (c) injects `additionalContext` into the session. If
any of those is wrong, the entire E9 SessionStart safety net is **silently dead**
— nothing errors; the warning just never appears. So this manual check is not
polish, it's the only end-to-end proof. Run it after any change to `hooks.json`,
the hook scripts, or on a new Claude Code version:

1. In a scratch project, plant a **dirty-EXECUTE** state: `.planning/STATE.md`
   with `phase: EXECUTE` + a `current_epic` (e.g. `M4.5.E3`); a
   `.planning/MILESTONE-4.5.md` row showing that Epic **shipped**; and **no**
   `.planning/M4.5.E3-RETROSPECTIVE.md`.
2. Open Claude Code in that project directory and **resume** a session (the
   `resume` source — not a fresh `startup`).
3. **Expect:** the session's opening context contains the `[signal]` dirty-EXECUTE
   warning naming the Epic and the missing retro.
4. **If it's absent:** the resume matcher didn't fire, or cwd wasn't the project
   root, or `additionalContext` wasn't injected. Do not assume the net works —
   diagnose before relying on it. (The `session-start.sh` banner firing is *not*
   sufficient evidence; it runs unmatched on every start and doesn't exercise the
   `resume` matcher.)

## Related references

- `hooks/hooks.json` — the wiring these docs describe.
- `references/state-schema.md` — the STATE.md shape all three hooks read.
- `tools/lib/retrospective.js` — `detectDirtyExecute` / `checkProposedStateWrite`,
  the testable cores behind the two Node hooks.
- `tests/hook-warn-dirty-execute.test.js`, `tests/hook-state-write.test.js`.
