import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initState, readState, transitionPhase, checkGateArtifacts, SCHEMA_VERSION } from '../tools/lib/state.js';

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
      const state = await readState(tempDir);
      expect(state.phase).toBe('CALIBRATE');
      expect(state.completedPhases).toEqual([]);
    });

    it('accepts an explicit initial phase (e.g., DISCUSS for post-calibrate paths)', async () => {
      await initState(tempDir, 'DISCUSS');
      const state = await readState(tempDir);
      expect(state.phase).toBe('DISCUSS');
    });

    it('rejects invalid initial phase names', async () => {
      await expect(initState(tempDir, 'NOPE')).rejects.toThrow('Invalid initial phase');
    });

    it('is idempotent — does not error on existing directory', async () => {
      await initState(tempDir);
      await initState(tempDir); // should not throw
      const state = await readState(tempDir);
      expect(state.phase).toBe('CALIBRATE');
    });

    it('emits the live-above-the-fold body skeleton headings (FR2c)', async () => {
      // Fresh STATE.md body must carry the normative skeleton (state-schema.md
      // § Body skeleton) so writer-agents have fixed slots, not free prose.
      await initState(tempDir);
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
      const state = await readState(tempDir);
      expect(state.phase).toBe('CALIBRATE');
      expect(state.completedPhases).toEqual([]);
      expect(state.lastUpdated).toBeTruthy();
    });
  });

  describe('transitionPhase', () => {
    it('transitions from DISCUSS to PLAN', async () => {
      await initState(tempDir, 'DISCUSS');
      await transitionPhase(tempDir, 'PLAN');
      const state = await readState(tempDir);
      expect(state.phase).toBe('PLAN');
      expect(state.completedPhases).toHaveLength(1);
      expect(state.completedPhases[0]).toContain('DISCUSS');
    });

    it('tracks multiple completed phases', async () => {
      await initState(tempDir, 'DISCUSS');
      await transitionPhase(tempDir, 'PLAN');
      await transitionPhase(tempDir, 'EXECUTE');
      const state = await readState(tempDir);
      expect(state.phase).toBe('EXECUTE');
      expect(state.completedPhases).toHaveLength(2);
    });

    it('dedupes by phase name when transitioning to a phase already completed', async () => {
      await initState(tempDir, 'DISCUSS');
      await transitionPhase(tempDir, 'PLAN');
      await transitionPhase(tempDir, 'EXECUTE');
      await transitionPhase(tempDir, 'VERIFY');
      // Re-transition through PLAN (recovery scenario): no duplicate PLAN entries.
      await transitionPhase(tempDir, 'PLAN');
      const state = await readState(tempDir);
      const planEntries = state.completedPhases.filter((p) => p.startsWith('PLAN'));
      expect(planEntries).toHaveLength(1);
    });

    it('rejects invalid phase names', async () => {
      await initState(tempDir);
      await expect(transitionPhase(tempDir, 'INVALID')).rejects.toThrow('Invalid phase');
    });

    it('errors when no state exists', async () => {
      await expect(transitionPhase(tempDir, 'PLAN')).rejects.toThrow('No project state found');
    });
  });

  describe('checkGateArtifacts', () => {
    it('reports missing artifacts for PLAN gate', async () => {
      await initState(tempDir);
      const { ready, missing } = await checkGateArtifacts(tempDir, 'PLAN');
      expect(ready).toBe(false);
      expect(missing).toContain('PROJECT.md');
      expect(missing).toContain('CONTEXT.md');
      expect(missing).toContain('REQUIREMENTS.md');
    });

    it('reports ready when all artifacts exist', async () => {
      await initState(tempDir);
      const planningDir = join(tempDir, '.planning');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(planningDir, 'PROJECT.md'), '# Project');
      await writeFile(join(planningDir, 'CONTEXT.md'), '# Context');
      await writeFile(join(planningDir, 'REQUIREMENTS.md'), '# Requirements');

      const { ready, missing } = await checkGateArtifacts(tempDir, 'PLAN');
      expect(ready).toBe(true);
      expect(missing).toEqual([]);
    });
  });
});
