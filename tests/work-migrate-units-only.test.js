// M6.E16 t7.3 — `/sig:docs-migrate --work-store` on a project that is already
// on the store and has no unit records: the units-only branch (AC9.1, AC9.2).
// See .planning/M6.E16-PLAN.md § S7 and VALIDATION rows AC9.1, AC9.2.
//
// The project is `tests/helpers/units-store-fixture.js`, in a temp folder.
// Every name is invented (AC9.3: nothing here points at a real project).

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { parseMigrateArgs } from '../plugin/tools/lib/migrate-memory.js';
import { checkUnits, getUnit, hasUnits, listUnits } from '../plugin/tools/lib/unit-records.js';
import { checkRecords } from '../plugin/tools/lib/work-records.js';
import { resolveClosures } from '../plugin/tools/lib/closure.js';
import {
  bytesOf, cleanupUnitsStores, commitAll, EPICS, git, MILESTONE, milestone7, put, read, retro, ROWS, stateText, UNITS, unitsStore,
} from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const AT = '2026-10-11';
const dryRun = (base, opts = {}) => runWorkStoreMigrate(base, { apply: false, ...opts });
const applyWith = (base, dry, opts = {}) => runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: AT, ...opts });
const tags = (base) => git(base, ['tag', '-l']).split('\n').filter(Boolean);
const staged = (base) => git(base, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean).sort();
const changed = (before, after) => [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
const UNIT_FILES = ['M5.E2', 'M5.E3', 'M6.E1', 'M7.E1', 'M7.E2', 'M7.E3', 'M7.E4', 'M7.E5', 'M7.E9', 'GATE-A', 'PHASE10-S4'];

describe('the dry run (AC9.1)', () => {
  it('lists each proposed unit and each proposed legacy close by name, and writes nothing', async () => {
    const base = await unitsStore({ repo: true });
    const before = bytesOf(base);
    const dry = await dryRun(base);
    expect(bytesOf(base)).toEqual(before);
    expect(git(base, ['status', '--porcelain'])).toBe('');
    expect(tags(base)).toEqual([]);
    expect(dry).toMatchObject({ applied: false, dryRun: true, unitsOnly: true, key: 'LEAF' });
    expect(dry.units.map((u) => u.id)).toEqual(['M5.E2', 'M5.E3', 'M6.E1', 'M7.E1', 'M7.E2', 'M7.E3', 'M7.E4', 'M7.E5', 'M7.E9', 'GATE-A', 'LEAF-7', 'Phase-11', 'phase-11', 'PHASE10-S4']);
    expect(dry.proposedUnitCloses.map((u) => u.id)).toEqual(['M5.E2', 'M6.E1', 'M7.E1', 'M7.E2', 'GATE-A']);
    expect(dry.inputHash).toMatch(/^units:[0-9a-f]{64}$/);
    expect(dry.report).toMatch(/^\/sig:docs-migrate --work-store — unit records, dry run \(nothing written\)/);
    expect(dry.report).toMatch(/already on the store \(key LEAF\) and has no unit records/);
    for (const id of ['M5.E2', 'M6.E1', 'M7.E1', 'M7.E2', 'GATE-A']) expect(dry.report).toMatch(new RegExp(`\\n {2}${id.replace('.', '\\.')} {2}proposed: closed \\(legacy\\)`));
    expect(dry.report).toMatch(/Proposed legacy closes \(5\)/);
    expect(dry.report).toMatch(/Refused \(3\) — no record is created/);
    expect(dry.report).toMatch(/--apply creates \.planning\/work\/units\/ with 11 unit records/);
    expect(dry.report).toMatch(/has no Epic-table markers, so it is left exactly as it is/);
  });

  it('shows the units declared with --also in the same list, and they are inside the hash', async () => {
    const base = await unitsStore({ repo: true });
    const plain = await dryRun(base);
    const also = [{ id: 'M5.E11', reason: 'dropped', words: 'became M7.E1' }];
    const dry = await dryRun(base, { also });
    expect(dry.inputHash).not.toBe(plain.inputHash);
    expect(dry.report).toMatch(/\n {2}M5\.E11 {2}closed \(dropped\) — declared {2}— declared with --also: “became M7\.E1”/);
    // An apply bound to the dry run without --also is refused when --also is added, and the other way round.
    for (const [hashOf, opts] of [[plain, { also }], [dry, {}]]) {
      const before = bytesOf(base);
      const r = await applyWith(base, hashOf, opts);
      expect(r.refused).toBe(true);
      expect(r.reason).toMatch(/changed since the dry run/);
      expect(bytesOf(base)).toEqual(before);
    }
  });

  it('a bad --also refuses the whole run, dry run or apply', async () => {
    const base = await unitsStore({ repo: true });
    const before = bytesOf(base);
    for (const apply of [false, true]) {
      const r = await runWorkStoreMigrate(base, { apply, expectedHash: 'x', also: [{ id: 'M7.E1', reason: 'dropped', words: 'x' }] });
      expect(r.refused).toBe(true);
      expect(r.reason).toMatch(/--also M7\.E1: this project already names M7\.E1/);
    }
    expect(bytesOf(base)).toEqual(before);
  });
});

describe('the apply (AC9.2)', () => {
  it('creates the records, changes nothing under items/ and no view but EPICS.md, stages and does not commit', async () => {
    const base = await unitsStore({ repo: true });
    const head = git(base, ['rev-parse', 'HEAD']).trim();
    const before = bytesOf(base);
    const dry = await dryRun(base);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r).toMatchObject({ applied: true, unitsOnly: true, key: 'LEAF', mode: 'git', tag: 'pre-work-store-units-T1', units: 11, unitClosesConfirmed: 5 });

    const after = bytesOf(base);
    // items/: every file byte-identical.
    const items = [...before.keys()].filter((k) => k.startsWith('.planning/work/items/'));
    expect(items.length).toBe(4);
    for (const k of items) expect(after.get(k), k).toBe(before.get(k));
    // Everything that changed: the new folder and the Epic index. No list, no milestone file, no STATE.md.
    expect(changed(before, after)).toEqual([EPICS, `${UNITS}/.keep`, ...UNIT_FILES.map((id) => `${UNITS}/${id}.json`)].sort());

    expect(git(base, ['rev-parse', 'HEAD']).trim()).toBe(head);
    expect(git(base, ['rev-parse', 'pre-work-store-units-T1']).trim()).toBe(head);
    expect(staged(base)).toEqual([EPICS, `${UNITS}/.keep`, ...UNIT_FILES.map((id) => `${UNITS}/${id}.json`)].sort());
    expect(r.revertLine).toBe('git reset --hard pre-work-store-units-T1   # discards the staged unit records');
    expect(r.report).toMatch(/Pre-apply tag: pre-work-store-units-T1/);
    expect(r.report).toMatch(/Undo: git reset --hard pre-work-store-units-T1/);
    expect(r.report).toMatch(/Staged, not committed/);

    expect(checkUnits(base)).toEqual([]);
    expect(checkRecords(base)).toEqual([]);
    expect(listUnits(base).units.map((u) => [u.id, u.status, u.close?.reason ?? null])).toEqual([
      ['GATE-A', 'closed', 'legacy'], ['M5.E2', 'closed', 'legacy'], ['M5.E3', 'open', null], ['M6.E1', 'closed', 'legacy'],
      ['M7.E1', 'closed', 'legacy'], ['M7.E2', 'closed', 'legacy'], ['M7.E3', 'open', null], ['M7.E4', 'open', null],
      ['M7.E5', 'open', null], ['M7.E9', 'open', null], ['PHASE10-S4', 'open', null],
    ]);
    const one = getUnit(base, 'M7.E1');
    expect(one.record.legacy_row).toEqual(['`M7.E1`', '**shipped** — `v1.2`, 2026-09-01 (PR #12)', 'Lantern index']);
    expect(one.close).toMatchObject({ reason: 'legacy', at: AT, by: 'migration' });
    expect(getUnit(base, 'M6.E1').record.legacy_row).toEqual(['**E1 — Old format**', '✅ shipped 2026-01-01', 'Notes with a \\| pipe, and `code`']);
    // The reset in the undo line puts the project back.
    git(base, ['reset', '--hard', '-q', r.tag]);
    expect(bytesOf(base)).toEqual(before);
  });

  it('without the yes every proposed close is created open, with a note; nothing is closed', async () => {
    const base = await unitsStore({ repo: true });
    const r = await applyWith(base, await dryRun(base));
    expect(r).toMatchObject({ applied: true, units: 11, unitClosesConfirmed: 0 });
    expect(listUnits(base).units.filter((u) => u.status !== 'open')).toEqual([]);
    expect(getUnit(base, 'M7.E1').record.migration_note).toMatch(/^It looked finished when unit records were added, and the close was not confirmed/);
    expect(r.report).toMatch(/5 proposed legacy closes were not confirmed: each unit was created open/);
    // Only a literal true confirms.
    const other = await unitsStore({ repo: true });
    await applyWith(other, await dryRun(other), { confirmUnitCloses: 'yes' });
    expect(listUnits(other).units.filter((u) => u.status !== 'open')).toEqual([]);
  });

  it('declared units are created closed as dropped, in the same apply', async () => {
    const base = await unitsStore({ repo: true });
    const also = [{ id: 'M5.E11', reason: 'dropped', words: 'became M7.E1' }, { id: 'M5.E12', reason: 'dropped', words: 'parked' }];
    const r = await applyWith(base, await dryRun(base, { also }), { also, confirmUnitCloses: true });
    expect(r.units).toBe(13);
    expect(getUnit(base, 'M5.E11').close).toEqual({ reason: 'dropped', at: AT, by: 'migration', words: 'became M7.E1' });
    expect(read(base, EPICS)).toMatch(/### M5\.E12 — closed 2026-10-11 \(dropped\) — parked/);
  });

  it('a milestone file that already carries the markers gets its Epic table; every byte outside them stays', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    const before = bytesOf(base);
    const dry = await dryRun(base);
    expect(dry.report).toMatch(/MILESTONE-7\.md carries the Epic-table markers/);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    const after = bytesOf(base);
    expect(changed(before, after).filter((k) => !k.startsWith(UNITS))).toEqual([MILESTONE, EPICS].sort());
    const text = read(base, MILESTONE);
    const outside = (t) => [t.slice(0, t.indexOf('<!-- signal:epics:begin -->')), t.slice(t.indexOf('<!-- signal:epics:end -->'))];
    expect(outside(text)).toEqual(outside(milestone7(Object.values(ROWS), { markers: true })));
    // A legacy unit prints its old row as written; an open one prints a row of its own.
    expect(text).toContain(ROWS['M7.E1']);
    expect(text).toContain('| `M7.E9` | **in flight** | The current one |');
    expect(staged(base)).toContain(MILESTONE);
    expect(checkRecords(base)).toEqual([]);
    expect(r.report).toMatch(/the Epic table in \.planning\/MILESTONE-7\.md/);
  });

  it('after the apply the closure check answers from the records', async () => {
    const base = await unitsStore({ repo: true });
    await applyWith(base, await dryRun(base), { confirmUnitCloses: true });
    const answers = Object.fromEntries((await resolveClosures(base)).units.map((u) => [u.unit, u.status]));
    expect(answers).toMatchObject({ 'M7.E1': 'closed', 'M7.E2': 'closed', 'M5.E2': 'closed', 'GATE-A': 'closed', 'M7.E9': 'open', 'M7.E4': 'open', 'PHASE10-S4': 'open' });
  });

  it('a store that names no unit still gets the folder, with its .keep', async () => {
    const base = await unitsStore({ repo: true });
    for (const rel of ['MILESTONE-6.md', 'MILESTONE-7.md', 'M7.E1-RETROSPECTIVE.md', 'M7.E2-RETROSPECTIVE.md', 'M7.E5-RETROSPECTIVE.md', 'M7.E9-PLAN.md',
      'GATE-A-PLAN.md', 'GATE-A-VERIFICATION.md', 'GATE-A-RETROSPECTIVE.md', 'PHASE10-S4-PLAN.md', 'phase-11-PLAN.md', 'LEAF-7-PLAN.md', 'archive',
      'work/items/00/LEAF-2.json', 'work/items/00/LEAF-2.md']) rmSync(join(base, '.planning', rel), { recursive: true });
    put(base, '.planning/STATE.md', stateText(null));
    const { regenerateViews } = await import('../plugin/tools/lib/work-views.js');
    await regenerateViews(base);
    commitAll(base);
    const r = await applyWith(base, await dryRun(base));
    expect(r).toMatchObject({ applied: true, units: 0 });
    expect(read(base, `${UNITS}/.keep`)).toBe('');
    expect(hasUnits(base)).toBe(true);
    expect(staged(base)).toContain(`${UNITS}/.keep`);
  });
});

// M6.E16 t10.4 — `WORK.md` is the person's file once it exists (the edit hook
// guards only its `schema_version` and `key` lines, and nothing regenerates
// it), so adding unit records does not rewrite it: the run prints the one line
// its folder list is missing, for the person to add.
describe('WORK.md is not rewritten; the run prints the line to add (t10.4)', () => {
  const WORK_MD = '.planning/work/WORK.md';
  const LINE = '- `units/` — one record per Epic or unit, `<ID>.json`. A unit\'s status is derived from its own events too: '
    + 'open, *closing*, closed — and a closed unit can be held';

  it('a WORK.md that does not name units/: the dry run and the apply print the line, and the file is not touched', async () => {
    const base = await unitsStore({ repo: true });
    const was = read(base, WORK_MD);
    expect(was).not.toContain('units/');
    const dry = await dryRun(base);
    expect(dry.report).toContain(`${WORK_MD} is yours to edit and is not changed. Its folder list does not name units/ — add this line by hand:\n  ${LINE}`);
    const r = await applyWith(base, dry);
    expect(r.applied).toBe(true);
    expect(r.report).toContain(`${WORK_MD} is yours to edit and was not changed. Its folder list does not name units/ — add this line by hand:\n  ${LINE}`);
    expect(read(base, WORK_MD)).toBe(was);
    expect(staged(base)).not.toContain(WORK_MD);
  });

  it('a WORK.md that already names units/: nothing is said about it', async () => {
    const base = await unitsStore({ repo: true });
    put(base, WORK_MD, `${read(base, WORK_MD)}\n${LINE}\n`);
    commitAll(base, 'the folder list names units/');
    const dry = await dryRun(base);
    expect(dry.report).not.toMatch(/add this line by hand/);
    const r = await applyWith(base, dry);
    expect(r.applied).toBe(true);
    expect(r.report).not.toMatch(/add this line by hand/);
  });

  it('the line is the one a new store\'s WORK.md is written with', async () => {
    const { WORK_MD_UNITS_LINE } = await import('../plugin/tools/lib/work-migrate-lists.js');
    expect(WORK_MD_UNITS_LINE).toBe(LINE);
  });
});

describe('refusals — nothing written, no tag', () => {
  // As `untouched`, for a project whose units folder is already there.
  const untouched2 = async (base, run, pattern) => {
    const before = bytesOf(base);
    const r = await run();
    expect(r.refused, JSON.stringify(r).slice(0, 300)).toBe(true);
    expect(r.reason).toMatch(pattern);
    expect(bytesOf(base)).toEqual(before);
    expect(tags(base)).toEqual([]);
  };
  const untouched = async (base, run, pattern) => {
    const before = bytesOf(base);
    const r = await run();
    expect(r.refused, JSON.stringify(r).slice(0, 300)).toBe(true);
    expect(r.reason).toMatch(pattern);
    expect(bytesOf(base)).toEqual(before);
    expect(tags(base)).toEqual([]);
    expect(existsSync(join(base, UNITS))).toBe(false);
    return r;
  };

  it('an apply with no hash, and with a stale one', async () => {
    const base = await unitsStore({ repo: true });
    await untouched(base, () => runWorkStoreMigrate(base, { apply: true }), /needs the dry run's inputHash/);
    const dry = await dryRun(base);
    put(base, '.planning/M7.E5-RETROSPECTIVE.md', retro('M7.E5'));
    commitAll(base);
    await untouched(base, () => applyWith(base, dry, { confirmUnitCloses: true }), /changed since the dry run.*Nothing was written/s);
  });

  it('a change that lands while the apply waits for the lock is seen under it', async () => {
    const base = await unitsStore({ repo: true });
    const dry = await dryRun(base);
    // The first look passes; the retrospective is filled in before the look under the lock.
    const onSwapStep = (step) => {
      if (step === 'units-gate') put(base, '.planning/M7.E5-RETROSPECTIVE.md', retro('M7.E5'));
    };
    const r = await applyWith(base, dry, { confirmUnitCloses: true, onSwapStep });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(existsSync(join(base, UNITS))).toBe(false);
    expect(tags(base)).toEqual([]);
  });

  it('a dirty tree, without --force', async () => {
    const base = await unitsStore({ repo: true });
    const dry = await dryRun(base);
    put(base, 'notes.txt', 'uncommitted\n');
    const before = bytesOf(base);
    const r = await applyWith(base, dry);
    expect(r.refused).toBe(true);
    expect(bytesOf(base)).toEqual(before);
    expect(tags(base)).toEqual([]);
  });

  // Changed at REVIEW pass 1 (r1.5, C-I5, `D-M6E16-23`): both cases below
  // pinned a refusal, "unit records are already on". With the folder there the
  // run now adds records for the units that have none
  // (tests/work-migrate-units-add.test.js); what is pinned here is that a
  // second run writes nothing when there is nothing to add.
  it('applying twice: the first dry run\'s hash is stale, and a fresh run has nothing to add — nothing is written', async () => {
    const base = await unitsStore({ repo: true });
    const dry = await dryRun(base);
    await applyWith(base, dry, { confirmUnitCloses: true });
    commitAll(base, 'unit records');
    const before = bytesOf(base);
    const stale = await applyWith(base, dry, { confirmUnitCloses: true, stamp: 'T2' });
    expect(stale.refused).toBe(true);
    expect(stale.reason).toMatch(/changed since the dry run.*Nothing was written/s);
    const again = await dryRun(base);
    expect(again).toMatchObject({ applied: false, dryRun: true, nothingToAdd: true });
    const second = await applyWith(base, again, { confirmUnitCloses: true, stamp: 'T2' });
    expect(second.refused).toBe(true);
    expect(second.reason).toMatch(/has unit records, and there is nothing to add.*Nothing was written/s);
    expect(bytesOf(base)).toEqual(before);
    expect(tags(base)).toEqual(['pre-work-store-units-T1']);
  });

  it('an empty units folder made by hand: refused until the Epic index is regenerated, then every unit is proposed', async () => {
    const base = await unitsStore({ repo: true });
    put(base, `${UNITS}/.keep`, '');
    commitAll(base);
    // The folder turns unit records on, and work/EPICS.md was rendered without them: the store does not check clean.
    await untouched2(base, () => dryRun(base), /already on the store.*does not check clean.*EPICS\.md/s);
    const { regenerateViews } = await import('../plugin/tools/lib/work-views.js');
    await regenerateViews(base);
    commitAll(base, 'views');
    const r = await dryRun(base);
    expect(r.refused).toBeUndefined();
    // All but the two a milestone row alone names: with unit records on, no milestone row is read (AC7.3).
    const rowOnly = ['M6.E1', 'M7.E4'];
    expect(r.units.filter((u) => u.proposal !== 'refused').map((u) => u.id).sort()).toEqual(UNIT_FILES.filter((id) => !rowOnly.includes(id)).sort());
    expect(r.report).toMatch(/has unit records.*0 units already have a record/s);
    expect(r.report).toMatch(/A unit named only by a row of a milestone table is not listed/);
  });

  it('units/ already there as a symbolic link', async () => {
    const base = await unitsStore({ repo: true });
    const outside = mkdtempSync(join(tmpdir(), 'sig-units-outside-'));
    try {
      symlinkSync(outside, join(base, UNITS));
      for (const apply of [false, true]) {
        const r = await runWorkStoreMigrate(base, { apply, expectedHash: 'units:x', force: true });
        expect(r.refused).toBe(true);
        expect(r.reason).toMatch(/already on the store.*symbolic link/s);
      }
      expect(bytesOf(outside)).toEqual(new Map());
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('a store whose views are stale, or that has a broken record: fix it first', async () => {
    const base = await unitsStore({ repo: true });
    writeFileSync(join(base, '.planning/BUGS.md'), `${read(base, '.planning/BUGS.md')}\nedited by hand\n`);
    commitAll(base);
    await untouched(base, () => dryRun(base), /already on the store.*does not check clean.*BUGS\.md/s);
    const other = await unitsStore({ repo: true });
    put(other, '.planning/work/items/00/LEAF-3.json', '{ not json');
    commitAll(other);
    await untouched(other, () => dryRun(other), /already on the store.*does not check clean.*LEAF-3/s);
  });

  it('a WORK.md with no items/ folder keeps the refusal it had', async () => {
    const base = await unitsStore({ repo: true, store: false });
    put(base, '.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
    commitAll(base);
    await untouched(base, () => dryRun(base), /already on the store: \.planning\/work\/WORK\.md exists, so nothing was written\. It has no \.planning\/work\/items\//);
  });

  it('a v1 store, and a WORK.md that does not read', async () => {
    const base = await unitsStore({ repo: true });
    put(base, '.planning/work/WORK.md', '---\nkey: LEAF\n---\n');
    commitAll(base);
    await untouched(base, () => dryRun(base), /already on the store/);
    put(base, '.planning/work/WORK.md', 'hello\n');
    commitAll(base);
    await untouched(base, () => dryRun(base), /already on the store.*does not read/s);
  });

  it('Epic-table markers that are broken', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, `${milestone7()}\n<!-- signal:epics:begin -->\n`);
    commitAll(base);
    await untouched(base, () => dryRun(base), /MILESTONE-7\.md.*markers are broken/s);
  });

  it('sensitive text in a row stops the apply until it is acknowledged', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, milestone7([`| \`M7.E1\` | **shipped** | token ghp_abcdefghijklmnopqrstuvwxyz0123456789 |`]));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.sensitiveHits).toEqual([{ id: 'M7.E1', file: 'unit', type: 'github-token', match: 'ghp_ab…' }]);
    expect(dry.report).toMatch(/Sensitive data found/);
    const before = bytesOf(base);
    const stop = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(stop).toMatchObject({ applied: false, aborted: 'sensitive-data-pending' });
    expect(bytesOf(base)).toEqual(before);
    expect((await applyWith(base, dry, { confirmUnitCloses: true, acknowledgeSensitive: true })).applied).toBe(true);
  });
});

describe('a failure part-way puts everything back', () => {
  it('the check after the write fails → no units/, no tag, every file as it was', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    const before = bytesOf(base);
    const dry = await dryRun(base);
    let seen = 0;
    const onSwapStep = (step) => {
      if (step !== 'units-verify') return;
      seen = listUnits(base).units.length; // the records and the views were written
      throw new Error('injected');
    };
    await expect(applyWith(base, dry, { confirmUnitCloses: true, onSwapStep })).rejects.toThrow(/nothing was imported — injected/);
    expect(seen).toBe(11);
    expect(bytesOf(base)).toEqual(before);
    expect(existsSync(join(base, UNITS))).toBe(false);
    expect(tags(base)).toEqual([]);
    expect(git(base, ['status', '--porcelain'])).toBe('');
    // And it can be run again.
    expect((await applyWith(base, dry, { confirmUnitCloses: true })).applied).toBe(true);
  });

  it('a record the check finds wrong after the write is a failure, not a pass', async () => {
    const base = await unitsStore({ repo: true });
    const before = bytesOf(base);
    const dry = await dryRun(base);
    const onSwapStep = (step) => {
      if (step === 'units-verify') writeFileSync(join(base, UNITS, 'M7.E1.json'), '{ not json');
    };
    await expect(applyWith(base, dry, { confirmUnitCloses: true, onSwapStep })).rejects.toThrow(/did not verify/);
    expect(bytesOf(base)).toEqual(before);
    expect(tags(base)).toEqual([]);
  });

  it('another writer holding the store\'s lock → LOCKED, nothing written, no tag', async () => {
    const base = await unitsStore({ repo: true });
    const { acquireLock } = await import('../plugin/tools/lib/file-lock.js');
    const { WORK_LOCK_REL } = await import('../plugin/tools/lib/work-store.js');
    const dry = await dryRun(base);
    const before = bytesOf(base);
    const held = await acquireLock(join(base, WORK_LOCK_REL), { label: 'someone else' });
    try {
      // --force: the held lock file itself makes the tree dirty.
      await expect(applyWith(base, dry, { force: true })).rejects.toMatchObject({ code: 'LOCKED' });
    } finally {
      await held.released();
    }
    expect(bytesOf(base)).toEqual(before);
    expect(tags(base)).toEqual([]);
  });
});

describe('outside git, and with --force', () => {
  it('not a repository: applies, stages nothing, and says how to undo', async () => {
    const base = await unitsStore();
    const r = await applyWith(base, await dryRun(base), { confirmUnitCloses: true });
    expect(r).toMatchObject({ applied: true, mode: 'fs-backup', tag: null, units: 11 });
    expect(r.revertLine).toMatch(/rm -rf -- \.planning\/work\/units/);
    expect(r.report).toMatch(/Not a git checkout: nothing staged/);
  });

  it('--force on a dirty tree: the undo line resets only this run\'s paths', async () => {
    const base = await unitsStore({ repo: true });
    const dry = await dryRun(base);
    put(base, 'notes.txt', 'uncommitted\n');
    const r = await applyWith(base, dry, { force: true });
    expect(r.applied).toBe(true);
    expect(r.revertLine).toMatch(/do NOT 'git reset --hard'/);
    expect(r.revertLine).toMatch(/git reset -q -- \.planning\/work\/units \.planning\/work\/EPICS\.md && rm -rf -- \.planning\/work\/units && git checkout -- \.planning\/work\/EPICS\.md/);
    expect(readFileSync(join(base, 'notes.txt'), 'utf-8')).toBe('uncommitted\n');
  });
});

describe('--also on the command line', () => {
  it('parses <ID>:dropped:<words>, repeatable, words kept whole', () => {
    expect(parseMigrateArgs(['--work-store', '--also', 'M5.E11:dropped:became M6.E7: see the retro', '--also', 'M5.E12:dropped:parked', '--apply']))
      .toEqual({ apply: true, force: false, workStore: true, also: [
        { id: 'M5.E11', reason: 'dropped', words: 'became M6.E7: see the retro' },
        { id: 'M5.E12', reason: 'dropped', words: 'parked' },
      ] });
  });

  it('a value with a part missing is passed on as it is, for the run to refuse', async () => {
    expect(parseMigrateArgs(['--work-store', '--also', 'M5.E11'])).toEqual({ apply: false, force: false, workStore: true, also: [{ id: 'M5.E11', reason: undefined, words: undefined }] });
    expect(parseMigrateArgs(['--work-store', '--also'])).toEqual({ apply: false, force: false, workStore: true, also: [{ id: undefined, reason: undefined, words: undefined }] });
    expect(parseMigrateArgs(['--work-store'])).toEqual({ apply: false, force: false, workStore: true });
    const base = await unitsStore({ repo: true });
    const r = await dryRun(base, { also: parseMigrateArgs(['--also', 'M5.E11']).also });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/only "dropped" can be declared/);
  });
});

// ── t7.5 — hostile input, end to end (NFR input) ────────────────────────────

describe('hostile text and names, through the command (t7.5)', () => {
  it('invisible characters and a 10 kB cell: the confirm text is printable and cut; the record keeps the cell, cut at its limit', async () => {
    const base = await unitsStore({ repo: true });
    const hidden = '**shipped**​ ‮now\u0007 \u{e0041}';
    put(base, MILESTONE, milestone7([`| \`M7.E1\` | ${hidden} | ${'n'.repeat(10_000)} |`, ROWS['M7.E9']]));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.report).not.toMatch(/[​‮\u0007]|\u{e0041}/u);
    expect(Math.max(...dry.report.split('\n').map((l) => l.length))).toBeLessThan(1200);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r.report).not.toMatch(/[​‮\u0007]|\u{e0041}/u);
    const row = getUnit(base, 'M7.E1').record.legacy_row;
    expect(row[1]).toBe('**shipped** now ');
    expect(row[2]).toHaveLength(8000);
    expect(readFileSync(join(base, UNITS, 'M7.E1.json'), 'utf-8')).not.toMatch(/[​‮\u0007]|\u{e0041}/u);
  });

  it('no unit name reaches a git argument, in the dry run or the apply', async () => {
    const base = await unitsStore({ repo: true });
    const { execFileSync } = await import('node:child_process');
    const seen = [];
    const execFn = (cmd, args, o) => {
      seen.push([cmd, ...args].join(' '));
      return execFileSync(cmd, args, o);
    };
    const also = [{ id: 'M5.E11', reason: 'dropped', words: 'became M7.E1' }];
    const dry = await dryRun(base, { execFn, also });
    const r = await applyWith(base, dry, { execFn, also, confirmUnitCloses: true });
    expect(r.applied).toBe(true);
    expect(seen.length).toBeGreaterThan(3);
    for (const id of [...dry.units.map((u) => u.id), 'M5.E11']) {
      expect(seen.filter((line) => line.includes(id)), id).toEqual([]);
    }
    // What is staged is the folder and the views, by fixed paths.
    expect(seen).toContain(`git add -- ${UNITS} ${EPICS}`);
  });

  it('5,000 rows: a dry run lists them all, and the apply writes them all', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, milestone7(Array.from({ length: 5000 }, (_, i) => `| \`M7.E${i + 100}\` | **shipped** — 2026-01-01 | row ${i} |`)));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.proposedUnitCloses.filter((u) => /^M7\.E\d{3,4}$/.test(u.id))).toHaveLength(5000);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r.units).toBeGreaterThan(5000);
    expect(listUnits(base).units.filter((u) => u.close?.reason === 'legacy').length).toBeGreaterThanOrEqual(5000);
    expect(checkUnits(base)).toEqual([]);
  }, 120_000);
});

// ── The command file says what the library does ─────────────────────────────

describe('docs-migrate.md — the --work-store section covers units', () => {
  const doc = readFileSync(new URL('../plugin/commands/docs-migrate.md', import.meta.url), 'utf-8');

  it('names both ways in, the --also flag, and the one-yes rule', () => {
    expect(doc).toMatch(/^args: .*--also ID:dropped:WORDS/m);
    expect(doc).toMatch(/### Unit records \(`M6\.E16`\)/);
    expect(doc).toMatch(/A project already on the store with no `work\/units\/`.*adds the unit records and\s+changes nothing else/s);
    // Changed at REVIEW pass 1 (r1.5): the file said such a store is refused.
    expect(doc).toMatch(/A store that already has\s+`work\/units\/`\*\* gets the same run, narrowed.*a record for each unit the project names\s+that has \*\*none\*\*/s);
    expect(doc).not.toMatch(/unit records are already on/);
    expect(doc).toMatch(/`--also <ID>:dropped:<words>`/);
    expect(doc).toMatch(/one list,\s+confirmed by one yes/);
    expect(doc).toMatch(/milestone file is never given markers by this command/);
  });

  it('the flow passes the options the library reads, and asks one question per list', () => {
    expect(doc).toMatch(/runWorkStoreMigrate\(baseDir, \{apply: false, key, also\}\)/);
    expect(doc).toMatch(/runWorkStoreMigrate\(baseDir, \{apply: true, force, key: dry\.key, also, expectedHash: dry\.inputHash, confirmCloses, confirmUnitCloses, acknowledgeSensitive\}\)/);
    expect(doc).toMatch(/second, separate yes\/no/);
    expect(doc).toMatch(/dry\.proposedUnitCloses/);
    expect(doc).toMatch(/dry\.unitsOnly/);
  });

  it('every result field the file names is one the library returns', async () => {
    const base = await unitsStore({ repo: true });
    const dry = await dryRun(base);
    for (const k of ['unitsOnly', 'units', 'proposedUnitCloses', 'sensitiveHits', 'inputHash', 'report']) expect(dry, k).toHaveProperty(k);
    const r = await applyWith(base, dry);
    for (const k of ['unitsOnly', 'tag', 'revertLine', 'units', 'unitClosesConfirmed', 'report']) expect(r, k).toHaveProperty(k);
  });
});
