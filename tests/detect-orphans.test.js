// Tests for detectOrphans (M4.5.E6.S1.t7, D12).
// Mocks the git shell-out via the helper's injectable `execFn`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  detectOrphans,
  setCurrentTask,
} from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'state');

async function setupSchemaV1Fixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(FIXTURE_ROOT, 'schema-v1', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

// Helper — return a Buffer-shaped result like execFileSync('git', ...).
function gitOutput(...lines) {
  return Buffer.from(lines.join('\n'));
}

describe('detectOrphans', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-orphans-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns [] when no current_tasks exist', async () => {
    await setupSchemaV1Fixture(tempDir);
    expect(await detectOrphans(tempDir, { execFn: () => gitOutput() })).toEqual([]);
  });

  it('returns [] when all in-progress tasks are younger than the threshold', async () => {
    await setupSchemaV1Fixture(tempDir);
    await setCurrentTask(tempDir, {
      id: 'T1',
      startedAt: new Date().toISOString(), // just now
    });
    const orphans = await detectOrphans(tempDir, {
      thresholdMs: 30 * 60 * 1000,
      execFn: () => gitOutput(),
    });
    expect(orphans).toEqual([]);
  });

  it('flags tasks older than the threshold with no matching commit', async () => {
    await setupSchemaV1Fixture(tempDir);
    const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    await setCurrentTask(tempDir, { id: 'T-OLD', startedAt: oldStart });
    const orphans = await detectOrphans(tempDir, {
      thresholdMs: 30 * 60 * 1000,
      execFn: () => gitOutput('something unrelated'), // no T-OLD in subjects
    });
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe('T-OLD');
    expect(orphans[0].startedAt).toBe(oldStart);
    expect(orphans[0].ageMs).toBeGreaterThan(60 * 60 * 1000); // >1h
  });

  it('does NOT flag a stale task if a recent commit subject references its id', async () => {
    await setupSchemaV1Fixture(tempDir);
    const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T-DONE', startedAt: oldStart });
    const orphans = await detectOrphans(tempDir, {
      thresholdMs: 30 * 60 * 1000,
      execFn: () => gitOutput('M4.5.E6.S1.t7 (T-DONE): work landed'),
    });
    expect(orphans).toEqual([]);
  });

  it('passes `git log --since=<iso>` with state-affecting path scope', async () => {
    await setupSchemaV1Fixture(tempDir);
    const oldStart = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T1', startedAt: oldStart });
    const execSpy = vi.fn(() => gitOutput());
    await detectOrphans(tempDir, { execFn: execSpy });
    expect(execSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = execSpy.mock.calls[0];
    expect(cmd).toBe('git');
    expect(args).toContain('log');
    expect(args).toContain('--since');
    // ISO timestamp gets passed as the --since value
    const sinceIdx = args.indexOf('--since');
    expect(args[sinceIdx + 1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(args).toContain('--');
    expect(args).toContain('.planning/');
  });

  it('honors a custom thresholdMs override', async () => {
    await setupSchemaV1Fixture(tempDir);
    const start = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5m ago
    await setCurrentTask(tempDir, { id: 'T1', startedAt: start });
    // 30 min default → would NOT flag.
    expect(
      await detectOrphans(tempDir, { execFn: () => gitOutput() })
    ).toEqual([]);
    // 1 min override → SHOULD flag.
    const tight = await detectOrphans(tempDir, {
      thresholdMs: 60 * 1000,
      execFn: () => gitOutput(),
    });
    expect(tight.map((o) => o.id)).toEqual(['T1']);
  });

  it('returns [] + stderr warning when git shell-out fails (D6 graceful degradation)', async () => {
    await setupSchemaV1Fixture(tempDir);
    const oldStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T1', startedAt: oldStart });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const execFn = () => {
        throw new Error('git: command not found');
      };
      expect(await detectOrphans(tempDir, { execFn })).toEqual([]);
      const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toMatch(/git/i);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
