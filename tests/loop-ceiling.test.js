import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_LOOP_CEILING,
  LOOP_BOUNDED_PHASES,
  countPhaseCompletions,
  loopStatusFor,
  formatLoopCeilingHalt,
} from '../plugin/tools/lib/loop-ceiling.js';
import { canProceedUnattended } from '../plugin/tools/lib/drive.js';

const unattended = { rigor_overrides: { attention: 'unattended' } };
const log = (phase, n) =>
  Array.from({ length: n }, (_, i) => `${phase} (2026-08-${String(i + 1).padStart(2, '0')})`);
const state = (phase, n) => ({ completed_phases: log(phase, n) });

describe('B76 — countPhaseCompletions', () => {
  it('counts entries for the phase, per the append-only log', () => {
    expect(countPhaseCompletions(state('REVIEW', 3), 'REVIEW')).toBe(3);
  });

  it('does not count other phases', () => {
    const mixed = { completed_phases: [...log('VERIFY', 4), ...log('REVIEW', 1)] };
    expect(countPhaseCompletions(mixed, 'REVIEW')).toBe(1);
    expect(countPhaseCompletions(mixed, 'VERIFY')).toBe(4);
  });

  it('discards malformed entries rather than keying on them (B45)', () => {
    // The live instance from B45: prose keying on its first whitespace token.
    const dirty = { completed_phases: ['**▶ Active: Slice SEC1', 'REVIEW (2026-08-01)'] };
    expect(countPhaseCompletions(dirty, 'REVIEW')).toBe(1);
  });

  it('returns null — NOT zero — when it cannot read the log', () => {
    // "Could not look" must stay distinguishable from "looked, found none" (B39).
    // Zero would read as "no loops yet" on exactly the state that lost its history.
    expect(countPhaseCompletions(null, 'REVIEW')).toBeNull();
    expect(countPhaseCompletions({}, 'REVIEW')).toBeNull();
    expect(countPhaseCompletions({ completed_phases: 'not-an-array' }, 'REVIEW')).toBeNull();
    expect(countPhaseCompletions({ completed_phases: [] }, 'REVIEW')).toBe(0);
  });
});

describe('B76 — the ceiling arithmetic is verify.md\'s existing rule', () => {
  // verify.md: "A for the first 2 loops; reassess at loop 3". Two re-entries
  // run unattended; the third stops. Pinned as a table because an off-by-one
  // here IS the behaviour.
  it.each([
    [0, 1, false],
    [1, 2, false],
    [2, 3, true],
    [3, 4, true],
  ])('completed %i times → pass %i → atCeiling %s', (count, nextAttempt, atCeiling) => {
    const s = loopStatusFor(state('REVIEW', count), 'REVIEW');
    expect(s).toMatchObject({ count, nextAttempt, atCeiling, ceiling: DEFAULT_LOOP_CEILING });
  });

  it('is null for phases that do not loop backwards', () => {
    // Counting EXECUTE or SHIP would stop loops that are supposed to run.
    expect(loopStatusFor(state('EXECUTE', 9), 'EXECUTE')).toBeNull();
    expect(loopStatusFor(state('SHIP', 9), 'SHIP')).toBeNull();
    expect(LOOP_BOUNDED_PHASES).toEqual(['VERIFY', 'REVIEW']);
  });

  it('is null when the state is unreadable, so the caller must fail closed', () => {
    expect(loopStatusFor(null, 'REVIEW')).toBeNull();
  });
});

describe('B76 — canProceedUnattended refuses on the count', () => {
  it('lets the first two re-entries run unattended', () => {
    for (const n of [0, 1]) {
      const r = canProceedUnattended('REVIEW', unattended, {
        loopStatus: loopStatusFor(state('REVIEW', n), 'REVIEW'),
      });
      expect(r.proceed, `completed ${n} should still run`).toBe(true);
    }
  });

  it('STOPS at the ceiling even though attention says unattended', () => {
    // The whole bug: `unattended` buys freedom from being ASKED, not an
    // unbounded loop. This is the assertion B76 exists for.
    const r = canProceedUnattended('REVIEW', unattended, {
      loopStatus: loopStatusFor(state('REVIEW', 2), 'REVIEW'),
    });
    expect(r.proceed).toBe(false);
    expect(r.reason).toBe('loop-ceiling');
    expect(r.loopStatus.nextAttempt).toBe(3);
  });

  it('applies to VERIFY as well as REVIEW', () => {
    const r = canProceedUnattended('VERIFY', unattended, {
      loopStatus: loopStatusFor(state('VERIFY', 5), 'VERIFY'),
    });
    expect(r.proceed).toBe(false);
    expect(r.reason).toBe('loop-ceiling');
  });

  it('fails CLOSED when no loop status is supplied at all', () => {
    // An actor that cannot tell should stop. A caller that forgets to pass the
    // count must not silently get the old unbounded behaviour back — that is
    // how this defect would return.
    const r = canProceedUnattended('REVIEW', unattended);
    expect(r.proceed).toBe(false);
    expect(r.reason).toBe('loop-unknown');
  });

  it('keeps loop-unknown distinct from loop-ceiling', () => {
    // Reporting "at the ceiling" for a count it never had would be a claim
    // about evidence it does not hold.
    expect(canProceedUnattended('REVIEW', unattended, { loopStatus: null }).reason).toBe(
      'loop-unknown'
    );
  });

  it('leaves non-looping phases exactly as they were', () => {
    expect(canProceedUnattended('EXECUTE', unattended).proceed).toBe(true);
  });

  it('does not let the ceiling override a floor', () => {
    // SHIP carries floors; the halt must still name the floor, which is the
    // stronger statement about why the loop stopped.
    expect(canProceedUnattended('SHIP', unattended).reason).toBe('floor');
  });
});

describe('B76 — the halt is rendered from one place', () => {
  it('names the count, the pass, the ceiling, and who decides', () => {
    const msg = formatLoopCeilingHalt(loopStatusFor(state('REVIEW', 2), 'REVIEW'));
    expect(msg).toContain('REVIEW');
    expect(msg).toContain('2 time(s)');
    expect(msg).toContain('pass 3');
    expect(msg).toContain('ceiling of 3');
    expect(msg).toMatch(/person decides/i);
  });
});

describe('B76 — review.md carries the ask it was missing', () => {
  const reviewMd = readFileSync(
    fileURLToPath(new URL('../plugin/commands/review.md', import.meta.url)),
    'utf-8'
  );

  it('has a Loop Back section, like verify.md', () => {
    expect(reviewMd).toMatch(/^### Loop Back/m);
  });

  it('routes the FAIL through the 3-options pattern rather than a bare return', () => {
    // The defect was a verdict line reading "return to EXECUTE" with nothing
    // asking the user anything.
    expect(reviewMd).toContain('3-options-plus-other');
    expect(reviewMd).toContain('AskUserQuestion');
  });

  it('points at the counted ceiling, not at a remembered one', () => {
    // If this file ever describes the ceiling without naming the function that
    // enforces it, the rule has drifted back to prose — which is the whole bug.
    expect(reviewMd).toContain('loopStatusFor');
    expect(reviewMd).toContain('loop-ceiling.js');
  });
});
