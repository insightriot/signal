// M6.E13 S4 t4.3 — `/sig:drive` and `/sig:status`'s open questions on the work
// records (AC3.1, AC4.1, AC7.3).
//
// With the work store on, `proposeEpicCandidates`, the PLAN drain floors
// (`inboxHasDrainableEntries`, through `FLOOR_CONDITIONS`), `collectPreflight`'s
// open questions and `status.readOpenQuestions` read the records through
// `listRecords` — a v2 store directly, a v1 store through the converter — and
// never a Markdown list parser. Every twin runs once per store version over the
// SAME items, with `SIGNAL_FORBID_LIST_PARSERS=1`, so a reader that still
// reaches a parser fails by name (Decision 12).
//
// ⚠ A twin asserts WHAT WAS READ, not only that nothing threw. The decoy views
// in the fixture name `M9.E9`, `B99`, a decoy question about M6.E3 and two inbox
// headings; none may appear.
//
// Store off is pinned elsewhere, unchanged: `tests/work-store-off.test.js`
// (`readers-ac31.json` carries every one of these readers on a store-off project).

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { proposeEpicCandidates, collectPreflight, FLOOR_CONDITIONS, resolveFloors } from '../plugin/tools/lib/drive.js';
import { readOpenQuestions } from '../plugin/tools/lib/status.js';
import { recordPath } from '../plugin/tools/lib/work-records.js';
import {
  ITEMS,
  storeProject,
  cleanupStoreProjects,
  put,
  putBroken,
  withParserBan,
} from './helpers/work-store-fixture.js';

withParserBan({ beforeAll, afterAll });
afterEach(cleanupStoreProjects);

const VERSIONS = [2, 1];
const BROKEN_WORK_MD = '---\nschema_version: 2\n---\n'; // no key

describe.each(VERSIONS)('t4.3 — proposeEpicCandidates on a v%i store reads the records', (version) => {
  it('offers the live non-bug, non-question items, ranked by the backlog rules, never a decoy row', async () => {
    const base = storeProject(version);
    const { candidates, cannotCheck } = await proposeEpicCandidates(base);
    // SIG-12 reads as a dated "what shipped" record, so it sinks; ties keep ID order.
    expect(candidates.map((c) => c.id)).toEqual(['SIG-2', 'SIG-3', 'SIG-13', 'SIG-12']);
    expect(cannotCheck.map((c) => c.source)).not.toContain('BACKLOG.md');
    expect(cannotCheck.map((c) => c.source)).not.toContain('work store');
    expect(candidates.map((c) => c.title).join('\n')).not.toContain('Decoy');
    const first = candidates[0];
    expect(first).toMatchObject({ id: 'SIG-2', title: 'Export the report', source: 'work store', line: null });
    expect(first.path).toMatch(/SIG-2\.(json|md)$/);
  });

  it('never offers a closing or closed item, a bug, or a question (AC7.3)', async () => {
    const ids = (await proposeEpicCandidates(storeProject(version))).candidates.map((c) => c.id);
    for (const id of ['SIG-6', 'SIG-7', 'SIG-8', 'SIG-14', 'SIG-4', 'SIG-5', 'SIG-9', 'SIG-1']) expect(ids).not.toContain(id);
  });

  it('a record that does not read is named in cannotCheck, and the rest are still offered', async () => {
    const base = storeProject(version);
    putBroken(base, version, 'SIG-15');
    const { candidates, cannotCheck } = await proposeEpicCandidates(base);
    expect(candidates.map((c) => c.id)).toEqual(['SIG-2', 'SIG-3', 'SIG-13', 'SIG-12']);
    const store = cannotCheck.find((c) => c.source === 'work store');
    expect(store.reason).toMatch(/1 work item\(s\) could not be read.*SIG-15/);
  });
});

// M6.E13 t7.1b R5: the +5 "leads with a unit id" bonus is earned by the TITLE,
// as the view heading earned it store-off, never by the record's own ID (which
// every record has). Without this, Epic-titled rows (M5.E20, M5.E12, M5.E14 on
// this repository) fell from #2–4 to #24–27 at the cutover.
const RANKED = [
  { id: 'SIG-1', type: 'FEAT', title: 'Export the report', status: 'T', v1: 'work/backlog' },
  { id: 'SIG-2', type: 'FEAT', title: 'Tagged row · **roadmap** · medium', status: 'T', v1: 'work/backlog' },
  { id: 'SIG-3', type: 'FEAT', title: 'M5.E20 — an Epic-titled row', status: 'T', v1: 'work/backlog' },
];

describe.each(VERSIONS)('R5 — on a v%i store, only a title that leads with a unit id earns the unit-id rank', (version) => {
  it('an Epic-titled record outranks a tagged one and a plain one', async () => {
    const { candidates } = await proposeEpicCandidates(storeProject(version, { items: RANKED }));
    expect(candidates.map((c) => c.id)).toEqual(['SIG-3', 'SIG-2', 'SIG-1']);
  });

  it('matches the store-off ranking of the same rows', async () => {
    const off = storeProject(version, { items: [] });
    rmSync(join(off, '.planning', 'work', 'WORK.md'));
    put(off, '.planning/BACKLOG.md', `# Backlog\n\n${RANKED.map((it) => `### ${it.title}\n\nBody.\n`).join('\n')}`);
    const saved = process.env.SIGNAL_FORBID_LIST_PARSERS;
    process.env.SIGNAL_FORBID_LIST_PARSERS = '0'; // store-off parses the view, by design
    let offTitles;
    try {
      offTitles = (await proposeEpicCandidates(off)).candidates.map((c) => c.title);
    } finally {
      process.env.SIGNAL_FORBID_LIST_PARSERS = saved;
    }
    const onTitles = (await proposeEpicCandidates(storeProject(version, { items: RANKED }))).candidates.map((c) => c.title);
    expect(offTitles).toEqual(RANKED.map((it) => it.title).reverse());
    expect(onTitles).toEqual(offTitles);
  });
});

describe('t4.3 — proposeEpicCandidates with a broken WORK.md', () => {
  it('says it could not look, and does not fall back to BACKLOG.md', async () => {
    const base = storeProject(2);
    put(base, '.planning/work/WORK.md', BROKEN_WORK_MD);
    const { candidates, cannotCheck } = await proposeEpicCandidates(base);
    expect(candidates).toEqual([]);
    expect(cannotCheck.find((c) => c.source === 'work store').reason).toMatch(/the work store could not be read/);
  });
});

describe.each(VERSIONS)('t4.3 — the PLAN drain floors on a v%i store count status-N records', (version) => {
  it('live when any record is in the inbox', async () => {
    const base = storeProject(version);
    expect(await FLOOR_CONDITIONS['plan-drain-preview'](base)).toBe(true);
    expect(await FLOOR_CONDITIONS['plan-drain-destructive'](base)).toBe(true);
  });

  it('dormant when no record is N — the decoy ISSUES-INBOX.md headings are not read', async () => {
    const base = storeProject(version, { items: ITEMS.filter((i) => i.status !== 'N') });
    expect(await FLOOR_CONDITIONS['plan-drain-preview'](base)).toBe(false);
    const { live, dormant, cannotCheck } = await resolveFloors('PLAN', base);
    expect(live).toEqual([]);
    expect(dormant.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
    expect(cannotCheck).toEqual([]);
  });

  it('a broken record with no N record is "could not tell": live, and named', async () => {
    const base = storeProject(version, { items: ITEMS.filter((i) => i.status !== 'N') });
    putBroken(base, version, 'SIG-15');
    const { live, cannotCheck } = await resolveFloors('PLAN', base);
    expect(live.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
    expect(cannotCheck.map((c) => c.reason).join('\n')).toMatch(/SIG-15/);
  });
});

describe('t4.3 — the PLAN drain floors with a broken WORK.md', () => {
  it('fail closed: live, with the reason', async () => {
    const base = storeProject(2);
    put(base, '.planning/work/WORK.md', BROKEN_WORK_MD);
    const { live, cannotCheck } = await resolveFloors('PLAN', base);
    expect(live.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
    expect(cannotCheck).toHaveLength(2);
  });
});

describe.each(VERSIONS)('t4.3 — collectPreflight on a v%i store reads the open question records', (version) => {
  it('blocks on the open questions naming the Epic — not a closed or closing one, not the decoy', async () => {
    const { blocking, checked, cannotCheck } = await collectPreflight(storeProject(version), { epic: 'M6.E3' });
    const questions = blocking.filter((b) => b.source === 'work store');
    expect(questions).toEqual([
      { source: 'work store', question: 'Should the M6.E3 export include archived rows?', detail: 'SIG-9 names M6.E3' },
    ]);
    expect(blocking.map((b) => b.question).join('\n')).not.toContain('Decoy');
    expect(checked).toContain('open questions (work store)');
    expect(checked).not.toContain('OPEN-QUESTIONS.md');
    expect(cannotCheck.map((c) => c.source)).not.toContain('open questions (work store)');
  });

  // t4.5a: a question QUEUED in the Epic names it too, whatever its title says.
  it('an open question queued in the Epic blocks too, though its title does not name it (t4.5a)', async () => {
    const queuedQ = { id: 'SIG-15', type: 'Q', title: 'Which export format?', status: 'Q', epic: 'M6.E3', v1: 'work/epics/M6.E3' };
    const otherQ = { id: 'SIG-16', type: 'Q', title: 'Which import format?', status: 'Q', epic: 'M6.E4', v1: 'work/epics/M6.E4' };
    const { blocking } = await collectPreflight(storeProject(version, { items: [...ITEMS, queuedQ, otherQ] }), { epic: 'M6.E3' });
    expect(blocking.filter((b) => b.source === 'work store')).toEqual([
      { source: 'work store', question: 'Should the M6.E3 export include archived rows?', detail: 'SIG-9 names M6.E3' },
      { source: 'work store', question: 'Which export format?', detail: 'SIG-15 is in M6.E3 (queued or started)' },
    ]);
  });

  it('with no Epic, still reads the questions and blocks on none', async () => {
    const { blocking, checked } = await collectPreflight(storeProject(version), { epic: null });
    expect(blocking.filter((b) => b.source === 'work store')).toEqual([]);
    expect(checked).toContain('open questions (work store)');
  });

  it('a record that does not read is could-not-check, beside the questions it did read', async () => {
    const base = storeProject(version);
    putBroken(base, version, 'SIG-15');
    const { blocking, cannotCheck } = await collectPreflight(base, { epic: 'M6.E3' });
    expect(blocking.filter((b) => b.source === 'work store').map((b) => b.detail)).toEqual(['SIG-9 names M6.E3']);
    expect(cannotCheck.find((c) => c.source === 'open questions (work store)').reason).toMatch(/SIG-15/);
  });
});

describe('t4.3 — collectPreflight with a broken WORK.md', () => {
  it('cannot check the questions, and does not read OPEN-QUESTIONS.md instead', async () => {
    const base = storeProject(2);
    put(base, '.planning/work/WORK.md', BROKEN_WORK_MD);
    const { blocking, checked, cannotCheck } = await collectPreflight(base, { epic: 'M6.E3' });
    expect(blocking.map((b) => b.question).join('\n')).not.toContain('Decoy');
    expect(checked).not.toContain('OPEN-QUESTIONS.md');
    expect(cannotCheck.find((c) => c.source === 'open questions (work store)').reason).toMatch(/the work store could not be read/);
  });
});

describe.each(VERSIONS)('t4.3 — status.readOpenQuestions on a v%i store', (version) => {
  it('counts the open question records — never a closed or closing one, never the decoy file', async () => {
    expect(await readOpenQuestions(storeProject(version))).toEqual({
      count: 2,
      top: ['Should the M6.E3 export include archived rows?', 'A standing question about naming'],
    });
  });

  it('keeps the first three and clips each to 80 characters, as the file reader does', async () => {
    const long = 'Q'.repeat(100);
    const items = [
      ...ITEMS,
      { id: 'SIG-20', type: 'Q', title: long, status: 'T', v1: 'work/backlog' },
      { id: 'SIG-21', type: 'Q', title: 'Fourth', status: 'T', v1: 'work/backlog' },
    ];
    const r = await readOpenQuestions(storeProject(version, { items }));
    expect(r.count).toBe(4);
    expect(r.top).toHaveLength(3);
    expect(r.top[2]).toBe(`${'Q'.repeat(79)}…`);
  });

  it('a store with no open question is a count of zero, not an absent section', async () => {
    const items = ITEMS.filter((i) => i.type !== 'Q');
    expect(await readOpenQuestions(storeProject(version, { items }))).toEqual({ count: 0, top: [] });
  });

  it('a record that does not read is named, so the count is not mistaken for complete', async () => {
    const base = storeProject(version);
    putBroken(base, version, 'SIG-15');
    const r = await readOpenQuestions(base);
    expect(r.count).toBe(2);
    expect(r.unreadable).toEqual(['SIG-15']);
  });
});

describe('t4.3 — status.readOpenQuestions with a broken WORK.md', () => {
  it('reports the error — never null (absent) and never a count of zero', async () => {
    const base = storeProject(2);
    put(base, '.planning/work/WORK.md', BROKEN_WORK_MD);
    const r = await readOpenQuestions(base);
    expect(r.count).toBeNull();
    expect(r.top).toEqual([]);
    expect(r.error).toMatch(/the work store could not be read/);
  });

  it('a v2 record removed between reads is simply not counted', async () => {
    const base = storeProject(2);
    rmSync(join(base, recordPath('SIG-9')));
    expect((await readOpenQuestions(base)).count).toBe(1);
  });
});
