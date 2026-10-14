// REVIEW pass 2, the small hardening findings (S2-L3 … S2-L7 and two of the
// code reviewer's suggestions). One section each:
//   (a) the refusal that says how to override a closed Epic prints nothing
//       from the record beside it but the close's reason and date;
//   (b) the migration's sensitive-data scan reads each source text whole, so
//       a key that straddles a length limit is found;
//   (c) the session-start hook prints `current_epic` escaped and cut;
//   (d) the migration does not read retrospectives or folders through a
//       linked `.planning/archive`;
//   (e) the dry-run report lists at most 500 units and counts the rest;
//   (f) `holdUnit` on a project with no `work/units/` says unit records are
//       off, and what turns them on;
//   (g) an event's `by` is stored cleaned and cut, like any other text.
//
// Temp folders; every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { planUnits, unitImportTexts, unitsReportLines } from '../plugin/tools/lib/work-migrate-units.js';
import { openEpic } from '../plugin/tools/lib/work-ops.js';
import { UNIT_BY_MAX, UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import {
  AT, MILESTONE, UNITS, bytesOf, cleanupUnitsStores, commitAll, milestone7, put, read, retro, stateText, unitsStore,
} from './helpers/units-store-fixture.js';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks', 'warn-dirty-execute.js');
const by = 'claude';
const made = [];
afterEach(() => {
  cleanupUnitsStores();
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
});
const tmp = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `sig-${name}-`));
  made.push(dir);
  return dir;
};
const refusal = async (fn) => {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected a refusal');
};
const INVISIBLE = new RegExp(`[\u200b\u202e${String.fromCharCode(7)}${String.fromCharCode(27)}]`, 'u');
const opened = { type: 'opened', at: AT, by };

// A store with unit records and one open unit.
async function withUnits() {
  const base = await unitsStore();
  put(base, `${UNITS}/.keep`, '');
  put(base, `${UNITS}/M7.E9.json`, UNIT_KIND.serializeRecord({ id: 'M7.E9', events: [opened] }));
  const { regenerateViews } = await import('../plugin/tools/lib/work-views.js');
  await regenerateViews(base);
  return base;
}

describe('(a) S2-L3 — the override refusal prints neither the close\'s PR nor its release', () => {
  it('a closed Epic opened again without force: the reason and date, the instruction, and nothing else from the record', async () => {
    const base = await withUnits();
    put(base, `${UNITS}/M7.E3.json`, UNIT_KIND.serializeRecord({
      id: 'M7.E3',
      events: [opened, { type: 'closed', at: '2026-09-30T10:00:00.000Z', by, reason: 'legacy', pr: 'PR-TEXT-FROM-THE-RECORD', release: 'RELEASE-TEXT-FROM-THE-RECORD', words: 'WORDS-FROM-THE-RECORD' }],
    }));
    const err = await refusal(() => openEpic(base, 'M7.E3', { by }));
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('M7.E3 is closed (legacy, 2026-09-30)');
    expect(err.message).toContain('force: true');
    for (const text of ['PR-TEXT-FROM-THE-RECORD', 'RELEASE-TEXT-FROM-THE-RECORD', 'WORDS-FROM-THE-RECORD']) expect(err.message).not.toContain(text);
  });
});

describe('(b) S2-L6 — a key that straddles a length limit is found: the scan reads the source text whole', () => {
  // 7,990 characters, then a 20-character key: the stored cell is cut at 8,000, mid-key.
  const LONG = `${'word '.repeat(1598)}AKIAIOSFODNN7EXAMPLE and the rest`;
  const row = `| \`M7.E1\` | **shipped** | ${LONG} |`;

  it('the stored text alone would not show it (the cut is mid-key), and the plan\'s texts do', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, milestone7([row]));
    commitAll(base);
    const texts = unitImportTexts(await planUnits(base)).filter((t) => t.id === 'M7.E1').map((t) => t.text);
    expect(texts.some((t) => t.includes('AKIAIOSFODNN7EXAMPLE'))).toBe(true);
    expect(texts.some((t) => t.endsWith('AKIAIOSFO…'))).toBe(true); // the stored cell, as cut
  });

  it('units-only path: the dry run reports the hit and the apply stops until it is acknowledged', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, milestone7([row]));
    commitAll(base);
    const dry = await runWorkStoreMigrate(base, { apply: false });
    expect(dry.sensitiveHits).toContainEqual({ id: 'M7.E1', file: 'unit', type: 'aws-key', match: 'AKIAIO…' });
    const before = bytesOf(base);
    const stop = await runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: '2026-10-12', confirmUnitCloses: true });
    expect(stop).toMatchObject({ applied: false, aborted: 'sensitive-data-pending' });
    expect(bytesOf(base)).toEqual(before);
  }, 60_000);

  it('first-time path: the same', async () => {
    const base = await unitsStore({ repo: true, store: false });
    put(base, MILESTONE, milestone7([row]));
    put(base, '.planning/BUGS.md', '# Bugs\n');
    commitAll(base);
    const dry = await runWorkStoreMigrate(base, { apply: false });
    expect(dry.refused, dry.reason).toBeUndefined();
    expect(dry.sensitiveHits).toContainEqual({ id: 'M7.E1', file: 'unit', type: 'aws-key', match: 'AKIAIO…' });
    const stop = await runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: '2026-10-12' });
    expect(stop).toMatchObject({ applied: false, aborted: 'sensitive-data-pending' });
  }, 60_000);

  it('the words of a unit declared with --also, past their limit: found too', async () => {
    const base = await unitsStore({ repo: true });
    const words = `${'word '.repeat(398)}AKIAIOSFODNN7EXAMPLE`; // cut at 2,000, mid-key
    const dry = await runWorkStoreMigrate(base, { apply: false, also: [{ id: 'M5.E11', reason: 'dropped', words }] });
    expect(dry.sensitiveHits).toContainEqual({ id: 'M5.E11', file: 'unit', type: 'aws-key', match: 'AKIAIO…' });
  }, 60_000);
});

describe('(c) S2-L7 — the session-start hook prints current_epic escaped and cut', () => {
  it('units/ a link and a hostile current_epic: no raw control or invisible character, and no more than 60 characters of it', () => {
    const dir = tmp('hook');
    const hostile = `M7.E1\u202e${String.fromCharCode(27)}[31m${'A'.repeat(400)}`;
    put(dir, '.planning/STATE.md', `---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: ${hostile}\n---\n`);
    put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    mkdirSync(join(dir, 'elsewhere'));
    symlinkSync(join(dir, 'elsewhere'), join(dir, UNITS));
    const r = spawnSync('node', [HOOK], { cwd: dir, encoding: 'utf-8' });
    expect(r.status).toBe(0);
    const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(context).toMatch(/^Signal could not check whether /);
    expect(context).not.toMatch(INVISIBLE);
    expect(context).not.toContain('A'.repeat(61));
    expect(context).toContain('M7.E1');
  });
});

describe('(d) S2-L4 — the migration does not read through a linked archive', () => {
  // A folder outside `.planning/` that looks like an archive: a complete retrospective and an Epic folder.
  function outside(base) {
    const out = join(base, 'not-the-archive');
    put(out, 'M9.E9-RETROSPECTIVE.md', retro('M9.E9'));
    put(out, 'M9/E8/M9.E8-PLAN.md', '# plan\n');
    put(out, 'epics/M9.E7/README.md', '# M9.E7\n');
    return out;
  }

  it('.planning/archive is a link: no unit is named from behind it, and a note says it was not read', async () => {
    const base = tmp('archive-link');
    put(base, '.planning/STATE.md', stateText());
    symlinkSync(outside(base), join(base, '.planning/archive'));
    const plan = await planUnits(base);
    expect(plan.units.map((u) => u.id).filter((id) => id.startsWith('M9.'))).toEqual([]);
    expect(plan.notes.join('\n')).toMatch(/\.planning\/archive is a symbolic link — nothing under it was read/);
  });

  it('control: the same folder as a real archive names all three', async () => {
    const base = tmp('archive-real');
    put(base, '.planning/STATE.md', stateText());
    put(base, '.planning/archive/M9.E9-RETROSPECTIVE.md', retro('M9.E9'));
    put(base, '.planning/archive/M9/E8/M9.E8-PLAN.md', '# plan\n');
    put(base, '.planning/archive/epics/M9.E7/README.md', '# M9.E7\n');
    expect((await planUnits(base)).units.map((u) => u.id).filter((id) => id.startsWith('M9.'))).toEqual(['M9.E7', 'M9.E8', 'M9.E9']);
  });

  it('a folder inside the archive that is a link is not walked either', async () => {
    const base = tmp('archive-inner-link');
    put(base, '.planning/STATE.md', stateText());
    mkdirSync(join(base, '.planning/archive'), { recursive: true });
    const out = outside(base);
    symlinkSync(join(out, 'M9'), join(base, '.planning/archive/M9'));
    symlinkSync(join(out, 'epics'), join(base, '.planning/archive/epics'));
    symlinkSync(out, join(base, '.planning/archive/deeper'));
    expect((await planUnits(base)).units.map((u) => u.id).filter((id) => id.startsWith('M9.'))).toEqual([]);
  });
});

describe('(e) S2-L5 — the dry-run report lists at most 500 units and counts the rest', () => {
  it('620 units: 500 lines for them, one line counting the other 120, and the report stays small', async () => {
    const base = tmp('many-units');
    put(base, '.planning/STATE.md', stateText('M8.E1'));
    for (let n = 1; n <= 620; n += 1) put(base, `.planning/M8.E${n}-PLAN.md`, '# plan\n');
    const plan = await planUnits(base);
    expect(plan.units).toHaveLength(620);
    const lines = unitsReportLines(plan);
    expect(lines[0]).toContain('(620 named)');
    expect(lines.filter((l) => /^ {2}M8\.E\d+ {2}open/.test(l))).toHaveLength(500);
    expect(lines).toContain('  … and 120 more units, not listed here (the list is cut at 500).');
    expect(lines.join('\n').length).toBeLessThan(100_000);
  }, 60_000);

  it('a plan under the cap prints every unit and no such line', async () => {
    const lines = unitsReportLines(await planUnits(await unitsStore()));
    expect(lines.join('\n')).not.toMatch(/not listed here/);
  });
});

describe('(f) holdUnit on a project with no work/units/', () => {
  it('says unit records are off and what turns them on, as openUnit does — not "no such unit"', async () => {
    const base = await unitsStore();
    const before = bytesOf(base);
    const hold = await refusal(() => units.holdUnit(base, 'M7.E1', { reason: 'keep', by }));
    const open = await refusal(() => units.openUnit(base, 'M7.E1', { by }));
    expect(hold.code).toBe('CONFIG');
    expect(hold.message).toBe(open.message);
    expect(hold.message).toMatch(/has no unit records/);
    expect(hold.message).toMatch(/\/sig:docs-migrate --work-store/);
    expect(hold.message).not.toMatch(/no such unit/);
    const release = await refusal(() => units.releaseUnit(base, 'M7.E1', { by }));
    expect(release.code).toBe('CONFIG');
    expect(release.message).toBe(open.message);
    expect(bytesOf(base)).toEqual(before);
  });

  it('with unit records, a unit that has no record is still "no such unit"', async () => {
    const base = await withUnits();
    expect((await refusal(() => units.holdUnit(base, 'M7.E77', { reason: 'keep', by }))).code).toBe('NOT_FOUND');
  });
});

describe('(g) an event\'s `by` is stored cleaned and cut', () => {
  const HOSTILE = `cl\u200bau\u202ede${String.fromCharCode(7)}\nsecond line ${'x'.repeat(900)}`;
  const lastBy = (base, id) => JSON.parse(read(base, `${UNITS}/${id}.json`)).events.at(-1).by;
  const clean = (value) => {
    expect(value).not.toMatch(INVISIBLE);
    expect(value).not.toContain('\n');
    expect(value.length).toBeLessThanOrEqual(UNIT_BY_MAX);
    expect(value.startsWith('claude second line')).toBe(true);
  };
  const SHA = 'a'.repeat(40);

  const WRITERS = {
    openUnit: async (base) => { await units.openUnit(base, 'M7.E1', { by: HOSTILE }); return lastBy(base, 'M7.E1'); },
    importUnits: async (base) => {
      await units.importUnits(base, [{ id: 'M7.E1', opened: { at: AT, by: HOSTILE } }, { id: 'M7.E2', close: { reason: 'legacy', at: AT, by: HOSTILE } }]);
      expect(lastBy(base, 'M7.E2')).toBe(lastBy(base, 'M7.E1'));
      return lastBy(base, 'M7.E1');
    },
    requestUnitClose: async (base) => { await units.requestUnitClose(base, 'M7.E9', { proof: SHA, by: HOSTILE }); return lastBy(base, 'M7.E9'); },
    rerequestUnitClose: async (base) => {
      await units.requestUnitClose(base, 'M7.E9', { proof: SHA, by });
      await units.rerequestUnitClose(base, 'M7.E9', { proof: 'b'.repeat(40), by: HOSTILE });
      const events = JSON.parse(read(base, `${UNITS}/M7.E9.json`)).events;
      expect(events.at(-2).by).toBe(events.at(-1).by);
      return events.at(-1).by;
    },
    closeUnit: async (base) => { await units.closeUnit(base, 'M7.E9', { reason: 'dropped', words: 'gone', by: HOSTILE }); return lastBy(base, 'M7.E9'); },
    reopenUnit: async (base) => {
      await units.closeUnit(base, 'M7.E9', { reason: 'dropped', words: 'gone', by });
      await units.reopenUnit(base, 'M7.E9', { reason: 'back', by: HOSTILE });
      return lastBy(base, 'M7.E9');
    },
    holdUnit: async (base) => { await units.holdUnit(base, 'M7.E9', { reason: 'keep', by: HOSTILE }); return lastBy(base, 'M7.E9'); },
    releaseUnit: async (base) => {
      await units.holdUnit(base, 'M7.E9', { reason: 'keep', by });
      await units.releaseUnit(base, 'M7.E9', { by: HOSTILE });
      return lastBy(base, 'M7.E9');
    },
    editUnit: async (base) => { await units.editUnit(base, 'M7.E9', { changes: { title: 'a title' }, by: HOSTILE }); return lastBy(base, 'M7.E9'); },
    planUnitCloseRequest: async (base) => units.planUnitCloseRequest({ baseDir: base, key: 'LEAF' }, 'M7.E9', { proof: SHA, at: AT, by: HOSTILE }).next.events.at(-1).by,
  };

  it('the table names every export that takes a `by`', () => {
    const takesBy = Object.keys(units).filter((n) => /^(open|request|rerequest|close|reopen|hold|release|edit)Unit|^importUnits$|^planUnitCloseRequest$/.test(n));
    expect(Object.keys(WRITERS).sort()).toEqual(takesBy.sort());
  });

  for (const [name, run] of Object.entries(WRITERS)) {
    it(`${name}`, async () => {
      clean(await run(await withUnits()));
    });
  }

  it('a `by` that is nothing but invisible characters is still refused, and a plain one is stored as it was given', async () => {
    const base = await withUnits();
    await expect(units.holdUnit(base, 'M7.E9', { reason: 'keep', by: '\u200b\u202e' })).rejects.toMatchObject({ code: 'SCHEMA' });
    await units.holdUnit(base, 'M7.E9', { reason: 'keep', by: 'Brett Crowe' });
    expect(lastBy(base, 'M7.E9')).toBe('Brett Crowe');
  });
});
