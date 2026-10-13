// M6.E16.S5.t5.4 — a unit view that does not match its records is reported
// (AC7.4). See .planning/M6.E16-VALIDATION.md row AC7.4.
//
// With unit records, `work/EPICS.md` and the current milestone file's Epic
// table are views of the unit records. `checkRecords` — the store check the
// sweep runs, and the one `tests/work-views-fresh.test.js` runs on this
// repository — reports either as `view-stale` when it differs from a fresh
// render. Text outside the milestone file's markers is the person's and is
// never stale. Without unit records nothing new is reported.
//
// Stores are temp folders; unit and milestone names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { epicMarkers, EPICS_BEGIN, EPICS_END } from '../plugin/tools/lib/milestone-table.js';
import { regenerateViews, regenerateToMemory } from '../plugin/tools/lib/work-views.js';
import * as records from '../plugin/tools/lib/work-records.js';
import * as unitLib from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';

const by = 'claude';
const AT = '2026-10-01T10:00:00.000Z';
const UNITS = '.planning/work/units';
const MS = '.planning/MILESTONE-7.md';
const EPICS = '.planning/work/EPICS.md';
const opened = { type: 'opened', at: AT, by };

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const read = (rel) => readFile(join(base, rel), 'utf-8');

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-unit-views-fresh-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`${UNITS}/M7.E5.json`, UNIT_KIND.serializeRecord({ id: 'M7.E5', summary: 'In flight.', events: [opened] }));
  await put('.planning/STATE.md', '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M7.E5\ncompleted_phases: []\n---\n# State\n');
  await put(MS, `# Milestone 7\n\nWritten by a person.\n\n${EPICS_BEGIN}\n${EPICS_END}\n\nAfter.\n`);
  await regenerateViews(base);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('checkRecords reports a stale unit view (AC7.4)', () => {
  it('fresh after a regeneration: no finding', () => {
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a stale Epic table is reported view-stale, by the milestone file\'s path', async () => {
    const text = await read(MS);
    await put(MS, text.replace('**in flight**', '**shipped**'));
    expect(records.checkRecords(base)).toEqual([
      { code: 'view-stale', id: null, path: MS, message: expect.stringMatching(/MILESTONE-7\.md: its Epic table .*differs from a regeneration of the unit records/s) },
    ]);
  });

  it('EPICS.md edited by hand is reported view-stale', async () => {
    await put(EPICS, (await read(EPICS)).replace('M7.E5 — open', 'M7.E5 — closed'));
    expect(records.checkRecords(base).map((f) => [f.code, f.path])).toEqual([['view-stale', EPICS]]);
  });

  it('a record changed without regenerating leaves both stale; regenerating clears both', async () => {
    await unitLib.holdUnit(base, 'M7.E5', { reason: 'keep', by }, { regenerate: async () => {} });
    expect(records.checkRecords(base).map((f) => [f.code, f.path])).toEqual([
      ['view-stale', MS],
      ['view-stale', EPICS],
    ]);
    await regenerateViews(base);
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('text changed outside the markers is not stale', async () => {
    await put(MS, (await read(MS)).replace('Written by a person.', 'Rewritten by a person.').replace('After.', 'Afterwards.'));
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('broken markers are reported: the views cannot be regenerated to compare', async () => {
    await put(MS, `${EPICS_BEGIN}\n${EPICS_BEGIN}\n${EPICS_END}\n`);
    expect(records.checkRecords(base)).toEqual([
      { code: 'view-stale', id: null, path: '.planning/work', message: expect.stringMatching(/could not be regenerated.*MILESTONE-7\.md.*appears 2 times/s) },
    ]);
  });

  it('a milestone file with no markers is not a view, and is never stale', async () => {
    await put(MS, '# Milestone 7\n\n| `M7.E5` | hand-written | x |\n');
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('the sweep carries it, as it carries a stale item view', async () => {
    const { checkWorkStore } = await import('../plugin/tools/lib/sweep.js');
    await put(MS, (await read(MS)).replace('**in flight**', '**shipped**'));
    expect(checkWorkStore(base)).toEqual([
      { check: 'work-store', severity: 'advisory', file: MS, message: expect.stringMatching(/its Epic table/) },
    ]);
  });
});

// ── This repository ─────────────────────────────────────────────────────────
//
// `tests/work-views-fresh.test.js` (checkRecords has zero findings) and
// `tests/work-generated-fresh.test.js` (every regenerated view equals the
// file on disk) already run on this repository, and both take whatever
// `regenerateToMemory` returns — so the day this repository has unit records
// and a marked milestone table, both cover EPICS.md and the table with no
// edit. This pins that join: whatever the unit path renders here is in the
// map those two tests compare.

const REPO = fileURLToPath(new URL('..', import.meta.url));

describe('this repository (AC7.4, live)', () => {
  it('with unit records, EPICS.md is rendered from them; without, the milestone file is not a view', () => {
    const views = regenerateToMemory(REPO);
    const milestoneKeys = Object.keys(views).filter((rel) => /^\.planning\/MILESTONE-[^/]+\.md$/.test(rel));
    if (unitLib.hasUnitsSafe(REPO).has) {
      expect(views[EPICS]).not.toMatch(/no Epic folder/);
    } else {
      expect(milestoneKeys).toEqual([]);
    }
    // A milestone file is a view only when it carries the markers. The current
    // milestone's is one whatever its table says; any other marked milestone
    // file is one only while its table is stale — so at most one is fresh.
    const onDisk = (rel) => readFileSync(join(REPO, rel), 'utf-8');
    for (const rel of milestoneKeys) expect(epicMarkers(onDisk(rel)).state, rel).toBe('ok');
    expect(milestoneKeys.filter((rel) => views[rel] === onDisk(rel)).length).toBeLessThanOrEqual(1);
  });
});
