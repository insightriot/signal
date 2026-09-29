// Epic-folder artifact resolution (M6.E11.S5 t5.1, AC-8.6, D-M6E11-23).
// See .planning/M6.E11-VALIDATION.md row AC-8.6.
//
// With the work store on AND `.planning/work/epics/<currentEpic>/` present,
// `resolveArtifactPath` tries the Epic folder first and `artifactName` names a
// path inside it, so VERIFY/REVIEW/SHIP artifacts are written there. Store off,
// or no folder for the Epic → both return exactly what they did before (the
// golden in work-store-off.test.js pins the store-off half byte-for-byte).
//
// Real temp dirs, not the in-memory `existsFn`: the store-on decision reads
// `WORK.md` and the folder from disk, so a mocked existence check would not
// exercise it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveArtifactPath, artifactName } from '../plugin/tools/lib/resume.js';
import { initState, readState, setCurrentEpic, transitionPhase } from '../plugin/tools/lib/state.js';
import { WorkStoreError } from '../plugin/tools/lib/work-item.js';

let base;
let P;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-epic-resolve-'));
  P = join(base, '.planning');
  await mkdir(P, { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel, content = '# x\n') {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const storeOn = () => put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
const EPIC_LIVE = '.planning/work/epics/M6.E99';
const epicFolder = (id = 'M6.E99') => mkdir(join(P, 'work', 'epics', id), { recursive: true });

describe('store on, Epic folder present', () => {
  beforeEach(async () => {
    await storeOn();
    await epicFolder();
  });

  it('artifactName names the canonical Epic-prefixed file inside the folder when given planningDir', () => {
    expect(artifactName('PLAN', { currentEpic: 'M6.E99', planningDir: P })).toBe('work/epics/M6.E99/M6.E99-PLAN.md');
    expect(artifactName('REQUIREMENTS', { currentEpic: 'M6.E99', planningDir: P }))
      .toBe('work/epics/M6.E99/M6.E99-REQUIREMENTS.md');
  });

  it('the name artifactName returns joins with planningDir to a path inside the folder', () => {
    const name = artifactName('VERIFICATION', { currentEpic: 'M6.E99', planningDir: P });
    expect(join(P, name)).toBe(join(P, 'work', 'epics', 'M6.E99', 'M6.E99-VERIFICATION.md'));
  });

  it('resolves the folder artifact FIRST, over a legacy Epic-prefixed file in .planning/', async () => {
    await put('.planning/M6.E99-PLAN.md', '# old\n');
    await put('.planning/work/epics/M6.E99/M6.E99-PLAN.md', '# new\n');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' }))
      .toBe(join(P, 'work', 'epics', 'M6.E99', 'M6.E99-PLAN.md'));
  });

  it('also resolves the bare <ARTIFACT>.md form inside the folder, below the canonical name', async () => {
    await put('.planning/work/epics/M6.E99/PLAN.md');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' }))
      .toBe(join(P, 'work', 'epics', 'M6.E99', 'PLAN.md'));
    await put('.planning/work/epics/M6.E99/M6.E99-PLAN.md');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' }))
      .toBe(join(P, 'work', 'epics', 'M6.E99', 'M6.E99-PLAN.md'));
  });

  it('falls back to the legacy locations when the folder does not hold the artifact', async () => {
    await put('.planning/M6.E99-REQUIREMENTS.md');
    expect(resolveArtifactPath(P, 'REQUIREMENTS', { currentEpic: 'M6.E99' }))
      .toBe(join(P, 'M6.E99-REQUIREMENTS.md'));
  });

  it('what artifactName writes, resolveArtifactPath resolves back', async () => {
    const name = artifactName('REVIEW', { currentEpic: 'M6.E99', planningDir: P });
    await put(`.planning/${name}`);
    expect(resolveArtifactPath(P, 'REVIEW', { currentEpic: 'M6.E99' })).toBe(join(P, name));
  });

  it('a non-strict current_epic is not an Epic folder — legacy answers', async () => {
    await mkdir(join(P, 'work', 'epics', 'v0.1.6'), { recursive: true });
    await put('.planning/work/epics/v0.1.6/PLAN.md');
    expect(artifactName('PLAN', { currentEpic: 'v0.1.6', planningDir: P })).toBe('1-PLAN.md');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'v0.1.6' })).toBeNull();
  });

  it('transitionPhase records a phase whose only artifact is in the Epic folder', async () => {
    await initState(base, 'CALIBRATE');
    await setCurrentEpic(base, 'M6.E99'); // resets phase to null
    await transitionPhase(base, 'DISCUSS');
    // Control: with no REQUIREMENTS anywhere the guard refuses (B48), so the
    // pass below is the folder being read, not the guard being skipped.
    await expect(transitionPhase(base, 'PLAN')).rejects.toThrow(/no REQUIREMENTS artifact/);
    await put('.planning/work/epics/M6.E99/M6.E99-REQUIREMENTS.md');
    await transitionPhase(base, 'PLAN');
    const state = await readState(base);
    expect(state.phase).toBe('PLAN');
    expect(state.completed_phases.map((e) => e.split(' ')[0])).toContain('DISCUSS');
  });
});

describe('an archived Epic (M6.E11 t5.4) — reads find it, writes never go there', () => {
  const ARCH = '.planning/archive/epics/M6.E99';
  beforeEach(storeOn);

  it('resolves the canonical and the bare name from archive/epics/<id>/ when the live folder is gone', async () => {
    await put(`${ARCH}/PLAN.md`);
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' })).toBe(join(P, 'archive/epics/M6.E99/PLAN.md'));
    await put(`${ARCH}/M6.E99-PLAN.md`);
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' }))
      .toBe(join(P, 'archive/epics/M6.E99/M6.E99-PLAN.md'));
  });

  it('the live folder wins over the archive, and the archive over the numeric / bare legacy names', async () => {
    await put(`${ARCH}/M6.E99-PLAN.md`);
    await put('.planning/1-PLAN.md');
    await put('.planning/PLAN.md');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' }))
      .toBe(join(P, 'archive/epics/M6.E99/M6.E99-PLAN.md'));
    await put(`${EPIC_LIVE}/M6.E99-PLAN.md`);
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' }))
      .toBe(join(P, 'work/epics/M6.E99/M6.E99-PLAN.md'));
  });

  it('artifactName never names a path in the archive', async () => {
    await put(`${ARCH}/M6.E99-PLAN.md`);
    expect(artifactName('VERIFICATION', { currentEpic: 'M6.E99', planningDir: P })).toBe('M6.E99-VERIFICATION.md');
  });

  it('store off: the archive is not read', async () => {
    await rm(join(P, 'work/WORK.md'));
    await put(`${ARCH}/M6.E99-PLAN.md`);
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' })).toBeNull();
  });
});

describe('no folder for the Epic, or store off — today\'s answers', () => {
  it('store on but no folder for this Epic: artifactName and resolveArtifactPath are unchanged', async () => {
    await storeOn();
    await epicFolder('M6.E1'); // a different Epic's folder
    await put('.planning/M6.E99-PLAN.md');
    expect(artifactName('PLAN', { currentEpic: 'M6.E99', planningDir: P })).toBe('M6.E99-PLAN.md');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' })).toBe(join(P, 'M6.E99-PLAN.md'));
  });

  it('store off, even with a folder on disk: unchanged', async () => {
    await epicFolder();
    await put('.planning/work/epics/M6.E99/M6.E99-PLAN.md');
    expect(artifactName('PLAN', { currentEpic: 'M6.E99', planningDir: P })).toBe('M6.E99-PLAN.md');
    expect(resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' })).toBeNull();
  });

  it('artifactName without planningDir never looks at disk (every existing call shape)', async () => {
    await storeOn();
    await epicFolder();
    expect(artifactName('PLAN', { currentEpic: 'M6.E99' })).toBe('M6.E99-PLAN.md');
    expect(artifactName('REQUIREMENTS', { currentEpic: null })).toBe('REQUIREMENTS.md');
  });

  it('a broken WORK.md throws CONFIG rather than reading as off (the store never falls back silently)', async () => {
    await put('.planning/work/WORK.md', '---\nkey: nope\n---\n');
    await epicFolder();
    expect(() => resolveArtifactPath(P, 'PLAN', { currentEpic: 'M6.E99' })).toThrow(WorkStoreError);
    expect(() => artifactName('PLAN', { currentEpic: 'M6.E99', planningDir: P })).toThrow(WorkStoreError);
  });
});
