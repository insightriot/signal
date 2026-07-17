// M5.E2.S1.t0 — B9: setCurrentEpic roll-reset.
//
// The bug (BUGS.md B9, confirmed): rolling to a NEW Epic via setCurrentEpic
// left the PREVIOUS Epic's phase / completed_phases / last_completed_task in
// place, so /sig:resume reported a fresh Epic as still sitting at the old
// Epic's SHIP with the old Epic's completed phases. phase and completed_phases
// are PER-EPIC; a roll must reset them (+ the last-completed-task pointer).
//
// Design pin (plan): `phase: null` IS a valid state ("no phase yet" — the
// uncalibrated/unbegun state /sig:resume already handles); the CALLER
// (discuss/new-project) sets the real phase immediately after the roll.
// blockers are NOT per-Epic — a blocker can legitimately span Epics — so they
// survive the roll.
//
// Proof-of-fail (strict Nyquist): these assertions FAIL on the pre-fix
// no-reset implementation (phase/completed_phases/last_completed_task stayed
// stale). A gate that never resets can't pass them.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readState, setCurrentEpic } from '../tools/lib/state.js';

// Write a COMPLETE schema_v1 STATE.md that looks like a just-SHIPPED Epic:
// a progressed phase, an accumulated per-Epic completed_phases, a
// last_completed_task pointer, and (optionally) a live blocker + in-flight
// wave/tasks — i.e. every field a roll must reconcile.
async function writeShippedEpicState(baseDir, { epic = 'M5.E1' } = {}) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  const fm =
    `---\n` +
    `schema_version: 1\n` +
    `phase: SHIP\n` +
    `current_epic: ${epic}\n` +
    `current_wave: ${epic}.S5\n` +
    `current_tasks:\n  - id: ${epic}.S5.t9\n    epic: ${epic}\n    wave: null\n    status: in_progress\n    startedAt: 2026-07-16T00:00:00.000Z\n` +
    `completed_phases:\n` +
    `  - DISCUSS (2026-07-16)\n` +
    `  - PLAN (2026-07-16)\n` +
    `  - EXECUTE (2026-07-16)\n` +
    `  - VERIFY (2026-07-16)\n` +
    `  - REVIEW (2026-07-16)\n` +
    `  - SHIP (2026-07-16)\n` +
    `blockers:\n  - id: blk-abcd\n    text: cross-Epic blocker that outlives ${epic}\n    raisedAt: 2026-07-16T00:00:00.000Z\n` +
    `last_completed_task:\n  id: ${epic}.S5.t9\n  status: done\n  commit: abc1234\n  completedAt: 2026-07-16T00:00:00.000Z\n` +
    `last_decision_at: 2026-07-16T00:00:00.000Z\n` +
    `last_updated_commit: abc1234\n` +
    `last_updated: 2026-07-16T00:00:00.000Z\n` +
    `---\n# Project State\n\nbody\n`;
  await writeFile(join(baseDir, '.planning', 'STATE.md'), fm, 'utf-8');
}

describe('M5.E2.S1.t0 setCurrentEpic roll-reset (B9)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-b9-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('rolling to a NEW Epic resets phase → null (per-Epic; caller sets it next)', async () => {
    await writeShippedEpicState(baseDir, { epic: 'M5.E1' });
    await setCurrentEpic(baseDir, 'M5.E2'); // roll
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M5.E2');
    // The load-bearing B9 assertion: the previous Epic's SHIP must not carry over.
    expect(state.phase).toBeNull();
  });

  it('rolling resets completed_phases → [] (per-Epic; no stale-Epic leakage)', async () => {
    await writeShippedEpicState(baseDir, { epic: 'M5.E1' });
    await setCurrentEpic(baseDir, 'M5.E2'); // roll
    const state = await readState(baseDir);
    expect(state.completed_phases).toEqual([]);
    // camelCase alias mirrors it (readState exposes both).
    expect(state.completedPhases).toEqual([]);
  });

  it('rolling resets last_completed_task → null (the pointer is per-Epic)', async () => {
    await writeShippedEpicState(baseDir, { epic: 'M5.E1' });
    await setCurrentEpic(baseDir, 'M5.E2'); // roll
    const state = await readState(baseDir);
    expect(state.last_completed_task).toBeNull();
  });

  it('rolling also resets the already-coupled current_wave + current_tasks (unchanged E11 behavior, asserted together)', async () => {
    await writeShippedEpicState(baseDir, { epic: 'M5.E1' });
    await setCurrentEpic(baseDir, 'M5.E2'); // roll
    const state = await readState(baseDir);
    expect(state.current_wave).toBeNull();
    expect(state.current_tasks).toEqual([]);
  });

  it('does NOT reset blockers — a blocker can span Epics (preserved across the roll)', async () => {
    await writeShippedEpicState(baseDir, { epic: 'M5.E1' });
    await setCurrentEpic(baseDir, 'M5.E2'); // roll
    const state = await readState(baseDir);
    expect(state.blockers).toHaveLength(1);
    expect(state.blockers[0].id).toBe('blk-abcd');
  });

  it('is idempotent — re-setting the SAME id resets NOTHING (phase/completed/last_completed preserved)', async () => {
    await writeShippedEpicState(baseDir, { epic: 'M5.E1' });
    await setCurrentEpic(baseDir, 'M5.E1'); // same id — no roll
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M5.E1');
    expect(state.phase).toBe('SHIP'); // NOT reset — the guard is a roll, not any call
    expect(state.completed_phases).toHaveLength(6);
    expect(state.last_completed_task).not.toBeNull();
    expect(state.current_wave).toBe('M5.E1.S5'); // coupled fields also preserved
    expect(state.current_tasks).toHaveLength(1);
  });

  it('first-open (null → value) is a change → also resets phase → null + completed_phases → []', async () => {
    // A first-open from linear mode still routes through the roll branch (any
    // change fires it); the caller sets the real phase next, so phase → null is
    // correct here too. This is the new-project --epic / discuss --epic path.
    await mkdir(join(baseDir, '.planning'), { recursive: true });
    await writeFile(
      join(baseDir, '.planning', 'STATE.md'),
      `---\nschema_version: 1\nphase: CALIBRATE\ncurrent_epic: null\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\nlast_updated: 2026-07-16T00:00:00.000Z\n---\n# Project State\n\nbody\n`,
      'utf-8',
    );
    await setCurrentEpic(baseDir, 'M5.E1'); // null → value
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M5.E1');
    expect(state.phase).toBeNull();
    expect(state.completed_phases).toEqual([]);
  });
});
