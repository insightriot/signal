#!/usr/bin/env node
// PostToolUse(AskUserQuestion) hook — records that the user was actually asked
// something, and which phase was running at the time (B75).
//
// This exists because the `attention` dial had no observer. `confirm_in_phase`
// was written by `applyRigorOverrides` and read by nothing, so "confirm at every
// step inside the phase" was a sentence in six command files and a behaviour in
// none. The companion check lives in `check-state-write.js`, which fires when a
// phase closes.
//
// That `AskUserQuestion` is hookable at all was settled by RUNNING it on
// 2026-08-22, not by reading documentation — two readings of the same page
// disagreed, and the one saying "not hookable" turned out to be a summarising
// model's inference. The test used a control arm (a second matcher on a tool
// that could be triggered on purpose), because a silent log cannot distinguish
// "did not fire" from "setup broken" — `M5.E15`/`B55`'s exact defect.
//
// ALWAYS EXITS 0. A PostToolUse hook that fails must not turn a successful
// question into a broken tool call in a stranger's repo. Every failure path
// here degrades to "no record written", which the check reports as
// `cannot-check` rather than as a clean pass.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { recordAsk } from '../tools/lib/ask-record.js';

function bail() {
  process.exit(0);
}

let event;
try {
  event = JSON.parse(readFileSync(0, 'utf-8'));
} catch {
  bail();
}

if (event?.tool_name !== 'AskUserQuestion') bail();

// Find the project root: the nearest ancestor holding `.planning/STATE.md`.
// `cwd` is preferred over `process.cwd()` when the harness supplies it, since a
// hook's own working directory is not guaranteed to be the session's.
function findProjectRoot(start) {
  let dir = resolve(start);
  for (let i = 0; i < 40; i += 1) {
    if (existsSync(join(dir, '.planning', 'STATE.md'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

let baseDir = null;
try {
  baseDir = findProjectRoot(event?.cwd ?? process.cwd());
} catch {
  bail();
}
if (!baseDir) bail(); // Not a Signal project — nothing to record against.

// Read `phase` and `current_epic` straight out of the frontmatter rather than
// through `readState`, which throws on an ahead/unknown `schema_version`. A
// hook must not be the thing that breaks during a schema migration, and a
// best-effort phase name is worth more here than a strict parse.
let phase = null;
let epic = null;
try {
  const content = readFileSync(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  const body = frontmatter ? frontmatter[1] : '';
  phase = (body.match(/^phase:[ \t]*(.+)$/m)?.[1] ?? '').trim() || null;
  epic = (body.match(/^current_epic:[ \t]*(.+)$/m)?.[1] ?? '').trim() || null;
  if (phase === 'null') phase = null;
  if (epic === 'null') epic = null;
} catch {
  // Unreadable STATE.md — still record the ask with a null phase. The event
  // genuinely happened; losing it entirely would be the worse error.
}

try {
  recordAsk({ baseDir, phase, epic });
} catch {
  // Recording is best-effort by design; see the header.
}

process.exit(0);
