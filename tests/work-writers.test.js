// Writers switch to the store (M6.E11 S4, AC-6.2, D-M6E11-4).
// See .planning/M6.E11-VALIDATION.md row AC-6.2.
//
// With the store on, BUGS.md, BACKLOG.md, ISSUES-INBOX.md and OPEN-QUESTIONS.md
// are views of the item files. For each writer module this runs its store-on
// path and checks two things:
//   1. the item landed where it should (folder + status + type);
//   2. no one but the generator wrote a list: re-running the generator over
//      the items now on disk changes nothing. Any append, stamp or edit by a
//      writer would make the lists differ from what the items generate.
// Store OFF is covered by tests/work-store-off.test.js (the golden baseline).
//
// M6.E13 t4.5b: capture (add.js, checkpoint.js) and promotion (backlog.js)
// write v2 records through `work-records.js`, so their describes run on a v2
// store and check the views against `regenerateToMemory`; on a v1 store they
// refuse, naming the migration tool. t7.4 retired the v1 writers: discharge,
// drain, archive-tree and the snapshot rollback run on a v2 store too (the v2
// discharge's own cases are in backlog-discharge-v2.test.js), and the
// discharge and archive-tree refuse a v1 store like capture does.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { captureToFutureIdeas, captureToBugs, captureToOpenQuestions } from '../plugin/tools/lib/add.js';
import { captureCheckpointContext } from '../plugin/tools/lib/checkpoint.js';
import {
  promoteToBacklog,
  promoteToBugs,
  dischargeBacklogRows,
} from '../plugin/tools/lib/backlog.js';
import {
  applyDispositionToFile,
  applyDispositionToFileCore,
  evictTerminalToLedger,
  promoteDrainEntry,
} from '../plugin/tools/lib/drain.js';
import { applyArchiveTree } from '../plugin/tools/lib/archive-tree.js';
import { createSnapshotter } from '../plugin/tools/lib/migrate-memory.js';
import { createBacklogIfMissing } from '../plugin/tools/lib/backlog.js';
import { GENERATED_FILES } from '../plugin/tools/lib/work-generate.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';
import { bodyPath, getRecord, listRecords, newItem, recordPath } from '../plugin/tools/lib/work-records.js';
import { regenerateToMemory, regenerateViews } from '../plugin/tools/lib/work-views.js';

const TODAY = '2026-09-29';
const keep = async () => 'keep';

let root;
const planning = (...p) => join(root, '.planning', ...p);

async function put(rel, text) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf-8');
}

async function lists() {
  const out = {};
  for (const name of GENERATED_FILES) {
    out[name] = existsSync(planning(name)) ? await readFile(planning(name), 'utf-8') : null;
  }
  return out;
}

// The lists on disk are generated, and exactly what the views make of the
// records on disk.
async function expectOnlyGeneratorWrote() {
  const before = await lists();
  for (const name of GENERATED_FILES) {
    expect(before[name], `${name} exists`).not.toBeNull();
    expect(before[name].split('\n')[0], `${name} is generated`).toBe(GENERATED_MARKER);
  }
  await expectViewsFresh();
}

// The block a drain would hand over: one entry of the GENERATED inbox.
async function inboxBlockFor(id) {
  const text = await readFile(planning('ISSUES-INBOX.md'), 'utf-8');
  const start = text.indexOf('\n## ', text.indexOf(`· ${id}`) - 400) + 1;
  const end = text.indexOf('\n---\n', text.indexOf(`· ${id}`)) + 5;
  const block = text.slice(start, end);
  expect(block).toContain(`**Status:** untriaged (N) · ${id}`);
  return block;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'signal-writers-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
});

// A v2 store (M6.E13): capture and promotion write records.
const v2 = () => put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n# Work store\n');

// The views on disk are exactly what the v2 views make of the records on disk.
async function expectViewsFresh() {
  const views = regenerateToMemory(root);
  for (const [rel, text] of Object.entries(views)) {
    expect(await readFile(join(root, rel), 'utf-8'), rel).toBe(text);
  }
}

const bodyOf = (id) => readFile(join(root, bodyPath(id)), 'utf-8');
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('add.js — every capture route is a record (v2)', () => {
  beforeEach(v2);

  it('default, --bug, --question → status-N records; views only generated', async () => {
    await captureToFutureIdeas(root, { body: 'An idea.', today: TODAY, sensitivePrompt: keep });
    await captureToBugs(root, { body: 'A bug.', today: TODAY, sensitivePrompt: keep });
    await captureToOpenQuestions(root, { body: 'A question?', today: TODAY, sensitivePrompt: keep });
    const rows = listRecords(root).records.map((r) => [r.id, r.record.type, r.status, r.path]);
    expect(rows).toEqual([
      ['SIG-1', 'NEW', 'N', recordPath('SIG-1')],
      ['SIG-2', 'BUG', 'N', recordPath('SIG-2')],
      ['SIG-3', 'Q', 'N', recordPath('SIG-3')],
    ]);
    await expectViewsFresh();
  });

  it('a multi-line body or title still captures: the record title is one line (the schema refuses a line break)', async () => {
    const derived = await captureToFutureIdeas(root, { body: 'First clause here\nsecond half. Rest of it.', today: TODAY, sensitivePrompt: keep });
    const given = await captureToBugs(root, { body: 'Body.', title: 'Given title\r\ncontinued', today: TODAY, sensitivePrompt: keep });
    expect(derived.written).toBe(true);
    expect(given.written).toBe(true);
    expect(getRecord(root, derived.id).record.title).toBe('First clause here second half');
    expect(getRecord(root, given.id).record.title).toBe('Given title continued');
    await expectViewsFresh();
  });
});

describe('checkpoint.js — questions are records (v2)', () => {
  beforeEach(v2);

  it('questions → Q records; decisions unchanged; views only generated', async () => {
    await captureCheckpointContext(root, { decisions: ['D'], questions: ['Q one?'] });
    expect(listRecords(root).records.map((r) => [r.record.type, r.status])).toEqual([['Q', 'N']]);
    await expectViewsFresh();
  });
});

describe('capture and promotion refuse on a v1 store, naming the migration tool (M6.E13 t4.5b, AC4.2)', () => {
  const refused = (err) => {
    expect(err).toMatchObject({ code: 'CONFIG', version: 1 });
    expect(err.message).toContain('node tools/work-migrate-v2.mjs');
  };
  const nothingWritten = async () => {
    expect(existsSync(planning('work', 'items'))).toBe(false);
    expect(existsSync(planning('work', 'inbox'))).toBe(false);
    expect(existsSync(planning('work', 'backlog'))).toBe(false);
    for (const v of Object.values(await lists())) expect(v).toBeNull();
  };

  it('applyArchiveTree — refused before anything is locked or moved', async () => {
    await put('.planning/M6.E1-RETROSPECTIVE.md', '# M6.E1 retro\n');
    await put('.planning/M6.E1-PLAN.md', '# M6.E1 plan\n');
    refused(await applyArchiveTree(root, { apply: true }).catch((e) => e));
    expect(existsSync(planning('M6.E1-PLAN.md'))).toBe(true);
    expect(existsSync(planning('archive'))).toBe(false);
    expect(existsSync(planning('work', '.lock'))).toBe(false);
  });

  it('/sig:add', async () => {
    refused(await captureToBugs(root, { body: 'A bug.', today: TODAY, sensitivePrompt: keep }).catch((e) => e));
    await nothingWritten();
  });

  it('/sig:checkpoint — aborted, nothing written', async () => {
    const r = await captureCheckpointContext(root, { decisions: ['D'], questions: ['Q one?'] });
    expect(r).toMatchObject({ aborted: 'work-store-failed', wrote: [], error: { code: 'CONFIG' } });
    expect(r.error.message).toContain('node tools/work-migrate-v2.mjs');
    await nothingWritten();
  });

  it.each([
    ['promoteToBacklog', () => promoteToBacklog(root, { block: '## A row\n\nx\n', tag: 'roadmap', today: TODAY })],
    ['promoteToBugs', () => promoteToBugs(root, { block: '## A bug\n\nx\n' })],
    ['dischargeBacklogRows', () => dischargeBacklogRows(root, { rows: ['a row'], by: 'M6.E11', at: TODAY })],
  ])('%s', async (_name, run) => {
    refused(await run().catch((e) => e));
    await nothingWritten();
  });
});

describe('backlog.js — promote files ONE record, created and triaged in one write (v2)', () => {
  beforeEach(v2);

  it('a raw block → a new record, triaged (roadmap → FEAT, status T), in one write; re-promoting it dedupes', async () => {
    const block = '## Batch the index writes\n\nOne write per run.\n\n---\n';
    const res = await promoteToBacklog(root, { block, tag: 'roadmap', today: TODAY });
    expect(res).toMatchObject({ written: true, id: 'SIG-1', path: join(root, recordPath('SIG-1')) });
    const got = getRecord(root, 'SIG-1');
    expect(got).toMatchObject({ status: 'T', body: 'One write per run.' });
    expect(got.record).toMatchObject({ type: 'FEAT', title: 'Batch the index writes', source: '/sig:plan drain' });
    expect(got.record.source_ref).toMatch(/^backlog-key: [0-9a-f]{40}$/);
    expect(got.record.events.map((e) => e.type)).toEqual(['created', 'triaged']);
    const again = await promoteToBacklog(root, { block, tag: 'roadmap', today: TODAY });
    expect(again).toMatchObject({ written: false, deduped: true, id: 'SIG-1' });
    expect(listRecords(root).records).toHaveLength(1);
    await expectViewsFresh();
    expect(await readFile(planning('BACKLOG.md'), 'utf-8')).toContain('Batch the index writes');
  });

  it('hygiene → CHORE, and a retitle is applied', async () => {
    const res = await promoteToBacklog(root, { block: '## Tidy\n\nx\n', tag: 'hygiene', title: 'Tidy the index', today: TODAY });
    expect(getRecord(root, res.id).record).toMatchObject({ type: 'CHORE', title: 'Tidy the index' });
  });

  // The v1 promote read an item ID back out of a GENERATED inbox block
  // (`inboxItemId`) and moved that item. Gone (PLAN t4.5b): promotion never
  // parses a view. Only the drain handed it such blocks, and the drain
  // refuses outright with the store on (below), so no caller loses anything.
  it('a block quoting a generated inbox status line is filed as a new record; the item it names is untouched', async () => {
    await captureToFutureIdeas(root, { body: 'Export as CSV.', title: 'CSV export', today: TODAY, sensitivePrompt: keep });
    const inbox = await readFile(planning('ISSUES-INBOX.md'), 'utf-8');
    const block = inbox.slice(inbox.indexOf('## CSV export'));
    expect(block).toContain('SIG-1');
    const res = await promoteToBacklog(root, { block, tag: 'roadmap', today: TODAY });
    expect(res).toMatchObject({ written: true, id: 'SIG-2' });
    expect(getRecord(root, 'SIG-1').status).toBe('N');
  });

  it('promoteToBugs: a raw block becomes a BUG record, status T; re-promoting dedupes', async () => {
    const block = '## Lock left behind\n\nA killed run leaves the lock.\n\n---\n';
    const b = await promoteToBugs(root, { block });
    expect(b).toMatchObject({ written: true, id: 'SIG-1' });
    expect(getRecord(root, 'SIG-1')).toMatchObject({ status: 'T', record: { type: 'BUG', title: 'Lock left behind' } });
    expect(getRecord(root, 'SIG-1').record.source_ref).toMatch(/^bugs-key: /);
    expect(await promoteToBugs(root, { block })).toMatchObject({ written: false, deduped: true, id: 'SIG-1' });
    await expectViewsFresh();
    expect(await readFile(planning('BUGS.md'), 'utf-8')).toMatch(/^\| SIG-1 \| `confirmed` \|/m);
  });

  it('a busy work lock: LOCKED, nothing written (one lock, taken once)', async () => {
    const planted = `4242\n${Date.now()}\nsomeone\n`;
    await put('.planning/work/.lock', planted);
    await expect(promoteToBacklog(root, { block: '## A row\n\nx\n', tag: 'roadmap', today: TODAY }))
      .rejects.toMatchObject({ code: 'LOCKED' });
    expect(existsSync(planning('work', 'items'))).toBe(false);
    expect(await readFile(planning('work', '.lock'), 'utf-8')).toBe(planted);
  });
});

describe('drain.js — refuses outright when the store is on (AC-6.3, D-M6E11-25)', () => {
  beforeEach(v2);
  async function seeded() {
    await newItem(root, { title: 'An idea', body: 'An idea.', by: 't' });
    return lists();
  }
  async function expectRefused(run) {
    const before = await seeded();
    let err;
    try {
      await run();
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe('GENERATED');
    expect(err.message).toContain('/sig:item triage');
    expect(err.message).toContain('ISSUES-INBOX.md');
    expect(await lists()).toEqual(before);
    expect(existsSync(planning('.state.lock'))).toBe(false);
    expect(existsSync(planning('archive'))).toBe(false); // no ledger started
    await expectOnlyGeneratorWrote();
  }

  it('applyDispositionToFile', () =>
    expectRefused(() => applyDispositionToFile(root, '.planning/ISSUES-INBOX.md',
      { entryIndex: 0, verb: 'defer', reason: 'drain', date: TODAY })));

  it('applyDispositionToFileCore (the lock-free export) as well', () =>
    expectRefused(() => applyDispositionToFileCore(root, '.planning/ISSUES-INBOX.md',
      { entryIndex: 0, verb: 'defer', reason: 'drain', date: TODAY })));

  it('evictTerminalToLedger', () => expectRefused(() => evictTerminalToLedger(root)));

  it('evictTerminalToLedger dry run too — one rule, not two', () =>
    expectRefused(() => evictTerminalToLedger(root, { dryRun: true })));

  it('promoteDrainEntry — refused before the destination write, so no item moves', async () => {
    await expectRefused(async () => {
      const block = await inboxBlockFor('SIG-1');
      return promoteDrainEntry(root, { classification: 'work', block, tag: 'roadmap', entryIndex: 0,
        reason: 'drain', date: TODAY });
    });
    expect(getRecord(root, 'SIG-1').status).toBe('N');
  });

  it('a broken WORK.md surfaces as CONFIG, not a hang or a drain write', async () => {
    await put('.planning/ISSUES-INBOX.md', '# Issues Inbox\n\n## A\n\nx\n\n---\n\n*Last updated: 2026-01-01*\n');
    await put('.planning/work/WORK.md', '---\nkey: 1bad\n---\n');
    await expect(evictTerminalToLedger(root)).rejects.toMatchObject({ code: 'CONFIG' });
  });

  // M6.E13 t4.5b (`drain.js:32`'s promote path): a v2 store refuses too, before
  // the promote, so no record is written.
  it('promoteDrainEntry on a v2 store — refused, no record written', async () => {
    await v2();
    const block = '## An idea\n\nx\n\n---\n';
    await expect(promoteDrainEntry(root, { classification: 'work', block, tag: 'roadmap', entryIndex: 0, reason: 'drain', date: TODAY }))
      .rejects.toMatchObject({ code: 'GENERATED' });
    expect(listRecords(root).records).toEqual([]);
  });
});

describe('archive-tree.js — the link rewrite leaves generated lists to the generator', () => {
  beforeEach(v2);
  it('a scaffold move rewrites the item body and regenerates the lists; no write into a generated file', async () => {
    await newItem(root, { title: 'Follow up the plan', body: 'See [the plan](M6.E1-PLAN.md).', by: 't' });
    await put('.planning/M6.E1-RETROSPECTIVE.md', '# M6.E1 retro\n');
    await put('.planning/M6.E1-PLAN.md', '# M6.E1 plan\n');
    expect(await readFile(planning('ISSUES-INBOX.md'), 'utf-8')).toContain('](M6.E1-PLAN.md)');

    const res = await applyArchiveTree(root, { apply: true });
    expect(res.applied).toBe(true);
    expect(existsSync(planning('archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(true);
    // The item body was rewritten for the move (it sits three levels down).
    expect(await bodyOf('SIG-1')).toBe('See [the plan](../../../archive/M6/E1/M6.E1-PLAN.md).');
    // The generated inbox follows the item, through the generator.
    const inbox = await readFile(planning('ISSUES-INBOX.md'), 'utf-8');
    expect(inbox).toContain('](archive/M6/E1/M6.E1-PLAN.md)');
    expect(inbox).not.toContain('](M6.E1-PLAN.md)');
    expect(existsSync(planning('work', '.lock'))).toBe(false);
    await expectOnlyGeneratorWrote();
  });

  // Batch 1 (REVIEW I1) made the regeneration refuse a hand-kept list — but
  // that refusal came AFTER the archive moves, so the moves stood and the
  // lists were left stale. The check belongs before anything moves.
  it('a hand-kept list refuses the apply BEFORE any file moves', async () => {
    await newItem(root, { title: 'x', body: 'See [the plan](M6.E1-PLAN.md).', by: 't' });
    await put('.planning/M6.E1-RETROSPECTIVE.md', '# M6.E1 retro\n');
    await put('.planning/M6.E1-PLAN.md', '# M6.E1 plan\n');
    await put('.planning/BUGS.md', '# Bugs\n\nkept by hand\n');
    const itemBefore = await bodyOf('SIG-1');
    await expect(applyArchiveTree(root, { apply: true })).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringMatching(/BUGS\.md/) });
    expect(existsSync(planning('M6.E1-PLAN.md'))).toBe(true);
    expect(existsSync(planning('M6.E1-RETROSPECTIVE.md'))).toBe(true);
    expect(existsSync(planning('archive'))).toBe(false);
    expect(await bodyOf('SIG-1')).toBe(itemBefore);
    expect(await readFile(planning('BUGS.md'), 'utf-8')).toBe('# Bugs\n\nkept by hand\n');
  });

  // REVIEW pass 2, P2-I7: the apply rewrites item files, so it takes the
  // store's `work` lock — with the shared 120 s WORK_LOCK_TTL_MS, or a lock a
  // live mutation has held for 10 s reads as stale and is stolen — and takes
  // it BEFORE anything moves, so a busy store refuses with nothing moved.
  it('a 10-second-old work lock → LOCKED before anything moves; the planted lock is untouched', async () => {
    await newItem(root, { title: 'x', body: 'See [the plan](M6.E1-PLAN.md).', by: 't' });
    await put('.planning/M6.E1-RETROSPECTIVE.md', '# M6.E1 retro\n');
    await put('.planning/M6.E1-PLAN.md', '# M6.E1 plan\n');
    const planted = `4242\n${Date.now() - 10_000}\nsomeone\n`;
    await put('.planning/work/.lock', planted);
    const itemBefore = await bodyOf('SIG-1');
    await expect(applyArchiveTree(root, { apply: true })).rejects.toMatchObject({ code: 'LOCKED' });
    expect(await readFile(planning('work', '.lock'), 'utf-8')).toBe(planted);
    expect(existsSync(planning('M6.E1-PLAN.md'))).toBe(true);
    expect(existsSync(planning('archive'))).toBe(false);
    expect(await bodyOf('SIG-1')).toBe(itemBefore);
  });

  it('dry run writes nothing, lists included', async () => {
    await newItem(root, { title: 'x', body: 'See [the plan](M6.E1-PLAN.md).', by: 't' });
    await put('.planning/M6.E1-RETROSPECTIVE.md', '# M6.E1 retro\n');
    await put('.planning/M6.E1-PLAN.md', '# M6.E1 plan\n');
    const before = await lists();
    await applyArchiveTree(root);
    expect(await lists()).toEqual(before);
  });
});

// REVIEW pass 2 (untested seam), carried to the v2 views at t7.4: the views
// re-check the hand-kept rule for each file as they write it, so a list
// hand-written AFTER the preflight is still not overwritten. regenerateViews
// runs synchronously up to its first write, so a file written right after the
// call lands in exactly that window.
describe('work-views.js — regenerateViews re-checks each file', () => {
  beforeEach(v2);
  it('a list hand-written after the preflight → CONFIG, and it is not overwritten', async () => {
    await newItem(root, { title: 'x', by: 't' });
    const rels = Object.keys(regenerateToMemory(root));
    const last = rels[rels.length - 1];
    const pending = regenerateViews(root);
    writeFileSync(join(root, last), '# kept by hand\n', 'utf-8'); // sync: lands before regenerateViews resumes
    // The per-file re-check's own wording — the preflight's reads "… are
    // hand-kept, not generated (the first line …", so this fails if only the
    // preflight ever fires.
    await expect(pending).rejects.toMatchObject({
      code: 'CONFIG',
      message: expect.stringMatching(new RegExp(`${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is hand-kept, not generated — it was not overwritten`)),
    });
    expect(await readFile(join(root, last), 'utf-8')).toBe('# kept by hand\n');
  });
});

describe('backlog.js createBacklogIfMissing — a no-op with the store on', () => {
  beforeEach(v2);
  it('writes no hand skeleton: BACKLOG.md is the generator\'s', async () => {
    const res = await createBacklogIfMissing(root, { today: TODAY });
    expect(res.created).toBe(false);
    expect(existsSync(planning('BACKLOG.md'))).toBe(false);
  });
});

describe('migrate-memory.js — the snapshot rollback can restore a generated file', () => {
  beforeEach(v2);
  it('snap a generated BACKLOG.md, regenerate it, roll back: bytes restored, no GENERATED throw', async () => {
    await newItem(root, { type: 'FEAT', title: 'first', by: 't' });
    await regenerateViews(root);
    const { snap, rollback } = createSnapshotter(planning());
    await snap('BACKLOG.md');
    await snap('BUGS.md');
    const before = await lists();
    await newItem(root, { type: 'BUG', title: 'changes BUGS.md', by: 't' });
    expect((await lists())['BUGS.md']).not.toBe(before['BUGS.md']);
    await rollback();
    expect((await lists())['BUGS.md']).toBe(before['BUGS.md']);
    expect((await lists())['BACKLOG.md']).toBe(before['BACKLOG.md']);
  });

  it('the rollback still refuses to put hand-written bytes over a generated file', async () => {
    await regenerateViews(root);
    await newItem(root, { title: 'x', by: 't' });
    // A snapshot taken when BUGS.md was NOT generated (hand bytes) cannot be
    // restored over the generated file — that would be a hand write into it.
    const { snapshot, rollback } = createSnapshotter(planning());
    snapshot.set('BUGS.md', { abs: planning('BUGS.md'), existed: true, bytes: '# Bugs, by hand\n' });
    await expect(rollback()).rejects.toMatchObject({ code: 'GENERATED' });
  });
});
