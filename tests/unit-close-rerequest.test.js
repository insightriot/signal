// M6.E16.S5.t5.0a — asking again for a close that is already requested.
//
// SHIP is re-run after review fixes were pushed: the unit is *closing* on the
// earlier commit, and the close has to name the new one. Two events, both
// real, in one write: `reopened` (its reason naming the earlier proof), then a
// new `close_requested`. No event replaces a proof.
//
// Stores are temp folders; unit names are invented. No git: a 40-character
// proof is never checked for ambiguity.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as units from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11T10:00:00.000Z';
const LATER = '2026-10-12T09:00:00.000Z';
const FIRST = 'a'.repeat(40);
const SECOND = 'b'.repeat(40);
const by = 'claude';
const UNITS = '.planning/work/units';
const AWS = `AKIA${'ABCDEFGH'.repeat(2)}`; // shaped like a key; not one

const E = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: FIRST, pr: '#7', release: 'v9.9.8' },
  shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: FIRST },
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
  base = await mkdtemp(join(tmpdir(), 'sig-unit-rerequest-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await plant('M7.E1', [E.opened]);
  await plant('M7.E2', [E.opened, E.closing]);
  await plant('M7.E3', [E.opened, E.closing, E.shipped]);
  await plant('M7.E4', [E.opened, E.held, E.closing]);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function refused(run, code, message) {
  const before = snapshotTree(base);
  const err = await run().catch((e) => e);
  expect(err, 'the call was not refused').toBeInstanceOf(Error);
  expect(err).toMatchObject({ code });
  if (message) expect(err.message).toMatch(message);
  expect(snapshotTree(base)).toEqual(before);
}

describe('rerequestUnitClose — a closing unit asked to close on another commit', () => {
  it('appends reopened then close_requested, in that order, and the unit reads closing on the new commit', async () => {
    const out = await units.rerequestUnitClose(base, 'M7.E2', { proof: SECOND, pr: '#8', release: 'v9.9.9', by, at: LATER });
    expect(out).toMatchObject({ id: 'M7.E2', status: 'closing', closing_proof: SECOND, close: null });
    const record = JSON.parse(await bytes('M7.E2'));
    expect(record.events).toEqual([
      E.opened,
      E.closing,
      { type: 'reopened', at: LATER, by, reason: expect.any(String) },
      { type: 'close_requested', at: LATER, by, proof: SECOND, pr: '#8', release: 'v9.9.9' },
    ]);
    // The reason names the earlier proof, the new one, and that the close was asked for again.
    const reason = record.events[2].reason;
    expect(reason).toContain(FIRST);
    expect(reason).toContain(SECOND);
    expect(reason).toMatch(/requested again/);
    // Both events are legal where they stand: the record still reads and folds.
    expect(units.getUnit(base, 'M7.E2').status).toBe('closing');
    expect(units.checkUnits(base)).toEqual([]);
  });

  it('the earlier request stays in the history: nothing replaces a proof', async () => {
    await units.rerequestUnitClose(base, 'M7.E2', { proof: SECOND, by, at: LATER });
    const events = JSON.parse(await bytes('M7.E2')).events;
    expect(events.filter((e) => e.type === 'close_requested').map((e) => e.proof)).toEqual([FIRST, SECOND]);
    expect(events.map((e) => e.type)).not.toContain('edited');
  });

  it('pr and release are not carried over from the earlier request', async () => {
    await units.rerequestUnitClose(base, 'M7.E2', { proof: SECOND, by, at: LATER });
    const last = JSON.parse(await bytes('M7.E2')).events.at(-1);
    expect(last).toEqual({ type: 'close_requested', at: LATER, by, proof: SECOND });
  });

  it('a hold stays through it', async () => {
    const out = await units.rerequestUnitClose(base, 'M7.E4', { proof: SECOND, by, at: LATER });
    expect(out).toMatchObject({ status: 'closing', held: true, hold_reason: 'still read daily', closing_proof: SECOND });
  });

  it('the caller\'s gate runs under the lock, before anything is written; when it throws nothing is written', async () => {
    const boom = Object.assign(new Error('the gate said no'), { code: 'OPEN_ITEMS' });
    await refused(() => units.rerequestUnitClose(base, 'M7.E2', { proof: SECOND, by, at: LATER }, { gate: () => { throw boom; } }), 'OPEN_ITEMS', /gate said no/);
  });

  it('refused, nothing written: the same commit, a unit that is not closing, no record, a bad proof', async () => {
    await refused(() => units.rerequestUnitClose(base, 'M7.E2', { proof: FIRST, by, at: LATER }), 'CONFLICT', /already requested with/);
    await refused(() => units.rerequestUnitClose(base, 'M7.E1', { proof: SECOND, by, at: LATER }), 'CONFLICT', /no close is outstanding.*open/s);
    await refused(() => units.rerequestUnitClose(base, 'M7.E3', { proof: SECOND, by, at: LATER }), 'CONFLICT', /no close is outstanding.*closed/s);
    await refused(() => units.rerequestUnitClose(base, 'M7.E9', { proof: SECOND, by, at: LATER }), 'NOT_FOUND');
    await refused(() => units.rerequestUnitClose(base, 'M7.E2', { proof: 'HEAD', by, at: LATER }), 'SCHEMA', /commit hash/);
  });

  it('pr and release go through the sensitive-data gate; nothing is written until acknowledged', async () => {
    const before = await bytes('M7.E2');
    const out = await units.rerequestUnitClose(base, 'M7.E2', { proof: SECOND, pr: AWS, by, at: LATER });
    expect(out).toMatchObject({ aborted: 'sensitive-data-pending' });
    expect(await bytes('M7.E2')).toBe(before);
  });
});
