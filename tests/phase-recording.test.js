// M5.E9 FR6 (B41) — the four middle phase commands record their phase.
//
// READ THIS BEFORE ADDING TO THIS FILE — the two tests below prove different
// things, and conflating them is how B41 survived eleven releases:
//
//   1. `drives the documented sequence` tests the MECHANISM. It calls the state
//      functions in the order the command files now specify and asserts the
//      resulting ledger. This proves the sequence produces a correct ledger.
//
//   2. `every phase command documents its entry transition` tests PRESENCE. It
//      proves the instruction is IN the file. It does NOT — and cannot — prove
//      an agent reading that file actually executes it.
//
// **Nothing here proves obedience.** That is precisely M5.E7's headline finding
// (Signal cannot detect whether its own interventions work) and it is M5.E8's
// job, not this Epic's. Stating the limit is the point: a presence check that
// gets described as an obedience check is test theater with a good disguise.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initState, readState, transitionPhase, completePhase } from '../tools/lib/state.js';

const MIDDLE_COMMANDS = ['plan', 'execute', 'verify', 'review'];

describe('FR6 — phase recording (B41)', () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig-phase-'));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('drives the documented sequence and records every phase (AC6.2, AC6.4)', async () => {
    await initState(base, 'DISCUSS');

    // The full command-driven run, in the order the command files specify.
    for (const phase of ['PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP']) {
      await transitionPhase(base, phase);
    }

    const mid = await readState(base);
    // Before M5.E9 this run ended as ['DISCUSS'] with phase SHIP, and
    // /sig:status reported DISCUSS for the entire build.
    expect(mid.completed_phases.map((e) => e.split(' ')[0])).toEqual([
      'DISCUSS',
      'PLAN',
      'EXECUTE',
      'VERIFY',
      'REVIEW',
    ]);

    await completePhase(base, 'SHIP');

    const state = await readState(base);
    expect(state.phase).toBe('SHIP');
    // initState leaves current_epic null, so this run is LINEAR and FR5's trim
    // fires at ship — the completed run moves to the archive and the live list
    // restarts. Asserting the live list here would assert the trim's absence.
    expect(state.completed_phases).toEqual([]);
    const history = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');
    for (const p of ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP']) {
      expect(history, `${p} must survive into the archived run`).toMatch(
        new RegExp(`- ${p} \\(\\d{4}-\\d{2}-\\d{2}\\)`)
      );
    }
  });

  it('keeps position and freshness in agreement (AC6.3)', async () => {
    await initState(base, 'DISCUSS');
    await transitionPhase(base, 'PLAN');
    const state = await readState(base);
    // markFresh's stated purpose is to make /sig:resume read fresh after a
    // phase closes. Before FR6 the four middle commands called markFresh
    // WITHOUT advancing phase, so each stamped a fresh timestamp over a stale
    // position — converting stale-and-flagged into stale-and-silent.
    expect(state.phase).toBe('PLAN');
    expect(state.completed_phases.map((e) => e.split(' ')[0])).toContain('DISCUSS');
  });

  // PRESENCE ONLY — see the file header. Not an obedience check.
  it('every middle phase command documents its entry transition (presence, not obedience)', async () => {
    for (const cmd of MIDDLE_COMMANDS) {
      const src = await readFile(join(process.cwd(), 'commands', `${cmd}.md`), 'utf-8');
      expect(src, `${cmd}.md must instruct a phase-entry transition`).toMatch(
        new RegExp(`transitionPhase\\(baseDir, '${cmd.toUpperCase()}'\\)`)
      );
      // At ENTRY, not exit: the position must be true WHILE the phase runs.
      const idx = src.indexOf('## Phase entry');
      expect(idx, `${cmd}.md phase-entry step must precede the Workflow`).toBeGreaterThan(0);
      expect(idx).toBeLessThan(src.indexOf('## Workflow'));
    }
  });

  it('no longer states a precondition no command can satisfy (AC6.1)', async () => {
    const src = await readFile(join(process.cwd(), 'commands', 'plan.md'), 'utf-8');
    // plan.md:50 used to read "verify current phase is PLAN" while nothing in
    // Signal could ever make that true — the bug written into the spec.
    //
    // Matched on the BULLET form specifically, not the bare phrase: the
    // corrected line quotes the old wording to explain what changed, and a
    // naive `not.toMatch(/verify current phase is PLAN/)` fails on that
    // explanation. A test that forbids a project from describing its own
    // history is a bad test — it pressures the fix toward deleting the record.
    expect(src).not.toMatch(/^- `STATE\.md` — verify current phase is PLAN\s*$/m);
    expect(src).toMatch(/^- `STATE\.md` — current phase is `PLAN`, set by the phase-entry step/m);
  });
});

// --- Gaps found at VERIFY (AC1.5, AC3.4) — closed rather than accepted. ------

describe('M5.E9 VERIFY-found coverage gaps', () => {
  it('records the superseded M4.5.E9 criterion in the archived verification (AC1.5)', async () => {
    // The plan required a dated superseded-by pointer on M4.5.E9's AC1-extended
    // row. It was written, but nothing asserted it — so a later cleanup could
    // silently drop the record that Signal changed its mind about a shipped
    // acceptance criterion. That record is the whole point.
    const src = await readFile(
      join(process.cwd(), '.planning/archive/M4.5/E9/M4.5.E9-VERIFICATION.md'),
      'utf-8'
    );
    expect(src).toMatch(/AC1-extended is SUPERSEDED/);
    expect(src).toMatch(/2026-07-27/);
    expect(src).toMatch(/D-M5E9-1/);
    // The surviving half must still be named as surviving.
    expect(src).toMatch(/state itself is missing.*survives/is);
  });

  it('has no state writer that rebuilds completed_phases by derivation (AC3.4)', async () => {
    // AC3.4 was verified by hand at PLAN and by a manual audit at EXECUTE, with
    // nothing to keep it true. `transitionPhase`'s Map was the ONLY writer that
    // rebuilt the array rather than patching it, and rebuilding is what made
    // the data loss possible. This fails if another writer starts doing it.
    const src = await readFile(join(process.cwd(), 'tools/lib/state.js'), 'utf-8');
    // The specific construct that caused B44: keying entries into a Map.
    expect(src).not.toMatch(/new Map\(\s*seen\.map/);
    expect(src).not.toMatch(/completed_phases\s*=\s*Array\.from\(\s*new Map/);
    // completed_phases is only assigned in the two audited places.
    const assignments = src.match(/payload\.completed_phases\s*=/g) ?? [];
    expect(assignments.length).toBeLessThanOrEqual(3);
  });
});
