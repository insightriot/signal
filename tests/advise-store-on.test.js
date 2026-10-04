// M6.E13 S4 t4.2a / t4.2b — `/sig:advise` on the work records (AC3.1, AC3.3, AC7.3).
//
// With the work store on, the advisor reads the records through
// `work-records.js` `listRecords` — on a v2 store directly, on a v1 store
// through the converter — and never a Markdown list parser. Every twin below
// runs twice, once per store version, over the SAME items, and runs with
// `SIGNAL_FORBID_LIST_PARSERS=1`, so a reader that still reaches a parser fails
// by name (Decision 12).
//
// ⚠ A TWIN ASSERTS WHAT WAS READ, not only that nothing threw: a guarded parser
// called inside a try/catch turns into a cannot-check line and a "does not
// throw" test passes over a source nobody read (the shape `scoreRepo()` in
// `advise-live-measurement.test.js` guards against).
//
// Both fixtures also carry a STALE `BACKLOG.md` and `BUGS.md` naming items the
// store does not hold, so a reader that read the views instead of the records
// shows up as the decoys appearing.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { gatherBigPicture, formatDigest } from '../plugin/tools/lib/advise-digest.js';
import { prepareAdvise, renderArtifact, runAdvise } from '../plugin/tools/lib/advise.js';
import { validatePriorities } from '../plugin/tools/lib/advise-priorities.js';
import { verifyCitations } from '../plugin/tools/lib/citations.js';
import { recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { stringifyItem } from '../plugin/tools/lib/work-item.js';

const FLAG = 'SIGNAL_FORBID_LIST_PARSERS';
let savedFlag;
let savedCeiling;
beforeAll(() => {
  savedFlag = process.env[FLAG];
  savedCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env[FLAG] = '1';
  // The temp project must not find a repository above it (the other-branches scan).
  process.env.GIT_CEILING_DIRECTORIES = tmpdir();
});
afterAll(() => {
  if (savedFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = savedFlag;
  if (savedCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
  else process.env.GIT_CEILING_DIRECTORIES = savedCeiling;
});

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function put(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const AT = '2026-09-01T00:00:00.000Z';
const by = 'b';
const SHA = 'abcdef1';

/**
 * The items, once, with where each sits in a v1 store and the events it has in v2.
 * `status` is what the fold must derive on both.
 */
export const ITEMS = [
  { id: 'SIG-1', type: 'NEW', title: 'Raw capture nobody sorted', status: 'N', v1: 'work/inbox' },
  { id: 'SIG-2', type: 'FEAT', title: 'Export the report', status: 'T', v1: 'work/backlog', body: 'Blocked on the export format.\n' },
  { id: 'SIG-3', type: 'FEAT', title: 'Cache the unit walk', status: 'Q', epic: 'M6.E3', v1: 'work/epics/M6.E3' },
  { id: 'SIG-4', type: 'BUG', title: 'Doctor reads a missing key as a pass', status: 'T', priority: 'P1', v1: 'work/backlog' },
  { id: 'SIG-5', type: 'BUG', title: 'Status is slow', status: 'N', priority: 'P3', v1: 'work/inbox' },
  { id: 'SIG-6', type: 'BUG', title: 'A bug whose fix is waiting for its commit', status: 'closing', v1: 'work/done/2026-09' },
  { id: 'SIG-7', type: 'FEAT', title: 'A feature whose fix is waiting for its commit', status: 'closing', v1: 'work/done/2026-09' },
  { id: 'SIG-8', type: 'FEAT', title: 'A feature closed as wontdo', status: 'C', v1: 'work/done/2026-09' },
  { id: 'SIG-9', type: 'Q', title: 'Should the export include archived rows?', status: 'T', v1: 'work/backlog' },
  { id: 'SIG-10', type: 'CHORE', title: 'Parked — not sprint material', status: 'T', v1: 'work/backlog' },
  { id: 'SIG-11', type: 'NEW', title: 'Second raw capture', status: 'N', v1: 'work/inbox' },
];

function v2Events(it) {
  const created = { type: 'created', at: AT, by };
  const triaged = { type: 'triaged', at: AT, by };
  switch (it.status) {
    case 'N': return [created];
    case 'T': return [created, triaged];
    case 'Q': return [created, triaged, { type: 'queued', at: AT, by, epic: it.epic }];
    case 'closing': return [created, triaged, { type: 'close_requested', at: AT, by, reason: 'fixed', proof: SHA }];
    case 'C': return [created, triaged, { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'out of scope' }];
    default: throw new Error(it.status);
  }
}

function v1Fields(it) {
  const f = { id: it.id, type: it.type, status: it.status === 'closing' ? 'C' : it.status, created: { at: AT, by }, title: it.title };
  if (it.priority) f.priority = it.priority;
  if (it.status === 'closing') f.close = { reason: 'fixed', by, at: '2026-09-02', proof: `fixed in commit ${SHA}` };
  if (it.status === 'C') f.close = { reason: 'wontdo', by, at: '2026-09-02', proof: 'out of scope' };
  return f;
}

/** A project whose work store holds `ITEMS`, at `version` 1 or 2, plus stale decoy views. */
export function storeProject(version, { items = ITEMS } = {}) {
  const base = mkdtempSync(join(tmpdir(), `sig-advise-store-v${version}-`));
  dirs.push(base);
  put(base, '.planning/work/WORK.md', version === 2 ? '---\nkey: SIG\nschema_version: 2\n---\n' : '---\nkey: SIG\n---\n');
  for (const it of items) {
    if (version === 2) {
      const record = { id: it.id, type: it.type, title: it.title, ...(it.priority ? { priority: it.priority } : {}), events: v2Events(it) };
      put(base, recordPath(it.id), serializeRecord(record));
      if (it.body) put(base, recordPath(it.id).replace(/\.json$/, '.md'), it.body);
    } else {
      put(base, `.planning/${it.v1}/${it.id}.md`, stringifyItem(v1Fields(it), it.body ?? 'body\n'));
    }
  }
  // Decoys: stale views naming things the store does not hold.
  put(base, '.planning/BACKLOG.md', '# Backlog\n\n### Decoy row from a stale view\nBody.\n');
  put(base, '.planning/BUGS.md', '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B99 | `confirmed` | P1 | **decoy bug** |\n');
  put(base, '.planning/OPEN-QUESTIONS.md', '# Questions\n\n## Decoy question\n');
  put(base, '.planning/ISSUES-INBOX.md', '# Inbox\n\n## decoy one\n\n## decoy two\n\n## decoy three\n');
  put(base, '.planning/PROJECT.md', '# P\n\n## Vision\n\nShip calibrated rigor to small teams.\n');
  put(base, '.planning/STATE.md',
    '---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M6.E3\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n---\n\n# State\n');
  return base;
}

const VERSIONS = [2, 1];

describe.each(VERSIONS)('t4.2a — readCorpus on a v%i store reads the records (AC3.1)', (version) => {
  it('backlog rows are the live non-bug, non-question items, carrying the ID and the record path, never path:line', async () => {
    const base = storeProject(version);
    const corpus = await readCorpus(base);
    expect(corpus.checked).toEqual(expect.arrayContaining(['BACKLOG.md', 'BUGS.md', 'STATE/closure']));
    expect(corpus.cannotCheck.map((c) => c.source)).not.toContain('BACKLOG.md');
    const rows = corpus.sources.backlog.rows;
    expect(rows.map((r) => r.id)).toEqual(['SIG-2', 'SIG-3', 'SIG-10']);
    for (const r of rows) {
      expect(r.line).toBeNull();
      expect(r.leadingId).toBe(r.id);
      expect(r.path).toMatch(new RegExp(`${r.id}\\.(json|md)$`));
    }
    expect(rows[0].text).toBe('Export the report');
    expect(rows[0].body).toContain('Blocked on the export format.');
    expect(rows.map((r) => r.text).join('\n')).not.toContain('Decoy');
  });

  it('closing and closed items are not backlog rows (AC7.3)', async () => {
    const rows = (await readCorpus(storeProject(version))).sources.backlog.rows.map((r) => r.id);
    for (const id of ['SIG-6', 'SIG-7', 'SIG-8']) expect(rows).not.toContain(id);
  });

  it('bugs are the open BUG items — N needs-triage, T/Q/P confirmed; closing is not open (AC7.3)', async () => {
    const corpus = await readCorpus(storeProject(version));
    const bugs = corpus.sources.bugs.entries;
    expect(bugs.map((b) => [b.id, b.status, b.priority])).toEqual([
      ['SIG-4', 'confirmed', 'P1'],
      ['SIG-5', 'needs-triage', 'P3'],
    ]);
    for (const b of bugs) expect(b.line).toBeNull();
    expect(bugs[0].headline).toBe('Doctor reads a missing key as a pass');
    expect(bugs.map((b) => b.id)).not.toContain('B99');
  });

  it('a record that does not read is named inside the source, and the rest still count', async () => {
    const base = storeProject(version);
    if (version === 2) put(base, recordPath('SIG-12'), '{ not json');
    else put(base, '.planning/work/backlog/SIG-12.md', '---\nid: SIG-12\n---\n');
    const corpus = await readCorpus(base);
    expect(corpus.checked).toContain('BACKLOG.md');
    expect(corpus.sources.backlog.broken.map((b) => b.id)).toEqual(['SIG-12']);
    expect(corpus.sources.backlog.rows.map((r) => r.id)).toEqual(['SIG-2', 'SIG-3', 'SIG-10']);
  });
});

describe('t4.2a — readCorpus with a broken WORK.md', () => {
  it('cannot check the backlog or the bugs, and says why — it does not fall back to the views', async () => {
    const base = storeProject(2);
    put(base, '.planning/work/WORK.md', '---\nschema_version: 2\n---\n'); // no key
    const corpus = await readCorpus(base);
    const reasons = Object.fromEntries(corpus.cannotCheck.map((c) => [c.source, c.reason]));
    expect(reasons['BACKLOG.md']).toMatch(/work store/);
    expect(reasons['BUGS.md']).toMatch(/work store/);
    expect(corpus.sources.backlog).toBeNull();
    expect(corpus.sources.bugs).toBeNull();
  });
});

describe.each(VERSIONS)('t4.2a — gatherBigPicture on a v%i store reads the records (AC3.1)', (version) => {
  it('bugs, backlog, open questions and inbox all come from the records', async () => {
    const base = storeProject(version);
    const g = await gatherBigPicture(base);
    expect(g.checked).toEqual(expect.arrayContaining(['bugs', 'backlog', 'open questions', 'inbox']));
    for (const s of ['bugs', 'backlog', 'open questions', 'inbox']) {
      expect(g.cannotCheck.map((c) => c.source)).not.toContain(s);
    }
    expect(g.entries.bugs.map((e) => e.id)).toEqual(['SIG-4', 'SIG-5']); // P1 before P3
    expect(g.entries.bugs[0].priority).toBe('P1');
    expect(g.entries.backlog.map((e) => e.id)).toEqual(['SIG-2', 'SIG-3', 'SIG-10']);
    expect(g.entries['open questions'].map((e) => e.id)).toEqual(['SIG-9']);
    expect(g.entries['open questions'][0].text).toBe('Should the export include archived rows?');
    // The inbox: every status-N record (SIG-1, SIG-5, SIG-11), not the decoy file's three headings.
    expect(g.entries.inbox[0].text).toMatch(/^3 item\(s\) in the inbox/);
  });

  it('closing items are offered nowhere (AC7.3)', async () => {
    const text = formatDigest(await gatherBigPicture(storeProject(version)));
    for (const id of ['SIG-6', 'SIG-7', 'SIG-8']) expect(text).not.toContain(id);
  });

  it('the formatted digest names store items by ID — the form a priority covers them by', async () => {
    const text = formatDigest(await gatherBigPicture(storeProject(version)));
    expect(text).toMatch(/- Export the report \(SIG-2\)/);
    expect(text).toMatch(/SIG-4 P1 confirmed — Doctor reads a missing key as a pass \(SIG-4\)/);
    expect(text).not.toMatch(/:(null|undefined)\)/);
    expect(text).not.toContain('Decoy');
    expect(text).not.toContain('B99');
  });

  it('a record that does not read is said out loud in the digest', async () => {
    const base = storeProject(version);
    if (version === 2) put(base, recordPath('SIG-12'), '{ not json');
    else put(base, '.planning/work/backlog/SIG-12.md', '---\nid: SIG-12\n---\n');
    const g = await gatherBigPicture(base);
    expect(g.notes.join('\n')).toMatch(/1 work item\(s\) could not be read.*SIG-12/);
  });
});

// ── classifyCorpus, validatePriorities, the renderer — store on. These moved into
// t4.2a with the corpus: `tests/advise.test.js` composes the whole flow on THIS
// repository, whose store is on, so the corpus could not change alone and stay green.

const proposal = (covers, extra = {}) => [
  { title: 'One', why: 'First.', covers, evidence: ['.planning/PROJECT.md:3'], ...extra },
  { title: 'Two', why: 'Second.', covers: ['new: something unfiled'], evidence: ['.planning/PROJECT.md:1'] },
  { title: 'Three', why: 'Third.', covers: ['new: another'], evidence: ['.planning/PROJECT.md'] },
];

async function validateOn(base, covers) {
  const { corpus, classified } = await prepareAdvise(base);
  return validatePriorities(base, proposal(covers), corpus, {
    liveRows: classified.live.map((s) => s.row),
    droppedRows: classified.dropped.map((s) => ({ id: s.row.id, path: s.row.path, line: s.row.line, why: 'self-declared: `Parked`' })),
  });
}

describe.each(VERSIONS)('t4.2a (moved from t4.2b) — classifyCorpus on a v%i store', (version) => {
  it('classifies the store rows by their titles, with no discharge input and no list parser', async () => {
    const { classified } = await prepareAdvise(storeProject(version));
    expect(classified.live.map((s) => s.row.id)).toEqual(['SIG-2', 'SIG-3']);
    expect(classified.dropped.map((s) => s.row.id)).toEqual(['SIG-10']);
    expect(classified.dropped[0].notLive.notLive).toBe(true);
    // Body text is still read for the annotations.
    expect(classified.live[0].blocked).toBe(true);
    expect(classified.consulted).toEqual(['BACKLOG.md']);
  });
});

describe.each(VERSIONS)('t4.2a (moved from t4.2b) — validatePriorities on a v%i store: covers are item IDs (AC3.3)', (version) => {
  it('accepts a live row and an open bug by ID, and carries the record path with no line', async () => {
    const base = storeProject(version);
    const r = await validateOn(base, ['SIG-2', 'SIG-4', 'SIG-5']);
    expect(r.reasons).toEqual([]);
    expect(r.priorities[0].covers).toEqual([
      expect.objectContaining({ kind: 'row', id: 'SIG-2', label: 'Export the report', line: null }),
      expect.objectContaining({ kind: 'bug', id: 'SIG-4', label: 'Doctor reads a missing key as a pass', line: null }),
      expect.objectContaining({ kind: 'bug', id: 'SIG-5', line: null }),
    ]);
    for (const c of r.priorities[0].covers) expect(c.path).toMatch(new RegExp(`${c.id}\\.(json|md)$`));
  });

  it.each([
    ['SIG-99', /SIG-99, which is not an item in the work store/],
    ['SIG-8', /SIG-8, which is closed/],
    ['SIG-7', /SIG-7, which is closing/],
    ['SIG-6', /SIG-6, which is closing/],
    ['SIG-9', /SIG-9, which is an open question/],
    ['SIG-1', /SIG-1, which is in the inbox/],
    ['SIG-10', /SIG-10, but it is dropped from the appendix — self-declared/],
    ['.planning/BACKLOG.md:3', /with the work store on, a backlog row or bug is covered by its item ID/],
    ['B12', /neither a work item ID .* nor unfiled work/],
  ])('refuses %s', async (cover, reason) => {
    const r = await validateOn(storeProject(version), [cover]);
    expect(r.ok).toBe(false);
    expect(r.reasons.join('\n')).toMatch(reason);
  });

  it('refuses the same item twice across priorities', async () => {
    const base = storeProject(version);
    const { corpus, classified } = await prepareAdvise(base);
    const p = proposal(['SIG-2']);
    p[1].covers = ['SIG-2'];
    const r = await validatePriorities(base, p, corpus, { liveRows: classified.live.map((s) => s.row) });
    expect(r.reasons.join('\n')).toMatch(/SIG-2 is already covered by priority 1/);
  });
});

describe.each(VERSIONS)('t4.2a (moved from t4.2b) — the artifact on a v%i store cites records, never path:null', (version) => {
  it('every cover and appendix row cites its record file, and the citation gate resolves them all', async () => {
    const base = storeProject(version);
    const { corpus, classified } = await prepareAdvise(base);
    const checked = await validatePriorities(base, proposal(['SIG-2', 'SIG-4']), corpus, { liveRows: classified.live.map((s) => s.row) });
    expect(checked.reasons).toEqual([]);
    const art = renderArtifact({ today: '2026-10-04', classified, priorities: checked.priorities, corpus });
    expect(art).not.toMatch(/:(null|undefined)`/);
    const rowPath = classified.live[0].row.path;
    expect(art).toContain(`\`${rowPath}\``);
    expect(art).toMatch(/A work item is cited by its own record file/);
    expect(art).not.toMatch(/the discharge input did not open it/);
    expect(art).toMatch(/`BUGS\.md` — read from the work records for the covers/);
    // t6.2: the Read line names the records, not the two views it never opened.
    const readLine = art.split('\n').find((l) => l.startsWith('**Read:**'));
    expect(readLine).toContain('work records (backlog rows) · work records (bugs)');
    expect(readLine).toMatch(/BACKLOG\.md and BUGS\.md, its views, were not opened/);
    expect(readLine).not.toMatch(/\*\*Read:\*\* BACKLOG\.md/);
    const v = await verifyCitations(base, art);
    expect(v.unresolved).toEqual([]);
    const evidenceTokens = checked.priorities.reduce((n, p) => n + p.evidence.length, 0);
    const coveredCited = checked.priorities.reduce((n, p) => n + p.covers.filter((c) => c.kind !== 'new').length, 0);
    expect(v.resolved.length).toBe(evidenceTokens + coveredCited + classified.live.length + classified.dropped.length);
    // SIG-2 sits under priority 1, SIG-3 is not covered: each appears once in the appendix.
    const appendix = art.slice(art.indexOf('## Appendix'));
    expect(appendix.split(`\`${rowPath}\``).length - 1).toBe(1);
  });
});

// ── t4.2b — the stale-read guard by ID, and the whole run, on the records.

/** Close `id` in place — the store changing between reading it and writing the advisory. */
function closeInStore(base, version, id) {
  const it = ITEMS.find((x) => x.id === id);
  const closed = { ...it, status: 'C' };
  if (version === 2) {
    put(base, recordPath(id), serializeRecord({ id, type: it.type, title: it.title, events: v2Events(closed) }));
  } else {
    rmSync(join(base, '.planning', it.v1, `${id}.md`));
    put(base, `.planning/work/done/2026-09/${id}.md`, stringifyItem(v1Fields(closed), it.body ?? 'body\n'));
  }
}

describe.each(VERSIONS)('t4.2b — runAdvise on a v%i store', (version) => {
  it('writes an advisory whose every citation resolves, reading no list parser', async () => {
    const base = storeProject(version);
    const r = await runAdvise(base, { today: '2026-10-04', priorities: proposal(['SIG-2', 'SIG-4']), projectName: 'fixture' });
    expect(r.reasons ?? []).toEqual([]);
    expect(r.status).toBe('written');
    expect(r.verification.unresolved).toEqual([]);
    expect(r.artifact).toContain(`\`${r.priorities[0].covers[1].path}\``);
    expect(r.artifact).not.toMatch(/:(null|undefined)`/);
  });

  it.each([
    ['a covered row', 'SIG-2'],
    ['a covered bug', 'SIG-4'],
    ['an uncovered appendix row', 'SIG-3'],
  ])('refuses to write when %s closes between the read and the write, naming it by ID', async (_what, id) => {
    const base = storeProject(version);
    const render = (args) => {
      closeInStore(base, version, id);
      return renderArtifact(args);
    };
    const r = await runAdvise(base, { today: '2026-10-04', priorities: proposal(['SIG-2', 'SIG-4']), render, projectName: 'fixture' });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(new RegExp(`no longer live.*${id}\\b`));
    expect(r.reason).toMatch(/Re-run/);
  });

  it('refuses to write when a cited record is gone', async () => {
    const base = storeProject(version);
    const render = (args) => {
      rmSync(join(base, version === 2 ? recordPath('SIG-2') : '.planning/work/backlog/SIG-2.md'));
      return renderArtifact(args);
    };
    const r = await runAdvise(base, { today: '2026-10-04', priorities: proposal(['SIG-2']), render, projectName: 'fixture' });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/SIG-2/);
  });
});
