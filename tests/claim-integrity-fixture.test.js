/**
 * tests/claim-integrity-fixture.test.js — the frozen field fixture stays the case it claims to be.
 *
 * The checks that READ this fixture land in S2. This file asserts only that the
 * fixture still carries the properties AC1.5 depends on, so that an edit which
 * quietly flattens one of them fails here rather than silently weakening a
 * downstream test into passing for the wrong reason.
 *
 * Deliberately does NOT reimplement the coverage diff. A fixture test that
 * computed the answer would be a second implementation of S2's check, which is
 * the drift this Epic's own S1 exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractRequirementIds } from '../plugin/tools/lib/requirement-ids.js';

const DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'claim-integrity');
const read = (f) => readFile(join(DIR, f), 'utf8');

describe('the frozen field fixture — AC S1.4', () => {
  it('records its provenance: source, date, and that it is never re-read', async () => {
    const readme = await read('README.md');
    expect(readme).toMatch(/eval-project-C/);
    expect(readme).toMatch(/2026-08-12/);
    expect(readme).toMatch(/never re-read from the source/i);
    // The limit of a derived fixture has to be stated, not left to be found.
    expect(readme).toMatch(/Not real/);
  });

  it('refers to its source only by the corpus label', async () => {
    // This repository is public and the source is a commercial specification.
    // The real name is kept out by `tests/private-name-guard.test.js`, which
    // checks the whole tree against a hashed denylist; what belongs HERE is the
    // positive half — the fixture speaks of its source the agreed way.
    const readme = await read('README.md');
    expect(readme).toMatch(/`eval-project-C`/);
    expect(readme).toMatch(/references\/eval-corpus\.md|eval corpus/i);

    // And the artifacts themselves name no project at all — not even the label.
    for (const f of [
      'field-REQUIREMENTS.md',
      'field-VERIFICATION-before.md',
      'field-VERIFICATION-after.md',
      'field-VALIDATION.md',
    ]) {
      expect((await read(f)).toLowerCase(), `${f} must name no project`).not.toContain(
        'eval-project'
      );
    }
  });
});

describe('the ID scheme Signal could not read before M5.E10', () => {
  it('is hyphenated and sub-numbered throughout', async () => {
    const ids = extractRequirementIds(await read('field-REQUIREMENTS.md'));
    expect(ids).toContain('AC-16.10');
    expect(ids).toContain('NFR-9.2');
    expect(ids).toContain('FR-16');
    // Not one Signal-style id anywhere: if the fixture drifts into `AC6.4`
    // shapes it stops covering the scheme it exists for.
    expect(ids.filter((id) => !id.includes('-'))).toEqual([]);
  });
});

describe('the shape that produced D-M5E10-6', () => {
  it('REQUIREMENTS is project-scoped and VERIFICATION is phase-scoped', async () => {
    const req = extractRequirementIds(await read('field-REQUIREMENTS.md'));
    const ver = extractRequirementIds(await read('field-VERIFICATION-before.md'));

    // Many units in one requirements file; one unit in the verification.
    const groupOf = (id) => id.replace(/^(N?FR|AC)-(\d+).*$/, '$1-$2');
    expect(new Set(req.map(groupOf)).size).toBeGreaterThan(10);
    expect([...new Set(ver.map(groupOf))].sort()).toEqual(['AC-16', 'NFR-9']);
  });

  it('carries the NFR-10 contamination trap — another unit that mentions this one', async () => {
    const content = await read('field-REQUIREMENTS.md');
    const nfr10 = content.slice(content.indexOf('### NFR-10'));

    // The section belongs to a DIFFERENT unit…
    expect(nfr10).toMatch(/### NFR-10 — Phase 13/);
    // …and mentions this one in its body, which is what disproved the first
    // version of the scoping rule. Both halves must survive for the trap to
    // still be a trap.
    expect(nfr10).toMatch(/Phase 11/);
    expect(extractRequirementIds(nfr10).length).toBeGreaterThan(8);
  });
});

describe('the two defects the fixture pins', () => {
  it('AC-16.3 is struck through and marked deferred out of the unit (D-M5E10-7)', async () => {
    const content = await read('field-REQUIREMENTS.md');
    expect(content).toMatch(/~~AC-16\.3[^~]*~~/);
    expect(content).toMatch(/\*\*DEFERRED out of Phase 11\.\*\*/);
  });

  it('the before/after delta is exactly NFR-9.2 — the real field fix', async () => {
    const before = extractRequirementIds(await read('field-VERIFICATION-before.md'));
    const after = extractRequirementIds(await read('field-VERIFICATION-after.md'));

    expect(after.filter((id) => !before.includes(id))).toEqual(['NFR-9.2']);
    expect(before.filter((id) => !after.includes(id))).toEqual([]);
  });

  it('the before copy asserts complete NFR coverage while omitting one', async () => {
    // The defect is not the omission alone — it is the omission underneath a
    // completeness claim. Without this sentence the fixture is just a gap.
    const before = await read('field-VERIFICATION-before.md');
    expect(before).toMatch(/All non-functional items for this phase are covered/);
    expect(extractRequirementIds(before)).not.toContain('NFR-9.2');
    // The claim is stated in prose that names no id — as it was in the source.
    // A claim carrying the group token would have been findable by grep, and
    // this defect's whole character is that nothing could see it.
    expect(extractRequirementIds(before)).not.toContain('NFR-9');
  });

  it('the AC-16 gap is present in BOTH copies — the amendment did not close it', async () => {
    // README says the "amended pair passes" half of AC1.5 does not hold on this
    // data. That claim is pinned here so it cannot quietly become false.
    for (const f of ['field-VERIFICATION-before.md', 'field-VERIFICATION-after.md']) {
      const ids = extractRequirementIds(await read(f));
      for (const missing of ['AC-16.1', 'AC-16.10']) {
        expect(ids, `${f} must not mention ${missing}`).not.toContain(missing);
      }
    }
  });
});
