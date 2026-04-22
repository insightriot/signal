import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initState, readState, transitionPhase, checkGateArtifacts } from '../tools/lib/state.js';

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

    it('creates STATE.md with DISCUSS as initial phase', async () => {
      await initState(tempDir);
      const state = await readState(tempDir);
      expect(state.phase).toBe('DISCUSS');
      expect(state.completedPhases).toEqual([]);
    });

    it('is idempotent — does not error on existing directory', async () => {
      await initState(tempDir);
      await initState(tempDir); // should not throw
      const state = await readState(tempDir);
      expect(state.phase).toBe('DISCUSS');
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
      expect(state.phase).toBe('DISCUSS');
      expect(state.completedPhases).toEqual([]);
      expect(state.lastUpdated).toBeTruthy();
    });
  });

  describe('transitionPhase', () => {
    it('transitions from DISCUSS to PLAN', async () => {
      await initState(tempDir);
      await transitionPhase(tempDir, 'PLAN');
      const state = await readState(tempDir);
      expect(state.phase).toBe('PLAN');
      expect(state.completedPhases).toHaveLength(1);
      expect(state.completedPhases[0]).toContain('DISCUSS');
    });

    it('tracks multiple completed phases', async () => {
      await initState(tempDir);
      await transitionPhase(tempDir, 'PLAN');
      await transitionPhase(tempDir, 'EXECUTE');
      const state = await readState(tempDir);
      expect(state.phase).toBe('EXECUTE');
      expect(state.completedPhases).toHaveLength(2);
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
