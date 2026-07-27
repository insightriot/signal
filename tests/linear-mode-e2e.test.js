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
import { readState, transitionPhase } from '../tools/lib/state.js';

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

  // --- Slice 2 extends this file (AC2.1, AC3.3, AC4.4, AC8.2 second count).
  // The ledger assertions land with the change that makes them pass, per the
  // atomic-commit rule: a task's commit leaves the suite green. They are NOT
  // omitted — S2.t1 is their owning task, and the RED proof happens there.
});
