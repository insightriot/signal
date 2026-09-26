import { describe, it, expect } from 'vitest';

import { renderResumeBriefing, formatJevResumeLine } from '../plugin/tools/lib/resume.js';
import { makeReceipt } from '../plugin/tools/lib/receipt.js';

/**
 * M6.E3 t1.6 — /sig:resume shows the Jev check in ONE advisory line (AC10.1),
 * below the trust banners, and the briefing survives any failure (AC10.4).
 */

const receipt = (line, excerpt) => makeReceipt({
  claim: { file: '.planning/STATE.md', line, excerpt },
  evidence: { source: '.planning/STATE.md frontmatter', line: 5, excerpt: 'in flight: M6.E8, at its SHIP phase' },
});

const finding = (line, excerpt, confidence) => ({
  check: 'state-narrative-jev', healCategory: 3, file: '.planning/STATE.md', message: 'm',
  receipt: receipt(line, excerpt), judgedBy: { model: 'jev-1.13.0', confidence },
});

const report = (row) => ({ results: [{ id: 'state-narrative-jev', healCategory: 3, reason: null, ...row }], summary: {} });

const COVER = { checked: 18, total: 20, unchecked: [{ line: 90, reason: 'budget' }, { line: 95, reason: 'budget' }], model: 'jev-1.13.0' };

describe('formatJevResumeLine', () => {
  it('findings → one line: count, coverage, the most confident excerpt, and that it is a judgment', () => {
    const line = formatJevResumeLine(report({
      status: 'findings', coverage: COVER,
      findings: [finding(71, '**Nothing is in flight.** `M6.E3` is PLANNED AND PARKED', 0.99), finding(111, '**Nothing is in flight.**', 0.4)],
    }));
    expect(line.split('\n')).toHaveLength(1);
    expect(line).toMatch(/^⚠ Jev: 2 STATE\.md paragraphs may contradict the facts \(checked 18 of 20; 2 not checked \(budget\)\)/);
    expect(line).toContain('STATE.md:71');
    expect(line).toContain('0.99');
    expect(line).toMatch(/can vary/);
  });

  it('clean with full coverage → a single ✓ line naming the coverage', () => {
    const line = formatJevResumeLine(report({ status: 'clean', findings: [], coverage: { ...COVER, checked: 20, unchecked: [] } }));
    expect(line).toBe('✓ Jev: no STATE.md paragraph contradicts the facts (checked 20 of 20).');
  });

  it('clean but partial → says what was not checked; partial is not clean', () => {
    const line = formatJevResumeLine(report({ status: 'clean', findings: [], coverage: COVER }));
    expect(line).toMatch(/checked 18 of 20.*2 not checked \(budget\)/);
  });

  it('no key → nothing at all (the briefing is capped; SHIP says it did not run)', () => {
    expect(formatJevResumeLine(report({ status: 'cannot-evaluate', findings: [], reason: 'the Jev check did not run — TYPESAFE_API_KEY is not set' }))).toBeNull();
  });

  it('key set but the call failed → "did not run" with the reason', () => {
    const line = formatJevResumeLine(report({ status: 'cannot-evaluate', findings: [], reason: 'the check threw — the Jev check did not run — unauthorized' }));
    expect(line).toMatch(/^Jev check did not run: .*unauthorized/);
  });

  it('null / malformed input → null, never a throw', () => {
    expect(formatJevResumeLine(null)).toBeNull();
    expect(formatJevResumeLine({})).toBeNull();
  });
});

describe('renderResumeBriefing places it in the advisory tier (AC10.1)', () => {
  const base = {
    cwd: '/p', profile: { tier: 'FULL', rigor_overrides: {}, phases_skipped: [] },
    state: { phase: 'PLAN', completed_phases: [], current_tasks: [] },
  };

  it('renders the line below the trust banners and above the body', () => {
    const out = renderResumeBriefing({
      ...base,
      isStaleResult: { stale: true, commitCount: 3 },
      jevResult: report({ status: 'findings', coverage: COVER, findings: [finding(71, 'x', 0.9)] }),
    });
    const jevAt = out.indexOf('⚠ Jev:');
    expect(jevAt).toBeGreaterThan(-1);
    expect(jevAt).toBeGreaterThan(out.indexOf('STATE.md is'));
    expect(jevAt).toBeLessThan(out.indexOf('== Project Briefing =='));
  });

  it('adds nothing when jevResult is absent', () => {
    expect(renderResumeBriefing(base)).not.toContain('Jev');
  });
});
