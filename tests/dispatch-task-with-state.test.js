// Tests for dispatchTaskWithState + clearOrphansBeforeDispatch
// (M4.5.E6.S3.t1 + S3.t2).
//
// The orchestrator wrapper. `task.dispatch` is injectable so we never
// invoke the real Task tool — tests stub the agent call.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  dispatchTaskWithState,
  clearOrphansBeforeDispatch,
} from '../tools/lib/execute.js';
import {
  setCurrentTask,
  readState,
} from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FIXTURES = join(__dirname, 'fixtures', 'state');

async function setupSchemaV1Fixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(STATE_FIXTURES, 'schema-v1', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

function fullProfile(overrides = {}) {
  return {
    tier: 'FULL',
    rigor_overrides: { gate_strictness: 'strict', ...overrides },
  };
}
function lightProfile(overrides = {}) {
  return {
    tier: 'FEATURE',
    rigor_overrides: { gate_strictness: 'light', ...overrides },
  };
}
function sketchProfile() {
  return {
    tier: 'SKETCH',
    rigor_overrides: { gate_strictness: 'off' },
  };
}

describe('dispatchTaskWithState — happy path', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-dispatch-test-'));
    await setupSchemaV1Fixture(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('calls setCurrentTask before dispatch and clearCurrentTask({status:done}) after success', async () => {
    const dispatch = vi.fn(async () => {
      // While dispatch runs, current_tasks should contain the task.
      const state = await readState(tempDir);
      expect(state.current_tasks.map((t) => t.id)).toEqual(['T1']);
      return { ok: true, commit: 'sha-after' };
    });
    const result = await dispatchTaskWithState(
      tempDir,
      { id: 'T1', dispatch },
      fullProfile()
    );
    expect(result).toEqual({ ok: true, commit: 'sha-after' });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const finalState = await readState(tempDir);
    expect(finalState.current_tasks).toEqual([]);
    expect(finalState.last_completed_task).toMatchObject({
      id: 'T1',
      status: 'done',
      commit: 'sha-after',
    });
  });

  it('returns dispatch result unchanged on success', async () => {
    const expected = { artifacts: ['file.js'], commit: 'sha-x' };
    const dispatch = vi.fn(async () => expected);
    const result = await dispatchTaskWithState(
      tempDir,
      { id: 'T1', dispatch },
      fullProfile()
    );
    expect(result).toBe(expected);
  });
});

describe('dispatchTaskWithState — failure path', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-dispatch-test-'));
    await setupSchemaV1Fixture(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('calls clearCurrentTask({status:aborted}) and re-throws when dispatch fails', async () => {
    const dispatch = vi.fn(async () => {
      throw new Error('agent exploded');
    });
    await expect(
      dispatchTaskWithState(tempDir, { id: 'T1', dispatch }, fullProfile())
    ).rejects.toThrow('agent exploded');
    const state = await readState(tempDir);
    expect(state.current_tasks).toEqual([]);
    expect(state.last_completed_task).toMatchObject({
      id: 'T1',
      status: 'aborted',
    });
  });
});

describe('dispatchTaskWithState — D9 tier-aware failure handling', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-dispatch-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('SKETCH tier skips the entire protocol — dispatch runs alone', async () => {
    // No STATE.md fixture — sketch shouldn't try to read/write it.
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    const dispatch = vi.fn(async () => ({ ok: true }));
    const result = await dispatchTaskWithState(
      tempDir,
      { id: 'T1', dispatch },
      sketchProfile()
    );
    expect(result).toEqual({ ok: true });
    // STATE.md still absent — protocol didn't run.
    const state = await readState(tempDir);
    expect(state).toBeNull();
  });

  it('FULL/strict tier halts when setCurrentTask fails (lock contention)', async () => {
    await setupSchemaV1Fixture(tempDir);
    // Plant a fresh lock so setCurrentTask throws StateWriteError.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(tempDir, '.planning', '.state.lock'),
      `99999\n${Date.now()}\n`,
      'utf-8'
    );
    const dispatch = vi.fn(async () => ({ ok: true }));
    await expect(
      dispatchTaskWithState(tempDir, { id: 'T1', dispatch }, fullProfile())
    ).rejects.toThrow(/lock/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('FEATURE/light tier warns and continues when setCurrentTask fails', async () => {
    await setupSchemaV1Fixture(tempDir);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(tempDir, '.planning', '.state.lock'),
      `99999\n${Date.now()}\n`,
      'utf-8'
    );
    const dispatch = vi.fn(async () => ({ ok: true }));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = await dispatchTaskWithState(
        tempDir,
        { id: 'T1', dispatch },
        lightProfile()
      );
      expect(result).toEqual({ ok: true });
      expect(dispatch).toHaveBeenCalledTimes(1);
      const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toMatch(/setCurrentTask|state-tracking|continuing/i);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe('dispatchTaskWithState — S6.t2 success-path protection (IMPORTANT-2)', () => {
  // REVIEW IMPORTANT-2: if dispatch succeeds but clearCurrentTask({done})
  // throws (lock contention, disk full, schema error), the wrapper used to
  // re-throw the state-write error and trigger a second clearCurrentTask
  // ({aborted}) — caller saw a "failure" even though the task already
  // committed. Fix: nested try/catch around the success-path clear; warn
  // to stderr + return the dispatch result. On the failure path, if the
  // aborted-clear also fails, swallow it and re-throw the ORIGINAL dispatch
  // error so the caller sees the meaningful one.

  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-dispatch-s6t2-test-'));
    await setupSchemaV1Fixture(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('dispatch success + clearCurrentTask({done}) failure → stderr warn + returns dispatch result (does NOT throw)', async () => {
    const { writeFile } = await import('node:fs/promises');
    // Dispatch succeeds, then plants a fresh lock so the next state-write
    // (clearCurrentTask in the wrapper's success path) fails.
    const dispatch = vi.fn(async () => {
      await writeFile(
        join(tempDir, '.planning', '.state.lock'),
        `99999\n${Date.now()}\n`,
        'utf-8'
      );
      return { ok: true, commit: 'sha-after' };
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = await dispatchTaskWithState(
        tempDir,
        { id: 'T1', dispatch },
        fullProfile()
      );
      expect(result).toEqual({ ok: true, commit: 'sha-after' });
      const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toMatch(/clearCurrentTask.*failed|orphan-cleared on next run/i);
      expect(stderr).toContain('T1');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('dispatch failure + clearCurrentTask({aborted}) failure → re-throws ORIGINAL dispatch error (not state-write error)', async () => {
    const { writeFile } = await import('node:fs/promises');
    const dispatch = vi.fn(async () => {
      await writeFile(
        join(tempDir, '.planning', '.state.lock'),
        `99999\n${Date.now()}\n`,
        'utf-8'
      );
      throw new Error('agent exploded');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(
        dispatchTaskWithState(tempDir, { id: 'T1', dispatch }, fullProfile())
      ).rejects.toThrow('agent exploded'); // NOT /lock/
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe('clearOrphansBeforeDispatch', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-orphan-recovery-test-'));
    await setupSchemaV1Fixture(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('clears in-progress tasks with id !== nextTaskId', async () => {
    await setCurrentTask(tempDir, { id: 'T-PRIOR' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await clearOrphansBeforeDispatch(tempDir, 'T-NEXT');
    } finally {
      stderrSpy.mockRestore();
    }
    const state = await readState(tempDir);
    expect(state.current_tasks).toEqual([]);
    expect(state.last_completed_task).toMatchObject({
      id: 'T-PRIOR',
      status: 'aborted',
    });
  });

  it('does NOT clear tasks whose id matches the nextTaskId (idempotent re-dispatch)', async () => {
    await setCurrentTask(tempDir, { id: 'T-SAME' });
    await clearOrphansBeforeDispatch(tempDir, 'T-SAME');
    const state = await readState(tempDir);
    expect(state.current_tasks.map((t) => t.id)).toEqual(['T-SAME']);
  });

  it('logs each cleared orphan to stderr', async () => {
    await setCurrentTask(tempDir, { id: 'T-A' });
    await setCurrentTask(tempDir, { id: 'T-B' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await clearOrphansBeforeDispatch(tempDir, 'T-NEXT');
      const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toMatch(/T-A/);
      expect(stderr).toMatch(/T-B/);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
