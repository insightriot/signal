// Tests for isStateStale (M4.5.E6.S1.t8, D11 + D6 path scope).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  isStateStale,
  stringifyFrontmatter,
} from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Real git-fixture helpers (B6/FR4). The mocked execFn tests above can't model
// the two-call suppression path (filtered STATE-affecting walk + the unfiltered
// "does any commit touch a non-STATE file?" check), so the bookkeeping-+1 cases
// run against real temp repos.
const git = (cwd, args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}
const headSha = (dir) => String(git(dir, ['rev-parse', 'HEAD'])).trim();
function commitAll(dir, msg) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

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
    // bypassGrace skips the short-circuit; rev-parse is also skipped because we
    // know we're going to log anyway. Two log calls now: the filtered
    // STATE-affecting walk, then the B6/FR4 genuine-work walk (both return the
    // flat 'sha1 fresh commit' -> genuine work present -> not suppressed).
    const execSpy = vi.fn(() => gitOutput('sha1 fresh commit'));
    const result = await isStateStale(tempDir, {
      execFn: execSpy,
      bypassGrace: true,
    });
    expect(result.stale).toBe(true);
    expect(result.commitCount).toBe(1);
    expect(execSpy).toHaveBeenCalledTimes(2);
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

  // --- B6/FR4: the bookkeeping-"+1" suppression (real git fixtures) ---
  //
  // markFresh sets last_updated_commit = HEAD-at-write-time but does NOT commit;
  // the caller then commits the STATE write, so HEAD ends up exactly one
  // STATE-only commit ahead of the recorded baseline. That pure-bookkeeping "+1"
  // must NOT read as "ground state moved". D6 path scope is preserved: staleness
  // still triggers on STATE-affecting files; the fix only suppresses the case
  // where EVERY commit in the range touches ONLY those paths.

  // AC4.1 (local): pure bookkeeping +1 = a STATE-only commit atop the recorded
  // baseline -> NOT stale. RED against current code (the filtered walk finds the
  // STATE.md commit and fires).
  it('B6/AC4.1: a pure bookkeeping +1 (STATE-only commit) is NOT stale', async () => {
    initRepo(tempDir);
    await writeFile(join(tempDir, 'app.js'), 'v0\n', 'utf-8');
    commitAll(tempDir, 'base: initial work');
    const base = headSha(tempDir);
    await plantState(tempDir, { last_updated_commit: base });
    commitAll(tempDir, 'chore: refresh STATE.md'); // STATE-only "+1"
    const result = await isStateStale(tempDir);
    expect(result.stale).toBe(false);
    expect(result.commitCount).toBe(0);
  }, 30000); // real-git fixture: generous timeout for parallel-suite load

  // 3-case, case 2: a real work commit (touches a non-STATE file) after the +1
  // -> fires. Green before-and-after guard: proves the suppression doesn't over-
  // reach a range that also contains genuine work.
  it('B6: a real work commit (non-STATE file) after the +1 IS stale', async () => {
    initRepo(tempDir);
    await writeFile(join(tempDir, 'app.js'), 'v0\n', 'utf-8');
    commitAll(tempDir, 'base: initial work');
    const base = headSha(tempDir);
    await plantState(tempDir, { last_updated_commit: base });
    commitAll(tempDir, 'chore: refresh STATE.md'); // STATE-only "+1"
    await writeFile(join(tempDir, 'app.js'), 'v1\n', 'utf-8'); // genuine work
    commitAll(tempDir, 'feat: real work');
    const result = await isStateStale(tempDir);
    expect(result.stale).toBe(true);
  }, 30000); // real-git fixture: generous timeout for parallel-suite load

  // 3-case, case 3: a mixed commit (STATE.md AND a non-STATE file) -> fires.
  // Green before-and-after guard distinguishing a pure-bookkeeping commit from a
  // real work commit that also happens to touch STATE.md.
  it('B6: a mixed commit (STATE.md + a non-STATE file) IS stale', async () => {
    initRepo(tempDir);
    await writeFile(join(tempDir, 'app.js'), 'v0\n', 'utf-8');
    commitAll(tempDir, 'base: initial work');
    const base = headSha(tempDir);
    await plantState(tempDir, { last_updated_commit: base });
    await writeFile(join(tempDir, 'app.js'), 'v1\n', 'utf-8'); // non-STATE work
    commitAll(tempDir, 'feat: work + STATE refresh'); // mixed: STATE.md + app.js
    const result = await isStateStale(tempDir);
    expect(result.stale).toBe(true);
  }, 30000); // real-git fixture: generous timeout for parallel-suite load
});
