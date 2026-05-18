// Tests for /sig:checkpoint helpers in tools/lib/checkpoint.js (M4.5.E6.S2).
// Slice 2 lands in tasks S2.t1 → S2.t4 + S2.t7; this file grows alongside.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  parseCheckpointArgs,
  detectStateChanges,
  renderStateDiff,
  captureCheckpointContext,
  handleCheckpointOrphans,
} from '../tools/lib/checkpoint.js';
import { readFile } from 'node:fs/promises';
import { stringifyFrontmatter, setCurrentTask } from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FIXTURES = join(__dirname, 'fixtures', 'state');

async function setupSchemaV1Fixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(STATE_FIXTURES, 'schema-v1', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

function gitOutput(...lines) {
  return Buffer.from(lines.join('\n'));
}

describe('parseCheckpointArgs', () => {
  it('returns {contextMode: false, unknownFlags: []} for no args', () => {
    expect(parseCheckpointArgs('')).toEqual({ contextMode: false, unknownFlags: [] });
    expect(parseCheckpointArgs(undefined)).toEqual({ contextMode: false, unknownFlags: [] });
    expect(parseCheckpointArgs('   ')).toEqual({ contextMode: false, unknownFlags: [] });
  });

  it('sets contextMode: true for --context', () => {
    expect(parseCheckpointArgs('--context')).toEqual({
      contextMode: true,
      unknownFlags: [],
    });
  });

  it('captures trailing unknown tokens after --context as unknownFlags', () => {
    expect(parseCheckpointArgs('--context foo')).toEqual({
      contextMode: true,
      unknownFlags: ['foo'],
    });
  });

  it('captures a bare unknown token as unknownFlags', () => {
    expect(parseCheckpointArgs('foo')).toEqual({
      contextMode: false,
      unknownFlags: ['foo'],
    });
  });

  it('tolerates whitespace and ordering — --context can be anywhere', () => {
    expect(parseCheckpointArgs('foo --context bar')).toEqual({
      contextMode: true,
      unknownFlags: ['foo', 'bar'],
    });
  });
});

describe('detectStateChanges', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-detect-changes-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns no commits when STATE.md is fresh against HEAD', async () => {
    await setupSchemaV1Fixture(tempDir);
    const result = await detectStateChanges(tempDir, {
      execFn: () => gitOutput(),
    });
    expect(result.diff.commitsBehind).toBe(0);
    expect(result.diff.taskIdsInCommits).toEqual([]);
    // current and proposed are structurally identical when no changes.
    expect(result.proposed.phase).toBe(result.current.phase);
  });

  it('reports commitsBehind and parses task IDs from commit subjects', async () => {
    await setupSchemaV1Fixture(tempDir);
    const execFn = () =>
      gitOutput(
        'sha1 M4.5.E6.S2.t2: implementation',
        'sha2 M4.5.E6: scaffold complete',
        'sha3 something unrelated'
      );
    const result = await detectStateChanges(tempDir, { execFn });
    expect(result.diff.commitsBehind).toBe(3);
    // Both vocabulary forms picked up: full identifier + epic-only.
    expect(result.diff.taskIdsInCommits).toEqual(
      expect.arrayContaining(['M4.5.E6.S2.t2', 'M4.5.E6'])
    );
    // Free-form "something unrelated" does NOT match the task-ID regex.
    expect(result.diff.taskIdsInCommits).not.toContain('something');
  });

  it('proposes clearing in-flight tasks whose IDs appear in commit subjects', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, { id: 'M4.5.E6.S2.t2' });
    await setCurrentTask(tempDir, { id: 'M4.5.E6.S2.t9' }); // not in commits
    const execFn = () =>
      gitOutput('sha1 M4.5.E6.S2.t2: shipped');
    const result = await detectStateChanges(tempDir, { execFn });
    expect(result.current.current_tasks.map((t) => t.id).sort()).toEqual([
      'M4.5.E6.S2.t2',
      'M4.5.E6.S2.t9',
    ]);
    // Proposed strips the matched task; the non-matched survives.
    expect(result.proposed.current_tasks.map((t) => t.id)).toEqual([
      'M4.5.E6.S2.t9',
    ]);
  });

  it('handles "X commits behind, no current_tasks" — pure-info case', async () => {
    await setupSchemaV1Fixture(tempDir);
    // No setCurrentTask calls; current_tasks remains [].
    const execFn = () =>
      gitOutput(
        'sha1 some commit',
        'sha2 another',
        'sha3 third'
      );
    const result = await detectStateChanges(tempDir, { execFn });
    expect(result.diff.commitsBehind).toBe(3);
    expect(result.current.current_tasks).toEqual([]);
    expect(result.proposed.current_tasks).toEqual([]);
  });

});

describe('renderStateDiff', () => {
  it('renders "No changes." when states are identical', () => {
    const state = { phase: 'EXECUTE', current_tasks: [], blockers: [] };
    expect(renderStateDiff(state, { ...state })).toBe('No changes.');
  });

  it('renders a single-field diff on one line', () => {
    expect(renderStateDiff({ phase: 'PLAN' }, { phase: 'EXECUTE' })).toBe(
      'phase: PLAN → EXECUTE'
    );
  });

  it('renders multi-field diffs as one line per field, sorted', () => {
    const out = renderStateDiff(
      { phase: 'PLAN', last_updated_commit: 'abc' },
      { phase: 'EXECUTE', last_updated_commit: 'def' }
    );
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    // Keys sorted alphabetically: last_updated_commit comes before phase.
    expect(lines[0]).toBe('last_updated_commit: abc → def');
    expect(lines[1]).toBe('phase: PLAN → EXECUTE');
  });

  it('renders array diffs (current_tasks) with nested +/- markers', () => {
    const out = renderStateDiff(
      { current_tasks: [{ id: 'T1' }, { id: 'T2' }] },
      { current_tasks: [{ id: 'T2' }, { id: 'T3' }] }
    );
    expect(out).toContain('current_tasks:');
    expect(out).toMatch(/-\s+removed.*T1/);
    expect(out).toMatch(/\+\s+added.*T3/);
    // T2 is in both → not mentioned.
    expect(out.split('\n').filter((l) => l.includes('T2'))).toHaveLength(0);
  });

  it('omits internal meta fields (_schema, completedPhases, lastUpdated)', () => {
    const out = renderStateDiff(
      { _schema: 'legacy', completedPhases: ['old'], phase: 'PLAN' },
      { _schema: 1, completedPhases: ['new'], phase: 'EXECUTE' }
    );
    expect(out).toBe('phase: PLAN → EXECUTE');
    expect(out).not.toMatch(/_schema/);
    expect(out).not.toMatch(/completedPhases/);
  });

  it('returns "No state to diff." when either side is null', () => {
    expect(renderStateDiff(null, { phase: 'X' })).toBe('No state to diff.');
    expect(renderStateDiff({ phase: 'X' }, null)).toBe('No state to diff.');
  });

});

describe('detectStateChanges — baseline edge', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-detect-changes-edge-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('passes through detection cleanly when STATE.md has no last_updated_commit baseline', async () => {
    // Plant a state with last_updated_commit: null
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    const data = {
      schema_version: 1,
      phase: 'EXECUTE',
      current_epic: null,
      current_wave: null,
      current_tasks: [],
      completed_phases: [],
      blockers: [],
      last_decision_at: null,
      last_updated_commit: null,
      last_updated: '2026-05-17T00:00:00.000Z',
    };
    await writeFile(
      join(tempDir, '.planning', 'STATE.md'),
      stringifyFrontmatter(data, 'body\n'),
      'utf-8'
    );
    const execFn = vi.fn(() => gitOutput('sha1 anything'));
    const result = await detectStateChanges(tempDir, { execFn });
    // isStateStale skips git call → diff reflects fresh.
    expect(result.diff.commitsBehind).toBe(0);
    expect(execFn).not.toHaveBeenCalled();
  });
});

describe('captureCheckpointContext (--context mode)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-capture-ctx-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('appends decisions to CONTEXT.md § Locked Decisions and creates the section if missing', async () => {
    await writeFile(
      join(tempDir, '.planning', 'CONTEXT.md'),
      '# Context\n\n## Project\n\nSignal.\n',
      'utf-8'
    );
    await captureCheckpointContext(tempDir, {
      decisions: ['Auth uses Supabase JWT, not custom session'],
    });
    const ctx = await readFile(join(tempDir, '.planning', 'CONTEXT.md'), 'utf-8');
    expect(ctx).toContain('## Locked Decisions');
    expect(ctx).toContain('Auth uses Supabase JWT, not custom session');
  });

  it('creates CONTEXT.md from scratch when absent', async () => {
    await captureCheckpointContext(tempDir, {
      decisions: ['Switch to Postgres'],
    });
    const ctx = await readFile(join(tempDir, '.planning', 'CONTEXT.md'), 'utf-8');
    expect(ctx).toMatch(/^#/); // has a heading
    expect(ctx).toContain('## Locked Decisions');
    expect(ctx).toContain('Switch to Postgres');
  });

  it('appends one entry per decision to DECISIONS.md (D16 dual-write)', async () => {
    await captureCheckpointContext(tempDir, {
      decisions: ['Decision A', 'Decision B'],
    });
    const dec = await readFile(join(tempDir, '.planning', 'DECISIONS.md'), 'utf-8');
    expect(dec).toMatch(/##\s+\d{4}-\d{2}-\d{2}.*Decision A/);
    expect(dec).toMatch(/##\s+\d{4}-\d{2}-\d{2}.*Decision B/);
  });

  it('appends questions to OPEN-QUESTIONS.md as level-2 headings', async () => {
    await captureCheckpointContext(tempDir, {
      questions: ['Do we need rate limiting in MVP?', 'JWT secret rotation cadence?'],
    });
    const oq = await readFile(join(tempDir, '.planning', 'OPEN-QUESTIONS.md'), 'utf-8');
    expect(oq).toMatch(/^##\s+Do we need rate limiting/m);
    expect(oq).toMatch(/^##\s+JWT secret rotation/m);
  });

  it('is a no-op (no writes) when both decisions and questions are empty', async () => {
    const result = await captureCheckpointContext(tempDir, {});
    expect(result.wrote).toEqual([]);
    // Verify no files were created.
    const planningDir = join(tempDir, '.planning');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(planningDir)).toEqual([]);
  });

  it('strips whitespace-only entries before write', async () => {
    const result = await captureCheckpointContext(tempDir, {
      decisions: ['real decision', '   ', ''],
      questions: ['', '   '],
    });
    expect(result.wrote.some((p) => p.endsWith('CONTEXT.md'))).toBe(true);
    expect(result.wrote.some((p) => p.endsWith('OPEN-QUESTIONS.md'))).toBe(false);
  });

  // S6.t1 — scrub-before-write contract (IMPORTANT-1 + IMPORTANT-5).
  // The pre-S6 behavior wrote files first, then surfaced sensitiveHits to
  // the caller. That leaked secrets to git-tracked markdown before the abort
  // prompt fired. S6.t1 inverts the order: detect first, refuse to write
  // unless `acknowledgeSensitive: true` is passed.

  it('refuses to write and returns aborted: "sensitive-data-pending" when hits found without acknowledgeSensitive', async () => {
    const result = await captureCheckpointContext(tempDir, {
      decisions: ['Token is ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    });
    expect(result.wrote).toEqual([]);
    expect(result.sensitiveHits.length).toBeGreaterThan(0);
    expect(result.sensitiveHits[0].type).toBe('github-token');
    expect(result.aborted).toBe('sensitive-data-pending');

    // No files mutated.
    const { readdir } = await import('node:fs/promises');
    const planningDir = join(tempDir, '.planning');
    expect(await readdir(planningDir)).toEqual([]);
  });

  it('writes when acknowledgeSensitive: true and still surfaces sensitiveHits for audit', async () => {
    const result = await captureCheckpointContext(tempDir, {
      decisions: ['Token is ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
      acknowledgeSensitive: true,
    });
    expect(result.wrote.length).toBeGreaterThan(0);
    expect(result.wrote.some((p) => p.endsWith('CONTEXT.md'))).toBe(true);
    expect(result.wrote.some((p) => p.endsWith('DECISIONS.md'))).toBe(true);
    expect(result.sensitiveHits.length).toBeGreaterThan(0);
    expect(result.sensitiveHits[0].type).toBe('github-token');
    // No aborted flag on the acknowledged path.
    expect(result.aborted).toBeUndefined();

    const ctx = await readFile(join(tempDir, '.planning', 'CONTEXT.md'), 'utf-8');
    expect(ctx).toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('writes when no sensitive hits regardless of acknowledgeSensitive', async () => {
    const result = await captureCheckpointContext(tempDir, {
      decisions: ['Plain decision with no secrets'],
    });
    expect(result.wrote.length).toBeGreaterThan(0);
    expect(result.sensitiveHits).toEqual([]);
    expect(result.aborted).toBeUndefined();
  });
});

describe('handleCheckpointOrphans (S2.t7)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-orphan-prompt-test-'));
    await setupSchemaV1Fixture(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns action: "none" when no orphans found', async () => {
    // No current_tasks → detectOrphans returns [].
    const promptSpy = vi.fn();
    const result = await handleCheckpointOrphans(tempDir, {
      execFn: () => gitOutput(),
      prompt: promptSpy,
    });
    expect(result.action).toBe('none');
    expect(result.orphans).toEqual([]);
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('clears orphans (status: aborted) when prompt returns "clear"', async () => {
    const { setCurrentTask, readState } = await import('../tools/lib/state.js');
    const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T-OLD', startedAt: oldStart });
    const prompt = vi.fn(async () => 'clear');
    const result = await handleCheckpointOrphans(tempDir, {
      execFn: () => gitOutput(), // no matching commit
      prompt,
    });
    expect(result.action).toBe('cleared');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0][0]).toHaveLength(1); // orphans array
    const state = await readState(tempDir);
    expect(state.current_tasks).toEqual([]);
    expect(state.last_completed_task.id).toBe('T-OLD');
    expect(state.last_completed_task.status).toBe('aborted');
  });

  it('leaves orphans intact when prompt returns "keep"', async () => {
    const { setCurrentTask, readState } = await import('../tools/lib/state.js');
    const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T-OLD', startedAt: oldStart });
    const prompt = vi.fn(async () => 'keep');
    const result = await handleCheckpointOrphans(tempDir, {
      execFn: () => gitOutput(),
      prompt,
    });
    expect(result.action).toBe('kept');
    const state = await readState(tempDir);
    expect(state.current_tasks.map((t) => t.id)).toEqual(['T-OLD']);
  });

  it('returns action: "pending" with orphans when no prompt is supplied', async () => {
    const { setCurrentTask } = await import('../tools/lib/state.js');
    const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T-OLD', startedAt: oldStart });
    const result = await handleCheckpointOrphans(tempDir, {
      execFn: () => gitOutput(),
    });
    expect(result.action).toBe('pending');
    expect(result.orphans.map((o) => o.id)).toEqual(['T-OLD']);
  });
});
