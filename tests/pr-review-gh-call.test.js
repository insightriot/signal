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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readPrReviewFindings, readReviewerEffort } from '../plugin/tools/lib/pr-review-findings.js';
import { testSeam } from '../plugin/tools/lib/git-env.js';

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

  // r6.4: a planted folder is git's to refuse (`gh` runs with `gitEnv`; see
  // `tests/git-env-planted-bare-repo.test.js`, which checks that no `gh` call
  // names the planted remote). What this module decides for itself is the
  // gate: with a git older than 2.38, `gh` is not run at all.
  it('with a git older than 2.38, gh is not run — by the module or by an execFn — and the reason says so', () => {
    const log = fakeGh();
    testSeam.gitVersion = 'git version 2.34.1';
    let calls = 0;
    try {
      for (const read of [readPrReviewFindings, readReviewerEffort]) {
        const reason = 'Signal needs git 2.38 or newer for its git-backed checks; this is git 2.34.1 — nothing was asked';
        expect(read({ ...args, cwd: root })).toMatchObject({ status: 'cannot-check', reason });
        expect(read({ ...args, cwd: root, execFn: () => { calls += 1; return NODES; } })).toMatchObject({ status: 'cannot-check', reason });
      }
    } finally {
      testSeam.gitVersion = undefined;
    }
    expect(existsSync(log)).toBe(false);
    expect(calls).toBe(0);
  });
});

// r6.4: the module's own runner threw away what `gh` wrote to stderr, so every
// failure read "could not reach GitHub (Command failed: gh api graphql -f
// query=query($owner…" — the command line, and nothing about why.
describe('why gh failed', { timeout: 60_000 }, () => {
  function failingGh(stderr, status = 1) {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(stderr)} >&2\nexit ${status}\n`);
    chmodSync(join(bin, 'gh'), 0o755);
    process.env.PATH = `${bin}:${savedPath}`;
  }

  it.each([
    ['not logged in', 'To get started with GitHub CLI, please run:  gh auth login'],
    ['no network', 'error connecting to api.github.com'],
    ['rate limit', 'gh: API rate limit exceeded for user ID 1. (HTTP 403)'],
  ])('%s: the reason carries what gh said, and not the command line', (_label, said) => {
    failingGh(said);
    const findings = readPrReviewFindings({ ...args, cwd: root });
    expect(findings).toMatchObject({ status: 'cannot-check', reason: `could not reach GitHub (${said}) — the reviewer's findings were NOT checked` });
    expect(findings.reason).not.toContain('query=');
    expect(readReviewerEffort({ ...args, cwd: root })).toMatchObject({ status: 'cannot-check', reason: `could not read the PR (${said})` });
  });

  it('only the first line, printable and capped; an execFn\'s plain error still reads by its message', () => {
    failingGh(`${'x'.repeat(500)}\nsecond line`);
    const { reason } = readPrReviewFindings({ ...args, cwd: root });
    expect(reason).not.toContain('second line');
    expect(reason.length).toBeLessThan(300);
    const viaExecFn = readPrReviewFindings({ ...args, execFn: () => { throw new Error('gh: command not found\nmore'); } });
    expect(viaExecFn.reason).toBe('could not reach GitHub (gh: command not found) — the reviewer\'s findings were NOT checked');
  });

  it.each([['a'.repeat(101)], ['.'], ['..']])('an owner or repo that is %j is not a plain name', (name) => {
    let calls = 0;
    const execFn = () => { calls += 1; return NODES; };
    expect(readPrReviewFindings({ ...args, owner: name, execFn }).status).toBe('cannot-check');
    expect(readPrReviewFindings({ ...args, repo: name, execFn }).status).toBe('cannot-check');
    expect(calls).toBe(0);
    expect(readPrReviewFindings({ ...args, owner: 'a'.repeat(100), repo: '.github', execFn }).status).toBe('clean');
  });
});
