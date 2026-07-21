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

// B26 (M5.E5.T2) — STATE-based Epic-close fallback. The FR1 retro gate was
// 100% milestone-table-driven: findEpicStatusRow returns null when the
// MILESTONE-{n}.md file has no row for the current Epic (as MILESTONE-5.md had
// no E4 row), so isEpicCloseShip returned false and the whole gate silently
// skipped at M5.E4's SHIP. shipFR1Check now falls back to STATE — but ONLY when
// the milestone row is ABSENT, so a maintained "pending" row still wins.

// A milestone table with NO row for E4 — the self-hosted M5.E4 shape.
const MILESTONE_NO_E4_ROW = `
| **Epic** | Status | Notes |
|---|---|---|
| **E1 — foo** | **✓ shipped 2026-07-15** | |
| **E2 — bar** | **✓ shipped 2026-07-18** | |
| **E3 — baz** | **✓ shipped 2026-07-20** | |
`;

// A milestone table whose E4 row is MAINTAINED and reads "pending" — the
// legit per-slice-ship shape that must still skip (D-E9-5).
const MILESTONE_E4_PENDING = `
| **Epic** | Status | Notes |
|---|---|---|
| E4 — carry-overs | S1 shipped; S2-S5 pending | |
`;

// STATE for a completed self-hosted Epic: phase SHIP, all FULL pre-SHIP phases
// recorded (with the "(date)" suffix the match must tolerate).
const SELF_HOSTED_STATE_FULL = {
  current_epic: 'M5.E4',
  phase: 'SHIP',
  completed_phases: [
    'DISCUSS (2026-07-20)',
    'PLAN (2026-07-20)',
    'EXECUTE (2026-07-20)',
    'VERIFY (2026-07-21)',
    'REVIEW (2026-07-21)',
  ],
};

describe('shipFR1Check — B26 STATE-based Epic-close fallback (M5.E5.T2)', () => {
  let base;
  beforeEach(async () => {
    base = await makeTempBase();
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC2.1: fires on the self-hosted no-row Epic-close shape — halts NO_RETRO_FILE', async () => {
    // No retro on disk + no milestone row for E4 → the M5.E4 scenario.
    const result = await shipFR1Check({
      state: SELF_HOSTED_STATE_FULL,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_RETRO_FILE');
    expect(result.retroPath).toBe('.planning/M5.E4-RETROSPECTIVE.md');
  });

  it('AC2.1: passes once a valid retro exists for the self-hosted no-row Epic', async () => {
    await writeFile(
      join(base, '.planning', 'M5.E4-RETROSPECTIVE.md'),
      VALID_FULL_RETRO,
    );
    const result = await shipFR1Check({
      state: SELF_HOSTED_STATE_FULL,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.retroPath).toBe('.planning/M5.E4-RETROSPECTIVE.md');
    expect(result.isEpicClose).toBe(true);
  });

  it('AC2.2: no false-fire — a maintained "pending" row still skips even with full completed_phases', async () => {
    // Row present + says pending → isEpicCloseShip false AND the STATE fallback
    // is gated on row-ABSENCE, so a legit per-slice ship is not forced to retro.
    const result = await shipFR1Check({
      state: SELF_HOSTED_STATE_FULL,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_E4_PENDING,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('AC2.3: tier-aware close — SKETCH closes at VERIFY, FEATURE/FULL at REVIEW (no row)', async () => {
    const cases = [
      { tier: 'FULL', phases_skipped: [], last: 'REVIEW' },
      { tier: 'FEATURE', phases_skipped: [], last: 'REVIEW' },
      { tier: 'SKETCH', phases_skipped: ['REVIEW'], last: 'VERIFY' },
    ];
    for (const { tier, phases_skipped, last } of cases) {
      const completed = [
        'DISCUSS (2026-07-20)',
        'PLAN (2026-07-20)',
        'EXECUTE (2026-07-20)',
        'VERIFY (2026-07-21)',
      ];
      if (last === 'REVIEW') completed.push('REVIEW (2026-07-21)');
      const result = await shipFR1Check({
        state: { current_epic: 'M5.E4', phase: 'SHIP', completed_phases: completed },
        profile: { tier, phases_skipped },
        milestoneContent: MILESTONE_NO_E4_ROW,
        baseDir: base,
      });
      expect(result.halt, `${tier} should reach Epic-close`).toBe(true);
      expect(result.code).toBe('NO_RETRO_FILE');
    }
  });

  it('AC2.3: SKETCH short of its last pre-SHIP phase (VERIFY missing) does NOT close', async () => {
    // Only through EXECUTE — SKETCH still needs VERIFY, so this is not close.
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'SHIP',
        completed_phases: ['DISCUSS (2026-07-20)', 'PLAN (2026-07-20)', 'EXECUTE (2026-07-20)'],
      },
      profile: { tier: 'SKETCH', phases_skipped: ['REVIEW'] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('AC2.3: SPIKE never reaches the STATE-based gate (SHIP is skipped, phase never SHIP)', async () => {
    // SPIKE's last non-skipped phase is VERIFY; phase is never SHIP, so the
    // STATE fallback (which requires phase: SHIP) can never fire.
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'VERIFY',
        completed_phases: [
          'DISCUSS (2026-07-20)',
          'PLAN (2026-07-20)',
          'EXECUTE (2026-07-20)',
          'VERIFY (2026-07-21)',
        ],
      },
      profile: { tier: 'SPIKE', phases_skipped: ['REVIEW', 'SHIP'] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('does not fall back to STATE when phase is not SHIP even with full completed_phases (no row)', async () => {
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'REVIEW',
        completed_phases: SELF_HOSTED_STATE_FULL.completed_phases,
      },
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });
});
