// Tests for triage proposals (M6.E11.S3.t3.2, AC-5.3).
// See .planning/M6.E11-VALIDATION.md row AC-5.3. Decisions are injected —
// no model runs in tests; the proposal is deterministic lib code.
//
// M6.E13 t7.4: the v1 `work-ops.js` triage (`triageNext`, `applyTriage`,
// `listNeedsReview`) was retired with the v1 store. What stays here is the
// pure proposal arithmetic, `work-triage.js` `proposeTriage`, which the v2
// readers use; their store-reading cases are in work-triage-v2.test.js.

import { describe, it, expect } from 'vitest';

import { proposeTriage } from '../plugin/tools/lib/work-triage.js';

describe('proposeTriage — deterministic, no model', () => {
  const open = [
    { item: { id: 'SIG-10', type: 'FEAT', status: 'T', title: 'Drive loop stops at PLAN every run', theme: 'loop' } },
    { item: { id: 'SIG-11', type: 'FEAT', status: 'T', title: 'Status page redesign', theme: 'status' } },
    { item: { id: 'SIG-12', type: 'BUG', status: 'C', title: 'Drive loop stops at PLAN every run' } },
  ];

  it.each([
    [{ title: 'Checkpoint crashes on empty STATE' }, 'BUG'],
    [{ title: 'Should advise read every branch?' }, 'Q'],
    [{ title: 'Rename the sweep command' }, 'CHORE'],
    [{ title: 'Add a --json flag to status' }, 'FEAT'],
    [{ title: 'anything', source: '/sig:add --bug' }, 'BUG'],
    [{ title: 'anything', source: '/sig:add --question' }, 'Q'],
  ])('type guess for %j is %s', (fields, type) => {
    const p = proposeTriage({ id: 'SIG-1', type: 'NEW', status: 'N', ...fields }, '', []);
    expect(p.type).toBe(type);
    expect(typeof p.why.type).toBe('string');
  });

  it('keeps a type that is already set (a migrated row)', () => {
    expect(proposeTriage({ id: 'SIG-1', type: 'CHORE', status: 'T', title: 'crash' }, '', []).type).toBe('CHORE');
  });

  it('titles from the first body line when there is no title, trimmed to 80 characters', () => {
    const p = proposeTriage({ id: 'SIG-1', type: 'NEW', status: 'N' }, `## ${'word '.repeat(40)}\nrest\n`, []);
    expect(p.title.length).toBeLessThanOrEqual(80);
    expect(p.title.startsWith('word word')).toBe(true);
  });

  it('names open items with a similar title as possible duplicates, never closed ones or itself', () => {
    const p = proposeTriage({ id: 'SIG-1', type: 'NEW', status: 'N', title: 'drive loop stops at PLAN' }, '', open);
    expect(p.duplicates.map((d) => d.id)).toEqual(['SIG-10']);
    expect(p.duplicates[0].score).toBeGreaterThan(0.5);
    expect(p.theme).toBe('loop'); // borrowed from the closest match
  });

  it('is deterministic', () => {
    const item = { id: 'SIG-1', type: 'NEW', status: 'N', title: 'drive loop stops' };
    expect(proposeTriage(item, 'b', open)).toEqual(proposeTriage(item, 'b', open));
  });
});
