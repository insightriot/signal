/**
 * tests/published-facts-s4.test.js — M6.E2 S4.
 *
 * Reach was recorded in each check's `describe` — a field nothing rendered. A
 * figure published where no reader encounters it is this Epic's own defect, so
 * S4 is the slice that makes it visible without turning the report into noise.
 */

import { describe, it, expect } from 'vitest';
import { renderDriftReport, STATUS, HEAL } from '../plugin/tools/lib/state-drift.js';
import { REACH, PUBLISHED_FACT_CHECKS } from '../plugin/tools/lib/published-facts.js';

const result = (id, status, extra = {}) => ({
  id,
  healCategory: HEAL.NEEDS_A_PERSON,
  status,
  findings: [],
  ...extra,
});

const report = (results) => ({
  results,
  summary: {
    clean: results.filter((r) => r.status === STATUS.CLEAN).length,
    notApplicable: results.filter((r) => r.status === STATUS.NOT_APPLICABLE).length,
  },
});

describe('AC4.1 / AC4.2 — narrow reach is visible to the reader, not buried in a field', () => {
  it('renders a reach caveat naming the checks that only evaluate one project shape', () => {
    const out = renderDriftReport(
      report([result('published-bug-tally', STATUS.CLEAN), result('epic-without-retro', STATUS.CLEAN)]),
      { reach: REACH }
    );
    expect(out).toMatch(/reach/i);
    expect(out).toContain('published-bug-tally');
    expect(out).toContain('1 of 12');
  });

  it('a clean verdict cannot read as broad coverage — the caveat sits with it', () => {
    const out = renderDriftReport(report([result('published-bug-tally', STATUS.CLEAN)]), { reach: REACH });
    const cleanIdx = out.indexOf('checked, clean');
    const reachIdx = out.search(/reach/i);
    expect(cleanIdx).toBeGreaterThan(-1);
    expect(reachIdx).toBeGreaterThan(cleanIdx);
  });

  // The broadest of the five is `changelog-unreleased-dated` at 5 of 12 — and
  // it IS caveated, because 5 of 12 is still a minority of project shapes.
  // "Broadest of a narrow set" is not broad, and exempting it would be the
  // Epic's own defect: a figure massaged until it reads better than it is.
  it('caveats the broadest of the five too — 5 of 12 is still a minority', () => {
    const out = renderDriftReport(report([result('changelog-unreleased-dated', STATUS.CLEAN)]), {
      reach: REACH,
    });
    expect(out).toContain('changelog-unreleased-dated (5 of 12)');
  });

  it('does not caveat a check that evaluates most project shapes', () => {
    const out = renderDriftReport(report([result('hypothetical-broad', STATUS.CLEAN)]), {
      reach: { 'hypothetical-broad': { evaluable: 12, total: 12 } },
    });
    expect(out).not.toMatch(/reach/i);
  });

  it('renders nothing extra when no reach map is supplied — byte-identical to before', () => {
    const r = report([result('epic-without-retro', STATUS.CLEAN)]);
    expect(renderDriftReport(r)).toBe(renderDriftReport(r, {}));
    expect(renderDriftReport(r)).not.toMatch(/reach/i);
  });

  it('every registered published-fact check has a reach entry to render', () => {
    for (const c of PUBLISHED_FACT_CHECKS) expect(REACH[c.id]).toBeDefined();
  });
});

describe('AC5.3 — five extra checks must not turn the report into a list of non-events', () => {
  it('not-applicable checks are summarised as a count, never enumerated one line each', () => {
    const results = PUBLISHED_FACT_CHECKS.map((c) => result(c.id, STATUS.NOT_APPLICABLE));
    const out = renderDriftReport(report(results), { reach: REACH });
    expect(out).toMatch(/not applicable to this project \(5\)/);
    // No per-check line for any of them.
    for (const c of PUBLISHED_FACT_CHECKS) {
      const naSection = out.slice(out.indexOf('not applicable'));
      expect(naSection.split('\n')[0]).not.toContain(c.id);
    }
  });

  it('the reach caveat is ONE grouped line, not one per check', () => {
    const results = PUBLISHED_FACT_CHECKS.map((c) => result(c.id, STATUS.CLEAN));
    const out = renderDriftReport(report(results), { reach: REACH });
    const reachLines = out.split('\n').filter((l) => /reach/i.test(l));
    expect(reachLines.length).toBe(1);
  });

  it('checks that could not look are still enumerated with their reasons (AC5.2)', () => {
    const out = renderDriftReport(
      report([result('published-bug-tally', STATUS.CANNOT_EVALUATE, { reason: 'no tally to compare' })]),
      { reach: REACH }
    );
    expect(out).toContain('cannot evaluate (1)');
    expect(out).toContain('no tally to compare');
    expect(out).toContain('NOT the same as clean');
  });
});
