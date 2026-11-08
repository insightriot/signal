#!/usr/bin/env node
// Stop hook: after a build, check that the limits the agent named were filed
// (`.planning/SLIM-SIGNAL.md`, piece 5). It runs only in a session where `show-open-items.js`
// matched a backlog entry, so an ordinary conversation is never checked.
//
// It sends the agent back once (exit 2, the reason on stderr) when its final message names limits
// or follow-ups and neither of these holds:
// - a new open entry was added to `.planning/BACKLOG.md` or `BUGS.md` since the build started;
// - the entry being built is still open and now carries those limits.
// When the entry was marked done with the limits written inside it, the message says so: the
// project removes done entries, and the limits go with them (Step 3 runs 2 and 3).
//
// It sends the agent back at most once per build. Second stop (`stop_hook_active`), no note, or
// anything it cannot read: the stop happens.

import { readFileSync, rmSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { checkFiled } from '../tools/lib/open-items.js';
import { findRecordsRoot, notePath, recordsText } from './records-root.js';

/** The last assistant text in a transcript, for a Claude Code that does not send `last_assistant_message`. */
function lastFromTranscript(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n').reverse();
  for (const l of lines) {
    try {
      const m = JSON.parse(l)?.message;
      if (m?.role !== 'assistant') continue;
      const text = (Array.isArray(m.content) ? m.content : []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      if (text) return text;
    } catch {
      // A line that is not JSON: skip it.
    }
  }
  return '';
}

function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return 0;
  }
  if (event?.hook_event_name !== 'Stop' || typeof event.session_id !== 'string') return 0;
  const cwd = typeof event.cwd === 'string' && isAbsolute(event.cwd) ? event.cwd : process.cwd();
  const root = findRecordsRoot(cwd);
  if (!root) return 0;
  // Sent back once already: let the stop happen, and check this build no more.
  if (event.stop_hook_active) {
    rmSync(notePath(event.session_id, root), { force: true });
    return 0;
  }
  let note;
  try {
    note = JSON.parse(readFileSync(notePath(event.session_id, root), 'utf8'));
  } catch {
    return 0;
  }
  const message =
    typeof event.last_assistant_message === 'string' ? event.last_assistant_message : event.transcript_path ? lastFromTranscript(event.transcript_path) : '';
  const r = checkFiled({ message, before: note.records, after: recordsText(root), targetTitle: note.title });
  if (r.ok) {
    rmSync(notePath(event.session_id, root), { force: true });
    return 0;
  }
  process.stderr.write(
    `Signal: your final message names ${r.limits.length} limit${r.limits.length === 1 ? '' : 's'} or follow-up${r.limits.length === 1 ? '' : 's'}, and none is filed as an open item:\n` +
      r.limits.slice(0, 12).map((l) => `- ${l}\n`).join('') +
      (r.buried ? `They are written inside "${note.title}", which is now marked done; done entries get removed, and the limits go with them.\n` : '') +
      `File each one as its own open entry in .planning/BACKLOG.md (BUGS.md for a bug), or as bullets under one new open "${note.title} follow-ups" entry, and commit it. ` +
      `If a line above is not a real limit, say so in one line instead.\n`,
  );
  return 2;
}

try {
  process.exit(main());
} catch {
  process.exit(0);
}
