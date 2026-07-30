import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initState, readState, transitionPhase, SCHEMA_VERSION } from '../tools/lib/state.js';
import { seedPhaseArtifacts } from './helpers/phase-artifacts.js';

// S1.t1 (M4.5.E10): SCHEMA_VERSION must be a public named export — the S4
// schema-drift detector (detectSchemaDrift) numeric-compares raw STATE.md
// schema_version against it, bypassing readState (which throws on ahead/
// missing-key). Until this Epic it was module-private (state.js:97).
describe('SCHEMA_VERSION export', () => {
  it('is exported as a numeric constant equal to 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(typeof SCHEMA_VERSION).toBe('number');
  });
});

describe('State Management', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  describe('initState', () => {
    it('creates the .planning directory', async () => {
      const planningDir = await initState(tempDir);
      expect(existsSync(planningDir)).toBe(true);
    });

    it('creates STATE.md with CALIBRATE as default initial phase (matches /sig:new-project)', async () => {
      await initState(tempDir);
      await seedPhaseArtifacts(tempDir);
      const state = await readState(tempDir);
      expect(state.phase).toBe('CALIBRATE');
      expect(state.completedPhases).toEqual([]);
    });

    it('accepts an explicit initial phase (e.g., DISCUSS for post-calibrate paths)', async () => {
      await initState(tempDir, 'DISCUSS');
      await seedPhaseArtifacts(tempDir);
      const state = await readState(tempDir);
      expect(state.phase).toBe('DISCUSS');
    });

    it('rejects invalid initial phase names', async () => {
      await expect(initState(tempDir, 'NOPE')).rejects.toThrow('Invalid initial phase');
    });

    it('is idempotent — does not error on existing directory', async () => {
      await initState(tempDir);
      await seedPhaseArtifacts(tempDir);
      await initState(tempDir);
      await seedPhaseArtifacts(tempDir); // should not throw
      const state = await readState(tempDir);
      expect(state.phase).toBe('CALIBRATE');
    });

    it('emits the live-above-the-fold body skeleton headings (FR2c)', async () => {
      // Fresh STATE.md body must carry the normative skeleton (state-schema.md
      // § Body skeleton) so writer-agents have fixed slots, not free prose.
      await initState(tempDir);
      await seedPhaseArtifacts(tempDir);
      const raw = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
      for (const heading of [
        '## Resume pointer',
        '## In-flight',
        '## Blockers',
        '## Pending ops',
        '## Closed work',
      ]) {
        expect(raw).toContain(heading);
      }
      // Skeleton lives in the body, below the closing frontmatter fence.
      const bodyStart = raw.indexOf('\n---\n') + 5;
      expect(raw.slice(bodyStart)).toContain('## Resume pointer');
    });
  });

  describe('readState', () => {
    it('returns null when no state exists', async () => {
      const state = await readState(tempDir);
      expect(state).toBeNull();
    });

    it('parses phase and completed phases correctly', async () => {
      await initState(tempDir);
      await seedPhaseArtifacts(tempDir);
      const state = await readState(tempDir);
      expect(state.phase).toBe('CALIBRATE');
      expect(state.completedPhases).toEqual([]);
      expect(state.lastUpdated).toBeTruthy();
    });
  });

  describe('transitionPhase', () => {
    it('transitions from DISCUSS to PLAN', async () => {
      await initState(tempDir, 'DISCUSS');
      await seedPhaseArtifacts(tempDir);
      await transitionPhase(tempDir, 'PLAN');
      const state = await readState(tempDir);
      expect(state.phase).toBe('PLAN');
      expect(state.completedPhases).toHaveLength(1);
      expect(state.completedPhases[0]).toContain('DISCUSS');
    });

    it('tracks multiple completed phases', async () => {
      await initState(tempDir, 'DISCUSS');
      await seedPhaseArtifacts(tempDir);
      await transitionPhase(tempDir, 'PLAN');
      await transitionPhase(tempDir, 'EXECUTE');
      const state = await readState(tempDir);
      expect(state.phase).toBe('EXECUTE');
      expect(state.completedPhases).toHaveLength(2);
    });

    // REWRITTEN 2026-07-27 (M5.E9 S2.t7, B44 / D-M5E9-5). This case asserted
    // "dedupes by phase name … no duplicate PLAN entries" — the behavior that
    // destroyed 53 entries of a real project's history in one call.
    //
    // Two reasons it is rewritten rather than deleted. (1) A deleted test and a
    // fixed bug look identical in a suite count. (2) It had ALREADY stopped
    // testing its own claim: with the phase-being-LEFT recording, that exact
    // sequence produces one PLAN entry with or without a dedupe, so it passed
    // for a reason unrelated to its name — a green test guarding nothing.
    it('is append-only: a re-entered phase is recorded again, not collapsed', async () => {
      await initState(tempDir, 'DISCUSS');
      await seedPhaseArtifacts(tempDir);
      await transitionPhase(tempDir, 'PLAN');
      await transitionPhase(tempDir, 'EXECUTE');
      await transitionPhase(tempDir, 'VERIFY');
      await transitionPhase(tempDir, 'PLAN'); // recovery: back to PLAN
      await transitionPhase(tempDir, 'EXECUTE'); // and forward again
      const state = await readState(tempDir);
      // PLAN was left twice — it genuinely happened twice, so the log says so.
      const planEntries = state.completedPhases.filter((p) => p.startsWith('PLAN '));
      expect(planEntries).toHaveLength(2);
      // Nothing earlier was displaced to make room.
      expect(state.completedPhases[0]).toMatch(/^DISCUSS /);
      expect(state.completedPhases).toHaveLength(5);
    });

    it('quarantines a malformed entry rather than keying on it (B45)', async () => {
      await initState(tempDir, 'DISCUSS');
      await seedPhaseArtifacts(tempDir);
      const statePath = join(tempDir, '.planning', 'STATE.md');
      const raw = await readFile(statePath, 'utf-8');
      // Inject the shape that broke a real project: a stray prose line whose
      // first whitespace token became a phantom phase key.
      await writeFile(
        statePath,
        raw.replace(
          /^completed_phases:.*$/m,
          'completed_phases:\n  - "**▶ Active: Slice SEC1"'
        )
      );
      const res = await transitionPhase(tempDir, 'PLAN');
      expect(res.quarantined).toContain('**▶ Active: Slice SEC1');
      const state = await readState(tempDir);
      expect(state.completedPhases).not.toContain('**▶ Active: Slice SEC1');
      expect(state.completedPhases).toEqual([expect.stringMatching(/^DISCUSS /)]);
    });

    it('rejects invalid phase names', async () => {
      await initState(tempDir);
      await seedPhaseArtifacts(tempDir);
      await expect(transitionPhase(tempDir, 'INVALID')).rejects.toThrow('Invalid phase');
    });

    it('errors when no state exists', async () => {
      await expect(transitionPhase(tempDir, 'PLAN')).rejects.toThrow('No project state found');
    });
  });

});
