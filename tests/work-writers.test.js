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
