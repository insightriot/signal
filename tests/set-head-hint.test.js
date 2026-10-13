// M6.E16 r6.1 — `git remote set-head origin -a` is never offered as a thing
// that just works.
//
// After `git init` and `git remote add origin …`, with nothing pushed or
// fetched, that command exits 1 ("Cannot determine remote HEAD"): the remote
// has no branch for it to record. Four messages told the user to run it. They
// now share one sentence (`RECORD_DEFAULT_BRANCH_HINT`, `branch-guard.js`)
// that is true in both states: once `origin` has a branch in this clone —
// push or fetch one — the command records its default branch.
//
// Real git, in temp folders; the remote is an empty bare repository beside the
// clone, so nothing leaves the machine. Unit names are invented.

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
const HINT = 'once `origin` has a branch in this clone (push or fetch one), `git remote set-head origin -a` records its default branch';

function g(cwd, ...args) {
  return spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
}

let root;
let work;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-set-head-'));
  work = join(root, 'work');
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
async function project(events) {
  g(root, 'init', '-q', '--bare', '-b', 'main', join(root, 'remote.git'));
  g(work, 'init', '-q', '-b', 'main');
  g(work, 'remote', 'add', 'origin', join(root, 'remote.git'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`${UNITS}/.keep`, '');
  await put(`${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events }));
  await put(`.planning/${EPIC}-RETROSPECTIVE.md`, '# Retrospective\n\n## Timeline\n\nIt shipped.\n');
  await regenerateViews(work);
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'the Epic');
  return g(work, 'rev-parse', 'HEAD').stdout.trim();
}

describe('the hint that records the remote\'s default branch', { timeout: 60_000 }, () => {
  it('is one sentence, true whether or not the remote has a branch yet', () => {
    expect(RECORD_DEFAULT_BRANCH_HINT).toBe(HINT);
  });

  it('the state it is written for is real: with nothing pushed or fetched, the command fails', async () => {
    await project([{ type: 'opened', at: OLD, by }]);
    expect(g(work, 'remote', 'set-head', 'origin', '-a').status).not.toBe(0);
  });

  it('closeEpic, the work uncommitted: the refusal says a branch has to be there first', async () => {
    await project([{ type: 'opened', at: OLD, by }]);
    await put('src/the-epic.js', '// not committed\n');
    const err = await closeEpic(work, EPIC, { by, at: NOW }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toContain(`Nothing was written. O${HINT.slice(1)} — run it, then re-run; or commit the Epic's work, then close.`);
  });

  it('a unit left closing: the confirm line, the report line, the sweep\'s two advisories all say it', async () => {
    const head = await project([{ type: 'opened', at: OLD, by }, { type: 'close_requested', at: OLD, by, proof: 'c'.repeat(40) }]);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.units.stillClosing).toEqual([{ id: EPIC, reason: 'no-default-branch' }]);
    const unchecked = (await confirmClosesInSweep(work, { now: NOW })).filter((f) => /^closes not checked/.test(f.message));
    const tooLong = checkClosingTooLong(work, { now: NOW });
    expect(unchecked).toHaveLength(1);
    expect(tooLong).toHaveLength(1);
    const PART = `no-default-branch: the remote's default branch is not recorded in this clone — ${HINT}; run it and re-run`;
    expect(out.line.endsWith(PART)).toBe(true);
    expect(reportCloses(work, { now: NOW }).line.endsWith(PART)).toBe(true);
    expect(unchecked[0].message).toBe(`closes not checked — ${PART}`);
    expect(tooLong[0].message.endsWith(`the remote's default branch is not recorded in this clone. O${HINT.slice(1)}. Run it, then sweep again.`)).toBe(true);
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
