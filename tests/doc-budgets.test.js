import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'tools/doc-budgets.json'), 'utf-8'));

const sizeOf = (rel) => statSync(join(ROOT, rel)).size;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/**
 * Byte ceilings for orientation documents, with a ratchet.
 *
 * The mechanism, and why it is shaped this way: a flat budget on this repository
 * fails on adoption day — CLAUDE.md, CONTEXT.md and STATE.md are all over any
 * sane limit right now — so it would never be adopted, which is how the existing
 * 40 KB advisory nudge ended up firing and being ignored for weeks. A ceiling
 * recorded at today's size, which may shrink but not grow, is adoptable
 * immediately AND is a visible debt register. That pairing is the borrowed idea
 * (analysis/OPENKB-ASSESSMENT.md §1).
 */
describe('doc budgets — orientation documents may shrink, never grow', () => {
  const entries = Object.entries(MANIFEST.orientation);

  it('governs a non-empty population (this check is not vacuous)', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [rel] of entries) {
      expect(existsSync(join(ROOT, rel)), `${rel} is budgeted but does not exist`).toBe(true);
    }
  });

  it.each(entries)('%s stays at or under its ceiling', (rel, spec) => {
    const actual = sizeOf(rel);
    expect(
      actual,
      `${rel} is ${kb(actual)}, over its ceiling of ${kb(spec.ceiling)}.\n` +
        `This file is read to get oriented, so its size is paid in context on every run.\n` +
        `Shrink it, or — if the growth is genuinely load-bearing — raise the ceiling in ` +
        `tools/doc-budgets.json and say why in the same change.`,
    ).toBeLessThanOrEqual(spec.ceiling);
  });

  // THE RATCHET, and it applies ONLY to grandfathered files. A ceiling recorded
  // because a file was already over budget is a licence to sit at today's size
  // unless shrinking re-tightens it. A healthy file under target is a different
  // case entirely: it has legitimate room to grow up to its target, and
  // ratcheting it to its exact current size would fail on any ordinary edit.
  const grandfathered = entries.filter(([, spec]) => spec.grandfathered);
  it.each(grandfathered)('%s ceiling is re-tightened once the file shrinks', (rel, spec) => {
    const actual = sizeOf(rel);
    const slack = MANIFEST.slackBytes;
    expect(
      actual,
      `${rel} is now ${kb(actual)}, well under its recorded ceiling of ${kb(spec.ceiling)}.\n` +
        `Lower the ceiling in tools/doc-budgets.json to lock the improvement in ` +
        `(and drop "grandfathered" if it is now at or under its ${kb(spec.target)} target).`,
    ).toBeGreaterThan(spec.ceiling - slack);
  });

  it('records a reason for every grandfathered file, so the debt is legible', () => {
    for (const [rel, spec] of entries) {
      if (!spec.grandfathered) continue;
      expect(spec.ceiling, `${rel} is grandfathered but not actually over target`).toBeGreaterThan(
        spec.target,
      );
      expect(spec.reason?.length ?? 0, `${rel} is grandfathered with no reason`).toBeGreaterThan(20);
    }
  });
});

/**
 * The population check. A manifest nobody maintains is worse than no manifest,
 * because it reads as coverage. This fails when a large document exists that
 * has been neither budgeted nor deliberately exempted — so the answer to "is
 * this file considered?" is always yes or a test failure, never silence.
 */
describe('doc budgets — every large document is either budgeted or deliberately exempt', () => {
  const known = new Set([...Object.keys(MANIFEST.orientation), ...Object.keys(MANIFEST.exempt)]);

  const candidates = () => {
    const out = [];
    for (const rel of ['CLAUDE.md', 'README.md', 'CHANGELOG.md']) {
      if (existsSync(join(ROOT, rel))) out.push(rel);
    }
    const planning = join(ROOT, '.planning');
    if (existsSync(planning)) {
      for (const name of readdirSync(planning)) {
        if (name.endsWith('.md')) out.push(`.planning/${name}`);
      }
    }
    const patterns = MANIFEST.exemptPatterns.map((p) => new RegExp(p.pattern));
    const isPerUnitArtifact = (rel) => {
      const base = rel.slice(rel.lastIndexOf('/') + 1);
      return patterns.some((re) => re.test(base));
    };
    return out
      .filter((rel) => sizeOf(rel) >= MANIFEST.populationThresholdBytes)
      .filter((rel) => !isPerUnitArtifact(rel));
  };

  it('finds a non-empty population to govern', () => {
    expect(candidates().length).toBeGreaterThan(0);
  });

  it('leaves no large document unconsidered', () => {
    const unconsidered = candidates().filter((rel) => !known.has(rel));
    expect(
      unconsidered,
      `These documents are over ${kb(MANIFEST.populationThresholdBytes)} and appear in neither ` +
        `"orientation" nor "exempt" in tools/doc-budgets.json.\n` +
        `Add each one: a ceiling if it is read for orientation, or an exemption with a reason if ` +
        `it is an append-only ledger whose size is managed by archiving.`,
    ).toEqual([]);
  });

  it('every exemption states a reason — named files and patterns alike', () => {
    for (const [rel, reason] of Object.entries(MANIFEST.exempt)) {
      expect(reason.length, `${rel} is exempt with no reason`).toBeGreaterThan(20);
    }
    for (const { pattern, reason } of MANIFEST.exemptPatterns) {
      expect(reason?.length ?? 0, `pattern ${pattern} is exempt with no reason`).toBeGreaterThan(20);
      expect(() => new RegExp(pattern), `pattern ${pattern} is not valid`).not.toThrow();
    }
  });

  it('the per-unit patterns match real artifacts and NOT the orientation set', () => {
    const patterns = MANIFEST.exemptPatterns.map((p) => new RegExp(p.pattern));
    const matches = (name) => patterns.some((re) => re.test(name));
    // Has teeth: these are real filenames in this repo.
    expect(matches('M5.E7-SUPPLY-GSTACK.md')).toBe(true);
    expect(matches('MILESTONE-5.md')).toBe(true);
    expect(matches('BACKLOG-REVIEW-2026-08-09.md')).toBe(true);
    // Must never swallow a budgeted orientation document.
    for (const rel of Object.keys(MANIFEST.orientation)) {
      const base = rel.slice(rel.lastIndexOf('/') + 1);
      expect(matches(base), `${rel} is budgeted but a pattern exempts it`).toBe(false);
    }
  });
});
