// M6.E16.S4.t4.6 — closing an Epic through its unit record, end to end
// (FR4: AC4.1, AC4.2, AC4.4). See .planning/M6.E16-VALIDATION.md.
//
// `closeEpic` returned `no-folder` for every Epic since M6.E11: it has never
// recorded a close on a v2 store. This runs the whole path once with nothing
// stubbed — real git, a local bare repository as `origin`, the real lock, the
// real view regeneration:
//
//   ensureUnitsDir → openUnit → write the retrospective → commit on a branch
//   → closeEpic (close requested, the unit reads closing)
//   → runConfirmCloses (still closing: the commit is not on origin's default branch)
//   → push the branch to origin's default branch, fetch
//   → runConfirmCloses (closed)
//
// A small synthetic repository; the Epic name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import { ensureUnitsDir, getUnit, hasUnits, openUnit, unitClosure, checkUnits } from '../plugin/tools/lib/unit-records.js';
import { runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';

const EPIC = 'M7.E3';
const by = 'claude';
const UNIT_REL = `.planning/work/units/${EPIC}.json`;

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-unit-close-e2e-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

describe('an Epic is closed through its unit record, end to end (real git)', () => {
  it('requested at SHIP, still closing until the commit is on origin\'s default branch, then closed', async () => {
    // A local bare repository as origin, with one commit on main, and a clone.
    const origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const work = join(root, 'work');
    await mkdir(seed, { recursive: true });
    g(root, 'init', '-q', '--bare', '-b', 'main', origin);
    g(seed, 'init', '-q', '-b', 'main');
    await put(seed, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    g(seed, 'add', '-A');
    g(seed, 'commit', '-q', '-m', 'a project on the work store');
    g(seed, 'remote', 'add', 'origin', origin);
    g(seed, 'push', '-q', '-u', 'origin', 'main');
    g(root, 'clone', '-q', origin, work);
    g(work, 'checkout', '-q', '-b', 'feat/the-epic');

    // Unit records are turned on, the Epic is opened, and its work is done.
    expect(hasUnits(work)).toBe(false);
    expect(await ensureUnitsDir(work)).toEqual({ path: '.planning/work/units', created: true, keep: true });
    expect(hasUnits(work)).toBe(true);
    expect(await openUnit(work, EPIC, { title: 'The Epic', by })).toMatchObject({ status: 'open' });
    await put(work, `.planning/${EPIC}-RETROSPECTIVE.md`, '# Retrospective\n\n## Timeline\n\nBuilt in a day.\n\n## What surprised us\n\nNothing.\n');
    await regenerateViews(work);
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'the Epic');
    const head = g(work, 'rev-parse', 'HEAD');

    // SHIP §6.8: the close is requested, with the branch HEAD as proof. There
    // is no Epic folder and none is needed (AC4.4).
    expect(existsSync(join(work, `.planning/work/epics/${EPIC}`))).toBe(false);
    const requested = await closeEpic(work, EPIC, { by, pr: '#412', release: 'v9.9.9' });
    expect(requested).toMatchObject({ status: 'close-requested', commit: head, created: false, unit: { status: 'closing', closing_proof: head } });
    expect(getUnit(work, EPIC).status).toBe('closing');
    expect(unitClosure(work, EPIC)).toBe('open'); // requested is not closed

    // SHIP §6.9, same run: the commit is on the branch only.
    const first = await runConfirmCloses(work);
    expect(first.error).toBeNull();
    expect(first.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'not-on-default-branch' }], stale: [] });
    expect(first.line).toBe(`Closes: units — 1 still closing (${EPIC}: not-on-default-branch)`);
    expect(getUnit(work, EPIC).status).toBe('closing');

    // The SHIP commit, then the merge: the branch reaches origin's default branch.
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'ship');
    g(work, 'push', '-q', 'origin', 'HEAD:main');
    // A push updates the remote-tracking ref; the fetch is what /sig:resume does first.
    g(work, 'fetch', '-q', 'origin');
    expect(g(work, 'merge-base', '--is-ancestor', head, 'refs/remotes/origin/main') === '').toBe(true);

    const second = await runConfirmCloses(work);
    expect(second.error).toBeNull();
    expect(second.units).toEqual({ confirmed: [EPIC], stillClosing: [], stale: [] });
    expect(second.line).toBe(`Closes: units — confirmed 1 (${EPIC}) — its record and the views changed; commit them`);

    const unit = getUnit(work, EPIC);
    expect(unit.status).toBe('closed');
    expect(unit.close).toMatchObject({ reason: 'shipped', by: 'confirmCloses', proof: head, pr: '#412', release: 'v9.9.9' });
    expect(unit.record.events.map((e) => e.type)).toEqual(['opened', 'close_requested', 'closed']);
    expect(unitClosure(work, EPIC)).toBe('closed');
    expect(checkUnits(work)).toEqual([]);
    expect(records.checkRecords(work)).toEqual([]);
    // The unit's record is left to commit — and, since S5 (t5.1), EPICS.md, which now shows it closed.
    expect(g(work, 'status', '--porcelain')).toBe(`M .planning/work/EPICS.md\n M ${UNIT_REL}`);

    // A third run has nothing to do, and a closed unit is not closed twice.
    const third = await runConfirmCloses(work);
    expect(third.line).toBeNull();
    expect(await closeEpic(work, EPIC, { by })).toMatchObject({ status: 'already-closed' });
  }, 60_000);
});
