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

  // S6.t3 (REVIEW IMPORTANT-4): D11 chose commit-hash-based staleness to
  // avoid wall-clock skew. STALE_SKIP_GRACE_MS reintroduced that dependency
  // for a 60s optimization. Replaced with a HEAD-hash compare: same intent
  // (skip the git log when we're certainly fresh), no clock dependency.

  it('S6.t3: skips git log when last_updated_commit === HEAD (hash short-circuit)', async () => {
    await plantState(tempDir, {
      last_updated_commit: 'abc123',
      // last_updated is irrelevant under the new contract — only the hash
      // matters. Set it to an OLD timestamp to prove wall-clock is moot.
      last_updated: '2020-01-01T00:00:00.000Z',
    });
    const execSpy = vi.fn((cmd, args) => {
      if (args[0] === 'rev-parse') return Buffer.from('abc123\n');
      // log should never be reached under the short-circuit.
      throw new Error('git log should not be called when HEAD matches');
    });
    const result = await isStateStale(tempDir, { execFn: execSpy });
    expect(result).toEqual({ stale: false, commitCount: 0, commits: [] });
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0][1]).toEqual(['rev-parse', 'HEAD']);
  });

  it('S6.t3: always hits git log when bypassGrace: true even if HEAD matches', async () => {
    await plantState(tempDir, { last_updated_commit: 'abc123' });
    // bypassGrace skips the short-circuit; rev-parse is also skipped because
    // we know we're going to log anyway. Only one call expected: the log.
    const execSpy = vi.fn(() => gitOutput('sha1 fresh commit'));
    const result = await isStateStale(tempDir, {
      execFn: execSpy,
      bypassGrace: true,
    });
    expect(result.stale).toBe(true);
    expect(result.commitCount).toBe(1);
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0][1]).toContain('abc123..HEAD');
  });

  it('uses git rev-range <sha>..HEAD with D6 state-affecting pathspec', async () => {
    await plantState(tempDir, { last_updated_commit: 'deadbeef' });
    const execSpy = vi.fn(() => gitOutput());
    // bypassGrace skips the rev-parse short-circuit so we test the log call
    // in isolation. (S6.t3: the short-circuit path is exercised by its own test.)
    await isStateStale(tempDir, { execFn: execSpy, bypassGrace: true });
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

  // REVIEW F1: isStateStale runs BEFORE isStaleVsOrigin in /sig:resume +
  // /sig:checkpoint, so it must also fail open on a schema-drifted STATE.md —
  // else those commands crash before the schema-drift banner can render.
  it('REVIEW F1: fails open (no throw, no git) on a schema-drifted STATE.md', async () => {
    await plantState(tempDir, { schema_version: 999, last_updated_commit: 'abc123' });
    const execSpy = vi.fn(() => gitOutput('sha1 anything'));
    let result;
    await expect(
      (async () => { result = await isStateStale(tempDir, { execFn: execSpy }); })()
    ).resolves.not.toThrow();
    expect(result).toEqual({ stale: false, commitCount: 0, commits: [] });
    expect(execSpy).not.toHaveBeenCalled();
  });

  // REVIEW Sec-2: an option-like last_updated_commit is rejected before it can
  // be glued into a git revision range.
  it('REVIEW Sec-2: rejects an option-like last_updated_commit before any git call', async () => {
    await plantState(tempDir, { last_updated_commit: '--output=/tmp/pwned' });
    const execSpy = vi.fn(() => gitOutput('sha1 anything'));
    const result = await isStateStale(tempDir, { execFn: execSpy });
    expect(result).toEqual({ stale: false, commitCount: 0, commits: [] });
    expect(execSpy).not.toHaveBeenCalled();
  });
});
