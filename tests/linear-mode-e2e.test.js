// COVERAGE-GAP GUARD — do not delete without reading this comment. (M5.E9 FR8, AC8.3)
//
// This file exists because Signal cannot test itself on this path.
//
// Signal-on-Signal has run in EPIC MODE since M4.5.E11 (2026-07-15). Every
// dogfood run since then has had a strict `current_epic`, and every dogfood run
// starts each Epic with `completed_phases` reset to [] by `setCurrentEpic`. So
// the two conditions below have NEVER been exercised by Signal's own use:
//
//   1. LINEAR MODE — a project with `current_epic: null`, which
//      `commands/new-project.md:35` documents as first-class ("Without --epic,
//      the project starts in linear mode") and which six of the seven phase
//      commands support byte-identically.
//   2. A MULTI-RUN `completed_phases` — a phase ledger spanning more than one
//      unit of work, which any project past its first slice accumulates.
//
// Four confirmed bugs lived in exactly that intersection for NINE releases
// (B42/B43/B44/B45, cataloged 2026-07-26 from a live outside report, not from
// Signal's own suite). None of them was subtle. They were simply unreachable
// from the way Signal is developed.
//
// If this file ever looks redundant, that is the symptom, not the diagnosis:
// it is redundant with nothing, because nothing else drives this combination.
//
// See: .planning/M5.E9-REQUIREMENTS.md FR8, .planning/BUGS.md B42-B45.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  shipFR1Check,
  isEpicCloseByState,
  checkProposedStateWrite,
} from '../tools/lib/retrospective.js';
import { readState, transitionPhase, completePhase } from '../tools/lib/state.js';
import { seedPhaseArtifacts } from './helpers/phase-artifacts.js';

// A phase ledger spanning many runs — the shape a real linear project reaches.
// Deliberately built the way a linear project actually builds one: repeating
// phase names across units, because that is precisely what a dedupe destroys.
function multiRunLedger(runs = 9) {
  const phases = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP'];
  const out = [];
  for (let r = 0; r < runs; r++) {
    const day = String(10 + r).padStart(2, '0');
    for (const p of phases) out.push(`${p} (2026-05-${day})`);
  }
  return out;
}

const LEDGER = multiRunLedger();

function stateFile({ epic = null, phase = 'REVIEW', completed = LEDGER }) {
  const list = completed.map((e) => `  - ${JSON.stringify(e)}`).join('\n');
  return [
    '---',
    'schema_version: 1',
    'docs_layout_version: 3',
    `phase: ${phase}`,
    `current_epic: ${epic === null ? 'null' : epic}`,
    'current_wave: null',
    'current_tasks: []',
    'completed_phases:',
    list,
    'blockers: []',
    'last_completed_task: null',
    '---',
    '',
    '# State',
    '',
    'Linear-mode fixture.',
    '',
  ].join('\n');
}

describe('linear mode, end to end (COVERAGE-GAP GUARD — FR8)', () => {
  let base;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig-linear-'));
    await mkdir(join(base, '.planning'), { recursive: true });
    await writeFile(join(base, '.planning', 'STATE.md'), stateFile({}));
    await seedPhaseArtifacts(base);
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  // --- AC1.7 / AC8.2 (first count): the P1. -------------------------------
  it('does not halt /sig:ship on a project that has no Epics (AC1.7, B42)', async () => {
    const state = await readState(base);
    expect(state.current_epic).toBeNull(); // fixture sanity

    const result = await shipFR1Check({
      state,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: null,
      baseDir: base,
    });

    // On `main` this returns {halt:true, code:'NO_CURRENT_EPIC'} — /sig:ship
    // stops on step zero and the project can never close a unit of work.
    expect(result.halt).toBe(false);
    expect(result.skipped).toBe(true);
    expect(String(result.reason)).toMatch(/linear/i);
  });

  // --- AC1.2: the divergence proof. A blanket "always skip" must not pass. -
  it('still halts when STATE.md itself is missing (AC1.2)', async () => {
    const result = await shipFR1Check({
      state: null,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: null,
      baseDir: base,
    });
    expect(result.halt).toBe(true);
    expect(result.code).toBe('NO_CURRENT_EPIC');
  });

  // --- AC1.4: no dead code implying an unreachable guarantee. -------------
  it('reports linear mode as never an Epic close (AC1.4)', async () => {
    const state = await readState(base);
    expect(isEpicCloseByState(state, { tier: 'FULL', phases_skipped: [] })).toBe(false);
  });

  // --- AC1.6: the two enforcement layers must agree. ----------------------
  it('has Layer 1 and Layer 2 agreeing on a missing Epic (AC1.6)', async () => {
    // Before M5.E9 these disagreed on the IDENTICAL input: Layer 1 failed
    // CLOSED (hard halt, no bypass) while Layer 2 failed OPEN (block:false,
    // retrospective.js:500-502). One missing Epic, two opposite verdicts —
    // the sharpest evidence the halt was never a deliberate reading.
    const state = await readState(base);
    const layer1 = await shipFR1Check({
      state,
      profile: { tier: 'FULL', phases_skipped: [] },
      milestoneContent: null,
      baseDir: base,
    });
    const layer2 = checkProposedStateWrite({
      proposedContent: await readFile(join(base, '.planning', 'STATE.md'), 'utf-8'),
      profile: { tier: 'FULL', phases_skipped: [] },
      baseDir: base,
    });
    // Neither layer stops a linear project from shipping.
    expect(layer1.halt).toBe(false);
    expect(layer2.block).toBe(false);
  });

  // --- AC8.1: the fixture is genuinely the un-exercised shape. -----------
  it('drives a ledger spanning many units, not one run (AC8.1)', async () => {
    const state = await readState(base);
    expect(state.completed_phases.length).toBeGreaterThan(50);
    const discusses = state.completed_phases.filter((e) => e.startsWith('DISCUSS'));
    expect(discusses.length).toBeGreaterThan(1); // repeats across units — the shape a dedupe destroys
  });

  // --- AC3.3 / AC8.2 (second count): the ledger survives. -----------------
  it('preserves a multi-run phase history across a transition (AC3.3, B44)', async () => {
    const before = await readState(base);
    expect(before.completed_phases).toHaveLength(LEDGER.length);

    await transitionPhase(base, 'SHIP');

    const after = await readState(base);
    // On `main` the Map dedupe collapsed 54 entries to one per phase NAME —
    // every prior unit of work destroyed, silently, with no diff or count.
    expect(after.completed_phases.length).toBeGreaterThan(LEDGER.length);
    // Assert the OLDEST entry specifically: a collapse keeps the NEWEST per
    // key, so a length check alone would pass a subtly wrong implementation.
    expect(after.completed_phases).toContain('DISCUSS (2026-05-10)');
    expect(after.completed_phases).toContain('REVIEW (2026-05-10)');
  });

  // --- AC2.1 / AC2.2: a terminal phase can finally be recorded. -----------
  it('records SHIP via completePhase, which transitionPhase alone cannot (AC2.2, B43)', async () => {
    const today = new Date().toISOString().split('T')[0];
    await transitionPhase(base, 'SHIP');

    const mid = await readState(base);
    expect(mid.phase).toBe('SHIP');
    // transitionPhase records the phase LEFT — correct, and why SHIP is
    // unrecordable by it: SHIP is terminal, nothing ever leaves it.
    expect(mid.completed_phases).toContain(`REVIEW (${today})`);
    expect(mid.completed_phases).not.toContain(`SHIP (${today})`);

    const res = await completePhase(base, 'SHIP');
    expect(res.recorded).toBe(true);
    const after = await readState(base);
    expect(after.phase).toBe('SHIP'); // records completion, does not transition

    // In LINEAR mode the SHIP record is immediately followed by FR5's trim, so
    // the finished run — SHIP included — lands in the archive rather than the
    // live list. Asserting the live list here would be asserting the absence of
    // the trim. The ordering (record, THEN trim) is what puts SHIP inside its
    // own run's archived section (AC2.2).
    expect(after.completed_phases).toEqual([]);
    const history = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');
    expect(history).toContain(`SHIP (${today})`);
    expect(history).toContain(`REVIEW (${today})`);
    expect(history).toContain('DISCUSS (2026-05-10)'); // the whole run, verbatim

    // Idempotent: a re-invoked /sig:ship must not double-record or re-archive.
    const again = await completePhase(base, 'SHIP');
    expect(again.recorded).toBe(false);
    const historyAgain = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');
    expect(historyAgain).toBe(history);
  });

  // --- AC4.1 / AC4.3 / AC4.4: the live junk entry, quarantined + surfaced. -
  it('quarantines a malformed entry instead of keying on it (AC4.4, B45)', async () => {
    const polluted = [...LEDGER];
    polluted.splice(3, 0, '**▶ Active: Slice SEC1'); // the real 2026-07-26 instance
    await writeFile(join(base, '.planning', 'STATE.md'), stateFile({ completed: polluted }));

    const res = await transitionPhase(base, 'SHIP');

    // AC4.3 — SURFACED, not silently handled. A silent drop is this Epic's bug.
    expect(res.quarantined).toContain('**▶ Active: Slice SEC1');

    const after = await readState(base);
    // AC4.1 — never a phase, and never a phantom key that outlives real history.
    expect(after.completed_phases).not.toContain('**▶ Active: Slice SEC1');
    // The real entries are untouched.
    expect(after.completed_phases).toContain('DISCUSS (2026-05-10)');
  });
});
