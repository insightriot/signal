#!/usr/bin/env node
// `/sig:build <words>` runs this first. It finds the open `.planning/BACKLOG.md` entry the words
// mean (`matchItem`), prints the open problems beside it and how to size it, and leaves the note
// `check-limits-filed.js` reads at the end, keyed by this session (CLAUDE_CODE_SESSION_ID).
//
// When nothing matches it says so, with the closest entries if any, so the agent can file the item
// and run this again. Exit code is always 0; what to do next is in the output.

import { join } from 'node:path';

import { matchItem, parseEntries } from '../tools/lib/open-items.js';
import { findRecordsRoot, readOr, startBuild } from './records-root.js';

const request = process.argv.slice(2).join(' ').trim();
const root = findRecordsRoot(process.cwd());
if (!root) {
  process.stdout.write('Signal: no .planning/BACKLOG.md in this project (or not in a git repository). Create one with a `# Backlog` heading and at least one `## ` section, file the item under it as `### <title>`, commit, and run this again.\n');
  process.exit(0);
}
if (!request) {
  process.stdout.write('Signal: no item named. Ask the person which backlog item to build.\n');
  process.exit(0);
}
const { target, candidates } = matchItem(request, parseEntries(readOr(join(root, '.planning', 'BACKLOG.md'))));
if (target) {
  process.stdout.write(startBuild(root, process.env.CLAUDE_CODE_SESSION_ID, target) + '\n');
} else if (candidates.length) {
  process.stdout.write(
    `Signal: "${request}" could mean more than one open backlog item:\n` +
      candidates.map((e) => `- ${e.title}  (BACKLOG.md, line ${e.line})\n`).join('') +
      'If one of these is it, run this again with its full title. If none is, file it as a new item (below) and run this again.\n',
  );
} else {
  process.stdout.write(
    `Signal: no open backlog item matches "${request}". File it in .planning/BACKLOG.md as \`### <title>\` under the \`## \` section it belongs to, ` +
      'with a short description of what is wanted and why, commit, and run this again with that title.\n',
  );
}
