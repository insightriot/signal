// M5.E2.S2.t4 — the BLOCKING dangling-link gate (FM7), the load-bearing proof.
//
// Turns the prototype's ADVISORY verify (archive-migrate.mjs:115-133 — scan then
// `console.log` AFTER the moves already committed) into a hard abort + surgical
// rollback. The load-bearing MUTATION: skip ONE referrer's rewrite so a link
// dangles after the move. An advisory-only gate (scan → log → succeed) leaves the
// files mutated and reports success → the byte-identical / rejects asserts FAIL
// (that is the RED). The blocking gate rolls every touched file back byte-identical
// and throws → GREEN. Also: anchors flagged (not silently passed), reference-style
// / HTML links surfaced (detect-and-warn floor), clean run + INDEX + pre-existing
// dangle → no false abort.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyArchiveTree } from '../tools/lib/archive-tree.js';
import {
  createSnapshotter,
  scanDanglingLinks,
  scanResidualFlatPaths,
  partitionDangling,
  enforceNoDangling,
  renderDryRun,
} from '../tools/lib/migrate-memory.js';

const PLAN_BODY = '# M6.E1 plan\n\nContent that must survive verbatim.\n';
const HUGE = 'meaningful narrative words across a sentence here. '.repeat(220); // > 8 KB → V1+V2
const STATE_SIMPLE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases: []\nblockers: []\n---\n# Project State\n\nSee [the plan](M6.E1-PLAN.md).\n`;
const STATE_HUGE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "DISCUSS (2026-07-01) — ${HUGE}"\nblockers: []\n---\n` +
  `# Project State\n\n## Resume pointer\n\nlive pointer\n`;

// Common closed-Epic archive-tree fixture: a retro (the closed signal) + the
// scaffold that will move + referrers linking it.
async function archiveFixture(planningDir, { stateBody = STATE_SIMPLE, extra = {} } = {}) {
  await writeFile(join(planningDir, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
  await writeFile(join(planningDir, 'M6.E1-PLAN.md'), PLAN_BODY, 'utf-8');
  await writeFile(join(planningDir, 'STATE.md'), stateBody, 'utf-8');
  for (const [name, body] of Object.entries(extra)) {
    await writeFile(join(planningDir, name), body, 'utf-8');
  }
}

describe('M5.E2.S2.t4 blocking dangling-link gate — skip-a-referrer mutation', () => {
  let dir;
  let planningDir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-linkverify-'));
    planningDir = join(dir, '.planning');
    await mkdir(planningDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('MUTATION A: a skipped referrer rewrite → HARD abort + surgical rollback (advisory-only FAILS this)', async () => {
    // Two referrers both link the scaffold that is about to move.
    await archiveFixture(planningDir, {
      extra: { 'NOTES.md': '# Notes\n\nsee [plan](M6.E1-PLAN.md)\n' },
    });
    const stateBefore = await readFile(join(planningDir, 'STATE.md'), 'utf-8');
    const notesBefore = await readFile(join(planningDir, 'NOTES.md'), 'utf-8');
    const planBefore = await readFile(join(planningDir, 'M6.E1-PLAN.md'), 'utf-8');

    // The SAME surgical snapshot the apply builds (createSnapshotter): the touched
    // referrers, the moving source, and its not-yet-existent dest (rollback removes it).
    const { snap, rollback } = createSnapshotter(planningDir);
    await snap('STATE.md');
    await snap('NOTES.md');
    await snap('M6.E1-PLAN.md');
    await snap('archive/M6/E1/M6.E1-PLAN.md');

    // Baseline BEFORE the move — clean (every link resolves).
    const baseline = await scanDanglingLinks(dir);
    expect(baseline).toHaveLength(0);

    // Real archive-tree move + referrer rewrites.
    const { moveMap } = await applyArchiveTree(dir, { apply: true });
    expect(existsSync(join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(true);

    // MUTATION: skip ONE referrer's rewrite — revert NOTES.md to its pre-move bytes
    // (on-disk-identical to a rewrite that never ran) so its link now dangles.
    await writeFile(join(planningDir, 'NOTES.md'), notesBefore, 'utf-8');

    // The BLOCKING gate: real baseline + real moveMap + the apply's surgical rollback.
    // Advisory-only (scan → log → return) would NOT throw here → this rejects FAILS (RED).
    await expect(
      enforceNoDangling(dir, { baseline, moveMap, rollback }),
    ).rejects.toThrow(/dangling/i);

    // Rollback restored EVERY touched file byte-identical AND put the moved file back.
    // Advisory-only leaves them mutated → these byte-identical asserts FAIL (RED).
    expect(await readFile(join(planningDir, 'STATE.md'), 'utf-8')).toBe(stateBefore);
    expect(await readFile(join(planningDir, 'NOTES.md'), 'utf-8')).toBe(notesBefore);
    expect(await readFile(join(planningDir, 'M6.E1-PLAN.md'), 'utf-8')).toBe(planBefore);
    expect(existsSync(join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(false);
  });

  it('CLEAN run — every referrer rewritten → zero dangling, no false abort', async () => {
    await archiveFixture(planningDir);
    const baseline = await scanDanglingLinks(dir);
    const { rollback } = createSnapshotter(planningDir);
    const { moveMap } = await applyArchiveTree(dir, { apply: true });

    const res = await enforceNoDangling(dir, { baseline, moveMap, rollback });
    expect(res.flags).toHaveLength(0); // resolved, nothing to flag
    // The migrate stands — no rollback of a clean run.
    expect(existsSync(join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(true);
  });

  it('§10: an INDEX-referenced moved file → NO false abort (INDEX dangle is FLAGGED, not aborted)', async () => {
    // INDEX links the scaffold; archive-tree deliberately does NOT rewrite INDEX (§10),
    // so after the move its link dangles — this must FLAG, never abort+rollback.
    await archiveFixture(planningDir, {
      extra: { 'INDEX.md': '# Index\n\n- [M6.E1 plan](M6.E1-PLAN.md)\n' },
    });
    const baseline = await scanDanglingLinks(dir);
    const { rollback } = createSnapshotter(planningDir);
    const { moveMap } = await applyArchiveTree(dir, { apply: true });

    const res = await enforceNoDangling(dir, { baseline, moveMap, rollback });
    // No throw → no false abort. The stale INDEX link is a FLAG.
    expect(res.flags.some((f) => f.file === '.planning/INDEX.md')).toBe(true);
    // The move stands (nothing rolled back).
    expect(existsSync(join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(true);
    // INDEX.md left byte-unchanged (§10).
    expect(await readFile(join(planningDir, 'INDEX.md'), 'utf-8')).toContain('[M6.E1 plan](M6.E1-PLAN.md)');
  });

  it('FR6.3: a PRE-EXISTING dangle is NOT attributed to the migrate (no false abort)', async () => {
    // A dangle that predates the migrate, unrelated to any moved file.
    await archiveFixture(planningDir, {
      extra: { 'NOTES.md': '# Notes\n\nsee [gone](MISSING.md)\n' },
    });
    const baseline = await scanDanglingLinks(dir);
    expect(baseline.some((d) => d.target === 'MISSING.md')).toBe(true); // present BEFORE

    const { rollback } = createSnapshotter(planningDir);
    const { moveMap } = await applyArchiveTree(dir, { apply: true });
    // The pre-existing MISSING.md dangle persists but is baseline-subtracted → no abort.
    const res = await enforceNoDangling(dir, { baseline, moveMap, rollback });
    expect(res.flags).toHaveLength(0);
    expect(existsSync(join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(true);
  });

  it('residual flat path: a skipped .planning/<file> prose rewrite → abort (non-INDEX) / flag (INDEX)', async () => {
    const moveMap = new Map([
      ['.planning/M6.E1-PLAN.md', '.planning/archive/M6/E1/M6.E1-PLAN.md'],
    ]);
    // A prose location-assertion the rewrite skipped — the OLD flat path still present.
    await writeFile(
      join(planningDir, 'DOC.md'),
      '# Doc\n\nThe plan lives at .planning/M6.E1-PLAN.md still.\n',
      'utf-8',
    );
    const residual = await scanResidualFlatPaths(dir, moveMap);
    expect(
      residual.some((r) => r.file === '.planning/DOC.md' && r.target === '.planning/M6.E1-PLAN.md'),
    ).toBe(true);

    // Non-INDEX residual → aborts.
    expect(partitionDangling({ residual }).aborting).toHaveLength(1);
    // The same residual under INDEX.md → flagged, never aborted (§10).
    const pIndex = partitionDangling({
      residual: [{ file: '.planning/INDEX.md', target: '.planning/M6.E1-PLAN.md' }],
    });
    expect(pIndex.aborting).toHaveLength(0);
    expect(pIndex.flags).toHaveLength(1);
  });
});

describe('M5.E2.S2.t4 dry-run surfacing — anchors flagged + detect-and-warn floor', () => {
  let dir;
  let planningDir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-linkverify-dry-'));
    planningDir = join(dir, '.planning');
    await mkdir(planningDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('an anchor into a file the migrate rewrites is FLAGGED at-risk (not silently passed)', async () => {
    // HUGE prose → V1+V2 fire → STATE.md is rewritten → its #headings may move.
    await writeFile(join(planningDir, 'STATE.md'), STATE_HUGE, 'utf-8');
    await writeFile(join(planningDir, 'DOC.md'), 'see [state](STATE.md#resume-pointer)\n', 'utf-8');

    const out = await renderDryRun(dir);
    expect(out).toMatch(/at-risk anchors/i);
    expect(out).toContain('STATE.md#resume-pointer');
  });

  it('reference-style [a]: path + HTML <a href> links are surfaced (detect-and-warn), not silently dropped', async () => {
    await writeFile(join(planningDir, 'STATE.md'), STATE_SIMPLE, 'utf-8');
    await writeFile(
      join(planningDir, 'REFS.md'),
      '[plan]: M6.E1-PLAN.md\n<a href="M6.E1-REQUIREMENTS.md">req</a>\n',
      'utf-8',
    );

    const out = await renderDryRun(dir);
    expect(out).toMatch(/reference-style \/ html links/i);
    expect(out).toContain('[reference] M6.E1-PLAN.md');
    expect(out).toContain('[html] M6.E1-REQUIREMENTS.md');
  });
});
