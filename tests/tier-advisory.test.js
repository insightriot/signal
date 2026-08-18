/**
 * tests/tier-advisory.test.js — B90: say that the tier dial turns down.
 *
 * The defect was never a missing capability. Per-unit profiles, `/sig:escalate`
 * de-escalation and `phases_skipped` all shipped releases ago; every surface
 * that introduced them said the dial only turns UP. Measured 2026-08-08 across
 * 12 local projects: 7 ran FULL and exactly 1 had ever written a per-unit
 * profile.
 *
 * So these tests pin the two things that make the fix a MECHANISM rather than
 * another paragraph: it fires on the real situation, and it goes quiet the
 * moment the dial has been found.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readTierAdvisory } from '../plugin/tools/lib/status.js';

const PROFILE = (tier) => `---
tier: ${tier}
schema_version: 1

calibration:
  scope: product
  stakes: major
  novelty: rare
  reversibility: painful
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: full
  performance_pass: true
  simplification_pass: true
  nyquist_enforcement: strict
  plan_validation_dims: all
  research_parallelism: 4
  gate_strictness: strict
  context_rot_reread: true
  review_depth: full

metadata:
  created_at: 2026-01-01T00:00:00Z
  created_by: test
  escalation_history: []
---
# fixture
`;

describe('B90 — the tier advisory', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-tier-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('fires on a FULL project with no per-unit override — the reported situation', async () => {
    await writeFile(join(dir, '.planning', 'PROFILE.md'), PROFILE('FULL'));
    const out = await readTierAdvisory(dir);
    expect(out).toBeTruthy();
    // It must name BOTH ways down. Naming only one leaves the other as buried
    // as it was, which is the defect.
    expect(out).toMatch(/-PROFILE\.md/);
    expect(out).toMatch(/\/sig:escalate/);
    expect(out).toMatch(/DOWN/);
    // …and the framing that reframes the whole thing.
    expect(out).toMatch(/CEILING, not a floor/);
  });

  it('goes SILENT once any per-unit profile exists — the dial has been found', async () => {
    await writeFile(join(dir, '.planning', 'PROFILE.md'), PROFILE('FULL'));
    await writeFile(join(dir, '.planning', 'M1.E1-PROFILE.md'), PROFILE('FEATURE'));
    expect(await readTierAdvisory(dir)).toBeNull();
  });

  it('says nothing below FULL — those tiers already skip phases', async () => {
    for (const tier of ['FEATURE', 'SKETCH', 'SPIKE']) {
      await writeFile(join(dir, '.planning', 'PROFILE.md'), PROFILE(tier));
      expect(await readTierAdvisory(dir), `${tier} must be silent`).toBeNull();
    }
  });

  it('is fail-open — no PROFILE, no .planning, garbage: null, never a throw', async () => {
    expect(await readTierAdvisory(dir)).toBeNull(); // .planning exists, no PROFILE
    expect(await readTierAdvisory(join(tmpdir(), 'nope-xyz'))).toBeNull();
    await writeFile(join(dir, '.planning', 'PROFILE.md'), 'not: [valid\n');
    expect(await readTierAdvisory(dir)).toBeNull();
  });

  it('is read-only — it never creates the profile it recommends', async () => {
    await writeFile(join(dir, '.planning', 'PROFILE.md'), PROFILE('FULL'));
    const { readdir } = await import('node:fs/promises');
    const before = (await readdir(join(dir, '.planning'))).sort();
    await readTierAdvisory(dir);
    expect((await readdir(join(dir, '.planning'))).sort()).toEqual(before);
  });
});

describe('B90 — the one-way framing is gone from the docs that introduce the dial', () => {
  it('CLAUDE.md no longer says escalate only promotes', async () => {
    const { readFile } = await import('node:fs/promises');
    const s = await readFile(new URL('../CLAUDE.md', import.meta.url), 'utf-8');
    expect(s).not.toMatch(/`\/sig:escalate` promotes tier mid-flight if scope grows/);
    expect(s).toMatch(/EITHER direction/);
    expect(s).toMatch(/CEILING, not a floor/);
  });

  it('escalate.md advertises the down direction in its own description', async () => {
    // The command list is where a user meets this command. If the description
    // says "escape hatch when scope grows", the down path stays invisible no
    // matter what §Case C says 87 lines in.
    const { readFile } = await import('node:fs/promises');
    const s = await readFile(new URL('../plugin/commands/escalate.md', import.meta.url), 'utf-8');
    const frontmatter = s.slice(0, s.indexOf('---', 4));
    expect(frontmatter).toMatch(/UP OR DOWN/);
  });

  it('tier-definitions.md states the ceiling rule', async () => {
    const { readFile } = await import('node:fs/promises');
    const s = await readFile(new URL('../plugin/references/tier-definitions.md', import.meta.url), 'utf-8');
    expect(s).toMatch(/CEILING, not a floor/);
    expect(s).toMatch(/shifts a profile UP OR DOWN/);
  });
});
