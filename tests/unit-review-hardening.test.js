// M6.E16 REVIEW pass 1 — S-L3 (Windows device names are not unit IDs) and
// S-L5 (replace refs do not decide whether a commit is on the default branch).
// See .planning/M6.E16-VALIDATION.md rows "S-L3" and "S-L5".
//
// Temp folders and temp git repositories, real git. Unit names are invented.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { isReservedDeviceName, isSafeUnitName } from '../plugin/tools/lib/unit-name.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { ancestryFailure } from '../plugin/tools/lib/work-write.js';

const AT = '2026-10-12T10:00:00.000Z';
const NOW = '2026-10-13T12:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const made = [];
afterEach(() => {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'sig-unit-hardening-'));
  made.push(dir);
  return dir;
}
function put(dir, rel, content) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}
function store(dir, unitRecords = []) {
  put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  put(dir, `${UNITS}/.keep`, '');
  for (const [id, events] of unitRecords) put(dir, `${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
}
function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const RESERVED = ['CON', 'con', 'PRN', 'Aux', 'NUL', 'nul', 'COM1', 'com9', 'LPT1', 'lpt9', 'NUL.txt', 'con.notes', 'Aux.E1', 'COM1.5', 'nul.tar.gz'];
const NOT_RESERVED = ['CONSOLE', 'COM0', 'COM10', 'LPT', 'LPT10', 'NULL', 'AUXILIARY', 'M6.E16', 'v0.1.6', 'phase-11', 'GATE-A', 'M6.CON', 'x-nul', 'CON-1', 'PRN_2'];

describe('S-L3 — a Windows device name is not a unit ID', () => {
  it.each(RESERVED)('%s is a device name', (name) => {
    expect(isReservedDeviceName(name)).toBe(true);
  });

  it.each(NOT_RESERVED)('%s is not', (name) => {
    expect(isReservedDeviceName(name)).toBe(false);
  });

  it('the archive\'s rule is unchanged: isSafeUnitName still accepts the shape (a project without unit records, AC6.4)', () => {
    for (const name of RESERVED) expect(isSafeUnitName(name), name).toBe(true);
    for (const v of [null, undefined, 7, {}]) expect(isReservedDeviceName(v)).toBe(false);
  });

  it.each(RESERVED)('assertUnitId refuses %s (SCHEMA) and says why', (name) => {
    const base = temp();
    store(base);
    let err = null;
    try {
      units.assertUnitId(base, name);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'SCHEMA' });
    expect(err.message).toContain('is a device name on Windows');
  });

  it.each(NOT_RESERVED)('assertUnitId accepts %s', (name) => {
    const base = temp();
    store(base);
    expect(() => units.assertUnitId(base, name)).not.toThrow();
  });

  it('openUnit and importUnits refuse one and write nothing', async () => {
    const base = temp();
    store(base);
    await expect(units.openUnit(base, 'nul', { by, at: AT }, { regenerate: async () => {} })).rejects.toMatchObject({ code: 'SCHEMA' });
    await expect(units.importUnits(base, [{ id: 'M7.E1', opened: { at: AT, by } }, { id: 'Com1.E2', opened: { at: AT, by } }], { regenerate: async () => {} }))
      .rejects.toMatchObject({ code: 'SCHEMA' });
    expect(units.listUnits(base)).toEqual({ units: [], broken: [] });
  });

  it('a record that got onto the disk under one is reported by checkUnits as invalid', () => {
    const base = temp();
    store(base, [['aux.E1', [{ type: 'opened', at: AT, by }]]]);
    const found = units.checkUnits(base);
    expect(found.map((f) => [f.code, f.id])).toEqual([['invalid', 'aux.E1']]);
    expect(found[0].message).toContain('is a device name on Windows');
  });
});

// A bare remote with one commit on main, a clone of it, and in the clone:
// an unmerged commit, and a replace ref that makes the commit on origin/main
// stand for a commit whose parent is the unmerged one.
function plantReplaced() {
  const root = temp();
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  mkdirSync(seed);
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  g(seed, 'init', '-q', '-b', 'main');
  g(seed, 'commit', '-q', '--allow-empty', '-m', 'on main');
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-q', '-u', 'origin', 'main');
  g(root, 'clone', '-q', remote, work);
  const merged = g(work, 'rev-parse', 'refs/remotes/origin/main');
  g(work, 'checkout', '-q', '-b', 'feat/unmerged');
  g(work, 'commit', '-q', '--allow-empty', '-m', 'never merged');
  const unmerged = g(work, 'rev-parse', 'HEAD');
  g(work, 'commit', '-q', '--allow-empty', '-m', 'stands in for the commit on main');
  const standIn = g(work, 'rev-parse', 'HEAD');
  g(work, 'replace', merged, standIn);
  return { work, merged, unmerged };
}

describe('S-L5 — a replace ref does not put a commit on the default branch', () => {
  it('the fixture is real: with replace refs honoured, git calls the unmerged commit an ancestor of origin/main', () => {
    const { work, unmerged } = plantReplaced();
    const honoured = spawnSync('git', ['merge-base', '--is-ancestor', unmerged, 'refs/remotes/origin/main'], { cwd: work, env: GIT_ENV });
    expect(honoured.status).toBe(0);
    const ignored = spawnSync('git', ['merge-base', '--is-ancestor', unmerged, 'refs/remotes/origin/main'], { cwd: work, env: { ...GIT_ENV, GIT_NO_REPLACE_OBJECTS: '1' } });
    expect(ignored.status).toBe(1);
  });

  it('ancestryFailure answers not-on-default-branch for it, and still null for the commit that is there', () => {
    const { work, merged, unmerged } = plantReplaced();
    expect(ancestryFailure(work, unmerged, 'refs/remotes/origin/main', execFileSync, () => false)).toBe('not-on-default-branch');
    expect(ancestryFailure(work, merged, 'refs/remotes/origin/main', execFileSync, () => false)).toBeNull();
  });

  it('confirmCloses leaves a unit closing on the unmerged commit, and its record byte-identical', async () => {
    const { work, unmerged } = plantReplaced();
    store(work, [['M7.E3', [{ type: 'opened', at: AT, by }, { type: 'close_requested', at: AT, by, proof: unmerged }]]]);
    const before = readFileSync(join(work, UNITS, 'M7.E3.json'), 'utf-8');
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: 'M7.E3', reason: 'not-on-default-branch' }], stale: [] });
    expect(readFileSync(join(work, UNITS, 'M7.E3.json'), 'utf-8')).toBe(before);
    expect(units.getUnit(work, 'M7.E3').status).toBe('closing');
  });
});
