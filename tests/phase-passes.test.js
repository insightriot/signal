// M6.E17 S2 — a VERIFY or REVIEW pass is recorded when it ends, and counted.
//
// The defect (M6.E16 retrospective): REVIEW ran four full passes and a narrow
// one, and `loopStatusFor(state, 'REVIEW')` read 0 throughout — the count came
// only from `completed_phases`, which records a phase when it is LEFT, and the
// fix rounds never left REVIEW. `/sig:drive` reads the same count and would
// have looped. Decisions D-M6E17-1 (record each pass; count = larger of passes
// and exits), D-M6E17-5 (VERIFY counts the same way), D-M6E17-6 (an unreadable
// pass record stops the driver).
//
// Proof-of-fail: every test here fails before S2 — `recordPass` and
// `countPhasePasses` do not exist, and `loopStatusFor` ignores `phase_passes`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readState, recordPass, setCurrentEpic } from '../plugin/tools/lib/state.js';
import { countPhasePasses, loopStatusFor } from '../plugin/tools/lib/loop-ceiling.js';
import { canProceedUnattended } from '../plugin/tools/lib/drive.js';

const unattended = { rigor_overrides: { attention: 'unattended' } };

async function writeState(baseDir, { epic = 'M6.E16', phase = 'REVIEW', extra = '' } = {}) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  const fm =
    `---\n` +
    `schema_version: 1\n` +
    `phase: ${phase}\n` +
    `current_epic: ${epic}\n` +
    `current_wave: null\n` +
    `current_tasks: []\n` +
    `completed_phases:\n` +
    `  - DISCUSS (2026-10-10)\n` +
    `  - PLAN (2026-10-10)\n` +
    `  - EXECUTE (2026-10-11)\n` +
    `  - VERIFY (2026-10-11)\n` +
    `blockers: []\n` +
    `last_completed_task: null\n` +
    extra +
    `last_updated: 2026-10-11T00:00:00.000Z\n` +
    `---\n# Project State\n\nbody\n`;
  await writeFile(join(baseDir, '.planning', 'STATE.md'), fm, 'utf-8');
}

describe('AC1.1 — recordPass', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-passes-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('appends "<PHASE> <VERDICT> (<date>)" to phase_passes', async () => {
    await writeState(baseDir);
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12' });
    await recordPass(baseDir, 'REVIEW', 'PASS-WITH-FIXES', { date: '2026-10-13' });
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual([
      'REVIEW FAIL (2026-10-12)',
      'REVIEW PASS-WITH-FIXES (2026-10-13)',
    ]);
  });

  it('leaves every other field as it was', async () => {
    await writeState(baseDir);
    const before = await readState(baseDir);
    await recordPass(baseDir, 'VERIFY', 'PASS', { date: '2026-10-12' });
    const after = await readState(baseDir);
    expect(after.phase).toBe(before.phase);
    expect(after.current_epic).toBe(before.current_epic);
    expect(after.completed_phases).toEqual(before.completed_phases);
  });

  it('defaults the date to today, in the same form as completed_phases', async () => {
    await writeState(baseDir);
    await recordPass(baseDir, 'VERIFY', 'PASS');
    const state = await readState(baseDir);
    expect(state.phase_passes[0]).toMatch(/^VERIFY PASS \(\d{4}-\d{2}-\d{2}\)$/);
  });

  it('refuses a phase that does not loop', async () => {
    await writeState(baseDir);
    await expect(recordPass(baseDir, 'EXECUTE', 'PASS')).rejects.toThrow(/EXECUTE/);
    const state = await readState(baseDir);
    expect(state.phase_passes).toBeUndefined();
  });

  it('refuses a verdict outside PASS / PASS-WITH-FIXES / FAIL', async () => {
    await writeState(baseDir);
    await expect(recordPass(baseDir, 'REVIEW', 'MAYBE')).rejects.toThrow(/MAYBE/);
    await expect(recordPass(baseDir, 'REVIEW', 'pass')).rejects.toThrow();
  });

  it('refuses a date that is not YYYY-MM-DD', async () => {
    await writeState(baseDir);
    await expect(recordPass(baseDir, 'REVIEW', 'PASS', { date: 'yesterday' })).rejects.toThrow(
      /date/
    );
  });

  it('refuses to append onto a phase_passes that is not a list', async () => {
    await writeState(baseDir, { extra: `phase_passes: broken\n` });
    await expect(recordPass(baseDir, 'REVIEW', 'FAIL')).rejects.toThrow(/phase_passes/);
  });
});

describe('AC1.2 / AC1.5 — countPhasePasses and loopStatusFor', () => {
  const exits = (phase, n) =>
    Array.from({ length: n }, (_, i) => `${phase} (2026-10-${String(i + 1).padStart(2, '0')})`);
  const passes = (phase, verdicts) => verdicts.map((v) => `${phase} ${v} (2026-10-12)`);

  it('is 0 when the key is absent (projects with no recorded pass are unchanged)', () => {
    expect(countPhasePasses({ completed_phases: [] }, 'REVIEW')).toBe(0);
  });

  it('counts only the named phase', () => {
    const s = { phase_passes: [...passes('VERIFY', ['PASS']), ...passes('REVIEW', ['FAIL', 'FAIL'])] };
    expect(countPhasePasses(s, 'REVIEW')).toBe(2);
    expect(countPhasePasses(s, 'VERIFY')).toBe(1);
  });

  it('four REVIEW passes and no REVIEW exit → count 4, atCeiling', () => {
    const s = {
      completed_phases: exits('VERIFY', 1),
      phase_passes: passes('REVIEW', ['FAIL', 'FAIL', 'FAIL', 'PASS-WITH-FIXES']),
    };
    expect(loopStatusFor(s, 'REVIEW')).toMatchObject({ count: 4, atCeiling: true });
  });

  it('passes and exits together → the larger, not the sum (D-M6E17-1)', () => {
    // A pass that ends and then leaves the phase appears in both sources.
    const s = { completed_phases: exits('REVIEW', 1), phase_passes: passes('REVIEW', ['PASS']) };
    expect(loopStatusFor(s, 'REVIEW')).toMatchObject({ count: 1, atCeiling: false });
    const t = { completed_phases: exits('REVIEW', 2), phase_passes: passes('REVIEW', ['FAIL']) };
    expect(loopStatusFor(t, 'REVIEW').count).toBe(2);
  });

  it('a state with no phase_passes reads exactly as before', () => {
    const s = { completed_phases: exits('REVIEW', 1) };
    expect(loopStatusFor(s, 'REVIEW')).toEqual({
      phase: 'REVIEW',
      count: 1,
      ceiling: 3,
      nextAttempt: 2,
      atCeiling: false,
    });
  });
});

describe('AC1.4 — an unreadable pass record is a stop, never zero (D-M6E17-6)', () => {
  it.each([
    ['not a list', 'broken'],
    ['a malformed entry', ['REVIEW FAIL (2026-10-12)', 'REVIEW looked fine']],
    ['an unknown verdict', ['REVIEW MAYBE (2026-10-12)']],
    ['a non-string entry', [{ phase: 'REVIEW' }]],
  ])('%s → countPhasePasses null → loopStatusFor null → loop-unknown', (_label, value) => {
    const s = { completed_phases: [], phase_passes: value };
    expect(countPhasePasses(s, 'REVIEW')).toBeNull();
    expect(loopStatusFor(s, 'REVIEW')).toBeNull();
    const verdict = canProceedUnattended('REVIEW', unattended, {
      loopStatus: loopStatusFor(s, 'REVIEW'),
    });
    expect(verdict.proceed).toBe(false);
    expect(verdict.reason).toBe('loop-unknown');
  });

  it('a malformed entry for ANOTHER phase still stops (the record is unreadable)', () => {
    const s = { completed_phases: [], phase_passes: ['VERIFY garbage'] };
    expect(loopStatusFor(s, 'REVIEW')).toBeNull();
  });
});

describe('AC1.3 — the records are per Epic', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-passes-roll-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('an Epic roll clears phase_passes', async () => {
    await writeState(baseDir, { epic: 'M6.E16' });
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12' });
    await setCurrentEpic(baseDir, 'M6.E17');
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual([]);
  });

  it('a same-Epic call keeps them', async () => {
    await writeState(baseDir, { epic: 'M6.E16' });
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12' });
    await setCurrentEpic(baseDir, 'M6.E16');
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual(['REVIEW FAIL (2026-10-12)']);
  });
});

describe('AC1.7 — M6.E16 replay: passes that never left REVIEW stop the driver', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-passes-replay-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('two FAIL passes inside REVIEW → the third is at the ceiling → loop-ceiling', async () => {
    await writeState(baseDir, { epic: 'M6.E16', phase: 'REVIEW' });
    // Before S2 this shape read 0 and /sig:drive would have run pass 3 on its own.
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12' });
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12' });
    const state = await readState(baseDir);
    const status = loopStatusFor(state, 'REVIEW');
    expect(status).toMatchObject({ count: 2, nextAttempt: 3, atCeiling: true });
    const verdict = canProceedUnattended('REVIEW', unattended, { loopStatus: status });
    expect(verdict).toMatchObject({ proceed: false, reason: 'loop-ceiling' });
  });
});
