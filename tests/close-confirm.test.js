// M6.E13 t4.6, as amended by D-M6E13-21 — where a *closing* item becomes
// closed (AC7.2 wiring). See .planning/M6.E13-VALIDATION.md row AC7.2.
//
// Three sites, all v2 only:
//   - SHIP calls `close-confirm.js` `runConfirmCloses`, which confirms (writes
//     `closed` events and the views) and returns one line for the SHIP report.
//     Fail-open: it never throws and never blocks.
//   - The sweep CONFIRMS too (`sweep.js` `confirmClosesInSweep`, through
//     `runConfirmCloses`): the one sweep step that writes. Every other sweep
//     check stays read-only.
//   - `/sig:resume` only REPORTS (`close-confirm.js` `reportCloses`, through
//     `work-records.js` `probeCloses`): "N ready to close — run the sweep or
//     ship". It writes nothing, so its read-only contract holds.
//
// AC7.3 (advise and drive never propose a closing item) is pinned where those
// readers are tested: `tests/advise-store-on.test.js` ("closing and closed
// items are not backlog rows", "closing items are offered nowhere") and
// `tests/drive-store-on.test.js` ("never offers a closing or closed item").
//
// Temp git repos, real git: a bare remote and a clone with origin/HEAD set.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { runConfirmCloses, formatConfirmClosesLine, reportCloses, formatCloseReportLine } from '../plugin/tools/lib/close-confirm.js';
import { confirmClosesInSweep, runSweep } from '../plugin/tools/lib/sweep.js';
import { renderResumeBriefing } from '../plugin/tools/lib/resume.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { stringifyItem } from '../plugin/tools/lib/work-item.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const NOW = '2026-10-10T12:00:00.000Z';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const request = (proof, at = AT) => ({ type: 'close_requested', at, by, reason: 'fixed', proof });
const rec = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-close-confirm-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function v2Store(dir, fixtures) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const r of fixtures) await put(dir, records.recordPath(r.id), serializeRecord(r));
}

// A v1 store holding one fixed close, which the converter reads as *closing*.
async function v1Store(dir, sha) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
  const fields = {
    id: 'SIG-1', type: 'BUG', status: 'C', created: { at: AT, by }, title: 't SIG-1',
    close: { reason: 'fixed', by, at: '2026-10-04', proof: `fixed in commit ${sha}` },
  };
  await put(dir, '.planning/work/done/2026-10/SIG-1.md', stringifyItem(fields, 'body\n'));
}

const read = async (dir, id) => JSON.parse(await readFile(join(dir, records.recordPath(id)), 'utf-8'));
const lastEvent = async (dir, id) => (await read(dir, id)).events.at(-1).type;

// A bare remote with `commits` commits on main, and a clone of it (origin/HEAD set).
async function plantClone({ commits = 2 } = {}) {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  await mkdir(seed, { recursive: true });
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  g(seed, 'init', '-q', '-b', 'main');
  const shas = [];
  for (let i = 0; i < commits; i += 1) {
    g(seed, 'commit', '-q', '--allow-empty', '-m', `c${i}`);
    shas.push(g(seed, 'rev-parse', 'HEAD'));
  }
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-q', '-u', 'origin', 'main');
  g(root, 'clone', '-q', remote, work);
  return { work, shas };
}

// One merged fix (SIG-1), one fix on an unmerged branch (SIG-2), one open item (SIG-3).
async function mixedClone() {
  const { work, shas } = await plantClone();
  g(work, 'checkout', '-q', '-b', 'feature');
  g(work, 'commit', '-q', '--allow-empty', '-m', 'unmerged');
  const unmerged = g(work, 'rev-parse', 'HEAD');
  await v2Store(work, [
    rec('SIG-1', [created, request(shas[0])]),
    rec('SIG-2', [created, request(unmerged)]),
    rec('SIG-3', [created]),
  ]);
  return { work, shas, unmerged };
}

describe('probeCloses — what confirmCloses would do, without doing it', () => {
  it('names the confirmable items and the ones still closing, and writes nothing', async () => {
    const { work } = await mixedClone();
    const before = snapshotTree(work);
    const out = records.probeCloses(work, { now: NOW });
    expect(out).toEqual({
      confirmable: ['SIG-1'],
      stillClosing: [{ id: 'SIG-2', reason: 'not-on-default-branch' }],
      stale: [],
    });
    expect(snapshotTree(work)).toEqual(before);
  });

  it('agrees with confirmCloses on the same store', async () => {
    const { work } = await mixedClone();
    const probe = records.probeCloses(work, { now: NOW });
    const done = await records.confirmCloses(work, { now: NOW });
    expect(done.confirmed).toEqual(probe.confirmable);
    expect(done.stillClosing).toEqual(probe.stillClosing);
  });

  it('refuses on a v1 store and on a store that is off (CONFIG), as confirmCloses does', async () => {
    const { work, shas } = await plantClone();
    await v1Store(work, shas[0]);
    expect(() => records.probeCloses(work, { now: NOW })).toThrow(expect.objectContaining({ code: 'CONFIG' }));
    const off = join(root, 'off');
    await mkdir(off);
    expect(() => records.probeCloses(off, { now: NOW })).toThrow(expect.objectContaining({ code: 'CONFIG' }));
  });
});

describe('runConfirmCloses — the SHIP and sweep entry (fail-open)', () => {
  it('v2: confirms the merged fix, leaves the rest, and returns one line saying the files changed', async () => {
    const { work } = await mixedClone();
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out).toMatchObject({
      ran: true,
      confirmed: ['SIG-1'],
      stillClosing: [{ id: 'SIG-2', reason: 'not-on-default-branch' }],
      stale: [],
      error: null,
    });
    expect(await lastEvent(work, 'SIG-1')).toBe('closed');
    expect(await lastEvent(work, 'SIG-2')).toBe('close_requested');
    expect(await lastEvent(work, 'SIG-3')).toBe('created');
    expect(out.line).toBe(
      'Closes: confirmed 1 (SIG-1) — its record and the views changed; commit them · '
      + '1 still closing (SIG-2: not-on-default-branch)',
    );
    expect(out.line.split('\n')).toHaveLength(1);
  });

  it('v2, nothing closing: ran, no line (nothing to say), nothing written', async () => {
    const { work } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created])]);
    const before = snapshotTree(work);
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out).toEqual({ ran: true, confirmed: [], stillClosing: [], stale: [], error: null, line: null });
    expect(snapshotTree(work)).toEqual(before);
  });

  it('v1 store: does nothing — no git, nothing written, no line', async () => {
    const { work, shas } = await plantClone();
    await v1Store(work, shas[0]);
    const before = snapshotTree(work);
    const execFn = () => {
      throw new Error('git must not run on a v1 store');
    };
    const out = await runConfirmCloses(work, { now: NOW, execFn });
    expect(out).toEqual({ ran: false, confirmed: [], stillClosing: [], stale: [], error: null, line: null });
    expect(snapshotTree(work)).toEqual(before);
  });

  it('store off: does nothing, no line', async () => {
    const off = join(root, 'off');
    await mkdir(off);
    const out = await runConfirmCloses(off, { now: NOW });
    expect(out).toEqual({ ran: false, confirmed: [], stillClosing: [], stale: [], error: null, line: null });
  });

  it('a broken WORK.md: never throws; says the closes were not checked', async () => {
    const dir = join(root, 'broken');
    await put(dir, '.planning/work/WORK.md', '---\nkey: [\n---\n');
    const out = await runConfirmCloses(dir, { now: NOW });
    expect(out.ran).toBe(false);
    expect(out.error).toEqual(expect.any(String));
    expect(out.line).toMatch(/^Closes not checked — /);
  });

  it('confirmCloses failing (e.g. LOCKED): never throws; says the closes were not confirmed', async () => {
    const { work } = await mixedClone();
    const confirm = async () => {
      const err = new Error('the work store is locked by another writer');
      err.code = 'LOCKED';
      throw err;
    };
    const out = await runConfirmCloses(work, { now: NOW, confirm });
    expect(out).toMatchObject({ ran: true, confirmed: [], error: 'the work store is locked by another writer' });
    expect(out.line).toBe('Closes not confirmed — the work store is locked by another writer');
    expect(await lastEvent(work, 'SIG-1')).toBe('close_requested');
  });

  it('outside a git repo (offline, no remote): every item stays closing, with its reason', async () => {
    const plain = join(root, 'plain');
    await v2Store(plain, [rec('SIG-1', [created, request('0123abc')])]);
    const out = await runConfirmCloses(plain, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.line).toBe('Closes: 1 still closing (SIG-1: not-a-repo)');
  });
});

describe('formatConfirmClosesLine', () => {
  it('names a stale wait and points at the sweep', () => {
    const line = formatConfirmClosesLine({
      confirmed: [], stillClosing: [{ id: 'SIG-4', reason: 'not-on-default-branch' }], stale: ['SIG-4'],
    });
    expect(line).toBe(
      'Closes: 1 still closing (SIG-4: not-on-default-branch) · 1 closing over 14 days (SIG-4) — see /sig:docs-sweep',
    );
  });

  it('caps a long list and says how many more', () => {
    const ids = ['SIG-1', 'SIG-2', 'SIG-3', 'SIG-4', 'SIG-5', 'SIG-6', 'SIG-7'];
    const line = formatConfirmClosesLine({ confirmed: ids, stillClosing: [], stale: [] });
    expect(line).toBe(
      'Closes: confirmed 7 (SIG-1, SIG-2, SIG-3, SIG-4, SIG-5 and 2 more) — their records and the views changed; commit them',
    );
  });

  it('nothing to say → null', () => {
    expect(formatConfirmClosesLine({ confirmed: [], stillClosing: [], stale: [] })).toBeNull();
    expect(formatConfirmClosesLine(null)).toBeNull();
  });
});

describe('reportCloses — /sig:resume reports, and writes nothing (D-M6E13-21)', () => {
  it('v2: names what is ready to close and says how to close it; the store is unchanged', async () => {
    const { work } = await mixedClone();
    const before = snapshotTree(work);
    const out = reportCloses(work, { now: NOW });
    expect(out).toMatchObject({
      ran: true,
      ready: ['SIG-1'],
      stillClosing: [{ id: 'SIG-2', reason: 'not-on-default-branch' }],
      stale: [],
      error: null,
    });
    expect(out.line).toBe('Closes: 1 ready to close (SIG-1) — run /sig:docs-sweep or /sig:ship to confirm');
    expect(snapshotTree(work)).toEqual(before);
    expect(await lastEvent(work, 'SIG-1')).toBe('close_requested');
  });

  it('v2, nothing ready: no line', async () => {
    const { work } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created])]);
    expect(reportCloses(work, { now: NOW })).toEqual({ ran: true, ready: [], stillClosing: [], stale: [], error: null, line: null });
  });

  it('v1 store and store off: nothing, and git is not asked', async () => {
    const { work, shas } = await plantClone();
    await v1Store(work, shas[0]);
    const execFn = () => {
      throw new Error('git must not run');
    };
    const none = { ran: false, ready: [], stillClosing: [], stale: [], error: null, line: null };
    expect(reportCloses(work, { now: NOW, execFn })).toEqual(none);
    const off = join(root, 'off');
    await mkdir(off);
    expect(reportCloses(off, { now: NOW, execFn })).toEqual(none);
  });

  it('a broken WORK.md: never throws; says the closes were not checked', async () => {
    const dir = join(root, 'broken');
    await put(dir, '.planning/work/WORK.md', '---\nkey: [\n---\n');
    const out = reportCloses(dir, { now: NOW });
    expect(out.ran).toBe(false);
    expect(out.line).toMatch(/^Closes not checked — /);
  });

  it('formatCloseReportLine: a stale wait is named, a long list is capped, nothing → null', () => {
    expect(formatCloseReportLine({ ready: [], stillClosing: [{ id: 'SIG-4', reason: 'not-on-default-branch' }], stale: ['SIG-4'] }))
      .toBe('Closes: 1 closing over 14 days (SIG-4) — see /sig:docs-sweep');
    const ids = ['SIG-1', 'SIG-2', 'SIG-3', 'SIG-4', 'SIG-5', 'SIG-6'];
    expect(formatCloseReportLine({ ready: ids, stillClosing: [], stale: [] }))
      .toBe('Closes: 6 ready to close (SIG-1, SIG-2, SIG-3, SIG-4, SIG-5 and 1 more) — run /sig:docs-sweep or /sig:ship to confirm');
    expect(formatCloseReportLine({ ready: [], stillClosing: [], stale: [] })).toBeNull();
    expect(formatCloseReportLine(null)).toBeNull();
  });
});

describe('/sig:resume renders the line (renderResumeBriefing `closesLine`)', () => {
  const base = { state: { phase: 'EXECUTE', current_epic: null, completed_phases: [] }, profile: { tier: 'FULL' } };

  it('a line is rendered above the briefing body', () => {
    const line = 'Closes: 1 ready to close (SIG-1) — run /sig:docs-sweep or /sig:ship to confirm';
    const out = renderResumeBriefing({ ...base, closesLine: line });
    const lines = out.split('\n');
    const at = lines.indexOf(line);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(lines.indexOf('== Project Briefing =='));
  });

  it('no line → the briefing is unchanged', () => {
    expect(renderResumeBriefing({ ...base, closesLine: null })).toBe(renderResumeBriefing(base));
  });
});

describe('the sweep confirms closes — its one writing step (confirmClosesInSweep, D-M6E13-21)', () => {
  it('v2: confirms the merged fix, one advisory per confirmed item naming the record; the rest are left closing', async () => {
    const { work } = await mixedClone();
    const findings = await confirmClosesInSweep(work, { now: NOW });
    expect(findings).toEqual([
      {
        check: 'closes-confirmed',
        severity: 'advisory',
        file: records.recordPath('SIG-1'),
        message: 'SIG-1 confirmed closed — its fix commit is on the default branch. The sweep wrote its closed event '
          + 'and regenerated the views; commit them.',
      },
    ]);
    expect(await lastEvent(work, 'SIG-1')).toBe('closed');
    expect(await lastEvent(work, 'SIG-2')).toBe('close_requested');
    expect(await lastEvent(work, 'SIG-3')).toBe('created');
  });

  it('runSweep carries it, and a second run has nothing left to confirm', async () => {
    const { work } = await mixedClone();
    const first = await runSweep(work);
    expect(first.findings.filter((f) => f.check === 'closes-confirmed').map((f) => f.file)).toEqual([records.recordPath('SIG-1')]);
    expect(await lastEvent(work, 'SIG-1')).toBe('closed');
    const before = snapshotTree(work);
    const second = await runSweep(work);
    expect(second.findings.filter((f) => f.check === 'closes-confirmed')).toEqual([]);
    expect(snapshotTree(work)).toEqual(before);
  });

  it('v2, nothing confirmable: no finding and nothing written', async () => {
    const { work } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created])]);
    const before = snapshotTree(work);
    expect(await confirmClosesInSweep(work, { now: NOW })).toEqual([]);
    expect(snapshotTree(work)).toEqual(before);
  });

  it('v1 store and store off: nothing, nothing written, and git is not asked', async () => {
    const { work, shas } = await plantClone();
    await v1Store(work, shas[0]);
    const execFn = () => {
      throw new Error('git must not run');
    };
    const before = snapshotTree(work);
    expect(await confirmClosesInSweep(work, { now: NOW, execFn })).toEqual([]);
    expect(snapshotTree(work)).toEqual(before);
    const off = join(root, 'off');
    await mkdir(off);
    expect(await confirmClosesInSweep(off, { now: NOW, execFn })).toEqual([]);
  });

  it('a broken WORK.md: one advisory saying the closes were not checked', async () => {
    const dir = join(root, 'broken');
    await put(dir, '.planning/work/WORK.md', '---\nkey: [\n---\n');
    const findings = await confirmClosesInSweep(dir, { now: NOW });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ check: 'closes-confirmed', severity: 'advisory', file: '.planning/work/WORK.md' });
    expect(findings[0].message).toMatch(/^closes not checked — /);
  });

  it('confirmCloses failing (e.g. LOCKED): one advisory saying the closes were not confirmed; nothing closed', async () => {
    const { work } = await mixedClone();
    const confirm = async () => {
      const err = new Error('the work store is locked by another writer');
      err.code = 'LOCKED';
      throw err;
    };
    const findings = await confirmClosesInSweep(work, { now: NOW, confirm });
    expect(findings).toEqual([{
      check: 'closes-confirmed', severity: 'advisory', file: '.planning/work/WORK.md',
      message: 'closes not confirmed — the work store is locked by another writer',
    }]);
    expect(await lastEvent(work, 'SIG-1')).toBe('close_requested');
  });
});
