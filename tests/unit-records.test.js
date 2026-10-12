// M6.E16.S2.t2.3 and t2.4 — the unit-record library and the unit-ID rule.
// See .planning/M6.E16-VALIDATION.md rows AC1.1, AC1.3, AC1.5 (the check's
// findings; the sweep joins them in a later task), AC2.1, AC4.5, AC5.1, and the
// NFR rows "input" and "failure".
//
// Every store here is built in a temp folder. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as units from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { acquireLock } from '../plugin/tools/lib/file-lock.js';
import { WORK_LOCK_REL } from '../plugin/tools/lib/work-store.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11T10:00:00.000Z';
const SHA = '0123abc';
const OTHER_SHA = 'fedcba9';
const by = 'claude';
const UNITS = '.planning/work/units';

const E = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: SHA },
  shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA },
  dropped: { type: 'closed', at: AT, by, reason: 'dropped', words: 'the work moved elsewhere' },
  legacy: { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'legacy' },
  held: { type: 'held', at: AT, by, reason: 'still read daily' },
};
const rec = (id, events, over = {}) => ({ id, events, ...over });

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const plant = (dir, record) => put(dir, `${UNITS}/${record.id}.json`, UNIT_KIND.serializeRecord(record));
const bytes = (dir, id) => readFile(join(dir, `${UNITS}/${id}.json`), 'utf-8');
const onDisk = async (dir, id) => JSON.parse(await bytes(dir, id));

// A v2 store (key SIG) with one unit in each state.
async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), 'sig-units-'));
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await plant(dir, rec('M6.E20', [E.opened], { title: 'An open one' }));
  await plant(dir, rec('M6.E21', [E.opened, E.closing]));
  await plant(dir, rec('M6.E22', [E.opened, E.closing, E.shipped]));
  await plant(dir, rec('M6.E23', [E.opened, E.closing, E.shipped, E.held]));
  await plant(dir, rec('phase-11', [E.opened, E.held]));
  await plant(dir, rec('GATE-A', [E.legacy], { legacy_row: ['GATE-A', 'done'] }));
  return dir;
}

let base;
const extra = [];
async function tmp(prefix) {
  const d = await mkdtemp(join(tmpdir(), prefix));
  extra.push(d);
  return d;
}
beforeEach(async () => {
  base = await makeStore();
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
  for (const d of extra.splice(0)) await rm(d, { recursive: true, force: true });
});

// A refused call: rejects (or throws) with `code`, and the project is byte-identical after.
async function refused(run, code, message) {
  const before = snapshotTree(base);
  let caught;
  try {
    await run();
  } catch (err) {
    caught = err;
  }
  expect(caught, 'the call was not refused').toBeDefined();
  expect(caught).toMatchObject({ code });
  if (message) expect(caught.message).toMatch(message);
  expect(snapshotTree(base)).toEqual(before);
  return caught;
}

// ── Paths and reads ─────────────────────────────────────────────────────────

describe('unitPath / hasUnits (AC1.1)', () => {
  it('a unit record lives at work/units/<ID>.json, a function of the ID alone', () => {
    expect(units.UNITS_REL).toBe(UNITS);
    expect(units.unitPath(base, 'M6.E20')).toBe(`${UNITS}/M6.E20.json`);
    expect(units.unitPath(base, 'M4.5.E11')).toBe(`${UNITS}/M4.5.E11.json`);
    expect(units.unitPath(base, 'not-there-yet')).toBe(`${UNITS}/not-there-yet.json`);
  });

  it('no path is built from an ID that fails the rule', () => {
    for (const id of ['..', 'a/b', '../x', 'PLAN', 'SIG-5', 'm6.e20', undefined, 7]) {
      expect(() => units.unitPath(base, id), String(id)).toThrow(expect.objectContaining({ name: 'WorkStoreError' }));
    }
  });

  // D-M6E16-16 (t4.0, AC1.6): the folder is the switch, not a record in it.
  it('hasUnits: true when the units folder exists, even empty; false with no folder, or no store at all', async () => {
    expect(units.hasUnits(base)).toBe(true);
    const empty = await tmp('sig-units-empty-');
    await put(empty, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    expect(units.hasUnits(empty)).toBe(false);
    expect(units.hasUnitsSafe(empty)).toEqual({ has: false, problem: null });
    await mkdir(join(empty, UNITS), { recursive: true });
    expect(units.hasUnits(empty)).toBe(true);
    await put(empty, `${UNITS}/.keep`, '');
    expect(units.hasUnits(empty)).toBe(true);
    expect(units.hasUnitsSafe(empty)).toEqual({ has: true, problem: null });
    expect(units.listUnits(empty)).toEqual({ units: [], broken: [] });
    const bare = await tmp('sig-units-bare-');
    expect(units.hasUnits(bare)).toBe(false);
    expect(existsSync(join(bare, '.planning'))).toBe(false);
  });

  it('hasUnitsSafe gives hasUnits\' answer with no problem on a sound layout, and never throws (t2.5)', async () => {
    expect(units.hasUnitsSafe(base)).toEqual({ has: true, problem: null });
    const bare = await tmp('sig-units-bare-');
    expect(units.hasUnitsSafe(bare)).toEqual({ has: false, problem: null });
    const broken = await tmp('sig-units-broken-');
    await put(broken, `${UNITS}/M6.E40.json`, '{');
    expect(units.hasUnitsSafe(broken)).toEqual({ has: true, problem: null });
    // units is a file, not a folder: hasUnits throws, the safe form answers.
    const file = await tmp('sig-units-file-');
    await put(file, UNITS, 'not a folder\n');
    expect(() => units.hasUnits(file)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    expect(units.hasUnitsSafe(file)).toEqual({ has: false, problem: expect.stringMatching(/is not a folder/) });
    for (const bad of [undefined, null, 7, {}]) {
      expect(units.hasUnitsSafe(bad)).toEqual({ has: false, problem: expect.any(String) });
    }
  });

  it('hasUnits is true for a folder whose only record is broken: the project has unit records, and one is wrong', async () => {
    const dir = await tmp('sig-units-broken-');
    await put(dir, `${UNITS}/M1.E1.json`, '{');
    expect(units.hasUnits(dir)).toBe(true);
  });
});

describe('getUnit / listUnits', () => {
  it('getUnit returns the record with its folded state', () => {
    expect(units.getUnit(base, 'M6.E20')).toEqual({
      id: 'M6.E20',
      path: `${UNITS}/M6.E20.json`,
      record: rec('M6.E20', [E.opened], { title: 'An open one' }),
      status: 'open',
      held: false,
      hold_reason: null,
      close: null,
      closing_proof: null,
    });
    expect(units.getUnit(base, 'M6.E21')).toMatchObject({ status: 'closing', closing_proof: SHA });
    expect(units.getUnit(base, 'M6.E23')).toMatchObject({ status: 'closed', held: true, hold_reason: 'still read daily', close: { reason: 'shipped', proof: SHA } });
    expect(units.getUnit(base, 'GATE-A')).toMatchObject({ status: 'closed', close: { reason: 'legacy' } });
  });

  it('getUnit: no record → NOT_FOUND; a broken record → SCHEMA; not an ID → SCHEMA', async () => {
    await put(base, `${UNITS}/M6.E30.json`, '{');
    expect(() => units.getUnit(base, 'M6.E99')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => units.getUnit(base, 'M6.E30')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    expect(() => units.getUnit(base, 'a/b')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });

  it('getUnit matches the file name exactly: another case is another ID, even on a disk that ignores case', () => {
    expect(() => units.getUnit(base, 'm6.e20')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => units.getUnit(base, 'gate-a')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('listUnits returns every unit with its folded state, by ID', () => {
    const { units: list, broken } = units.listUnits(base);
    expect(broken).toEqual([]);
    expect(list.map((u) => [u.id, u.status, u.held])).toEqual([
      ['GATE-A', 'closed', false],
      ['M6.E20', 'open', false],
      ['M6.E21', 'closing', false],
      ['M6.E22', 'closed', false],
      ['M6.E23', 'closed', true],
      ['phase-11', 'open', true],
    ]);
    expect(list[1].path).toBe(`${UNITS}/M6.E20.json`);
  });

  it('listUnits on a project with no units folder, or no store, is empty and creates nothing', async () => {
    const bare = await tmp('sig-units-bare-');
    expect(units.listUnits(bare)).toEqual({ units: [], broken: [] });
    expect(readdirSync(bare)).toEqual([]);
  });

  it('one broken record never stops the others: each is reported by ID and path, with a code', async () => {
    await put(base, `${UNITS}/M6.E30.json`, '{');
    await put(base, `${UNITS}/M6.E31.json`, JSON.stringify({ id: 'M6.E31', status: 'open', events: [E.opened] }));
    await put(base, `${UNITS}/M6.E32.json`, UNIT_KIND.serializeRecord(rec('M6.E33', [E.opened])));
    await put(base, `${UNITS}/M6.E34.json`, UNIT_KIND.serializeRecord(rec('M6.E34', [E.opened, E.shipped])));
    await put(base, `${UNITS}/bad name.json`, UNIT_KIND.serializeRecord(rec('M6.E35', [E.opened])));
    await put(base, `${UNITS}/notes.md`, 'a file beside the records is not a record\n');
    const { units: list, broken } = units.listUnits(base);
    expect(list).toHaveLength(6);
    expect(broken.map((b) => [b.id, b.path, b.code])).toEqual([
      ['M6.E30', `${UNITS}/M6.E30.json`, 'invalid'],
      ['M6.E31', `${UNITS}/M6.E31.json`, 'invalid'],
      ['M6.E32', `${UNITS}/M6.E32.json`, 'path'],
      ['M6.E34', `${UNITS}/M6.E34.json`, 'events'],
      [null, `${UNITS}/bad name.json`, 'path'],
    ]);
    expect(broken[1].error).toMatch(/status is not a known field/);
    expect(broken[2].error).toMatch(/file name says M6\.E32 but the record id is M6\.E33/);
  });
});

describe('unitClosure', () => {
  it('closed, open, held, no-record', () => {
    expect(units.unitClosure(base, 'M6.E22')).toBe('closed');
    expect(units.unitClosure(base, 'GATE-A')).toBe('closed');
    expect(units.unitClosure(base, 'M6.E20')).toBe('open');
    expect(units.unitClosure(base, 'M6.E99')).toBe('no-record');
  });

  it('a unit whose close is requested but not confirmed is open', () => {
    expect(units.unitClosure(base, 'M6.E21')).toBe('open');
  });

  it('held means closed AND held; an open unit with a hold is open', () => {
    expect(units.unitClosure(base, 'M6.E23')).toBe('held');
    expect(units.unitClosure(base, 'phase-11')).toBe('open');
  });

  it('a name that cannot be a unit ID has no record; it never reaches a path', () => {
    for (const id of ['..', 'a/b', '../../etc/passwd', '', 'x'.repeat(10_000), 'M6.E20\n', undefined]) {
      expect(units.unitClosure(base, id), JSON.stringify(String(id).slice(0, 20))).toBe('no-record');
    }
  });

  it('a broken record is an error, not an answer', async () => {
    await put(base, `${UNITS}/M6.E30.json`, '{');
    expect(() => units.unitClosure(base, 'M6.E30')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });
});

// ── The ID rule (t2.4, AC1.3, NFR input) ────────────────────────────────────

describe('assertUnitId (AC1.3)', () => {
  for (const id of ['M6.E16', 'M4.5.E11', 'phase-11', 'v0.1.6', 'GATE-A', 'PHASE10-S4', 'SC1', 'SLICE-SSO', 'a'.repeat(100)]) {
    it(`accepts ${id.length > 20 ? `a ${id.length}-character name` : id}`, () => {
      expect(() => units.assertUnitId(base, id, { storeKey: 'SIG' })).not.toThrow();
    });
  }

  it('accepts the exact ID of a unit that already exists (only a different case collides)', () => {
    expect(() => units.assertUnitId(base, 'M6.E20')).not.toThrow();
    expect(() => units.assertUnitId(base, 'phase-11')).not.toThrow();
  });

  const SHAPE = {
    'two dots alone': '..',
    'two dots inside': 'a..b',
    'a separator': 'a/b',
    'a backslash': 'a\\b',
    'a parent path': '../M6.E20',
    'an absolute path': '/tmp/x',
    'a leading dot': '.hidden',
    '101 characters': 'a'.repeat(101),
    '10 kB': 'a'.repeat(10_240),
    'a newline': 'M6.E16\nM6.E17',
    'a trailing newline': 'M6.E16\n',
    'a zero-width space': 'M6.E​16',
    'a right-to-left override': 'M6.E‮16',
    'a NUL': 'M6.E16\0',
    'a space': 'phase 11',
    'the empty string': '',
  };
  for (const [name, id] of Object.entries(SHAPE)) {
    it(`refuses ${name}: SCHEMA, and the message stays short and printable`, () => {
      let caught;
      try {
        units.assertUnitId(base, id, { storeKey: 'SIG' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ name: 'WorkStoreError', code: 'SCHEMA' });
      expect(caught.message.length).toBeLessThan(400);
      // A RegExp from a string: a line separator inside a regex literal breaks the parse.
      expect(caught.message).not.toMatch(new RegExp('[\\u0000-\\u001f\\u007f-\\uffff]'));
    });
  }

  it('refuses a value that is not a string', () => {
    for (const id of [undefined, null, 7, {}, ['M6.E16']]) {
      expect(() => units.assertUnitId(base, id, { storeKey: 'SIG' })).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    }
  });

  it('refuses a case twin of a unit on disk, and names the one that exists', () => {
    for (const [twin, existing] of [['m6.e20', 'M6.E20'], ['M6.e20', 'M6.E20'], ['PHASE-11', 'phase-11'], ['Gate-A', 'GATE-A']]) {
      expect(() => units.assertUnitId(base, twin, { storeKey: 'SIG' })).toThrow(
        expect.objectContaining({ code: 'CONFLICT', message: expect.stringContaining(existing) }),
      );
    }
  });

  it('refuses an ID shaped like one of this project\'s item IDs, in any case', () => {
    for (const id of ['SIG-5', 'SIG-1006', 'sig-5', 'SIG-0']) {
      expect(() => units.assertUnitId(base, id, { storeKey: 'SIG' }), id).toThrow(
        expect.objectContaining({ code: 'SCHEMA', message: expect.stringMatching(/item ID/) }),
      );
    }
  });

  it('the store key is read from the project when it is not passed', () => {
    expect(() => units.assertUnitId(base, 'SIG-5')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    expect(() => units.assertUnitId(base, 'ABC-5')).not.toThrow();
  });

  it('another key\'s shape, and a name that only starts like an item ID, are fine', () => {
    for (const id of ['ABC-5', 'SIG-5a', 'SIG-A', 'SIGX-5', 'SIG-5-1', 'phase-11', 'SIG']) {
      expect(() => units.assertUnitId(base, id, { storeKey: 'SIG' }), id).not.toThrow();
    }
  });

  it('refuses a phase name, in any case', () => {
    for (const id of ['CALIBRATE', 'DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP', 'plan', 'Ship']) {
      expect(() => units.assertUnitId(base, id, { storeKey: 'SIG' }), id).toThrow(
        expect.objectContaining({ code: 'SCHEMA', message: expect.stringMatching(/phase name/) }),
      );
    }
    for (const id of ['PLAN-2', 'SHIPPING', 'PHASE7']) {
      expect(() => units.assertUnitId(base, id, { storeKey: 'SIG' }), id).not.toThrow();
    }
  });
});

// ── Writers (t2.3, AC2.1, AC4.5, AC5.1, NFR failure) ────────────────────────

describe('openUnit', () => {
  it('creates the record at its path with one opened event, and returns the entry', async () => {
    const out = await units.openUnit(base, 'M6.E40', { title: 'A new one', summary: 'What it is for.', by, at: AT });
    expect(out).toMatchObject({ id: 'M6.E40', path: `${UNITS}/M6.E40.json`, status: 'open', held: false });
    expect(await onDisk(base, 'M6.E40')).toEqual({ id: 'M6.E40', title: 'A new one', summary: 'What it is for.', events: [E.opened] });
    expect(await bytes(base, 'M6.E40')).toBe(UNIT_KIND.serializeRecord(out.record));
  });

  // D-M6E16-16 (t4.0): no ordinary writer turns unit records on. Only
  // ensureUnitsDir (and the migration) creates the folder.
  it('refuses on a store with no units folder, and creates nothing', async () => {
    const dir = await tmp('sig-units-first-');
    await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    const before = snapshotTree(dir);
    const err = await units.openUnit(dir, 'phase-1', { by, at: AT }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFIG' });
    expect(err.message).toMatch(/no unit records/);
    expect(err.message).toMatch(/nothing was written/);
    expect(snapshotTree(dir)).toEqual(before);
    expect(existsSync(join(dir, UNITS))).toBe(false);
    expect(units.hasUnits(dir)).toBe(false);
  });

  it('writes the first record into an empty units folder, and touches nothing else', async () => {
    const dir = await tmp('sig-units-first-');
    await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await units.ensureUnitsDir(dir);
    const before = snapshotTree(dir);
    // The views are regenerated after a unit write since S5 (t5.0b,
    // tests/unit-views-regenerate.test.js); switched off here, so this still
    // pins what the writer itself writes.
    await units.openUnit(dir, 'phase-1', { by, at: AT }, { regenerate: async () => {} });
    const after = snapshotTree(dir);
    expect([...after.keys()].filter((k) => !before.has(k))).toEqual([`${UNITS}/phase-1.json`]);
    expect(after.get('.planning/work/WORK.md')).toBe(before.get('.planning/work/WORK.md'));
    expect(after.get(`${UNITS}/.keep`)).toBe('');
  });

  it('`at` defaults to now', async () => {
    const out = await units.openUnit(base, 'M6.E41', { by });
    expect(out.record.events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('refuses a unit that already has a record, open or closed', async () => {
    await refused(() => units.openUnit(base, 'M6.E20', { by }), 'CONFLICT', /already exists/);
    await refused(() => units.openUnit(base, 'M6.E22', { by }), 'CONFLICT', /already exists/);
  });

  it('refuses every ID the rule refuses, before anything is written', async () => {
    await refused(() => units.openUnit(base, '../escape', { by }), 'SCHEMA');
    await refused(() => units.openUnit(base, 'a'.repeat(10_240), { by }), 'SCHEMA');
    await refused(() => units.openUnit(base, 'M6.E50\n', { by }), 'SCHEMA');
    await refused(() => units.openUnit(base, 'M6.E​50', { by }), 'SCHEMA');
    await refused(() => units.openUnit(base, 'm6.e20', { by }), 'CONFLICT');
    await refused(() => units.openUnit(base, 'SIG-5', { by }), 'SCHEMA');
    await refused(() => units.openUnit(base, 'PLAN', { by }), 'SCHEMA');
    expect(existsSync(join(base, '.planning/work/escape.json'))).toBe(false);
  });

  it('refuses a record the schema refuses: no `by`; a two-line title is stored as one line (v2.3)', async () => {
    await refused(() => units.openUnit(base, 'M6.E42', {}), 'SCHEMA');
    await units.openUnit(base, 'M6.E42', { by, title: 'two\nlines' });
    expect((await onDisk(base, 'M6.E42')).title).toBe('two lines');
    expect(UNIT_KIND.validateRecord({ id: 'M6.E43', title: 'two\nlines', events: [E.opened] })).not.toEqual([]);
  });
});

describe('requestUnitClose / confirmUnitClose (AC2.1)', () => {
  it('a request appends close_requested and the unit reads closing', async () => {
    const out = await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, by, at: AT });
    expect(out).toMatchObject({ status: 'closing', closing_proof: OTHER_SHA });
    expect((await onDisk(base, 'M6.E20')).events).toEqual([E.opened, { type: 'close_requested', at: AT, by, proof: OTHER_SHA }]);
  });

  it('a request is refused: a proof that is not a bare commit hash; a unit that is not open; no record', async () => {
    for (const proof of [undefined, 'main', '--all', 'ABCDEF1', '0123ab', 'HEAD']) {
      await refused(() => units.requestUnitClose(base, 'M6.E20', { proof, by }), 'SCHEMA', /commit hash/);
    }
    await refused(() => units.requestUnitClose(base, 'M6.E21', { proof: SHA, by }), 'CONFLICT', /not legal from closing/);
    await refused(() => units.requestUnitClose(base, 'M6.E22', { proof: SHA, by }), 'CONFLICT', /not legal from closed/);
    await refused(() => units.requestUnitClose(base, 'M6.E99', { proof: SHA, by }), 'NOT_FOUND');
  });

  it('a confirm appends the shipped close with the request\'s proof, and what the caller knows of it', async () => {
    const out = await units.confirmUnitClose(base, 'M6.E21', { proof: SHA, pr: '#301', release: 'v0.1.51', by, at: AT });
    expect(out).toMatchObject({ status: 'closed', closing_proof: null, close: { reason: 'shipped', proof: SHA, pr: '#301', release: 'v0.1.51' } });
    expect((await onDisk(base, 'M6.E21')).events.at(-1)).toEqual({ type: 'closed', at: AT, by, reason: 'shipped', proof: SHA, pr: '#301', release: 'v0.1.51' });
    expect((await onDisk(base, 'M6.E21')).events).toHaveLength(3);
  });

  // t4.0: /sig:ship knows the pull request and the release when it asks; the
  // step that confirms, after the merge, does not.
  it('a request carries pr and release, in a fixed key order', async () => {
    await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, release: 'v0.1.51', pr: '#301', by, at: AT });
    const event = (await onDisk(base, 'M6.E20')).events.at(-1);
    expect(event).toEqual({ type: 'close_requested', at: AT, by, proof: OTHER_SHA, pr: '#301', release: 'v0.1.51' });
    expect(Object.keys(event)).toEqual(['type', 'at', 'by', 'proof', 'pr', 'release']);
    expect(units.checkUnits(base)).toEqual([]);
  });

  it('a confirm copies the request\'s pr and release into the closed event', async () => {
    await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, pr: '#301', release: 'v0.1.51', by, at: AT });
    const out = await units.confirmUnitClose(base, 'M6.E20', { proof: OTHER_SHA, by: 'confirmCloses', at: AT });
    expect(out.close).toEqual({ reason: 'shipped', at: AT, by: 'confirmCloses', proof: OTHER_SHA, pr: '#301', release: 'v0.1.51' });
    expect((await onDisk(base, 'M6.E20')).events.at(-1))
      .toEqual({ type: 'closed', at: AT, by: 'confirmCloses', reason: 'shipped', proof: OTHER_SHA, pr: '#301', release: 'v0.1.51' });
  });

  it('a confirm\'s own pr and release win over the request\'s; a request with neither leaves the close without them', async () => {
    await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, pr: '#301', release: 'v0.1.51', by, at: AT });
    const out = await units.confirmUnitClose(base, 'M6.E20', { proof: OTHER_SHA, pr: '#302', by, at: AT });
    expect(out.close).toMatchObject({ pr: '#302', release: 'v0.1.51' });
    const plain = await units.confirmUnitClose(base, 'M6.E21', { proof: SHA, by, at: AT });
    expect(Object.keys(plain.close).sort()).toEqual(['at', 'by', 'proof', 'reason']);
  });

  it('a request\'s pr and release go through the sensitive-data gate: nothing written without the acknowledgement', async () => {
    const pending = { aborted: 'sensitive-data-pending', sensitiveHits: expect.any(Array) };
    const before = snapshotTree(base);
    expect(await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, pr: AWS, by })).toEqual(pending);
    expect(await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, release: AWS, by })).toEqual(pending);
    expect(snapshotTree(base)).toEqual(before);
    const out = await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, pr: AWS, by }, { acknowledgeSensitive: true });
    expect(out).toMatchObject({ status: 'closing' });
  });

  // t4.1: the caller's own condition for the close, run under the store's lock.
  it('a request\'s gate runs under the lock before the write; when it throws nothing is written', async () => {
    let held = null;
    const gate = async (handle) => {
      held = await acquireLock(join(handle.baseDir, WORK_LOCK_REL), { label: 'test' }).then((l) => l.released().then(() => false), () => true);
    };
    expect(await units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, by }, { gate })).toMatchObject({ status: 'closing' });
    expect(held).toBe(true);
    const err = Object.assign(new Error('the Epic is not ready'), { code: 'OPEN_ITEMS' });
    await refused(() => units.requestUnitClose(base, 'phase-11', { proof: OTHER_SHA, by }, { gate: () => { throw err; } }), 'OPEN_ITEMS', /not ready/);
  });

  it('a request refuses a blank or non-text pr or release: SCHEMA, nothing written', async () => {
    await refused(() => units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, pr: '  ', by }), 'SCHEMA');
    await refused(() => units.requestUnitClose(base, 'M6.E20', { proof: OTHER_SHA, release: 301, by }), 'SCHEMA');
  });

  it('a confirm is refused when the proof does not match the request, or none is given', async () => {
    await refused(() => units.confirmUnitClose(base, 'M6.E21', { proof: OTHER_SHA, by }), 'CONFLICT', new RegExp(`${SHA}.*${OTHER_SHA}|${OTHER_SHA}.*${SHA}`));
    await refused(() => units.confirmUnitClose(base, 'M6.E21', { by }), 'SCHEMA', /commit hash/);
    await refused(() => units.confirmUnitClose(base, 'M6.E21', { proof: 'main', by }), 'SCHEMA', /commit hash/);
  });

  it('a confirm is refused when no close was requested: open, closed, or no record', async () => {
    await refused(() => units.confirmUnitClose(base, 'M6.E20', { proof: SHA, by }), 'CONFLICT', /no close .*requested/);
    await refused(() => units.confirmUnitClose(base, 'M6.E22', { proof: SHA, by }), 'CONFLICT', /no close .*requested/);
    await refused(() => units.confirmUnitClose(base, 'M6.E99', { proof: SHA, by }), 'NOT_FOUND');
  });
});

describe('closeUnit — dropped and legacy', () => {
  it('dropped, with words, from open', async () => {
    const out = await units.closeUnit(base, 'M6.E20', { reason: 'dropped', words: 'became another Epic', by, at: AT });
    expect(out).toMatchObject({ status: 'closed', close: { reason: 'dropped', words: 'became another Epic' } });
    expect((await onDisk(base, 'M6.E20')).events.at(-1)).toEqual({ type: 'closed', at: AT, by, reason: 'dropped', words: 'became another Epic' });
  });

  it('legacy, with what the old table said, from open and from closing', async () => {
    const out = await units.closeUnit(base, 'M6.E20', { reason: 'legacy', pr: '#211', release: 'v0.1.19', words: 'per the table', by, at: '2026-08-01' });
    expect(out.close).toEqual({ reason: 'legacy', at: '2026-08-01', by, pr: '#211', release: 'v0.1.19', words: 'per the table' });
    expect(await units.closeUnit(base, 'M6.E21', { reason: 'legacy', by, at: AT })).toMatchObject({ status: 'closed', closing_proof: null });
  });

  it('refused: a shipped close (it goes through a request), an unknown reason, dropped without words, a closed unit, no record', async () => {
    await refused(() => units.closeUnit(base, 'M6.E20', { reason: 'shipped', proof: SHA, by }), 'SCHEMA', /requestUnitClose/);
    await refused(() => units.closeUnit(base, 'M6.E20', { reason: 'wontdo', words: 'x', by }), 'SCHEMA', /dropped.*legacy|legacy.*dropped/);
    await refused(() => units.closeUnit(base, 'M6.E20', { by }), 'SCHEMA');
    await refused(() => units.closeUnit(base, 'M6.E20', { reason: 'dropped', by }), 'SCHEMA', /words/);
    await refused(() => units.closeUnit(base, 'M6.E20', { reason: 'dropped', words: '  ', by }), 'SCHEMA', /words/);
    await refused(() => units.closeUnit(base, 'M6.E22', { reason: 'legacy', by }), 'CONFLICT', /not legal from closed/);
    await refused(() => units.closeUnit(base, 'M6.E99', { reason: 'legacy', by }), 'NOT_FOUND');
  });
});

describe('reopenUnit (AC4.5)', () => {
  it('from closed, with a reason', async () => {
    const out = await units.reopenUnit(base, 'M6.E22', { reason: 'a regression', by: 'brett', at: AT });
    expect(out).toMatchObject({ status: 'open', close: null });
    expect((await onDisk(base, 'M6.E22')).events.at(-1)).toEqual({ type: 'reopened', at: AT, by: 'brett', reason: 'a regression' });
  });

  it('from closing, with a reason: the request is gone', async () => {
    expect(await units.reopenUnit(base, 'M6.E21', { reason: 'not ready', by })).toMatchObject({ status: 'open', closing_proof: null });
  });

  it('a held closed unit reopens and stays held', async () => {
    expect(await units.reopenUnit(base, 'M6.E23', { reason: 'back', by })).toMatchObject({ status: 'open', held: true });
  });

  it('refused: no reason, a blank reason, an open unit, no record', async () => {
    await refused(() => units.reopenUnit(base, 'M6.E22', { by }), 'SCHEMA', /reason/);
    await refused(() => units.reopenUnit(base, 'M6.E22', { reason: '  ', by }), 'SCHEMA', /reason/);
    await refused(() => units.reopenUnit(base, 'M6.E20', { reason: 'x', by }), 'CONFLICT', /not legal from open/);
    await refused(() => units.reopenUnit(base, 'M6.E99', { reason: 'x', by }), 'NOT_FOUND');
  });
});

describe('holdUnit / releaseUnit (AC5.1)', () => {
  it('a hold is one event with a reason; a release is another', async () => {
    const heldNow = await units.holdUnit(base, 'M6.E22', { reason: 'its plan is still cited', by: 'brett', at: AT });
    expect(heldNow).toMatchObject({ status: 'closed', held: true, hold_reason: 'its plan is still cited' });
    expect(units.unitClosure(base, 'M6.E22')).toBe('held');
    const released = await units.releaseUnit(base, 'M6.E22', { by: 'brett', at: AT });
    expect(released).toMatchObject({ status: 'closed', held: false, hold_reason: null });
    expect((await onDisk(base, 'M6.E22')).events.slice(-2)).toEqual([
      { type: 'held', at: AT, by: 'brett', reason: 'its plan is still cited' },
      { type: 'released', at: AT, by: 'brett' },
    ]);
    expect(units.unitClosure(base, 'M6.E22')).toBe('closed');
  });

  it('a hold is legal on an open and on a closing unit too', async () => {
    expect(await units.holdUnit(base, 'M6.E20', { reason: 'r', by })).toMatchObject({ status: 'open', held: true });
    expect(await units.holdUnit(base, 'M6.E21', { reason: 'r', by })).toMatchObject({ status: 'closing', held: true });
  });

  it('refused: a hold with no reason, a hold on a held unit, a release on one that is not held, no record', async () => {
    await refused(() => units.holdUnit(base, 'M6.E22', { by }), 'SCHEMA', /reason/);
    await refused(() => units.holdUnit(base, 'M6.E22', { reason: ' ', by }), 'SCHEMA', /reason/);
    await refused(() => units.holdUnit(base, 'M6.E23', { reason: 'again', by }), 'CONFLICT', /already held/);
    await refused(() => units.releaseUnit(base, 'M6.E22', { by }), 'CONFLICT', /not held/);
    await refused(() => units.holdUnit(base, 'M6.E99', { reason: 'r', by }), 'NOT_FOUND');
    await refused(() => units.releaseUnit(base, 'M6.E99', { by }), 'NOT_FOUND');
  });
});

describe('editUnit', () => {
  it('one edited event carrying {field: {from, to}}; status unchanged; `to: null` removes the field', async () => {
    const out = await units.editUnit(base, 'M6.E20', { changes: { title: 'Renamed', summary: 'Now with a summary.' }, by, at: AT });
    expect(out).toMatchObject({ status: 'open', record: { title: 'Renamed', summary: 'Now with a summary.' } });
    expect((await onDisk(base, 'M6.E20')).events.at(-1)).toEqual({
      type: 'edited', at: AT, by,
      changes: { title: { from: 'An open one', to: 'Renamed' }, summary: { from: null, to: 'Now with a summary.' } },
    });
    const removed = await units.editUnit(base, 'M6.E20', { changes: { summary: null }, by, at: AT });
    expect(Object.hasOwn(removed.record, 'summary')).toBe(false);
    expect(UNIT_KIND.checkEvents(await onDisk(base, 'M6.E20'))).toEqual([]);
  });

  it('refused: no changes, a field that cannot be edited, every field already holding its value, no record', async () => {
    await refused(() => units.editUnit(base, 'M6.E20', { by }), 'SCHEMA', /needs changes/);
    await refused(() => units.editUnit(base, 'M6.E20', { changes: {}, by }), 'SCHEMA', /needs changes/);
    for (const field of ['id', 'status', 'held', 'legacy_row', 'events']) {
      await refused(() => units.editUnit(base, 'M6.E20', { changes: { [field]: 'x' }, by }), 'SCHEMA', /cannot be edited/);
    }
    await refused(() => units.editUnit(base, 'M6.E20', { changes: { title: 'An open one' }, by }), 'SCHEMA', /already holds/);
    await refused(() => units.editUnit(base, 'M6.E99', { changes: { title: 'x' }, by }), 'NOT_FOUND');
  });
});

// ── What every writer shares ────────────────────────────────────────────────

const AWS = `AKIA${'ABCDEFGH'.repeat(2)}`; // shaped like a key; not one
const MUTATIONS = {
  openUnit: (b, o, text = 'A title') => units.openUnit(b, 'M6.E60', { title: text, by, at: AT }, o),
  requestUnitClose: (b, o) => units.requestUnitClose(b, 'M6.E20', { proof: SHA, by, at: AT }, o),
  confirmUnitClose: (b, o, text = '#301') => units.confirmUnitClose(b, 'M6.E21', { proof: SHA, pr: text, by, at: AT }, o),
  closeUnit: (b, o, text = 'moved') => units.closeUnit(b, 'M6.E20', { reason: 'dropped', words: text, by, at: AT }, o),
  reopenUnit: (b, o, text = 'back') => units.reopenUnit(b, 'M6.E22', { reason: text, by, at: AT }, o),
  holdUnit: (b, o, text = 'keep') => units.holdUnit(b, 'M6.E22', { reason: text, by, at: AT }, o),
  releaseUnit: (b, o) => units.releaseUnit(b, 'M6.E23', { by, at: AT }, o),
  editUnit: (b, o, text = 'Renamed') => units.editUnit(b, 'M6.E20', { changes: { title: text }, by, at: AT }, o),
};
// The writers that take free text (their third argument above replaces it).
const TAKES_TEXT = ['openUnit', 'confirmUnitClose', 'closeUnit', 'reopenUnit', 'holdUnit', 'editUnit'];

describe('every unit writer: one lock, the store check, atomic, nothing on a refusal (AC2.1, NFR failure)', () => {
  it('the table is every lock-taking export of the library', () => {
    const writers = Object.keys(units).filter((n) => /^(open|request|confirm|close|reopen|hold|release|edit)Unit/.test(n));
    expect(Object.keys(MUTATIONS).sort()).toEqual(writers.sort());
  });

  for (const [name, run] of Object.entries(MUTATIONS)) {
    it(`${name}: changes exactly one record file and no other file`, async () => {
      const before = snapshotTree(base);
      // Regeneration switched off (t5.0b: a unit write regenerates the views;
      // tests/unit-views-regenerate.test.js covers that).
      const out = await run(base, { regenerate: async () => {} });
      const after = snapshotTree(base);
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
      expect(changed).toEqual([out.path]);
    });

    it(`${name}: a second writer holding the store's one lock gets LOCKED, nothing written`, async () => {
      const lock = await acquireLock(join(base, WORK_LOCK_REL), { label: 'work store' });
      try {
        await refused(() => run(base, {}), 'LOCKED');
      } finally {
        await lock.released();
      }
    });

    it(`${name}: releases the lock, after a write and after a refusal`, async () => {
      await run(base, {});
      expect(existsSync(join(base, WORK_LOCK_REL))).toBe(false);
      await expect(run(base, {})).rejects.toMatchObject({ name: 'WorkStoreError' }); // the same event twice is never legal
      expect(existsSync(join(base, WORK_LOCK_REL))).toBe(false);
    });

    it(`${name}: a write that fails part-way leaves the record as it was (IO)`, async () => {
      const renameFn = async () => {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      };
      await refused(() => run(base, { renameFn }), 'IO', /disk full/);
    });

    it(`${name}: refused on a store that is off, and on a v1 store — no lock file, no units folder`, async () => {
      const off = await tmp('sig-units-off-');
      await mkdir(join(off, '.planning'), { recursive: true });
      await expect(run(off, {})).rejects.toMatchObject({ code: 'CONFIG' });
      expect(readdirSync(join(off, '.planning'))).toEqual([]);
      const v1 = await tmp('sig-units-v1-');
      await put(v1, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
      await expect(run(v1, {})).rejects.toMatchObject({ code: 'CONFIG', version: 1 });
      expect(readdirSync(join(v1, '.planning/work'))).toEqual(['WORK.md']);
    });
  }

  for (const name of TAKES_TEXT) {
    it(`${name}: free text that looks like a secret is not written until acknowledged`, async () => {
      const before = snapshotTree(base);
      const out = await MUTATIONS[name](base, {}, `see ${AWS}`);
      expect(out).toEqual({ aborted: 'sensitive-data-pending', sensitiveHits: [expect.objectContaining({ type: 'aws-key' })] });
      expect(snapshotTree(base)).toEqual(before);
      const ok = await MUTATIONS[name](base, { acknowledgeSensitive: true }, `see ${AWS}`);
      expect(ok.id).toBeDefined();
      expect(snapshotTree(base)).not.toEqual(before);
    });
  }

  it('the other free-text fields go through the same gate: summary, migration_note, legacy_row, release, a legacy close\'s words', async () => {
    const pending = { aborted: 'sensitive-data-pending', sensitiveHits: expect.any(Array) };
    const before = snapshotTree(base);
    expect(await units.openUnit(base, 'M6.E61', { summary: AWS, by })).toEqual(pending);
    expect(await units.openUnit(base, 'M6.E61', { migration_note: AWS, by })).toEqual(pending);
    expect(await units.openUnit(base, 'M6.E61', { legacy_row: ['a', AWS], by })).toEqual(pending);
    expect(await units.confirmUnitClose(base, 'M6.E21', { proof: SHA, release: AWS, by })).toEqual(pending);
    expect(await units.confirmUnitClose(base, 'M6.E21', { proof: SHA, words: AWS, by })).toEqual(pending);
    expect(await units.closeUnit(base, 'M6.E20', { reason: 'legacy', words: AWS, by })).toEqual(pending);
    expect(await units.closeUnit(base, 'M6.E20', { reason: 'legacy', pr: AWS, by })).toEqual(pending);
    expect(await units.editUnit(base, 'M6.E20', { changes: { summary: AWS }, by })).toEqual(pending);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('a commit hash as proof is not treated as a secret: a full SHA is accepted', async () => {
    const full = 'a'.repeat(40);
    expect(await units.requestUnitClose(base, 'M6.E20', { proof: full, by })).toMatchObject({ status: 'closing', closing_proof: full });
    expect(await units.confirmUnitClose(base, 'M6.E20', { proof: full, by })).toMatchObject({ status: 'closed' });
  });

  it('openUnit that fails part-way leaves no record, and the units folder as it was', async () => {
    const dir = await tmp('sig-units-first-');
    await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await units.ensureUnitsDir(dir);
    const before = snapshotTree(dir);
    const renameFn = async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    await expect(units.openUnit(dir, 'M6.E1', { by }, { renameFn })).rejects.toMatchObject({ code: 'IO' });
    expect(snapshotTree(dir)).toEqual(before);
    expect(readdirSync(join(dir, UNITS))).toEqual(['.keep']);
  });

  it('a broken record is never written over: SCHEMA, bytes unchanged', async () => {
    await put(base, `${UNITS}/M6.E30.json`, '{ "id": "M6.E30", "events": [], "status": "open" }\n');
    for (const run of [
      () => units.holdUnit(base, 'M6.E30', { reason: 'r', by }),
      () => units.closeUnit(base, 'M6.E30', { reason: 'legacy', by }),
      () => units.editUnit(base, 'M6.E30', { changes: { title: 't' }, by }),
    ]) await refused(run, 'SCHEMA');
  });
});

// ── ensureUnitsDir (t4.0, AC1.6, D-M6E16-16) ────────────────────────────────

describe('ensureUnitsDir — the folder is the switch', () => {
  const WORK_MD = '---\nkey: SIG\nschema_version: 2\n---\n';

  it('creates units/ with a .keep on a store that has none; hasUnits then answers true; nothing else changes', async () => {
    const dir = await tmp('sig-units-ensure-');
    await put(dir, '.planning/work/WORK.md', WORK_MD);
    const before = snapshotTree(dir);
    expect(units.hasUnits(dir)).toBe(false);
    expect(await units.ensureUnitsDir(dir)).toEqual({ path: UNITS, created: true, keep: true });
    const after = snapshotTree(dir);
    expect([...after.keys()].filter((k) => !before.has(k))).toEqual([`${UNITS}/.keep`]);
    expect(after.get(`${UNITS}/.keep`)).toBe('');
    expect(after.get('.planning/work/WORK.md')).toBe(before.get('.planning/work/WORK.md'));
    expect(units.hasUnits(dir)).toBe(true);
    expect(units.hasUnitsSafe(dir)).toEqual({ has: true, problem: null });
  });

  it('idempotent: a second call changes nothing', async () => {
    const dir = await tmp('sig-units-ensure-');
    await put(dir, '.planning/work/WORK.md', WORK_MD);
    await units.ensureUnitsDir(dir);
    const before = snapshotTree(dir);
    expect(await units.ensureUnitsDir(dir)).toEqual({ path: UNITS, created: false, keep: false });
    expect(snapshotTree(dir)).toEqual(before);
  });

  it('a folder that already holds records keeps them byte-identical and gains only .keep', async () => {
    const before = snapshotTree(base);
    expect(await units.ensureUnitsDir(base)).toEqual({ path: UNITS, created: false, keep: true });
    const after = snapshotTree(base);
    expect([...after.keys()].filter((k) => before.get(k) !== after.get(k))).toEqual([`${UNITS}/.keep`]);
  });

  it('checkUnits does not flag .keep, and an empty folder has no findings', async () => {
    const dir = await tmp('sig-units-ensure-');
    await put(dir, '.planning/work/WORK.md', WORK_MD);
    await units.ensureUnitsDir(dir);
    expect(units.checkUnits(dir)).toEqual([]);
    await units.ensureUnitsDir(base);
    expect(units.checkUnits(base)).toEqual([]);
  });

  it('refused with the store off, or on a v1 store: CONFIG, nothing created', async () => {
    const off = await tmp('sig-units-ensure-off-');
    await expect(units.ensureUnitsDir(off)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(existsSync(join(off, '.planning'))).toBe(false);
    const v1 = await tmp('sig-units-ensure-v1-');
    await put(v1, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    const before = snapshotTree(v1);
    await expect(units.ensureUnitsDir(v1)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(snapshotTree(v1)).toEqual(before);
  });

  it('a linked units/ is refused (CONFLICT), nothing is written through it, and it still reads as off with the problem stated', async () => {
    const dir = await tmp('sig-units-ensure-link-');
    const outside = await tmp('sig-units-ensure-out-');
    await put(dir, '.planning/work/WORK.md', WORK_MD);
    await symlink(outside, join(dir, UNITS));
    await expect(units.ensureUnitsDir(dir)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(readdirSync(outside)).toEqual([]);
    expect(units.hasUnitsSafe(dir)).toEqual({ has: false, problem: expect.stringMatching(/units is a symbolic link/) });
  });

  it('units is a file: refused (CONFLICT), the file untouched', async () => {
    const dir = await tmp('sig-units-ensure-file-');
    await put(dir, '.planning/work/WORK.md', WORK_MD);
    await put(dir, UNITS, 'not a folder\n');
    const before = snapshotTree(dir);
    await expect(units.ensureUnitsDir(dir)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(snapshotTree(dir)).toEqual(before);
  });

  it('the .keep write fails: the folder this call made is removed again, so the switch stays off', async () => {
    const dir = await tmp('sig-units-ensure-fail-');
    await put(dir, '.planning/work/WORK.md', WORK_MD);
    const before = snapshotTree(dir);
    const renameFn = async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    await expect(units.ensureUnitsDir(dir, { renameFn })).rejects.toMatchObject({ code: 'IO' });
    expect(snapshotTree(dir)).toEqual(before);
    expect(units.hasUnits(dir)).toBe(false);
  });
});

// ── checkUnits (AC1.5: by ID and path) ──────────────────────────────────────

describe('checkUnits', () => {
  it('a sound store has no findings; so does a project with no units, or no store', async () => {
    expect(units.checkUnits(base)).toEqual([]);
    expect(units.checkUnits(await tmp('sig-units-bare-'))).toEqual([]);
  });

  it('reads only: nothing changes on disk', async () => {
    await put(base, `${UNITS}/M6.E30.json`, '{');
    const before = snapshotTree(base);
    units.checkUnits(base);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('reports each broken record by ID and path, in the shape checkRecords uses', async () => {
    await put(base, `${UNITS}/M6.E30.json`, '{');
    await put(base, `${UNITS}/M6.E31.json`, JSON.stringify({ id: 'M6.E31', status: 'open', events: [E.opened] }));
    await put(base, `${UNITS}/M6.E32.json`, UNIT_KIND.serializeRecord(rec('M6.E33', [E.opened])));
    await put(base, `${UNITS}/M6.E34.json`, UNIT_KIND.serializeRecord(rec('M6.E34', [E.opened, E.shipped])));
    await put(base, `${UNITS}/bad name.json`, '{}');
    await mkdir(join(base, `${UNITS}/M6.E37.json`));
    await put(base, `${UNITS}/sub/M6.E38.json`, UNIT_KIND.serializeRecord(rec('M6.E38', [E.opened])));
    const findings = units.checkUnits(base);
    for (const f of findings) {
      expect(Object.keys(f).sort()).toEqual(['code', 'id', 'message', 'path']);
      expect(f.message).toContain(f.path);
    }
    expect(findings.map((f) => [f.code, f.id, f.path])).toEqual([
      ['invalid', 'M6.E30', `${UNITS}/M6.E30.json`],
      ['invalid', 'M6.E31', `${UNITS}/M6.E31.json`],
      ['path', 'M6.E32', `${UNITS}/M6.E32.json`],
      ['events', 'M6.E34', `${UNITS}/M6.E34.json`],
      ['not-regular', 'M6.E37', `${UNITS}/M6.E37.json`],
      ['path', null, `${UNITS}/bad name.json`],
      ['path', null, `${UNITS}/sub`],
    ]);
  });

  it('an edit made by hand (a field that disagrees with its last edited event) is an events finding', async () => {
    const edited = { type: 'edited', at: AT, by, changes: { title: { from: null, to: 'Recorded' } } };
    await put(base, `${UNITS}/M6.E36.json`, UNIT_KIND.serializeRecord(rec('M6.E36', [E.opened, edited], { title: 'By hand' })));
    expect(units.checkUnits(base)).toEqual([
      expect.objectContaining({ code: 'events', id: 'M6.E36', message: expect.stringMatching(/was last edited to "Recorded"/) }),
    ]);
  });

  it('a record whose ID the rule refuses is a finding: a phase name, an item-ID shape', async () => {
    await plant(base, rec('PLAN', [E.opened]));
    await plant(base, rec('SIG-5', [E.opened]));
    expect(units.checkUnits(base).map((f) => [f.code, f.id, f.path])).toEqual([
      ['invalid', 'PLAN', `${UNITS}/PLAN.json`],
      ['invalid', 'SIG-5', `${UNITS}/SIG-5.json`],
    ]);
  });

  it('caseTwins: IDs that differ only by case, grouped; exact repeats and distinct IDs are not twins', () => {
    expect(units.caseTwins(['M6.E1', 'm6.e1', 'GATE-A', 'Gate-A', 'gate-a', 'phase-1', 'phase-2'])).toEqual([
      ['GATE-A', 'Gate-A', 'gate-a'],
      ['M6.E1', 'm6.e1'],
    ]);
    expect(units.caseTwins(['a', 'b', 'c'])).toEqual([]);
    expect(units.caseTwins([])).toEqual([]);
  });

  // Two files whose names differ only by case cannot both exist on a disk
  // that ignores case (this machine's default), so the on-disk half runs only
  // where the disk tells them apart. `caseTwins` above is the rule either way.
  it('case-twin records on disk are one duplicate-id finding naming both paths', async (ctx) => {
    await put(base, `${UNITS}/case-probe.tmp`, '');
    const sensitive = !existsSync(join(base, `${UNITS}/CASE-PROBE.TMP`));
    await rm(join(base, `${UNITS}/case-probe.tmp`));
    if (!sensitive) return ctx.skip();
    await plant(base, rec('m6.e20', [E.opened]));
    const findings = units.checkUnits(base);
    expect(findings).toEqual([{
      code: 'duplicate-id',
      id: 'M6.E20',
      path: `${UNITS}/M6.E20.json`,
      paths: [`${UNITS}/M6.E20.json`, `${UNITS}/m6.e20.json`],
      message: expect.stringMatching(/differ only by case/),
    }]);
  });
});

// ── A hostile store (NFR input) ─────────────────────────────────────────────

describe('a symlinked units folder is refused, read and write', () => {
  let outside;
  beforeEach(async () => {
    outside = await tmp('sig-units-outside-');
    await put(outside, 'M6.E70.json', UNIT_KIND.serializeRecord(rec('M6.E70', [E.opened])));
    await rm(join(base, UNITS), { recursive: true, force: true });
    await symlink(outside, join(base, UNITS));
  });

  it('readers do not read through it: CONFLICT', () => {
    for (const read of [
      () => units.hasUnits(base),
      () => units.listUnits(base),
      () => units.getUnit(base, 'M6.E70'),
      () => units.unitClosure(base, 'M6.E70'),
      () => units.assertUnitId(base, 'm6.e70', { storeKey: 'SIG' }),
    ]) expect(read).toThrow(expect.objectContaining({ code: 'CONFLICT', message: expect.stringMatching(/symbolic link/) }));
  });

  it('hasUnitsSafe answers false and states the problem; hasUnits still throws (t2.5)', () => {
    expect(units.hasUnitsSafe(base)).toEqual({ has: false, problem: expect.stringMatching(/units is a symbolic link/) });
    expect(() => units.hasUnits(base)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
  });

  it('checkUnits reports it as one link finding and does not read through it', () => {
    expect(units.checkUnits(base)).toEqual([
      { code: 'link', id: null, path: UNITS, message: expect.stringMatching(/symbolic link/) },
    ]);
  });

  it('no writer writes through it: the folder outside is byte-identical', async () => {
    const before = snapshotTree(outside);
    await expect(units.openUnit(base, 'M6.E71', { by })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(units.holdUnit(base, 'M6.E70', { reason: 'r', by })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(units.closeUnit(base, 'M6.E70', { reason: 'legacy', by })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(units.editUnit(base, 'M6.E70', { changes: { title: 't' }, by })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(snapshotTree(outside)).toEqual(before);
  });
});

describe('a symlinked record is refused, read and write', () => {
  let outside;
  beforeEach(async () => {
    outside = await tmp('sig-units-outside-');
    await put(outside, 'target.json', UNIT_KIND.serializeRecord(rec('M6.E70', [E.opened])));
    await symlink(join(outside, 'target.json'), join(base, `${UNITS}/M6.E70.json`));
  });

  it('listUnits reports it broken and reads the others; getUnit and unitClosure refuse it', () => {
    const { units: list, broken } = units.listUnits(base);
    expect(list).toHaveLength(6);
    expect(broken).toEqual([{ id: 'M6.E70', path: `${UNITS}/M6.E70.json`, code: 'link', error: expect.stringMatching(/symbolic link/) }]);
    expect(() => units.getUnit(base, 'M6.E70')).toThrow(expect.objectContaining({ code: 'SCHEMA', message: expect.stringMatching(/symbolic link/) }));
    expect(() => units.unitClosure(base, 'M6.E70')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });

  it('checkUnits reports it as a link, by ID and path', () => {
    expect(units.checkUnits(base)).toEqual([
      { code: 'link', id: 'M6.E70', path: `${UNITS}/M6.E70.json`, message: expect.stringMatching(/symbolic link/) },
    ]);
  });

  it('no writer writes through it or replaces it: the target and the link are unchanged', async () => {
    const target = await readFile(join(outside, 'target.json'), 'utf-8');
    await refused(() => units.holdUnit(base, 'M6.E70', { reason: 'r', by }), 'SCHEMA', /symbolic link/);
    await refused(() => units.closeUnit(base, 'M6.E70', { reason: 'legacy', by }), 'SCHEMA', /symbolic link/);
    await refused(() => units.openUnit(base, 'M6.E70', { by }), 'CONFLICT', /already exists/);
    expect(await readFile(join(outside, 'target.json'), 'utf-8')).toBe(target);
  });
});

describe('a work folder linked outside the project is refused', () => {
  it('readers and writers refuse: CONFLICT', async () => {
    const dir = await tmp('sig-units-linked-work-');
    const outside = await tmp('sig-units-outside-');
    await put(outside, 'WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put(outside, 'units/M6.E70.json', UNIT_KIND.serializeRecord(rec('M6.E70', [E.opened])));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await symlink(outside, join(dir, '.planning/work'));
    const before = snapshotTree(outside);
    expect(() => units.listUnits(dir)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    expect(() => units.hasUnits(dir)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    expect(units.hasUnitsSafe(dir)).toEqual({ has: false, problem: expect.stringMatching(/resolves outside the project/) });
    await expect(units.holdUnit(dir, 'M6.E70', { reason: 'r', by })).rejects.toMatchObject({ name: 'WorkStoreError' });
    await expect(units.openUnit(dir, 'M6.E71', { by })).rejects.toMatchObject({ name: 'WorkStoreError' });
    const after = snapshotTree(outside);
    expect([...after.keys()].filter((k) => k.endsWith('.json'))).toEqual(['units/M6.E70.json']);
    expect(after.get('units/M6.E70.json')).toBe(before.get('units/M6.E70.json'));
  });
});
