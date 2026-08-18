// Tests for shipFR1Check — the command-internal layer of D-E9-8 layered
// enforcement, invoked from commands/ship.md (M4.5.E9.S1.t6).
//
// Covers AC1, AC1-extended, AC2 (command-internal path), AC3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { shipFR1Check } from '../plugin/tools/lib/retrospective.js';

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
    join(process.cwd(), 'plugin', 'references', 'retrospective-template.md'),
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

  // REWRITTEN 2026-07-27 (M5.E9 S1.t6, B42 / D-M5E9-1). These two cases used to
  // assert `{halt:true, NO_CURRENT_EPIC}` for a null current_epic — M4.5.E9's
  // AC1-extended, shipped in v0.1.3. That criterion is SUPERSEDED, not merely
  // relaxed: it made `/sig:ship` unrunnable for any project in linear mode,
  // which six of the seven phase commands document as first-class.
  //
  // Kept as rewritten cases rather than deleted, deliberately: a deleted test
  // and a fixed bug look identical in the suite count, and the pair below is
  // what proves the fix is scoped rather than blanket. See
  // .planning/M5.E9-REQUIREMENTS.md AC1.1/AC1.2 and
  // .planning/archive/M4.5/E9/M4.5.E9-VERIFICATION.md (superseded-by pointer).
  it('skips (does not halt) when current_epic is empty — linear mode (AC1.1, supersedes AC1-extended)', async () => {
    const result = await shipFR1Check({
      state: { current_epic: null },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/linear/i);
  });

  it('treats a malformed current_epic as linear, matching detectMode (AC1.1)', async () => {
    // `v0.1.6` is a release tag, not an Epic ID (D-E11-4). detectMode fail-opens
    // it to linear everywhere in Signal; this gate must not read it as "broken",
    // or the regex schism state.js:100-108 records as fixed re-opens here.
    const result = await shipFR1Check({
      state: { current_epic: 'v0.1.6' },
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('still halts when state itself is missing — a broken project, not a linear one (AC1.2)', async () => {
    // The divergence proof: this is what stops a blanket "always skip" fix from
    // passing the suite. Missing STATE.md is not a supported mode.
    const result = await shipFR1Check({
      state: null,
      profile: { tier: 'FULL' },
      milestoneContent: MILESTONE_FIXTURE_FULL_SHIPPED,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_CURRENT_EPIC');
    expect(result.message).toMatch(/STATE\.md/);
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

  it('B30 (M5.E6 FR5): DOES fire on a fresh REVIEW→SHIP flow — phase REVIEW (last pre-ship) + full completed_phases + no row halts NO_RETRO_FILE', async () => {
    // Sanctioned inversion (M5.E6.T16). The original B26-era expectation here
    // was "phase must be SHIP to fall back" — assert skip. B30 supersedes it:
    // the FR1 pre-check runs BEFORE the SHIP transition, so at Epic-close the
    // state legitimately reads phase: REVIEW (the FULL tier's last pre-ship
    // phase) with no milestone row. That is an about-to-close Epic, so
    // shipFR1Check synthesizes the post-transition state in-memory and MUST halt
    // for a missing retro rather than silently skip.
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
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_RETRO_FILE');
  });
});

// B30 (M5.E6 FR5) — the FR1 retro pre-check runs at `/sig:ship` Step 0.5,
// BEFORE the SHIP transition. On a fresh REVIEW→SHIP flow STATE still reads
// `phase: <last pre-ship phase>` (REVIEW for FULL) with SHIP not yet in
// completed_phases and no milestone row for the Epic. Neither isEpicCloseShip
// (no row) nor B26's phase===SHIP fallback recognizes the imminent Epic-close,
// so the gate SILENTLY SKIPPED — an Epic could ship with no retro (surfaced
// dogfooding B26 on M5.E5's own SHIP). The fix detects the about-to-close shape
// and evaluates isEpicCloseByState against an IN-MEMORY synthesized
// post-transition state, persisting nothing (D-M5E6-5 / approach (c)).

describe('shipFR1Check — B30 fresh REVIEW→SHIP retro gate (M5.E6 FR5)', () => {
  let base;
  beforeEach(async () => {
    base = await makeTempBase();
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC5.1: halts NO_RETRO_FILE on a fresh REVIEW→SHIP flow (REVIEW not yet in completed_phases, no row, no retro)', async () => {
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'REVIEW',
        completed_phases: [
          'DISCUSS (2026-07-20)',
          'PLAN (2026-07-20)',
          'EXECUTE (2026-07-20)',
          'VERIFY (2026-07-21)',
        ],
      },
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_RETRO_FILE');
    expect(result.retroPath).toBe('.planning/M5.E4-RETROSPECTIVE.md');
  });

  it('AC5.2: once a valid retro exists, the same fresh flow proceeds and recognizes Epic-close (re-enables the §5.5/§6/§6.5 downstream paths)', async () => {
    await writeFile(
      join(base, '.planning', 'M5.E4-RETROSPECTIVE.md'),
      VALID_FULL_RETRO,
    );
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'REVIEW',
        completed_phases: [
          'DISCUSS (2026-07-20)',
          'PLAN (2026-07-20)',
          'EXECUTE (2026-07-20)',
          'VERIFY (2026-07-21)',
        ],
      },
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.retroPath).toBe('.planning/M5.E4-RETROSPECTIVE.md');
    expect(result.isEpicClose).toBe(true);
  });

  // --- AC5.3 no-false-fire guards ---------------------------------------
  // Each case must SKIP (not halt). They are constructed so a too-broad
  // `aboutToClose` predicate would trip them:
  //   • maintained-pending  → bites dropping the `rowStatus === null` guard
  //   • SKETCH mid-flow      → bites dropping the `phase === lastPreShip` guard
  //     (its short required set means synth-adding lastPreShip would complete it)
  //   • FULL mid-flow EXECUTE → realistic mid-flow Epic that must never halt
  // (the `shipsAtAll` guard's witness is the SPIKE test above at :339.)

  it('AC5.3 no-false-fire (maintained-pending): a present "pending" row at phase REVIEW still SKIPS', async () => {
    // If aboutToClose dropped the rowStatus===null guard, phase REVIEW (=last
    // pre-ship) would synth-close and halt even though a maintained pending row
    // says this is a legit per-slice ship. It must skip.
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'REVIEW',
        completed_phases: SELF_HOSTED_STATE_FULL.completed_phases,
      },
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_E4_PENDING,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('AC5.3 no-false-fire (SKETCH mid-flow): phase EXECUTE (not the last pre-ship VERIFY) SKIPS', async () => {
    // SKETCH's last pre-ship phase is VERIFY. If aboutToClose dropped the
    // `phase === lastPreShip` guard, synth-adding VERIFY would complete SKETCH's
    // short required set and wrongly halt this mid-EXECUTE Epic. It must skip.
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'EXECUTE',
        completed_phases: [
          'DISCUSS (2026-07-20)',
          'PLAN (2026-07-20)',
          'EXECUTE (2026-07-20)',
        ],
      },
      profile: { tier: 'SKETCH', phases_skipped: ['REVIEW'] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('AC5.3 no-false-fire (FULL mid-flow EXECUTE): a genuinely mid-flow Epic SKIPS', async () => {
    const result = await shipFR1Check({
      state: {
        current_epic: 'M5.E4',
        phase: 'EXECUTE',
        completed_phases: [
          'DISCUSS (2026-07-20)',
          'PLAN (2026-07-20)',
          'EXECUTE (2026-07-20)',
        ],
      },
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('AC5.4/5.5: halting on the fresh flow persists nothing — the caller state is not mutated and no STATE.md is written', async () => {
    // approach (c): the post-transition state is synthesized IN MEMORY. Freeze
    // the input (a mutation attempt would throw in strict-mode ESM) and confirm
    // no state file is written to the fixture.
    const state = Object.freeze({
      current_epic: 'M5.E4',
      phase: 'REVIEW',
      completed_phases: Object.freeze([
        'DISCUSS (2026-07-20)',
        'PLAN (2026-07-20)',
        'EXECUTE (2026-07-20)',
        'VERIFY (2026-07-21)',
      ]),
    });
    const result = await shipFR1Check({
      state,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_NO_E4_ROW,
      baseDir: base,
    });
    // The synth path ran (gate fired) ...
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_RETRO_FILE');
    // ... without mutating the caller's state ...
    expect(state.phase).toBe('REVIEW');
    expect(state.completed_phases).toHaveLength(4);
    // ... and without writing any state file to disk.
    expect(existsSync(join(base, '.planning', 'STATE.md'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M5.E13 S4.t1 (FR3.1) — `B36`: a STALE milestone row must not skip silently.
//
// Sighted live THREE times — M5.E6, M5.E9, and M5.E8's own ship, where the
// retrospective existed only because someone wrote it before the gate ran.
//
// The mechanism: B26's and B30's fallbacks are BOTH row-absence-gated
// (`rowStatus === null`, per D-E9-5 "a maintained row wins"). B36's case is a
// row that EXISTS but is stale — "🔨 DISCUSS", "▶ NEXT" — so neither fallback
// fires, isEpicCloseShip is false (the row does not say "shipped"), and the
// gate returns {skipped} with a reason indistinguishable from a legitimate
// per-slice ship.
//
// FR3.1's remedy is REPORT, not repair: a gate that cannot evaluate says so
// loudly (NFR3). Repairing detection here would mean overriding a maintained
// row, which is exactly what D-E9-5 decided against for per-slice ships.
// ---------------------------------------------------------------------------
describe('M5.E13 S4.t1 — B36: a stale milestone row skips LOUDLY (FR3.1)', () => {
  let base;
  const MILESTONE_STALE_E4_ROW = [
    '# Milestone 5',
    '',
    '| Epic | Status | Notes |',
    '|---|---|---|',
    '| **E4** | 🔨 DISCUSS | in flight |',
    '',
  ].join('\n');

  const CLOSING_STATE = {
    current_epic: 'M5.E4',
    phase: 'REVIEW',
    completed_phases: [
      'DISCUSS (2026-07-20)',
      'PLAN (2026-07-20)',
      'EXECUTE (2026-07-20)',
      'VERIFY (2026-07-21)',
    ],
  };

  beforeEach(async () => {
    base = await makeTempBase();
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC3.1 — the skip is FLAGGED as unevaluated, with its cause named', async () => {
    const result = await shipFR1Check({
      state: CLOSING_STATE,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_STALE_E4_ROW,
      baseDir: base,
    });
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
    // The discriminating assertion: this skip is distinguishable from a
    // legitimate per-slice skip, which is what made B36 invisible three times.
    expect(result.unevaluated).toBe(true);
    expect(result.cause).toBe('stale-milestone-row');
  });

  it('AC3.1 — the reason names the row\'s actual status and what to do', async () => {
    const result = await shipFR1Check({
      state: CLOSING_STATE,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_STALE_E4_ROW,
      baseDir: base,
    });
    expect(result.reason).toContain('🔨 DISCUSS');   // the row as it actually reads
    expect(result.reason).toContain('M5.E4');        // which Epic
    expect(result.rowStatus).toBe('🔨 DISCUSS');
  });

  it('a LEGITIMATE per-slice skip is NOT flagged (no false alarm)', async () => {
    // Mid-Epic: phase is EXECUTE, nowhere near close. A maintained row wins and
    // the skip is genuine, so it must stay unflagged — otherwise every slice
    // ship cries wolf and the flag becomes noise.
    const result = await shipFR1Check({
      state: { current_epic: 'M5.E4', phase: 'EXECUTE', completed_phases: ['DISCUSS (2026-07-20)'] },
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_STALE_E4_ROW,
      baseDir: base,
    });
    expect(result.skipped).toBe(true);
    expect(result.unevaluated).toBeUndefined();
  });

  it('a row that DOES say shipped still evaluates the gate normally (no regression)', async () => {
    const shipped = MILESTONE_STALE_E4_ROW.replace('🔨 DISCUSS', '✅ shipped');
    const result = await shipFR1Check({
      state: CLOSING_STATE,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: shipped,
      baseDir: base,
    });
    // No retro on disk → the gate RAN and halted. That is the point.
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_RETRO_FILE');
  });

  it('linear mode is untouched — still a clean, unflagged skip (D-M5E9-1)', async () => {
    const result = await shipFR1Check({
      state: { current_epic: null, phase: 'REVIEW', completed_phases: [] },
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: MILESTONE_STALE_E4_ROW,
      baseDir: base,
    });
    expect(result.skipped).toBe(true);
    expect(result.unevaluated).toBeUndefined();
  });
});
