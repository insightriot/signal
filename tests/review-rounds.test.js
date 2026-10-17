// M6.E17 S4 — checkFixRounds: a REVIEW report's fix rounds each carry a fresh
// read and a parent run, and a passing verdict needs the last round clean.
//
// Why (D-M6E17-2, AC2.3): "fixes to fixes get their own fresh reader" found the
// worst defect in M6.E14 and paid off four Epics running, and was never a step.
// M6.E16's REVIEW recorded its fresh reads by hand, in prose, in a different
// shape each round. Nothing read them. This is the reader.
//
// Proof-of-fail: every test fails before S4 — the module does not exist.

import { describe, it, expect } from 'vitest';

import { checkFixRounds } from '../plugin/tools/lib/review-rounds.js';

const round = (n, { fresh, parent } = {}) =>
  `### Fix round ${n}\n\n` +
  `Fixed the thing.\n\n` +
  (fresh === null ? '' : `**Fresh read:** ${fresh ?? 'abc1234..def5678 — Critical 0, Important 0 — stop: yes'}\n`) +
  (parent === null ? '' : `**Parent run:** ${parent ?? '`parent-run abc1234: 1 of 1 failed on the base`'}\n`) +
  '\n';

// No REVIEW passes recorded yet: the record is passed explicitly (REVIEW I6).
const none = { phasePasses: [] };

const report = (...rounds) => `# Review Report — M9.E1\n\n## Pass 1\n\nfindings\n\n${rounds.join('')}## Verdict\n\nsee above\n`;

// A report with one `## Pass N` section per array, each holding its rounds: a pass
// after k recorded REVIEW passes is section k+1 (REVIEW pass 2, P2-I4).
const passes = (...each) =>
  `# Review Report — M9.E1\n\n${each.map((rs, i) => `## Pass ${i + 1}\n\nfindings\n\n${rs.join('')}`).join('')}`;

describe('AC2.3 — a clean report passes', () => {
  it('PASS-WITH-FIXES with one clean round → ok', () => {
    const r = checkFixRounds(report(round(1)), 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.rounds).toEqual([
      expect.objectContaining({ n: 1, range: 'abc1234..def5678', critical: 0, important: 0, stop: true }),
    ]);
  });

  it('PASS with no fix round at all → ok (nothing was fixed)', () => {
    expect(checkFixRounds(report(), 'PASS', none).ok).toBe(true);
  });

  it('a chain: round 1 finds an Important, round 2 reads clean → ok', () => {
    const r = checkFixRounds(
      report(
        round(1, { fresh: 'aaa1111..bbb2222 — Critical 0, Important 1 — stop: no' }),
        round(2, { fresh: 'bbb2222..ccc3333 — Critical 0, Important 0 — stop: yes' })
      ),
      'PASS-WITH-FIXES',
      none
    );
    expect(r.ok).toBe(true);
    expect(r.rounds.map((x) => x.stop)).toEqual([false, true]);
  });

  it('accepts a plain hyphen where the template has an em dash', () => {
    const r = checkFixRounds(report(round(1, { fresh: 'abc1234..def5678 - Critical 0, Important 0 - stop: yes' })), 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(true);
  });
});

describe('AC2.3 — what is refused', () => {
  it('a round with no Fresh read line', () => {
    const r = checkFixRounds(report(round(1, { fresh: null })), 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Fix round 1.*Fresh read/);
  });

  it('a round with no Parent run line', () => {
    const r = checkFixRounds(report(round(1, { parent: null })), 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Fix round 1.*Parent run/);
  });

  it('a Fresh read line that does not parse', () => {
    const r = checkFixRounds(report(round(1, { fresh: 'looked fine to me' })), 'PASS', none);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Fresh read/);
  });

  it('a Parent run line that is neither the tool\'s summary nor a stated gap', () => {
    const r = checkFixRounds(report(round(1, { parent: 'ran it, it failed' })), 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Parent run/);
  });

  it('PASS-WITH-FIXES with no fix round', () => {
    const r = checkFixRounds(report(), 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/PASS-WITH-FIXES.*no fix round/);
  });

  it('PASS or PASS-WITH-FIXES whose last round is stop: no', () => {
    const rounds = report(round(1, { fresh: 'aaa1111..bbb2222 — Critical 1, Important 0 — stop: no' }));
    for (const verdict of ['PASS', 'PASS-WITH-FIXES']) {
      const r = checkFixRounds(rounds, verdict, none);
      expect(r.ok, verdict).toBe(false);
      expect(r.reasons.join(' ')).toMatch(/last fix round.*stop: no/);
    }
  });

  it('stop: yes with findings, or stop: no with none — the stop rule is 0 Critical and 0 Important', () => {
    expect(checkFixRounds(report(round(1, { fresh: 'a1b2c3d..e4f5a6b — Critical 0, Important 2 — stop: yes' })), 'FAIL').ok).toBe(false);
    expect(checkFixRounds(report(round(1, { fresh: 'a1b2c3d..e4f5a6b — Critical 0, Important 0 — stop: no' })), 'FAIL').ok).toBe(false);
  });

  it('an unknown verdict throws', () => {
    expect(() => checkFixRounds(report(), 'LGTM')).toThrow(/LGTM/);
  });
});

describe('FAIL and stated gaps', () => {
  it('FAIL whose last round is stop: no → ok (the chain ended at the ceiling; the Loop Back asks)', () => {
    const r = checkFixRounds(report(round(1, { fresh: 'aaa1111..bbb2222 — Critical 1, Important 0 — stop: no' })), 'FAIL');
    expect(r.ok).toBe(true);
  });

  it('a stated gap is allowed and listed, never counted as proof', () => {
    const r = checkFixRounds(report(round(1, { parent: 'gap — the fix changed only a command file; no test to run' })), 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(true);
    expect(r.gaps).toEqual([expect.stringMatching(/Fix round 1: gap — the fix changed only a command file/)]);
  });

  it('a parent run that is not all-failed is listed as a gap', () => {
    const r = checkFixRounds(
      report(round(1, { parent: '`parent-run abc1234: 1 of 2 failed on the base, 1 passed`' })),
      'PASS-WITH-FIXES',
      none
    );
    expect(r.ok).toBe(true);
    expect(r.gaps).toEqual([expect.stringMatching(/Fix round 1: .*1 of 2 failed/)]);
  });
});

// VERIFY pass 1, D2: the check read only the report, so a PASS after a
// recorded REVIEW FAIL whose fixes were never written down as a round read
// ok — the case AC2.3 exists for. Every FAIL loop-back is followed by one
// round of fixes, so the recorded REVIEW FAILs set a floor on the rounds.
describe('D2 — the recorded passes set a floor on the rounds', () => {
  const failed = ['VERIFY FAIL (2026-10-16)', 'REVIEW FAIL (2026-10-16)'];

  it('a PASS after a recorded REVIEW FAIL, with no round written → refused', () => {
    const r = checkFixRounds('# Review pass 2 after FAIL loop-back\nAll fixed.\n', 'PASS', { phasePasses: failed });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/REVIEW FAIL/);
  });

  it('one round per recorded REVIEW FAIL → ok; VERIFY passes do not count', () => {
    expect(checkFixRounds(passes([], [round(1)]), 'PASS', { phasePasses: failed }).ok).toBe(true);
  });

  it('two recorded REVIEW FAILs and one round → refused', () => {
    const two = [...failed, 'REVIEW FAIL (2026-10-17)'];
    expect(checkFixRounds(passes([], [], [round(1)]), 'PASS', { phasePasses: two }).ok).toBe(false);
    expect(checkFixRounds(passes([], [round(1)], [round(2)]), 'PASS', { phasePasses: two }).ok).toBe(true);
  });

  it('a FAIL verdict is not held to the floor (the Loop Back asks)', () => {
    expect(checkFixRounds('no rounds\n', 'FAIL', { phasePasses: failed }).ok).toBe(true);
  });

  it('a pass record that does not read is refused, never read as no FAILs', () => {
    for (const bad of ['REVIEW FAIL', [{}], 'not a list']) {
      const r = checkFixRounds(report(round(1)), 'PASS', { phasePasses: typeof bad === 'string' && bad !== 'not a list' ? [bad] : bad });
      expect(r.ok).toBe(false);
    }
  });
});

// REVIEW pass 1 (M6.E17): four ways the check read ok over a round nobody wrote
// down or read. Each case below read ok on 2a0c56fe.
describe('REVIEW I5/I6/I4 — the floor, the record, and the per-pass bound', () => {
  const oneFail = { phasePasses: ['REVIEW FAIL (2026-10-16)'] };

  it('I6: a PASS with no pass record given is refused, never read as no FAILs', () => {
    const r = checkFixRounds('# Review pass 2 after FAIL loop-back\nAll fixed.\n', 'PASS');
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/phasePasses/);
  });

  it('I6: a FAIL needs no pass record (the Loop Back asks)', () => {
    expect(checkFixRounds('no rounds\n', 'FAIL').ok).toBe(true);
  });

  it('I5: a PASS-WITH-FIXES after a recorded FAIL needs a round for the loop-back fixes AND one for its own', () => {
    expect(checkFixRounds(passes([], [round(1)]), 'PASS-WITH-FIXES', oneFail).ok).toBe(false);
    expect(checkFixRounds(passes([], [round(1), round(2)]), 'PASS-WITH-FIXES', oneFail).ok).toBe(true);
  });

  it('S2: a Fix round inside a code fence is not a round', () => {
    const fenced = '# Review\n\n```markdown\n' + round(1) + '```\n';
    expect(checkFixRounds(fenced, 'PASS', oneFail).ok).toBe(false);
    expect(checkFixRounds(fenced, 'PASS-WITH-FIXES', none).ok).toBe(false);
  });

  it('I4: a pass holds at most three rounds (the loop ceiling); a fourth refuses a passing verdict', () => {
    const dirty = (n) => round(n, { fresh: 'aaa1111..bbb2222 — Critical 0, Important 1 — stop: no' });
    const four = passes([dirty(1), dirty(2), dirty(3), round(4)]);
    const r = checkFixRounds(four, 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Pass 1.*4 fix rounds.*at most 3/);
    // Three in one pass and one in the next is within the bound.
    const split = passes([dirty(1), dirty(2), dirty(3)], [round(4), round(5)]);
    expect(checkFixRounds(split, 'PASS-WITH-FIXES', oneFail).ok).toBe(true);
  });
});

// REVIEW pass 2 (M6.E17): the pass-1 fixes left three ways through. Each case
// below reads the wrong answer on 7aadb79a.
describe('REVIEW P2-I4/I5/I6 — pass sections are tied to the record', () => {
  const dirty = (n) => round(n, { fresh: 'aaa1111..bbb2222 — Critical 0, Important 1 — stop: no' });
  const oneFail = { phasePasses: ['REVIEW FAIL (2026-10-16)'] };

  it('P2-I4: a typed "## Pass 2" heading does not open a fresh bound of three rounds', () => {
    const forged = passes([dirty(1), dirty(2), dirty(3)], [dirty(4), round(5)]);
    const r = checkFixRounds(forged, 'PASS-WITH-FIXES', none);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/2 "## Pass N" section\(s\).*0 REVIEW pass/);
  });

  it('P2-I4: a pass written under the previous pass\'s heading is refused too', () => {
    const r = checkFixRounds(passes([round(1)]), 'PASS', oneFail);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/this is pass 2/);
  });

  it('P2-I5: a fourth round in a pass does not block FAIL, the verdict the bound asks for', () => {
    const four = passes([dirty(1), dirty(2), dirty(3), dirty(4)]);
    expect(checkFixRounds(four, 'FAIL', none).ok).toBe(true);
  });

  it('P2-I6: after a recorded FAIL, a round from an earlier pass does not count for this one', () => {
    const r = checkFixRounds(passes([round(1)], []), 'PASS', oneFail);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/last recorded REVIEW pass is a FAIL and this pass has 0/);
    expect(checkFixRounds(passes([round(1)], [round(2)]), 'PASS', oneFail).ok).toBe(true);
  });
});
