import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evictEpicNarrative, extractEpicSection } from '../tools/lib/evict.js';

const FRONTMATTER = [
  '---',
  'schema_version: 1',
  'phase: SHIP',
  'current_epic: M5.E1',
  'current_wave: null',
  'current_tasks: []',
  'completed_phases: []',
  'blockers: []',
  'last_decision_at: null',
  'last_updated_commit: null',
  'last_updated: 2026-07-16T00:00:00.000Z',
  '---',
].join('\n');

const BODY = [
  '',
  '# Project State',
  '',
  '## In-flight',
  '',
  'Active work notes.',
  '',
  '## M4.5.E11 — Epic-native flow',
  '',
  'Closed narrative for E11. Decision D-E11-4. Shipped 2026-07-15.',
  '',
  '## M5.E1 — Doc-runtime & memory hygiene',
  '',
  'Shipped 2026-07-16. Decisions D-M5E1-1, D-M5E1-3, D-M5E1-6 locked.',
  'FR1 + FR2b delivered; AC1 and AC3 verified.',
  '- Carry-over: derived-vs-hand-curated INDEX conflict is deferred to E2 (still open).',
  '',
  '## Closed work',
  '',
  '- existing pointer',
  '',
].join('\n');

const GOLDEN_RETRO = [
  '# M5.E1 Retrospective',
  'Outcome: doc-runtime model shipped 2026-07-16 (M5.E1).',
  'Decisions D-M5E1-1, D-M5E1-3, D-M5E1-6 locked. FR1 + FR2b done. AC1, AC3 verified.',
  'Open carry-over deferred to E2: derived-vs-hand-curated INDEX.',
].join('\n');

const LOSSY_RETRO = [
  '# M5.E1 Retrospective',
  'Outcome: doc-runtime model shipped (M5.E1).',
  'Decisions D-M5E1-1, D-M5E1-6 locked. FR1 + FR2b done. AC1 verified.',
].join('\n');

describe('evictEpicNarrative (FR2b)', () => {
  let baseDir;
  let planningDir;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-evict-'));
    planningDir = join(baseDir, '.planning');
    await mkdir(planningDir, { recursive: true });
    await writeFile(join(planningDir, 'STATE.md'), FRONTMATTER + '\n' + BODY, 'utf-8');
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  async function writeRetro(content) {
    await writeFile(join(planningDir, 'M5.E1-RETROSPECTIVE.md'), content, 'utf-8');
  }
  const readState = () => readFile(join(planningDir, 'STATE.md'), 'utf-8');

  it('evicts a closed Epic: narrative → archive, pointer in STATE (AC1)', async () => {
    await writeRetro(GOLDEN_RETRO);
    const result = await evictEpicNarrative(baseDir, 'M5.E1');
    expect(result.evicted).toBe(true);
    expect(result.archivePath).toBe('.planning/archive/M5/E1/STATE-NARRATIVE.md');

    const state = await readState();
    // live narrative gone, replaced by a pointer
    expect(state).not.toContain('FR1 + FR2b delivered');
    expect(state).toContain('evicted to .planning/archive/M5/E1/STATE-NARRATIVE.md');
    expect(state).toContain('card: M5.E1-RETROSPECTIVE.md');
  });

  it('routes the eviction pointer under "## Closed work", not the previous Epic (REVIEW I-2)', async () => {
    await writeRetro(GOLDEN_RETRO);
    await evictEpicNarrative(baseDir, 'M5.E1');
    const state = await readState();
    const closedIdx = state.indexOf('## Closed work');
    const pointerIdx = state.indexOf('evicted to .planning/archive/M5/E1');
    expect(closedIdx).toBeGreaterThanOrEqual(0);
    // pointer sits UNDER "## Closed work" (its advertised home), not orphaned
    // in-situ under the previous Epic's "## M4.5.E11" heading.
    expect(pointerIdx).toBeGreaterThan(closedIdx);
    // the old M5.E1 heading is gone from the live body
    expect(state).not.toContain('## M5.E1 — Doc-runtime');
  });

  it('archives the original byte-identical (AC5, zero-loss)', async () => {
    await writeRetro(GOLDEN_RETRO);
    // what extractEpicSection sees pre-eviction is what must land in archive
    const { body } = { body: BODY };
    const sec = extractEpicSection(body, 'M5.E1');
    await evictEpicNarrative(baseDir, 'M5.E1');
    const archived = await readFile(
      join(baseDir, '.planning/archive/M5/E1/STATE-NARRATIVE.md'),
      'utf-8'
    );
    expect(archived).toBe(sec.section);
    expect(archived).toContain('## M5.E1 — Doc-runtime & memory hygiene');
    expect(archived).toContain('Carry-over: derived-vs-hand-curated INDEX');
  });

  it('leaves the other Epic block byte-identical (AC2)', async () => {
    await writeRetro(GOLDEN_RETRO);
    await evictEpicNarrative(baseDir, 'M5.E1');
    const state = await readState();
    expect(state).toContain('## M4.5.E11 — Epic-native flow');
    expect(state).toContain('Closed narrative for E11. Decision D-E11-4. Shipped 2026-07-15.');
  });

  it('lifts the open carry-over into a live section (AC4)', async () => {
    await writeRetro(GOLDEN_RETRO);
    const result = await evictEpicNarrative(baseDir, 'M5.E1');
    expect(result.carriedOver.length).toBeGreaterThan(0);
    const state = await readState();
    expect(state).toContain('[carried from M5.E1]');
    // the lifted line sits under the live "## In-flight" heading, above the pointer
    const inFlightIdx = state.indexOf('## In-flight');
    const carriedIdx = state.indexOf('[carried from M5.E1]');
    const pointerIdx = state.indexOf('evicted to .planning/archive');
    expect(inFlightIdx).toBeGreaterThanOrEqual(0);
    expect(carriedIdx).toBeGreaterThan(inFlightIdx);
    expect(carriedIdx).toBeLessThan(pointerIdx);
  });

  it('preserves frontmatter (current_epic etc.) across eviction', async () => {
    await writeRetro(GOLDEN_RETRO);
    await evictEpicNarrative(baseDir, 'M5.E1');
    const state = await readState();
    expect(state).toContain('current_epic: M5.E1');
    expect(state).toContain('schema_version: 1');
  });

  it('REFUSES a lossy card — no eviction, STATE untouched (AC3)', async () => {
    await writeRetro(LOSSY_RETRO);
    const before = await readState();
    const result = await evictEpicNarrative(baseDir, 'M5.E1');
    expect(result.evicted).toBe(false);
    expect(result.reason).toBe('lossy-card');
    expect(result.missing.ids).toContain('D-M5E1-3');
    // STATE.md unchanged; no archive file written
    expect(await readState()).toBe(before);
    expect(existsSync(join(baseDir, '.planning/archive/M5/E1/STATE-NARRATIVE.md'))).toBe(false);
  });

  it('REFUSES when the Epic is not closed — no retrospective (closed-vs-live)', async () => {
    // no retro written
    const before = await readState();
    const result = await evictEpicNarrative(baseDir, 'M5.E1');
    expect(result.evicted).toBe(false);
    expect(result.reason).toBe('not-closed');
    expect(await readState()).toBe(before);
  });

  it('is a safe no-op when the Epic has no narrative block', async () => {
    await writeRetro(GOLDEN_RETRO);
    const result = await evictEpicNarrative(baseDir, 'M9.E9');
    expect(result.evicted).toBe(false);
    expect(result.reason).toBe('no-section');
  });
});

// M5.E4.T1.2 (B14 / FR2) — Site A: the archive write must refuse a checked-in
// DIRECTORY symlink under .planning/. The lexical guard (evict.js:350) passes on
// the POSIX dest `.planning/archive/M5/E1/…` while the real mkdir/atomicWrite
// follow `.planning/archive` (a symlink) OUT of the tree. The realpath re-assert
// closes it: RED (lexical only) lets the narrative escape; GREEN refuses.
describe('evictEpicNarrative — realpath confinement against a directory-symlink escape (Site A)', () => {
  let baseDir;
  let planningDir;
  let outside;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-evict-symlink-'));
    planningDir = join(baseDir, '.planning');
    await mkdir(planningDir, { recursive: true });
    // A real, EMPTY sibling dir OUTSIDE the repo — the attacker's escape target.
    outside = await mkdtemp(join(tmpdir(), 'signal-evict-escape-target-'));
    await writeFile(join(planningDir, 'STATE.md'), FRONTMATTER + '\n' + BODY, 'utf-8');
    // Closed signal: a GOLDEN (non-lossy) retro so the coverage gate passes and
    // eviction reaches the archive write under test.
    await writeFile(join(planningDir, 'M5.E1-RETROSPECTIVE.md'), GOLDEN_RETRO, 'utf-8');
    // The hostile artifact: .planning/archive is a checked-in DIRECTORY symlink to
    // an out-of-repo dir. deriveEpicArchiveDir → .planning/archive/M5/E1/… , so the
    // mkdir + atomicWrite traverse this link.
    await symlink(outside, join(planningDir, 'archive'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('REFUSES the eviction — nothing written outside the tree, STATE untouched', async () => {
    const stateBefore = await readFile(join(planningDir, 'STATE.md'), 'utf-8');

    let threw = false;
    try {
      await evictEpicNarrative(baseDir, 'M5.E1');
    } catch {
      threw = true;
    }

    // RED (lexical guard only): mkdir/atomicWrite follow the symlink → the
    // narrative lands in <outside>/M5/E1/STATE-NARRATIVE.md → readdir non-empty.
    expect(await readdir(outside)).toEqual([]); // NOTHING escaped the tree
    expect(threw).toBe(true); // the eviction REFUSED (threw before writing)
    // STATE.md is never rewritten (the archive write precedes the pointer splice).
    expect(await readFile(join(planningDir, 'STATE.md'), 'utf-8')).toBe(stateBefore);
  });
});
