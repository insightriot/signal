// Tests for milestone resolution helpers (M4.5.E2.S2.t2).
// See .planning/M4.5.E2-PLAN.md § "2026-05-30 RE-PLAN" → Slice 2 → S2.t2,
// and .planning/M4.5.E2-REQUIREMENTS.md FR2 (AC-FR2.5 decimal-aware id) +
// Decision 7 (--milestone semantics: no-N → current milestone from
// STATE.md current_epic; fails if none).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { currentMilestone, listMilestones } from '../tools/lib/milestones.js';

// Write a schema_version-1 STATE.md fixture with the given current_epic value.
// `epic` may be a string (quoted in YAML), the literal 'null', or omitted to
// leave the key out entirely.
async function writeState(baseDir, { epic } = {}) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  const epicLine =
    epic === undefined
      ? ''
      : epic === null
        ? 'current_epic: null\n'
        : `current_epic: ${epic}\n`;
  const frontmatter =
    `---\n` +
    `schema_version: 1\n` +
    `phase: EXECUTE\n` +
    epicLine +
    `current_tasks: []\n` +
    `completed_phases: []\n` +
    `blockers: []\n` +
    `---\n` +
    `# Project State\n\nbody\n`;
  await writeFile(join(baseDir, '.planning', 'STATE.md'), frontmatter, 'utf-8');
}

describe('currentMilestone', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-milestones-cur-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  const cases = [
    ['decimal milestone epic', 'M4.5.E2', 'MILESTONE-4.5.md'],
    ['integer milestone epic', 'M5.E1', 'MILESTONE-5.md'],
    ['single-digit milestone epic', 'M4.E8', 'MILESTONE-4.md'],
  ];

  for (const [label, epic, expected] of cases) {
    it(`resolves ${label}: current_epic "${epic}" -> "${expected}"`, async () => {
      await writeState(baseDir, { epic });
      expect(await currentMilestone(baseDir)).toBe(expected);
    });
  }

  it('returns null when current_epic does not match the M{n}.E{n} shape (e.g. "M4.t17")', async () => {
    await writeState(baseDir, { epic: 'M4.t17' });
    expect(await currentMilestone(baseDir)).toBeNull();
  });

  it('returns null when current_epic is explicitly null', async () => {
    await writeState(baseDir, { epic: null });
    expect(await currentMilestone(baseDir)).toBeNull();
  });

  it('returns null when current_epic key is absent', async () => {
    await writeState(baseDir, {});
    expect(await currentMilestone(baseDir)).toBeNull();
  });

  it('returns null when STATE.md is absent (readState -> null)', async () => {
    // baseDir has no .planning/STATE.md at all.
    expect(await currentMilestone(baseDir)).toBeNull();
  });
});

describe('listMilestones', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-milestones-list-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('lists matching milestone files decimal-sorted, excluding decoys', async () => {
    await mkdir(join(baseDir, '.planning'), { recursive: true });
    // Deliberately write out of order so the sort is exercised.
    for (const f of [
      'MILESTONE-5.md',
      'MILESTONE-1.md',
      'MILESTONE-4.5.md',
      'MILESTONE-4.md',
    ]) {
      await writeFile(join(baseDir, '.planning', f), `# ${f}\n`, 'utf-8');
    }
    // Decoys that must NOT match the MILESTONE-{n}.md regex.
    await writeFile(join(baseDir, '.planning', 'MILESTONE-notes.txt'), 'x', 'utf-8');
    await writeFile(join(baseDir, '.planning', 'PROJECT.md'), 'x', 'utf-8');

    const result = await listMilestones(baseDir);
    expect(result.map((m) => m.id)).toEqual(['1', '4', '4.5', '5']);
    // 4.5 must sort between 4 and 5 (decimal-aware via parseFloat comparator).
    expect(result.map((m) => m.file)).toEqual([
      'MILESTONE-1.md',
      'MILESTONE-4.md',
      'MILESTONE-4.5.md',
      'MILESTONE-5.md',
    ]);
    // id is the original string, not coerced to a number.
    expect(typeof result[2].id).toBe('string');
    expect(result[2].id).toBe('4.5');
  });

  it('returns [] when .planning/ is absent', async () => {
    // baseDir has no .planning/ directory.
    expect(await listMilestones(baseDir)).toEqual([]);
  });

  it('returns [] when .planning/ exists but has no milestone files', async () => {
    await mkdir(join(baseDir, '.planning'), { recursive: true });
    await writeFile(join(baseDir, '.planning', 'PROJECT.md'), 'x', 'utf-8');
    expect(await listMilestones(baseDir)).toEqual([]);
  });
});
