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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { captureToFutureIdeas, captureToBugs, captureToOpenQuestions } from '../plugin/tools/lib/add.js';
import { captureCheckpointContext } from '../plugin/tools/lib/checkpoint.js';
import {
  promoteToBacklog,
  promoteToBugs,
  dischargeBacklogRows,
  ROW_DISCHARGE,
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
import { generateAll, GENERATED_FILES } from '../plugin/tools/lib/work-generate.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';
import { getItem, listItems, newItem } from '../plugin/tools/lib/work-ops.js';

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

// The lists on disk are exactly what the generator makes of the items on disk.
async function expectOnlyGeneratorWrote() {
  const before = await lists();
  for (const name of GENERATED_FILES) {
    expect(before[name], `${name} exists`).not.toBeNull();
    expect(before[name].split('\n')[0], `${name} is generated`).toBe(GENERATED_MARKER);
  }
  await generateAll(root);
  expect(await lists()).toEqual(before);
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
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('add.js — every capture route is an item', () => {
  it('default, --bug, --question → inbox items; lists only generated', async () => {
    await captureToFutureIdeas(root, { body: 'An idea.', today: TODAY, sensitivePrompt: keep });
    await captureToBugs(root, { body: 'A bug.', today: TODAY, sensitivePrompt: keep });
    await captureToOpenQuestions(root, { body: 'A question?', today: TODAY, sensitivePrompt: keep });
    const rows = listItems(root).map((r) => [r.item.id, r.item.type, r.item.status, r.path]);
    expect(rows).toEqual([
      ['SIG-1', 'NEW', 'N', '.planning/work/inbox/SIG-1.md'],
      ['SIG-2', 'BUG', 'N', '.planning/work/inbox/SIG-2.md'],
      ['SIG-3', 'Q', 'N', '.planning/work/inbox/SIG-3.md'],
    ]);
    await expectOnlyGeneratorWrote();
  });
});

describe('checkpoint.js — questions are items', () => {
  it('questions → Q items; decisions unchanged; lists only generated', async () => {
    await captureCheckpointContext(root, { decisions: ['D'], questions: ['Q one?'] });
    expect(listItems(root).map((r) => [r.item.type, r.item.status])).toEqual([['Q', 'N']]);
    await expectOnlyGeneratorWrote();
  });
});

describe('backlog.js — promote and discharge move items', () => {
  it('promoteToBacklog from a generated inbox block moves THAT item to backlog/ (roadmap → FEAT)', async () => {
    await captureToFutureIdeas(root, { body: 'Export as CSV.', title: 'CSV export', today: TODAY, sensitivePrompt: keep });
    const block = await inboxBlockFor('SIG-1');
    const res = await promoteToBacklog(root, { block, tag: 'roadmap', today: TODAY });
    expect(res).toMatchObject({ written: true, id: 'SIG-1', path: planning('work', 'backlog', 'SIG-1.md') });
    expect(getItem(root, 'SIG-1').item).toMatchObject({ type: 'FEAT', status: 'T', title: 'CSV export' });
    expect(listItems(root)).toHaveLength(1); // moved, not copied
    await expectOnlyGeneratorWrote();
    expect(await readFile(planning('BACKLOG.md'), 'utf-8')).toContain('### CSV export · SIG-1');
  });

  it('hygiene → CHORE, and a retitle is applied', async () => {
    await captureToFutureIdeas(root, { body: 'Tidy.', today: TODAY, sensitivePrompt: keep });
    const block = await inboxBlockFor('SIG-1');
    await promoteToBacklog(root, { block, tag: 'hygiene', title: 'Tidy the index', today: TODAY });
    expect(getItem(root, 'SIG-1').item).toMatchObject({ type: 'CHORE', status: 'T', title: 'Tidy the index' });
  });

  it('promoting the same item again is a no-op (dedupe)', async () => {
    await captureToFutureIdeas(root, { body: 'Once.', today: TODAY, sensitivePrompt: keep });
    const block = await inboxBlockFor('SIG-1');
    await promoteToBacklog(root, { block, tag: 'roadmap', today: TODAY });
    const again = await promoteToBacklog(root, { block, tag: 'roadmap', today: TODAY });
    expect(again).toMatchObject({ written: false, deduped: true, id: 'SIG-1' });
    expect(listItems(root)).toHaveLength(1);
  });

  it('a raw block with no item id → a new item, triaged to backlog/; re-promoting it dedupes', async () => {
    const block = '## Batch the index writes\n\nOne write per run.\n\n---\n';
    const res = await promoteToBacklog(root, { block, tag: 'hygiene', today: TODAY });
    expect(res).toMatchObject({ written: true, id: 'SIG-1' });
    expect(getItem(root, 'SIG-1')).toMatchObject({
      item: { type: 'CHORE', status: 'T', title: 'Batch the index writes' },
      body: 'One write per run.',
      path: '.planning/work/backlog/SIG-1.md',
    });
    const again = await promoteToBacklog(root, { block, tag: 'hygiene', today: TODAY });
    expect(again).toMatchObject({ written: false, deduped: true, id: 'SIG-1' });
    expect(listItems(root)).toHaveLength(1);
    await expectOnlyGeneratorWrote();
  });

  it('promoteToBugs: an inbox item becomes a BUG in backlog/; a raw block becomes a new BUG', async () => {
    await captureToFutureIdeas(root, { body: 'It crashes on empty input.', today: TODAY, sensitivePrompt: keep });
    const block = await inboxBlockFor('SIG-1');
    const a = await promoteToBugs(root, { block });
    expect(a).toMatchObject({ written: true, id: 'SIG-1' });
    expect(getItem(root, 'SIG-1').item).toMatchObject({ type: 'BUG', status: 'T' });
    const b = await promoteToBugs(root, { block: '## Lock left behind\n\nA killed run leaves the lock.\n\n---\n' });
    expect(b).toMatchObject({ written: true, id: 'SIG-2' });
    expect(getItem(root, 'SIG-2').item).toMatchObject({ type: 'BUG', status: 'T', title: 'Lock left behind' });
    expect(await promoteToBugs(root, { block })).toMatchObject({ written: false, deduped: true });
    await expectOnlyGeneratorWrote();
    expect(await readFile(planning('BUGS.md'), 'utf-8')).toMatch(/^\| B2 \| `confirmed` \|/m);
  });

  it('dischargeBacklogRows closes the named item as fixed, with the discharge as proof', async () => {
    await promoteToBacklog(root, { block: '## Search archived Epics\n\nx\n\n---\n', tag: 'roadmap', today: TODAY });
    await promoteToBacklog(root, { block: '## Tidy the command index\n\ny\n\n---\n', tag: 'hygiene', today: TODAY });
    const res = await dischargeBacklogRows(root, { rows: ['tidy the command', 'no such row'], by: 'M6.E11', at: TODAY });
    expect(res.written).toBe(true);
    expect(res.results).toEqual([
      { row: 'tidy the command', status: ROW_DISCHARGE.DISCHARGED, reason: null, heading: 'Tidy the command index', line: null, id: 'SIG-2' },
      { row: 'no such row', status: ROW_DISCHARGE.NOT_FOUND, reason: 'no live backlog row matches "no such row"', heading: null, line: null },
    ]);
    const closed = getItem(root, 'SIG-2');
    expect(closed.path).toBe('.planning/work/done/2026-09/SIG-2.md');
    expect(closed.item.close).toMatchObject({ reason: 'fixed', by: 'M6.E11', at: TODAY, proof: 'DONE — M6.E11, 2026-09-29' });
    await expectOnlyGeneratorWrote();
    expect(await readFile(planning('BACKLOG.md'), 'utf-8')).not.toContain('Tidy the command index');
  });

  it('dischargeBacklogRows: an ambiguous row refuses, an already-closed row says so, nothing written', async () => {
    await promoteToBacklog(root, { block: '## Index speed\n\nx\n\n---\n', tag: 'roadmap', today: TODAY });
    await promoteToBacklog(root, { block: '## Index size\n\ny\n\n---\n', tag: 'roadmap', today: TODAY });
    const amb = await dischargeBacklogRows(root, { rows: ['index'], by: 'M6.E11', at: TODAY });
    expect(amb.written).toBe(false);
    expect(amb.results[0].status).toBe(ROW_DISCHARGE.AMBIGUOUS);
    await dischargeBacklogRows(root, { rows: ['Index speed'], by: 'M6.E11', at: TODAY });
    const again = await dischargeBacklogRows(root, { rows: ['Index speed'], by: 'M6.E11', at: TODAY });
    expect(again.written).toBe(false);
    expect(again.results[0]).toMatchObject({ status: ROW_DISCHARGE.ALREADY_DISCHARGED, id: 'SIG-1' });
  });

  it('dischargeBacklogRows never matches bugs, questions or untriaged captures (they are not backlog rows)', async () => {
    await newItem(root, { type: 'BUG', title: 'Index crash', by: 't' });
    await newItem(root, { type: 'Q', title: 'Index question?', by: 't' });
    await newItem(root, { title: 'Index idea', by: 't' });
    const res = await dischargeBacklogRows(root, { rows: ['Index'], by: 'M6.E11', at: TODAY });
    expect(res.results[0].status).toBe(ROW_DISCHARGE.NOT_FOUND);
    expect(listItems(root, { status: 'C' })).toEqual([]);
  });
});

describe('drain.js — refuses outright when the store is on (AC-6.3, D-M6E11-25)', () => {
  async function seeded() {
    await captureToFutureIdeas(root, { body: 'An idea.', today: TODAY, sensitivePrompt: keep });
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
    expect(getItem(root, 'SIG-1').item.status).toBe('N');
  });

  it('a broken WORK.md surfaces as CONFIG, not a hang or a drain write', async () => {
    await put('.planning/ISSUES-INBOX.md', '# Issues Inbox\n\n## A\n\nx\n\n---\n\n*Last updated: 2026-01-01*\n');
    await put('.planning/work/WORK.md', '---\nkey: 1bad\n---\n');
    await expect(evictTerminalToLedger(root)).rejects.toMatchObject({ code: 'CONFIG' });
  });
});

describe('archive-tree.js — the link rewrite leaves generated lists to the generator', () => {
  it('a scaffold move rewrites the item body and regenerates the lists; no write into a generated file', async () => {
    await newItem(root, { title: 'Follow up the plan', body: 'See [the plan](M6.E1-PLAN.md).', by: 't' });
    await put('.planning/M6.E1-RETROSPECTIVE.md', '# M6.E1 retro\n');
    await put('.planning/M6.E1-PLAN.md', '# M6.E1 plan\n');
    expect(await readFile(planning('ISSUES-INBOX.md'), 'utf-8')).toContain('](M6.E1-PLAN.md)');

    const res = await applyArchiveTree(root, { apply: true });
    expect(res.applied).toBe(true);
    expect(existsSync(planning('archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(true);
    // The item file was rewritten for the move (it sits two levels down).
    expect(getItem(root, 'SIG-1').body).toBe('See [the plan](../../archive/M6/E1/M6.E1-PLAN.md).');
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
    const itemBefore = getItem(root, 'SIG-1').body;
    await expect(applyArchiveTree(root, { apply: true })).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringMatching(/BUGS\.md/) });
    expect(existsSync(planning('M6.E1-PLAN.md'))).toBe(true);
    expect(existsSync(planning('M6.E1-RETROSPECTIVE.md'))).toBe(true);
    expect(existsSync(planning('archive'))).toBe(false);
    expect(getItem(root, 'SIG-1').body).toBe(itemBefore);
    expect(await readFile(planning('BUGS.md'), 'utf-8')).toBe('# Bugs\n\nkept by hand\n');
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

describe('backlog.js createBacklogIfMissing — a no-op with the store on', () => {
  it('writes no hand skeleton: BACKLOG.md is the generator\'s', async () => {
    const res = await createBacklogIfMissing(root, { today: TODAY });
    expect(res.created).toBe(false);
    expect(existsSync(planning('BACKLOG.md'))).toBe(false);
  });
});

describe('migrate-memory.js — the snapshot rollback can restore a generated file', () => {
  it('snap a generated BACKLOG.md, regenerate it, roll back: bytes restored, no GENERATED throw', async () => {
    await newItem(root, { type: 'FEAT', title: 'first', by: 't' });
    await generateAll(root);
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
    await generateAll(root);
    await newItem(root, { title: 'x', by: 't' });
    // A snapshot taken when BUGS.md was NOT generated (hand bytes) cannot be
    // restored over the generated file — that would be a hand write into it.
    const { snapshot, rollback } = createSnapshotter(planning());
    snapshot.set('BUGS.md', { abs: planning('BUGS.md'), existed: true, bytes: '# Bugs, by hand\n' });
    await expect(rollback()).rejects.toMatchObject({ code: 'GENERATED' });
  });
});
