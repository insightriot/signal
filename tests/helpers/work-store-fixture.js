// A store-on project for the M6.E13 S4 reader twins (t4.3, t4.4).
//
// The same items, once, written either as a v2 store (JSON records) or as a v1
// store (Markdown items in status folders) that `listRecords` reads through the
// converter. Every project also carries STALE decoy views — `BACKLOG.md`,
// `BUGS.md`, `OPEN-QUESTIONS.md`, `ISSUES-INBOX.md` — naming things the store
// does not hold, so a reader that read a view instead of the records shows up as
// a decoy appearing.
//
// The builder from `tests/advise-store-on.test.js`, widened for the drive,
// status and sweep readers. Not imported from that file: importing a test file
// registers its tests a second time.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { recordPath } from '../../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../../plugin/tools/lib/work-record.js';
import { stringifyItem } from '../../plugin/tools/lib/work-item.js';

export const FLAG = 'SIGNAL_FORBID_LIST_PARSERS';

export const AT = '2026-09-01T00:00:00.000Z';
const by = 'b';
export const SHA = 'abcdef1';

/** The clock the closing-too-long tests read: SIG-6 asked 33 days ago, SIG-7 three. */
export const NOW = '2026-10-04T00:00:00.000Z';

/**
 * `status` is what the fold must derive on both store versions. `closeAt` is
 * when a closing item's fix was requested (v1: its `close.at`).
 */
export const ITEMS = [
  { id: 'SIG-1', type: 'NEW', title: 'Raw capture nobody sorted', status: 'N', v1: 'work/inbox' },
  { id: 'SIG-2', type: 'FEAT', title: 'Export the report', status: 'T', v1: 'work/backlog' },
  { id: 'SIG-3', type: 'FEAT', title: 'Cache the unit walk', status: 'Q', epic: 'M6.E3', v1: 'work/epics/M6.E3' },
  { id: 'SIG-4', type: 'BUG', title: 'Doctor reads a missing key as a pass', status: 'T', priority: 'P1', legacy: 'B117', v1: 'work/backlog' },
  { id: 'SIG-5', type: 'BUG', title: 'Status is slow', status: 'N', v1: 'work/inbox' },
  { id: 'SIG-6', type: 'BUG', title: 'A fix waiting a long time for its commit', status: 'closing', closeAt: '2026-09-02', v1: 'work/done/2026-09' },
  { id: 'SIG-7', type: 'FEAT', title: 'A fix waiting a short time for its commit', status: 'closing', closeAt: '2026-10-01', v1: 'work/done/2026-10' },
  { id: 'SIG-8', type: 'FEAT', title: 'A feature closed as wontdo', status: 'C', legacy: 'B12', v1: 'work/done/2026-09' },
  { id: 'SIG-9', type: 'Q', title: 'Should the M6.E3 export include archived rows?', status: 'T', v1: 'work/backlog' },
  { id: 'SIG-10', type: 'Q', title: 'A standing question about naming', status: 'N', v1: 'work/inbox' },
  { id: 'SIG-11', type: 'Q', title: 'An answered question about M6.E3', status: 'C', v1: 'work/done/2026-09' },
  { id: 'SIG-12', type: 'CHORE', title: 'What shipped reconciliation (2026-09-01)', status: 'T', v1: 'work/backlog' },
  { id: 'SIG-13', type: 'FEAT', title: 'Leftover in a closed Epic', status: 'Q', epic: 'M5.E1', v1: 'work/epics/M5.E1' },
  { id: 'SIG-14', type: 'Q', title: 'An M6.E3 question whose fix is waiting', status: 'closing', closeAt: '2026-10-01', v1: 'work/done/2026-10' },
];

/** The Epic `SIG-13` is queued in, archived — so a live item sits in a closed Epic. */
export const ARCHIVED_EPIC = 'M5.E1';

function v2Events(it) {
  const created = { type: 'created', at: AT, by };
  const triaged = { type: 'triaged', at: AT, by };
  switch (it.status) {
    case 'N': return [created];
    case 'T': return [created, triaged];
    case 'Q': return [created, triaged, { type: 'queued', at: AT, by, epic: it.epic }];
    case 'closing':
      return [created, triaged, { type: 'close_requested', at: `${it.closeAt}T00:00:00.000Z`, by, reason: 'fixed', proof: SHA }];
    case 'C': return [created, triaged, { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'out of scope' }];
    default: throw new Error(it.status);
  }
}

function v1Fields(it) {
  const f = { id: it.id, type: it.type, status: it.status === 'closing' ? 'C' : it.status, created: { at: AT, by }, title: it.title };
  if (it.priority) f.priority = it.priority;
  if (it.legacy) f.legacy_id = it.legacy;
  if (it.status === 'closing') f.close = { reason: 'fixed', by, at: it.closeAt, proof: `fixed in commit ${SHA}` };
  if (it.status === 'C') f.close = { reason: 'wontdo', by, at: '2026-09-02', proof: 'out of scope' };
  return f;
}

export function put(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const made = [];

/** Remove every project `storeProject` made. Call from `afterEach`. */
export function cleanupStoreProjects() {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
}

/** Write one item into `base` at `version`. */
export function putItem(base, version, it) {
  if (version === 2) {
    const record = {
      id: it.id,
      type: it.type,
      title: it.title,
      ...(it.priority ? { priority: it.priority } : {}),
      ...(it.legacy ? { legacy_id: it.legacy } : {}),
      events: v2Events(it),
    };
    put(base, recordPath(it.id), serializeRecord(record));
  } else {
    put(base, `.planning/${it.v1}/${it.id}.md`, stringifyItem(v1Fields(it), 'body\n'));
  }
}

/** A record that does not read, at `version`. */
export function putBroken(base, version, id) {
  if (version === 2) put(base, recordPath(id), '{ not json');
  else put(base, `.planning/work/backlog/${id}.md`, `---\nid: ${id}\n---\n`);
}

/** A project whose work store holds `items`, at `version` 1 or 2, plus stale decoy views. */
export function storeProject(version, { items = ITEMS } = {}) {
  const base = mkdtempSync(join(tmpdir(), `sig-store-v${version}-`));
  made.push(base);
  put(base, '.planning/work/WORK.md', version === 2 ? '---\nkey: SIG\nschema_version: 2\n---\n' : '---\nkey: SIG\n---\n');
  for (const it of items) putItem(base, version, it);
  put(base, `.planning/archive/epics/${ARCHIVED_EPIC}/${ARCHIVED_EPIC}-RETROSPECTIVE.md`, '# Retro\n');

  // Decoys: stale views naming things the store does not hold.
  put(base, '.planning/BACKLOG.md', '# Backlog\n\n### M9.E9 — Decoy row from a stale view\nBody.\n');
  put(base, '.planning/BUGS.md',
    '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B99 | `confirmed` | P1 | **decoy bug** |\n');
  put(base, '.planning/OPEN-QUESTIONS.md', '# Questions\n\n## Decoy question about M6.E3\n');
  put(base, '.planning/ISSUES-INBOX.md', '# Inbox\n\n## decoy one\n\nBody.\n\n## decoy two\n\nBody.\n');
  put(base, '.planning/STATE.md',
    '---\nschema_version: 1\nphase: PLAN\ncurrent_epic: null\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n---\n\n# State\n');
  return base;
}

/** Run `fn` with the list-parser ban on (Decision 12), restoring the flag after. */
export function withParserBan(hooks) {
  let saved;
  let savedCeiling;
  hooks.beforeAll(() => {
    saved = process.env[FLAG];
    savedCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env[FLAG] = '1';
    // The temp project must not find a repository above it.
    process.env.GIT_CEILING_DIRECTORIES = tmpdir();
  });
  hooks.afterAll(() => {
    if (saved === undefined) delete process.env[FLAG];
    else process.env[FLAG] = saved;
    if (savedCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = savedCeiling;
  });
}
