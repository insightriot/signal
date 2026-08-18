#!/usr/bin/env node
// PreToolUse(Edit|Write) hook — D-E9-8 layer 2.
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

if (tool !== 'Edit' && tool !== 'Write') process.exit(0);

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

process.exit(0);
