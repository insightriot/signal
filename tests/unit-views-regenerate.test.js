// M6.E16.S5.t5.0b — a unit write regenerates the views, as an item write does.
//
// Until S5 no unit writer touched the views (no view showed a unit). Now each
// one, after its record lands, regenerates them under the same lock; a
// regeneration that fails leaves the record change standing and says so; and
// what the views would refuse (a hand-kept view) refuses the write first, so
// no record lands that the views cannot show. `ensureUnitsDir` writes no
// record and regenerates nothing.
//
// Stores are temp folders; unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as units from '../plugin/tools/lib/unit-records.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { regenerateToMemory } from '../plugin/tools/lib/work-views.js';
import { WORK_LOCK_REL } from '../plugin/tools/lib/work-store.js';

const AT = '2026-10-11T10:00:00.000Z';
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const by = 'claude';
const UNITS = '.planning/work/units';
const BUGS = '.planning/BUGS.md';

const E = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: SHA },
  shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA },
  held: { type: 'held', at: AT, by, reason: 'still read daily' },
};

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const plant = (id, events) => put(`${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
const bytes = (id) => readFile(join(base, `${UNITS}/${id}.json`), 'utf-8');

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-unit-views-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await plant('M7.E1', [E.opened]);
  await plant('M7.E2', [E.opened, E.closing]);
  await plant('M7.E3', [E.opened, E.closing, E.shipped]);
  await plant('M7.E4', [E.opened, E.closing, E.shipped, E.held]);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

// Every writer of unit-records.js, each on a unit in the state it needs.
const WRITERS = {
  openUnit: (opts) => units.openUnit(base, 'M7.E9', { by, at: AT }, opts),
  requestUnitClose: (opts) => units.requestUnitClose(base, 'M7.E1', { proof: SHA, by, at: AT }, opts),
  rerequestUnitClose: (opts) => units.rerequestUnitClose(base, 'M7.E2', { proof: OTHER, by, at: AT }, opts),
  confirmUnitClose: (opts) => units.confirmUnitClose(base, 'M7.E2', { proof: SHA, by, at: AT }, opts),
  closeUnit: (opts) => units.closeUnit(base, 'M7.E1', { reason: 'dropped', words: 'moved elsewhere', by, at: AT }, opts),
  reopenUnit: (opts) => units.reopenUnit(base, 'M7.E3', { reason: 'it came back', by, at: AT }, opts),
  holdUnit: (opts) => units.holdUnit(base, 'M7.E3', { reason: 'keep', by, at: AT }, opts),
  releaseUnit: (opts) => units.releaseUnit(base, 'M7.E4', { by, at: AT }, opts),
  editUnit: (opts) => units.editUnit(base, 'M7.E1', { changes: { title: 'a title' }, by, at: AT }, opts),
};

describe('every unit writer regenerates the views after its record lands', () => {
  it('the table below names every lock-taking writer of unit-records.js but ensureUnitsDir', () => {
    const writers = Object.keys(units).filter((n) => /^(open|request|rerequest|confirm|close|reopen|hold|release|edit)Unit/.test(n));
    expect(Object.keys(WRITERS).sort()).toEqual(writers.sort());
  });

  for (const [name, run] of Object.entries(WRITERS)) {
    it(`${name}: regenerate is called once, with the project, under the lock, after the write`, async () => {
      const calls = [];
      const before = existsSync(join(base, `${UNITS}/M7.E9.json`)) ? null : await Promise.all(['M7.E1', 'M7.E2', 'M7.E3', 'M7.E4'].map(bytes));
      await run({
        regenerate: async (dir) => {
          const after = await Promise.all(['M7.E1', 'M7.E2', 'M7.E3', 'M7.E4'].map(bytes));
          calls.push({ dir, locked: existsSync(join(base, WORK_LOCK_REL)), landed: existsSync(join(base, `${UNITS}/M7.E9.json`)) || String(after) !== String(before) });
        },
      });
      expect(calls).toEqual([{ dir: base, locked: true, landed: true }]);
    });

    it(`${name}: with no regenerate injected, the views on disk equal a regeneration`, async () => {
      expect(existsSync(join(base, BUGS))).toBe(false);
      await run({});
      const views = regenerateToMemory(base);
      for (const [rel, text] of Object.entries(views)) expect(await readFile(join(base, rel), 'utf-8'), rel).toBe(text);
      expect(records.checkRecords(base)).toEqual([]);
    });
  }
});

describe('a regeneration that fails leaves the record change standing, and says so', () => {
  it('the error names what landed and that the views were not regenerated; the record is changed', async () => {
    const before = await bytes('M7.E1');
    const err = await units.holdUnit(base, 'M7.E1', { reason: 'keep', by, at: AT }, {
      regenerate: async () => { throw new Error('the disk said no'); },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/M7\.E1 .*that change stands — but the views were not regenerated: the disk said no/s);
    expect(err.changeStands).toBe(true);
    expect(await bytes('M7.E1')).not.toBe(before);
    expect(units.getUnit(base, 'M7.E1').held).toBe(true);
  });
});

describe('what the views would refuse refuses the unit write first', () => {
  it('a hand-kept view: the write is refused, naming it, and the record is byte-identical', async () => {
    await put(BUGS, '# Bugs\n\nkept by hand\n');
    const before = await bytes('M7.E1');
    const err = await units.holdUnit(base, 'M7.E1', { reason: 'keep', by, at: AT }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFIG' });
    expect(err.message).toMatch(/nothing was written — the views cannot be regenerated as things stand: .*BUGS\.md is hand-kept/s);
    expect(await bytes('M7.E1')).toBe(before);
    expect(existsSync(join(base, `${UNITS}/M7.E9.json`))).toBe(false);
    await expect(units.openUnit(base, 'M7.E9', { by, at: AT })).rejects.toMatchObject({ code: 'CONFIG' });
    expect(existsSync(join(base, `${UNITS}/M7.E9.json`))).toBe(false);
  });
});

describe('ensureUnitsDir writes no record and regenerates nothing', () => {
  it('no view file appears', async () => {
    await rm(join(base, UNITS), { recursive: true, force: true });
    await units.ensureUnitsDir(base);
    expect(existsSync(join(base, BUGS))).toBe(false);
    expect(existsSync(join(base, '.planning/work/EPICS.md'))).toBe(false);
  });
});
