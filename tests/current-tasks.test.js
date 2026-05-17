// Tests for setCurrentTask / clearCurrentTask / getCurrentTasks (M4.5.E6.S1.t6).
// Covers D10 (current_tasks[] array), the legacy-auto-upgrade-on-first-write
// contract, lock contention, and StateWriteError.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  setCurrentTask,
  clearCurrentTask,
  getCurrentTasks,
  readState,
  parseFrontmatter,
  StateWriteError,
} from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'state');

async function setupLegacyFixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(FIXTURE_ROOT, 'legacy', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

async function setupSchemaV1Fixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(FIXTURE_ROOT, 'schema-v1', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

describe('setCurrentTask', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-current-task-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('appends an entry to current_tasks[]', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, {
      id: 'M4.5.E6.S1.t6',
      epic: 'M4.5.E6',
      wave: 1,
      startedAt: '2026-05-17T16:00:00.000Z',
    });
    const tasks = await getCurrentTasks(tempDir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 'M4.5.E6.S1.t6',
      epic: 'M4.5.E6',
      wave: 1,
      status: 'in_progress',
      startedAt: '2026-05-17T16:00:00.000Z',
    });
  });

  it('is idempotent on double-call with same id — no duplicate', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, { id: 'T1' });
    await setCurrentTask(tempDir, { id: 'T1' });
    expect(await getCurrentTasks(tempDir)).toHaveLength(1);
  });

  it('allows multiple distinct task ids to coexist (wave parallelism)', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, { id: 'T1' });
    await setCurrentTask(tempDir, { id: 'T2' });
    const tasks = await getCurrentTasks(tempDir);
    expect(tasks.map((t) => t.id).sort()).toEqual(['T1', 'T2']);
  });

  it('triggers upgradeStateFile when STATE.md is legacy', async () => {
    await setupLegacyFixture(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await setCurrentTask(tempDir, { id: 'T1' });
    } finally {
      stderrSpy.mockRestore();
    }
    const raw = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
    const { data } = parseFrontmatter(raw);
    expect(data.schema_version).toBe(1);
    expect(data.current_tasks).toHaveLength(1);
    expect(data.current_tasks[0].id).toBe('T1');
  });

  it('rejects when id is missing', async () => {
    await setupSchemaV1Fixture(tempDir);
    await expect(setCurrentTask(tempDir, {})).rejects.toThrow(/id/);
  });

  it('throws StateWriteError when the state lock is already held (fresh)', async () => {
    await setupSchemaV1Fixture(tempDir);
    // Plant a fresh lock — same shape file-lock.js writes.
    await writeFile(
      join(tempDir, '.planning', '.state.lock'),
      `99999\n${Date.now()}\n`,
      'utf-8'
    );
    await expect(
      setCurrentTask(tempDir, { id: 'T1' })
    ).rejects.toThrow(StateWriteError);
  });
});

describe('clearCurrentTask', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-current-task-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('removes a task by id', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, { id: 'T1' });
    await setCurrentTask(tempDir, { id: 'T2' });
    await clearCurrentTask(tempDir, { id: 'T1' });
    const tasks = await getCurrentTasks(tempDir);
    expect(tasks.map((t) => t.id)).toEqual(['T2']);
  });

  it('returns {cleared: false} + warning when id does not exist', async () => {
    await setupSchemaV1Fixture(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = await clearCurrentTask(tempDir, { id: 'nope' });
      expect(result.cleared).toBe(false);
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrText).toMatch(/nope/);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('records commit + last_decision_at on clear', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, { id: 'T1' });
    await clearCurrentTask(tempDir, {
      id: 'T1',
      commit: 'abc123sha',
      completedAt: '2026-05-17T17:00:00.000Z',
    });
    const state = await readState(tempDir);
    expect(state.last_updated_commit).toBe('abc123sha');
    expect(state.last_decision_at).toBe('2026-05-17T17:00:00.000Z');
    // The cleared task is removed from current_tasks but recorded for briefing.
    expect(state.current_tasks).toHaveLength(0);
    expect(state.last_completed_task).toMatchObject({
      id: 'T1',
      status: 'done',
      commit: 'abc123sha',
      completedAt: '2026-05-17T17:00:00.000Z',
    });
  });

  it('honors a custom status (aborted / blocked)', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, { id: 'T1' });
    await clearCurrentTask(tempDir, { id: 'T1', status: 'aborted' });
    const state = await readState(tempDir);
    expect(state.last_completed_task.status).toBe('aborted');
  });
});

describe('getCurrentTasks', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-current-task-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns [] when no STATE.md exists', async () => {
    expect(await getCurrentTasks(tempDir)).toEqual([]);
  });

  it('returns [] for a schema-v1 file with empty current_tasks', async () => {
    await setupSchemaV1Fixture(tempDir);
    expect(await getCurrentTasks(tempDir)).toEqual([]);
  });

  it('returns [] for a legacy STATE.md (no current_tasks concept yet)', async () => {
    await setupLegacyFixture(tempDir);
    expect(await getCurrentTasks(tempDir)).toEqual([]);
  });
});

describe('StateWriteError', () => {
  it('is a named subclass of Error', () => {
    const err = new StateWriteError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StateWriteError);
    expect(err.name).toBe('StateWriteError');
  });
});
