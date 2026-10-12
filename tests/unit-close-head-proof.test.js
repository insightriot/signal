// M6.E16 r1.2 (REVIEW pass 1: C-I2) — the proof must be able to say something
// about the Epic (AC4.1, AC4.2, `D-M6E16-21`). See .planning/M6.E16-VALIDATION.md
// row "AC4.2 — the proof".
//
// `closeEpic` records HEAD as the close's proof when no `commit` is passed.
// On a checkout whose HEAD is already on the default branch, with the Epic's
// work still uncommitted, HEAD is a commit from before that work: the very
// next confirm step finds it on the default branch and calls the Epic closed.
// So that one case is refused. A clean tree on the default branch stays
// allowed — it is the recovery after a squash or rebase merge — and so does an
// explicit `commit`, a branch ahead of the default branch, and a repository
// git cannot answer for. Real git, in temp repositories. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { getUnit } from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11T10:00:00.000Z';
const NOW = '2026-10-12T10:00:00.000Z';
const by = 'claude';
const EPIC = 'M7.E3';
const UNITS = '.planning/work/units';
const RETRO = '# Retrospective\n\n## Timeline\n\nIt shipped.\n';
const opened = { type: 'opened', at: AT, by };

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-head-proof-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A project with unit records and the Epic open, its retrospective written,
// everything committed. `remote`: pushed to a bare `origin` whose default
// branch is main, so HEAD is on `refs/remotes/origin/main`. `sub`: the project
// sits in a folder of the repository, not at its root.
async function project({ remote = true, sub = '', unit = [opened] } = {}) {
  const repo = join(root, 'work');
  const base = join(repo, sub);
  await mkdir(base, { recursive: true });
  g(repo, 'init', '-q', '-b', 'main');
  await put(base, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(base, `${UNITS}/.keep`, '');
  if (unit !== null) await put(base, `${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: unit }));
  await put(base, `.planning/${EPIC}-RETROSPECTIVE.md`, RETRO);
  await regenerateViews(base);
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'before the Epic\'s work');
  if (remote) {
    const bare = join(root, 'remote.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', bare);
    g(repo, 'remote', 'add', 'origin', bare);
    g(repo, 'push', '-q', '-u', 'origin', 'main');
    g(repo, 'remote', 'set-head', 'origin', 'main');
  }
  return { repo, base, head: g(repo, 'rev-parse', 'HEAD') };
}

async function refused(base, run) {
  const before = snapshotTree(base);
  const err = await run().catch((e) => e);
  expect(err, 'the call was not refused').toBeInstanceOf(Error);
  expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFLICT' });
  expect(err.message).toMatch(/already on the default branch/);
  expect(err.message).toMatch(/uncommitted or untracked/);
  expect(err.message).toMatch(/Nothing was written/);
  expect(err.message).toMatch(/[Cc]ommit the Epic's work first.*or pass `commit`/s);
  expect(snapshotTree(base)).toEqual(before);
  return err;
}

describe('closeEpic — HEAD already on the default branch, the Epic\'s work uncommitted (C-I2)', () => {
  it('an untracked file under the project: refused, nothing written — and so no confirm can close the Epic', async () => {
    const { base, head } = await project();
    await put(base, 'src/the-epic.js', '// the Epic\'s work, not committed\n');
    const err = await refused(base, () => closeEpic(base, EPIC, { by, at: AT }));
    expect(err.message).toContain(head.slice(0, 12));
    expect(getUnit(base, EPIC).status).toBe('open');
    expect((await records.confirmCloses(base, { now: NOW })).units).toEqual({ confirmed: [], stillClosing: [], stale: [] });
  });

  it('a tracked file changed and not committed: refused', async () => {
    const { base } = await project();
    await put(base, `.planning/${EPIC}-RETROSPECTIVE.md`, `${RETRO}\nOne more line.\n`);
    await refused(base, () => closeEpic(base, EPIC, { by, at: AT }));
  });

  it('a close already requested, asked again from a dirty tree on the default branch: refused, the earlier request stands', async () => {
    const { base } = await project({ unit: [opened, { type: 'close_requested', at: AT, by, proof: '0123abc' }] });
    await put(base, 'notes.txt', 'uncommitted\n');
    await refused(base, () => closeEpic(base, EPIC, { by, at: AT }));
    expect(getUnit(base, EPIC).closing_proof).toBe('0123abc');
  });
});

describe('closeEpic — the same refusal for an Epic with no record yet', () => {
  it('no record is created for a close that is refused', async () => {
    const { base } = await project({ unit: null });
    await put(base, 'notes.txt', 'uncommitted\n');
    await refused(base, () => closeEpic(base, EPIC, { by, at: AT }));
    expect(() => getUnit(base, EPIC)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('closeEpic — what stays allowed', () => {
  it('a clean tree on the default branch (the recovery after a squash or rebase merge): the close is requested with HEAD', async () => {
    const { base, head } = await project();
    const out = await closeEpic(base, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 'close-requested', commit: head });
  });

  it('a clean tree on the default branch, the unit closing on a commit that never landed: re-requested with HEAD', async () => {
    const { base, head } = await project({ unit: [opened, { type: 'close_requested', at: AT, by, proof: '0123abc' }] });
    const out = await closeEpic(base, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 're-requested', commit: head, previous: '0123abc' });
  });

  it('an explicit commit is trusted, dirty tree or not', async () => {
    const { base, head } = await project();
    await put(base, 'notes.txt', 'uncommitted\n');
    const out = await closeEpic(base, EPIC, { by, at: AT, commit: head });
    expect(out).toMatchObject({ status: 'close-requested', commit: head });
  });

  it('a branch ahead of the default branch, with the SHIP commit\'s files still uncommitted (the normal SHIP): requested with the branch HEAD', async () => {
    const { repo, base } = await project();
    g(repo, 'checkout', '-q', '-b', 'feat');
    await put(base, 'src/the-epic.js', '// the Epic\'s work\n');
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'the Epic');
    const head = g(repo, 'rev-parse', 'HEAD');
    await put(base, '.planning/STATE.md', 'staged for the SHIP commit\n');
    const out = await closeEpic(base, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 'close-requested', commit: head });
  });

  it('git cannot answer — no remote: not refused on this ground, dirty tree or not', async () => {
    const { base, head } = await project({ remote: false });
    await put(base, 'notes.txt', 'uncommitted\n');
    expect(await closeEpic(base, EPIC, { by, at: AT })).toMatchObject({ status: 'close-requested', commit: head });
  });

  it('a remote with no default-branch ref here: not refused on this ground', async () => {
    const { repo, base, head } = await project();
    g(repo, 'update-ref', '-d', 'refs/remotes/origin/main');
    g(repo, 'symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
    await put(base, 'notes.txt', 'uncommitted\n');
    expect(await closeEpic(base, EPIC, { by, at: AT })).toMatchObject({ status: 'close-requested', commit: head });
  });

  it('changes outside the project folder do not count: a project in a folder of the repository', async () => {
    const { repo, base, head } = await project({ sub: 'packages/leaf' });
    await put(repo, 'elsewhere.txt', 'another package\'s uncommitted work\n');
    expect(await closeEpic(base, EPIC, { by, at: AT })).toMatchObject({ status: 'close-requested', commit: head });
  });

  it('a unit that is already closed still answers already-closed from a dirty tree', async () => {
    const { base } = await project({ unit: [opened, { type: 'close_requested', at: AT, by, proof: '0123abc' }, { type: 'closed', at: AT, by, reason: 'shipped', proof: '0123abc' }] });
    await put(base, 'notes.txt', 'uncommitted\n');
    expect(await closeEpic(base, EPIC, { by, at: AT })).toMatchObject({ status: 'already-closed' });
  });
});
