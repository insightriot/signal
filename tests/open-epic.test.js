// M6.E16.S3.t3.1 — `openEpic`: opening an Epic creates its unit record and
// sets `current_epic`. See .planning/M6.E16-VALIDATION.md rows AC3.1, AC3.3
// and AC6.4.
//
// Every project here is built in a temp folder. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { openEpic } from '../plugin/tools/lib/work-ops.js';
import { getUnit } from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { readState, setCurrentEpic } from '../plugin/tools/lib/state.js';
import { acquireLock } from '../plugin/tools/lib/file-lock.js';
import { WORK_LOCK_REL } from '../plugin/tools/lib/work-store.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11T10:00:00.000Z';
const SHA = '0123abc';
const by = 'claude';
const UNITS = '.planning/work/units';

const E = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: SHA },
  shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA, pr: '#412', release: 'v9.9.9' },
  dropped: { type: 'closed', at: AT, by, reason: 'dropped', words: 'the work moved to another unit' },
  held: { type: 'held', at: AT, by, reason: 'still read daily' },
};

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const plant = (id, events) => put(`${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
const unitBytes = (id) => readFile(join(base, `${UNITS}/${id}.json`), 'utf-8');
const stateText = () => readFile(join(base, '.planning/STATE.md'), 'utf-8');

async function writeState(epic) {
  await put('.planning/STATE.md',
    '---\nschema_version: 1\nphase: null\n'
    + `current_epic: ${epic === null ? 'null' : epic}\n`
    + 'current_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n---\n# State\n\nbody\n');
}
const storeOn = () => put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-open-epic-'));
  await writeState('M7.E1');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('openEpic — a project with unit records (AC3.1)', () => {
  beforeEach(async () => {
    await storeOn();
    await plant('M7.E1', [E.opened]);
    await plant('M7.E2', [E.opened, E.closing]);
    await plant('M7.E3', [E.opened, E.closing, E.shipped]);
    await plant('M7.E4', [E.opened, E.dropped, E.held]);
  });

  it('a unit with no record: the record is created and current_epic is set', async () => {
    const out = await openEpic(base, 'M7.E5', { by });
    expect(out).toEqual({ epic: 'M7.E5', unit: 'created' });
    const unit = getUnit(base, 'M7.E5');
    expect(unit.status).toBe('open');
    expect(unit.record.events).toHaveLength(1);
    expect(unit.record.events[0]).toMatchObject({ type: 'opened', by });
    expect((await readState(base)).current_epic).toBe('M7.E5');
  });

  it.each([['open', 'M7.E1'], ['closing', 'M7.E2']])('a unit whose record is %s: current_epic is set, the record is untouched', async (_status, id) => {
    await writeState('M7.E9');
    const before = await unitBytes(id);
    expect(await openEpic(base, id, { by })).toEqual({ epic: id, unit: 'existing' });
    expect(await unitBytes(id)).toBe(before);
    expect((await readState(base)).current_epic).toBe(id);
  });

  it('a closed unit is refused with its close line, and nothing is written (AC3.3)', async () => {
    const before = snapshotTree(base);
    const err = await openEpic(base, 'M7.E3', { by }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toMatch(/M7\.E3/);
    expect(err.message).toMatch(/shipped/);
    expect(err.message).toMatch(/2026-10-11/);
    expect(err.message).toMatch(/#412/);
    expect(err.message).toMatch(/v9\.9\.9/);
    expect(err.message).toMatch(/force/);
    expect(snapshotTree(base)).toEqual(before);
  });

  // REVIEW pass 1, S-L2: this case used to pin that the close's words were in
  // the refusal. They are free text from a record, and the refusal's next
  // sentence says how to override it — so the words are left out, on purpose.
  it('a closed and held unit is refused too, with its reason code and date, and without the close\'s words', async () => {
    const before = snapshotTree(base);
    const err = await openEpic(base, 'M7.E4', { by }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toMatch(/M7\.E4 is closed \(dropped, \d{4}-\d{2}-\d{2}\), and held/);
    expect(err.message).not.toMatch(/the work moved to another unit/);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('force on a closed unit: a `reopened` event naming the override, then current_epic (AC3.3)', async () => {
    expect(await openEpic(base, 'M7.E3', { by, force: true })).toEqual({ epic: 'M7.E3', unit: 'reopened' });
    const unit = getUnit(base, 'M7.E3');
    expect(unit.status).toBe('open');
    const last = unit.record.events.at(-1);
    expect(last).toMatchObject({ type: 'reopened', by });
    expect(last.reason).toMatch(/--epic override/);
    expect(last.reason).toMatch(/shipped/);
    expect(unit.record.events).toHaveLength(4);
    expect((await readState(base)).current_epic).toBe('M7.E3');
  });

  it('force on a closed, held unit: reopened; the reason carries the close\'s reason and date, not its words', async () => {
    expect(await openEpic(base, 'M7.E4', { by, force: true })).toEqual({ epic: 'M7.E4', unit: 'reopened' });
    const unit = getUnit(base, 'M7.E4');
    expect(unit).toMatchObject({ status: 'open', held: true });
    const { reason } = unit.record.events.at(-1);
    expect(reason).toMatch(/dropped, 2026-10-11/);
    expect(reason).not.toMatch(/the work moved to another unit/);
  });

  it('force on an open unit changes nothing in the record', async () => {
    const before = await unitBytes('M7.E1');
    expect(await openEpic(base, 'M7.E1', { by, force: true })).toEqual({ epic: 'M7.E1', unit: 'existing' });
    expect(await unitBytes('M7.E1')).toBe(before);
  });

  it.each([['phase-11'], ['v0.1.6'], ['next'], ['../M7.E5'], [null]])('%j is not an Epic ID: refused, nothing written (D-M6E16-13)', async (id) => {
    const before = snapshotTree(base);
    await expect(openEpic(base, id, { by })).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('no `by`: refused before STATE is touched', async () => {
    const before = snapshotTree(base);
    await expect(openEpic(base, 'M7.E5', {})).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('a broken record for the unit: refused before STATE is touched', async () => {
    await put(`${UNITS}/M7.E6.json`, '{ not json');
    const before = snapshotTree(base);
    await expect(openEpic(base, 'M7.E6', { by })).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('STATE refuses the roll: no record is created', async () => {
    await rm(join(base, '.planning/STATE.md'));
    await expect(openEpic(base, 'M7.E5', { by })).rejects.toThrow(/schema_version 1/);
    expect(existsSync(join(base, `${UNITS}/M7.E5.json`))).toBe(false);
  });

  it('the record write fails after STATE was set: the error says both, and a second call finishes the open', async () => {
    const lock = await acquireLock(join(base, WORK_LOCK_REL), { label: 'test' });
    let err;
    try {
      err = await openEpic(base, 'M7.E5', { by }).catch((e) => e);
    } finally {
      await lock.released();
    }
    expect(err).toMatchObject({ code: 'LOCKED' });
    expect(err.message).toMatch(/current_epic is now M7\.E5/);
    expect(err.message).toMatch(/no unit record was created/);
    expect(err.message).toMatch(/openEpic.*again/);
    expect((await readState(base)).current_epic).toBe('M7.E5');
    expect(existsSync(join(base, `${UNITS}/M7.E5.json`))).toBe(false);

    expect(await openEpic(base, 'M7.E5', { by })).toEqual({ epic: 'M7.E5', unit: 'created' });
    expect(getUnit(base, 'M7.E5').status).toBe('open');
  });
});

describe('openEpic — a project with no unit records (AC6.4)', () => {
  // The same STATE.md, rolled by setCurrentEpic alone in a twin project.
  async function twinAfterSetCurrentEpic(id) {
    const twin = await mkdtemp(join(tmpdir(), 'sig-open-epic-twin-'));
    try {
      await mkdir(join(twin, '.planning'), { recursive: true });
      await writeFile(join(twin, '.planning/STATE.md'), await stateText(), 'utf-8');
      await setCurrentEpic(twin, id);
      return await readFile(join(twin, '.planning/STATE.md'), 'utf-8');
    } finally {
      await rm(twin, { recursive: true, force: true });
    }
  }

  it('store off: sets current_epic exactly as setCurrentEpic does, and creates no work/ folder', async () => {
    const expected = await twinAfterSetCurrentEpic('M7.E2');
    expect(await openEpic(base, 'M7.E2', { by })).toEqual({ epic: 'M7.E2', unit: 'no-records' });
    // `last_updated` is the write's own clock; everything else is compared.
    const stamp = (text) => text.replace(/^last_updated: .*$/m, 'last_updated: <now>');
    expect(stamp(await stateText())).toBe(stamp(expected));
    expect(stamp(expected)).toContain('last_updated: <now>');
    expect(existsSync(join(base, '.planning/work'))).toBe(false);
  });

  it('store on, no unit records: none is created', async () => {
    await storeOn();
    expect(await openEpic(base, 'M7.E2', { by })).toEqual({ epic: 'M7.E2', unit: 'no-records' });
    expect((await readState(base)).current_epic).toBe('M7.E2');
    expect(existsSync(join(base, UNITS))).toBe(false);
  });

  it('an archived Epic folder does not refuse the open (today, nothing reads it here)', async () => {
    await storeOn();
    await put('.planning/archive/epics/M7.E2/README.md', 'x\n');
    expect(await openEpic(base, 'M7.E2', { by })).toEqual({ epic: 'M7.E2', unit: 'no-records' });
  });

  it('a non-Epic name fails as setCurrentEpic fails today', async () => {
    const own = await setCurrentEpic(base, 'phase-11').catch((e) => e);
    const viaOpen = await openEpic(base, 'phase-11', { by }).catch((e) => e);
    expect(viaOpen.name).toBe(own.name);
    expect(viaOpen.message).toBe(own.message);
  });

  // Changed at REVIEW pass 1 (r1.4, C-I4, `D-M6E16-22`): this case pinned the
  // opposite — a `units/` the library refuses read as "no unit records".
  it('`units/` is a link (a hostile layout): refused, and current_epic is not set', async () => {
    await storeOn();
    const outside = await mkdtemp(join(tmpdir(), 'sig-open-epic-out-'));
    try {
      await writeFile(join(outside, 'M7.E2.json'), UNIT_KIND.serializeRecord({ id: 'M7.E2', events: [E.opened, E.dropped] }), 'utf-8');
      await symlink(outside, join(base, UNITS));
      const before = (await readState(base)).current_epic;
      await expect(openEpic(base, 'M7.E2', { by })).rejects.toMatchObject({
        name: 'WorkStoreError', code: 'CONFLICT', message: expect.stringMatching(/\.planning\/work\/units\/ cannot be trusted.*symbolic link/),
      });
      expect((await readState(base)).current_epic).toBe(before);
      expect(before).not.toBe('M7.E2');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
