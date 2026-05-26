// Tests for shipFR1Check — the command-internal layer of D-E9-8 layered
// enforcement, invoked from commands/ship.md (M4.5.E9.S1.t6).
//
// Covers AC1, AC1-extended, AC2 (command-internal path), AC3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { shipFR1Check } from '../tools/lib/retrospective.js';

const VALID_FULL_RETRO = `# M4.5.E3 Retrospective

> _Stub_

## Timeline

${'Substantive timeline content. '.repeat(10)}

## What changed mid-flight

${'Nothing changed. '.repeat(10)}

## What assumptions broke

${'No assumptions broke. '.repeat(10)}

## What surprised us

${'Nothing surprised us. '.repeat(10)}

## What we'd do differently

${'Same approach. '.repeat(10)}

## What to feed back into Signal

${'No feedback. '.repeat(10)}

## Anti-rationalization moment

${'We almost rationalized away X but kept it because Y. '.repeat(5)}

## Links

- Plan: foo.md
`;

const MILESTONE_FIXTURE_FULL_SHIPPED = `
| **Epic** | Status | Notes |
|---|---|---|
| **E3 — docs rewrite** | **✓ shipped 2026-05-24** | |
| E2 — sig:add | S1 shipped; S2-S5 pending | |
| **E1 — install path** | S1 shipped; **S3-S5 ⏸ shelved** | |
`;

async function makeTempBase() {
  const base = await mkdtemp(join(tmpdir(), 'signal-ship-fr1-'));
  await mkdir(join(base, '.planning'), { recursive: true });
  await mkdir(join(base, 'references'), { recursive: true });
  // Need real template so loadTemplate can be called downstream.
  await cp(
    join(process.cwd(), 'references', 'retrospective-template.md'),
    join(base, 'references', 'retrospective-template.md'),
  );
  return base;
}

describe('shipFR1Check', () => {
  let base;
  beforeEach(async () => {
    base = await makeTempBase();
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('passes when retro exists, is valid, and Epic is closing (AC3)', async () => {
    await writeFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      VALID_FULL_RETRO,
    );
    const result = await shipFR1Check({
      state: { current_epic: 'M4.5.E3' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.retroPath).toBe('.planning/M4.5.E3-RETROSPECTIVE.md');
  });

  it('halts with NO_RETRO_FILE when retro is missing (AC1)', async () => {
    const result = await shipFR1Check({
      state: { current_epic: 'M4.5.E3' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_RETRO_FILE');
    expect(result.message).toMatch(/RETROSPECTIVE\.md/);
    expect(result.message).toMatch(/M4\.5\.E3/);
    // Tier-aware template anchor included.
    expect(result.message).toMatch(/references\/retrospective-template\.md/);
    expect(result.message.toLowerCase()).toContain('full');
  });

  it('halts with INVALID_RETRO when content fails validation', async () => {
    await writeFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      '## What worked\n\nx\n', // wrong heading for FULL + tiny
    );
    const result = await shipFR1Check({
      state: { current_epic: 'M4.5.E3' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('INVALID_RETRO');
    expect(result.message).toMatch(/missing required section heading/i);
  });

  it('halts with NO_CURRENT_EPIC when state.current_epic is empty (AC1-extended)', async () => {
    const result = await shipFR1Check({
      state: { current_epic: null },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_CURRENT_EPIC');
    expect(result.message).toMatch(/current_epic/);
    expect(result.message).toMatch(/sig:resume/);
  });

  it('halts with NO_CURRENT_EPIC when state itself is missing', async () => {
    const result = await shipFR1Check({
      state: null,
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_CURRENT_EPIC');
  });

  it("returns skipped when SHIP is per-Slice, not Epic-close", async () => {
    // E2 has S1 shipped + S2-S5 pending → not Epic-close.
    const result = await shipFR1Check({
      state: { current_epic: 'M4.5.E2' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/per-Slice|Epic-close/i);
  });

  it('treats shelved-only-remaining Epics as Epic-close (regression E1.S3-S5)', async () => {
    // E1 has S1 shipped + S3-S5 shelved → no pending → Epic-close.
    // Without a retro, FR1 should halt.
    const result = await shipFR1Check({
      state: { current_epic: 'M4.5.E1' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_RETRO_FILE');
  });

  it('uses the right template anchor per profile.tier (SKETCH, FEATURE, SPIKE)', async () => {
    for (const tier of ['SKETCH', 'FEATURE', 'SPIKE']) {
      const result = await shipFR1Check({
        state: { current_epic: 'M4.5.E3' },
        profile: { tier },
        milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
        baseDir: base,
      });
      expect(result.halt).toBe(true);
      expect(result.code).toBe('NO_RETRO_FILE');
      expect(result.message.toLowerCase()).toContain(tier.toLowerCase());
    }
  });

  it('halts identically regardless of any extra args (AC2 — no bypass)', async () => {
    // The contract is that shipFR1Check has no toggle to skip. We confirm
    // by passing arbitrary extra props and observing the same halt.
    const r1 = await shipFR1Check({
      state: { current_epic: 'M4.5.E3' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    const r2 = await shipFR1Check({
      state: { current_epic: 'M4.5.E3' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
      // Arbitrary extras — function should ignore them.
      force: true,
      bypass: true,
      noRetro: true,
    });
    expect(r2).toEqual(r1);
  });
});
