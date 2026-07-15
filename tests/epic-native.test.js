// Tests for M4.5.E11 (Epic-native flow). See .planning/M4.5.E11-PLAN.md.
//
// Grouped by slice/task. Each task's describe block is added RED-first.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { EPIC_ID_STRICT_RE } from '../tools/lib/state.js';
import { deriveRetroPath } from '../tools/lib/retrospective.js';
import { currentMilestone } from '../tools/lib/milestones.js';

// Reuse the milestones.test.js fixture shape: a schema_version-1 STATE.md with
// the given current_epic value.
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

// ---- S1.t1 — canonical strict Epic-ID validation regex (shared) ----
describe('S1.t1 EPIC_ID_STRICT_RE (canonical strict Epic-ID validator)', () => {
  const accepts = ['M4.E1', 'M4.5.E1', 'M4.5.E11', 'M5.E1', 'M5.E12', 'M10.E1'];
  const rejects = [
    'v0.1.6', // version string — the schism case
    '', // empty
    'E9', // bare epic
    'M4.5', // milestone, no epic
    'M4.5.E', // no epic number
    'M4.5.E1x', // trailing junk
    '../x', // path traversal
    'm4.5.e1', // lowercase
    'M4.5.E1 ', // trailing space
  ];

  for (const id of accepts) {
    it(`accepts ${JSON.stringify(id)}`, () => {
      expect(EPIC_ID_STRICT_RE.test(id)).toBe(true);
    });
  }
  for (const id of rejects) {
    it(`rejects ${JSON.stringify(id)}`, () => {
      expect(EPIC_ID_STRICT_RE.test(id)).toBe(false);
    });
  }

  it('is the same shape deriveRetroPath enforces (shared, not duplicated)', () => {
    // deriveRetroPath must accept exactly what EPIC_ID_STRICT_RE accepts.
    expect(deriveRetroPath('M4.5.E11')).toBe('.planning/M4.5.E11-RETROSPECTIVE.md');
    expect(() => deriveRetroPath('v0.1.6')).toThrow(/malformed/);
    expect(() => deriveRetroPath('E9')).toThrow(/malformed/);
  });
});

// ---- S1.t1 — writer-shape IDs round-trip through currentMilestone ----
describe('S1.t1 writer-shape (depth-2) Epic IDs parse in currentMilestone', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-t1-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  // Every depth-2 ID the writer can emit must resolve to a milestone (no null).
  const roundTrip = [
    ['M4.5.E12', 'MILESTONE-4.5.md'],
    ['M5.E1', 'MILESTONE-5.md'],
    ['M4.E8', 'MILESTONE-4.md'],
  ];
  for (const [epic, expected] of roundTrip) {
    it(`${epic} -> ${expected} (writer→currentMilestone round-trip)`, async () => {
      expect(EPIC_ID_STRICT_RE.test(epic)).toBe(true); // it's a legal writer ID
      await writeState(baseDir, { epic });
      expect(await currentMilestone(baseDir)).toBe(expected);
    });
  }
});
