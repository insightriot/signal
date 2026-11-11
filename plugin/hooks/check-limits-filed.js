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
// It also sends the agent back when an item the before-check showed names code the build changed
// (a file, or a code name in the diff) and the agent neither fixed it nor named it in the final
// message (Step 3 run 4: items seen, the exact lines edited, the item not mentioned).
// And it shows the standing rules ("never", "always", "only when" sentences) of the AGENTS.md and
// CLAUDE.md files in the folders the build changed, as they stood when the build started, and asks
// the agent to say which ones its change affects (Step 3 runs 3 and 5: a later feature reversed an
// earlier feature's recorded rule without saying so, and its tests still passed because they checked
// one field and the change added another route). A rule sentence the agent rewrote is not shown.
//
// It sends the agent back at most once per build. Second stop (`stop_hook_active`), no note, or
// anything it cannot read: the stop happens.

import { readFileSync, rmSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { checkFiled, unaddressedItems } from '../tools/lib/open-items.js';
import { changeSince, findRecordsRoot, notePath, recordsText, rulesAtBase } from './records-root.js';

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
  const after = recordsText(root);
  const r = checkFiled({ message, before: note.records, after, targetTitle: note.title });
  const change = note.base && Array.isArray(note.items) ? changeSince(root, note.base) : { files: [], diff: '' };
  const missed = note.base && Array.isArray(note.items) ? unaddressedItems({ items: note.items, ...change, message, after }) : [];
  const rules = note.base && change.files.length ? rulesAtBase(root, note.base, change.files).filter((x) => x.kept) : [];
  if (r.ok && missed.length === 0 && rules.length === 0) {
    rmSync(notePath(event.session_id, root), { force: true });
    return 0;
  }
  const parts = [];
  if (!r.ok)
    parts.push(
      `Signal: your final message names ${r.limits.length} limit${r.limits.length === 1 ? '' : 's'} or follow-up${r.limits.length === 1 ? '' : 's'}, and none is filed as an open item:\n` +
        r.limits.slice(0, 12).map((l) => `- ${l}\n`).join('') +
        (r.buried ? `They are written inside "${note.title}", which is now marked done; done entries get removed, and the limits go with them.\n` : '') +
        `File each one as its own open entry in .planning/BACKLOG.md (BUGS.md for a bug), or as bullets under one new open "${note.title} follow-ups" entry, and commit it. ` +
        `If a line above is not a real limit, say so in one line instead.\n`,
    );
  if (missed.length)
    parts.push(
      `Signal: ${missed.length} item${missed.length === 1 ? '' : 's'} shown before the build name${missed.length === 1 ? 's' : ''} code this build changed, and your final message neither says ${missed.length === 1 ? 'it was' : 'they were'} fixed nor names ${missed.length === 1 ? 'it' : 'them'}:\n` +
        missed.slice(0, 12).map((m) => `- "${m.lead}" (${m.where}; ties to \`${m.token}\`)\n`).join('') +
        `For each one: fix it now, or name it in your final message with your reason for leaving it. If the tie is only a shared name and the item is unrelated, say that in one line.\n`,
    );
  if (rules.length)
    parts.push(
      `Signal: these are the standing rules in the instruction files for the folders this build changed, as they stood before it:\n` +
        rules.slice(0, 20).map((x) => `- ${x.text.length > 400 ? x.text.slice(0, 399) + '…' : x.text} (${x.doc}, line ${x.line})\n`).join('') +
        (rules.length > 20 ? `(${rules.length - 20} more in those files)\n` : '') +
        `Check each against what you built, including any new route data now takes. If your change breaks or narrows one, say so in your final message and update that line. If it keeps them all, say that in one line.\n`,
    );
  process.stderr.write(parts.join('\n'));
  return 2;
}

try {
  process.exit(main());
} catch {
  process.exit(0);
}
