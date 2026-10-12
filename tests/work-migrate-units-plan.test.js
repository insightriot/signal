// M6.E16 t7.2 — `planUnits`: one proposal for every unit a project names
// (FR9, AC9.1; NFR input). See .planning/M6.E16-PLAN.md § S7.
//
// The project is `tests/helpers/units-store-fixture.js`. Every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { planUnits, unitImportList, unitsReportLines } from '../plugin/tools/lib/work-migrate-units.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { snapshotTree } from './helpers/write-inventory.js';
import {
  AT, cleanupUnitsStores, MILESTONE, milestone7, put, read, retro, ROWS, stateText, unitsStore,
} from './helpers/units-store-fixture.js';

// Built, not written as a literal: a control character in a pattern is a lint error, and an invisible one in source is unreadable.
const INVISIBLE = new RegExp(`[\u200b\u202e${String.fromCharCode(7)}]|\u{e0041}`, 'u');

afterEach(cleanupUnitsStores);

const byId = (plan) => Object.fromEntries(plan.units.map((u) => [u.id, u]));
const proposals = (plan) => Object.fromEntries(plan.units.map((u) => [u.id, u.flag ? `${u.proposal} [${u.flag}]` : u.proposal]));

describe('planUnits — the union of units, one proposal each (AC9.1)', () => {
  it('names every unit any source names, in a stable order, and reads only', async () => {
    const base = await unitsStore();
    const before = snapshotTree(base);
    const plan = await planUnits(base);
    expect(snapshotTree(base)).toEqual(before);
    expect(proposals(plan)).toEqual({
      'M5.E2': 'legacy-close',
      'M5.E3': 'open',
      'M6.E1': 'legacy-close',
      'M7.E1': 'legacy-close',
      'M7.E2': 'legacy-close',
      'M7.E3': 'open',
      'M7.E4': 'open [row-unclear]',
      'M7.E5': 'open',
      'M7.E9': 'open',
      'GATE-A': 'legacy-close',
      'LEAF-7': 'refused',
      'phase-11': 'refused',
      'Phase-11': 'refused',
      'PHASE10-S4': 'open',
    });
    expect(plan.units.map((u) => u.id)).toEqual([
      'M5.E2', 'M5.E3', 'M6.E1', 'M7.E1', 'M7.E2', 'M7.E3', 'M7.E4', 'M7.E5', 'M7.E9',
      'GATE-A', 'LEAF-7', 'Phase-11', 'phase-11', 'PHASE10-S4',
    ]);
    expect(plan.current).toBe('M7.E9');
  });

  it('says in words which evidence it found for each proposed close', async () => {
    const u = byId(await planUnits(await unitsStore()));
    expect(u['M7.E1'].evidence).toEqual([
      'its milestone row says shipped (MILESTONE-7.md:7: “**shipped** — `v1.2`, 2026-09-01 (PR #12)”)',
      'its retrospective is complete (.planning/M7.E1-RETROSPECTIVE.md)',
    ]);
    // A stub retrospective is not evidence; the row is.
    expect(u['M7.E2'].evidence).toEqual(['its milestone row says shipped (MILESTONE-7.md:8: “**shipped** — 2026-09-02”)']);
    expect(u['M7.E2'].against).toEqual(['its retrospective is a stub (.planning/M7.E2-RETROSPECTIVE.md)']);
    // A bare-`E1` row in another milestone file, in the older format.
    expect(u['M6.E1'].evidence).toEqual(['its milestone row says shipped (MILESTONE-6.md:5: “✅ shipped 2026-01-01”)']);
    expect(u['M6.E1'].row.cells).toEqual(['**E1 — Old format**', '✅ shipped 2026-01-01', 'Notes with a \\| pipe, and `code`']);
    // A unit that is not an Epic: its retrospective, and today's closure check.
    expect(u['GATE-A'].evidence[0]).toBe('its retrospective is complete (.planning/GATE-A-RETROSPECTIVE.md)');
    expect(u['GATE-A'].evidence[1]).toMatch(/^today's closure check reads it closed \(GATE-A-VERIFICATION\.md records a PASS/);
    // An archived Epic, found by its archived retrospective.
    expect(u['M5.E2'].evidence).toEqual(['its retrospective is complete (.planning/archive/M5/E2/M5.E2-RETROSPECTIVE.md)']);
    expect(u['M5.E2'].sources).toEqual(['retrospective', 'archive folder']);
  });

  it('a stub retrospective alone, a folder alone, and an item alone are not evidence', async () => {
    const u = byId(await planUnits(await unitsStore()));
    expect(u['M7.E5']).toMatchObject({ proposal: 'open', evidence: [], flag: null });
    expect(u['M5.E3']).toMatchObject({ proposal: 'open', evidence: [], sources: ['archive folder'] });
    expect(u['M7.E3']).toMatchObject({ proposal: 'open', evidence: [], sources: ['work items'] });
  });

  it('a row that says shipped and also parked, pending or in flight is not evidence', async () => {
    const base = await unitsStore();
    const u = byId(await planUnits(base));
    expect(u['M7.E4']).toMatchObject({ proposal: 'open', flag: 'row-unclear', evidence: [] });
    expect(u['M7.E4'].against[0]).toMatch(/says shipped and also "parked", so the row is not counted/);
    for (const [cell, word] of [
      ['S1 shipped; S2 pending', 'pending'], ['shipped (core) — rest IN FLIGHT', 'in flight'], ['Shipped — in-flight follow-up', 'in-flight'],
    ]) {
      put(base, MILESTONE, milestone7([`| \`M7.E6\` | ${cell} | x |`]));
      const six = byId(await planUnits(base))['M7.E6'];
      expect(six, cell).toMatchObject({ proposal: 'open', flag: 'row-unclear' });
      expect(six.against[0]).toContain(`also "${word}"`);
    }
  });

  it('"shipped" is matched as a word, and "not shipped" is not evidence', async () => {
    const base = await unitsStore();
    const cells = {
      'M7.E60': 'unshipped', 'M7.E61': 'preshipped work', 'M7.E62': 'not shipped', 'M7.E63': 'never shipped', 'M7.E64': 'not yet shipped',
      'M7.E65': 'SHIPPED', 'M7.E66': 'ready', 'M7.E67': 'shippedness',
    };
    put(base, MILESTONE, milestone7(Object.entries(cells).map(([id, cell]) => `| \`${id}\` | ${cell} | x |`)));
    const u = byId(await planUnits(base));
    expect(Object.keys(cells).filter((id) => u[id].proposal === 'legacy-close')).toEqual(['M7.E65']);
    for (const id of Object.keys(cells).filter((i) => i !== 'M7.E65')) expect(u[id], id).toMatchObject({ proposal: 'open', flag: null });
  });

  it('the current unit is open whatever says it is over, and that is flagged', async () => {
    const base = await unitsStore();
    put(base, '.planning/STATE.md', stateText('M7.E1'));
    const u = byId(await planUnits(base));
    expect(u['M7.E1']).toMatchObject({ proposal: 'open', flag: 'current-but-looks-finished', current: true });
    expect(u['M7.E1'].evidence).toHaveLength(2);
    // The Epic that was current is now only a row that says in flight.
    expect(u['M7.E9']).toMatchObject({ proposal: 'open', flag: null });
  });

  it('a current unit that nothing else names still gets a record', async () => {
    const base = await unitsStore();
    put(base, '.planning/STATE.md', stateText('M8.E1'));
    expect(byId(await planUnits(base))['M8.E1']).toMatchObject({ proposal: 'open', sources: ['STATE.md (current)'], flag: null });
  });

  it('two units that differ only by case are both refused — never two records', async () => {
    const plan = await planUnits(await unitsStore());
    const u = byId(plan);
    expect(u['phase-11'].reason).toMatch(/differs only by letter case from Phase-11/);
    expect(u['Phase-11'].reason).toMatch(/differs only by letter case from phase-11/);
    expect(unitImportList(plan, { confirmCloses: true, at: '2026-10-11' }).map((x) => x.id.toLowerCase())).not.toContain('phase-11');
  });

  it('a name shaped like the store\'s item IDs, a phase name and an unsafe name are refused with the reason', async () => {
    const base = await unitsStore();
    put(base, '.planning/Execute-RETROSPECTIVE.md', retro('Execute'));
    put(base, '.planning/a..b-RETROSPECTIVE.md', retro('a..b'));
    const u = byId(await planUnits(base));
    expect(u['LEAF-7'].reason).toMatch(/shaped like one of this project's item IDs \(LEAF-n\)/);
    expect(u.Execute.reason).toMatch(/is a phase name/);
    expect(u['a..b'].reason).toMatch(/is not a unit ID/);
    // With another key the same name is an ordinary unit.
    expect(byId(await planUnits(base, { storeKey: 'TIDE' }))['LEAF-7'].proposal).toBe('open');
  });

  it('a unit with two rows keeps the first, and says so', async () => {
    const base = await unitsStore();
    put(base, MILESTONE, milestone7(['| `M7.E1` | **in flight** | first |', '| `M7.E1` | **shipped** | second |']));
    put(base, '.planning/M7.E1-RETROSPECTIVE.md', '# M7.E1\n\n[FILL IN]\n');
    const plan = await planUnits(base);
    expect(byId(plan)['M7.E1']).toMatchObject({ proposal: 'open', row: { line: 7 } });
    expect(plan.notes.join('\n')).toMatch(/keeps its first\. Not used: M7\.E1 at \.planning\/MILESTONE-7\.md:8/);
  });

  it('with no work store the same files plan the same units, less the one only an item names', async () => {
    const plan = await planUnits(await unitsStore({ store: false }), { storeKey: 'LEAF' });
    expect(Object.keys(byId(plan))).not.toContain('M7.E3');
    expect(byId(plan)['M7.E1'].proposal).toBe('legacy-close');
    expect(byId(plan)['LEAF-7'].proposal).toBe('refused');
  });

  it('a project that names no unit plans none', async () => {
    const base = await unitsStore();
    for (const rel of ['MILESTONE-6.md', 'MILESTONE-7.md', 'M7.E1-RETROSPECTIVE.md', 'M7.E2-RETROSPECTIVE.md', 'M7.E5-RETROSPECTIVE.md', 'M7.E9-PLAN.md',
      'GATE-A-PLAN.md', 'GATE-A-VERIFICATION.md', 'GATE-A-RETROSPECTIVE.md', 'PHASE10-S4-PLAN.md', 'phase-11-PLAN.md', 'LEAF-7-PLAN.md', 'archive',
      'work/items/00/LEAF-2.json', 'work/items/00/LEAF-2.md']) rmSync(join(base, '.planning', rel), { recursive: true });
    put(base, '.planning/STATE.md', stateText(null));
    const plan = await planUnits(base);
    expect(plan.units).toEqual([]);
    expect(unitsReportLines(plan).join('\n')).toMatch(/none — the folder for unit records is created empty/);
  });
});

describe('planUnits — units the person declares (--also)', () => {
  const also = [{ id: 'M5.E11', reason: 'dropped', words: 'became M7.E1' }];

  it('a declared unit is planned closed as dropped, with its words', async () => {
    const plan = await planUnits(await unitsStore(), { also });
    expect(byId(plan)['M5.E11']).toMatchObject({ proposal: 'dropped', words: 'became M7.E1', sources: ['--also'] });
    expect(plan.declared.map((u) => u.id)).toEqual(['M5.E11']);
    expect(unitImportList(plan, { at: '2026-10-11' }).find((u) => u.id === 'M5.E11'))
      .toEqual({ id: 'M5.E11', close: { reason: 'dropped', words: 'became M7.E1', at: '2026-10-11', by: 'migration' } });
  });

  it.each([
    ['an ID a source already names', [{ id: 'M7.E1', reason: 'dropped', words: 'x' }], /already names M7\.E1/],
    ['a case twin of a named unit', [{ id: 'gate-a', reason: 'dropped', words: 'x' }], /differs only by letter case from GATE-A/],
    ['an illegal ID', [{ id: '../x', reason: 'dropped', words: 'x' }], /is not a unit ID/],
    ['an item-shaped ID', [{ id: 'LEAF-9', reason: 'dropped', words: 'x' }], /item IDs/],
    ['a reason other than dropped', [{ id: 'M5.E11', reason: 'legacy', words: 'x' }], /only "dropped" can be declared/],
    ['shipped', [{ id: 'M5.E11', reason: 'shipped', words: 'x' }], /only "dropped" can be declared/],
    ['no words', [{ id: 'M5.E11', reason: 'dropped', words: '  ' }], /needs words/],
    ['the same ID twice', [...also, { id: 'm5.e11', reason: 'dropped', words: 'y' }], /given twice/],
    ['no ID', [{ reason: 'dropped', words: 'x' }], /needs an ID/],
    ['not a list', 'M5.E11:dropped:x', /could not be read/],
  ])('refused, whole: %s', async (_, list, re) => {
    const plan = await planUnits(await unitsStore(), { also: list });
    expect(plan.refusal).toMatch(re);
    expect(plan.units).toBeUndefined();
  });
});

describe('unitImportList — what the apply writes', () => {
  it('a confirmed legacy close carries its old row\'s cells and a note saying what was found', async () => {
    const list = unitImportList(await planUnits(await unitsStore()), { confirmCloses: true, at: '2026-10-11' });
    const one = list.find((u) => u.id === 'M7.E2');
    expect(one.legacy_row).toEqual(['`M7.E2`', '**shipped** — 2026-09-02', 'Harbour sync']);
    expect(one.close).toEqual({ reason: 'legacy', words: 'over before unit records existed; recorded when they were added', at: '2026-10-11', by: 'migration' });
    expect(one.migration_note).toMatch(/^Recorded as closed \(legacy\) when unit records were added: a person confirmed the list it was in\. Found: its milestone row says shipped/);
    expect(one.migration_note).toMatch(/Also found: its retrospective is a stub/);
    expect(list.find((u) => u.id === 'GATE-A').legacy_row).toBeUndefined();
    expect(list.filter((u) => u.close?.reason === 'legacy').map((u) => u.id)).toEqual(['M5.E2', 'M6.E1', 'M7.E1', 'M7.E2', 'GATE-A']);
  });

  it('without the yes every proposed close is created open, with a note saying it looked finished', async () => {
    const list = unitImportList(await planUnits(await unitsStore()), { at: '2026-10-11' });
    expect(list.filter((u) => u.close)).toEqual([]);
    const one = list.find((u) => u.id === 'M7.E1');
    expect(one.opened).toEqual({ at: '2026-10-11', by: 'migration' });
    expect(one.migration_note).toMatch(/^It looked finished when unit records were added, and the close was not confirmed, so it was left open\. Found: /);
    // An open unit carries no old row (the table would print it for ever); its summary is the row's third cell.
    expect(one.legacy_row).toBeUndefined();
    expect(one.summary).toBe('Lantern index');
  });

  it('an open unit has no note unless it was flagged; a refused one is not in the list', async () => {
    const list = unitImportList(await planUnits(await unitsStore()), { confirmCloses: true, at: '2026-10-11' });
    expect(list.find((u) => u.id === 'M7.E9')).toEqual({ id: 'M7.E9', summary: 'The current one', opened: { at: '2026-10-11', by: 'migration' } });
    expect(list.find((u) => u.id === 'PHASE10-S4')).toEqual({ id: 'PHASE10-S4', opened: { at: '2026-10-11', by: 'migration' } });
    expect(list.find((u) => u.id === 'M7.E4').migration_note).toMatch(/^Left open when unit records were added: its milestone row says shipped and something else/);
    expect(list.map((u) => u.id)).toEqual(['M5.E2', 'M5.E3', 'M6.E1', 'M7.E1', 'M7.E2', 'M7.E3', 'M7.E4', 'M7.E5', 'M7.E9', 'GATE-A', 'PHASE10-S4']);
  });
});

describe('planUnits — the hash covers what was read and what was shown (E15 pass 3 I-4)', () => {
  const also = [{ id: 'M5.E11', reason: 'dropped', words: 'became M7.E1' }];

  it('is the same for the same files, and carries no clock', async () => {
    const base = await unitsStore();
    const a = await planUnits(base, { also });
    const b = await planUnits(base, { also });
    expect(b.inputHash).toBe(a.inputHash);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(a)).not.toMatch(/20\d\d-\d\d-\d\dT\d\d:\d\d(?!:00\.000Z)/);
  });

  const changes = {
    'a new unit file in .planning/': (base) => put(base, '.planning/GATE-B-PLAN.md', '# b\n'),
    'a second file of a unit already named': (base) => put(base, '.planning/PHASE10-S4-RESEARCH.md', '# r\n'),
    'a row\'s third cell only': (base) => put(base, MILESTONE, milestone7([ROWS['M7.E1'].replace('Lantern index', 'Lantern index, again'), ROWS['M7.E2'], ROWS['M7.E4'], ROWS['M7.E9']])),
    'a row\'s status cell': (base) => put(base, MILESTONE, milestone7([ROWS['M7.E1'], ROWS['M7.E2'].replace('2026-09-02', '2026-09-03'), ROWS['M7.E4'], ROWS['M7.E9']])),
    'a row moving down a line': (base) => put(base, MILESTONE, `\n${read(base, MILESTONE)}`),
    'a stub retrospective filled in': (base) => put(base, '.planning/M7.E5-RETROSPECTIVE.md', retro('M7.E5')),
    'a retrospective moved to the archive': (base) => {
      put(base, '.planning/archive/M7/E1/M7.E1-RETROSPECTIVE.md', retro('M7.E1'));
      rmSync(join(base, '.planning/M7.E1-RETROSPECTIVE.md'));
    },
    'current_epic': (base) => put(base, '.planning/STATE.md', stateText('M7.E5')),
    'an item joining a unit': (base) => put(base, '.planning/work/items/00/LEAF-1.json', serializeRecord({
      id: 'LEAF-1', type: 'FEAT', title: 'Leaf LEAF-1', events: [{ type: 'created', at: AT, by: 'claude' }, { type: 'triaged', at: AT, by: 'claude' }, { type: 'queued', at: AT, by: 'claude', epic: 'M7.E9' }],
    })),
    'a verdict that changes today\'s closure answer': (base) => put(base, '.planning/GATE-A-VERIFICATION.md', '# GATE-A verification\n\n**Verdict:** FAIL\n'),
    'the milestone file gaining the markers': (base) => put(base, MILESTONE, milestone7(Object.values(ROWS), { markers: true })),
    'an archive folder appearing': (base) => mkdirSync(join(base, '.planning/archive/M5/E4'), { recursive: true }),
  };
  it.each(Object.keys(changes))('moves when this changes: %s', async (name) => {
    const base = await unitsStore();
    const before = (await planUnits(base, { also })).inputHash;
    changes[name](base);
    expect((await planUnits(base, { also })).inputHash).not.toBe(before);
  });

  it('moves with the --also list: its IDs and its words', async () => {
    const base = await unitsStore();
    const hashes = new Set();
    for (const list of [undefined, also, [{ ...also[0], words: 'became M7.E2' }], [...also, { id: 'M5.E12', reason: 'dropped', words: 'parked' }]]) {
      hashes.add((await planUnits(base, { also: list })).inputHash);
    }
    expect(hashes.size).toBe(4);
  });

  it('does not move for a file that names no unit', async () => {
    const base = await unitsStore();
    const before = (await planUnits(base)).inputHash;
    put(base, '.planning/NOTES.md', '# notes\n');
    put(base, 'README.md', '# readme\n');
    expect((await planUnits(base)).inputHash).toBe(before);
  });
});

describe('planUnits — hostile input (NFR input)', () => {
  it('a milestone file that is a symbolic link is not read through', async () => {
    const base = await unitsStore();
    const outside = join(base, '..', 'outside.md');
    writeFileSync(outside, milestone7(['| `M7.E77` | **shipped** | from outside |']));
    rmSync(join(base, MILESTONE));
    symlinkSync(outside, join(base, MILESTONE));
    const plan = await planUnits(base);
    expect(Object.keys(byId(plan))).not.toContain('M7.E77');
    expect(byId(plan)['M7.E2']).toMatchObject({ proposal: 'open', row: null }); // its row is gone; the stub is not evidence
    expect(plan.notes.join('\n')).toMatch(/MILESTONE-7\.md is a symbolic link/);
  });

  it('a retrospective that is a symbolic link names its unit and is not read: it is not evidence', async () => {
    const base = await unitsStore();
    const outside = join(base, '..', 'retro.md');
    writeFileSync(outside, retro('M7.E5'));
    rmSync(join(base, '.planning/M7.E5-RETROSPECTIVE.md'));
    symlinkSync(outside, join(base, '.planning/M7.E5-RETROSPECTIVE.md'));
    const plan = await planUnits(base);
    expect(byId(plan)['M7.E5']).toMatchObject({ proposal: 'open', evidence: [], retro: 'link' });
    expect(byId(plan)['M7.E5'].against[0]).toMatch(/symbolic link and was not read/);
  });

  it('STATE.md as a symbolic link names no current unit', async () => {
    const base = await unitsStore();
    const outside = join(base, '..', 'state.md');
    writeFileSync(outside, stateText('M7.E1'));
    rmSync(join(base, '.planning/STATE.md'));
    symlinkSync(outside, join(base, '.planning/STATE.md'));
    const plan = await planUnits(base);
    expect(plan.current).toBeNull();
    expect(plan.notes.join('\n')).toMatch(/STATE\.md is a symbolic link/);
  });

  it('invisible characters and a 10 kB cell are cut and made printable in everything a person is shown', async () => {
    const base = await unitsStore();
    const hidden = '**shipped**\u200b \u202enow\u0007 \u{e0041}';
    put(base, MILESTONE, milestone7([`| \`M7.E1\` | ${hidden} | ${'n'.repeat(10_000)} |`, `| \`M7.E2\` | shipped ${'s'.repeat(10_000)} | x |`]));
    const plan = await planUnits(base);
    const text = unitsReportLines(plan).join('\n');
    expect(text).not.toMatch(INVISIBLE);
    expect(Math.max(...text.split('\n').map((l) => l.length))).toBeLessThan(1200);
    expect(byId(plan)['M7.E1'].evidence[0]).toBe('its milestone row says shipped (MILESTONE-7.md:7: “**shipped** now”)');
    expect(byId(plan)['M7.E2'].evidence[0].length).toBeLessThan(220);
    // The cells themselves are kept whole in the plan; the writer cuts them (t7.1).
    expect(byId(plan)['M7.E1'].row.cells[2]).toHaveLength(10_000);
  });

  it('the row rule reads the cell as it is shown: a hidden character cannot split "parked" out of sight', async () => {
    const base = await unitsStore();
    put(base, MILESTONE, milestone7(['| `M7.E1` | shipped (par\u200bked) | x |', '| `M7.E2` | ship\u200bped | x |']));
    put(base, '.planning/M7.E1-RETROSPECTIVE.md', '# M7.E1\n\n[FILL IN]\n');
    const u = byId(await planUnits(base));
    expect(u['M7.E1']).toMatchObject({ proposal: 'open', flag: 'row-unclear' });
    expect(u['M7.E2'].evidence).toEqual(['its milestone row says shipped (MILESTONE-7.md:8: “shipped”)']);
  });

  it('a row with escaped pipes keeps its cells; an escaped pipe in the status cell does not hide what follows it', async () => {
    const base = await unitsStore();
    put(base, MILESTONE, milestone7([
      '| `M7.E1` | **shipped** | a \\| b | c |',
      '| `M7.E2` | shipped \\| parked | x |',
    ]));
    const u = byId(await planUnits(base));
    expect(u['M7.E1'].row.cells).toEqual(['`M7.E1`', '**shipped**', 'a \\| b | c']);
    expect(u['M7.E2'].row.cells[1]).toBe('shipped \\| parked');
    expect(u['M7.E2']).toMatchObject({ proposal: 'open', flag: 'row-unclear' });
  });

  it('a hostile unit name never reaches a path: it is refused and shown cut', async () => {
    const base = await unitsStore();
    const long = 'x'.repeat(180);
    put(base, `.planning/${long}-RETROSPECTIVE.md`, retro('long'));
    put(base, '.planning/work/items/00/LEAF-1.json', serializeRecord({
      id: 'LEAF-1', type: 'FEAT', title: 't', events: [{ type: 'created', at: AT, by: 'c' }, { type: 'triaged', at: AT, by: 'c' }, { type: 'queued', at: AT, by: 'c', epic: 'M7.E3' }],
    }));
    const plan = await planUnits(base);
    const refused = plan.refused.find((u) => u.id.startsWith('xxxx'));
    expect(refused.id.length).toBeLessThanOrEqual(100);
    expect(refused.reason).toMatch(/is not a unit ID/);
    expect(unitImportList(plan, { confirmCloses: true, at: '2026-10-11' }).some((u) => u.id.startsWith('xxxx'))).toBe(false);
  });

  it('5,000 rows are planned, each once', async () => {
    const base = await unitsStore();
    put(base, MILESTONE, milestone7(Array.from({ length: 5000 }, (_, i) => `| \`M7.E${i + 100}\` | **shipped** — 2026-01-01 | row ${i} |`)));
    const plan = await planUnits(base);
    expect(plan.proposedCloses.filter((u) => /^M7\.E\d{3,4}$/.test(u.id))).toHaveLength(5000);
  });

  // Sixteen times the rows: linear ~16×, quadratic ~256×; the line at 64×, best
  // of five after a warm-up (the precedent: tests/work-migrate-propose.test.js,
  // SIG-293). No git and no store in the timed path.
  it('2,000 → 32,000 rows costs under 64× (linear ~16×, quadratic ~256×)', async () => {
    const base = await unitsStore({ store: false });
    const rows = (n) => milestone7(Array.from({ length: n }, (_, i) => `| \`M7.E${i + 100}\` | **shipped** — 2026-01-01 (not parked${'!'.repeat(i % 7)}) | row ${i} |`));
    const best = async (n) => {
      put(base, MILESTONE, rows(n));
      let min = Infinity;
      let plan;
      for (let i = 0; i < 5; i += 1) {
        const t0 = performance.now();
        plan = await planUnits(base, { storeKey: 'LEAF' });
        min = Math.min(min, performance.now() - t0);
      }
      return { ms: min, plan };
    };
    await best(2000);
    const small = await best(2000);
    const large = await best(32000);
    expect(large.plan.units.filter((u) => u.flag === 'row-unclear')).toHaveLength(32000);
    const ratio = large.ms / small.ms;
    console.log(`[NFR] planUnits, best of five: 2,000 rows in ${small.ms.toFixed(1)} ms, 32,000 in ${large.ms.toFixed(1)} ms — ${ratio.toFixed(1)}× for 16× the rows`);
    expect(ratio).toBeLessThan(64);
  }, 120_000);
});

describe('unitsReportLines — the plan as a person reads it', () => {
  it('lists every unit, then the proposed closes, the flagged, the refused and the declared', async () => {
    const plan = await planUnits(await unitsStore(), { also: [{ id: 'M5.E11', reason: 'dropped', words: 'became M7.E1' }] });
    const text = unitsReportLines(plan).join('\n');
    expect(text).toMatch(/^Unit records — one record per Epic or unit this project names \(15 named\):/);
    expect(text).toMatch(/\n {2}M7\.E9 {2}open {2}— the current unit/);
    expect(text).toMatch(/\n {2}M7\.E3 {2}open {2}— named by work items; nothing says it is over/);
    expect(text).toMatch(/\nProposed legacy closes \(5\) — confirm to record these units as closed; if you say no, each is created open/);
    expect(text).toMatch(/\nFlagged \(1\) — created open.*\n {2}M7\.E4 {2}— its milestone row says shipped and something else/);
    expect(text).toMatch(/\nRefused \(3\) — no record is created:\n {2}LEAF-7 /);
    expect(text).toMatch(/\nDeclared with --also \(1\) — created closed as dropped:\n {2}M5\.E11 {2}— “became M7\.E1”/);
    expect(text).toMatch(/MILESTONE-7\.md has no Epic-table markers, so it is left exactly as it is\..*by hand, after the apply\. This command never adds them\./);
  });

  it('says so when the milestone file already carries the markers', async () => {
    const text = unitsReportLines(await planUnits(await unitsStore({ markers: true }))).join('\n');
    expect(text).toMatch(/MILESTONE-7\.md carries the Epic-table markers: its Epic rows are written from the unit records by the apply\./);
  });
});
