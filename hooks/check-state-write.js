#!/usr/bin/env node
// PreToolUse(Edit|Write) hook — D-E9-8 layer 2.
//
// Reads the Claude Code hook event JSON from stdin. If the proposed write
// targets .planning/STATE.md and would mark an Epic-close SHIP without a
// corresponding retro file on disk, exits 2 (block) with a stderr message
// that surfaces to the user. Otherwise exits 0 (allow).
//
// This layer is what makes D-E9-3's "no bypass" hold: even if the user
// manually edits STATE.md to skip /sig:ship's command-internal FR1 check,
// the underlying Edit/Write tool call goes through this hook first.
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
  proposedContent = input.replace_all
    ? current.split(oldStr).join(newStr)
    : current.replace(oldStr, newStr);
}

// baseDir = directory containing .planning/
const baseDir = resolve(filePath, '..', '..');

// Two independent predicates (D-v016-2): the FR1 prose-shape check fires on
// any phase; the E9 retro-absence check fires only on Epic-close SHIP. Block if
// either fires. Shape is checked first (a malformed frontmatter is the more
// fundamental defect).
const shape = checkStateFrontmatterShape({ proposedContent });
const retro = checkProposedStateWrite({ proposedContent, baseDir });
const result = shape.block ? shape : retro;

if (result.block) {
  process.stderr.write(`[signal:check-state-write] ${result.reason}\n`);
  process.exit(2);
}

process.exit(0);
