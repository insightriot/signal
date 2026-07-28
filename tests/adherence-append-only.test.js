import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ADHERENCE_LOG,
  RUNS_MARKER,
  CEILING_BEGIN,
  CEILING_END,
  appendRunRecord,
  renderRunRecord,
} from '../tools/lib/adherence-log.js';

/**
 * FR4 — the run record (M5.E8.S4).
 *
 * Pinned at RED commit time before appendRunRecord exists.
 *
 * AC4.2 is APPEND-ONLY, and it is written as its own test because the Epic that
 * shipped B44 — a silent write that dropped data — does not get to collapse
 * another log. The failure this guards is not a crash: it is a later run quietly
 * rewriting an earlier measurement, which destroys the evidence that would show
 * it happened. Exactly the shape M5.E9 found it could not detect after the fact.
 */

const dirs = [];
function scratchProject() {
  const root = mkdtempSync(join(tmpdir(), 'sig-adherence-log-'));
  mkdirSync(join(root, '.planning'), { recursive: true });
  dirs.push(root);
  return root;
}
afterEach(() => {
  while (dirs.length) {
    try { rmSync(dirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const RECORD = {
  canary: 'B41-phase-entry',
  command: 'execute',
  trace: 'phaseChanged',
  verdict: 'obeyed',
  treatment: { hits: 3, runs: 3, unanimous: true },
  control: { hits: 0, runs: 3, unanimous: true },
  failedRuns: 0,
  seamProven: true,
  surface: { cliVersion: '2.1.220', model: 'claude-opus-5' },
  runsPerArm: 3,
};

describe('run record rendering (AC4.1)', () => {
  it('carries date, commit, CLI version + model, verdict and spread', () => {
    const md = renderRunRecord(RECORD, { date: '2026-07-28', commit: 'abc1234' });
    expect(md).toContain('2026-07-28');
    expect(md).toContain('abc1234');
    expect(md).toContain('2.1.220');
    expect(md).toContain('claude-opus-5');
    expect(md).toMatch(/obeyed/i);
    expect(md).toContain('3/3');
    expect(md).toContain('0/3');
  });

  it('records the seam precondition — a verdict without it is not interpretable', () => {
    const md = renderRunRecord(RECORD, { date: '2026-07-28', commit: 'abc1234' });
    expect(md.toLowerCase()).toMatch(/seam/);
  });

  it('states enough to repeat the run (AC4.3)', () => {
    const md = renderRunRecord(RECORD, { date: '2026-07-28', commit: 'abc1234' });
    expect(md).toContain('B41-phase-entry');
    expect(md).toContain('execute');
    expect(md).toMatch(/runs per arm[^\n]*3/i);
  });
});

describe('append-only (AC4.2) — the Epic that shipped B44 does not collapse another log', () => {
  it('a second run leaves the first byte-identical', async () => {
    const root = scratchProject();
    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    const afterFirst = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');

    await appendRunRecord(root, { ...RECORD, verdict: 'inert' }, { date: '2026-07-29', commit: 'bbb2222' });
    const afterSecond = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');

    // Every byte of the first record still present, in order, untouched.
    expect(afterSecond.startsWith(afterFirst)).toBe(true);
    expect(afterSecond).toContain('aaa1111');
    expect(afterSecond).toContain('bbb2222');
    expect(afterSecond.length).toBeGreaterThan(afterFirst.length);
  });

  it('appending never touches the ceiling block above the runs marker', async () => {
    const root = scratchProject();
    const seeded = [
      '# Adherence Log',
      CEILING_BEGIN,
      'CEILING CONTENT THAT MUST SURVIVE',
      CEILING_END,
      RUNS_MARKER,
      '',
    ].join('\n');
    writeFileSync(join(root, '.planning', ADHERENCE_LOG), seeded);

    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    const out = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');
    expect(out).toContain('CEILING CONTENT THAT MUST SURVIVE');
    expect(out.indexOf(CEILING_BEGIN)).toBeLessThan(out.indexOf(RUNS_MARKER));
  });

  it('ten appends keep all ten records', async () => {
    const root = scratchProject();
    for (let i = 1; i <= 10; i++) {
      await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: `c${i}` });
    }
    const out = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');
    for (let i = 1; i <= 10; i++) {
      expect(out).toContain(`c${i}`);
    }
  });

  it('creates the file with its ceiling marker intact when absent', async () => {
    const root = scratchProject();
    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    const out = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');
    expect(out).toContain(RUNS_MARKER);
  });

  it('an INERT verdict is recorded as a result, never as a failure to retry (NFR4)', async () => {
    const root = scratchProject();
    await appendRunRecord(root, { ...RECORD, verdict: 'inert' }, { date: '2026-07-28', commit: 'aaa1111' });
    const out = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8').toLowerCase();
    expect(out).toContain('inert');
    expect(out).toMatch(/finding|caused nothing/);
  });
});
