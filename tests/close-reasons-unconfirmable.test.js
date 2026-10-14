// M6.E16 r6 — a close that can never be confirmed says why, and is not told
// to do something that cannot work.
//
// Signal confirms a close against the default branch of the remote named
// `origin`. Three projects can never get there, and each read wrongly:
//
//   - remotes, none named `origin` (say only `upstream`): the reason was
//     `no-default-branch`, and its line said to run
//     `git remote set-head origin -a`, which fails there. The reason is now
//     `no-origin-remote`, with its own sentence and no command;
//   - not a git repository (`not-a-repo`): no sentence at all;
//   - and the sweep's `closing-too-long` advisory told every stale unit
//     "Merge it", whatever it was waiting for. Its advice now follows the
//     reason the unit is still closing for.
//
// Real git, in temp folders. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { itemClosingTooLongWords, reportCloses, runConfirmCloses, unitClosingTooLongWords } from '../plugin/tools/lib/close-confirm.js';
import { checkClosingTooLong, confirmClosesInSweep } from '../plugin/tools/lib/sweep.js';
import { BRANCH_GATE, checkBranchPosture } from '../plugin/tools/lib/branch-guard.js';
import { findWorkOnOtherBranches } from '../plugin/tools/lib/branch-work.js';
import { testSeam } from '../plugin/tools/lib/git-env.js';

const OLD = '2026-09-01T10:00:00.000Z';
const NOW = '2026-10-10T12:00:00.000Z';
const by = 'claude';
const EPIC = 'M7.E3';
const UNITS = '.planning/work/units';
const SET_HEAD = 'git remote set-head origin -a';
const NOWHERE = 'c'.repeat(40);
const opened = { type: 'opened', at: OLD, by };
const unitRequest = (proof) => ({ type: 'close_requested', at: OLD, by, proof });
const closingItem = (proof) => ({ id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: OLD, by }, { type: 'close_requested', at: OLD, by, reason: 'fixed', proof }] });

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
let work;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-unconfirmable-'));
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
// A v2 store with unit records: the Epic closing since OLD on `proof`, and
// `items` beside it.
async function store(proof, items = []) {
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`${UNITS}/.keep`, '');
  await put(`${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: [opened, unitRequest(proof)] }));
  for (const r of items) await put(records.recordPath(r.id), serializeRecord(r));
}
// A repository with one commit, pushed to a bare remote under `name`.
function repo(name) {
  g(work, 'init', '-q', '-b', 'main');
  g(work, 'commit', '-q', '--allow-empty', '-m', 'c0');
  if (name) {
    const bare = join(root, 'remote.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', bare);
    g(work, 'remote', 'add', name, bare);
    g(work, 'push', '-q', '-u', name, 'main');
  }
  return g(work, 'rev-parse', 'HEAD');
}

// The confirm line, the report line, and the sweep's "closes not checked" advisories.
async function lines() {
  const out = await runConfirmCloses(work, { now: NOW });
  const unchecked = (await confirmClosesInSweep(work, { now: NOW })).filter((f) => /^closes not checked/.test(f.message));
  return { out, unchecked, all: [out.line, reportCloses(work, { now: NOW }).line, ...unchecked.map((f) => f.message)] };
}
const staleUnit = () => {
  const found = checkClosingTooLong(work, { now: NOW }).filter((f) => f.file === `${UNITS}/${EPIC}.json`);
  expect(found).toHaveLength(1);
  expect(found[0].message).toMatch(new RegExp(`^${EPIC.replace('.', '\\.')} has been closing for 39 days — `));
  return found[0].message;
};

describe('remotes, none named origin', { timeout: 60_000 }, () => {
  const SAYS = /no-origin-remote: Signal reads the default branch of the remote named `origin`, and this project's remotes are named otherwise, so these closes stay closing until a remote named `origin` exists/;

  it('a unit and an item stay closing as `no-origin-remote`; every line says so, once, and names no set-head command', async () => {
    const head = repo('upstream');
    await store(head, [closingItem(head)]);
    const { out, unchecked, all } = await lines();
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'no-origin-remote' }]);
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'no-origin-remote' }], stale: [EPIC] });
    expect(unchecked).toHaveLength(1);
    for (const line of all) {
      expect(line).toMatch(SAYS);
      expect(line.split('no-origin-remote: ')).toHaveLength(2);
      expect(line).not.toContain('set-head');
      expect(line).not.toContain('no-default-branch');
    }
    // the stale unit's own words in the confirm line
    expect(out.line).toContain(`1 closing over 14 days (${EPIC}) — this project has no remote named \`origin\``);
  });

  it('the sweep\'s closing-too-long advisory for the unit says the same, and not "Merge it"', async () => {
    await store(repo('upstream'));
    const message = staleUnit();
    expect(message).toMatch(/Signal reads the default branch of the remote named `origin`, and this project's remotes are named otherwise/);
    expect(message).not.toMatch(/Merge it/);
    expect(message).not.toContain('set-head');
  });

  it('with a remote named origin beside it, nothing changes: the close is confirmed against origin', async () => {
    const head = repo('origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    g(work, 'remote', 'add', 'upstream', join(root, 'remote.git'));
    await store(head);
    expect((await runConfirmCloses(work, { now: NOW })).units.confirmed).toEqual([EPIC]);
  });

  it('the branch gate says which remote it reads, instead of naming origin refs that cannot be there', async () => {
    repo('upstream');
    const posture = checkBranchPosture(work, { tier: 'FULL' });
    expect(posture.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(posture.reason).toMatch(/no remote is named `origin`/);
    expect(posture.reason).toContain('upstream');
  });
});

describe('not a git repository', { timeout: 60_000 }, () => {
  const SAYS = /not-a-repo: this project is not a git repository\. Signal confirms a close only against a remote's default branch, so these closes stay closing/;

  it('a unit and an item stay closing as `not-a-repo`; every line says so, once', async () => {
    await store(NOWHERE, [closingItem(NOWHERE)]);
    const { out, unchecked, all } = await lines();
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'not-a-repo' }], stale: [EPIC] });
    expect(unchecked).toHaveLength(1);
    for (const line of all) {
      expect(line).toMatch(SAYS);
      expect(line.split('not-a-repo: ')).toHaveLength(2);
      expect(line).not.toContain('set-head');
    }
    expect(out.line).toContain(`1 closing over 14 days (${EPIC}) — this project is not a git repository`);
  });

  it('the closing-too-long advisory for the unit says so, and not "Merge it"', async () => {
    await store(NOWHERE);
    const message = staleUnit();
    expect(message).toContain(`its close was requested with the commit ${NOWHERE}; `);
    expect(message).toMatch(/this project is not a git repository\. Signal confirms a close only against a remote's default branch/);
    expect(message).not.toMatch(/Merge it/);
  });
});

describe('closing-too-long for a unit: the advice follows the reason', { timeout: 60_000 }, () => {
  it('the commit is not on the default branch: merge it, or re-run /sig:ship (as before)', async () => {
    repo('origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    g(work, 'checkout', '-q', '-b', 'feat');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'not merged');
    const proof = g(work, 'rev-parse', 'HEAD');
    await store(proof);
    expect(staleUnit()).toBe(`${EPIC} has been closing for 39 days — the commit its close was requested with, ${proof}, is not confirmed on the default branch. `
      + 'Merge it; or, if the work moved on to other commits, re-run /sig:ship, which requests the close again with the new one.');
  });

  it('the commit is on the default branch and an item is open: close the item — nothing to merge', async () => {
    const head = repo('origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    const open = { id: 'SIG-2', type: 'BUG', title: 'open', events: [{ type: 'created', at: OLD, by }, { type: 'triaged', at: OLD, by }, { type: 'queued', at: OLD, by, epic: EPIC }] };
    await store(head, [open]);
    expect((await runConfirmCloses(work, { now: NOW })).units.stillClosing).toEqual([{ id: EPIC, reason: 'open-items' }]);
    const message = staleUnit();
    expect(message).toMatch(/is on the default branch, and the unit has an item that is not closed/);
    expect(message).toMatch(/\/sig:item/);
    expect(message).not.toMatch(/Merge it/);
  });

  it('the remote\'s default branch is not recorded: record it — nothing to merge yet', async () => {
    const head = repo('origin');
    await store(head);
    const message = staleUnit();
    expect(message).toMatch(/the remote's default branch is not recorded in this clone/);
    expect(message).toContain(SET_HEAD);
    expect(message).not.toMatch(/Merge it/);
  });

  it('no remote: it stays closing until the project has one — nothing to merge', async () => {
    const head = repo(null);
    await store(head);
    const message = staleUnit();
    expect(message).toMatch(/this project has no remote\. Signal confirms a close only against a remote's default branch/);
    expect(message).not.toMatch(/Merge it/);
    expect(message).not.toContain('set-head');
  });
});

// The same for an item (r6): "Merge it, or reopen the item" is the advice when
// its fix commit is not on the default branch, and not when nothing here can
// confirm any commit.
describe('closing-too-long for an item: the advice follows the reason', { timeout: 60_000 }, () => {
  const staleItem = () => {
    const found = checkClosingTooLong(work, { now: NOW }).filter((f) => f.file === records.recordPath('SIG-1'));
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/^SIG-1 has been closing for 39 days — /);
    return found[0].message;
  };
  const MERGE = 'Merge it, or reopen the item (`/sig:item reopen SIG-1 "<reason>"`) if the fix did not land.';

  it('the fix commit is not on the default branch: merge it, or reopen the item (as before)', async () => {
    repo('origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    g(work, 'checkout', '-q', '-b', 'feat');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'not merged');
    const proof = g(work, 'rev-parse', 'HEAD');
    await store(proof, [closingItem(proof)]);
    expect(staleItem()).toBe(`SIG-1 has been closing for 39 days — its fix commit ${proof} is not confirmed on the default branch. ${MERGE}`);
  });

  it('a fix commit this clone does not hold: the same', async () => {
    repo('origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    await store(NOWHERE, [closingItem(NOWHERE)]);
    expect(staleItem()).toBe(`SIG-1 has been closing for 39 days — its fix commit ${NOWHERE} is not confirmed on the default branch. ${MERGE}`);
  });

  it('the remote\'s default branch is not recorded: record it — nothing to merge yet', async () => {
    const head = repo('origin');
    await store(head, [closingItem(head)]);
    const message = staleItem();
    expect(message).toContain(`its fix commit ${head} could not be checked: the remote's default branch is not recorded in this clone.`);
    expect(message).toContain(SET_HEAD);
    expect(message).not.toMatch(/Merge it/);
  });

  // Since M6.E16 r7 each ends naming the hand-confirm (tests/close-by-hand.test.js).
  const HAND = ' Or a person may confirm it by hand, only with their yes for it: /sig:item confirm SIG-1.';
  const ends = (re) => new RegExp(`${re.source}${HAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  for (const [name, setup, says] of [
    ['no remote', () => repo(null), ends(/this project has no remote\. Signal confirms a close only against a remote's default branch, so it stays closing until the project has one\./)],
    ['remotes, none named origin', () => repo('upstream'), ends(/Signal reads the default branch of the remote named `origin`, and this project's remotes are named otherwise\. It stays closing until a remote named `origin` exists\./)],
    ['not a git repository', () => NOWHERE, ends(/this project is not a git repository\. Signal confirms a close only against a remote's default branch, so it stays closing\./)],
  ]) {
    it(`${name}: the item is told that, with its commit, and not "Merge it"`, async () => {
      const proof = setup();
      await store(proof, [closingItem(proof)]);
      const message = staleItem();
      expect(message).toContain(`its close was requested with the commit ${proof}; `);
      expect(message).toMatch(says);
      expect(message).not.toMatch(/Merge it/);
      expect(message).not.toContain('set-head');
    });
  }

  it('the item and the unit say the same sentence for the same reason', async () => {
    const head = repo(null);
    await store(head, [closingItem(head)]);
    // Each names its own ID in the hand-confirm command (M6.E16 r7); otherwise the same.
    const after = (m) => m.slice(m.indexOf(' — ') + 3).replace(/\/sig:item confirm \S+\.$/, '/sig:item confirm <ID>.');
    expect(after(staleItem())).toBe(after(staleUnit()));
  });
});

// M6.E16 r6.2 — the words themselves, for the reasons no test above reaches:
// a commit this clone does not hold, no reason known at all, and a reason
// with no sentence of its own.
describe('the closing-too-long words, reason by reason', () => {
  const P = 'c'.repeat(40);
  const UNIT_MERGE = `the commit its close was requested with, ${P}, is not confirmed on the default branch. `
    + 'Merge it; or, if the work moved on to other commits, re-run /sig:ship, which requests the close again with the new one.';
  const ITEM_MERGE = `its fix commit ${P} is not confirmed on the default branch. Merge it, or reopen the item (\`/sig:item reopen SIG-9 "<reason>"\`) if the fix did not land.`;

  it('a unit: not on the default branch, a commit this clone does not hold, and no reason known all say "merge it"', () => {
    for (const reason of ['not-on-default-branch', 'unknown-commit', undefined]) expect(unitClosingTooLongWords(reason, P), String(reason)).toBe(UNIT_MERGE);
  });

  it('an item: the same three say "merge it, or reopen the item"', () => {
    for (const reason of ['not-on-default-branch', 'unknown-commit', undefined]) expect(itemClosingTooLongWords(reason, P, 'SIG-9'), String(reason)).toBe(ITEM_MERGE);
  });

  it('a reason with no sentence of its own: a unit is told the reason and not to merge; an item keeps its one advice', () => {
    for (const reason of ['shallow', 'git-failed', 'ambiguous-proof']) {
      expect(unitClosingTooLongWords(reason, P), reason)
        .toBe(`the commit its close was requested with, ${P}, is not confirmed on the default branch (${reason}).`);
      expect(itemClosingTooLongWords(reason, P, 'SIG-9'), reason).toBe(ITEM_MERGE);
    }
  });

  it('a unit with open items is told to close them, an item never is (it has none)', () => {
    expect(unitClosingTooLongWords('open-items', P)).toMatch(/is on the default branch, and the unit has an item that is not closed/);
    expect(itemClosingTooLongWords('open-items', P, 'SIG-9')).toBe(ITEM_MERGE);
  });
});

// S11: the sweep stays quiet. With nothing closing too long there is no reason
// to ask git for, and git is not run at all.
describe('closing-too-long asks git only when something is stale', { timeout: 60_000 }, () => {
  it('a unit and an item closing since yesterday: no finding, and git is never asked', async () => {
    const head = repo('origin');
    const recent = '2026-10-09T10:00:00.000Z';
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put(`${UNITS}/.keep`, '');
    await put(`${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: [opened, { type: 'close_requested', at: recent, by, proof: head }] }));
    await put(records.recordPath('SIG-1'), serializeRecord({ id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: OLD, by }, { type: 'close_requested', at: recent, by, reason: 'fixed', proof: head }] }));
    const asked = [];
    const execFn = (cmd, args) => {
      asked.push([cmd, ...args]);
      throw new Error('git was asked');
    };
    expect(checkClosingTooLong(work, { now: NOW, execFn })).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('the control: with the same two stale, git is asked', async () => {
    const head = repo('origin');
    await store(head, [closingItem(head)]);
    const asked = [];
    const execFn = (cmd, args) => {
      asked.push([cmd, ...args]);
      throw new Error('git was asked');
    };
    expect(checkClosingTooLong(work, { now: NOW, execFn })).toHaveLength(2);
    expect(asked.length).toBeGreaterThan(0);
  });
});

// Nit: more than one remote, none of them origin — each is named.
describe('remotes, none named origin: the branch gate names them all', { timeout: 60_000 }, () => {
  it('two remotes: both in the reason', () => {
    repo('upstream');
    g(work, 'remote', 'add', 'fork', join(root, 'remote.git'));
    const posture = checkBranchPosture(work, { tier: 'FULL' });
    expect(posture.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(posture.reason).toBe('no remote is named `origin` (this repository has: fork, upstream) — the default branch is read from the remote named `origin`');
  });
});

// M6.E16 r6.4 — with a git older than 2.38 Signal runs no git-backed check.
// Every git call then fails as "not a git repository"; the places that tell a
// person something say the version, not that there is no repository.
describe('a git Signal does not use: the reason is the version, in a real repository with a default branch', { timeout: 60_000 }, () => {
  const OLD = 'Signal needs git 2.38 or newer for its git-backed checks; this is git 2.34.1';
  afterEach(() => {
    testSeam.gitVersion = undefined;
  });

  it('a closing unit and item: `git-too-old`, said once in the confirm line, the report line and the sweep; nothing is confirmed', async () => {
    const head = repo('origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    await store(head, [closingItem(head)]);
    testSeam.gitVersion = 'git version 2.34.1';
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'git-too-old' }]);
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'git-too-old' }], stale: [EPIC] });
    const unchecked = (await confirmClosesInSweep(work, { now: NOW })).filter((f) => /^closes not checked/.test(f.message));
    expect(unchecked).toHaveLength(1);
    const PART = `git-too-old: ${OLD}, so these closes stay closing until git is updated`;
    for (const line of [out.line, reportCloses(work, { now: NOW }).line, unchecked[0].message]) {
      expect(line.endsWith(PART)).toBe(true);
      expect(line).not.toContain('not a git repository');
      expect(line).not.toContain('set-head');
    }
    const tooLong = checkClosingTooLong(work, { now: NOW }).map((f) => f.message);
    expect(tooLong).toHaveLength(2);
    for (const m of tooLong) {
      expect(m.endsWith(`${OLD}, so it stays closing until git is updated.`)).toBe(true);
      expect(m).not.toMatch(/Merge it|not a git repository/);
    }
  });

  it('the control: the same project with the installed git confirms both', async () => {
    const head = repo('origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    await store(head, [closingItem(head)]);
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual(['SIG-1']);
    expect(out.units.confirmed).toEqual([EPIC]);
  });

  it('the branch gate from a subfolder: could not check, with the version — not "not a git repository"', async () => {
    repo('origin');
    await mkdir(join(work, 'packages', 'app'), { recursive: true });
    testSeam.gitVersion = 'git version 2.34.1';
    expect(checkBranchPosture(join(work, 'packages', 'app'), { tier: 'FULL' })).toMatchObject({ status: BRANCH_GATE.CANNOT_DETERMINE, reason: OLD });
    expect(checkBranchPosture(work, { tier: 'FULL' })).toMatchObject({ status: BRANCH_GATE.CANNOT_DETERMINE, reason: OLD });
    // a tier that never ends at a pull request is still simply not applicable
    expect(checkBranchPosture(work, { tier: 'SKETCH' }).status).toBe(BRANCH_GATE.NOT_APPLICABLE);
  });

  it('work on other branches: could not be checked, with the version — not "nothing found"', async () => {
    repo('origin');
    testSeam.gitVersion = 'git version 2.34.1';
    const r = await findWorkOnOtherBranches(work, { localEpic: null });
    expect(r).toMatchObject({ failed: true, open: [], cannotCheck: [{ reason: OLD }] });
  });
});
