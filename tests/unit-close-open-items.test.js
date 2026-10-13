// No route closes a unit that has an open item (AC4.3).
//
// The close request at SHIP and its confirmation already refused one. Three
// routes did not: the migration proposed a legacy close for such a unit (and
// its evidence line did not show the item), and `closeUnit` and `importUnits`
// wrote a `legacy` or `dropped` close over it. After any of them the unit read
// closed with open work inside, and nothing reported it. Now:
//   - `planUnits` proposes such a unit `open`, flags it when there is evidence
//     it is over, and names the items;
//   - `closeUnit`, `importUnit` and `importUnits` refuse (OPEN_ITEMS), naming
//     each item, and write nothing;
//   - `/sig:docs-sweep` reports a closed unit that holds an item not closed.
//
// Stores are temp folders; every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { planUnits, unitImportList, unitsReportLines } from '../plugin/tools/lib/work-migrate-units.js';
import { checkClosedUnitsWithOpenItems } from '../plugin/tools/lib/sweep.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { AT, UNITS, bytesOf, cleanupUnitsStores, commitAll, put, read, unitsStore } from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const by = 'claude';
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const queued = (epic) => ({ type: 'queued', at: AT, by, epic });
const closing = { type: 'close_requested', at: AT, by, reason: 'fixed', proof: 'a'.repeat(40) };
const wontdo = { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'not needed' };
const item = (base, id, events) => put(base, `.planning/work/items/00/${id}.json`, serializeRecord({ id, type: 'FEAT', title: `Leaf ${id}`, events }));
const opened = { type: 'opened', at: AT, by };
const unit = (base, id, events) => put(base, `${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
const refusal = async (fn) => {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected a refusal');
};

// The fixture, with items put into units the migration would otherwise
// propose closed: M7.E1 (a shipped row and a complete retrospective) holds an
// open item and a closing one; M7.E2 (a shipped row) holds one closed item,
// which is no reason to keep it open. (Without unit records an item can name
// only an Epic ID, so the units here are Epics.)
async function withItems({ repo = false } = {}) {
  const base = await unitsStore({ repo });
  item(base, 'LEAF-3', [created, triaged, queued('M7.E1')]);
  item(base, 'LEAF-4', [created, triaged, queued('M7.E1'), closing]);
  item(base, 'LEAF-5', [created, triaged, queued('M7.E2'), wontdo]);
  await regenerateViews(base);
  if (repo) commitAll(base, 'items');
  return base;
}

describe('the migration never proposes a close for a unit with an open item', () => {
  it('planUnits: the unit is proposed open, flagged, and its open items are named — a closed item keeps nothing open', async () => {
    const base = await withItems();
    const plan = await planUnits(base);
    const e1 = plan.units.find((u) => u.id === 'M7.E1');
    expect(e1.proposal).toBe('open');
    expect(e1.flag).toBe('looks-finished-with-open-items');
    expect(e1.open_items).toEqual(['LEAF-3', 'LEAF-4']);
    expect(e1.evidence.length).toBeGreaterThan(0); // the row and the retrospective still say what they say
    expect(e1.against.join(' ')).toMatch(/2 of its items are not closed: LEAF-3, LEAF-4/);
    expect(plan.proposedCloses.map((u) => u.id)).not.toContain('M7.E1');
    expect(plan.flagged.map((u) => u.id)).toContain('M7.E1');
    const e2 = plan.units.find((u) => u.id === 'M7.E2');
    expect(e2.proposal).toBe('legacy-close');
    expect(e2.open_items).toBeUndefined();
  });

  it('the dry run shows the items on the unit\'s own line, and the list a yes would write leaves it open with a note', async () => {
    const base = await withItems();
    const plan = await planUnits(base);
    const line = unitsReportLines(plan).find((l) => l.startsWith('  M7.E1  '));
    expect(line).toMatch(/^ {2}M7\.E1 {2}open {2}\[flagged: looks-finished-with-open-items\]/);
    expect(line).toMatch(/LEAF-3, LEAF-4/);
    const entry = unitImportList(plan, { confirmCloses: true, at: '2026-10-12' }).find((u) => u.id === 'M7.E1');
    expect(entry.close).toBeUndefined();
    expect(entry.opened).toEqual({ at: '2026-10-12', by: 'migration' });
    expect(entry.migration_note).toMatch(/items that are not closed/);
    expect(entry.migration_note).toMatch(/LEAF-3, LEAF-4/);
  });

  it('the units-only apply, with every proposed close confirmed: the unit is open, and no closed unit holds an open item', async () => {
    const base = await withItems({ repo: true });
    const dry = await runWorkStoreMigrate(base, { apply: false });
    expect(dry.report).toMatch(/M7\.E1 {2}open/);
    const out = await runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: '2026-10-12', confirmUnitCloses: true });
    expect(out.applied).toBe(true);
    expect(units.getUnit(base, 'M7.E1').status).toBe('open');
    expect(units.getUnit(base, 'M7.E2').status).toBe('closed');
    expect(checkClosedUnitsWithOpenItems(base)).toEqual([]);
  }, 60_000);

  it('an item closed after the dry run changes the proposal, so the apply refuses on the hash', async () => {
    const base = await withItems({ repo: true });
    const dry = await runWorkStoreMigrate(base, { apply: false });
    item(base, 'LEAF-3', [created, triaged, queued('M7.E1'), wontdo]);
    await regenerateViews(base);
    commitAll(base, 'closed one');
    const out = await runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: '2026-10-12' });
    expect(out.applied).toBe(false);
    expect(out.reason).toMatch(/changed since the dry run/);
    expect(existsSync(join(base, UNITS))).toBe(false);
  }, 60_000);
});

// A store with unit records: M7.E1 open with one open item and one closing
// one, M7.E2 open with one closed item, M7.E3 open with none.
async function storeWithUnits() {
  const base = await unitsStore();
  put(base, `${UNITS}/.keep`, '');
  for (const id of ['M7.E1', 'M7.E2', 'M7.E3']) unit(base, id, [opened]);
  item(base, 'LEAF-2', [created, triaged]);
  item(base, 'LEAF-3', [created, triaged, queued('M7.E1')]);
  item(base, 'LEAF-4', [created, triaged, queued('M7.E1'), closing]);
  item(base, 'LEAF-5', [created, triaged, queued('M7.E2'), wontdo]);
  await regenerateViews(base, { replaceHandRows: true });
  return base;
}

describe('closeUnit refuses while the unit has an item that is not closed', () => {
  for (const [reason, extra] of [['dropped', { words: 'went elsewhere' }], ['legacy', {}]]) {
    it(`${reason}: OPEN_ITEMS, each item named with its status, nothing written`, async () => {
      const base = await storeWithUnits();
      const before = bytesOf(base);
      const err = await refusal(() => units.closeUnit(base, 'M7.E1', { reason, by, ...extra }));
      expect(err.code).toBe('OPEN_ITEMS');
      expect(err.message).toMatch(/M7\.E1 has 2 items that are not closed/);
      expect(err.message).toMatch(/LEAF-3 \(status Q\), LEAF-4 \(status closing\)/);
      expect(err.message).toMatch(/Nothing was written/);
      expect(err.openItems).toEqual([{ id: 'M7.E1', items: ['LEAF-3', 'LEAF-4'] }]);
      expect(bytesOf(base)).toEqual(before);
      expect(units.getUnit(base, 'M7.E1').status).toBe('open');
    });
  }

  it('dropped: the message says to close or move the items first', async () => {
    const base = await storeWithUnits();
    const err = await refusal(() => units.closeUnit(base, 'M7.E1', { reason: 'dropped', words: 'went elsewhere', by }));
    expect(err.message).toMatch(/Close or move the items first/);
    expect(err.message).toMatch(/\/sig:item/);
  });

  it('a unit whose items are all closed, and one with no items, close as before', async () => {
    const base = await storeWithUnits();
    expect((await units.closeUnit(base, 'M7.E2', { reason: 'dropped', words: 'went elsewhere', by })).status).toBe('closed');
    expect((await units.closeUnit(base, 'M7.E3', { reason: 'legacy', by })).status).toBe('closed');
  });

  it('once the items are closed or moved out, the close goes through', async () => {
    const base = await storeWithUnits();
    item(base, 'LEAF-3', [created, triaged]); // moved back to the backlog
    item(base, 'LEAF-4', [created, triaged, queued('M7.E1'), wontdo]);
    await regenerateViews(base);
    expect((await units.closeUnit(base, 'M7.E1', { reason: 'dropped', words: 'went elsewhere', by })).status).toBe('closed');
  });

  it('a broken item record refuses the close too: which unit it is in cannot be known', async () => {
    const base = await storeWithUnits();
    put(base, '.planning/work/items/00/LEAF-9.json', '{ not json');
    const err = await refusal(() => units.closeUnit(base, 'M7.E3', { reason: 'legacy', by }));
    expect(err.code).toBe('SCHEMA');
    expect(err.message).toMatch(/LEAF-9/);
    expect(units.getUnit(base, 'M7.E3').status).toBe('open');
  });
});

describe('importUnit and importUnits refuse a close over an open item', () => {
  // The items name units that have no record yet: M8.E1 holds an open item.
  async function storeForImport() {
    const base = await storeWithUnits();
    item(base, 'LEAF-6', [created, triaged, queued('M7.E3')]);
    put(base, `${UNITS}/M8.E1.json`, UNIT_KIND.serializeRecord({ id: 'M8.E1', events: [opened] }));
    item(base, 'LEAF-7', [created, triaged, queued('M8.E1')]);
    const { rmSync } = await import('node:fs');
    rmSync(join(base, `${UNITS}/M8.E1.json`)); // the item names it; its record is what the import would write
    await regenerateViews(base);
    return base;
  }

  for (const reason of ['legacy', 'dropped']) {
    it(`importUnit, ${reason}: OPEN_ITEMS, the item named, no record written`, async () => {
      const base = await storeForImport();
      const before = bytesOf(base);
      const err = await refusal(() => units.importUnit(base, { id: 'M8.E1', close: { reason, words: 'gone', at: AT, by } }));
      expect(err.code).toBe('OPEN_ITEMS');
      expect(err.message).toMatch(/M8\.E1 has 1 item that is not closed.*LEAF-7 \(status Q\)/);
      expect(bytesOf(base)).toEqual(before);
    });
  }

  it('importUnits: one close over an open item refuses the whole list, and names only that unit', async () => {
    const base = await storeForImport();
    const before = bytesOf(base);
    const list = [
      { id: 'M8.E1', close: { reason: 'legacy', at: AT, by } },
      { id: 'M8.E2', close: { reason: 'legacy', at: AT, by } },
      { id: 'M8.E3', opened: { at: AT, by } },
    ];
    const err = await refusal(() => units.importUnits(base, list));
    expect(err.code).toBe('OPEN_ITEMS');
    expect(err.openItems).toEqual([{ id: 'M8.E1', items: ['LEAF-7'] }]);
    expect(bytesOf(base)).toEqual(before);
  });

  it('importUnits: an OPEN record for a unit with open items is written — only a close is refused', async () => {
    const base = await storeForImport();
    const out = await units.importUnits(base, [{ id: 'M8.E1', opened: { at: AT, by } }, { id: 'M8.E2', close: { reason: 'legacy', at: AT, by } }]);
    expect(out.map((u) => u.status)).toEqual(['open', 'closed']);
  });
});

describe('/sig:docs-sweep reports a closed unit that holds an item not closed', () => {
  it('a record that came past the writers: one advisory, naming the unit, its record and the items, with the fix', async () => {
    const base = await storeWithUnits();
    unit(base, 'M7.E1', [opened, { type: 'closed', at: AT, by, reason: 'legacy' }]); // as a merge would bring it
    unit(base, 'M7.E2', [opened, { type: 'closed', at: AT, by, reason: 'legacy' }]); // its one item is closed
    const found = checkClosedUnitsWithOpenItems(base);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: 'closed-unit-open-items', severity: 'advisory', file: `${UNITS}/M7.E1.json` });
    expect(found[0].message).toMatch(/M7\.E1 is closed and has 2 items that are not closed \(LEAF-3, LEAF-4\)/);
    expect(found[0].message).toMatch(/\/sig:item/);
  });

  it('nothing on a store whose closed units hold no open item, on a project with no unit records, and with no store', async () => {
    const base = await storeWithUnits();
    expect(checkClosedUnitsWithOpenItems(base)).toEqual([]);
    expect(checkClosedUnitsWithOpenItems(await unitsStore())).toEqual([]);
    expect(checkClosedUnitsWithOpenItems(await unitsStore({ store: false }))).toEqual([]);
  });

  it('runSweep carries the finding', async () => {
    const base = await storeWithUnits();
    unit(base, 'M7.E1', [opened, { type: 'closed', at: AT, by, reason: 'legacy' }]);
    const { runSweep } = await import('../plugin/tools/lib/sweep.js');
    const report = await runSweep(base);
    const all = JSON.stringify(report);
    expect(all).toMatch(/closed-unit-open-items/);
    expect(read(base, `${UNITS}/M7.E1.json`)).toMatch(/legacy/);
  }, 60_000);
});
