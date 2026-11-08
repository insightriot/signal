#!/usr/bin/env node
// UserPromptSubmit hook: before a build, show the agent the open problems beside the work
// (`.planning/SLIM-SIGNAL.md`, piece 2). When the prompt names a `.planning/BACKLOG.md` entry by its
// heading, it prints the rest of that entry's `##` section (open and done entries) and the open
// BUGS.md entries that name a file the section names. Claude Code adds a UserPromptSubmit hook's
// stdout to the context, so the agent has the items before it reads anything.
//
// It also leaves a note (the entry's title and the records' text at this moment) for
// `check-limits-filed.js`, which checks at the end that the limits the agent names were filed.
//
// Needs only a BACKLOG.md: no STATE.md, no phase. Anything it cannot read prints nothing.

import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { findTarget, parseEntries, relevantItems, renderBeforeBuild } from '../tools/lib/open-items.js';
import { findRecordsRoot, notePath, readOr, recordsText } from './records-root.js';

function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return 0;
  }
  if (event?.hook_event_name !== 'UserPromptSubmit' || typeof event.prompt !== 'string' || typeof event.session_id !== 'string') return 0;
  const cwd = typeof event.cwd === 'string' && isAbsolute(event.cwd) ? event.cwd : process.cwd();
  const root = findRecordsRoot(cwd);
  if (!root) return 0;
  const entries = parseEntries(readOr(join(root, '.planning', 'BACKLOG.md')));
  const target = findTarget(event.prompt, entries);
  if (!target) return 0;
  const items = relevantItems(target, entries, parseEntries(readOr(join(root, '.planning', 'BUGS.md'))));
  writeFileSync(notePath(event.session_id, root), JSON.stringify({ title: target.title, records: recordsText(root) }));
  process.stdout.write(renderBeforeBuild(target, items) + '\n');
  return 0;
}

try {
  process.exit(main());
} catch {
  process.exit(0);
}
