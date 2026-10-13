#!/usr/bin/env node
// SessionStart(resume) hook — D-E9-8 layer 3.
//
// On session resume, if STATE.md shows the project is mid-EXECUTE for an
// Epic that already looks shipped per MILESTONE.md but has no retro file,
// emit a high-visibility additionalContext warning so the user sees the
// gap as soon as the session opens. On a project with unit records "looks
// shipped" is the unit's record reading closing or closed.
//
// This catches the original motivating failure mode for M4.5.E9: the
// conversation context cleared between EXECUTE finishing and /sig:ship
// firing, so the retro was never written. The next session resume surfaces
// the gap and the user can address it before any other work.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { shownName } from '../tools/lib/printable-text.js';
import { detectDirtyExecute } from '../tools/lib/retrospective.js';
import { unitRecordsOn } from '../tools/lib/unit-records.js';

const baseDir = process.cwd();

const statePath = resolve(baseDir, '.planning', 'STATE.md');
if (!existsSync(statePath)) process.exit(0);

let stateContent = '';
try {
  stateContent = readFileSync(statePath, 'utf-8');
} catch {
  process.exit(0);
}

// Lightweight frontmatter extraction — duplicate of the inline parse used
// by checkProposedStateWrite (avoiding a state.js import for synchronous
// hook execution).
const m = stateContent.match(/^---\n([\s\S]*?)\n---/);
if (!m) process.exit(0);
const fm = m[1];

const phase = fm.match(/^phase:\s*(.+)$/m)?.[1]?.trim() ?? null;
const currentEpicRaw = fm.match(/^current_epic:\s*(\S+)\s*$/m)?.[1] ?? null;
const currentEpic =
  currentEpicRaw && currentEpicRaw !== 'null'
    ? currentEpicRaw.replace(/['"]/g, '')
    : null;
const state = { phase, current_epic: currentEpic };

if (!state.current_epic) process.exit(0);

// Load the matching milestone file (M4.5.E9 → MILESTONE-4.5.md) — only on a
// project with no unit records. With unit records the trigger is the unit's
// record (M6.E16 t4.3, D-M6E16-10) and the milestone file is not opened.
//
// A `work/units/` folder that cannot be trusted (a link, a file, one that
// cannot be listed) is not "no unit records": the milestone row is not read
// in its place. The hook stays fail-open, as hooks here do — it blocks
// nothing — and says why it could not check.
let milestoneContent = '';
let unitsOn;
try {
  unitsOn = unitRecordsOn(baseDir);
} catch (err) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      // `current_epic` is text from a file a clone can ship: escaped and cut before it is printed.
      additionalContext: `Signal could not check whether ${shownName(state.current_epic, 60)} was left mid-EXECUTE without a retrospective: ${err?.message ?? String(err)}`,
    },
  }) + '\n');
  process.exit(0);
}
if (!unitsOn) {
  const milestoneNum = state.current_epic.replace(/^M/, '').replace(/\.E\d+$/, '');
  const milestonePath = resolve(
    baseDir,
    '.planning',
    `MILESTONE-${milestoneNum}.md`,
  );
  try {
    milestoneContent = readFileSync(milestonePath, 'utf-8');
  } catch {
    process.exit(0);
  }
}

const warning = detectDirtyExecute({
  state,
  milestoneContent,
  baseDir,
});

if (warning) {
  // SessionStart hook output: emit JSON with additionalContext so Claude
  // Code surfaces the warning in the next message context.
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: warning,
    },
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

process.exit(0);
