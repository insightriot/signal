// Filing a closed Epic's own folder (course correction Step 1, 2026-10-27).
//
// The rewritten phase commands keep every file of an Epic in
// `.planning/epics/<EpicID>/`. `/sig:docs-archive` files a closed Epic away
// into `.planning/archive/<M>/E<n>/`, and until now it planned moves only for
// files at the top of `.planning/`: an Epic whose files were all in its folder
// was reported "closed, nothing left to move" and nothing moved.
//
// Not at SHIP: a close there is only requested, and the current Epic's files
// stay until the next one opens. Both still hold for the folder (tested below).
//
// Real temp dirs; every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { planArchiveMoves } from '../plugin/tools/lib/archive-tree.js';
import { applyArchive, buildArchiveReport, renderArchiveReport } from '../plugin/tools/lib/archive-command.js';
import { artifactName, resolveArtifactPath } from '../plugin/tools/lib/resume.js';
import { cleanupUnitProjects, E, plant, put, retroFor, state, tempProject, unitsOn } from './helpers/unit-fixture.js';

afterEach(cleanupUnitProjects);

const EPIC = 'M7.E2';
const FOLDER = `.planning/epics/${EPIC}`;
const ARCHIVE = '.planning/archive/M7/E2';

const PLAN = `# ${EPIC} plan\n\nSee [the requirements](./${EPIC}-REQUIREMENTS.md) and [context](../../CONTEXT.md).\n`;

// M7.E2 is closed and its files are in its folder; M7.E4 is the current Epic.
// `records`: closed by its unit record; otherwise by its filled retrospective.
function project({ records = true } = {}) {
  const base = tempProject('sig-epic-folder-archive-');
  put(base, '.planning/STATE.md', state({ epic: 'M7.E4' }));
  put(base, '.planning/CONTEXT.md', `# Context\n\nThe plan: [${EPIC}](epics/${EPIC}/${EPIC}-PLAN.md).\n`);
  put(base, `.planning/${EPIC}-RETROSPECTIVE.md`, retroFor(EPIC));
  put(base, `${FOLDER}/${EPIC}-REQUIREMENTS.md`, '# requirements\n');
  put(base, `${FOLDER}/${EPIC}-PLAN.md`, PLAN);
  put(base, `${FOLDER}/${EPIC}-VERIFICATION.md`, '# verification\n\n**Verdict:** PASS\n');
  if (records) {
    unitsOn(base);
    plant(base, EPIC, 'closed');
    plant(base, 'M7.E4', 'open');
  }
  return base;
}

const read = (base, rel) => readFileSync(join(base, rel), 'utf-8');

describe('planArchiveMoves: a closed Epic\'s folder moves whole', () => {
  it('every file under the folder, nested ones included, goes to the Epic\'s archive directory', () => {
    const files = [`${FOLDER}/${EPIC}-PLAN.md`, `${FOLDER}/PLAN.md`, `${FOLDER}/notes/day-1.md`, '.planning/epics/M7.E3/M7.E3-PLAN.md'];
    const { moves, dropped } = planArchiveMoves([EPIC], files);
    expect(moves).toEqual([
      { from: `${FOLDER}/${EPIC}-PLAN.md`, to: `${ARCHIVE}/${EPIC}-PLAN.md` },
      { from: `${FOLDER}/PLAN.md`, to: `${ARCHIVE}/PLAN.md` },
      { from: `${FOLDER}/notes/day-1.md`, to: `${ARCHIVE}/notes/day-1.md` },
    ]);
    expect(dropped).toEqual([]);
  });

  it('a dotted milestone files under its full number', () => {
    const { moves } = planArchiveMoves(['M3.0.E2'], ['.planning/epics/M3.0.E2/M3.0.E2-REVIEW.md']);
    expect(moves).toEqual([{ from: '.planning/epics/M3.0.E2/M3.0.E2-REVIEW.md', to: '.planning/archive/M3.0/E2/M3.0.E2-REVIEW.md' }]);
  });

  it('a root copy and a folder copy of one file: nothing of the Epic moves, and the file is named', () => {
    const files = [`.planning/${EPIC}-PLAN.md`, `.planning/${EPIC}-REVIEW.md`, `${FOLDER}/${EPIC}-PLAN.md`];
    const { moves, dropped } = planArchiveMoves([EPIC], files);
    expect(moves).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].unit).toBe(EPIC);
    expect(dropped[0].reason).toContain(`${ARCHIVE}/${EPIC}-PLAN.md`);
  });

  it('a file already in the archive is never written over, from the folder or from the root', () => {
    for (const from of [`${FOLDER}/${EPIC}-PLAN.md`, `.planning/${EPIC}-PLAN.md`]) {
      const { moves, dropped } = planArchiveMoves([EPIC], [from, `${ARCHIVE}/${EPIC}-PLAN.md`]);
      expect(moves).toEqual([]);
      expect(dropped.map((d) => d.unit)).toEqual([EPIC]);
    }
  });
});

describe('/sig:docs-archive files the folder', () => {
  it('the report plans the move, rather than calling the Epic settled', async () => {
    const report = await buildArchiveReport(project());
    expect(report.settled).not.toContain(EPIC);
    expect(report.plan).toEqual([{
      unit: EPIC, dir: ARCHIVE, files: [`${EPIC}-PLAN.md`, `${EPIC}-REQUIREMENTS.md`, `${EPIC}-VERIFICATION.md`],
    }]);
    expect(renderArchiveReport(report).join('\n')).toContain(`${EPIC}  →  ${ARCHIVE}/  (3 files)`);
  });

  it('an Epic closed by its retrospective, with no unit records, is planned the same', async () => {
    const report = await buildArchiveReport(project({ records: false }));
    expect(report.plan.map((u) => [u.unit, u.files.length])).toEqual([[EPIC, 3]]);
  });

  it('apply moves every file byte-for-byte, retargets links both ways, and removes the empty folder', async () => {
    const base = project();
    const before = read(base, `${FOLDER}/${EPIC}-REQUIREMENTS.md`);
    const res = await applyArchive(base);
    expect(res.moves).toHaveLength(3);
    expect(read(base, `${ARCHIVE}/${EPIC}-REQUIREMENTS.md`)).toBe(before);
    // Inside the moved plan: the sibling link still works, and CONTEXT.md is one level further up.
    expect(read(base, `${ARCHIVE}/${EPIC}-PLAN.md`)).toBe(
      `# ${EPIC} plan\n\nSee [the requirements](./${EPIC}-REQUIREMENTS.md) and [context](../../../CONTEXT.md).\n`,
    );
    expect(existsSync(join(base, `${ARCHIVE}/${EPIC}-PLAN.md`, '..', '..', '..', '..', 'CONTEXT.md'))).toBe(true);
    // A live file that linked into the folder now links into the archive.
    expect(read(base, '.planning/CONTEXT.md')).toContain(`](./archive/M7/E2/${EPIC}-PLAN.md)`);
    expect(existsSync(join(base, FOLDER))).toBe(false);
    expect(existsSync(join(base, '.planning/epics'))).toBe(false);
    // The retrospective stays at the root, where SHIP's gate reads it.
    expect(existsSync(join(base, `.planning/${EPIC}-RETROSPECTIVE.md`))).toBe(true);
  });

  it('after apply the Epic\'s files are read from the archive, nothing is named in the gone folder, and a second run plans nothing', async () => {
    const base = project();
    await applyArchive(base);
    const P = join(base, '.planning');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: EPIC })).toBe(join(base, `${ARCHIVE}/${EPIC}-PLAN.md`));
    expect(artifactName('PLAN', { currentEpic: EPIC, planningDir: P })).toBe(`${EPIC}-PLAN.md`);
    const again = await buildArchiveReport(base);
    expect(again.moves).toEqual([]);
  });

  it('a bare PLAN.md from the folder is read from the archive under its own name', async () => {
    const base = project();
    put(base, `${FOLDER}/RESEARCH.md`, '# research\n');
    await applyArchive(base);
    const P = join(base, '.planning');
    expect(resolveArtifactPath(P, 'RESEARCH', { currentEpic: EPIC })).toBe(join(base, `${ARCHIVE}/RESEARCH.md`));
  });

  it('a file the archive does not move (not a .md) keeps the folder, and every .md still moves', async () => {
    const base = project();
    put(base, `${FOLDER}/diagram.png`, 'png');
    await applyArchive(base);
    expect(readdirSync(join(base, FOLDER))).toEqual(['diagram.png']);
    expect(existsSync(join(base, `${ARCHIVE}/${EPIC}-PLAN.md`))).toBe(true);
  });
});

describe('what never moves still does not, with a folder', () => {
  it('a held closed Epic keeps its folder', async () => {
    const base = project();
    plant(base, EPIC, [E.opened, E.closing, E.shipped, E.held]);
    const report = await buildArchiveReport(base);
    expect(report.moves).toEqual([]);
    expect(report.refusals.find((r) => r.unit === EPIC).status).toBe('held');
    await applyArchive(base);
    expect(existsSync(join(base, `${FOLDER}/${EPIC}-PLAN.md`))).toBe(true);
  });

  it('the current Epic keeps its folder though its record is closed', async () => {
    const base = project();
    put(base, '.planning/STATE.md', state({ epic: EPIC }));
    const report = await buildArchiveReport(base);
    expect(report.moves).toEqual([]);
    expect(report.refusals.find((r) => r.unit === EPIC).status).toBe('current');
  });

  it('an Epic whose close is only requested keeps its folder', async () => {
    const base = project();
    plant(base, EPIC, 'closing');
    const report = await buildArchiveReport(base);
    expect(report.moves).toEqual([]);
  });
});
