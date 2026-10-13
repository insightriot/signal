// M6.E16 t7.4 — a first-time `/sig:docs-migrate --work-store` also proposes
// unit records, in the same dry run, and creates `work/units/` in the same
// apply (AC9.1; `D-M6E16-16`: the folder is created even when it is empty).
// See .planning/M6.E16-PLAN.md § S7.
//
// The project is `tests/helpers/units-store-fixture.js` with no store, in a
// temp folder. Every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync, symlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { checkUnits, getUnit, hasUnits, listUnits } from '../plugin/tools/lib/unit-records.js';
import { checkRecords, getRecord } from '../plugin/tools/lib/work-records.js';
import { deriveStatus } from '../plugin/tools/lib/work-record.js';
import {
  bytesOf, cleanupUnitsStores, commitAll, EPICS, git, MILESTONE, milestone7, put, read, retro, ROWS, stateText, UNITS, unitsStore,
} from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const AT = '2026-10-11';
const BUGS = [
  '# Bugs', '',
  '| ID | Status | Pri | What |', '|---|---|---|---|',
  '| B1 | fixed | P2 | Header lost — shipped with M7.E1. |',
  '| B2 | fixed | P2 | Footer lost — shipped with M7.E5. |',
  '| B3 | open | P2 | Margin wrong. |',
  '',
].join('\n');

// The fixture with no store, a BUGS.md, everything committed.
async function project(opts = {}) {
  const base = await unitsStore({ repo: false, store: false, ...opts });
  put(base, '.planning/BUGS.md', BUGS);
  git(base, ['init', '-q', '-b', 'main']);
  git(base, ['config', 'user.email', 't@t.co']);
  git(base, ['config', 'user.name', 'T']);
  git(base, ['config', 'commit.gpgsign', 'false']);
  git(base, ['config', 'tag.gpgsign', 'false']);
  commitAll(base);
  return base;
}
const dryRun = (base, opts = {}) => runWorkStoreMigrate(base, { apply: false, key: 'LEAF', ...opts });
const applyWith = (base, dry, opts = {}) => runWorkStoreMigrate(base, { apply: true, key: 'LEAF', expectedHash: dry.inputHash, stamp: 'T1', at: AT, ...opts });
const tags = (base) => git(base, ['tag', '-l']).split('\n').filter(Boolean);
const staged = (base) => git(base, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
const UNIT_IDS = ['M5.E2', 'M5.E3', 'M6.E1', 'M7.E1', 'M7.E2', 'M7.E4', 'M7.E5', 'M7.E9', 'GATE-A', 'PHASE10-S4'];

describe('the dry run shows both lists (AC9.1)', () => {
  it('the items, their proposed closes, then every unit and the proposed legacy closes — and writes nothing', async () => {
    const base = await project();
    const before = bytesOf(base);
    const dry = await dryRun(base);
    expect(bytesOf(base)).toEqual(before);
    expect(dry.refused).toBeUndefined();
    expect(dry.unitsOnly).toBeUndefined();
    expect(dry.proposedCloses.map((c) => c.legacyId)).toEqual(['B1', 'B2']);
    expect(dry.units.map((u) => u.id)).toEqual(['M5.E2', 'M5.E3', 'M6.E1', 'M7.E1', 'M7.E2', 'M7.E4', 'M7.E5', 'M7.E9', 'GATE-A', 'LEAF-7', 'Phase-11', 'phase-11', 'PHASE10-S4']);
    expect(dry.proposedUnitCloses.map((u) => u.id)).toEqual(['M5.E2', 'M6.E1', 'M7.E1', 'M7.E2', 'GATE-A']);
    expect(dry.report).toMatch(/Proposed closes \(2\)/);
    expect(dry.report).toMatch(/Unit records — one record per Epic or unit this project names \(13 named\):/);
    expect(dry.report).toMatch(/Proposed legacy closes \(5\)/);
    expect(dry.report).toMatch(/creates \.planning\/work\/units\/ with 10 unit records/);
    // The key the run will use decides what is item-shaped.
    expect(dry.units.find((u) => u.id === 'LEAF-7').reason).toMatch(/item IDs \(LEAF-n\)/);
    expect((await dryRun(base, { key: 'TIDE' })).units.find((u) => u.id === 'LEAF-7').proposal).toBe('open');
  });

  // D-M6E16-15 is about a project that HAS unit records. On this path it has
  // none yet, so an item's close is still checked against a retrospective.
  it('an item close is still proposed on an Epic with a retrospective — the stub one too, as before', async () => {
    const dry = await dryRun(await project());
    expect(dry.report).toMatch(/retrospectives\): an entry is proposed for closing/);
    expect(dry.proposedCloses[0].evidence.join('; ')).toMatch(/M7\.E1 → \.planning\/M7\.E1-RETROSPECTIVE\.md/);
    // B2 cites M7.E5, whose retrospective is a stub: the item rule (M6.E15)
    // counts a retrospective that exists, filled in or not. Unchanged here, and
    // pinned so that changing it is a decision. The UNIT M7.E5 is not proposed.
    expect(dry.proposedCloses[1].evidence.join('; ')).toMatch(/M7\.E5 → \.planning\/M7\.E5-RETROSPECTIVE\.md/);
    expect(dry.proposedUnitCloses.map((u) => u.id)).not.toContain('M7.E5');
  });
});

describe('the apply creates the store and the unit records together', () => {
  it('writes work/units/ beside items/, in the same apply, staged and not committed', async () => {
    const base = await project();
    const head = git(base, ['rev-parse', 'HEAD']).trim();
    const dry = await dryRun(base);
    const r = await applyWith(base, dry, { confirmCloses: true, confirmUnitCloses: true });
    expect(r).toMatchObject({ applied: true, key: 'LEAF', records: 3, closesConfirmed: 2, units: 10, unitClosesConfirmed: 5, tag: 'pre-work-store-T1' });
    expect(git(base, ['rev-parse', 'HEAD']).trim()).toBe(head);
    expect(hasUnits(base)).toBe(true);
    expect(read(base, `${UNITS}/.keep`)).toBe('');
    expect(listUnits(base).units.map((u) => u.id).sort()).toEqual([...UNIT_IDS].sort());
    expect(getUnit(base, 'M7.E1')).toMatchObject({ status: 'closed', close: { reason: 'legacy', at: AT } });
    expect(getUnit(base, 'M7.E1').record.legacy_row).toEqual(['`M7.E1`', '**shipped** — `v1.2`, 2026-09-01 (PR #12)', 'Lantern index']);
    expect(getUnit(base, 'M7.E9').status).toBe('open');
    expect(deriveStatus(getRecord(base, 'LEAF-1').record)).toBe('C');
    expect(checkUnits(base)).toEqual([]);
    expect(checkRecords(base)).toEqual([]);
    expect(read(base, EPICS)).toMatch(/### M7\.E9 — open/);
    expect(read(base, EPICS)).toMatch(/### M7\.E1 — closed \(legacy\) — old row: \*\*shipped\*\* — `v1\.2`, 2026-09-01 \(PR #12\)$/m);
    for (const id of UNIT_IDS) expect(staged(base)).toContain(`${UNITS}/${id}.json`);
    expect(staged(base)).toContain(`${UNITS}/.keep`);
    expect(r.revertLine).toBe('git reset --hard pre-work-store-T1   # discards the staged work-store changes');
    expect(r.report).toMatch(/Wrote 10 unit records under \.planning\/work\/units\//);
    expect(r.report).toMatch(/Recorded 5 proposed legacy closes as closed, as confirmed/);
    // The milestone files are not touched: the migration never adds markers.
    expect(read(base, MILESTONE)).toBe(milestone7());
    // And the project is now one already on the store, with unit records: a
    // second run has nothing to add. (Changed at REVIEW pass 1, r1.5: it used
    // to be refused — "unit records are already on".)
    commitAll(base, 'the store');
    const again = await dryRun(base);
    expect(again).toMatchObject({ applied: false, dryRun: true, unitsOnly: true, nothingToAdd: true });
    expect(again.report).toMatch(/has unit records.*there is nothing to add/s);
  }, 60_000);

  it('two answers: the item closes and the unit closes are confirmed separately', async () => {
    const one = await project();
    const a = await applyWith(one, await dryRun(one), { confirmCloses: true });
    expect(a).toMatchObject({ closesConfirmed: 2, unitClosesConfirmed: 0 });
    expect(listUnits(one).units.filter((u) => u.status === 'closed')).toEqual([]);
    expect(getUnit(one, 'M7.E1').record.migration_note).toMatch(/^It looked finished/);
    expect(a.report).toMatch(/5 proposed legacy closes were not confirmed: each unit was created open/);

    const two = await project();
    const b = await applyWith(two, await dryRun(two), { confirmUnitCloses: true });
    expect(b).toMatchObject({ closesConfirmed: 0, unitClosesConfirmed: 5 });
    expect(deriveStatus(getRecord(two, 'LEAF-1').record)).toBe('T');
    expect(listUnits(two).units.filter((u) => u.status === 'closed')).toHaveLength(5);
  }, 60_000);

  it('a project that names no unit still gets the folder, with its .keep (D-M6E16-16)', async () => {
    const base = await project();
    for (const rel of ['MILESTONE-6.md', 'MILESTONE-7.md', 'M7.E1-RETROSPECTIVE.md', 'M7.E2-RETROSPECTIVE.md', 'M7.E5-RETROSPECTIVE.md', 'M7.E9-PLAN.md',
      'GATE-A-PLAN.md', 'GATE-A-VERIFICATION.md', 'GATE-A-RETROSPECTIVE.md', 'PHASE10-S4-PLAN.md', 'phase-11-PLAN.md', 'LEAF-7-PLAN.md', 'archive']) {
      rmSync(join(base, '.planning', rel), { recursive: true });
    }
    put(base, '.planning/STATE.md', stateText(null));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.units).toEqual([]);
    const r = await applyWith(base, dry);
    expect(r).toMatchObject({ applied: true, units: 0 });
    expect(read(base, `${UNITS}/.keep`)).toBe('');
    expect(hasUnits(base)).toBe(true);
    expect(staged(base)).toContain(`${UNITS}/.keep`);
    expect(read(base, EPICS)).toMatch(/_no Epics_/);
  });

  it('declared units come through --also here too', async () => {
    const base = await project();
    const also = [{ id: 'M5.E11', reason: 'dropped', words: 'became M7.E1' }];
    const r = await applyWith(base, await dryRun(base, { also }), { also });
    expect(r.units).toBe(11);
    expect(getUnit(base, 'M5.E11').close).toMatchObject({ reason: 'dropped', words: 'became M7.E1' });
  });
});

describe('the units are inside the same hash', () => {
  it('a retrospective filled in after the dry run refuses the apply, nothing written', async () => {
    const base = await project();
    const dry = await dryRun(base);
    put(base, '.planning/M7.E5-RETROSPECTIVE.md', retro('M7.E5'));
    commitAll(base);
    const before = bytesOf(base);
    const r = await applyWith(base, dry, { confirmCloses: true, confirmUnitCloses: true });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/What the dry run showed changed since the dry run/);
    expect(bytesOf(base)).toEqual(before);
    expect(tags(base)).toEqual([]);
  });

  it('a milestone row edited after the dry run refuses the apply; so does adding --also', async () => {
    const base = await project();
    const dry = await dryRun(base);
    const withAlso = await applyWith(base, dry, { also: [{ id: 'M5.E11', reason: 'dropped', words: 'x' }] });
    expect(withAlso.refused).toBe(true);
    put(base, MILESTONE, milestone7([ROWS['M7.E1'], ROWS['M7.E2'], ROWS['M7.E4'], ROWS['M7.E9'].replace('PLAN done', 'EXECUTE')]));
    commitAll(base);
    const r = await applyWith(base, dry);
    expect(r.refused).toBe(true);
    expect(existsSync(join(base, '.planning/work'))).toBe(false);
  });
});

describe('refusals and failures', () => {
  it('a bad --also refuses the run', async () => {
    const base = await project();
    const r = await dryRun(base, { also: [{ id: 'GATE-A', reason: 'dropped', words: 'x' }] });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/--also GATE-A: this project already names GATE-A/);
  });

  it('work/units/ already there — a folder, or a symbolic link — is never written over', async () => {
    const base = await project();
    put(base, `${UNITS}/.keep`, '');
    commitAll(base);
    const r = await dryRun(base);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/\.planning\/work\/units already exists; this run never overwrites one/);

    const other = await project();
    const outside = mkdtempSync(join(tmpdir(), 'sig-units-outside-'));
    try {
      put(other, '.planning/work/x', '');
      rmSync(join(other, '.planning/work/x'));
      symlinkSync(outside, join(other, UNITS));
      const linked = await dryRun(other);
      expect(linked.refused).toBe(true);
      expect(bytesOf(outside)).toEqual(new Map());
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('a milestone file that already carries the Epic-table markers is refused, with what to do', async () => {
    const base = await project({ markers: true });
    const before = bytesOf(base);
    const r = await dryRun(base);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/MILESTONE-7\.md already carries the Epic-table markers.*Take the two marker lines out.*Nothing was written/s);
    expect(bytesOf(base)).toEqual(before);
  });

  it.each(['units', 'views', 'verify', 'index'])('a failure at the %s step puts everything back: no work/, no units/, no tag', async (at) => {
    const base = await project();
    const before = bytesOf(base);
    const dry = await dryRun(base);
    const onSwapStep = (step) => {
      if (step === at) throw new Error(`injected at ${step}`);
    };
    await expect(applyWith(base, dry, { confirmCloses: true, confirmUnitCloses: true, onSwapStep })).rejects.toThrow(`injected at ${at}`);
    expect(bytesOf(base)).toEqual(before);
    expect(existsSync(join(base, '.planning/work'))).toBe(false);
    expect(tags(base)).toEqual([]);
    expect(git(base, ['status', '--porcelain'])).toBe('');
  });

  it('sensitive text in a milestone row is listed with the lists\' own and stops the apply', async () => {
    const base = await project();
    put(base, MILESTONE, milestone7([`| \`M7.E1\` | **shipped** | token ghp_abcdefghijklmnopqrstuvwxyz0123456789 |`]));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.sensitiveHits).toContainEqual({ id: 'M7.E1', file: 'unit', type: 'github-token', match: 'ghp_ab…' });
    const before = bytesOf(base);
    expect(await applyWith(base, dry)).toMatchObject({ applied: false, aborted: 'sensitive-data-pending' });
    expect(bytesOf(base)).toEqual(before);
    expect((await applyWith(base, dry, { acknowledgeSensitive: true })).applied).toBe(true);
  });

  // REVIEW pass 1, S-M3: the scan read the raw cell and the writer stored the
  // cleaned one, so a key split by an invisible character passed and was stored whole.
  it('a key hidden by a zero-width space in a row is found: the scan reads the text that will be stored', async () => {
    const base = await project();
    const hidden = `AKIA${String.fromCharCode(0x200b)}IOSFODNN7EXAMPLE`;
    put(base, MILESTONE, milestone7([`| \`M7.E1\` | **shipped** | key ${hidden} |`]));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.sensitiveHits).toContainEqual({ id: 'M7.E1', file: 'unit', type: 'aws-key', match: 'AKIAIO…' });
    expect(dry.report).toMatch(/Sensitive data found/);
    const before = bytesOf(base);
    expect(await applyWith(base, dry, { confirmCloses: true, confirmUnitCloses: true })).toMatchObject({ applied: false, aborted: 'sensitive-data-pending' });
    expect(bytesOf(base)).toEqual(before);
    expect((await applyWith(base, dry, { confirmCloses: true, confirmUnitCloses: true, acknowledgeSensitive: true })).applied).toBe(true);
    // What was acknowledged is what is on disk: the key, without the invisible character.
    expect(getUnit(base, 'M7.E1').record.legacy_row[2]).toBe('key AKIAIOSFODNN7EXAMPLE');
  });

  // REVIEW pass 2, T2-I1: the case above hides the key in the first 400 characters, where the
  // unit's summary carried it to the scan whichever text was read. Here it sits after 500.
  it('a key hidden by a zero-width space after 500 characters of a row is found, and stored without the invisible character', async () => {
    const base = await project();
    const filler = 'word '.repeat(100);
    const hidden = `AKIA${String.fromCharCode(0x200b)}IOSFODNN7EXAMPLE`;
    put(base, MILESTONE, milestone7([`| \`M7.E1\` | **shipped** | ${filler}${hidden} |`]));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.sensitiveHits).not.toEqual([]);
    expect(dry.sensitiveHits).toContainEqual({ id: 'M7.E1', file: 'unit', type: 'aws-key', match: 'AKIAIO…' });
    const before = bytesOf(base);
    expect(await applyWith(base, dry, { confirmCloses: true, confirmUnitCloses: true })).toMatchObject({ applied: false, aborted: 'sensitive-data-pending' });
    expect(bytesOf(base)).toEqual(before);
    expect((await applyWith(base, dry, { confirmCloses: true, confirmUnitCloses: true, acknowledgeSensitive: true })).applied).toBe(true);
    expect(getUnit(base, 'M7.E1').record.legacy_row[2]).toBe(`${filler}AKIAIOSFODNN7EXAMPLE`);
  }, 60_000);
});
