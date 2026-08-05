import { describe, it, expect } from 'vitest';

import { buildCaveats } from '../tools/lib/adherence-caveats.js';

/**
 * M5.E15 S1.t4 — the caveat that explains a whole section was removed.
 *
 * WHY THIS FILE EXISTS. `buildCaveats` branched on `canary.deleteSection`, the
 * field M5.E15 replaces with `deletions[]`. Nothing imported it — the function
 * lived in a CLI script with no exports and no test — so replacing the field
 * would have left the branch permanently false and the caveat would simply have
 * stopped rendering. No test would have gone red. The published record would
 * have quietly dropped the sentence telling a reader that the control arm
 * removed more than one line, which is the single most important caveat on a
 * section-scoped deletion.
 *
 * That is the `B39` shape — a check that reports nothing and reads as clean —
 * arriving through a field rename rather than through a missing detector.
 */

const CANARY = {
  id: 'B41-phase-entry',
  command: 'execute',
  isolation: 'directive',
  trace: { functionName: 'transitionPhase' },
  deletions: [
    { file: 'commands/execute.md', section: '## Phase entry — record the phase' },
    { file: 'commands/plan.md', section: '## Phase entry — record the phase' },
    { file: 'commands/ship.md', line: "`await transitionPhase(baseDir, 'SHIP')`" },
  ],
};

const base = { runsPerArm: 3, dirty: false, allowedTools: ['Read', 'Write'] };

describe('buildCaveats reads deletions[] (M5.E15 S1.t4)', () => {
  it('still renders the whole-section caveat after the field migration', () => {
    const out = buildCaveats({ canary: CANARY, ...base });
    expect(out.some(c => /removed (a )?whole sections?/i.test(c))).toBe(true);
  });

  it('names every section-scoped site, not just the first', () => {
    const out = buildCaveats({ canary: CANARY, ...base }).join('\n');
    expect(out).toContain('commands/execute.md');
    expect(out).toContain('commands/plan.md');
  });

  it('reports the isolation scope so a reader knows how far the control reached', () => {
    const out = buildCaveats({ canary: CANARY, ...base }).join('\n');
    expect(out).toMatch(/directive/i);
    expect(out).toMatch(/5 sites|3 sites|sites/i);
  });

  it('omits the section caveat when every declared site is line-scoped', () => {
    const lineOnly = { ...CANARY, deletions: [{ file: 'commands/ship.md', line: 'x' }] };
    const out = buildCaveats({ canary: lineOnly, ...base });
    expect(out.some(c => /removed (a )?whole sections?/i.test(c))).toBe(false);
  });

  it('keeps the caveats that never depended on the deletion shape', () => {
    const out = buildCaveats({ canary: CANARY, ...base }).join('\n');
    expect(out).toMatch(/One canary is not a survey/);
    expect(out).toMatch(/Tool access is part of the claim/);
    expect(out).toMatch(/N=3 is a weak split/);
  });
});
