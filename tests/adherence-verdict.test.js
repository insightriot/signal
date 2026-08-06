import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANARY_REGISTRY_PATH,
  VERDICT,
  loadCanaryRegistry,
  resolveVerdict,
  summarizeArm,
  applyDeletion,
  applyDeletions,
  applySectionDeletion,
  assertRegistryShape,
  assertSectionAnchorIsDiscrete,
  traceHit,
} from '../tools/lib/adherence-verdict.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * FR2 + FR3 — the control arm's verdict logic (M5.E8.S3).
 *
 * Pinned at RED commit time before tools/lib/adherence-verdict.js exists.
 *
 * THE POINT OF THIS FILE, stated because it is easy to misread: the verdict
 * function is fixed HERE, before any real run produces numbers. AC3.3 requires
 * traces to be declared before a run; the mapping from (control, treatment) to a
 * verdict deserves identical treatment, or the threshold gets chosen after
 * seeing 3/3 vs 2/3 — which is the same rationalization AC3.3 exists to prevent.
 *
 * WHAT THIS CANNOT PROVE (M5.E8-VALIDATION F2): that any verdict it computes is
 * TRUE of a real agent. Every input here is a stub. A green run of this file is
 * evidence about arithmetic, never about adherence.
 */

describe('verdict function — fixed before any run produces numbers', () => {
  it('OBEYED: trace in the as-written arm, absent in the deleted arm', () => {
    expect(resolveVerdict({ treatmentHits: 3, controlHits: 0, runsPerArm: 3 })).toBe(VERDICT.OBEYED);
  });

  it('INERT: the trace appears in BOTH arms — the instruction caused nothing', () => {
    // The finding this Epic named as its desired worst case. It is a RESULT,
    // never a failure to be retried until it passes (NFR4).
    expect(resolveVerdict({ treatmentHits: 3, controlHits: 3, runsPerArm: 3 })).toBe(VERDICT.INERT);
  });

  it('ABSENT: the trace appears in NEITHER arm — nothing happened at all', () => {
    expect(resolveVerdict({ treatmentHits: 0, controlHits: 0, runsPerArm: 3 })).toBe(VERDICT.ABSENT);
  });

  it('INDETERMINATE: a split that is not clean enough to call either way', () => {
    expect(resolveVerdict({ treatmentHits: 2, controlHits: 1, runsPerArm: 3 })).toBe(VERDICT.INDETERMINATE);
  });

  it('INDETERMINATE: a partial run is never silently folded into a real verdict', () => {
    expect(resolveVerdict({ treatmentHits: 1, controlHits: 0, runsPerArm: 3, failedRuns: 2 }))
      .toBe(VERDICT.INDETERMINATE);
  });

  it('REFUSES to produce any verdict when the mutation was not proven to land', () => {
    expect(() => resolveVerdict({ treatmentHits: 3, controlHits: 0, runsPerArm: 3, seamProven: false }))
      .toThrow(/seam|mutation|precondition/i);
  });

  it('a backwards result (trace only in the DELETED arm) is indeterminate, not obeyed', () => {
    expect(resolveVerdict({ treatmentHits: 0, controlHits: 3, runsPerArm: 3 })).toBe(VERDICT.INDETERMINATE);
  });
});

describe('spread is reported, never hidden (AC2.3)', () => {
  it('summarizeArm reports hits, runs and the spread across runs', () => {
    const s = summarizeArm([true, true, false]);
    expect(s.hits).toBe(2);
    expect(s.runs).toBe(3);
    expect(s.unanimous).toBe(false);
  });

  it('flags a unanimous arm distinctly from a split one', () => {
    expect(summarizeArm([true, true, true]).unanimous).toBe(true);
    expect(summarizeArm([false, false, false]).unanimous).toBe(true);
  });

  it('refuses a single-run arm — AC2.3 forbids single-run verdicts', () => {
    expect(() => summarizeArm([true])).toThrow(/single|spread|two/i);
  });
});

describe('trace evaluation', () => {
  it('reads each declared trace field off a diff', () => {
    expect(traceHit({ phaseChanged: { from: 'PLAN', to: 'EXECUTE' } }, 'phaseChanged')).toBe(true);
    expect(traceHit({ phaseChanged: null }, 'phaseChanged')).toBe(false);
    expect(traceHit({ completedPhasesGrew: true }, 'completedPhasesGrew')).toBe(true);
    expect(traceHit({ filesAdded: ['X.md'] }, 'filesAdded')).toBe(true);
    expect(traceHit({ filesAdded: [] }, 'filesAdded')).toBe(false);
  });

  it('THROWS on an unknown trace field rather than reporting "no trace"', () => {
    // A typo'd trace name returning false would report no trace in BOTH arms,
    // which reads as INERT — the disguised-failure shape this Epic keeps closing.
    expect(() => traceHit({}, 'phaseAdvanced')).toThrow(/unknown trace field/i);
  });
});

describe('the deletion is applied to a COPY (AC2.4)', () => {
  it('removes exactly the target line and leaves the rest byte-identical', () => {
    const src = ['# Cmd', '', 'Do a thing.', 'Call `transitionPhase(baseDir, X)` at entry.', 'Do another thing.'].join('\n');
    const out = applyDeletion(src, 'Call `transitionPhase(baseDir, X)` at entry.');
    expect(out).not.toContain('transitionPhase');
    expect(out).toContain('Do a thing.');
    expect(out).toContain('Do another thing.');
    expect(out.split('\n').length).toBe(src.split('\n').length - 1);
  });

  it('throws when the target line is not present — a silent no-op deletion would make both arms identical and read as INERT', () => {
    expect(() => applyDeletion('# Cmd\nnothing here\n', 'a line that does not exist'))
      .toThrow(/not found|no match/i);
  });

  it('throws when the target matches more than once — ambiguous deletion is not a control', () => {
    const src = 'Call `x()` now.\nCall `x()` now.\n';
    expect(() => applyDeletion(src, 'Call `x()` now.')).toThrow(/more than once|ambiguous|multiple/i);
  });
});

describe('the control arm must actually REMOVE the instruction', () => {
  it('deletes a whole section when the canary names one', () => {
    const src = [
      '## Keep me', 'body a', '',
      '## Target section', 'call `doThing()` now.', 'more rationale about `doThing`.', '',
      '## Also keep me', 'body b',
    ].join('\n');
    const out = applySectionDeletion(src, '## Target section');
    expect(out).not.toContain('doThing');
    expect(out).not.toContain('Target section');
    expect(out).toContain('## Keep me');
    expect(out).toContain('## Also keep me');
    expect(out).toContain('body b');
  });

  it('throws when the named section is absent', () => {
    expect(() => applySectionDeletion('## a\nx\n', '## missing')).toThrow(/not found|no match/i);
  });

  /**
   * THE GUARD THAT MATTERS. The first control arm deleted a single LINE — and
   * left the section heading ("Phase entry — record the phase") plus two further
   * paragraphs that named `transitionPhase` and explained exactly when to call
   * it. The control arm's first live run returned trace=YES, which would have
   * been reported as INERT. It was not inert; the instruction was still there.
   *
   * So: after applying a canary's mutation, the command file must not mention
   * the instruction's function at all. Any residue means the control arm is not
   * a control, and every verdict drawn from it is void.
   */
  it('after mutation, NO declared directive site still mentions the instruction (M5.E15)', () => {
    // Widened from one file to every declared site. The single-file version of
    // this test passed while four other command files still ordered the call —
    // which is `B55`: the arm was mutated, the instruction was not isolated.
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      const residue = c.trace.functionName ?? 'transitionPhase';
      for (const entry of c.deletions) {
        const src = readFileSync(join(ROOT, entry.file), 'utf-8');
        const mutated = applyDeletions(src, [entry]);
        expect(mutated, `${c.id}: mutated ${entry.file} still mentions ${residue}`)
          .not.toContain(residue);
      }
    }
  });
});

describe('seam precondition cannot be laundered', () => {
  it('a SKIPPED probe (null) is not "proven" — it must refuse, like an explicit failure', () => {
    // --skip-probe records null. If null were treated as proven, the precondition
    // would be bypassable by omission, which reopens the hole it exists to close.
    const seamProven = null === true && true === true;
    expect(seamProven).toBe(false);
    expect(() => resolveVerdict({ treatmentHits: 3, controlHits: 0, runsPerArm: 3, seamProven }))
      .toThrow(/seam|mutation|precondition/i);
  });
});

describe('canary registry (AC3.1–AC3.3)', () => {
  it('the registry file exists and a reader can audit it', () => {
    expect(existsSync(join(ROOT, CANARY_REGISTRY_PATH))).toBe(true);
  });

  it("B41's phase-entry rule is in the set (AC3.2)", () => {
    const reg = loadCanaryRegistry(ROOT);
    const b41 = reg.canaries.find(c => c.id === 'B41-phase-entry');
    expect(b41).toBeTruthy();
    expect(b41.command).toBe('execute');
    expect(b41.instruction).toMatch(/transitionPhase/);
  });

  it('every canary declares its trace BEFORE any run (AC3.3)', () => {
    const reg = loadCanaryRegistry(ROOT);
    expect(reg.canaries.length).toBeGreaterThan(0);
    for (const c of reg.canaries) {
      expect(c.trace, `${c.id} must declare a trace`).toBeTruthy();
      expect(c.declaredAt, `${c.id} must record when its trace was declared`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        c.deletions?.length,
        `${c.id} must name exactly what the control arm deletes`
      ).toBeGreaterThan(0);
    }
  });

  it('each canary names a trace field the harness can actually observe', () => {
    const OBSERVABLE = new Set(['phaseChanged', 'completedPhasesGrew', 'filesAdded', 'filesChanged', 'commitsAdded']);
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      expect(OBSERVABLE.has(c.trace.field), `${c.id} trace.field=${c.trace.field}`).toBe(true);
    }
  });

  it('AC1.3 — EVERY declared anchor occurs exactly once in its real file (live corpus)', () => {
    // A registry entry whose target has drifted out of its file would delete
    // nothing, make both arms identical, and read as INERT. Widened from the
    // single `deleteSection ?? deleteLine` anchor to every entry in deletions[]:
    // this now fails if anyone edits ANY of the five phase-entry headings.
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      for (const entry of c.deletions) {
        const src = readFileSync(join(ROOT, entry.file), 'utf-8');
        const target = entry.section ?? entry.line;
        const occurrences = entry.section
          ? src.split('\n').filter(l => l.trim() === entry.section.trim()).length
          : src.split('\n').filter(l => l.includes(entry.line)).length;
        expect(
          occurrences,
          `${c.id}: ${JSON.stringify(target)} occurs ${occurrences}x in ${entry.file}`
        ).toBe(1);
      }
    }
  });

  it('AC1.2 — B41-phase-entry declares its five directive sites, four by section + ship by line', () => {
    const c = loadCanaryRegistry(ROOT).canaries.find(x => x.id === 'B41-phase-entry');
    expect(c.isolation).toBe('directive');
    const bySection = c.deletions.filter(d => d.section).map(d => d.file).sort();
    const byLine = c.deletions.filter(d => d.line).map(d => d.file);
    expect(bySection).toEqual([
      'commands/execute.md',
      'commands/plan.md',
      'commands/review.md',
      'commands/verify.md',
    ]);
    expect(byLine).toEqual(['commands/ship.md']);
  });
});

describe('M5.E15 FR1 — directive-scoped deletion (AC1.1, AC1.4, AC1.5)', () => {
  it('AC1.1 — a canary entry declaring neither section nor line throws, naming the canary id', () => {
    const bad = { canaries: [{ id: 'no-anchor', isolation: 'directive', deletions: [{ file: 'commands/execute.md' }] }] };
    expect(() => assertRegistryShape(bad)).toThrow(/no-anchor/);
  });

  it('AC1.1 — a canary with no deletions[] at all throws rather than falling back to one file', () => {
    const bad = { canaries: [{ id: 'legacy-shape', isolation: 'directive', deleteSection: '## x' }] };
    expect(() => assertRegistryShape(bad)).toThrow(/legacy-shape/);
  });

  /**
   * REVIEW finding — a canary with no `trace.functionName` must be refused.
   *
   * The old control-arm check guarded it: `if (residue && mutated.includes(residue))`.
   * Replacing that with the independent walk dropped the guard, and `walkResidue`
   * takes the token straight to `String.prototype.includes` — so an absent token
   * becomes the LITERAL string "undefined", which occurs all over a JavaScript
   * corpus. Measured: a two-line fixture containing `const a = undefined;` returns
   * a hit.
   *
   * The run then refuses, naming `undefined` as the leaked instruction. Fail-closed,
   * so no bad verdict escapes — but the operator is handed a nonsense reason for a
   * measurement that cost money, and the real cause (an under-specified canary) is
   * invisible. The registry validated `deletions` and `isolation` and never checked
   * the one field the entire leak check depends on.
   */
  it('a canary whose trace declares no functionName is refused at load', () => {
    const bad = {
      canaries: [{
        id: 'no-token',
        isolation: 'directive',
        deletions: [{ file: 'commands/execute.md', section: '## x' }],
        trace: { field: 'phaseChanged' },
      }],
    };
    expect(() => assertRegistryShape(bad)).toThrow(/no-token/);
    expect(() => assertRegistryShape(bad)).toThrow(/functionName/);
  });

  it('an empty-string functionName is refused too — it matches every file', () => {
    const bad = {
      canaries: [{
        id: 'empty-token',
        isolation: 'directive',
        deletions: [{ file: 'commands/execute.md', section: '## x' }],
        trace: { field: 'phaseChanged', functionName: '' },
      }],
    };
    expect(() => assertRegistryShape(bad)).toThrow(/empty-token/);
  });

  it('the live registry passes the token check', () => {
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      expect(c.trace.functionName, `${c.id} must declare the residue token`).toBeTruthy();
    }
  });

  it('AC1.4 — the dispatcher routes section entries to applySectionDeletion', () => {
    const src = '# top\n\n## target\nbody\n\n## keep\nkept\n';
    expect(applyDeletions(src, [{ file: 'f.md', section: '## target' }]))
      .toBe('# top\n\n## keep\nkept\n');
  });

  it('AC1.4 — the dispatcher routes line entries to applyDeletion', () => {
    const src = 'alpha\ncall foo()\nomega\n';
    expect(applyDeletions(src, [{ file: 'f.md', line: 'call foo()' }]))
      .toBe('alpha\nomega\n');
  });

  it('AC1.4 — an absent anchor throws rather than skipping that file', () => {
    expect(() => applyDeletions('a\nb\n', [{ file: 'f.md', line: 'nope' }])).toThrow(/not found/i);
    expect(() => applyDeletions('a\nb\n', [{ file: 'f.md', section: '## nope' }])).toThrow(/not found/i);
  });

  it('AC1.4 — a line anchor matching more than once throws', () => {
    expect(() => applyDeletions('dup\ndup\n', [{ file: 'f.md', line: 'dup' }]))
      .toThrow(/more than once/i);
  });

  /**
   * AC1.5 — over-deletion wearing the costume of a controlled change.
   *
   * `applySectionDeletion` deletes to the next same-or-higher heading. Declaring
   * a section anchor over a heading that ALSO orders unrelated calls removes
   * those too — the control arm then differs from the treatment arm in more than
   * the one instruction being measured, and the verdict is not about that
   * instruction any more. This fixture is shaped like `commands/ship.md`'s
   * `### 5. Update State`, which is exactly why that site is declared by LINE.
   */
  it('AC1.5 — a section anchor that also orders a different function fails', () => {
    const shipShaped = [
      '### 5. Update State',
      '',
      "1. `await transitionPhase(baseDir, 'SHIP')` — the measured instruction.",
      "2. `await completePhase(baseDir, 'SHIP')` — a DIFFERENT instruction that must survive.",
      '',
      '## next',
    ].join('\n');
    expect(() => assertSectionAnchorIsDiscrete(shipShaped, '### 5. Update State', 'transitionPhase'))
      .toThrow(/completePhase/);
  });

  it('AC1.5 — a section dedicated to the measured instruction passes', () => {
    const dedicated = [
      '## Phase entry',
      '',
      "Call `await transitionPhase(baseDir, 'EXECUTE')` at entry.",
      'Surface the returned `{quarantined}` list if non-empty.',
      '',
      '## next',
    ].join('\n');
    expect(() => assertSectionAnchorIsDiscrete(dedicated, '## Phase entry', 'transitionPhase'))
      .not.toThrow();
  });

  it('AC1.5 — every declared section anchor in the live registry is discrete', () => {
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      const residue = c.trace.functionName;
      for (const entry of c.deletions.filter(d => d.section)) {
        const src = readFileSync(join(ROOT, entry.file), 'utf-8');
        expect(
          () => assertSectionAnchorIsDiscrete(src, entry.section, residue),
          `${c.id}: ${entry.file} § ${entry.section}`
        ).not.toThrow();
      }
    }
  });
});
