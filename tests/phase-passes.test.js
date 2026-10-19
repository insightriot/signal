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
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readState, recordPass, setCurrentEpic, completePhase, markRunEnded } from '../plugin/tools/lib/state.js';
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

  // VERIFY pass 1, D1: a linear project has no Epic roll. Its run ends at SHIP,
  // where completed_phases is archived and cleared; the passes stayed, so the
  // next run's first REVIEW read the last run's count and stopped the driver.
  it('a linear SHIP clears them with the run, so the next run starts at 0', async () => {
    await writeState(baseDir, { epic: 'null', phase: 'SHIP' });
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12' });
    await recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12' });
    await completePhase(baseDir, 'SHIP');
    const state = await readState(baseDir);
    expect(state.completed_phases).toEqual([]);
    expect(state.phase_passes).toEqual([]);
    expect(loopStatusFor(state, 'REVIEW')).toMatchObject({ count: 0, atCeiling: false });
  });

  // REVIEW pass 3, P3-I5: a linear project's REVIEW report is one file for every
  // run (1-REVIEW.md), appended and never rewritten. Clearing the record without
  // marking the report left run 2's first REVIEW reading run 1's sections, and
  // refusing a correct PASS. The run's end is appended to the report.
  it('a linear SHIP appends "## Run ended" to the REVIEW report (the test above has no report, and still ships)', async () => {
    await writeState(baseDir, { epic: 'null', phase: 'SHIP' });
    const reportPath = join(baseDir, '.planning', '1-REVIEW.md');
    await writeFile(reportPath, '# Review Report\n\n## Pass 1\n\nfindings\n', 'utf-8');
    await recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12' });
    await completePhase(baseDir, 'SHIP');
    const text = await readFile(reportPath, 'utf-8');
    expect(text.startsWith('# Review Report\n\n## Pass 1\n\nfindings\n')).toBe(true);
    expect(text).toMatch(/\n## Run ended — \d{4}-\d{2}-\d{2}\n$/);
    expect((await readState(baseDir)).phase_passes).toEqual([]);
  });

  it('a report that cannot be appended to does not leave SHIP half done: the run still ends, and the failure is returned', async () => {
    await writeState(baseDir, { epic: 'null', phase: 'SHIP' });
    await mkdir(join(baseDir, '.planning', '1-REVIEW.md')); // a folder where the report should be
    await recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12' });
    const r = await completePhase(baseDir, 'SHIP');
    expect(r.runEnded).toMatchObject({ ok: false });
    expect(r.runEnded.error).toMatch(/EISDIR|directory/i);
    const state = await readState(baseDir);
    expect(state.completed_phases).toEqual([]);
    expect(state.phase_passes).toEqual([]);
  });

  // REVIEW pass 4, P4-I1: when SHIP could not write the line, the recovery is a
  // named call, not a line typed by hand (review.md § 5 forbids that).
  it('markRunEnded appends the line SHIP could not, and reports a report it cannot write', async () => {
    await writeState(baseDir, { epic: 'null', phase: 'SHIP' });
    const reportPath = join(baseDir, '.planning', '1-REVIEW.md');
    await mkdir(reportPath);
    expect(await markRunEnded(baseDir, { date: '2026-10-18' })).toMatchObject({ ok: false, path: reportPath });
    await rm(reportPath, { recursive: true });
    await writeFile(reportPath, '# Review Report\n\n## Pass 1\n', 'utf-8');
    expect(await markRunEnded(baseDir, { date: '2026-10-18' })).toMatchObject({ ok: true, path: reportPath });
    expect(await readFile(reportPath, 'utf-8')).toBe('# Review Report\n\n## Pass 1\n\n## Run ended — 2026-10-18\n');
  });

  // REVIEW pass 5, P5-I1: SHIP's failure missed, markRunEnded appended the line
  // below the next run's "## Pass 1", where the check still read every pass as
  // one run. With keep, the line goes above the passes this run keeps.
  it('markRunEnded with keep puts the line above the new run\'s passes, not below them', async () => {
    await writeState(baseDir, { epic: 'null', phase: 'REVIEW' });
    const reportPath = join(baseDir, '.planning', '1-REVIEW.md');
    const old = '# Review Report\n\n## Pass 1\n\nold\n\n## Pass 2\n\nold\n';
    const fresh = '## Pass 1 — 2026-10-19, at `abc1234`\n\nnew\n';
    await writeFile(reportPath, `${old}\n${fresh}`, 'utf-8');
    expect(await markRunEnded(baseDir, { date: '2026-10-18', keep: 1 })).toMatchObject({ ok: true });
    expect(await readFile(reportPath, 'utf-8')).toBe(`${old}\n## Run ended — 2026-10-18\n\n${fresh}`);
    // Keeping every section this run holds leaves nothing to mark: refused, file unchanged.
    const before = await readFile(reportPath, 'utf-8');
    expect(await markRunEnded(baseDir, { date: '2026-10-18', keep: 1 })).toMatchObject({ ok: false });
    expect(await readFile(reportPath, 'utf-8')).toBe(before);
  });

  it('an Epic SHIP does not touch the report', async () => {
    await writeState(baseDir, { epic: 'M6.E16', phase: 'SHIP' });
    const reportPath = join(baseDir, '.planning', 'M6.E16-REVIEW.md');
    await writeFile(reportPath, '# Review\n\n## Pass 1\n', 'utf-8');
    await completePhase(baseDir, 'SHIP');
    expect(await readFile(reportPath, 'utf-8')).toBe('# Review\n\n## Pass 1\n');
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

  // Whole-PR read before merge (#304): the records count the pass just ended, so
  // a phase that had just PASSED read as at the ceiling, and the driver stopped
  // after a pass that needed nothing retried. The ceiling stops retries only.
  const visit = (phase, passes, completed) => ({
    phase, current_epic: 'M9.E1', phase_passes: passes,
    completed_phases: completed.map((p) => `${p} (2026-10-01)`),
  });
  it('VERIFY passes again after a REVIEW loop-back: not at the ceiling, the driver goes on', () => {
    const state = visit('VERIFY', ['VERIFY PASS (2026-10-01)', 'REVIEW FAIL (2026-10-01)', 'VERIFY PASS (2026-10-02)'],
      ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'EXECUTE']);
    const status = loopStatusFor(state, 'VERIFY');
    expect(status).toMatchObject({ count: 2, atCeiling: false });
    expect(canProceedUnattended('VERIFY', unattended, { loopStatus: status }).reason).not.toBe('loop-ceiling');
  });
  it('FAIL, FAIL, then PASS inside REVIEW: the phase passed, so the ceiling does not stop it', () => {
    const state = visit('REVIEW', ['REVIEW FAIL (2026-10-01)', 'REVIEW FAIL (2026-10-01)', 'REVIEW PASS (2026-10-02)'],
      ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY']);
    expect(loopStatusFor(state, 'REVIEW')).toMatchObject({ count: 3, atCeiling: false });
  });
  it('a PASS from an earlier visit does not lift the ceiling at the start of a new one', () => {
    // Entering VERIFY a third time: both earlier passes passed and were left.
    const state = visit('VERIFY', ['VERIFY PASS (2026-10-01)', 'REVIEW FAIL (2026-10-01)', 'VERIFY PASS (2026-10-02)', 'REVIEW FAIL (2026-10-02)'],
      ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'EXECUTE', 'VERIFY', 'REVIEW', 'EXECUTE']);
    expect(loopStatusFor(state, 'VERIFY')).toMatchObject({ count: 2, atCeiling: true });
  });
});
