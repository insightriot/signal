// M6.E16 r6.1, corrected in r6.3 — the way to record the remote's default
// branch is said as the two commands that work, in every message that says it.
//
// `git remote set-head origin -a` on its own fails in the states a user is
// most likely to be in:
//   - after `git init` + `git remote add origin …`, nothing fetched:
//     "error: Not a valid ref: refs/remotes/origin/main";
//   - after that and a push of a FEATURE branch only — the normal flow — the
//     same, although `origin` then has a branch in the clone. (r6.1's wording,
//     "once `origin` has a branch in this clone", was wrong there.)
// `git fetch origin` first makes it work in both. When the remote holds no
// branch at all there is nothing to record, and the user is told so by git
// ("Cannot determine remote HEAD") — pinned below as what they see.
//
// The messages share one sentence (`RECORD_DEFAULT_BRANCH_HINT`,
// `branch-guard.js`). Real git, in temp folders; the remote is a bare
// repository beside the clone, so nothing leaves the machine.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { RECORD_DEFAULT_BRANCH_HINT } from '../plugin/tools/lib/branch-guard.js';
import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import { reportCloses, runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
import { checkClosingTooLong, confirmClosesInSweep } from '../plugin/tools/lib/sweep.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';

const OLD = '2026-09-01T10:00:00.000Z';
const NOW = '2026-10-10T12:00:00.000Z';
const by = 'claude';
const EPIC = 'M7.E3';
const UNITS = '.planning/work/units';
const HINT = 'run `git fetch origin`, then `git remote set-head origin -a`, to record the remote\'s default branch';

function g(cwd, ...args) {
  return spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
}

let root;
let work;
let remote;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-set-head-'));
  work = join(root, 'work');
  remote = join(root, 'remote.git');
  await mkdir(work, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function put(rel, content) {
  const p = join(work, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
// `git init`, a remote called origin added and never pushed to or fetched
// from, and a v2 store with the Epic's unit (`events`) committed.
// `remoteHolds`: `main` put on the remote from another clone first.
async function project(events, { remoteHolds = false } = {}) {
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  if (remoteHolds) {
    const other = join(root, 'other');
    await mkdir(other);
    g(other, 'init', '-q', '-b', 'main');
    g(other, 'commit', '-q', '--allow-empty', '-m', 'someone else\'s');
    g(other, 'push', '-q', remote, 'main');
  }
  g(work, 'init', '-q', '-b', 'main');
  g(work, 'remote', 'add', 'origin', remote);
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`${UNITS}/.keep`, '');
  await put(`${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events }));
  await put(`.planning/${EPIC}-RETROSPECTIVE.md`, '# Retrospective\n\n## Timeline\n\nIt shipped.\n');
  await regenerateViews(work);
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'the Epic');
  return g(work, 'rev-parse', 'HEAD').stdout.trim();
}
const opened = [{ type: 'opened', at: OLD, by }];
const setHead = () => g(work, 'remote', 'set-head', 'origin', '-a');
const recorded = () => g(work, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD').stdout.trim();

describe('the two commands the hint names, in the states a clone can be in', { timeout: 60_000 }, () => {
  it('is one sentence: fetch, then set-head', () => {
    expect(RECORD_DEFAULT_BRANCH_HINT).toBe(HINT);
  });

  it('nothing fetched yet, the remote holding main: set-head alone fails, and after the fetch it records main', async () => {
    await project(opened, { remoteHolds: true });
    const alone = setHead();
    expect(alone.status).not.toBe(0);
    expect(alone.stderr).toMatch(/Not a valid ref: refs\/remotes\/origin\/main/);
    expect(g(work, 'fetch', '-q', 'origin').status).toBe(0);
    expect(setHead().status).toBe(0);
    expect(recorded()).toBe('refs/remotes/origin/main');
  });

  it('only a feature branch pushed — origin HAS a branch in the clone: set-head alone still fails, and after the fetch it records main', async () => {
    await project(opened, { remoteHolds: true });
    g(work, 'checkout', '-q', '-b', 'feat/x');
    expect(g(work, 'push', '-q', '-u', 'origin', 'feat/x').status).toBe(0);
    expect(g(work, 'show-ref', '--verify', '--quiet', 'refs/remotes/origin/feat/x').status).toBe(0);
    expect(setHead().status).not.toBe(0);
    expect(g(work, 'fetch', '-q', 'origin').status).toBe(0);
    expect(setHead().status).toBe(0);
    expect(recorded()).toBe('refs/remotes/origin/main');
  });

  it('the remote holds no branch at all: the fetch brings nothing, and git says it cannot determine the remote\'s HEAD', async () => {
    await project(opened);
    expect(g(work, 'fetch', '-q', 'origin').status).toBe(0);
    const out = setHead();
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/Cannot determine remote HEAD/);
  });
});

describe('every message that says it', { timeout: 60_000 }, () => {
  it('closeEpic, the work uncommitted: the refusal names the two commands', async () => {
    await project(opened, { remoteHolds: true });
    await put('src/the-epic.js', '// not committed\n');
    const err = await closeEpic(work, EPIC, { by, at: NOW }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toContain(`Nothing was written. R${HINT.slice(1)}, then re-run; or commit the Epic's work, then close.`);
  });

  it('a unit left closing: the confirm line, the report line, the sweep\'s two advisories', async () => {
    await project([...opened, { type: 'close_requested', at: OLD, by, proof: 'c'.repeat(40) }], { remoteHolds: true });
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.units.stillClosing).toEqual([{ id: EPIC, reason: 'no-default-branch' }]);
    const unchecked = (await confirmClosesInSweep(work, { now: NOW })).filter((f) => /^closes not checked/.test(f.message));
    const tooLong = checkClosingTooLong(work, { now: NOW });
    expect(unchecked).toHaveLength(1);
    expect(tooLong).toHaveLength(1);
    const PART = `no-default-branch: the remote's default branch is not recorded in this clone — ${HINT}, and re-run`;
    expect(out.line.endsWith(PART)).toBe(true);
    expect(reportCloses(work, { now: NOW }).line.endsWith(PART)).toBe(true);
    expect(unchecked[0].message).toBe(`closes not checked — ${PART}`);
    expect(tooLong[0].message.endsWith(`the remote's default branch is not recorded in this clone. R${HINT.slice(1)}, then sweep again.`)).toBe(true);
  });

  it('and following it works: after the two commands the close is checked against the default branch', async () => {
    const head = await project([...opened, { type: 'close_requested', at: OLD, by, proof: 'c'.repeat(40) }], { remoteHolds: true });
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    g(work, 'fetch', '-q', 'origin');
    expect(setHead().status).toBe(0);
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.units.stillClosing).toEqual([{ id: EPIC, reason: 'unknown-commit' }]);
    expect(out.line).not.toContain('no-default-branch');
  });
});

describe('one source for the command', () => {
  it('`set-head origin -a` is written in branch-guard.js and nowhere else in the code', () => {
    const lib = join(process.cwd(), 'plugin/tools/lib');
    const withIt = readdirSync(lib).filter((f) => f.endsWith('.js'))
      .filter((f) => readFileSync(join(lib, f), 'utf-8').split('\n').some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && l.includes('set-head origin -a')));
    expect(withIt).toEqual(['branch-guard.js']);
  });
});
