// Tests for M4.5.E11 (Epic-native flow). See .planning/M4.5.E11-PLAN.md.
//
// Grouped by slice/task. Each task's describe block is added RED-first.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  EPIC_ID_STRICT_RE,
  initState,
  readState,
  setCurrentEpic,
  setCurrentTask,
  StateWriteError,
} from '../tools/lib/state.js';
import { deriveRetroPath } from '../tools/lib/retrospective.js';
import { currentMilestone } from '../tools/lib/milestones.js';

// Write a COMPLETE schema_v1 STATE.md (all fields) so readStateForMutation
// accepts it — used where we need a non-null current_wave to prove the roll
// reset (initState only ever produces current_wave: null).
async function writeFullState(baseDir, { epic = null, wave = null, tasks = [] } = {}) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  const fm =
    `---\n` +
    `schema_version: 1\n` +
    `phase: EXECUTE\n` +
    `current_epic: ${epic === null ? 'null' : epic}\n` +
    `current_wave: ${wave === null ? 'null' : wave}\n` +
    `current_tasks: ${JSON.stringify(tasks)}\n` +
    `completed_phases:\n  - DISCUSS (2026-07-15)\n` +
    `blockers: []\n` +
    `---\n# State\n\nbody\n`;
  await writeFile(join(baseDir, '.planning', 'STATE.md'), fm, 'utf-8');
}

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

// ---- S1.t2 — setCurrentEpic (the current_epic write-half) ----
describe('S1.t2 setCurrentEpic', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-t2-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('writes a valid strict Epic ID to current_epic', async () => {
    await initState(baseDir, 'EXECUTE');
    await setCurrentEpic(baseDir, 'M4.5.E11');
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E11');
  });

  it.each(['v0.1.6', '', 'foo', 'M4.5', 'E9', '../x'])(
    'rejects invalid id %j BEFORE touching disk (STATE unchanged)',
    async (bad) => {
      await initState(baseDir, 'EXECUTE'); // current_epic starts null
      await expect(setCurrentEpic(baseDir, bad)).rejects.toBeInstanceOf(StateWriteError);
      const state = await readState(baseDir);
      expect(state.current_epic).toBeNull();
    },
  );

  it('rolling to a new Epic resets coupled current_wave + current_tasks', async () => {
    await writeFullState(baseDir, {
      epic: 'M4.5.E11',
      wave: 'M4.5.E11.S1',
      tasks: [{ id: 'M4.5.E11.S1.t9', epic: 'M4.5.E11', wave: null, status: 'in_progress', startedAt: '2026-07-15T00:00:00.000Z' }],
    });
    await setCurrentEpic(baseDir, 'M4.5.E12'); // roll
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E12');
    expect(state.current_wave).toBeNull();
    expect(state.current_tasks).toEqual([]);
  });

  it('is idempotent — re-setting the SAME id is a no-op (coupled fields preserved)', async () => {
    await writeFullState(baseDir, {
      epic: 'M4.5.E11',
      wave: 'M4.5.E11.S1',
      tasks: [{ id: 'M4.5.E11.S1.t9', epic: 'M4.5.E11', wave: null, status: 'in_progress', startedAt: '2026-07-15T00:00:00.000Z' }],
    });
    await setCurrentEpic(baseDir, 'M4.5.E11'); // same id
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E11');
    expect(state.current_wave).toBe('M4.5.E11.S1'); // NOT reset
    expect(state.current_tasks).toHaveLength(1); // NOT reset
  });

  it('preserves other frontmatter (phase, completed_phases, blockers)', async () => {
    await initState(baseDir, 'EXECUTE');
    await setCurrentEpic(baseDir, 'M4.5.E11');
    const state = await readState(baseDir);
    expect(state.phase).toBe('EXECUTE');
    expect(Array.isArray(state.completedPhases ?? state.completed_phases)).toBe(true);
    expect(state.blockers).toEqual([]);
  });
});
