// M6.E16 r6.2 — two answers of the git helpers behind a close's confirmation
// (`plugin/tools/lib/work-write.js`) that were right with nothing holding them.
//
//   - `defaultBranchRef`: when git cannot LIST the remotes, the reason is
//     `git-failed` — not `no-remote`, which would tell the user their project
//     has no remote and that nothing can ever be confirmed.
//   - a grafts file (`.git/info/grafts`) can give a commit on the default
//     branch a parent it never had, so that work nobody merged looks merged.
//     Signal's git calls do not read one (`GIT_GRAFT_FILE=/dev/null`,
//     `gitEnv`): the ancestry answer is the real history's.
//
// Real git for the second, in a temp folder; an injected exec for the first.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ancestryFailure, defaultBranchRef } from '../plugin/tools/lib/work-write.js';

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sig-write-git-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('defaultBranchRef — why there is no ref to confirm against', () => {
  // A repository, by the first question; the answer to `git remote` is the case.
  // Since M6.E16 r7.1 a list with no `origin` is believed only when git read
  // the repository's own config: the stub answers that question too.
  const exec = (remote, config = () => '0\n') => (cmd, args) => {
    if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true\n';
    if (args.length === 1 && args[0] === 'remote') return remote();
    if (args[0] === 'config' && args[1] === '--local') return config();
    throw new Error(`unexpected: git ${args.join(' ')}`);
  };

  it('git cannot list the remotes: `git-failed`, not `no-remote`', () => {
    expect(defaultBranchRef(root, exec(() => { throw new Error('fatal: unable to read config'); }))).toEqual({ reason: 'git-failed' });
  });

  it('git lists none: `no-remote`; some, none of them origin: `no-origin-remote`', () => {
    expect(defaultBranchRef(root, exec(() => ''))).toEqual({ reason: 'no-remote' });
    expect(defaultBranchRef(root, exec(() => 'fork\nupstream\n'))).toEqual({ reason: 'no-origin-remote' });
  });

  it('the same lists from a git that did not read the repository\'s config: `git-failed`', () => {
    const unread = () => { throw new Error('fatal: --local can only be used inside a git repository'); };
    expect(defaultBranchRef(root, exec(() => '', unread))).toEqual({ reason: 'git-failed' });
    expect(defaultBranchRef(root, exec(() => 'fork\nupstream\n', unread))).toEqual({ reason: 'git-failed' });
  });
});

describe('a grafts file does not make unmerged work look merged', () => {
  const g = (cwd, ...args) => {
    const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };

  it('a graft that gives the default branch\'s commit an unmerged parent: the commit is still not on the default branch', () => {
    const work = join(root, 'work');
    mkdirSync(work);
    g(work, 'init', '-q', '-b', 'main');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'on main');
    const onMain = g(work, 'rev-parse', 'HEAD');
    g(root, 'init', '-q', '--bare', '-b', 'main', join(root, 'remote.git'));
    g(work, 'remote', 'add', 'origin', join(root, 'remote.git'));
    g(work, 'push', '-q', '-u', 'origin', 'main');
    // Work nobody merged, with no history in common with main.
    g(work, 'checkout', '-q', '--orphan', 'never-merged');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'never merged');
    const unmerged = g(work, 'rev-parse', 'HEAD');
    g(work, 'checkout', '-q', 'main');
    const REF = 'refs/remotes/origin/main';
    const plain = () => spawnSync('git', ['merge-base', '--is-ancestor', unmerged, REF], { cwd: work }).status;
    expect(plain()).toBe(1);

    mkdirSync(join(work, '.git', 'info'), { recursive: true });
    writeFileSync(join(work, '.git', 'info', 'grafts'), `${onMain} ${unmerged}\n`);
    // Git as the user runs it now believes the graft (while it still reads
    // grafts files at all — if a later git stops, this line is the one to drop).
    expect(plain()).toBe(0);
    // Signal's question is answered from the real history.
    expect(ancestryFailure(work, unmerged, REF, execFileSync, () => false)).toBe('not-on-default-branch');
    // And a commit that really is there still is.
    expect(ancestryFailure(work, onMain, REF, execFileSync, () => false)).toBeNull();
  });
});
