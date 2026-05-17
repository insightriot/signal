// Tests for isStateStale (M4.5.E6.S1.t8, D11 + D6 path scope).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  isStateStale,
  stringifyFrontmatter,
} from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plant a schema-v1 STATE.md with the supplied frontmatter fields.
async function plantState(tempDir, fm) {
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
    ...fm,
  };
  await writeFile(
    join(tempDir, '.planning', 'STATE.md'),
    stringifyFrontmatter(data, '# body\n'),
    'utf-8'
  );
}

function gitOutput(...lines) {
  return Buffer.from(lines.join('\n'));
}

describe('isStateStale', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-stale-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns stale=false when git reports no new commits', async () => {
    await plantState(tempDir, { last_updated_commit: 'abc123' });
    const result = await isStateStale(tempDir, { execFn: () => gitOutput() });
    expect(result).toEqual({ stale: false, commitCount: 0, commits: [] });
  });

  it('returns stale=true with commit count and subjects when commits exist', async () => {
    await plantState(tempDir, { last_updated_commit: 'abc123' });
    const result = await isStateStale(tempDir, {
      execFn: () =>
        gitOutput(
          'sha1 Subject one',
          'sha2 Subject two with spaces',
          'sha3 M4.5.E6.S1.t8: implementation'
        ),
    });
    expect(result.stale).toBe(true);
    expect(result.commitCount).toBe(3);
    expect(result.commits).toEqual([
      { sha: 'sha1', subject: 'Subject one' },
      { sha: 'sha2', subject: 'Subject two with spaces' },
      { sha: 'sha3', subject: 'M4.5.E6.S1.t8: implementation' },
    ]);
  });

  it('skips the git call when last_updated is within 60s of now', async () => {
    const recent = new Date(Date.now() - 5_000).toISOString(); // 5s ago
    await plantState(tempDir, {
      last_updated_commit: 'abc123',
      last_updated: recent,
    });
    const execSpy = vi.fn(() => gitOutput('sha1 something'));
    const result = await isStateStale(tempDir, { execFn: execSpy });
    expect(result).toEqual({ stale: false, commitCount: 0, commits: [] });
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('uses git rev-range <sha>..HEAD with D6 state-affecting pathspec', async () => {
    await plantState(tempDir, { last_updated_commit: 'deadbeef' });
    const execSpy = vi.fn(() => gitOutput());
    await isStateStale(tempDir, { execFn: execSpy });
    expect(execSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = execSpy.mock.calls[0];
    expect(cmd).toBe('git');
    // rev range "<sha>..HEAD"
    expect(args).toContain('deadbeef..HEAD');
    // D6 paths included
    expect(args.some((a) => a.includes('STATE.md'))).toBe(true);
    expect(args.some((a) => a.includes('CONTEXT.md'))).toBe(true);
    expect(args.some((a) => a.includes('*-PROGRESS.md'))).toBe(true);
    expect(args.some((a) => a.includes('*-PLAN.md'))).toBe(true);
    expect(args.some((a) => a.includes('*-VERIFICATION.md'))).toBe(true);
    expect(args.some((a) => a.includes('*-REVIEW.md'))).toBe(true);
    // D6 EXCLUSIONS — these paths should NOT appear in the pathspec
    expect(args.some((a) => a.includes('FUTURE-IDEAS.md'))).toBe(false);
    expect(args.some((a) => a.includes('OPEN-QUESTIONS.md'))).toBe(false);
    expect(args.some((a) => a.includes('DECISIONS.md'))).toBe(false);
    expect(args.some((a) => a.includes('MILESTONE-'))).toBe(false);
    expect(args.some((a) => a.includes('PROJECT.md'))).toBe(false);
    expect(args.some((a) => a.includes('LANDSCAPE.md'))).toBe(false);
  });

  it('returns {stale: false, commits: []} + stderr warning when git fails', async () => {
    await plantState(tempDir, { last_updated_commit: 'abc123' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const execFn = () => {
        throw new Error('git: not a repo');
      };
      const result = await isStateStale(tempDir, { execFn });
      expect(result).toEqual({ stale: false, commitCount: 0, commits: [] });
      const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toMatch(/git/i);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('returns {stale: false, commits: []} when STATE.md has no last_updated_commit baseline', async () => {
    await plantState(tempDir, { last_updated_commit: null });
    const execSpy = vi.fn(() => gitOutput('sha1 anything'));
    const result = await isStateStale(tempDir, { execFn: execSpy });
    expect(result).toEqual({ stale: false, commitCount: 0, commits: [] });
    expect(execSpy).not.toHaveBeenCalled();
  });
});
