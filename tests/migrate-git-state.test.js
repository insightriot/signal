// M5.E2.S1.t7a — git-state probe (the refuse / proceed / downgrade matrix).
//
// Real temp git repos (gold standard for a safety-critical probe). Each state
// maps to a decision: clean→git, dirty+!force→refuse, dirty+force→git(surgical),
// detached→git+warn, unborn→fs-backup, gitignored→fs-backup, non-repo→fs-backup.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { probeGitState } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

async function initPlanning(dir) {
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), '---\nschema_version: 1\nphase: PLAN\n---\nbody\n', 'utf-8');
}
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}
function commitAll(dir, msg = 'init') {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

describe('M5.E2.S1.t7a probeGitState', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-git-'));
    await initPlanning(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('clean git tree → mode git, proceed', () => {
    initRepo(dir);
    commitAll(dir);
    const d = probeGitState(dir);
    expect(d.mode).toBe('git');
    expect(d.proceed).toBe(true);
    expect(d.dirty).toBe(false);
  });

  it('dirty tree without --force → REFUSE (data-safety)', async () => {
    initRepo(dir);
    commitAll(dir);
    await writeFile(join(dir, '.planning', 'STATE.md'), '---\nschema_version: 1\nphase: EXECUTE\n---\nchanged\n', 'utf-8');
    const d = probeGitState(dir, { force: false });
    expect(d.proceed).toBe(false);
    expect(d.dirty).toBe(true);
    expect(d.reason).toMatch(/dirty/i);
  });

  it('dirty tree WITH --force → proceed, warns the rollback is surgical', async () => {
    initRepo(dir);
    commitAll(dir);
    await writeFile(join(dir, 'other.txt'), 'user work in progress\n', 'utf-8');
    const d = probeGitState(dir, { force: true });
    expect(d.proceed).toBe(true);
    expect(d.dirty).toBe(true);
    expect(d.warnings.join(' ')).toMatch(/surgical/i);
  });

  it('unborn HEAD (repo, no commits) → downgrade to fs-backup', () => {
    initRepo(dir); // no commit
    const d = probeGitState(dir);
    expect(d.mode).toBe('fs-backup');
    expect(d.proceed).toBe(true);
    expect(d.warnings.join(' ')).toMatch(/unborn|no commit/i);
  });

  it('.planning/ gitignored → downgrade to fs-backup', async () => {
    initRepo(dir);
    await writeFile(join(dir, '.gitignore'), '.planning/\n', 'utf-8');
    commitAll(dir);
    const d = probeGitState(dir);
    expect(d.mode).toBe('fs-backup');
    expect(d.warnings.join(' ')).toMatch(/gitignore/i);
  });

  it('not a git repository → downgrade to fs-backup', () => {
    const d = probeGitState(dir); // never init'd
    expect(d.mode).toBe('fs-backup');
    expect(d.proceed).toBe(true);
    expect(d.warnings.join(' ')).toMatch(/not a git/i);
  });

  it('detached HEAD → proceed (git), warns the tag still anchors rollback', () => {
    initRepo(dir);
    commitAll(dir, 'one');
    const sha = String(git(dir, ['rev-parse', 'HEAD'])).trim();
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'two']);
    git(dir, ['checkout', '-q', sha]); // detached
    const d = probeGitState(dir);
    expect(d.mode).toBe('git');
    expect(d.proceed).toBe(true);
    expect(d.warnings.join(' ')).toMatch(/detached/i);
  });
});
