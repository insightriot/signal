// The outcome oracle asked at DISCUSS — "how will we know this worked?"
//
// The assertions that matter are the ones about the ESCAPE HATCH. The backlog
// item that commissioned this names the failure precisely: for infrastructure
// work an outcome metric frequently does not exist, so a gate that cannot be
// satisfied honestly becomes a gate that gets rationalized past. So "no metric,
// and here is why" must PASS, and an unexplained decline must FAIL. Those two
// tests are the whole design.

import { describe, expect, it } from 'vitest';

import {
  OUTCOME_HEADINGS,
  REASON_MIN_BYTES,
  checkOutcomeOracle,
  outcomeOracleRequired,
} from '../plugin/tools/lib/outcome-oracle.js';

const withOutcome = (body, heading = 'Outcome') =>
  `# Requirements\n\n## Functional\n\n- FR1: does a thing\n\n## ${heading}\n\n${body}\n`;

describe('which tiers ask', () => {
  it('asks at FULL and FEATURE, not at SPIKE or SKETCH', () => {
    expect(outcomeOracleRequired('FULL')).toBe(true);
    expect(outcomeOracleRequired('FEATURE')).toBe(true);
    expect(outcomeOracleRequired('SPIKE')).toBe(false);
    expect(outcomeOracleRequired('SKETCH')).toBe(false);
  });

  it('throws on an unknown tier rather than guessing', () => {
    expect(() => outcomeOracleRequired('MEDIUM')).toThrow(/unknown tier/);
  });

  it('passes a tier that does not ask, whatever the content', () => {
    expect(checkOutcomeOracle('', 'SKETCH')).toMatchObject({ status: 'not-required', ok: true });
    expect(checkOutcomeOracle('', 'SPIKE').ok).toBe(true);
  });
});

describe('the escape hatch is first-class', () => {
  it('PASSES "no outcome metric" when the reason is substantive', () => {
    // The case the whole design turns on. Internal tooling genuinely has no
    // outcome metric, and refusing that answer is what makes a gate get gamed.
    const body =
      'No outcome metric. This is internal tooling with no user-facing surface; the only ' +
      'observable result is whether the check fires on real projects, measured at the next ' +
      'corpus run.';
    const r = checkOutcomeOracle(withOutcome(body), 'FULL');
    expect(r.status).toBe('declined-with-reason');
    expect(r.ok).toBe(true);
  });

  it('FAILS a bare "N/A" — an unexplained decline', () => {
    const r = checkOutcomeOracle(withOutcome('N/A'), 'FULL');
    expect(r.status).toBe('vacuous');
    expect(r.ok).toBe(false);
  });

  it('FAILS a short decline that gives no reason', () => {
    const r = checkOutcomeOracle(withOutcome('No metric, not applicable here.'), 'FULL');
    expect(r.status).toBe('vacuous');
    expect(r.reason).toMatch(/indistinguishable from not having thought about it/i);
  });

  it('the failure message says declining is legitimate, so nobody learns to fake a metric', () => {
    // If the refusal reads as "you must produce a number", the rational response
    // is to invent one — strictly worse than a recorded "none, because".
    const r = checkOutcomeOracle(withOutcome('none'), 'FULL');
    expect(r.reason).toMatch(/declining is legitimate/i);
  });

  it('the byte floor admits one honest sentence and rejects a word', () => {
    expect(REASON_MIN_BYTES).toBeGreaterThan('not applicable'.length);
    expect(REASON_MIN_BYTES).toBeLessThan(200);
  });
});

describe('a stated measure', () => {
  it('passes when the section names one', () => {
    const r = checkOutcomeOracle(
      withOutcome('Median time-to-first-commit for a new project drops below 10 minutes.'),
      'FULL'
    );
    expect(r.status).toBe('metric');
    expect(r.ok).toBe(true);
  });

  it('accepts every documented heading spelling', () => {
    for (const heading of OUTCOME_HEADINGS) {
      const r = checkOutcomeOracle(
        withOutcome('Support tickets about onboarding fall quarter over quarter.', heading),
        'FEATURE'
      );
      expect(r.ok, `heading "${heading}" was not recognised`).toBe(true);
    }
  });

  it('is not fooled by a metric mentioned outside the section', () => {
    const doc = '# Requirements\n\n## Functional\n\n- FR1: latency drops below 200ms\n';
    expect(checkOutcomeOracle(doc, 'FULL').status).toBe('missing');
  });
});

describe('when it is absent', () => {
  it('reports missing and says the decline is allowed', () => {
    const r = checkOutcomeOracle('# Requirements\n\n## Functional\n\n- FR1: x\n', 'FULL');
    expect(r.status).toBe('missing');
    expect(r.reason).toMatch(/valid answer/i);
  });

  it('distinguishes an empty section from a missing one', () => {
    const r = checkOutcomeOracle('# Requirements\n\n## Outcome\n\n', 'FULL');
    expect(r.status).toBe('empty');
    expect(r.ok).toBe(false);
  });

  it('treats an unfilled stub as vacuous, not as an answer', () => {
    expect(checkOutcomeOracle(withOutcome('[FILL IN — how will we know?]'), 'FULL').ok).toBe(false);
  });
});
