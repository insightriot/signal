import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

import {
  ADHERENCE_LOG,
  RUNS_MARKER,
  CEILING_BEGIN,
  CEILING_END,
  appendRunRecord,
  renderRunRecord,
  appendNotice,
  NOTICE_KINDS,
} from '../plugin/tools/lib/adherence-log.js';

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

  it('appendNotice is ALSO append-only — a correction never edits the record it corrects', async () => {
    // A second writer to an append-only file inherits none of the first writer's
    // guarantee automatically. AC4.2 is a structural claim, so it has to be
    // pinned for every writer, not just the one it was written about.
    const root = scratchProject();
    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    const before = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');

    await appendNotice(root, {
      kind: NOTICE_KINDS.QUALIFIED,
      commit: 'aaa1111',
      verdict: 'obeyed',
      reason: 'scope note',
    });
    const after = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');

    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain('QUALIFIED');
  });

  it('rejects an unknown notice kind rather than writing an unlabelled block', async () => {
    const root = scratchProject();
    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    await expect(
      appendNotice(root, { kind: 'WHATEVER', commit: 'aaa1111', verdict: 'obeyed', reason: 'x' })
    ).rejects.toThrow(/unknown kind/i);
  });

  /**
   * AC7.3 / `B80` — the log used a kind the code could not produce.
   *
   * `.planning/ADHERENCE-LOG.md` carries a `DIAGNOSED` annotation block, written
   * by hand because `NOTICE_KINDS` was frozen to two values and `appendNotice`
   * threw on anything else. A vocabulary the record uses and the writer rejects
   * means every future annotation of that kind is hand-written — outside the
   * append-only guarantee this module exists to enforce.
   */
  it('AC7.3 — accepts DIAGNOSED, the third kind the log already uses', async () => {
    const root = scratchProject();
    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    await expect(
      appendNotice(root, {
        kind: NOTICE_KINDS.DIAGNOSED,
        commit: 'aaa1111',
        verdict: 'obeyed',
        reason: 'a finding about the instrument',
      })
    ).resolves.toBeTruthy();
    const after = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');
    expect(after).toContain('DIAGNOSED');
  });

  it('AC7.3 — an unknown kind STILL throws after the vocabulary grew', async () => {
    const root = scratchProject();
    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    await expect(
      appendNotice(root, { kind: 'DIAGNOSTIC', commit: 'aaa1111', verdict: 'obeyed', reason: 'x' })
    ).rejects.toThrow(/unknown kind/i);
  });

  it('AC7.2 — the annotated record is byte-identical beneath its annotation', async () => {
    const root = scratchProject();
    await appendRunRecord(root, RECORD, { date: '2026-07-28', commit: 'aaa1111' });
    const before = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');

    await appendNotice(root, {
      kind: NOTICE_KINDS.DIAGNOSED,
      commit: 'aaa1111',
      verdict: 'obeyed',
      reason: 'unisolated: the control arm deleted one of five directive sites.',
    });
    const after = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8');

    // Not "starts with" alone — the record itself must be untouched, character
    // for character. A diagnosis that quietly edits its subject is not a
    // diagnosis, it is a retraction wearing one.
    expect(after.slice(0, before.length)).toBe(before);
  });
});

describe('M5.E15 S2 — the unisolated stamp on M5.E8s OBEYED record (FR7)', () => {
  const LOG = readFileSync(join(ROOT, '.planning', ADHERENCE_LOG), 'utf-8');

  it('AC7.1 — the OBEYED record at f3ca9b2 carries a DIAGNOSED annotation', () => {
    expect(LOG).toMatch(/> ### ⚠ DIAGNOSED — the `OBEYED` record at commit `f3ca9b2` above/);
  });

  it('AC7.2 — the annotation states the verdict is NOT retracted', () => {
    const block = LOG.slice(LOG.indexOf('DIAGNOSED — the `OBEYED` record at commit `f3ca9b2`'));
    expect(block).toMatch(/not\s+(?:being\s+)?retracted|is not falsified|not falsified/i);
  });

  it('AC7.2 — it says what was actually wrong: unisolated, not wrong', () => {
    const block = LOG.slice(LOG.indexOf('DIAGNOSED — the `OBEYED` record at commit `f3ca9b2`'));
    expect(block).toMatch(/unisolated/i);
    expect(block).toMatch(/0\/3|no leak was observed/i);
  });

  it('renders caveats inline so a verdict cannot ship without its scope', () => {
    const md = renderRunRecord(
      { ...RECORD, caveats: ['one canary is not a survey', 'N=3 is a weak split'] },
      { date: '2026-07-28', commit: 'abc1234' }
    );
    expect(md).toContain('Scope of this verdict');
    expect(md).toContain('one canary is not a survey');
  });

  it('an INERT verdict is recorded as a result, never as a failure to retry (NFR4)', async () => {
    const root = scratchProject();
    await appendRunRecord(root, { ...RECORD, verdict: 'inert' }, { date: '2026-07-28', commit: 'aaa1111' });
    const out = readFileSync(join(root, '.planning', ADHERENCE_LOG), 'utf-8').toLowerCase();
    expect(out).toContain('inert');
    expect(out).toMatch(/finding|caused nothing/);
  });
});
