// Opening an Epic makes its own folder (course correction Step 1, 2026-10-28).
//
// The rewritten phase commands write every file of an Epic into
// `.planning/epics/<EpicID>/`, and the resolver uses that folder only once it
// exists. `openEpic` (called by /sig:discuss and /sig:new-project with
// --epic) now makes it, so DISCUSS's first file already lands there.
//
// Real temp dirs; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { openEpic } from '../plugin/tools/lib/work-ops.js';
import { artifactName } from '../plugin/tools/lib/resume.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';

const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const P = () => join(base, '.planning');
const name = (epic) => artifactName('REQUIREMENTS', { currentEpic: epic, planningDir: P() });

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-open-epic-folder-'));
  await put('.planning/STATE.md',
    '---\nschema_version: 1\nphase: null\ncurrent_epic: M7.E1\ncurrent_wave: null\n'
    + 'current_tasks: []\ncompleted_phases: []\nblockers: []\n---\n# State\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('openEpic makes the Epic\'s folder', () => {
  it('a project without unit records: the folder is made, and the first file is named inside it', async () => {
    await openEpic(base, 'M7.E2', { by });
    expect(existsSync(join(base, '.planning/epics/M7.E2'))).toBe(true);
    expect(name('M7.E2')).toBe('epics/M7.E2/M7.E2-REQUIREMENTS.md');
  });

  it('a project with unit records: the folder is made beside the new record', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put('.planning/work/units/M7.E1.json', UNIT_KIND.serializeRecord({ id: 'M7.E1', events: [{ type: 'opened', at: AT, by }] }));
    expect(await openEpic(base, 'M7.E2', { by })).toEqual({ epic: 'M7.E2', unit: 'created' });
    expect(name('M7.E2')).toBe('epics/M7.E2/M7.E2-REQUIREMENTS.md');
  });

  it('opening it again changes nothing in the folder', async () => {
    await openEpic(base, 'M7.E2', { by });
    await put('.planning/epics/M7.E2/M7.E2-REQUIREMENTS.md', '# requirements\n');
    await openEpic(base, 'M7.E2', { by });
    expect(readdirSync(join(base, '.planning/epics/M7.E2'))).toEqual(['M7.E2-REQUIREMENTS.md']);
    expect(await readFile(join(base, '.planning/epics/M7.E2/M7.E2-REQUIREMENTS.md'), 'utf-8')).toBe('# requirements\n');
  });

  it('an Epic with files already at the top of .planning/ gets no folder, and keeps writing there', async () => {
    await put('.planning/M7.E2-PLAN.md', '# plan\n');
    await openEpic(base, 'M7.E2', { by });
    expect(existsSync(join(base, '.planning/epics'))).toBe(false);
    expect(name('M7.E2')).toBe('M7.E2-REQUIREMENTS.md');
  });

  it('its own profile or retrospective at the top does not stop it: those live there', async () => {
    await put('.planning/M7.E2-PROFILE.md', '---\ntier: SKETCH\n---\n');
    await put('.planning/M7.E2-RETROSPECTIVE.md', '# retro\n');
    await openEpic(base, 'M7.E2', { by });
    expect(existsSync(join(base, '.planning/epics/M7.E2'))).toBe(true);
  });

  it('another Epic\'s top-level files do not stop it (M7.E20 is not M7.E2)', async () => {
    await put('.planning/M7.E20-PLAN.md', '# plan\n');
    await openEpic(base, 'M7.E2', { by });
    expect(existsSync(join(base, '.planning/epics/M7.E2'))).toBe(true);
  });

  it('`epics` is a link: nothing is made through it', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sig-open-epic-folder-out-'));
    try {
      await symlink(outside, join(base, '.planning/epics'));
      await openEpic(base, 'M7.E2', { by });
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('a refused open makes no folder', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put('.planning/work/units/M7.E2.json', UNIT_KIND.serializeRecord({ id: 'M7.E2', events: [
      { type: 'opened', at: AT, by },
      { type: 'closed', at: AT, by, reason: 'dropped', words: 'the work moved to another unit' },
    ] }));
    await expect(openEpic(base, 'M7.E2', { by })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(existsSync(join(base, '.planning/epics'))).toBe(false);
  });
});

describe('the next Epic ID counts Epics that live in folders', () => {
  it('an Epic whose files are all in its folder takes its number (no unit records)', async () => {
    const { deriveNextEpicId } = await import('../plugin/tools/lib/milestones.js');
    await put('.planning/epics/M7.E2/M7.E2-REQUIREMENTS.md', '# requirements\n');
    expect(await deriveNextEpicId(base, { milestone: '7' })).toBe('M7.E3');
  });

  it('an Epic filed in archive/<M>/E<n>/ takes its number too', async () => {
    const { deriveNextEpicId } = await import('../plugin/tools/lib/milestones.js');
    // Where docs-archive files an Epic (planArchiveMoves), so the two cannot drift apart.
    const { deriveUnitArchiveDir } = await import('../plugin/tools/lib/archive-tree.js');
    await put(`${deriveUnitArchiveDir('M7.E4')}/M7.E4-PLAN.md`, '# plan\n');
    await put(`${deriveUnitArchiveDir('M3.0.E9')}/M3.0.E9-PLAN.md`, '# plan\n');
    expect(await deriveNextEpicId(base, { milestone: '7' })).toBe('M7.E5');
    expect(await deriveNextEpicId(base, { milestone: '3.0' })).toBe('M3.0.E10');
  });

  it('another milestone\'s folders do not count', async () => {
    const { deriveNextEpicId } = await import('../plugin/tools/lib/milestones.js');
    await put('.planning/epics/M8.E6/M8.E6-REQUIREMENTS.md', '# requirements\n');
    expect(await deriveNextEpicId(base, { milestone: '7' })).toBe('M7.E1');
  });
});
