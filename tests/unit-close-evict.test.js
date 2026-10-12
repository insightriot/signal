// M6.E16.S10.t10.1 — a unit's narrative leaves STATE.md when its close is
// confirmed (SIG-295, `D-M6E16-19`). See .planning/M6.E16-REQUIREMENTS.md AC4.7.
//
// With unit records SHIP §5.5 finds the Epic open or closing and evicts
// nothing, and `/sig:checkpoint` only looks at `current_epic` — which has
// moved on by the time the close is confirmed. So the step that confirms the
// close (`runConfirmCloses`, at SHIP and in the sweep) evicts, and says what
// it did. The whole path runs once with nothing stubbed — real git, a local
// bare repository as `origin`, the real locks:
//
//   openEpic → narrative in STATE.md → retrospective → commit on a branch
//   → closeEpic (close requested) → evictEpicNarrative (SHIP §5.5: not-closed)
//   → runConfirmCloses (still closing; nothing evicted)
//   → the branch reaches origin's default branch; openEpic rolls to the next Epic
//   → runConfirmCloses (closed; the narrative is in the archive, not STATE.md)
//
// Small synthetic repositories; the Epic names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeEpic, openEpic } from '../plugin/tools/lib/work-ops.js';
import { ensureUnitsDir, getUnit, holdUnit } from '../plugin/tools/lib/unit-records.js';
import { runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
import { confirmClosesInSweep } from '../plugin/tools/lib/sweep.js';
import { evictEpicNarrative } from '../plugin/tools/lib/evict.js';
import { parseFrontmatter } from '../plugin/tools/lib/state.js';

const EPIC = 'M7.E3';
const NEXT = 'M7.E4';
const by = 'claude';
const ARCHIVE_REL = '.planning/archive/M7/E3/STATE-NARRATIVE.md';

const SECTION = [
  `## ${EPIC} — The Epic`,
  '',
  'Shipped 2026-03-02. Decision D-M7E3-1 locked; AC1 verified.',
  '',
].join('\n');

const state = (currentEpic) => [
  '---',
  'schema_version: 1',
  'phase: SHIP',
  `current_epic: ${currentEpic}`,
  'current_wave: null',
  'current_tasks: []',
  'completed_phases: []',
  'blockers: []',
  'last_decision_at: null',
  'last_updated_commit: null',
  'last_updated: 2026-03-02T00:00:00.000Z',
  '---',
  '',
  '# Project State',
  '',
  '## In-flight',
  '',
  'Active work notes.',
  '',
  SECTION,
  '## Closed work',
  '',
  '- an older pointer',
  '',
].join('\n');

const RETRO = [
  `# ${EPIC} Retrospective`,
  '',
  '## Timeline',
  '',
  'Shipped 2026-03-02. Decision D-M7E3-1 locked. AC1 verified.',
  '',
  '## What surprised us',
  '',
  'Nothing.',
  '',
].join('\n');

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-unit-close-evict-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const readState = (work) => readFile(join(work, '.planning/STATE.md'), 'utf-8');

// A clone of a project on the work store with unit records, on a branch, with
// the Epic opened, its narrative in STATE.md, its retrospective written, and
// its close requested at SHIP. Returns the clone and the proof commit.
async function shippedEpic({ retro = RETRO } = {}) {
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  await mkdir(seed, { recursive: true });
  g(root, 'init', '-q', '--bare', '-b', 'main', origin);
  g(seed, 'init', '-q', '-b', 'main');
  await put(seed, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(seed, '.planning/STATE.md', state('null'));
  g(seed, 'add', '-A');
  g(seed, 'commit', '-q', '-m', 'a project on the work store');
  g(seed, 'remote', 'add', 'origin', origin);
  g(seed, 'push', '-q', '-u', 'origin', 'main');
  g(root, 'clone', '-q', origin, work);
  g(work, 'checkout', '-q', '-b', 'feat/the-epic');

  await ensureUnitsDir(work);
  expect(await openEpic(work, EPIC, { by })).toEqual({ epic: EPIC, unit: 'created' });
  await put(work, `.planning/${EPIC}-RETROSPECTIVE.md`, retro);
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'the Epic');
  const head = g(work, 'rev-parse', 'HEAD');

  // SHIP §5.5 runs before the close is requested, and again finds nothing to
  // do after it: a requested close is not a close.
  expect(await evictEpicNarrative(work, EPIC)).toEqual({ evicted: false, reason: 'not-closed' });
  expect(await closeEpic(work, EPIC, { by })).toMatchObject({ status: 'close-requested', commit: head });
  expect(await evictEpicNarrative(work, EPIC)).toEqual({ evicted: false, reason: 'not-closed' });
  return { work, head };
}

// The SHIP commit, then the merge: the branch reaches origin's default branch.
function merge(work) {
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'ship');
  g(work, 'push', '-q', 'origin', 'HEAD:main');
  g(work, 'fetch', '-q', 'origin');
}

describe('a unit\'s narrative is evicted when its close is confirmed (SIG-295, real git)', () => {
  it('ship → merge → the next Epic opens → confirm: the narrative is in its archive file, not STATE.md', async () => {
    const { work } = await shippedEpic();

    // SHIP §6.9, same run: still closing, so nothing is confirmed and nothing evicted.
    const first = await runConfirmCloses(work);
    expect(first.units.confirmed).toEqual([]);
    expect(first.evictions).toEqual([]);
    expect(first.evictionLine).toBeNull();
    expect(await readState(work)).toContain(SECTION);

    merge(work);
    // The usual order: the next Epic is opened before anything confirms the close.
    expect(await openEpic(work, NEXT, { by })).toEqual({ epic: NEXT, unit: 'created' });
    expect(parseFrontmatter(await readState(work)).data.current_epic).toBe(NEXT);
    expect(await readState(work)).toContain(SECTION);

    const second = await runConfirmCloses(work);
    expect(second.error).toBeNull();
    expect(second.units.confirmed).toEqual([EPIC]);
    // The `Closes:` line is the one it was; the narrative has its own.
    expect(second.line).toBe(`Closes: units — confirmed 1 (${EPIC}) — its record and the views changed; commit them`);
    expect(second.evictions).toEqual([{ id: EPIC, evicted: true, archivePath: ARCHIVE_REL }]);
    expect(second.evictionLine).toBe(`Narratives: ${EPIC} — moved out of STATE.md to ${ARCHIVE_REL}; commit both`);

    const after = await readState(work);
    expect(after).not.toContain(`## ${EPIC}`);
    expect(after).not.toContain('D-M7E3-1');
    expect(after).toContain(`- ${EPIC} — evicted to ${ARCHIVE_REL} · card: ${EPIC}-RETROSPECTIVE.md`);
    expect(parseFrontmatter(after).data.current_epic).toBe(NEXT);
    expect(await readFile(join(work, ARCHIVE_REL), 'utf-8')).toBe(SECTION);
    expect(getUnit(work, EPIC).status).toBe('closed');

    // A third run confirms nothing, so it evicts nothing and has nothing to say.
    const third = await runConfirmCloses(work);
    expect(third.units.confirmed).toEqual([]);
    expect(third.evictions).toEqual([]);
    expect(third.evictionLine).toBeNull();
    expect(await readState(work)).toBe(after);
    expect(await evictEpicNarrative(work, EPIC)).toEqual({ evicted: false, reason: 'no-section' });
  }, 60_000);

  it('the sweep confirms and evicts too, and its advisory for the unit names both files', async () => {
    const { work } = await shippedEpic();
    merge(work);
    await openEpic(work, NEXT, { by });

    const findings = await confirmClosesInSweep(work);
    expect(findings.map((f) => [f.check, f.file])).toEqual([['closes-confirmed', `.planning/work/units/${EPIC}.json`]]);
    expect(findings[0].message).toContain(`Its narrative was moved out of STATE.md to ${ARCHIVE_REL}`);
    expect(findings[0].message).toMatch(/commit them\.$/);
    expect(await readState(work)).not.toContain(`## ${EPIC}`);
    expect(await readFile(join(work, ARCHIVE_REL), 'utf-8')).toBe(SECTION);
    // A second sweep has nothing to confirm and says nothing.
    expect(await confirmClosesInSweep(work)).toEqual([]);
  }, 60_000);

  it('a held unit is confirmed closed and keeps its narrative; the hold reason is reported', async () => {
    const { work } = await shippedEpic();
    await holdUnit(work, EPIC, { reason: 'dormant until go-live', by });
    merge(work);
    await openEpic(work, NEXT, { by });

    const out = await runConfirmCloses(work);
    expect(out.units.confirmed).toEqual([EPIC]);
    expect(out.evictions).toEqual([{ id: EPIC, evicted: false, reason: 'held', holdReason: 'dormant until go-live' }]);
    expect(out.evictionLine).toBe(`Narratives: ${EPIC} — kept in STATE.md: the unit is held (dormant until go-live)`);
    expect(getUnit(work, EPIC).status).toBe('closed');
    expect(await readState(work)).toContain(SECTION);
    expect(existsSync(join(work, ARCHIVE_REL))).toBe(false);

    const findings = await confirmClosesInSweep(work);
    expect(findings).toEqual([]); // already confirmed: the sweep does not ask again
  }, 60_000);

  it('a retrospective that does not cover the narrative: the close stands, the narrative stays, and what is missing is named', async () => {
    const { work } = await shippedEpic({ retro: RETRO.replace('Decision D-M7E3-1 locked. ', '') });
    merge(work);
    await openEpic(work, NEXT, { by });

    const out = await runConfirmCloses(work);
    expect(out.error).toBeNull();
    expect(out.units.confirmed).toEqual([EPIC]);
    expect(out.evictions).toHaveLength(1);
    expect(out.evictions[0]).toMatchObject({ id: EPIC, evicted: false, reason: 'lossy-card' });
    expect(out.evictionLine).toMatch(new RegExp(`^Narratives: ${EPIC.replace('.', '\\.')} — kept in STATE\\.md: its retrospective does not cover it \\(missing: .*D-M7E3-1`));
    expect(getUnit(work, EPIC).status).toBe('closed');
    expect(await readState(work)).toContain(SECTION);
  }, 60_000);

  it('a project with no STATE.md section for the unit: the confirmation says there was nothing to move', async () => {
    const { work } = await shippedEpic();
    merge(work);
    await put(work, '.planning/STATE.md', state(EPIC).replace(SECTION, ''));

    const out = await runConfirmCloses(work);
    expect(out.units.confirmed).toEqual([EPIC]);
    expect(out.evictions).toEqual([{ id: EPIC, evicted: false, reason: 'no-section' }]);
    expect(out.evictionLine).toBe(`Narratives: ${EPIC} — nothing in STATE.md to move`);
    const findings = await confirmClosesInSweep(work);
    expect(findings).toEqual([]);
  }, 60_000);

  it('an eviction that throws is reported, and does not undo or fail the confirmation', async () => {
    const { work } = await shippedEpic();
    merge(work);
    const before = await readState(work);

    const out = await runConfirmCloses(work, {
      evict: async () => {
        throw new Error('the state lock is held');
      },
    });
    expect(out.ran).toBe(true);
    expect(out.error).toBeNull();
    expect(out.units.confirmed).toEqual([EPIC]);
    expect(out.evictions).toEqual([{ id: EPIC, evicted: false, reason: 'error', detail: 'the state lock is held' }]);
    expect(out.evictionLine).toBe(`Narratives: ${EPIC} — not moved: the state lock is held`);
    expect(getUnit(work, EPIC).status).toBe('closed');
    expect(await readState(work)).toBe(before);
  }, 60_000);
});
