// M6.E16 r6.3 — how `pr-review-findings.js` runs `gh`.
//
//   - `gh api -F owner=…` reads a FILE when the value starts with `@`. The
//     owner and repository are text: they go with `-f`, and one that is not a
//     plain GitHub name is refused before `gh` is run. The pull request number
//     keeps `-F` (it must arrive as a number).
//   - the environment `gh` runs with (git's own — `gh` runs git) was only
//     HANDED to an `execFn` the caller wrote; the one caller is an instruction
//     in `ship.md`. With no `execFn` the module now runs `gh` itself, with
//     that environment. With one, it is handed `{cwd, env}` as before.
//   - and in a folder that only looks like a repository it does not run `gh`
//     at all, as `readPullRequestEvidence` does not.
//
// `gh` here is a script on a PATH of the test's own: nothing leaves the machine.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readPrReviewFindings, readReviewerEffort } from '../plugin/tools/lib/pr-review-findings.js';

const NODES = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } });
const args = { owner: 'insightriot', repo: 'signal', pr: 197 };

let root;
let savedPath;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'sig-gh-call-')));
  savedPath = process.env.PATH;
});
afterEach(() => {
  process.env.PATH = savedPath;
  rmSync(root, { recursive: true, force: true });
});

// A `gh` that writes down how it was called and answers with no review threads.
function fakeGh() {
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const log = join(root, 'gh-was-run');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\n{ pwd; echo "$GIT_CONFIG_COUNT $GIT_NO_REPLACE_OBJECTS $GIT_DIR"; echo "$@"; } > '${log}'\necho '${NODES}'\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  process.env.PATH = `${bin}:${savedPath}`;
  return log;
}

describe('the arguments', () => {
  it('owner and repo are passed as text (-f), the pull request number as a number (-F)', () => {
    let seen;
    const r = readPrReviewFindings({ ...args, execFn: (cmd, a) => { seen = [cmd, ...a]; return NODES; } });
    expect(r.status).toBe('clean');
    const flagBefore = (value) => seen[seen.indexOf(value) - 1];
    expect(flagBefore('owner=insightriot')).toBe('-f');
    expect(flagBefore('repo=signal')).toBe('-f');
    expect(flagBefore('pr=197')).toBe('-F');
  });

  it.each([
    ['an owner that names a file', { owner: '@/etc/passwd' }],
    ['a repo that names a file', { repo: '@secrets.txt' }],
    ['an owner with a space', { owner: 'a b' }],
    ['a repo with a slash', { repo: 'signal/../x' }],
    ['an owner that is an option', { owner: '--hostname=evil.example' }],
  ])('%s is refused as cannot-check, and gh is not run', (_label, over) => {
    let calls = 0;
    const execFn = () => { calls += 1; return NODES; };
    expect(readPrReviewFindings({ ...args, ...over, execFn })).toMatchObject({ status: 'cannot-check', reason: expect.stringMatching(/not a plain GitHub (owner|repository) name/) });
    expect(readReviewerEffort({ ...args, ...over, execFn })).toMatchObject({ status: 'cannot-check', reason: expect.stringMatching(/not a plain GitHub (owner|repository) name/) });
    expect(calls).toBe(0);
  });
});

describe('who runs gh, and with what', { timeout: 60_000 }, () => {
  it('an execFn the caller brings is handed the folder and git\'s environment', () => {
    let opts;
    readPrReviewFindings({ ...args, cwd: root, execFn: (cmd, a, o) => { opts = o; return NODES; } });
    expect(opts.cwd).toBe(root);
    expect(opts.env).toMatchObject({ GIT_NO_REPLACE_OBJECTS: '1' });
    expect(Object.values(opts.env)).toContain('safe.bareRepository');
  });

  it('with no execFn the module runs gh itself, in that folder, with git\'s environment', () => {
    const log = fakeGh();
    const r = readPrReviewFindings({ ...args, cwd: root });
    expect(r.status).toBe('clean');
    const written = readFileSync(log, 'utf-8');
    const [where, env] = written.split('\n');
    expect(where).toBe(root);
    expect(env).toMatch(/^[1-9]\d* 1 $/); // settings in the environment, replace refs off, no GIT_DIR
    expect(written).toContain('-f owner=insightriot -f repo=signal -F pr=197'); // the query above it spans lines
  });

  it('readReviewerEffort with no execFn runs gh itself too', () => {
    const log = fakeGh();
    // The fake answers every call with the threads JSON, which is not a pull request: the read stops there.
    const r = readReviewerEffort({ ...args, cwd: root });
    expect(r.status).toBe('cannot-check');
    expect(readFileSync(log, 'utf-8')).toContain('pr view 197 -R insightriot/signal');
  });

  it('in a folder that only looks like a repository, gh is not run — by the module or by an execFn', () => {
    // An outer repository, and a planted layout in a folder of it.
    const g = (cwd, ...a) => spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...a], { cwd, encoding: 'utf8' });
    const outer = join(root, 'outer');
    const planted = join(outer, 'proj');
    mkdirSync(planted, { recursive: true });
    g(outer, 'init', '-q', '-b', 'main');
    const seed = join(root, 'seed');
    mkdirSync(seed);
    g(seed, 'init', '-q', '-b', 'planted');
    g(seed, 'commit', '-q', '--allow-empty', '-m', 'p');
    for (const part of ['HEAD', 'config', 'objects', 'refs']) cpSync(join(seed, '.git', part), join(planted, part), { recursive: true });
    const log = fakeGh();
    let calls = 0;
    for (const read of [readPrReviewFindings, readReviewerEffort]) {
      expect(read({ ...args, cwd: planted })).toMatchObject({ status: 'cannot-check', reason: expect.stringMatching(/not a git repository/) });
      expect(read({ ...args, cwd: planted, execFn: () => { calls += 1; return NODES; } })).toMatchObject({ status: 'cannot-check' });
    }
    expect(existsSync(log)).toBe(false);
    expect(calls).toBe(0);
    // the real repository beside it is asked as usual
    expect(readPrReviewFindings({ ...args, cwd: outer }).status).toBe('clean');
  });
});
