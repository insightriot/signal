// AC-8.5 on THIS repository (M6.E11 VERIFY loop 1, L3).
//
// t7.5 moved M6.E11 into its own Epic folder: its item (SIG-161) and its
// artifacts now live in .planning/work/epics/M6.E11/. The unit tests prove
// the resolvers on fixtures; this pins that the move actually happened here
// and that the phase commands' resolvers find the moved files — so a later
// change that puts an `M6.E11-*.md` back at the top level, or breaks folder
// resolution, fails the suite instead of being noticed by a reader.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { artifactName, resolveArtifactPath } from '../plugin/tools/lib/resume.js';
import { listItems } from '../plugin/tools/lib/work-ops.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLANNING = join(ROOT, '.planning');
const EPIC = 'M6.E11';
const LIVE = join(PLANNING, 'work', 'epics', EPIC);
const ARCHIVED = join(PLANNING, 'archive', 'epics', EPIC);
// REVIEW pass 1, C2: SHIP's closeEpic moves this folder to archive/epics/, so
// "the folder" is whichever of the two exists — and exactly one must.
const FOLDER = existsSync(LIVE) ? LIVE : ARCHIVED;

describe(`${EPIC} lives in its Epic folder (AC-8.5, on this repo)`, () => {
  it('the Epic folder exists in exactly one place — live or archived', () => {
    expect(existsSync(LIVE) !== existsSync(ARCHIVED)).toBe(true);
  });

  it(`no .planning/${EPIC}-*.md is left at the top level`, () => {
    expect(readdirSync(PLANNING).filter((n) => n.startsWith(`${EPIC}-`))).toEqual([]);
  });

  it.each(['REQUIREMENTS', 'PLAN', 'VALIDATION', 'PROGRESS', 'RESEARCH'])(
    'resolveArtifactPath finds %s inside the folder',
    (artifact) => {
      expect(resolveArtifactPath(PLANNING, artifact, { currentEpic: EPIC }))
        .toBe(join(FOLDER, `${EPIC}-${artifact}.md`));
    },
  );

  // Only while the Epic is live: an archived Epic is never written to.
  it.runIf(existsSync(LIVE))('artifactName writes VERIFICATION into the live folder', () => {
    expect(artifactName('VERIFICATION', { currentEpic: EPIC, planningDir: PLANNING }))
      .toBe(`work/epics/${EPIC}/${EPIC}-VERIFICATION.md`);
  });

  it(`listItems({epic: '${EPIC}'}) returns SIG-161`, () => {
    expect(listItems(ROOT, { epic: EPIC }).map((r) => r.item.id)).toContain('SIG-161');
  });
});
