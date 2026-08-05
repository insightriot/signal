import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

  /**
   * AC3.4 — a record rendered WITHOUT an isolation scope must fail.
   *
   * Every verdict this harness has published so far was measured at a scope
   * nobody stated, and `B55` is what that cost: two releases of readers had no
   * way to tell an isolated verdict from an unisolated one, because the record
   * never said. The scope line is therefore unconditional — it renders even when
   * the canary declares nothing, in which case it says `undeclared` out loud
   * rather than omitting the line and reading as though the question never arose.
   */
  it('AC3.4 — the isolation scope renders unconditionally, never omitted', () => {
    const undeclared = { ...CANARY, isolation: undefined };
    const out = buildCaveats({ canary: undeclared, ...base }).join('\n');
    expect(out).toMatch(/Isolation scope/);
    expect(out).toMatch(/undeclared/);
  });

  it('AC3.3 — descriptive residue is named on the record, file by file', () => {
    const out = buildCaveats({
      canary: CANARY,
      ...base,
      descriptiveResidue: [
        { file: 'tools/lib/state.js', line: 12, text: 'x' },
        { file: 'references/state-schema.md', line: 3, text: 'y' },
      ],
    }).join('\n');
    expect(out).toMatch(/Descriptive residue survived/i);
    expect(out).toContain('tools/lib/state.js');
    expect(out).toContain('references/state-schema.md');
    expect(out).toMatch(/reviewed and allowlisted, not overlooked/i);
  });

  it('AC3.2 — descriptive residue is reported, never treated as a failure', () => {
    // It must read as scope, not as an error: the schema reference and the
    // capability itself SHOULD survive, and a record implying otherwise would
    // push a future maintainer toward the over-deletion this Epic rejects.
    const out = buildCaveats({
      canary: CANARY,
      ...base,
      descriptiveResidue: [{ file: 'tools/lib/state.js', line: 12, text: 'x' }],
    }).join('\n');
    expect(out).toMatch(/by design/i);
    expect(out).not.toMatch(/not a control|void/i);
  });

  it('omits the residue caveat entirely when the tree came back clean', () => {
    const out = buildCaveats({ canary: CANARY, ...base, descriptiveResidue: [] }).join('\n');
    expect(out).not.toMatch(/Descriptive residue/i);
  });

  /**
   * THE WIRING, pinned at source — because a unit test on this function cannot
   * see it, and that gap already cost a published record.
   *
   * `buildCaveats` was exercised with residue handed straight in, and passed. The
   * runner meanwhile read `descriptiveResidue` off `c` — the SUMMARY object from
   * `summarizeArm`, one character away from `control`, the arm result that
   * actually carries it. `undefined ?? []` rendered as empty, so the 2026-08-05
   * OBEYED record published its isolation scope with no residue list at all. Every
   * unit test was green.
   *
   * `tests/adherence-suite-guard.test.js` forbids importing the runner, so this
   * reads its source — the same technique `guard-callers.test.js` uses for the
   * refusal path. Weaker than an integration test, and much stronger than nothing.
   */
  it('the runner reads residue from the ARM result, never from the summary', () => {
    const runner = readFileSync(join(ROOT, 'tools/adherence-run.js'), 'utf-8');
    expect(runner).toMatch(/descriptiveResidue:\s*control\.descriptiveResidue/);
    // The exact regression: reading it off a summarizeArm() result.
    expect(runner).not.toMatch(/descriptiveResidue:\s*c\.descriptiveResidue/);
    expect(runner).not.toMatch(/descriptiveResidue:\s*(?:controlSummary|treatmentSummary)\./);
  });

  it('the split-arm sidecar persists residue, so --combine cannot drop it', () => {
    const runner = readFileSync(join(ROOT, 'tools/adherence-run.js'), 'utf-8');
    expect(runner).toMatch(/const \{ results, failedRuns, descriptiveResidue \} = await runArm/);
    expect(runner).toMatch(/canary: canary\.id, arm: args\.arm[\s\S]{0,400}descriptiveResidue,/);
  });

  it('keeps the caveats that never depended on the deletion shape', () => {
    const out = buildCaveats({ canary: CANARY, ...base }).join('\n');
    expect(out).toMatch(/One canary is not a survey/);
    expect(out).toMatch(/Tool access is part of the claim/);
    expect(out).toMatch(/N=3 is a weak split/);
  });
});
