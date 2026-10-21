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
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink, lstat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readState, recordPass, setCurrentEpic, completePhase, markRunEnded, transitionPhase } from '../plugin/tools/lib/state.js';
import { checkFixRounds } from '../plugin/tools/lib/review-rounds.js';
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

// checkFixRounds's result for a report it accepted: a REVIEW PASS or
// PASS-WITH-FIXES is recorded only on one (AC3.5, REVIEW pass 1 I3).
const checked = (verdict) => ({ ok: true, verdict, reasons: [], gaps: [], uncovered: [], rounds: [] });

const shipPasses = (entries) => `phase_passes:\n${entries.map((e) => `  - ${e}\n`).join('')}`;

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
    await recordPass(baseDir, 'REVIEW', 'PASS-WITH-FIXES', { date: '2026-10-13', fixRounds: checked('PASS-WITH-FIXES') });
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual([
      'REVIEW FAIL (2026-10-12)',
      'REVIEW PASS-WITH-FIXES (2026-10-13)',
    ]);
  });

  it('leaves every other field as it was', async () => {
    // M6.E18: recordPass now refuses a phase STATE is not in (AC3.1), so the
    // fixture is in VERIFY; the subject of this test is the other fields.
    await writeState(baseDir, { phase: 'VERIFY' });
    const before = await readState(baseDir);
    await recordPass(baseDir, 'VERIFY', 'PASS', { date: '2026-10-12' });
    const after = await readState(baseDir);
    expect(after.phase).toBe(before.phase);
    expect(after.current_epic).toBe(before.current_epic);
    expect(after.completed_phases).toEqual(before.completed_phases);
  });

  it('defaults the date to today, in the same form as completed_phases', async () => {
    await writeState(baseDir, { phase: 'VERIFY' });
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
    await expect(recordPass(baseDir, 'REVIEW', 'PASS', { date: 'yesterday', fixRounds: checked('PASS') })).rejects.toThrow(
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
  // M6.E18: recordPass refuses REVIEW while STATE is at SHIP (AC3.1), so these
  // SHIP tests seed the records in the fixture; their subject is SHIP's clear.
  it('a linear SHIP clears them with the run, so the next run starts at 0', async () => {
    await writeState(baseDir, {
      epic: 'null',
      phase: 'SHIP',
      extra: shipPasses(['REVIEW FAIL (2026-10-12)', 'REVIEW PASS (2026-10-12)']),
    });
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
    await writeState(baseDir, { epic: 'null', phase: 'SHIP', extra: shipPasses(['REVIEW PASS (2026-10-12)']) });
    const reportPath = join(baseDir, '.planning', '1-REVIEW.md');
    await writeFile(reportPath, '# Review Report\n\n## Pass 1\n\nfindings\n', 'utf-8');
    await completePhase(baseDir, 'SHIP');
    const text = await readFile(reportPath, 'utf-8');
    expect(text.startsWith('# Review Report\n\n## Pass 1\n\nfindings\n')).toBe(true);
    expect(text).toMatch(/\n## Run ended — \d{4}-\d{2}-\d{2}\n$/);
    expect((await readState(baseDir)).phase_passes).toEqual([]);
  });

  it('a report that cannot be appended to does not leave SHIP half done: the run still ends, and the failure is returned', async () => {
    await writeState(baseDir, { epic: 'null', phase: 'SHIP', extra: shipPasses(['REVIEW PASS (2026-10-12)']) });
    await mkdir(join(baseDir, '.planning', '1-REVIEW.md')); // a folder where the report should be
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

  // M6.E18 S6 (SIG-342 P4-S1, AC6.1): a linear SHIP followed a symlinked
  // 1-REVIEW.md, and atomicWrite renamed a regular file over the link — the
  // linked file's contents written into .planning/. lstat, and refuse.
  it('a symlinked REVIEW report is refused: the link stays a link, its target is untouched', async () => {
    await writeState(baseDir, { epic: 'null', phase: 'SHIP', extra: shipPasses(['REVIEW PASS (2026-10-12)']) });
    const outside = await mkdtemp(join(tmpdir(), 'signal-passes-link-'));
    try {
      const target = join(outside, 'elsewhere.md');
      await writeFile(target, '# Not this project\n', 'utf-8');
      const reportPath = join(baseDir, '.planning', '1-REVIEW.md');
      await symlink(target, reportPath);

      const direct = await markRunEnded(baseDir, { date: '2026-10-20' });
      expect(direct).toMatchObject({ ok: false, path: reportPath });
      expect(direct.error).toMatch(/1-REVIEW\.md/);
      expect(direct.error).toMatch(/symbolic link/i);

      const r = await completePhase(baseDir, 'SHIP');
      expect(r.runEnded).toMatchObject({ ok: false, path: reportPath });
      expect(r.runEnded.error).toMatch(/symbolic link/i);
      expect((await lstat(reportPath)).isSymbolicLink()).toBe(true);
      expect(await readFile(target, 'utf-8')).toBe('# Not this project\n');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
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
  // The fix's fresh read: "this visit" read as "more records than exits", which
  // stays true for good once a visit made fixes inside the phase. The rule is
  // now the LAST record of all: the phase's own pass, just written.
  it('an earlier visit that fixed inside VERIFY does not lift the ceiling when VERIFY is entered again', () => {
    const state = visit('VERIFY', ['VERIFY FAIL (2026-10-01)', 'VERIFY PASS (2026-10-01)', 'REVIEW FAIL (2026-10-01)'],
      ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'EXECUTE']);
    expect(loopStatusFor(state, 'VERIFY')).toMatchObject({ count: 2, atCeiling: true });
  });
  it('a pass just recorded lifts the ceiling even when exits outnumber records (an Epic begun before the records)', () => {
    const state = visit('VERIFY', ['REVIEW FAIL (2026-10-01)', 'VERIFY PASS (2026-10-02)'],
      ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'EXECUTE', 'VERIFY', 'EXECUTE', 'VERIFY', 'REVIEW', 'EXECUTE']);
    expect(loopStatusFor(state, 'VERIFY')).toMatchObject({ count: 3, atCeiling: false });
  });
  it('PASS-WITH-FIXES last lifts it; PASS then FAILs in one visit does not; no records keeps the exit count', () => {
    expect(loopStatusFor(visit('REVIEW', ['REVIEW FAIL (2026-10-01)', 'REVIEW FAIL (2026-10-01)', 'REVIEW PASS-WITH-FIXES (2026-10-02)'],
      ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY']), 'REVIEW')).toMatchObject({ atCeiling: false });
    expect(loopStatusFor(visit('VERIFY', ['VERIFY PASS-WITH-FIXES (2026-10-01)', 'VERIFY FAIL (2026-10-01)', 'VERIFY FAIL (2026-10-02)'],
      ['DISCUSS', 'PLAN', 'EXECUTE']), 'VERIFY')).toMatchObject({ count: 3, atCeiling: true });
    const none = visit('VERIFY', [], ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'EXECUTE', 'VERIFY', 'EXECUTE']);
    delete none.phase_passes;
    expect(loopStatusFor(none, 'VERIFY')).toMatchObject({ count: 2, atCeiling: true });
  });
  it('a PASS from an earlier visit does not lift the ceiling at the start of a new one', () => {
    // Entering VERIFY a third time: both earlier passes passed and were left.
    const state = visit('VERIFY', ['VERIFY PASS (2026-10-01)', 'REVIEW FAIL (2026-10-01)', 'VERIFY PASS (2026-10-02)', 'REVIEW FAIL (2026-10-02)'],
      ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'EXECUTE', 'VERIFY', 'REVIEW', 'EXECUTE']);
    expect(loopStatusFor(state, 'VERIFY')).toMatchObject({ count: 2, atCeiling: true });
  });
});

// M6.E18 S2 — the visit marker (FR2, `SIG-349`) and an honest recordPass (FR3,
// `SIG-337`, `SIG-344`). Proof-of-fail: before S2, transitionPhase writes no
// phase_pass_mark, recordPass records any phase, any number of times, on any
// date, and state-schema.md has no phase_pass_mark row.
describe('M6.E18 AC2.1 — entering VERIFY or REVIEW marks where the visit began', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-passes-mark-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  const artifact = (name) => writeFile(join(baseDir, '.planning', `M6.E16-${name}.md`), '# x\n', 'utf-8');

  it('entering VERIFY with no phase_passes writes phase_pass_mark: 0', async () => {
    await writeState(baseDir, { phase: 'EXECUTE' });
    await transitionPhase(baseDir, 'VERIFY');
    expect((await readState(baseDir)).phase_pass_mark).toBe(0);
  });

  it('entering REVIEW writes the length of phase_passes at entry', async () => {
    await writeState(baseDir, {
      phase: 'VERIFY',
      extra: shipPasses(['VERIFY FAIL (2026-10-11)', 'VERIFY PASS (2026-10-11)']),
    });
    await artifact('VERIFICATION');
    await transitionPhase(baseDir, 'REVIEW');
    expect((await readState(baseDir)).phase_pass_mark).toBe(2);
  });

  // REVIEW pass 1, S5: re-entering REVIEW from REVIEW is not a new visit, so
  // a PASS recorded in it must stay at or after the mark.
  it('re-entering the phase STATE is already in leaves the mark as it was', async () => {
    await writeState(baseDir, {
      phase: 'REVIEW',
      extra: shipPasses(['REVIEW PASS (2026-10-11)']) + 'phase_pass_mark: 0\n',
    });
    await artifact('REVIEW');
    await transitionPhase(baseDir, 'REVIEW');
    expect((await readState(baseDir)).phase_pass_mark).toBe(0);
  });

  // REVIEW fix round 1's fresh read: the mark was kept on re-entry but an exit was still written,
  // so the exit count said the visit ended while the mark said it had not. Re-entry is the same
  // visit (review.md resumes an unfinished pass), so nothing is recorded as left either.
  for (const phase of ['VERIFY', 'REVIEW']) {
    it(`re-entering ${phase} from ${phase} records no exit, so both records read one visit`, async () => {
      await writeState(baseDir, {
        phase,
        extra: shipPasses([`${phase} FAIL (2026-10-11)`, `${phase} PASS (2026-10-12)`]) + 'phase_pass_mark: 1\n',
      });
      await artifact(phase === 'VERIFY' ? 'VERIFICATION' : 'REVIEW');
      const before = await readState(baseDir);
      await transitionPhase(baseDir, phase);
      const after = await readState(baseDir);
      expect(after.completed_phases).toEqual(before.completed_phases);
      expect(after.phase_pass_mark).toBe(1);
      expect(loopStatusFor(after, phase)).toEqual(loopStatusFor(before, phase));
    });
  }

  it('entering any other phase leaves the mark as it was', async () => {
    await writeState(baseDir, {
      phase: 'VERIFY',
      extra: shipPasses(['VERIFY FAIL (2026-10-11)']) + 'phase_pass_mark: 0\n',
    });
    await artifact('VERIFICATION');
    await transitionPhase(baseDir, 'EXECUTE');
    expect((await readState(baseDir)).phase_pass_mark).toBe(0);
  });

  // AC3.6 (P4-S11): a FAIL loop-back leaves VERIFY and comes back; the passes
  // of the first visit are kept, and the second visit's mark sits after them.
  it('phase_passes survives a FAIL loop-back: VERIFY FAIL → EXECUTE → VERIFY keeps the entries', async () => {
    await writeState(baseDir, { phase: 'EXECUTE' });
    await artifact('VERIFICATION');
    await transitionPhase(baseDir, 'VERIFY');
    await recordPass(baseDir, 'VERIFY', 'FAIL', { date: '2026-10-12' });
    await transitionPhase(baseDir, 'EXECUTE');
    await transitionPhase(baseDir, 'VERIFY');
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual(['VERIFY FAIL (2026-10-12)']);
    expect(state.phase_pass_mark).toBe(1);
  });

  it('an Epic roll clears the mark with phase_passes', async () => {
    await writeState(baseDir, { phase: 'REVIEW', extra: shipPasses(['REVIEW FAIL (2026-10-12)']) + 'phase_pass_mark: 0\n' });
    await setCurrentEpic(baseDir, 'M6.E17');
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual([]);
    expect('phase_pass_mark' in state).toBe(false);
  });

  it('a linear SHIP clears the mark with phase_passes', async () => {
    await writeState(baseDir, {
      epic: 'null',
      phase: 'SHIP',
      extra: shipPasses(['REVIEW PASS (2026-10-12)']) + 'phase_pass_mark: 0\n',
    });
    await completePhase(baseDir, 'SHIP');
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual([]);
    expect('phase_pass_mark' in state).toBe(false);
  });
});

describe('M6.E18 AC3.1 / AC3.3 — recordPass refuses a pass that cannot be true', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-passes-honest-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("recordPass('REVIEW') while STATE is in VERIFY is refused, naming both", async () => {
    await writeState(baseDir, { phase: 'VERIFY' });
    const err = await recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12', fixRounds: checked('PASS') }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/REVIEW/);
    expect(err.message).toMatch(/VERIFY/);
    expect((await readState(baseDir)).phase_passes).toBeUndefined();
  });

  it('several passes in one visit are all recorded, as M6.E16 ran four inside REVIEW (AC3.3 amended)', async () => {
    await writeState(baseDir, { phase: 'EXECUTE' });
    await writeFile(join(baseDir, '.planning', 'M6.E16-VERIFICATION.md'), '# x\n', 'utf-8');
    await transitionPhase(baseDir, 'REVIEW');
    await recordPass(baseDir, 'REVIEW', 'PASS-WITH-FIXES', { date: '2026-10-12', fixRounds: checked('PASS-WITH-FIXES') });
    await recordPass(baseDir, 'REVIEW', 'PASS-WITH-FIXES', { date: '2026-10-12', fixRounds: checked('PASS-WITH-FIXES') });
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-13' });
    const state = await readState(baseDir);
    expect(state.phase_passes).toEqual([
      'REVIEW PASS-WITH-FIXES (2026-10-12)', 'REVIEW PASS-WITH-FIXES (2026-10-12)', 'REVIEW FAIL (2026-10-13)',
    ]);
    expect(loopStatusFor(state, 'REVIEW')).toMatchObject({ count: 3, atCeiling: true });
  });

  it('a mark that does not read is refused at write, as the reader stops on it', async () => {
    await writeState(baseDir, { phase: 'REVIEW', extra: 'phase_pass_mark: 3\n' });
    await expect(recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12', fixRounds: checked('PASS') })).rejects.toThrow(/phase_pass_mark/);
    expect((await readState(baseDir)).phase_passes).toBeUndefined();
  });

  it('a date after today is refused at write; today is accepted', async () => {
    await writeState(baseDir, { phase: 'REVIEW' });
    await expect(recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-21', today: '2026-10-20', fixRounds: checked('PASS') })).rejects.toThrow(
      /2026-10-21/
    );
    expect((await readState(baseDir)).phase_passes).toBeUndefined();
    await recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-20', today: '2026-10-20', fixRounds: checked('PASS') });
    expect((await readState(baseDir)).phase_passes).toEqual(['REVIEW PASS (2026-10-20)']);
  });

  it('a date that is not a calendar day is refused at write (AC3.2: malformed)', async () => {
    await writeState(baseDir, { phase: 'REVIEW' });
    await expect(recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-02-30', today: '2026-10-20', fixRounds: checked('PASS') })).rejects.toThrow(/date/);
  });
});

describe('M6.E18 AC2.5 / AC3.6 — state-schema.md documents both records', () => {
  const schema = readFileSync(
    fileURLToPath(new URL('../plugin/references/state-schema.md', import.meta.url)),
    'utf-8'
  );
  const row = (key) => schema.split('\n').find((l) => l.startsWith(`| \`${key}\` |`));

  it('has a phase_passes row (P4-S11)', () => {
    expect(row('phase_passes')).toMatch(/recordPass/);
  });

  // REVIEW pass 1, I2: AC3.3 was amended so several records in one visit are
  // accepted; both rows still documented the refusal the code removed.
  it('neither row says recordPass refuses a second record in one visit', () => {
    for (const key of ['phase_passes', 'phase_pass_mark']) {
      expect(row(key), key).not.toMatch(/second (record|entry)/);
    }
  });

  it('has a phase_pass_mark row: optional, written on entering VERIFY or REVIEW, cleared with phase_passes', () => {
    const r = row('phase_pass_mark');
    expect(r).toBeDefined();
    expect(r).toMatch(/transitionPhase/);
    expect(r).toMatch(/VERIFY/);
    expect(r).toMatch(/REVIEW/);
    expect(r).toMatch(/[Oo]ptional/);
    expect(r).toMatch(/loop-unknown/);
  });
});

// AC3.6 (P4-S12, P3-S11): a parent-run summary that ran no file proves nothing,
// so checkFixRounds counts "0 of 0" as a gap, never as proof. The code already
// does this (review-rounds.js: `Number(pm[3]) === 0`); nothing tested it.
describe('M6.E18 AC3.6 — a "0 of 0" parent-run summary is a gap', () => {
  it('a fix round whose Parent run line reads 0 of 0 is listed as a gap', () => {
    const report =
      '# Review Report — M9.E1\n\n## Pass 1\n\nfindings\n\n### Fix round 1\n\nFixed.\n\n' +
      '**Fresh read:** abc1234..def5678 — Critical 0, Important 0 — stop: yes\n' +
      '**Parent run:** `parent-run abc1234: 0 of 0 failed on the base`\n\n';
    const r = checkFixRounds(report, 'PASS-WITH-FIXES', { phasePasses: [] });
    // With no git given, the round is also a gap whose commits were not checked (M6.E18 S4).
    expect(r.gaps).toContainEqual(expect.stringMatching(/Fix round 1: parent-run abc1234: 0 of 0 failed on the base/));
  });
});

// M6.E18 AC3.5 (P4-S7): recordPass took a REVIEW PASS on the caller's word,
// whether or not checkFixRounds had accepted the report. It now takes the
// check's result (`opts.fixRounds`) and refuses a passing verdict the check
// did not accept, naming the check. Proof-of-fail: on 1e759af3 the option is
// ignored and every case below records the pass.
describe('M6.E18 AC3.5 — a REVIEW pass the fix-round check refused is not recorded', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-passes-rounds-'));
    await writeState(baseDir, { phase: 'REVIEW' });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });
  const refused = { ok: false, reasons: ['Fix round 1 has no **Fresh read:** line'], gaps: [], rounds: [] };

  it('PASS or PASS-WITH-FIXES with a check that did not pass is refused, naming checkFixRounds and its reason', async () => {
    for (const verdict of ['PASS', 'PASS-WITH-FIXES']) {
      const err = await recordPass(baseDir, 'REVIEW', verdict, { date: '2026-10-12', fixRounds: refused }).catch((e) => e);
      expect(err, verdict).toBeInstanceOf(Error);
      expect(err.message).toMatch(/checkFixRounds/);
      expect(err.message).toMatch(/no \*\*Fresh read:\*\* line/);
    }
    expect((await readState(baseDir)).phase_passes).toBeUndefined();
    // A check that passed for this verdict is recorded; a FAIL is recorded whatever the check said, or with none.
    await recordPass(baseDir, 'REVIEW', 'PASS-WITH-FIXES', { date: '2026-10-12', fixRounds: { ...refused, ok: true, reasons: [], verdict: 'PASS-WITH-FIXES' } });
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12', fixRounds: refused });
    await recordPass(baseDir, 'REVIEW', 'FAIL', { date: '2026-10-12' });
    expect((await readState(baseDir)).phase_passes).toEqual([
      'REVIEW PASS-WITH-FIXES (2026-10-12)', 'REVIEW FAIL (2026-10-12)', 'REVIEW FAIL (2026-10-12)',
    ]);
  });

  // REVIEW pass 1, I3: a caller who skipped checkFixRounds passed nothing and
  // the PASS was recorded. Proof-of-fail: on 9628dcff both are recorded.
  it('PASS or PASS-WITH-FIXES with no check given is refused, naming checkFixRounds', async () => {
    for (const verdict of ['PASS', 'PASS-WITH-FIXES']) {
      const err = await recordPass(baseDir, 'REVIEW', verdict, { date: '2026-10-12' }).catch((e) => e);
      expect(err, verdict).toBeInstanceOf(Error);
      expect(err.message).toMatch(/checkFixRounds/);
    }
    expect((await readState(baseDir)).phase_passes).toBeUndefined();
  });

  it('a check computed for another verdict is refused, naming both verdicts', async () => {
    for (const other of ['FAIL', 'PASS-WITH-FIXES', undefined]) {
      const err = await recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12', fixRounds: { ...checked(other) } }).catch((e) => e);
      expect(err, String(other)).toBeInstanceOf(Error);
      expect(err.message).toMatch(/checkFixRounds/);
      expect(err.message).toContain('PASS');
      if (other) expect(err.message).toContain(other);
    }
    expect((await readState(baseDir)).phase_passes).toBeUndefined();
  });

  it('checkFixRounds returns the verdict it was computed for, and recordPass takes that result', async () => {
    const r = checkFixRounds('# Review Report\n\n## Pass 1\n\nfindings\n', 'PASS', { phasePasses: [] });
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe('PASS');
    await recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12', fixRounds: r });
    expect((await readState(baseDir)).phase_passes).toEqual(['REVIEW PASS (2026-10-12)']);
  });

  it('a check result that does not read is refused, never taken as passed', async () => {
    for (const bad of [{}, { ok: 'yes' }, null, 'ok']) {
      await expect(recordPass(baseDir, 'REVIEW', 'PASS', { date: '2026-10-12', fixRounds: bad }), JSON.stringify(bad)).rejects.toThrow(/checkFixRounds/);
    }
    expect((await readState(baseDir)).phase_passes).toBeUndefined();
  });
});
