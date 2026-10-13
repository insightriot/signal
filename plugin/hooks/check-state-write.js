#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit|NotebookEdit) hook — D-E9-8 layer 2.
//
// Reads the Claude Code hook event JSON from stdin. On a proposed write to
// .planning/STATE.md it runs two checks with DIFFERENT strictness (the
// M4.5.E11 D-E11-5 two-tier posture):
//   1. Malformed STATE frontmatter (checkStateFrontmatterShape) → HARD BLOCK
//      (exit 2) with a stderr message. An integrity guard, always enforced.
//   2. An Epic-close SHIP without a retro file on disk → WARN, non-blocking
//      (exit 0 + stderr). Hooks nudge on process; they don't hard-block an
//      editor's own STATE write. The hard "no retro, no ship" contract lives
//      in /sig:ship §0.5's command-internal shipFR1Check — running the command
//      is what opts you into its contract (D-E9-3).
// Otherwise exits 0 (allow). The check-2 path is throw-safe: a malformed
// current_epic can't crash a stranger's PreToolUse (fail-open exit 0).
//
// Note: the PLAN spec called for a bash wrapper invoking a Node CLI; this
// implementation collapses both into a single Node entrypoint. Bash adds
// cross-platform fragility (Windows lacks bash by default) without buying
// us anything testable — the core logic is in tools/lib/retrospective.js
// where unit tests can exercise it directly.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import {
  checkProposedStateWrite,
  checkStateFrontmatterShape,
} from '../tools/lib/retrospective.js';

// Read event JSON from stdin.
let raw = '';
try {
  raw = readFileSync(0, 'utf-8');
} catch {
  // No stdin — nothing to evaluate, allow.
  process.exit(0);
}

let event;
try {
  event = JSON.parse(raw);
} catch {
  // Malformed JSON — fail open (allow). Hook errors shouldn't break
  // normal Claude Code operation.
  process.exit(0);
}

const tool = event?.tool_name;
const input = event?.tool_input ?? {};

if (tool !== 'Edit' && tool !== 'Write' && tool !== 'MultiEdit' && tool !== 'NotebookEdit') process.exit(0);

// The path the tool would write: NotebookEdit names it `notebook_path`.
const target = tool === 'NotebookEdit' ? input.notebook_path : input.file_path;

// The real path of `abs`, or of its nearest existing ancestor with the rest
// appended (the file may not exist yet). `abs` itself when nothing resolves.
function realpathLoose(abs) {
  const rest = [];
  let cur = abs;
  for (;;) {
    try {
      return join(realpathSync.native(cur), ...rest);
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return abs;
      rest.unshift(basename(cur));
      cur = parent;
    }
  }
}

// M6.E13/t5.1 — a v2 work store's records, views, history and WORK.md are
// written by code, not by hand. The guard is loaded only when the resolved
// path — or its real path, so an alias such as `notes -> .planning/work/items`
// is seen (REVIEW loop 1) — mentions `.planning`. An edit anywhere else pays
// one string test and one realpath; the guard blocks only at
// `schema_version: 2` and allows on any failure.
//
// The test reads look-alike letters as the plain ones (REVIEW r6, as
// `foldName` in the guard): macOS opens `.planning/work/unitſ` as `units`.
const mentionsPlanning = (p) => p.normalize('NFKC').toLowerCase().toUpperCase().toLowerCase().includes('.planning');

// Is `dir`, or a folder above it, a project with a work store? Two routes to a
// guarded file have no `.planning` in the path at all (REVIEW r6): a hard link
// to a record, and the real path of a `.planning` that is a symlink. The guard
// finds both from the project, so it is also loaded for any edit made in, or
// to a file in, a project that has a store. The cost elsewhere is one
// `existsSync` for each folder above the cwd and above the target.
function storeAbove(dir) {
  for (let cur = dir; ; cur = dirname(cur)) {
    if (existsSync(join(cur, '.planning', 'work', 'WORK.md'))) return true;
    if (dirname(cur) === cur) return false;
  }
}

if (typeof target === 'string') {
  try {
    const cwd = typeof event.cwd === 'string' ? event.cwd : process.cwd();
    const abs = resolve(cwd, target);
    if (mentionsPlanning(abs) || mentionsPlanning(realpathLoose(abs)) || storeAbove(resolve(cwd)) || storeAbove(dirname(abs))) {
      const { checkWorkWrite } = await import('../tools/lib/work-write-guard.js');
      const guard = await checkWorkWrite({ filePath: target, cwd, tool, input });
      if (guard.block) {
        process.stderr.write(`[signal:check-state-write] ${guard.reason}\n`);
        process.exit(2);
      }
    }
  } catch {
    // Fail open: the guard must never be the reason an ordinary edit fails.
  }
}
// MultiEdit and NotebookEdit reach only the guard above; the STATE.md checks
// below judge Edit and Write, as before.
if (tool === 'MultiEdit' || tool === 'NotebookEdit') process.exit(0);

const filePath = input.file_path ?? '';
// Require a path-boundary (start-of-string or `/`) before `.planning/STATE.md`.
// Without it, a path like `something.planning/STATE.md` would incorrectly
// match — the suffix `.planning/STATE.md` is not by itself a Signal-managed
// state file unless it's preceded by a path separator.
if (!/(^|\/)\.planning\/STATE\.md$/.test(filePath)) process.exit(0);

// Compute the proposed post-write content.
let proposedContent = '';
if (tool === 'Write') {
  proposedContent = input.content ?? '';
} else {
  // Edit — apply old_string → new_string against current disk content.
  let current = '';
  try {
    current = readFileSync(filePath, 'utf-8');
  } catch {
    // Target missing — Edit will fail anyway; allow.
    process.exit(0);
  }
  const oldStr = input.old_string ?? '';
  const newStr = input.new_string ?? '';
  if (!oldStr) {
    // Edit without old_string is malformed; allow (Claude Code will
    // surface the actual error).
    process.exit(0);
  }
  // Use a function replacer so `$&`, `$\``, `$'`, `$$` in new_string are
  // inserted LITERALLY (String.prototype.replace expands them otherwise, even
  // for a plain-string search) — otherwise the hook judges a different string
  // than Claude Code actually writes (REVIEW, security-Low). split/join is
  // already `$`-faithful for the replace_all path.
  proposedContent = input.replace_all
    ? current.split(oldStr).join(newStr)
    : current.replace(oldStr, () => newStr);
}

// baseDir = directory containing .planning/
const baseDir = resolve(filePath, '..', '..');

// Two-tier retro posture (D-E11-5 / M4.5.E11.S1.t4). The FR1 prose-shape check
// (D-v016-2) stays a hard BLOCK — malformed frontmatter is unambiguously wrong.
// The E9 retro-absence check on THIS hook path is a non-blocking WARN: a missing
// retro is a process gap, not malformed data, and this hook fires on arbitrary
// STATE edits in stranger repos. The hard retro contract still lives in
// /sig:ship §0.5's command-internal shipFR1Check (the two-tier split, B2).
// Shape is checked first (the more fundamental defect) and SHORT-CIRCUITS via
// process.exit(2) before the retro predicate can run.
function block(reason) {
  process.stderr.write(`[signal:check-state-write] ${reason}\n`);
  process.exit(2);
}
function warn(reason) {
  process.stderr.write(`[signal:check-state-write] warning: ${reason}\n`);
  // Non-blocking — the write is allowed to proceed (exit 0 below).
}

const shape = checkStateFrontmatterShape({ proposedContent });
if (shape.block) block(shape.reason);

// Fail-open around the retro predicate: deriveRetroPath throws on a malformed
// current_epic (R2), and a PreToolUse hook must never crash a normal edit.
try {
  const retro = checkProposedStateWrite({ proposedContent, baseDir });
  if (retro.block) warn(retro.reason);
} catch {
  // Retro predicate threw (e.g. a malformed current_epic) — fail open.
}

// B75 — was the user actually asked anything during the phase now closing?
//
// WARN, never block (Brett, 2026-08-22, asked directly). That keeps the two-tier
// posture above intact: a skipped confirmation is process, not malformed data,
// and this hook fires on arbitrary STATE edits in stranger repos. The cost is
// stated rather than hidden — `B75` closes as CHECKED AND REPORTED, not
// ENFORCED. Nothing here fails a command that ignores `confirm_in_phase`.
//
// `cannot-check` is surfaced with the same weight as `warn` on purpose. An
// absent record means the PostToolUse hook has never run here, not that zero
// questions were asked; printing nothing would read as a clean pass, which is
// `B39`'s shape.
try {
  const { checkPhaseAsks } = await import('../tools/lib/ask-record.js');
  const { readEffectiveProfile, applyRigorOverrides } = await import(
    '../tools/lib/profile.js'
  );

  let currentContent = '';
  try {
    currentContent = readFileSync(filePath, 'utf-8');
  } catch {
    currentContent = '';
  }

  const currentEpic =
    (currentContent.match(/^current_epic:[ \t]*(.+)$/m)?.[1] ?? '').trim() || null;
  const profile = await readEffectiveProfile(baseDir, {
    currentEpic: currentEpic === 'null' ? null : currentEpic,
  });
  const gates = applyRigorOverrides({}, profile)?.gates ?? {};

  const asks = checkPhaseAsks({
    proposedContent,
    currentContent,
    baseDir,
    confirmInPhase: gates.confirm_in_phase === true,
  });
  if (asks.status === 'warn' || asks.status === 'cannot-check') warn(asks.reason);
} catch {
  // No PROFILE.md, a malformed one, or an unreadable record — fail open. This
  // check is advisory; it must never be the reason an edit fails.
}

process.exit(0);
