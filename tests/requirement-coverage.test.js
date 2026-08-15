/**
 * tests/requirement-coverage.test.js — FR1's requirement-coverage diff.
 *
 * Every requirement declared in a REQUIREMENTS artifact must appear in the
 * matching VERIFICATION artifact. The check has THREE outcomes and names what
 * is missing, because a count alone is what let the field defect through.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffRequirementCoverage, COVERAGE } from '../plugin/tools/lib/requirement-coverage.js';

const FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'claim-integrity');
const fixture = (f) => readFile(join(FIXTURES, f), 'utf8');

describe('AC1.3 / NFR4 — three outcomes, and "could not look" is never "clean"', () => {
  it('reports COVERED when every declared requirement is verified', () => {
    const r = diffRequirementCoverage({
      requirementsText: '- FR1 — a thing\n- AC1.1 — another\n',
      verificationText: '| FR1 | done |\n| AC1.1 | done |\n',
    });
    expect(r.outcome).toBe(COVERAGE.COVERED);
    expect(r.missing).toEqual([]);
  });

  it('reports MISSING and NAMES the ids — a count does not satisfy AC1.2', () => {
    const r = diffRequirementCoverage({
      requirementsText: '- FR1\n- AC1.1\n- AC1.2\n',
      verificationText: '| FR1 | done |\n',
    });
    expect(r.outcome).toBe(COVERAGE.MISSING);
    expect(r.missing).toEqual(['AC1.1', 'AC1.2']);
  });

  it('reports CANNOT_EVALUATE with a reason when the REQUIREMENTS artifact is absent', () => {
    const r = diffRequirementCoverage({ requirementsText: null, verificationText: '| FR1 |' });
    expect(r.outcome).toBe(COVERAGE.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/no REQUIREMENTS/i);
    // The distinction this Epic exists for: absent is not clean.
    expect(r.missing).toEqual([]);
    expect(r.covered).toEqual([]);
  });

  it('reports CANNOT_EVALUATE when the REQUIREMENTS artifact declares no ids', () => {
    const r = diffRequirementCoverage({
      requirementsText: '# Requirements\n\nSome prose with no id scheme at all.\n',
      verificationText: '| FR1 | done |',
    });
    expect(r.outcome).toBe(COVERAGE.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/no requirement ids/i);
  });

  it('reports CANNOT_EVALUATE when VERIFICATION cites nothing to scope against', () => {
    const r = diffRequirementCoverage({
      requirementsText: '- FR1\n- AC1.1\n',
      verificationText: '# Verification\n\nEverything passed.\n',
    });
    expect(r.outcome).toBe(COVERAGE.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/cites no requirement ids/i);
  });

  it('NFR3 — malformed input yields cannot-evaluate, never a throw', () => {
    for (const bad of [undefined, 42, {}, []]) {
      const r = diffRequirementCoverage({ requirementsText: bad, verificationText: bad });
      expect(r.outcome).toBe(COVERAGE.CANNOT_EVALUATE);
    }
  });
});

describe('AC1.6 — the denominator is derived by ID-group correspondence, and reported', () => {
  const MULTI = [
    '### FR-1 — other unit',
    '- AC-1.1 — x',
    '- AC-1.2 — y',
    '### FR-16 — this unit',
    '- AC-16.1 — a',
    '- AC-16.2 — b',
    '- AC-16.3 — c',
  ].join('\n');

  it('scopes to the groups VERIFICATION cites, excluding every other unit', () => {
    const r = diffRequirementCoverage({
      requirementsText: MULTI,
      verificationText: '| AC-16.1 | done |',
    });
    // AC-1.1 / AC-1.2 belong to a group this artifact never cites.
    expect(r.missing).toEqual(['AC-16.2', 'AC-16.3']);
    // `FR-16` itself is absent by the same rule as `NFR-9` below: a group id
    // whose sub-numbered criteria exist is the heading, and the criteria are
    // what gets verified.
    expect(r.denominator).toEqual(['AC-16.1', 'AC-16.2', 'AC-16.3']);
  });

  it('states the basis it used, so the denominator is never taken on trust', () => {
    const r = diffRequirementCoverage({
      requirementsText: MULTI,
      verificationText: '| AC-16.1 | done |',
    });
    // One group, not two: `AC-16.*` are the criteria OF `FR-16`, so they share
    // a group key. Keying them apart scoped a unit's criteria out of its own
    // denominator — caught by the RED for the first assertion in this file.
    expect(r.basis.groups).toEqual(['FR-16']);
    expect(r.basis.scoped).toBe(true);
  });

  it('reports groups it could not attribute rather than passing over them', () => {
    // The blind spot named in D-M5E10-6: a group VERIFICATION cites nothing
    // from is invisible to the diff. Invisible to the DIFF, not to the reader.
    const r = diffRequirementCoverage({
      requirementsText: MULTI,
      verificationText: '| AC-16.1 | done |',
    });
    expect(r.unattributableGroups).toEqual(['FR-1']);
  });

  it('a single-unit REQUIREMENTS file is not "scoped" — the whole file is the denominator', () => {
    const r = diffRequirementCoverage({
      requirementsText: '- FR1\n- AC1.1\n- AC1.2\n',
      verificationText: '| AC1.1 | done |',
    });
    expect(r.basis.scoped).toBe(false);
    expect(r.missing).toEqual(['AC1.2']); // FR1 is the group heading, not a criterion
  });
});

describe('AC1.7 — a requirement the document defers is not a requirement it missed', () => {
  it('separates struck-through deferred ids from missing ones, and names both', () => {
    const r = diffRequirementCoverage({
      requirementsText: [
        '- AC-16.1 — a',
        '- ~~AC-16.2 (a thing)~~ — **DEFERRED out of this phase.**',
        '- AC-16.3 — c',
      ].join('\n'),
      verificationText: '| AC-16.1 | done |',
    });
    expect(r.missing).toEqual(['AC-16.3']);
    expect(r.deferred).toEqual(['AC-16.2']);
    // Named, never silently dropped — dropping it would be B39's shape.
    expect(r.outcome).toBe(COVERAGE.MISSING);
  });

  it('a deferred id that IS verified is still reported as covered, not deferred', () => {
    const r = diffRequirementCoverage({
      requirementsText: '- ~~AC-16.2~~ — **DEFERRED**\n- AC-16.1 — a\n',
      verificationText: '| AC-16.1 | done |\n| AC-16.2 | done after all |',
    });
    expect(r.deferred).toEqual([]);
    expect(r.outcome).toBe(COVERAGE.COVERED);
  });
});

describe('the bare group token is a label, not a criterion', () => {
  it('does not count NFR-9 as a requirement when NFR-9.1… exist', () => {
    const r = diffRequirementCoverage({
      requirementsText: '### NFR-9 — ops hygiene\n- NFR-9.1 — a\n- NFR-9.2 — b\n',
      verificationText: '| NFR-9.1 | done |\n| NFR-9.2 | done |',
    });
    expect(r.denominator).toEqual(['NFR-9.1', 'NFR-9.2']);
    expect(r.outcome).toBe(COVERAGE.COVERED);
  });

  it('but DOES count it when the group has no sub-numbered children', () => {
    const r = diffRequirementCoverage({
      requirementsText: '### NFR-9 — ops hygiene, one line\n',
      verificationText: '| NFR-9 | done |',
    });
    expect(r.denominator).toEqual(['NFR-9']);
    expect(r.outcome).toBe(COVERAGE.COVERED);
  });
});

describe('AC1.5 — the field case', () => {
  it('the pre-amendment artifact FAILS, naming NFR-9.2 among the missing', async () => {
    const r = diffRequirementCoverage({
      requirementsText: await fixture('field-REQUIREMENTS.md'),
      verificationText: await fixture('field-VERIFICATION-before.md'),
    });
    expect(r.outcome).toBe(COVERAGE.MISSING);
    expect(r.missing).toContain('NFR-9.2');
  });

  it('the amendment closes the defect it addressed — NFR-9.2 is no longer missing', async () => {
    const r = diffRequirementCoverage({
      requirementsText: await fixture('field-REQUIREMENTS.md'),
      verificationText: await fixture('field-VERIFICATION-after.md'),
    });
    expect(r.missing).not.toContain('NFR-9.2');
  });

  it('and does not pretend the AC-16 gap closed with it', async () => {
    const r = diffRequirementCoverage({
      requirementsText: await fixture('field-REQUIREMENTS.md'),
      verificationText: await fixture('field-VERIFICATION-after.md'),
    });
    expect(r.outcome).toBe(COVERAGE.MISSING);
    expect(r.missing).toEqual(expect.arrayContaining(['AC-16.1', 'AC-16.10']));
    // AC-16.3 is struck out of the phase — reported, but not as a miss.
    expect(r.deferred).toEqual(['AC-16.3']);
    expect(r.missing).not.toContain('AC-16.3');
  });

  it('the foreign unit that merely MENTIONS this one never enters the denominator', async () => {
    // NFR-10 is Phase 13's section; it cites NFR-9.1 / NFR-9.2 as inherited.
    // Prose-scoping pulled its 8+ ids in; group correspondence must not.
    const r = diffRequirementCoverage({
      requirementsText: await fixture('field-REQUIREMENTS.md'),
      verificationText: await fixture('field-VERIFICATION-before.md'),
    });
    expect(r.denominator.filter((id) => id.startsWith('NFR-10'))).toEqual([]);
    expect(r.unattributableGroups).toContain('NFR-10');
  });
});

describe('REVIEW finding — one requirement, two spellings (M5.E10 REVIEW)', () => {
  it('`AC-16.1` in REQUIREMENTS is covered by `AC16.1` in VERIFICATION', () => {
    // Found at REVIEW: this module compared raw strings while its sibling
    // checkValidationConsistency — same extractor, same slice — canonicalized.
    // A punctuation variant reported `missing`, which is a red wall derived
    // from spelling: this module's own stated failure mode one layer down.
    const r = diffRequirementCoverage({
      requirementsText: '# R\n\n- **AC-16.1** a\n- **AC-16.2** b\n',
      verificationText: '# V\n\n| AC16.1 | x |\n| AC-16.2 | y |\n',
    });
    expect(r.outcome).toBe(COVERAGE.COVERED);
    expect(r.missing).toEqual([]);
    // Reported in the ORIGINAL spelling — an id the reader cannot find in
    // their own file is worse than no report.
    expect(r.covered).toEqual(['AC-16.1', 'AC-16.2']);
  });

  it('a deferred id matches across spellings too', () => {
    const r = diffRequirementCoverage({
      requirementsText: '# R\n\n- ~~AC-16.3~~ deferred out of the unit\n- **AC-16.1** a\n',
      verificationText: '# V\n\n| AC16.1 | x |\n',
    });
    expect(r.outcome).toBe(COVERAGE.COVERED);
    expect(r.deferred).toEqual(['AC-16.3']);
  });
});
