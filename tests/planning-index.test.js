// Tests for tools/lib/planning-index.js — the auto-generated `/sig:index`
// generator (M5.E3.S2 / FR3). Built up task by task:
//   t2 — enumeratePlanningDocs: mechanical doc catalog (path, tier, growth-policy)
//   t3 — parseExistingAnnotations: round-trip curated notes by key (two keyspaces + legend)
//   t4 — renderPlanningIndex / regeneratePlanningIndex: idempotent, parse↔render fixpoint

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enumeratePlanningDocs } from '../tools/lib/planning-index.js';

async function seedPlanning(base) {
  const p = join(base, '.planning');
  await mkdir(join(p, 'archive', 'M4.5', 'E1'), { recursive: true });
  await writeFile(join(p, 'PROJECT.md'), '# project\n', 'utf-8');
  await writeFile(join(p, 'DECISIONS.md'), '# decisions\n', 'utf-8');
  await writeFile(join(p, 'MILESTONE-5.md'), '# milestone\n', 'utf-8');
  await writeFile(join(p, 'M4.5.E1-RETROSPECTIVE.md'), '# retro\n', 'utf-8');
  await writeFile(join(p, 'RETROSPECTIVES.md'), '# retro index\n', 'utf-8');
  await writeFile(join(p, 'archive', 'M4.5', 'E1', 'M4.5.E1-PLAN.md'), '# archived plan\n', 'utf-8');
}

describe('enumeratePlanningDocs (t2) — mechanical doc catalog', () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'planning-index-'));
    await seedPlanning(base);
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('enumerates every .md doc under .planning/ (incl. archive), sorted by path', async () => {
    const docs = await enumeratePlanningDocs(base);
    const paths = docs.map((d) => d.path);
    expect(paths).toEqual([
      '.planning/DECISIONS.md',
      '.planning/M4.5.E1-RETROSPECTIVE.md',
      '.planning/MILESTONE-5.md',
      '.planning/PROJECT.md',
      '.planning/RETROSPECTIVES.md',
      '.planning/archive/M4.5/E1/M4.5.E1-PLAN.md',
    ]);
  });

  it('classifies COLD = under archive/ OR *-RETROSPECTIVE.md; everything else non-COLD', async () => {
    const docs = await enumeratePlanningDocs(base);
    const tier = Object.fromEntries(docs.map((d) => [d.path, d.tier]));
    expect(tier['.planning/M4.5.E1-RETROSPECTIVE.md']).toBe('COLD'); // retrospective
    expect(tier['.planning/archive/M4.5/E1/M4.5.E1-PLAN.md']).toBe('COLD'); // under archive/
    expect(tier['.planning/RETROSPECTIVES.md']).toBe('LIVE'); // the INDEX append-log, NOT a *-RETROSPECTIVE.md
    expect(tier['.planning/DECISIONS.md']).toBe('LIVE');
    expect(tier['.planning/PROJECT.md']).toBe('LIVE');
  });

  it('carries the growth-policy (classifyDocGrowthPolicy) + byte size per doc', async () => {
    const docs = await enumeratePlanningDocs(base);
    const gp = Object.fromEntries(docs.map((d) => [d.path, d.growthPolicy]));
    expect(gp['.planning/DECISIONS.md']).toBe('append-log');
    expect(gp['.planning/RETROSPECTIVES.md']).toBe('append-log');
    expect(gp['.planning/MILESTONE-5.md']).toBe('milestone');
    expect(gp['.planning/PROJECT.md']).toBe('other');
    for (const d of docs) expect(typeof d.bytes).toBe('number');
  });

  it('returns [] when .planning/ is absent (no throw)', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'planning-index-empty-'));
    expect(await enumeratePlanningDocs(empty)).toEqual([]);
    await rm(empty, { recursive: true, force: true });
  });
});
