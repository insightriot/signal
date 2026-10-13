// M6.E16 r6 (REVIEW, security) — which history a proposed close is checked
// against, and that the dry run says which.
//
// `buildEvidenceIndex` reads one ref, by the chain `D-M6E15-25` records:
// the remote's recorded default branch (`origin/HEAD`), else local `main`,
// else local `master`, else `HEAD`. Its output only ever supports a PROPOSAL
// a person answers, so the fallbacks stay. Two things changed here:
//   - each step asked `git rev-parse --verify`, which resolves a NAME: a tag
//     called `refs/remotes/origin/HEAD` answered for an unset `origin/HEAD`,
//     and a tag called `refs/heads/main` for a `main` that is not there, so a
//     pushed tag on unmerged work could support a proposed close. Now
//     `origin/HEAD` is read as a close is confirmed (`resolveDefaultBranch`,
//     `guess: false`) and each fallback is checked as that exact ref
//     (`exactRefExists`);
//   - when the history is not the remote's recorded default branch, the dry
//     run says which ref was read and that it is not.
//
// Temp folders, real git: a bare remote and a clone of it. A newer git records
// `origin/HEAD` at a fetch and an older one does not, so every fixture sets or
// deletes it itself. Every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildEvidenceIndex, runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';

const ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t.co', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t.co' };
const git = (cwd, args) => String(execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, env: ENV, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
const ORIGIN_HEAD = 'refs/remotes/origin/HEAD';

let root;
let base;
let merged;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sig-evidence-branch-'));
  base = join(root, 'leaf-notes');
  mkdirSync(join(base, '.planning'), { recursive: true });
  writeFileSync(join(base, '.planning', 'STATE.md'), '---\nschema_version: 1\ndocs_layout_version: 3\nphase: EXECUTE\n---\n# State\n');
  writeFileSync(join(base, '.planning', 'BUGS.md'), '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | fixed | P2 | Header lost — fixed by PR #99. |\n');
  git(base, ['init', '-q', '-b', 'main']);
  git(base, ['add', '-A']);
  git(base, ['commit', '-q', '-m', 'Merged work (#1)']);
  merged = git(base, ['rev-parse', 'HEAD']);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// A bare remote holding `main`, fetched.
function addRemote() {
  git(root, ['init', '-q', '--bare', '-b', 'main', 'origin.git']);
  git(base, ['remote', 'add', 'origin', join(root, 'origin.git')]);
  git(base, ['push', '-q', 'origin', 'main']);
  git(base, ['fetch', '-q', 'origin']);
}
const setOriginHead = (branch = 'main') => git(base, ['symbolic-ref', ORIGIN_HEAD, `refs/remotes/origin/${branch}`]);
function unsetOriginHead() {
  try {
    git(base, ['symbolic-ref', '-d', ORIGIN_HEAD]);
  } catch {
    // an older git never set it
  }
  expect(() => git(base, ['symbolic-ref', '--quiet', ORIGIN_HEAD])).toThrow();
}
// Work nobody merged, on a branch of its own, whose subject carries the pull
// request the bug entry cites. HEAD is put back where it was.
function unmergedCommit() {
  const was = git(base, ['branch', '--show-current']);
  git(base, ['checkout', '-q', '-b', 'unmerged']);
  git(base, ['commit', '-q', '--allow-empty', '-m', 'Not merged (#99)']);
  const hash = git(base, ['rev-parse', 'HEAD']);
  git(base, ['checkout', '-q', was]);
  return hash;
}
const dryRun = () => runWorkStoreMigrate(base, { apply: false, key: 'LEAF' });
const sourceLines = (report) => report.split('\n').filter((l) => l.startsWith('The history read is '));

describe('a tag cannot steer which history buildEvidenceIndex reads', () => {
  it('a tag named refs/remotes/origin/HEAD, on unmerged work, does not stand in for an unset origin/HEAD', async () => {
    addRemote();
    unsetOriginHead();
    const hostile = unmergedCommit();
    git(base, ['tag', ORIGIN_HEAD, hostile]);
    // The name does resolve, to the tag: this is what a name lookup read.
    expect(git(base, ['rev-parse', '--verify', '--quiet', ORIGIN_HEAD])).toBe(hostile);
    const idx = buildEvidenceIndex(base);
    expect(idx).toMatchObject({ source: 'git', ref: 'main', recorded: false, commits: [merged] });
    expect(idx.prs.has(99)).toBe(false);
    const dry = await dryRun();
    expect(dry.proposedCloses).toEqual([]);
    expect(dry.items.map((it) => [it.legacy_id, it.flag])).toEqual([['B1', 'no-evidence']]);
  });

  it('origin/HEAD → a branch that is gone, and a tag carrying that branch\'s long name: the tag is not read', () => {
    addRemote();
    setOriginHead('master'); // no such remote branch
    git(base, ['tag', 'refs/remotes/origin/master', unmergedCommit()]);
    expect(buildEvidenceIndex(base)).toMatchObject({ ref: 'main', recorded: false, commits: [merged] });
  });

  it('a tag named refs/heads/main, on unmerged work, does not stand in for a local main that is not there', async () => {
    const hostile = unmergedCommit();
    git(base, ['branch', '-m', 'main', 'trunk']);
    git(base, ['tag', 'refs/heads/main', hostile]);
    expect(git(base, ['rev-parse', '--verify', '--quiet', 'refs/heads/main'])).toBe(hostile);
    const idx = buildEvidenceIndex(base);
    expect(idx).toMatchObject({ source: 'git', ref: 'HEAD', recorded: false, commits: [merged] });
    expect(idx.prs.has(99)).toBe(false);
    expect((await dryRun()).proposedCloses).toEqual([]);
  });

  it('nor does a tag named refs/heads/master, or one named main or master', () => {
    const hostile = unmergedCommit();
    git(base, ['branch', '-m', 'main', 'trunk']);
    for (const name of ['refs/heads/master', 'main', 'master']) git(base, ['tag', name, hostile]);
    expect(buildEvidenceIndex(base)).toMatchObject({ ref: 'HEAD', commits: [merged] });
  });

  it('a tag named origin/main does not change what the recorded default branch reads', () => {
    addRemote();
    setOriginHead();
    git(base, ['tag', 'origin/main', unmergedCommit()]);
    expect(buildEvidenceIndex(base)).toMatchObject({ ref: 'origin/HEAD', recorded: true, commits: [merged] });
  });
});

describe('the dry run says which history was read, when it is not the remote\'s recorded default branch', () => {
  const NOT_RECORDED = 'which is not the remote\'s recorded default branch (origin/HEAD is not set)';
  const SET_HEAD = '`git remote set-head origin -a` records the remote\'s default branch; run it, then this again, to check against that.';

  it('origin/HEAD recorded: its history is read, a commit that is only local is not evidence, and nothing more is said', async () => {
    addRemote();
    setOriginHead();
    git(base, ['commit', '-q', '--allow-empty', '-m', 'Only local (#99)']);
    expect(buildEvidenceIndex(base)).toMatchObject({ source: 'git', ref: 'origin/HEAD', recorded: true, commits: [merged] });
    const dry = await dryRun();
    expect(dry.report).toMatch(/the default branch, origin\/HEAD \(1 commits/);
    expect(sourceLines(dry.report)).toEqual([]);
    expect(dry.proposedCloses).toEqual([]);
  });

  it('a remote, origin/HEAD unset, local main: the history is main\'s, and the report says so and names the command', async () => {
    addRemote();
    unsetOriginHead();
    git(base, ['commit', '-q', '--allow-empty', '-m', 'Only local (#99)']);
    expect(buildEvidenceIndex(base)).toMatchObject({ source: 'git', ref: 'main', recorded: false, remote: true });
    const dry = await dryRun();
    expect(dry.report).toMatch(/the default branch, main \(2 commits/);
    expect(sourceLines(dry.report)).toEqual([
      `The history read is the local branch main, ${NOT_RECORDED}: a local branch can hold commits nobody merged. ${SET_HEAD}`,
    ]);
    // The proposal stands on the local commit, and a person answers it knowing where it was read.
    expect(dry.proposedCloses.map((c) => c.legacyId)).toEqual(['B1']);
  });

  it('no remote, local main: the report says so, and names no command', async () => {
    expect(buildEvidenceIndex(base)).toMatchObject({ ref: 'main', recorded: false, remote: false });
    const dry = await dryRun();
    expect(sourceLines(dry.report)).toEqual([
      'The history read is the local branch main: this repository has no remote, so there is no recorded default branch to check against.',
    ]);
    expect(dry.report).not.toContain('set-head');
  });

  it('no main, a local master: master is read and named', async () => {
    addRemote();
    unsetOriginHead();
    git(base, ['branch', '-m', 'main', 'master']);
    expect(buildEvidenceIndex(base)).toMatchObject({ ref: 'master', recorded: false });
    expect(sourceLines((await dryRun()).report)).toEqual([
      `The history read is the local branch master, ${NOT_RECORDED}: a local branch can hold commits nobody merged. ${SET_HEAD}`,
    ]);
  });

  it('neither main nor master: HEAD is read — whatever is checked out — and the report says that', async () => {
    addRemote();
    unsetOriginHead();
    git(base, ['branch', '-m', 'main', 'trunk']);
    expect(buildEvidenceIndex(base)).toMatchObject({ ref: 'HEAD', recorded: false });
    expect(sourceLines((await dryRun()).report)).toEqual([
      `The history read is HEAD — whatever is checked out; there is no local main or master — ${NOT_RECORDED}: `
        + `it can hold commits nobody merged. ${SET_HEAD}`,
    ]);
  });
});
