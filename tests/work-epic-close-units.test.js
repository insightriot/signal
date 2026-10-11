// M6.E16.S4.t4.1 — `closeEpic` on a project with unit records (FR4).
// See .planning/M6.E16-VALIDATION.md rows AC4.1, AC4.3, AC4.4, AC6.4 and
// "NFR failure".
//
// With unit records the close is a `close_requested` event on the unit's
// record, with the Epic's commit as proof. Nothing moves and no Epic folder is
// looked for. Git here is real git, in a temp repository per test. Unit names
// are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { getUnit, hasUnits } from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { acquireLock } from '../plugin/tools/lib/file-lock.js';
import { WORK_LOCK_REL } from '../plugin/tools/lib/work-store.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';
const EPIC = 'M7.E3';
const UNITS = '.planning/work/units';
const RETRO = `.planning/${EPIC}-RETROSPECTIVE.md`;
const COMPLETE_RETRO = '# Retrospective\n\n## Timeline\n\nIt shipped.\n\n## What surprised us\n\nNothing much.\n';
const STUB_RETRO = '# Retrospective\n\n## Timeline\n\nIt shipped.\n\n## What surprised us\n\n[FILL IN]\n';
const AWS = `AKIA${'ABCDEFGH'.repeat(2)}`; // shaped like a key; not one

const ev = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: { type: 'queued', at: AT, by, epic: EPIC },
  started: { type: 'started', at: AT, by, epic: EPIC },
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
};
const U = {
  opened: { type: 'opened', at: AT, by },
};

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-epic-close-units-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const git = (...args) => {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const plantUnit = (id, events) => put(`${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
const unitBytes = (id) => readFile(join(root, `${UNITS}/${id}.json`), 'utf-8');

// A v2 store in a real repository on a branch: one closed item in the Epic,
// one open item outside it, the views fresh, and everything committed.
// `opts.units` (default on): the units folder with the Epic's record, open.
// `opts.retro`: the retrospective's text, or null for none.
async function project({ items = [], units = true, unit = [U.opened], retro = COMPLETE_RETRO } = {}) {
  git('init', '-q', '-b', 'feat');
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  const recs = [
    { id: 'SIG-1', type: 'FEAT', title: 'done in the Epic', events: [ev.created, ev.triaged, ev.queued, ev.wontdo] },
    { id: 'SIG-2', type: 'CHORE', title: 'not in the Epic', events: [ev.created, ev.triaged] },
    ...items,
  ];
  for (const r of recs) await put(records.recordPath(r.id), serializeRecord(r));
  if (units) {
    await put(`${UNITS}/.keep`, '');
    if (unit) await plantUnit(EPIC, unit);
  }
  if (retro !== null) await put(RETRO, retro);
  await regenerateViews(root);
  git('add', '-A');
  git('commit', '-q', '-m', 'the Epic');
  return git('rev-parse', 'HEAD');
}

async function refused(run, code, message) {
  const before = snapshotTree(root);
  const err = await run().catch((e) => e);
  expect(err, 'the call was not refused').toBeInstanceOf(Error);
  expect(err).toMatchObject({ code });
  if (message) expect(err.message).toMatch(message);
  // Records and views alike: every file under the project is byte-identical.
  expect(snapshotTree(root)).toEqual(before);
  return err;
}

describe('closeEpic with unit records — the close is requested on the unit (AC4.1, AC4.4)', () => {
  it('records close_requested with the branch HEAD as proof; the unit reads closing; nothing else changes', async () => {
    const head = await project();
    expect(existsSync(join(root, `.planning/work/epics/${EPIC}`))).toBe(false); // AC4.4: no Epic folder
    const before = snapshotTree(root);
    const out = await closeEpic(root, EPIC, { by, pr: '#412', release: 'v9.9.9', at: AT });
    expect(out).toEqual({
      status: 'close-requested',
      epic: EPIC,
      commit: head,
      created: false,
      retro: RETRO,
      items: ['SIG-1'],
      closingOnBranch: [],
      unit: { id: EPIC, path: `${UNITS}/${EPIC}.json`, status: 'closing', held: false, closing_proof: head, close: null },
    });
    const unit = getUnit(root, EPIC);
    expect(unit.status).toBe('closing');
    expect(unit.record.events).toEqual([
      U.opened,
      { type: 'close_requested', at: AT, by, proof: head, pr: '#412', release: 'v9.9.9' },
    ]);
    // Only the unit's record changed: no folder moved, no README, no view rewritten.
    const after = snapshotTree(root);
    expect([...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)))
      .toEqual([`${UNITS}/${EPIC}.json`]);
    expect(existsSync(join(root, '.planning/archive'))).toBe(false);
    expect(records.checkRecords(root)).toEqual([]);
  });

  it('`commit` is the proof when passed; a PR number is recorded as its digits', async () => {
    const first = await project();
    await put('later.txt', 'x\n');
    git('add', 'later.txt');
    git('commit', '-q', '-m', 'later');
    const out = await closeEpic(root, EPIC, { by, pr: 412, commit: first, at: AT });
    expect(out).toMatchObject({ status: 'close-requested', commit: first });
    expect(getUnit(root, EPIC).record.events.at(-1)).toEqual({ type: 'close_requested', at: AT, by, proof: first, pr: '412' });
  });

  it('an item of the Epic closing with its fix in HEAD counts as done, and is named', async () => {
    git('init', '-q', '-b', 'feat');
    await put('fix.txt', 'fixed\n');
    git('add', 'fix.txt');
    git('commit', '-q', '-m', 'the fix');
    const fix = git('rev-parse', 'HEAD');
    const closing = { type: 'close_requested', at: AT, by, reason: 'fixed', proof: fix };
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put(records.recordPath('SIG-3'), serializeRecord({ id: 'SIG-3', type: 'BUG', title: 'fixed on the branch', events: [ev.created, ev.triaged, ev.started, closing] }));
    await put(`${UNITS}/.keep`, '');
    await plantUnit(EPIC, [U.opened]);
    await put(RETRO, COMPLETE_RETRO);
    await regenerateViews(root);
    const out = await closeEpic(root, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 'close-requested', items: ['SIG-3'], closingOnBranch: ['SIG-3'] });
    expect(records.getRecord(root, 'SIG-3').status).toBe('closing');
  });

  it('a unit with no record (units turned on mid-Epic): the record is created, then the close requested, and the result says so', async () => {
    const head = await project({ unit: null });
    const out = await closeEpic(root, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 'close-requested', created: true, commit: head, unit: { status: 'closing' } });
    expect(getUnit(root, EPIC).record.events.map((e) => e.type)).toEqual(['opened', 'close_requested']);
  });
});

describe('closeEpic with unit records — refusals write nothing (AC4.3, NFR failure)', () => {
  it('the retrospective is missing: refused, naming the file', async () => {
    await project({ retro: null });
    const err = await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'CONFLICT', new RegExp(`${EPIC}-RETROSPECTIVE\\.md does not exist`));
    expect(err.retro).toEqual({ path: RETRO, status: 'absent' });
    expect(getUnit(root, EPIC).status).toBe('open');
  });

  it('the retrospective still holds one placeholder: refused, naming the file', async () => {
    await project({ retro: STUB_RETRO });
    const err = await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'CONFLICT', new RegExp(`${EPIC}-RETROSPECTIVE\\.md is still a stub`));
    expect(err.retro).toEqual({ path: RETRO, status: 'stub' });
    expect(err.message).toMatch(/Nothing was written/);
    expect(getUnit(root, EPIC).status).toBe('open');
  });

  it('the retrospective is an empty file: refused', async () => {
    await project({ retro: '' });
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'CONFLICT', /is empty/);
  });

  it('the retrospective is a link to a complete file elsewhere: refused, not read through', async () => {
    await project({ retro: null });
    await put('elsewhere.md', COMPLETE_RETRO);
    await symlink(join('..', 'elsewhere.md'), join(root, RETRO));
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'CONFLICT', /not a regular file/);
  });

  it('one item of the Epic is open: OPEN_ITEMS naming it', async () => {
    await project({ items: [{ id: 'SIG-3', type: 'FEAT', title: 'still queued', events: [ev.created, ev.triaged, ev.queued] }] });
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'OPEN_ITEMS', /SIG-3 \(status Q\) — still queued/);
    expect(getUnit(root, EPIC).status).toBe('open');
  });

  it('an open item AND no retrospective: the open item is named first', async () => {
    await project({ retro: null, items: [{ id: 'SIG-3', type: 'FEAT', title: 'still queued', events: [ev.created, ev.triaged, ev.queued] }] });
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'OPEN_ITEMS');
  });

  it('a unit with no record and a refusing gate: no record is created', async () => {
    await project({ unit: null, retro: STUB_RETRO });
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'CONFLICT', /still a stub/);
    expect(existsSync(join(root, `${UNITS}/${EPIC}.json`))).toBe(false);
    await rm(join(root, RETRO));
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'CONFLICT', /does not exist/);
    expect(existsSync(join(root, `${UNITS}/${EPIC}.json`))).toBe(false);
  });

  it('a broken item record anywhere in the store: SCHEMA', async () => {
    await project();
    await put('.planning/work/items/00/SIG-9.json', '{ not json');
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'SCHEMA');
  });

  it('a broken unit record for the Epic: SCHEMA', async () => {
    await project();
    await put(`${UNITS}/${EPIC}.json`, '{ not json');
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'SCHEMA');
  });

  it('pr or release that looks like a secret: nothing written until acknowledged', async () => {
    await project();
    const before = snapshotTree(root);
    expect(await closeEpic(root, EPIC, { by, pr: AWS, at: AT })).toEqual({ aborted: 'sensitive-data-pending', sensitiveHits: expect.any(Array) });
    expect(await closeEpic(root, EPIC, { by, release: AWS, at: AT })).toEqual({ aborted: 'sensitive-data-pending', sensitiveHits: expect.any(Array) });
    expect(snapshotTree(root)).toEqual(before);
    expect(await closeEpic(root, EPIC, { by, pr: AWS, at: AT }, { acknowledgeSensitive: true })).toMatchObject({ status: 'close-requested' });
  });

  it('no repository and no `commit`: CONFIG — the close needs a commit as proof', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put(`${UNITS}/.keep`, '');
    await plantUnit(EPIC, [U.opened]);
    await put(RETRO, COMPLETE_RETRO);
    await regenerateViews(root);
    const noGit = () => {
      throw new Error('not a git repository');
    };
    await refused(() => closeEpic(root, EPIC, { by, at: AT }, { execFn: noGit }), 'CONFIG', /pass `commit`/);
  });

  it.each([['main'], ['HEAD'], ['--all'], ['ABCDEF1'], ['0123ab']])('a `commit` that is not a bare hash (%s): SCHEMA', async (commit) => {
    await project();
    await refused(() => closeEpic(root, EPIC, { by, commit, at: AT }), 'SCHEMA', /commit hash/);
  });

  it('the lock is held: LOCKED, nothing written', async () => {
    await project();
    const lock = await acquireLock(join(root, WORK_LOCK_REL), { label: 'test' });
    try {
      await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'LOCKED');
    } finally {
      await lock.released();
    }
  });

  it('the write fails: IO, the record byte-identical', async () => {
    await project();
    const renameFn = async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    await refused(() => closeEpic(root, EPIC, { by, at: AT }, { renameFn }), 'IO', /disk full/);
  });

  it('not an Epic ID, or no `by`: SCHEMA', async () => {
    await project();
    await refused(() => closeEpic(root, 'phase-11', { by, at: AT }), 'SCHEMA');
    await refused(() => closeEpic(root, EPIC, { at: AT }), 'SCHEMA', /by/);
  });
});

describe('closeEpic with unit records — a unit that is not open', () => {
  it('already closed: says so with the close, writes nothing', async () => {
    const closed = { type: 'closed', at: AT, by, reason: 'dropped', words: 'moved elsewhere' };
    await project({ unit: [U.opened, closed] });
    const before = snapshotTree(root);
    const out = await closeEpic(root, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 'already-closed', epic: EPIC, unit: { status: 'closed', close: { reason: 'dropped' } } });
    expect(snapshotTree(root)).toEqual(before);
  });

  it('already closing with this commit (SHIP re-run): already-requested, nothing written', async () => {
    const head = await project();
    await closeEpic(root, EPIC, { by, at: AT });
    const before = await unitBytes(EPIC);
    expect(await closeEpic(root, EPIC, { by, at: AT })).toMatchObject({ status: 'already-requested', commit: head, unit: { status: 'closing' } });
    expect(await unitBytes(EPIC)).toBe(before);
  });

  it('already closing with another commit: CONFLICT naming both, nothing written', async () => {
    const head = await project();
    await closeEpic(root, EPIC, { by, at: AT });
    await put('later.txt', 'x\n');
    git('add', 'later.txt');
    git('commit', '-q', '-m', 'later');
    const later = git('rev-parse', 'HEAD');
    await refused(() => closeEpic(root, EPIC, { by, at: AT }), 'CONFLICT', new RegExp(`${head}.*${later}`, 's'));
  });
});

describe('closeEpic without unit records — as before (AC6.4)', () => {
  it('the same project with no units folder: no-folder, nothing written, no units folder appears', async () => {
    await project({ units: false });
    const before = snapshotTree(root);
    expect(await closeEpic(root, EPIC, { by, pr: '#412', at: AT })).toEqual({ status: 'no-folder' });
    expect(snapshotTree(root)).toEqual(before);
    expect(hasUnits(root)).toBe(false);
  });

  it('with no units folder a missing retrospective does not refuse (the gate is the old one)', async () => {
    await project({ units: false, retro: null });
    expect(await closeEpic(root, EPIC, { by, at: AT })).toEqual({ status: 'no-folder' });
  });

  it('a linked units folder reads as no unit records: no-folder, nothing written through the link', async () => {
    await project({ units: false });
    const outside = await mkdtemp(join(tmpdir(), 'sig-epic-close-units-out-'));
    try {
      await writeFile(join(outside, `${EPIC}.json`), UNIT_KIND.serializeRecord({ id: EPIC, events: [U.opened] }), 'utf-8');
      await symlink(outside, join(root, UNITS));
      expect(await closeEpic(root, EPIC, { by, at: AT })).toEqual({ status: 'no-folder' });
      expect(await readFile(join(outside, `${EPIC}.json`), 'utf-8')).toBe(UNIT_KIND.serializeRecord({ id: EPIC, events: [U.opened] }));
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
