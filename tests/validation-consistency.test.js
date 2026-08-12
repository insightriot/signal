/**
 * tests/validation-consistency.test.js — FR2, a VALIDATION artifact against itself.
 *
 * The field defect was one file contradicting itself that nothing read: its
 * completeness dimension assigned requirements to slices that its own Nyquist
 * map carried no row for, under a coverage line reporting zero gaps.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkValidationConsistency, CONSISTENCY } from '../tools/lib/validation-consistency.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const fixture = (f) =>
  readFile(join(ROOT, 'tests', 'fixtures', 'claim-integrity', f), 'utf8');

const doc = (completeness, nyquist) =>
  [
    '# VALIDATION',
    '',
    '## 2. Completeness — every requirement has an owning slice',
    '',
    completeness,
    '',
    '## 9. Nyquist test-coverage map',
    '',
    nyquist,
    '',
  ].join('\n');

describe('AC2.1 — the two sections are compared, and disagreement fails', () => {
  it('CONSISTENT when every assigned requirement has a map row', () => {
    const r = checkValidationConsistency(
      doc('| AC1.1 | S1 |\n| AC1.2 | S2 |', '| AC1.1 | S1 | unit |\n| AC1.2 | S2 | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.CONSISTENT);
    expect(r.assignedNotMapped).toEqual([]);
  });

  it('INCONSISTENT, naming the requirement assigned a slice but never mapped', () => {
    const r = checkValidationConsistency(
      doc('| AC1.1 | S1 |\n| AC1.2 | S2 |\n| NFR1 | S2 |', '| AC1.1 | S1 | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.INCONSISTENT);
    expect(r.assignedNotMapped).toEqual(['NFR1', 'AC1.2']);
  });

  it('also names a mapped requirement that dimension 2 never assigned', () => {
    const r = checkValidationConsistency(
      doc('| AC1.1 | S1 |', '| AC1.1 | S1 | unit |\n| AC1.2 | S2 | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.INCONSISTENT);
    expect(r.mappedNotAssigned).toEqual(['AC1.2']);
  });
});

describe('narration inside a compared section is not data', () => {
  it('reads table rows only — a sentence mentioning a requirement does not cover it', () => {
    // Found while building the sandbox fixture: an explanatory sentence placed
    // inside the Nyquist section made its requirement look mapped.
    const r = checkValidationConsistency(
      doc(
        '| AC1.1 | S1 |\n| AC1.2 | S2 |',
        '| AC1.1 | S1 | unit |\n\nAC1.2 has no row here, deliberately.'
      )
    );
    expect(r.outcome).toBe(CONSISTENCY.INCONSISTENT);
    expect(r.assignedNotMapped).toEqual(['AC1.2']);
  });
});

describe('ID shorthand — the field artifact writes the prefix once', () => {
  it('resolves a bare 16.7 against the AC-16 ids the file already declares', () => {
    const r = checkValidationConsistency(
      doc('| AC-16.6→S3, 16.7→S2 | — |', '| 16.6 | x | unit |\n| 16.7 | y | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.CONSISTENT);
  });

  it('resolves a bare 9.2 to NFR-9.2 when the file declares NFR-9 ids', () => {
    const r = checkValidationConsistency(
      doc('| NFR-9.1→S3, 9.2→S4 | — |', '| NFR-9.1 | x | unit |\n| NFR-9.2 | y | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.CONSISTENT);
  });

  it('expands an en-dash range — AC1.1–1.3 is three requirements', () => {
    const r = checkValidationConsistency(
      doc('| AC1.1 | S1 |\n| AC1.2 | S1 |\n| AC1.3 | S1 |', '| AC1.1–1.3 | S1 | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.CONSISTENT);
  });
});

describe('rules that stop the check inventing contradictions', () => {
  it('an FR whose criteria are mapped is not itself an unmapped requirement', () => {
    // Signal's own convention: dimension 2 lists `FR1` beside `AC1.1`/`AC1.2`,
    // and the map maps the CRITERIA. Read literally this turned 4 clean
    // artifacts in Signal's corpus into "inconsistent".
    const r = checkValidationConsistency(
      doc('| FR1 | S1 |\n| AC1.1 | S1 |\n| AC1.2 | S1 |', '| AC1.1 | S1 | unit |\n| AC1.2 | S1 | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.CONSISTENT);
  });

  it('resolves a bare 6.1 even when the group also has an FR6 heading', () => {
    // A bare `6.1` cannot mean `FR6` — only sub-numbered ids can be written in
    // shorthand — so the ambiguity is only apparent. Requiring a single family
    // outright reported `AC1.5` and `AC6.1` as unmapped when both were mapped.
    const r = checkValidationConsistency(
      doc('| FR6 | S1 |\n| AC6.1 | S1 |', '| AC1.4, 6.1 | S1 | unit |\n| AC1.4 | S1 | unit |')
    );
    expect(r.assignedNotMapped).not.toContain('AC6.1');
  });

  it('compares AC-16.1 and AC16.1 as one requirement, and reports the original spelling', () => {
    const r = checkValidationConsistency(
      doc('| AC-16.1 | S1 |\n| AC-16.2 | S1 |', '| AC16.1 | S1 | unit |')
    );
    expect(r.assignedNotMapped).toEqual(['AC-16.2']);
  });
});

describe('AC2.2 / NFR4 — three outcomes; a shape it cannot read is never "clean"', () => {
  it('CANNOT_EVALUATE when the two sections share no id at all', () => {
    // One keyed by requirement, one by slice: almost certainly two namespaces,
    // not every row contradicting. A wall of findings here would be the check
    // manufacturing the defect it exists to catch.
    const r = checkValidationConsistency(
      doc('| FR1.1 | S1 |\n| FR1.2 | S1 |', '| AC53.1 | S1 | unit |\n| AC53.2 | S1 | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/different namespaces/i);
  });

  it('CANNOT_EVALUATE when the completeness dimension is absent', () => {
    const r = checkValidationConsistency('# V\n\n## 9. Nyquist map\n\n| AC1.1 | S1 | unit |\n');
    expect(r.outcome).toBe(CONSISTENCY.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/completeness/i);
  });

  it('CANNOT_EVALUATE when the Nyquist map is absent', () => {
    const r = checkValidationConsistency('# V\n\n## 2. Completeness\n\n| AC1.1 | S1 |\n');
    expect(r.outcome).toBe(CONSISTENCY.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/nyquist/i);
  });

  it('CANNOT_EVALUATE when a section yields no requirement ids at all', () => {
    // Signal's own maps key rows by SLICE id (`S1.1`), a different namespace.
    // Guessing an alignment there would invent contradictions; refusing is the
    // honest answer, and it is reported rather than passed over.
    const r = checkValidationConsistency(
      doc('| AC1.1 | S1 |', '| S1.1 | S1.t1 | unit |\n| S1.2 | S1.t2 | unit |')
    );
    expect(r.outcome).toBe(CONSISTENCY.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/no requirement ids/i);
  });

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, 42, {}, '']) {
      expect(checkValidationConsistency(bad).outcome).toBe(CONSISTENCY.CANNOT_EVALUATE);
    }
  });
});

describe('AC2.3 — the field fixture', () => {
  it('fails, naming the four criteria assigned a slice and never mapped', async () => {
    const r = checkValidationConsistency(await fixture('field-VALIDATION.md'));
    expect(r.outcome).toBe(CONSISTENCY.INCONSISTENT);
    expect(r.assignedNotMapped).toEqual(
      expect.arrayContaining(['AC-16.1', 'AC-16.2', 'AC-16.4', 'AC-16.5'])
    );
  });

  it('does not report the shorthand ids as contradictions — they are the same requirements', async () => {
    const r = checkValidationConsistency(await fixture('field-VALIDATION.md'));
    for (const id of ['AC-16.6', 'AC-16.7', 'AC-16.8', 'NFR-9.2', 'NFR-9.3']) {
      expect(r.assignedNotMapped, `${id} is mapped, in shorthand`).not.toContain(id);
    }
  });

  it('reports the deferred requirement separately from the contradictions', async () => {
    // AC-16.3 is assigned no slice and mapped no row *because the document says
    // it was deferred*. Counting it as a contradiction would be the check being
    // wrong on the artifact it was built from.
    const r = checkValidationConsistency(await fixture('field-VALIDATION.md'));
    expect(r.assignedNotMapped).not.toContain('AC-16.3');
    expect(r.deferred).toContain('AC-16.3');
  });
});

describe('the sandbox corpus shape', () => {
  it('fails on the sandbox VALIDATION, which contradicts itself in two directions', async () => {
    const content = await readFile(
      join(ROOT, 'examples', 'sandbox', '.planning', 'M1.E4-VALIDATION.md'),
      'utf8'
    );
    const r = checkValidationConsistency(content);
    expect(r.outcome).toBe(CONSISTENCY.INCONSISTENT);
    expect(r.assignedNotMapped).toEqual(['NFR1']);
  });
});
