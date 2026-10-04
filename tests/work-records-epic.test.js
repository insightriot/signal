// closeEpicCheck and isEpicArchived (M6.E13.S2.t2.5, AC1.5).
// See .planning/M6.E13-VALIDATION.md row AC1.5.
//
// An Epic's membership is folded from the events (`epicOf`, Decision 4), so
// "can this Epic close" is a query over every record, not a walk of a folder.
// Moving the Epic folder stays in v1 `closeEpic` until S7.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const E = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: (epic = 'M6.E13') => ({ type: 'queued', at: AT, by, epic }),
  started: (epic = 'M6.E13') => ({ type: 'started', at: AT, by, epic }),
  closing: { type: 'close_requested', at: AT, by, reason: 'fixed', proof: '0123abc' },
  confirmed: { type: 'closed', at: AT, by: 'confirmCloses', reason: 'fixed', proof: '0123abc' },
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
  reopened: { type: 'reopened', at: AT, by, reason: 'back' },
};
const rec = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
async function store(fixtures) {
  for (const r of fixtures) await put(records.recordPath(r.id), serializeRecord(r));
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-records-epic-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('closeEpicCheck', () => {
  it('refuses with OPEN_ITEMS naming every open record in the Epic (Q, P, closing outside git), nothing else', async () => {
    await store([
      rec('SIG-1', [E.created, E.triaged, E.queued()]),
      rec('SIG-2', [E.created, E.triaged, E.started()]),
      rec('SIG-3', [E.created, E.triaged, E.started(), E.closing]),
      rec('SIG-4', [E.created, E.triaged, E.started(), E.wontdo]),
      rec('SIG-5', [E.created, E.triaged, E.queued('M6.E14')]),
      rec('SIG-6', [E.created, E.triaged]),
    ]);
    const before = snapshotTree(base);
    let err;
    try {
      records.closeEpicCheck(base, 'M6.E13');
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'OPEN_ITEMS' });
    expect(err.message).toMatch(/^M6\.E13 has 3 open items/);
    expect(err.message).toMatch(/SIG-1 \(status Q\) — t SIG-1/);
    expect(err.message).toMatch(/SIG-2 \(status P\)/);
    expect(err.message).toMatch(/SIG-3 \(status closing\)/);
    expect(err.message).not.toMatch(/SIG-4|SIG-5|SIG-6/);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('one open item reads in the singular', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.queued()])]);
    expect(() => records.closeEpicCheck(base, 'M6.E13')).toThrow(/has 1 open item in/);
  });

  it('passes when every record in the Epic is closed, naming them', async () => {
    await store([
      rec('SIG-1', [E.created, E.triaged, E.started(), E.closing, E.confirmed]),
      rec('SIG-2', [E.created, E.triaged, E.queued(), E.wontdo]),
      rec('SIG-3', [E.created, E.triaged, E.queued('M6.E14')]),
    ]);
    expect(records.closeEpicCheck(base, 'M6.E13')).toEqual({ epic: 'M6.E13', items: ['SIG-1', 'SIG-2'], closingOnBranch: [], archived: false });
  });

  it('a record reopened out of the Epic no longer belongs to it', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.started(), E.wontdo, E.reopened])]);
    expect(records.closeEpicCheck(base, 'M6.E13')).toEqual({ epic: 'M6.E13', items: [], closingOnBranch: [], archived: false });
  });

  it('says whether the Epic is already archived', async () => {
    await put('.planning/archive/epics/M6.E13/README.md', 'x\n');
    expect(records.closeEpicCheck(base, 'M6.E13')).toMatchObject({ archived: true });
  });

  it('a broken record anywhere refuses (its Epic cannot be known), naming it', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.queued(), E.wontdo])]);
    await put(records.recordPath('SIG-2'), '{ not json\n');
    expect(() => records.closeEpicCheck(base, 'M6.E13')).toThrow(expect.objectContaining({
      code: 'SCHEMA',
      message: expect.stringMatching(/SIG-2\.json/),
    }));
  });

  it('a malformed Epic ID is refused before any path is built', () => {
    for (const bad of ['../x', 'M6.E13/..', 'm6.e13', '', undefined]) {
      expect(() => records.closeEpicCheck(base, bad)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    }
  });

  it('a store that is off is CONFIG', async () => {
    await rm(join(base, '.planning/work/WORK.md'));
    expect(() => records.closeEpicCheck(base, 'M6.E13')).toThrow(expect.objectContaining({ code: 'CONFIG' }));
  });
});

// D-M6E13-22: at an Epic-close SHIP the Epic's fix commits are on the
// shipping branch, not yet on the default branch. A *closing* record counts as
// done for the gate iff its proof commit is an ancestor of HEAD; fail-closed
// when git cannot tell.
describe('closeEpicCheck — closing records whose fix is on the shipping branch (D-M6E13-22)', () => {
  function g(...args) {
    const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], {
      cwd: base,
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  }
  const closingOn = (proof) => ({ type: 'close_requested', at: AT, by, reason: 'fixed', proof });

  async function repoWithFix() {
    g('init', '-q', '-b', 'feat');
    await put('fix.txt', 'fixed\n');
    g('add', 'fix.txt');
    g('commit', '-q', '-m', 'the fix');
    return g('rev-parse', 'HEAD');
  }

  it('a closing record whose proof commit is in HEAD counts as done, and is named in closingOnBranch', async () => {
    const sha = await repoWithFix();
    await store([
      rec('SIG-1', [E.created, E.triaged, E.started(), closingOn(sha)]),
      rec('SIG-2', [E.created, E.triaged, E.queued(), E.wontdo]),
    ]);
    const before = snapshotTree(base);
    expect(records.closeEpicCheck(base, 'M6.E13'))
      .toEqual({ epic: 'M6.E13', items: ['SIG-1', 'SIG-2'], closingOnBranch: ['SIG-1'], archived: false });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('the short form of the hash is enough', async () => {
    const sha = await repoWithFix();
    await store([rec('SIG-1', [E.created, E.triaged, E.started(), closingOn(sha.slice(0, 7))])]);
    expect(records.closeEpicCheck(base, 'M6.E13')).toMatchObject({ closingOnBranch: ['SIG-1'] });
  });

  it('a proof commit not in HEAD (another branch) stays open', async () => {
    await repoWithFix();
    g('checkout', '-q', '-b', 'elsewhere');
    await put('other.txt', 'x\n');
    g('add', 'other.txt');
    g('commit', '-q', '-m', 'not on feat');
    const other = g('rev-parse', 'HEAD');
    g('checkout', '-q', 'feat');
    await store([rec('SIG-1', [E.created, E.triaged, E.started(), closingOn(other)])]);
    expect(() => records.closeEpicCheck(base, 'M6.E13'))
      .toThrow(expect.objectContaining({ code: 'OPEN_ITEMS', message: expect.stringMatching(/SIG-1 \(status closing\)/) }));
  });

  it('a proof that is not a commit in the repo stays open (unknown commit, fail-closed)', async () => {
    await repoWithFix();
    await store([rec('SIG-1', [E.created, E.triaged, E.started(), closingOn('0123abc')])]);
    expect(() => records.closeEpicCheck(base, 'M6.E13')).toThrow(expect.objectContaining({ code: 'OPEN_ITEMS' }));
  });

  it('git failing for any reason stays open (fail-closed)', async () => {
    const sha = await repoWithFix();
    await store([rec('SIG-1', [E.created, E.triaged, E.started(), closingOn(sha)])]);
    const calls = [];
    const broken = (cmd, args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true\n';
      throw Object.assign(new Error('git broke'), { status: 2 });
    };
    expect(() => records.closeEpicCheck(base, 'M6.E13', { execFn: broken })).toThrow(expect.objectContaining({ code: 'OPEN_ITEMS' }));
    expect(calls.some((a) => a.includes('merge-base'))).toBe(true);
  });
});

describe('isEpicArchived', () => {
  it('true when .planning/archive/epics/<Epic>/ exists, false otherwise', async () => {
    expect(records.isEpicArchived(base, 'M6.E12')).toBe(false);
    await put('.planning/archive/epics/M6.E12/README.md', 'x\n');
    expect(records.isEpicArchived(base, 'M6.E12')).toBe(true);
  });

  it('refuses a malformed Epic ID (no path traversal)', () => {
    expect(() => records.isEpicArchived(base, '../../etc')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });

  it('reopenItem uses it: refused in an archived Epic', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.started('M6.E12'), E.wontdo])]);
    await put('.planning/archive/epics/M6.E12/README.md', 'x\n');
    await expect(records.reopenItem(base, 'SIG-1', { reason: 'r', by }, { execFn: () => { throw new Error('no'); } }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
