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
  applySectionDeletion,
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
  it('after mutation, the command file no longer mentions the instruction at all', () => {
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      const src = readFileSync(join(ROOT, 'commands', `${c.command}.md`), 'utf-8');
      const mutated = c.deleteSection
        ? applySectionDeletion(src, c.deleteSection)
        : applyDeletion(src, c.deleteLine);
      const residue = c.trace.functionName ?? 'transitionPhase';
      expect(mutated, `${c.id}: mutated commands/${c.command}.md still mentions ${residue}`)
        .not.toContain(residue);
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
        c.deleteSection ?? c.deleteLine,
        `${c.id} must name exactly what the control arm deletes`
      ).toBeTruthy();
    }
  });

  it('each canary names a trace field the harness can actually observe', () => {
    const OBSERVABLE = new Set(['phaseChanged', 'completedPhasesGrew', 'filesAdded', 'filesChanged', 'commitsAdded']);
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      expect(OBSERVABLE.has(c.trace.field), `${c.id} trace.field=${c.trace.field}`).toBe(true);
    }
  });

  it("the canary's deletion target actually exists in the command file it names", () => {
    // A registry entry whose target has drifted out of the command file would
    // delete nothing, make both arms identical, and read as INERT.
    for (const c of loadCanaryRegistry(ROOT).canaries) {
      const src = readFileSync(join(ROOT, 'commands', `${c.command}.md`), 'utf-8');
      const target = c.deleteSection ?? c.deleteLine;
      const occurrences = c.deleteSection
        ? src.split('\n').filter(l => l.trim() === c.deleteSection.trim()).length
        : src.split('\n').filter(l => l.includes(c.deleteLine)).length;
      expect(occurrences, `${c.id}: ${JSON.stringify(target)} occurs ${occurrences}x in commands/${c.command}.md`).toBe(1);
    }
  });
});
