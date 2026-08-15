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
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initState, readState, transitionPhase, completePhase, setCurrentEpic } from '../plugin/tools/lib/state.js';
import { seedPhaseArtifacts } from './helpers/phase-artifacts.js';

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
    await seedPhaseArtifacts(base);

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
    await seedPhaseArtifacts(base);
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
      const src = await readFile(join(process.cwd(), 'plugin', 'commands', `${cmd}.md`), 'utf-8');
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
    const src = await readFile(join(process.cwd(), 'plugin', 'commands', 'plan.md'), 'utf-8');
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

// ---------------------------------------------------------------------------
// M5.E13 S2.t2/t3 (FR1.2, `B48`) — a phase with no artifact is not recordable.
//
// B48: execute.md's phase-entry instruction was UNCONDITIONAL, and an agent
// correctly REFUSED it — obeying would record `phase: EXECUTE` for a project
// that halted at its preconditions with nothing to execute. Rewording alone
// (FR1.1) leaves the code able to write the false record; D-M5E13-4 fixes both
// halves.
//
// Homed in transitionPhase, NOT recordPhase (Open Question #1, settled at PLAN
// by evidence): completePhase also calls recordPhase, and completePhase exists
// to record SHIP — whose artifact is optional by design — so a guard in
// recordPhase would refuse the normal ship.
// ---------------------------------------------------------------------------
describe('M5.E13 S2.t2 — transitionPhase refuses to record an artifact-less phase (B48)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-b48-'));
    await initState(dir);
  });
  afterEach(async () => await rm(dir, { recursive: true, force: true }));

  const seed = async (name, body = '# x\n') =>
    writeFile(join(dir, '.planning', name), body, 'utf-8');

  it('AC1.2 — refuses when the leaving phase produced no artifact, and NAMES it', async () => {
    // CALIBRATE -> DISCUSS is exempt (see AC1.3). Get to DISCUSS legitimately,
    // then try to leave it with no REQUIREMENTS.md on disk.
    await transitionPhase(dir, 'DISCUSS');
    await expect(transitionPhase(dir, 'PLAN')).rejects.toThrow(/REQUIREMENTS/);
  });

  it('AC1.2 — the refusal is explicit, never a silent no-op', async () => {
    await transitionPhase(dir, 'DISCUSS');
    const before = await readState(dir);
    await expect(transitionPhase(dir, 'PLAN')).rejects.toThrow();
    const after = await readState(dir);
    // Nothing moved: not the phase, not the ledger.
    expect(after.phase).toBe(before.phase);
    expect(after.completed_phases).toEqual(before.completed_phases);
  });

  it('AC1.2 — with the artifact present, it appends exactly as before', async () => {
    await transitionPhase(dir, 'DISCUSS');
    await seed('REQUIREMENTS.md');
    await transitionPhase(dir, 'PLAN');
    const st = await readState(dir);
    expect(st.phase).toBe('PLAN');
    expect(st.completed_phases.some((e) => e.startsWith('DISCUSS ('))).toBe(true);
  });

  it('B48 proper — the EXECUTE case that opened this Epic', async () => {
    // A project at PLAN with no PLAN artifact: /sig:execute halts at its
    // preconditions, so recording `phase: EXECUTE` would be a false record.
    await transitionPhase(dir, 'DISCUSS');
    await seed('REQUIREMENTS.md');
    await transitionPhase(dir, 'PLAN');
    await expect(transitionPhase(dir, 'EXECUTE')).rejects.toThrow(/PLAN/);
  });

  it('resolves through the S1-corrected seam — an Epic-prefixed artifact satisfies it', async () => {
    await setCurrentEpic(dir, 'M9.E1');
    await transitionPhase(dir, 'DISCUSS');
    await seed('M9.E1-REQUIREMENTS.md');
    await transitionPhase(dir, 'PLAN');
    expect((await readState(dir)).phase).toBe('PLAN');
  });
});

describe('M5.E13 S2.t3 — the exemption list is enumerated, not assumed empty (AC1.3)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-b48-ex-'));
    await initState(dir);
  });
  afterEach(async () => await rm(dir, { recursive: true, force: true }));

  it('CALIBRATE is exempt — its output is PROFILE.md, not a phase artifact', async () => {
    // initState leaves phase CALIBRATE; leaving it must not require an artifact.
    await expect(transitionPhase(dir, 'DISCUSS')).resolves.toBeTruthy();
    expect((await readState(dir)).completed_phases.some((e) => e.startsWith('CALIBRATE ('))).toBe(true);
  });

  it('SHIP is exempt — completePhase(SHIP) succeeds with no SHIP.md (the normal ship)', async () => {
    // The collision that decided placement: SHIP's artifact is optional by
    // design ("{phase}-SHIP.md (if present) OR pre-ship checklist from STATE").
    await writeFile(join(dir, '.planning', 'REQUIREMENTS.md'), '# r\n', 'utf-8');
    await transitionPhase(dir, 'DISCUSS');
    const res = await completePhase(dir, 'SHIP');
    expect(res.recorded).toBe(true);
  });

  it('SKETCH ship path: EXECUTE with no PROGRESS artifact does NOT block the ship (M5.E13 REVIEW, Critical)', async () => {
    // Found at REVIEW, not by the plan. execute.md § "Optional for single-task
    // plans" states PROGRESS may be skipped — "typical at SKETCH tier … the
    // commit log substitutes for it. Skip without ceremony". The first version
    // of this guard demanded it unconditionally, so a SKETCH project could not
    // ship AT ALL. That is `B42`'s exact shape — a gate refusing a supported
    // mode — reintroduced by the Epic that exists to stop unconditional rules.
    await writeFile(join(dir, '.planning', 'REQUIREMENTS.md'), '# r\n', 'utf-8');
    await transitionPhase(dir, 'DISCUSS');
    await transitionPhase(dir, 'PLAN');
    await writeFile(join(dir, '.planning', '1-PLAN.md'), '# p\n', 'utf-8');
    await transitionPhase(dir, 'EXECUTE');
    // No PROGRESS artifact — legitimate at SKETCH.
    await expect(transitionPhase(dir, 'SHIP')).resolves.toBeTruthy();
    expect((await readState(dir)).phase).toBe('SHIP');
  });

  it('...and the exemption costs B48 nothing: /sig:execute with no PLAN artifact is still refused', async () => {
    // The exemption relaxes only the LEAVING-EXECUTE check (the ship). B48's
    // case leaves PLAN, so it is PLAN's artifact that is checked, and it is
    // still refused. Pins that the fix did not hollow out the guard.
    await writeFile(join(dir, '.planning', 'REQUIREMENTS.md'), '# r\n', 'utf-8');
    await transitionPhase(dir, 'DISCUSS');
    await transitionPhase(dir, 'PLAN');
    await expect(transitionPhase(dir, 'EXECUTE')).rejects.toThrow(/PLAN/);
  });

  it('the exemption set is EXPORTED so it can be read, not inferred from behaviour', async () => {
    const { PHASE_ARTIFACT_EXEMPT } = await import('../plugin/tools/lib/state.js');
    expect(PHASE_ARTIFACT_EXEMPT instanceof Set).toBe(true);
    expect([...PHASE_ARTIFACT_EXEMPT].sort()).toEqual(['CALIBRATE', 'EXECUTE', 'SHIP']);
  });
});
