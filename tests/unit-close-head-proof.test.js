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
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
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

// ── The recovery after a squash or rebase merge, end to end (REVIEW pass 2, C2-I2) ──
//
// `ship.md` §6.8 said: re-run the close step on the default branch after the
// merge. It refused — the Epic's items were still *closing* on the branch
// commit, which a squash never lands — and every remedy it named refused in
// turn. Now the documented call lists each such item and writes nothing; called
// again with the ones a person named, it asks again for the unit's close and
// for theirs, with the merged commit, in one write. An item nobody named stays
// open (REVIEW pass 3: swapping every one on its own closed unmerged work).

const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const itemRecord = (id, events) => serializeRecord({ id, type: 'BUG', title: `t ${id}`, events });

// What SHIP leaves on the Epic's branch: one item queued in the Epic and one
// started in it, both closing on the branch commit, the unit closing on it
// too, all committed and pushed as `feat`. Then the pull request is merged by
// squash: `main` gets ONE new commit with the branch's tree, and the branch
// commits are not in its history.
async function squashMerged() {
  const { repo, base } = await project();
  g(repo, 'checkout', '-q', '-b', 'feat');
  await put(base, 'src/the-epic.js', '// the Epic\'s work\n');
  await put(base, records.recordPath('SIG-1'), itemRecord('SIG-1', [created, triaged, { type: 'queued', at: AT, by, epic: EPIC }]));
  await put(base, records.recordPath('SIG-2'), itemRecord('SIG-2', [created, triaged, { type: 'started', at: AT, by, epic: EPIC }]));
  await regenerateViews(base);
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'the Epic');
  const branchCommit = g(repo, 'rev-parse', 'HEAD');
  // SHIP: the items' closes (§6.6) and the unit's (§6.8), with the branch HEAD.
  await records.requestCloses(base, [{ id: 'SIG-1', proof: branchCommit, by, at: AT }, { id: 'SIG-2', proof: branchCommit, by, at: AT }]);
  expect(await closeEpic(base, EPIC, { by, at: AT, pr: 42 })).toMatchObject({ status: 'close-requested', commit: branchCommit });
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'SHIP');
  g(repo, 'push', '-q', 'origin', 'feat');
  // The squash merge, as the server makes it.
  g(repo, 'checkout', '-q', 'main');
  g(repo, 'merge', '-q', '--squash', 'feat');
  g(repo, 'commit', '-q', '-m', 'the Epic (#42)');
  g(repo, 'push', '-q', 'origin', 'main');
  const squash = g(repo, 'rev-parse', 'HEAD');
  // The branch commit is not in main's history: git answers 1.
  expect(spawnSync('git', ['merge-base', '--is-ancestor', branchCommit, 'HEAD'], { cwd: repo }).status).toBe(1);
  return { repo, base, branchCommit, squash };
}

// The pairs a person said yes to, from the list `closeEpic` showed.
const yesTo = (shown, ids = shown.candidates.map((c) => c.id)) => shown.candidates.filter((c) => ids.includes(c.id)).map(({ id, proof }) => ({ id, proof }));

describe('the recovery after a squash merge works through closeEpic (C2-I2)', () => {
  it('before the recovery: the confirm step leaves the unit and both items closing — the branch commit never reached main', async () => {
    const { base } = await squashMerged();
    const out = await runConfirmCloses(base, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.units.confirmed).toEqual([]);
    expect(getUnit(base, EPIC).status).toBe('closing');
  }, 60_000);

  it('the documented call → commit → push → runConfirmCloses: the unit is closed, both items are closed, and both are still in the Epic', async () => {
    const { repo, base, branchCommit, squash } = await squashMerged();
    // First the list, nothing written; then the same call with the ones a person said yes to.
    const before = snapshotTree(base);
    const shown = await closeEpic(base, EPIC, { by, at: NOW, pr: 42, release: 'v9.9.9' });
    expect(shown).toEqual({
      status: 'rerequest-proposed',
      epic: EPIC,
      commit: squash,
      candidates: [
        { id: 'SIG-1', title: 't SIG-1', proof: branchCommit, why: 'not-in-history' },
        { id: 'SIG-2', title: 't SIG-2', proof: branchCommit, why: 'not-in-history' },
      ],
    });
    expect(snapshotTree(base)).toEqual(before);
    const out = await closeEpic(base, EPIC, { by, at: NOW, pr: 42, release: 'v9.9.9', rerequest: yesTo(shown) });
    expect(out).toMatchObject({ status: 're-requested', commit: squash, previous: branchCommit, rerequestedItems: ['SIG-1', 'SIG-2'] });
    expect(out.unit).toMatchObject({ status: 'closing', closing_proof: squash });
    // One write: the unit and both items now wait on the merged commit, each still in the Epic.
    for (const id of ['SIG-1', 'SIG-2']) {
      const item = records.getRecord(base, id);
      expect(item.status).toBe('closing');
      expect(item.epic).toBe(EPIC);
      expect(item.record.events.findLast((e) => e.type === 'close_requested').proof).toBe(squash);
    }
    // The item that was started is back as started, the queued one as queued; every event is kept.
    expect(records.getRecord(base, 'SIG-1').record.events.map((e) => e.type)).toEqual(['created', 'triaged', 'queued', 'close_requested', 'reopened', 'queued', 'close_requested']);
    expect(records.getRecord(base, 'SIG-2').record.events.map((e) => e.type)).toEqual(['created', 'triaged', 'started', 'close_requested', 'reopened', 'started', 'close_requested']);
    expect(records.getRecord(base, 'SIG-1').record.events[4].reason).toContain(branchCommit);
    expect(records.checkRecords(base)).toEqual([]);

    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'the close, asked again after the squash');
    g(repo, 'push', '-q', 'origin', 'main');

    const confirmed = await runConfirmCloses(base, { now: NOW });
    expect(confirmed.confirmed).toEqual(['SIG-1', 'SIG-2']);
    expect(confirmed.units.confirmed).toEqual([EPIC]);
    const unit = getUnit(base, EPIC);
    expect(unit.status).toBe('closed');
    expect(unit.close).toMatchObject({ reason: 'shipped', proof: squash, pr: '42', release: 'v9.9.9' });
    for (const id of ['SIG-1', 'SIG-2']) {
      expect(records.getRecord(base, id).status).toBe('C');
      expect(records.getRecord(base, id).epic).toBe(EPIC);
    }
  }, 60_000);

  it('run twice: the second call changes nothing', async () => {
    const { base } = await squashMerged();
    await closeEpic(base, EPIC, { by, at: NOW, rerequest: yesTo(await closeEpic(base, EPIC, { by, at: NOW })) });
    const before = snapshotTree(base);
    expect(await closeEpic(base, EPIC, { by, at: NOW })).toMatchObject({ status: 'already-requested' });
    expect(snapshotTree(base)).toEqual(before);
  }, 60_000);

  it('a dirty tree on the default branch still refuses, and nothing is asked again', async () => {
    const { base, branchCommit } = await squashMerged();
    await put(base, 'notes.txt', 'uncommitted\n');
    await refused(base, () => closeEpic(base, EPIC, { by, at: NOW }));
    expect(getUnit(base, EPIC).closing_proof).toBe(branchCommit);
  }, 60_000);

  it('an item of the Epic that is plainly open still refuses the recovery, and names it', async () => {
    const { repo, base } = await squashMerged();
    await put(base, records.recordPath('SIG-3'), itemRecord('SIG-3', [created, triaged, { type: 'queued', at: AT, by, epic: EPIC }]));
    await regenerateViews(base);
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'one more item');
    g(repo, 'push', '-q', 'origin', 'main');
    const before = snapshotTree(base);
    const err = await closeEpic(base, EPIC, { by, at: NOW }).catch((e) => e);
    expect(err.code).toBe('OPEN_ITEMS');
    expect(err.message).toMatch(/SIG-3 \(status Q\)/);
    expect(err.message).not.toMatch(/SIG-1|SIG-2/);
    expect(err.message).toMatch(/Nothing was written/);
    expect(err.message).not.toMatch(/Nothing was moved/);
    expect(snapshotTree(base)).toEqual(before);
  }, 60_000);

  for (const explicit of [false, true]) {
    it(`on the Epic's branch (a normal SHIP${explicit ? ', `commit` passed as the branch HEAD' : ''}) an item closing on a commit from elsewhere is still open: nothing is listed or asked again there`, async () => {
      const { repo, base } = await project();
      const elsewhere = unmergedCommit(repo);
      g(repo, 'checkout', '-q', '-b', 'feat', 'main');
      await closingItem(repo, base, 'SIG-1', elsewhere);
      const head = g(repo, 'rev-parse', 'HEAD');
      const before = snapshotTree(base);
      const err = await closeEpic(base, EPIC, { by, at: NOW, ...(explicit ? { commit: head } : {}) }).catch((e) => e);
      expect(err.code).toBe('OPEN_ITEMS');
      expect(err.message).toMatch(/SIG-1 \(status closing\)/);
      expect(err.message).toMatch(/on the default branch after the merge, with a clean tree, lists each such item/);
      expect(err.message).toMatch(/so a person can say which were in the merge/);
      expect(err.message).not.toMatch(/asked again/);
      expect(err.message).toMatch(/Nothing was written/);
      expect(snapshotTree(base)).toEqual(before);
    }, 60_000);
  }
});

// ── Nothing is swapped without a yes (REVIEW pass 3) ────────────────────────

// A commit on a branch nobody merged; the checkout is left where it was.
function unmergedCommit(repo) {
  const was = g(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
  g(repo, 'checkout', '-q', '-b', 'other');
  g(repo, 'commit', '-q', '--allow-empty', '-m', 'a fix on a branch nobody merged');
  const sha = g(repo, 'rev-parse', 'HEAD');
  g(repo, 'checkout', '-q', was);
  return sha;
}

// One more item of the Epic, closing on `proof`, committed on the current branch.
async function closingItem(repo, base, id, proof) {
  await put(base, records.recordPath(id), itemRecord(id, [created, triaged, { type: 'queued', at: AT, by, epic: EPIC }, { type: 'close_requested', at: AT, by, reason: 'fixed', proof }]));
  await regenerateViews(base);
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', `${id}, closing`);
}

// The squash merge, then SIG-3: closing on a commit of a branch nobody merged.
async function squashMergedWithStranger() {
  const s = await squashMerged();
  const elsewhere = unmergedCommit(s.repo);
  await closingItem(s.repo, s.base, 'SIG-3', elsewhere);
  g(s.repo, 'push', '-q', 'origin', 'main');
  return { ...s, elsewhere, head: g(s.repo, 'rev-parse', 'HEAD') };
}

async function nothingWritten(base, run, code) {
  const before = snapshotTree(base);
  const err = await run().catch((e) => e);
  expect(err, 'the call was not refused').toBeInstanceOf(Error);
  expect(err).toMatchObject({ name: 'WorkStoreError', code });
  expect(err.message).toMatch(/Nothing was written/);
  expect(snapshotTree(base)).toEqual(before);
  return err;
}

describe('closeEpic never swaps an item\'s proof on its own', () => {
  it('on the default branch, an item closing on a commit of an unmerged branch is listed, and nothing is written', async () => {
    const { base, branchCommit, elsewhere, head } = await squashMergedWithStranger();
    const before = snapshotTree(base);
    const out = await closeEpic(base, EPIC, { by, at: NOW });
    expect(out).toEqual({
      status: 'rerequest-proposed',
      epic: EPIC,
      commit: head,
      candidates: [
        { id: 'SIG-1', title: 't SIG-1', proof: branchCommit, why: 'not-in-history' },
        { id: 'SIG-2', title: 't SIG-2', proof: branchCommit, why: 'not-in-history' },
        { id: 'SIG-3', title: 't SIG-3', proof: elsewhere, why: 'not-in-history' },
      ],
    });
    expect(snapshotTree(base)).toEqual(before);
    const confirmed = await runConfirmCloses(base, { now: NOW });
    expect(confirmed.confirmed).toEqual([]);
    expect(confirmed.units.confirmed).toEqual([]);
    expect(records.getRecord(base, 'SIG-3').status).toBe('closing');
    expect(getUnit(base, EPIC)).toMatchObject({ status: 'closing', closing_proof: branchCommit });
    expect(snapshotTree(base)).toEqual(before);
  }, 60_000);

  it('the same for an Epic with no unit record yet: the list is returned and no record is created', async () => {
    const { repo, base } = await project({ unit: null });
    const elsewhere = unmergedCommit(repo);
    await closingItem(repo, base, 'SIG-1', elsewhere);
    g(repo, 'push', '-q', 'origin', 'main');
    const before = snapshotTree(base);
    const out = await closeEpic(base, EPIC, { by, at: NOW });
    expect(out).toMatchObject({ status: 'rerequest-proposed', candidates: [{ id: 'SIG-1', proof: elsewhere, why: 'not-in-history' }] });
    expect(snapshotTree(base)).toEqual(before);
    expect(() => getUnit(base, EPIC)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  }, 60_000);

  it('yes to the squash-merged items only: the one nobody named is open, and nothing is written', async () => {
    const { base, branchCommit } = await squashMergedWithStranger();
    const shown = await closeEpic(base, EPIC, { by, at: NOW });
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, rerequest: yesTo(shown, ['SIG-1', 'SIG-2']) }), 'OPEN_ITEMS');
    expect(err.message).toMatch(/SIG-3 \(status closing\)/);
    expect(err.message).not.toMatch(/SIG-1|SIG-2/);
    expect(getUnit(base, EPIC).closing_proof).toBe(branchCommit);
  }, 60_000);

  it('yes to none (an empty list): every listed item is open', async () => {
    const { base } = await squashMerged();
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, rerequest: [] }), 'OPEN_ITEMS');
    expect(err.message).toMatch(/SIG-1 \(status closing\)/);
    expect(err.message).toMatch(/SIG-2 \(status closing\)/);
  }, 60_000);

  it('a named pair whose commit is not the one the item is closing on now: CONFLICT, nothing written', async () => {
    const { base, branchCommit } = await squashMerged();
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, {
      by, at: NOW, rerequest: [{ id: 'SIG-1', proof: branchCommit }, { id: 'SIG-2', proof: 'a'.repeat(40) }],
    }), 'CONFLICT');
    expect(err.message).toMatch(/SIG-2/);
    expect(err.message).toContain(branchCommit);
  }, 60_000);

  it('a named item that is not on the list — unknown, or of the Epic and not closing — is refused, nothing written', async () => {
    const { repo, base, branchCommit } = await squashMerged();
    const both = [{ id: 'SIG-1', proof: branchCommit }, { id: 'SIG-2', proof: branchCommit }];
    const unknown = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, rerequest: [...both, { id: 'SIG-9', proof: branchCommit }] }), 'CONFLICT');
    expect(unknown.message).toMatch(/SIG-9/);
    await put(base, records.recordPath('SIG-4'), itemRecord('SIG-4', [created, triaged, { type: 'queued', at: AT, by, epic: EPIC }]));
    await regenerateViews(base);
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'an open item');
    g(repo, 'push', '-q', 'origin', 'main');
    const open = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, rerequest: [...both, { id: 'SIG-4', proof: branchCommit }] }), 'CONFLICT');
    expect(open.message).toMatch(/SIG-4/);
  }, 60_000);

  it('a list that is not pairs of an item and a commit is refused before anything is read', async () => {
    const { base, branchCommit } = await squashMerged();
    for (const rerequest of ['SIG-1', ['SIG-1'], [{ id: 'SIG-1' }], [{ proof: branchCommit }]]) {
      await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, rerequest }), 'SCHEMA');
    }
  }, 60_000);

  // `rerequestEpicClose`'s own check: the new proof of an item's close is a full hash.
  it('with the list, `commit` as a 12-character hash of the merged commit is refused: an item\'s close is asked again only with a full hash', async () => {
    const { base, branchCommit, squash } = await squashMerged();
    const both = [{ id: 'SIG-1', proof: branchCommit }, { id: 'SIG-2', proof: branchCommit }];
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, commit: squash.slice(0, 12), rerequest: both }), 'SCHEMA');
    expect(err.message).toMatch(/only with a full commit hash/);
  }, 60_000);

  it('a list passed on a checkout that is not the default branch is refused', async () => {
    const { repo, base } = await project();
    g(repo, 'checkout', '-q', '-b', 'feat');
    g(repo, 'commit', '-q', '--allow-empty', '-m', 'the Epic');
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, rerequest: [{ id: 'SIG-1', proof: 'a'.repeat(40) }] }), 'CONFLICT');
    expect(err.message).toMatch(/only on the default branch after the merge/);
  }, 60_000);

  // The second way in: `commit` names an old commit of the default branch, and
  // the checkout is a feature branch.
  it('from a feature branch, `commit` an older commit of the default branch: an item closing on another unmerged branch is open', async () => {
    const { repo, base, head: onMain } = await project();
    const elsewhere = unmergedCommit(repo);
    g(repo, 'checkout', '-q', '-b', 'feat', 'main');
    await closingItem(repo, base, 'SIG-1', elsewhere);
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, commit: onMain }), 'OPEN_ITEMS');
    expect(err.message).toMatch(/SIG-1 \(status closing\)/);
    expect(records.getRecord(base, 'SIG-1').record.events.findLast((e) => e.type === 'close_requested').proof).toBe(elsewhere);
    expect(getUnit(base, EPIC).status).toBe('open');
  }, 60_000);

  // A fresh clone of the remote after the merge, the Epic's branch deleted
  // there: the branch commit is in no ref, so the clone does not have it.
  async function clonedAfterMerge(...depth) {
    const { repo, branchCommit, squash } = await squashMerged();
    g(repo, 'push', '-q', 'origin', '--delete', 'feat');
    const base = join(root, 'fresh');
    g(root, 'clone', '-q', ...depth, `file://${join(root, 'remote.git')}`, base);
    expect(spawnSync('git', ['cat-file', '-e', `${branchCommit}^{commit}`], { cwd: base }).status).not.toBe(0);
    expect(g(base, 'status', '--porcelain')).toBe('');
    return { base, branchCommit, squash };
  }

  it('the branch commit is not in this clone at all (the branch was deleted at the merge): both items are listed, why unknown-commit', async () => {
    const { base, branchCommit, squash } = await clonedAfterMerge();
    const before = snapshotTree(base);
    expect(await closeEpic(base, EPIC, { by, at: NOW })).toEqual({
      status: 'rerequest-proposed',
      epic: EPIC,
      commit: squash,
      candidates: [
        { id: 'SIG-1', title: 't SIG-1', proof: branchCommit, why: 'unknown-commit' },
        { id: 'SIG-2', title: 't SIG-2', proof: branchCommit, why: 'unknown-commit' },
      ],
    });
    expect(snapshotTree(base)).toEqual(before);
  }, 60_000);

  it('the same in a shallow clone: git cannot tell, so the items are open and none is listed', async () => {
    const { base } = await clonedAfterMerge('--depth', '1');
    expect(g(base, 'rev-parse', '--is-shallow-repository')).toBe('true');
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW }), 'OPEN_ITEMS');
    expect(err.message).toMatch(/SIG-1 \(status closing\)/);
    expect(err.message).toMatch(/SIG-2 \(status closing\)/);
  }, 60_000);

  it('no remote: an item closing on a commit of another branch is open, and none is listed', async () => {
    const { repo, base } = await project({ remote: false });
    const elsewhere = unmergedCommit(repo);
    await closingItem(repo, base, 'SIG-1', elsewhere);
    const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW }), 'OPEN_ITEMS');
    expect(err.message).toMatch(/SIG-1 \(status closing\)/);
  }, 60_000);
});

describe('the recovery still needs the retrospective (AC4.3)', () => {
  for (const [what, content] of [['missing', null], ['a placeholder', '# Retrospective\n\n## Timeline\n\n[FILL IN]\n']]) {
    it(`${what}: refused naming the file, before any list and before any write`, async () => {
      const { repo, base, branchCommit } = await squashMerged();
      const rel = `.planning/${EPIC}-RETROSPECTIVE.md`;
      if (content === null) await rm(join(base, rel));
      else await put(base, rel, content);
      g(repo, 'add', '-A');
      g(repo, 'commit', '-q', '-m', 'the retrospective, not written');
      g(repo, 'push', '-q', 'origin', 'main');
      const both = [{ id: 'SIG-1', proof: branchCommit }, { id: 'SIG-2', proof: branchCommit }];
      for (const rerequest of [undefined, both]) {
        const err = await nothingWritten(base, () => closeEpic(base, EPIC, { by, at: NOW, rerequest }), 'CONFLICT');
        expect(err.message).toContain(rel);
        expect(err.retro).toMatchObject({ path: rel });
      }
      expect(getUnit(base, EPIC)).toMatchObject({ status: 'closing', closing_proof: branchCommit });
    }, 60_000);
  }
});

describe('rerequestCloses — the item side, on its own', () => {
  async function orphaned() {
    const s = await squashMerged();
    return s;
  }

  it('a short hash, a hash that names no commit, and a ref name are refused as the new proof; nothing is written', async () => {
    const { base, squash } = await orphaned();
    const before = snapshotTree(base);
    for (const proof of [squash.slice(0, 12), 'f'.repeat(40), 'main', undefined]) {
      const err = await records.rerequestCloses(base, [{ id: 'SIG-1', proof, by, at: NOW }]).catch((e) => e);
      expect(err.code, String(proof)).toBe('SCHEMA');
      expect(err.message).toMatch(/Nothing was written/);
    }
    expect(snapshotTree(base)).toEqual(before);
  }, 60_000);

  it('a proof that HEAD can reach is never replaced', async () => {
    const { repo, base } = await project();
    await put(base, records.recordPath('SIG-1'), itemRecord('SIG-1', [created, triaged, { type: 'queued', at: AT, by, epic: EPIC }]));
    await regenerateViews(base);
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'an item');
    const reachable = g(repo, 'rev-parse', 'HEAD');
    await records.requestClose(base, 'SIG-1', { proof: reachable, by, at: AT });
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'requested');
    const newer = g(repo, 'rev-parse', 'HEAD');
    const before = snapshotTree(base);
    const err = await records.rerequestCloses(base, [{ id: 'SIG-1', proof: newer, by, at: NOW }]).catch((e) => e);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toMatch(/is in this branch's history/);
    expect(snapshotTree(base)).toEqual(before);
  }, 60_000);

  it('an item that is not closing, and the same item twice, are refused', async () => {
    const { repo, base, squash } = await orphaned();
    await put(base, records.recordPath('SIG-3'), itemRecord('SIG-3', [created, triaged]));
    await regenerateViews(base);
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'one more');
    await expect(records.rerequestCloses(base, [{ id: 'SIG-3', proof: squash, by, at: NOW }])).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(records.rerequestCloses(base, [{ id: 'SIG-1', proof: squash, by }, { id: 'SIG-1', proof: squash, by }])).rejects.toMatchObject({ code: 'SCHEMA' });
  }, 60_000);

  it('asked again: the item is closing on the new commit, in the unit it was in, and all or nothing across the list', async () => {
    const { base, squash, branchCommit } = await orphaned();
    const before = snapshotTree(base);
    // SIG-9 does not exist: the whole list is refused and SIG-1 is untouched.
    await expect(records.rerequestCloses(base, [{ id: 'SIG-1', proof: squash, by, at: NOW }, { id: 'SIG-9', proof: squash, by, at: NOW }])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(snapshotTree(base)).toEqual(before);
    const [one] = await records.rerequestCloses(base, [{ id: 'SIG-1', proof: squash, by, at: NOW }]);
    expect(one).toMatchObject({ id: 'SIG-1', status: 'closing', epic: EPIC, previous_proof: branchCommit });
  }, 60_000);

  // AC6.4 kind (a): a new call, and it needs no unit records.
  it('works on a project with no unit records: the folder is not needed, and is not created', async () => {
    const { repo, base } = await project({ unit: null });
    await rm(join(base, UNITS), { recursive: true });
    await put(base, records.recordPath('SIG-1'), itemRecord('SIG-1', [created, triaged, { type: 'queued', at: AT, by, epic: EPIC }]));
    await regenerateViews(base);
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'an item, no unit records');
    const landed = g(repo, 'rev-parse', 'HEAD');
    g(repo, 'checkout', '-q', '-b', 'gone');
    g(repo, 'commit', '-q', '--allow-empty', '-m', 'a commit that never lands');
    const orphan = g(repo, 'rev-parse', 'HEAD');
    g(repo, 'checkout', '-q', 'main');
    await records.requestClose(base, 'SIG-1', { proof: orphan, by, at: AT });
    const [one] = await records.rerequestCloses(base, [{ id: 'SIG-1', proof: landed, by, at: NOW }]);
    expect(one).toMatchObject({ status: 'closing', epic: EPIC, previous_proof: orphan });
    expect(records.checkRecords(base)).toEqual([]);
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(base, UNITS))).toBe(false);
  }, 60_000);

  it('closeEpic with a `rerequest` list on a project with no unit records: refused, nothing written', async () => {
    const { base } = await project({ unit: null });
    await rm(join(base, UNITS), { recursive: true });
    const before = snapshotTree(base);
    const err = await closeEpic(base, EPIC, { by, at: AT, rerequest: [] }).catch((e) => e);
    expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFIG' });
    expect(err.message).toMatch(/no unit records/);
    expect(snapshotTree(base)).toEqual(before);
  }, 60_000);

  it('store off: refused as every item writer is', async () => {
    await mkdir(join(root, 'plain'), { recursive: true });
    await expect(records.rerequestCloses(join(root, 'plain'), [{ id: 'SIG-1', proof: 'a'.repeat(40), by }])).rejects.toMatchObject({ code: 'CONFIG' });
  });
});
