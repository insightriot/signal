// M6.E16.S2.t2.6 — the write-path inventory for unit-records.js (AC2.1, AC2.3).
// See .planning/M6.E16-VALIDATION.md rows AC2.1 and AC2.3.
//
// The same two checks tests/work-records-inventory.test.js runs on the item
// library, on the same helpers (tests/helpers/write-inventory.js):
//
// 1. RUNTIME — every exported function of unit-records.js is classified below
//    and the classification is checked by RUNNING it on a temp store and
//    diffing every file: a READER changes nothing; a WRITER changes a unit
//    record by appending exactly one event (old events an unchanged prefix, no
//    record moved or removed, a new record at its unitPath with one event);
//    EXEMPT carries a reviewed reason. An unclassified export fails.
// 2. STATIC — the lock scan: only the public writers take the `work` lock, each
//    by one entry point, and no internal function takes it.
//
// Each check is also run against a deliberately bad unit writer, to prove the
// helper judges unit records and not only item records.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as units from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { lockNesting, classify, checkReaders, checkWriter, snapshotTree } from './helpers/write-inventory.js';

const SOURCE = readFileSync(new URL('../plugin/tools/lib/unit-records.js', import.meta.url), 'utf-8');
const UNITS = '.planning/work/units';

const AT = '2026-10-11T10:00:00.000Z';
const SHA = '0123abc';
const by = 'claude';
const E = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: SHA },
  shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA },
  held: { type: 'held', at: AT, by, reason: 'still read daily' },
  released: { type: 'released', at: AT, by },
};
const rec = (id, events) => ({ id, events });
const at = (id) => `${UNITS}/${id}.json`;

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store with one unit in each state, and one item record beside them.
async function makeStore() {
  const base = await mkdtemp(join(tmpdir(), 'sig-unit-inventory-'));
  await put(base, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  const fixtures = [
    rec('M6.E20', [E.opened]),
    rec('M6.E21', [E.opened, E.closing]),
    rec('M6.E22', [E.opened, E.closing, E.shipped]),
    rec('M6.E23', [E.opened, E.closing, E.shipped, E.held]),
  ];
  for (const r of fixtures) await put(base, at(r.id), UNIT_KIND.serializeRecord(r));
  await put(base, '.planning/work/items/00/SIG-1.json', `${JSON.stringify({ id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }] }, null, 2)}\n`);
  return base;
}

// ── The classification of unit-records.js ───────────────────────────────────

const READERS = {
  unitPath: (base) => units.unitPath(base, 'M6.E20'),
  assertUnitId: (base) => units.assertUnitId(base, 'M6.E20', { storeKey: 'SIG' }),
  hasUnits: (base) => units.hasUnits(base),
  hasUnitsSafe: (base) => units.hasUnitsSafe(base),
  getUnit: (base) => units.getUnit(base, 'M6.E20'),
  listUnits: (base) => units.listUnits(base),
  unitClosure: (base) => units.unitClosure(base, 'M6.E23'),
  checkUnits: (base) => units.checkUnits(base),
  caseTwins: () => units.caseTwins(['a', 'A']),
  // Builds the closes `confirmCloses` writes, under ITS lock; writes nothing itself (t4.2).
  planUnitConfirms: (base) => units.planUnitConfirms({ baseDir: base, key: 'SIG' }, [{ id: 'M6.E21', proof: SHA }], { at: AT, by, openItems: () => [] }),
};

const WRITERS = {
  openUnit: { run: (base) => units.openUnit(base, 'M6.E30', { title: 'n', by }) },
  requestUnitClose: { run: (base) => units.requestUnitClose(base, 'M6.E20', { proof: SHA, by }) },
  confirmUnitClose: { run: (base) => units.confirmUnitClose(base, 'M6.E21', { proof: SHA, by }) },
  // Two real events in one write: `reopened`, then a new `close_requested` (t5.0a).
  rerequestUnitClose: { run: (base) => units.rerequestUnitClose(base, 'M6.E21', { proof: 'fedcba9', by }), appended: 2 },
  closeUnit: { run: (base) => units.closeUnit(base, 'M6.E20', { reason: 'dropped', words: 'moved', by }) },
  reopenUnit: { run: (base) => units.reopenUnit(base, 'M6.E22', { reason: 'back', by }) },
  holdUnit: { run: (base) => units.holdUnit(base, 'M6.E22', { reason: 'keep', by }) },
  releaseUnit: { run: (base) => units.releaseUnit(base, 'M6.E23', { by }) },
  editUnit: { run: (base) => units.editUnit(base, 'M6.E20', { changes: { title: 'edited' }, by }) },
  // New records only, each with its one first event (t7.1): a unit recorded as already over.
  importUnit: { run: (base) => units.importUnit(base, { id: 'M5.E1', close: { reason: 'legacy', at: AT, by } }) },
  // Many new records in one write; one starts closed, one never ran, one is open.
  importUnits: {
    run: (base) => units.importUnits(base, [
      { id: 'M5.E2', close: { reason: 'legacy', at: AT, by } },
      { id: 'M5.E3', close: { reason: 'dropped', words: 'moved', at: AT, by } },
      { id: 'M6.E31', opened: { at: AT, by } },
    ]),
  },
};

const EXEMPT = {
  // name: 'reason, reviewed by …'
};

// Exports that take the lock and change the store, but write NO record
// (M6.E16 t4.0): each is run and must change no record file, and only the
// paths listed. Not WRITERS — a writer must append an event to a record.
const SETUP = {
  // Turns unit records on: creates `units/` and its `.keep` (D-M6E16-16).
  ensureUnitsDir: { run: (base) => units.ensureUnitsDir(base), mayChange: [`${UNITS}/.keep`] },
};

let base;
beforeEach(async () => {
  base = await makeStore();
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('unit-records.js — every export is classified (AC2.3)', () => {
  it('no export is missing from the tables, and none is listed twice or stale', () => {
    expect(classify(units, { READERS, WRITERS, EXEMPT, SETUP })).toEqual([]);
  });

  it('every lock-taking export is a writer or exempt, and every writer takes the lock', () => {
    const { lockTaking } = lockNesting(SOURCE);
    const exported = lockTaking.filter((n) => n in units);
    for (const name of exported) {
      expect(name in WRITERS || name in EXEMPT || name in SETUP, `${name} takes the lock but is classified as a reader`).toBe(true);
    }
    expect(exported.sort()).toEqual([...Object.keys(WRITERS), ...Object.keys(SETUP)].sort());
  });

  it('an export added and not classified fails', () => {
    const grown = { ...units, renameUnit: () => {} };
    expect(classify(grown, { READERS, WRITERS, EXEMPT, SETUP })).toEqual([expect.stringMatching(/^renameUnit: .*not classified/)]);
  });
});

describe('unit-records.js — readers change nothing', () => {
  it('each reader leaves every file under the project byte-identical', async () => {
    expect(await checkReaders(base, READERS)).toEqual([]);
  });
});

describe('unit-records.js — every writer appends exactly one event to the one record it changes (AC2.1)', () => {
  for (const [name, spec] of Object.entries(WRITERS)) {
    it(name, async () => {
      expect(await checkWriter(base, name, spec)).toEqual([]);
    });
  }
});

describe('unit-records.js — a setup export writes no record, and only what it declares', () => {
  for (const [name, spec] of Object.entries(SETUP)) {
    it(name, async () => {
      const before = snapshotTree(base);
      await spec.run(base);
      const after = snapshotTree(base);
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
      expect(changed.filter((k) => k.endsWith('.json'))).toEqual([]);
      expect(changed).toEqual([...spec.mayChange].sort());
    });
  }
});

describe('unit-records.js — one lock, taken once per writer', () => {
  it('the lock scan passes with nothing excused', () => {
    expect(lockNesting(SOURCE).violations).toEqual([]);
  });

  it('the lock is the store\'s one lock, through the shared helper, in one place — not a second lock', () => {
    expect(SOURCE.match(/(?<![\w$.])withWorkLock\(/g)).toHaveLength(1);
    expect(SOURCE).not.toMatch(/acquireLock/);
    expect(SOURCE).not.toMatch(/file-lock\.js/);
  });

  it('parses the real file: a writer made to call another writer is caught', () => {
    const injected = SOURCE.replace(/export async function holdUnit\(([^)]*)\) \{/, (m) => `${m}\n  await releaseUnit(baseDir, id);`);
    expect(injected).not.toBe(SOURCE);
    expect(lockNesting(injected).violations).toEqual([expect.stringMatching(/^holdUnit .*releaseUnit/)]);
  });
});

// ── The helper judges unit records: deliberately bad unit writers ───────────

describe('the inventory catches a bad unit writer', () => {
  const rewrite = async (b, id, f) => {
    const r = JSON.parse(await readFile(join(b, at(id)), 'utf-8'));
    await writeFile(join(b, at(id)), UNIT_KIND.serializeRecord(f(r)));
  };

  it('a writer that changes a unit record without an event', async () => {
    const run = (b) => rewrite(b, 'M6.E20', (r) => ({ ...r, title: 'changed' }));
    expect(await checkWriter(base, 'noEvent', { run })).toEqual([expect.stringMatching(/noEvent.*M6\.E20\.json.*0 events/)]);
  });

  it('a writer that appends two events', async () => {
    const run = (b) => rewrite(b, 'M6.E20', (r) => ({ ...r, events: [...r.events, E.held, E.released] }));
    expect(await checkWriter(base, 'twoEvents', { run })).toEqual([expect.stringMatching(/twoEvents.*M6\.E20\.json.*2 events/)]);
  });

  it('a writer that rewrites history instead of appending', async () => {
    const run = (b) => rewrite(b, 'M6.E23', (r) => ({ ...r, events: [r.events[0], E.held, E.released, E.closing, E.shipped] }));
    expect(await checkWriter(base, 'rewrite', { run })).toEqual([expect.stringMatching(/rewrite.*M6\.E23\.json.*not a prefix/)]);
  });

  it('a writer that moves or deletes a unit record (AC1.1: a record never moves)', async () => {
    const move = (b) => rename(join(b, at('M6.E22')), join(b, '.planning/work/units/M6.E22.json.bak'));
    expect(await checkWriter(base, 'mover', { run: move })).toEqual(
      expect.arrayContaining([expect.stringMatching(/mover.*M6\.E22\.json.*removed/)]),
    );
    const base2 = await makeStore();
    try {
      const del = (b) => unlink(join(b, at('M6.E20')));
      expect(await checkWriter(base2, 'deleter', { run: del })).toEqual([expect.stringMatching(/deleter.*M6\.E20\.json.*removed/)]);
    } finally {
      await rm(base2, { recursive: true, force: true });
    }
  });

  it('a writer that creates a unit record under another name, or with two events', async () => {
    const off = (b) => put(b, at('M6.E31'), UNIT_KIND.serializeRecord(rec('M6.E32', [E.opened])));
    expect(await checkWriter(base, 'offPath', { run: off })).toEqual([expect.stringMatching(/offPath.*units\/M6\.E31\.json.*recordPath/)]);
    const base2 = await makeStore();
    try {
      const two = (b) => put(b, at('M6.E33'), UNIT_KIND.serializeRecord(rec('M6.E33', [E.opened, E.held])));
      expect(await checkWriter(base2, 'twoNew', { run: two })).toEqual([expect.stringMatching(/twoNew.*M6\.E33\.json.*2 events/)]);
    } finally {
      await rm(base2, { recursive: true, force: true });
    }
  });

  it('a writer that changes no unit record (its scenario exercises nothing)', async () => {
    expect(await checkWriter(base, 'idle', { run: async () => {} })).toEqual([expect.stringMatching(/idle.*changed no record/)]);
  });

  it('a well-behaved unit writer passes, and an item record is still judged beside it', async () => {
    const good = (b) => rewrite(b, 'M6.E20', (r) => ({ ...r, events: [...r.events, E.held] }));
    expect(await checkWriter(base, 'good', { run: good })).toEqual([]);
    const both = async (b) => {
      await rewrite(b, 'M6.E21', (r) => ({ ...r, events: [...r.events, E.held] }));
      const p = join(b, '.planning/work/items/00/SIG-1.json');
      const item = JSON.parse(await readFile(p, 'utf-8'));
      await writeFile(p, `${JSON.stringify({ ...item, title: 'quietly changed' }, null, 2)}\n`);
    };
    expect(await checkWriter(base, 'both', { run: both })).toEqual([expect.stringMatching(/both.*items\/00\/SIG-1\.json.*0 events/)]);
  });
});
