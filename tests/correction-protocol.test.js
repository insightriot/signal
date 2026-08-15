/**
 * tests/correction-protocol.test.js — FR4 (M5.E10 S5.t1).
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkCorrectionProtocol,
  correctionGateSeverity,
  lineSelfCorrects,
  CORRECTION,
} from '../plugin/tools/lib/correction-protocol.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const CLAIM = 'the amended pair passes';

describe('AC4.2 — the LINE is the unit, not the file', () => {
  it('fails when the correction sits three lines below the false claim', () => {
    // The whole point. `grep -rn` prints one line; a reader sees the claim and
    // takes it. This is how the field defect propagated VERIFY → REVIEW.
    const content = [
      'Replaying the pair fails the check.',
      'The amended pair passes.',
      '',
      '',
      '**Correction:** the amended pair does not pass — eight criteria remain unmapped.',
    ].join('\n');

    const r = checkCorrectionProtocol({ claim: CLAIM, files: [{ path: 'a.md', content }] });
    expect(r.outcome).toBe(CORRECTION.UNCORRECTED);
    expect(r.uncorrected).toHaveLength(1);
    expect(r.uncorrected[0].line).toBe(2);
  });

  it('passes when the same line retracts itself (AC4.3)', () => {
    // Amend-never-rewrite and "the grep must come back clean" are only
    // compatible if the matching line is self-correcting rather than absent.
    const content = [
      'Replaying the pair fails the check.',
      '~~The amended pair passes.~~ **[RETRACTED — eight criteria remain unmapped.]**',
    ].join('\n');

    const r = checkCorrectionProtocol({ claim: CLAIM, files: [{ path: 'a.md', content }] });
    expect(r.outcome).toBe(CORRECTION.CLEAN);
    expect(r.corrected).toHaveLength(1);
  });

  it('names the file, the line number and the text — never just a count', () => {
    const r = checkCorrectionProtocol({
      claim: CLAIM,
      files: [{ path: 'docs/x.md', content: 'x\nThe amended pair passes today.\n' }],
    });
    expect(r.uncorrected[0]).toMatchObject({ path: 'docs/x.md', line: 2 });
    expect(r.uncorrected[0].text).toContain('amended pair passes');
  });
});

describe('AC4.1 — root AND carriers, not the files that happened to be open', () => {
  it('searches every file it is given and reports each carrier separately', () => {
    const files = [
      { path: 'root.md', content: '~~The amended pair passes.~~ **[RETRACTED]**' },
      { path: 'carrier-1.md', content: 'As established above, the amended pair passes.' },
      { path: 'carrier-2.md', content: 'Per root.md, the amended pair passes.' },
    ];
    const r = checkCorrectionProtocol({ claim: CLAIM, files });
    // The root was corrected and the two restatements were not — which is the
    // failure mode: correcting where you noticed, not where it spread.
    expect(r.uncorrected.map((u) => u.path)).toEqual(['carrier-1.md', 'carrier-2.md']);
    expect(r.corrected.map((c) => c.path)).toEqual(['root.md']);
  });

  it('accepts a regex, so restatements can be matched as a family', () => {
    const r = checkCorrectionProtocol({
      claim: /amended pair (?:passes|is clean|holds)/i,
      files: [{ path: 'a.md', content: 'the amended pair is clean\nthe amended pair holds\n' }],
    });
    expect(r.uncorrected).toHaveLength(2);
  });
});

describe('lineSelfCorrects — what counts as a retraction', () => {
  it('accepts strike-through, RETRACTED, SUPERSEDED, "no longer true"', () => {
    expect(lineSelfCorrects('~~claim~~')).toBe(true);
    expect(lineSelfCorrects('claim — **[RETRACTED]**')).toBe(true);
    expect(lineSelfCorrects('claim (SUPERSEDED by D-2)')).toBe(true);
    expect(lineSelfCorrects('claim — no longer true')).toBe(true);
  });

  it('does not accept a bare mention of a correction elsewhere', () => {
    expect(lineSelfCorrects('claim (see the correction below)')).toBe(false);
    expect(lineSelfCorrects('claim')).toBe(false);
  });
});

describe('NFR4 — three outcomes; an unsearchable corpus is not a clean one', () => {
  it('returns cannot-evaluate when there are no files to search', () => {
    const r = checkCorrectionProtocol({ claim: CLAIM, files: [] });
    expect(r.outcome).toBe(CORRECTION.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/not the same as clean/);
  });

  it('refuses an empty claim rather than matching every line', () => {
    expect(checkCorrectionProtocol({ claim: '   ', files: [{ path: 'a', content: 'x' }] }).outcome).toBe(
      CORRECTION.CANNOT_EVALUATE
    );
  });

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, {}, { claim: 42, files: 'no' }]) {
      expect(checkCorrectionProtocol(bad).outcome).toBe(CORRECTION.CANNOT_EVALUATE);
    }
  });
});

describe('AC4.4 / D-M5E10-3 — blocks at FULL, advisory below', () => {
  const uncorrected = { outcome: CORRECTION.UNCORRECTED };

  it('blocks at FULL', () => {
    expect(correctionGateSeverity(uncorrected, 'FULL')).toEqual({ blocks: true, severity: 'blocking' });
  });

  it('is advisory at every other tier', () => {
    for (const tier of ['SKETCH', 'FEATURE', 'SPIKE']) {
      expect(correctionGateSeverity(uncorrected, tier)).toEqual({ blocks: false, severity: 'advisory' });
    }
  });

  it('cannot-evaluate never blocks, at any tier', () => {
    // Refusing to ship because a check could not look is a different failure,
    // and a worse one.
    for (const tier of ['FULL', 'FEATURE']) {
      expect(correctionGateSeverity({ outcome: CORRECTION.CANNOT_EVALUATE }, tier).blocks).toBe(false);
    }
  });
});

describe('a retraction this Epic actually wrote', () => {
  it('DECISIONS.md carries no uncorrected assertion of the scoping rule it retracted', async () => {
    // D-M5E10-6 originally scoped FR1's denominator to "sections whose heading
    // or body names the unit". Measurement killed it. The retraction has to
    // hold at line granularity in the file that made the claim.
    const decisions = await readFile(join(ROOT, '.planning', 'DECISIONS.md'), 'utf8');
    const r = checkCorrectionProtocol({
      claim: 'heading or body names the unit',
      files: [{ path: '.planning/DECISIONS.md', content: decisions }],
    });
    expect(r.uncorrected).toEqual([]);
    // NOT vacuous. The first version of this test searched for a phrase that
    // WRAPS across two lines, matched nothing, and passed — "clean" and "never
    // looked" rendering identically, in the test suite of the Epic built to
    // stop exactly that. The denominator is asserted here so the assertion
    // cannot pass by finding nothing.
    expect(r.corrected.length).toBeGreaterThan(0);
  });

  it('a claim that WRAPS across lines is invisible — the limit, pinned', () => {
    // Coherent with the threat model (grep is equally blind to a phrase
    // spanning a newline) and a genuine hole in any use of this as a general
    // corpus audit. Pinned so it stays a known limit rather than a surprise.
    const wrapped = 'the amended pair\npasses cleanly';
    const r = checkCorrectionProtocol({
      claim: 'the amended pair passes',
      files: [{ path: 'a.md', content: wrapped }],
    });
    expect(r.outcome).toBe(CORRECTION.CLEAN);
    expect(r.corrected).toEqual([]);
    expect(r.uncorrected).toEqual([]);
  });
});
