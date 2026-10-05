// AC-8.5 on THIS repository (M6.E11 VERIFY loop 1, L3).
//
// t7.5 moved M6.E11 into its own Epic folder: its artifacts live there (now
// archived), and its item SIG-161 is a record whose Epic is M6.E11. The unit tests prove
// the resolvers on fixtures; this pins that the move actually happened here
// and that the phase commands' resolvers find the moved files — so a later
// change that puts an `M6.E11-*.md` back at the top level, or breaks folder
// resolution, fails the suite instead of being noticed by a reader.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveArtifactPath } from '../plugin/tools/lib/resume.js';
import { ROOT_ONLY_ARTIFACTS } from '../plugin/tools/lib/work-ops.js';
import { listRecords } from '../plugin/tools/lib/work-records.js';

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

  // The retrospective and profile stay at the root (D-M6E11-33 amended):
  // their readers look only there.
  it(`no .planning/${EPIC}-*.md is left at the top level, except the root-only ones`, () => {
    const rootOnly = ROOT_ONLY_ARTIFACTS.map((a) => `${EPIC}-${a}.md`);
    expect(readdirSync(PLANNING).filter((n) => n.startsWith(`${EPIC}-`) && !rootOnly.includes(n))).toEqual([]);
  });

  it.each(['REQUIREMENTS', 'PLAN', 'VALIDATION', 'PROGRESS', 'RESEARCH'])(
    'resolveArtifactPath finds %s inside the folder',
    (artifact) => {
      expect(resolveArtifactPath(PLANNING, artifact, { currentEpic: EPIC }))
        .toBe(join(FOLDER, `${EPIC}-${artifact}.md`));
    },
  );

  // A record never moves; its Epic is derived from its events (M6.E13). The
  // v1 half (the item file in the folder) and the live-folder artifactName
  // case were removed at t7.4: the store is v2 and M6.E11 is archived, so
  // neither could run again (artifactName is pinned on fixtures in
  // work-epic-resolve.test.js).
  it(`the records whose Epic is ${EPIC} include SIG-161`, () => {
    expect(listRecords(ROOT).records.filter((r) => r.epic === EPIC).map((r) => r.id)).toContain('SIG-161');
  });
});
