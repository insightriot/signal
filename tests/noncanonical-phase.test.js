import { describe, it, expect } from 'vitest';
import {
  nextActionForPhase,
  describeNextAction,
  formatNextActionCopy,
} from '../tools/lib/status.js';
import { renderResumeBriefing } from '../tools/lib/resume.js';
import { PHASES } from '../tools/lib/state.js';

/**
 * B70 — `/sig:status` and `/sig:resume` throw outright on a project whose
 * `phase` is not one of the seven canonical names. Measured: 5 of 12 real
 * projects.
 *
 * `nextActionForPhase` throws on anything outside PHASES (`status.js`). In
 * `resume.md:128` the call sits INSIDE `renderResumeBriefing`'s argument list,
 * so a literal execution throws before the render is ever entered — the whole
 * briefing dies. Every neighbouring optional read (`isStaleVsOrigin`,
 * `readLayoutBanner`, `readStateSizeForTier`, `readEffectiveProfile`) is marked
 * fail-open; this one call nobody marked safe. `reachedDoneViaSkip`, the
 * sibling function directly below it in the same file, already returns `false`
 * for an unknown phase.
 *
 * Chosen behaviour (D-M5E18-5): render everything, name the problem. Staying
 * silent was rejected as `B39`'s shape — a field that drifted by accident would
 * look identical to one set deliberately.
 */

// The real value on disk in eval-project-C's .planning/STATE.md — a
// multi-paragraph prose blob, not a phase name. Verbatim prefix.
const TRACTION_ENGINE_PHASE = `**PHASE 12 — REPRIORITIZED 2026-08-02 to: GET IT OPERATIONAL.** Brett, after
four days that produced 54 commits of which 52 were planning docs and zero
were code: THIS THING DOESN'T WORK YET / THEME - get this 100% operational,
nothing else matters. Two consequences, both binding. FIRST - the ROUND-3
PLAN CHECK IS SKIPPED, deliberately.`;

describe('B70 — a non-canonical STATE phase must not kill the briefing', () => {
  describe('the strict contract is preserved', () => {
    it('nextActionForPhase still throws — this fix adds a safe path, it does not loosen the guard', () => {
      expect(() => nextActionForPhase('NONSENSE', [])).toThrow(/unknown currentPhase/);
      expect(() => nextActionForPhase(TRACTION_ENGINE_PHASE, [])).toThrow(/unknown currentPhase/);
    });
  });

  describe('describeNextAction — fail-open', () => {
    it('does not throw on the real eval-project-C phase blob', () => {
      expect(() => describeNextAction(TRACTION_ENGINE_PHASE, [])).not.toThrow();
    });

    it('reports recognized:false and no action for a non-canonical phase', () => {
      const d = describeNextAction(TRACTION_ENGINE_PHASE, []);
      expect(d.recognized).toBe(false);
      expect(d.action).toBeNull();
    });

    it('carries the raw phase through so the user can see what STATE actually holds', () => {
      const d = describeNextAction(TRACTION_ENGINE_PHASE, []);
      expect(d.rawPhase).toBe(TRACTION_ENGINE_PHASE);
    });

    it('names all seven valid phases', () => {
      const d = describeNextAction('NONSENSE', []);
      expect(d.valid).toEqual([...PHASES]);
      expect(d.valid).toHaveLength(7);
    });

    it('agrees with nextActionForPhase for every canonical phase', () => {
      for (const phase of PHASES) {
        const d = describeNextAction(phase, []);
        expect(d.recognized).toBe(true);
        expect(d.action).toBe(nextActionForPhase(phase, []));
      }
    });

    it('honors phasesSkipped exactly as the strict function does', () => {
      const d = describeNextAction('DISCUSS', ['PLAN']);
      expect(d.action).toBe(nextActionForPhase('DISCUSS', ['PLAN']));
      expect(d.action).toBe('/sig:execute');
    });

    it('does not throw on null, undefined, or a non-string phase', () => {
      for (const bad of [null, undefined, 42, {}, []]) {
        expect(() => describeNextAction(bad, [])).not.toThrow();
        expect(describeNextAction(bad, []).recognized).toBe(false);
      }
    });
  });

  describe('formatNextActionCopy — names the problem', () => {
    it('returns the plain command for a recognized phase (unchanged copy)', () => {
      const copy = formatNextActionCopy(describeNextAction('DISCUSS', []));
      expect(copy).toContain('/sig:plan');
      expect(copy).not.toMatch(/does not recognize|not a phase Signal/i);
    });

    it('says the phase is not recognized, for an unrecognized one', () => {
      const copy = formatNextActionCopy(describeNextAction(TRACTION_ENGINE_PHASE, []));
      expect(copy).toMatch(/not a phase Signal recognizes/i);
    });

    it('shows what STATE actually holds', () => {
      const copy = formatNextActionCopy(describeNextAction('PHASE 12', []));
      expect(copy).toContain('PHASE 12');
    });

    it('names the seven valid values so the fix is actionable', () => {
      const copy = formatNextActionCopy(describeNextAction('NONSENSE', []));
      for (const phase of PHASES) {
        expect(copy).toContain(phase);
      }
    });

    it('truncates a multi-paragraph blob to a single line — the briefing is capped at 50 lines', () => {
      const copy = formatNextActionCopy(describeNextAction(TRACTION_ENGINE_PHASE, []));
      // The raw value is 5 lines; the rendered copy must not carry them through.
      expect(TRACTION_ENGINE_PHASE.split('\n').length).toBeGreaterThan(4);
      const phaseMentionLines = copy.split('\n').filter((l) => l.includes('PHASE 12'));
      expect(phaseMentionLines).toHaveLength(1);
      expect(phaseMentionLines[0].length).toBeLessThan(160);
    });
  });

  describe('renderResumeBriefing — the whole briefing still renders', () => {
    const state = {
      schema_version: 1,
      phase: TRACTION_ENGINE_PHASE,
      current_epic: 'PHASE12',
      current_tasks: [],
      completed_phases: [],
      blockers: [],
    };

    it('renders without throwing when the phase is non-canonical', () => {
      expect(() =>
        renderResumeBriefing({
          cwd: '/tmp/eval-project-C',
          state,
          profile: { tier: 'FULL', phases_skipped: [] },
          visionText: 'A project.',
          nextAction: formatNextActionCopy(describeNextAction(state.phase, [])),
        })
      ).not.toThrow();
    });

    it('still renders the sections above the next-action line', () => {
      const out = renderResumeBriefing({
        cwd: '/tmp/eval-project-C',
        state,
        profile: { tier: 'FULL', phases_skipped: [] },
        visionText: 'A project that exists.',
        nextAction: formatNextActionCopy(describeNextAction(state.phase, [])),
      });
      expect(out).toContain('A project that exists.');
      expect(out).toContain('FULL');
      expect(out).toMatch(/not a phase Signal recognizes/i);
    });

    it('the briefing stays within the 50-line cap despite the blob', () => {
      const out = renderResumeBriefing({
        cwd: '/tmp/eval-project-C',
        state,
        profile: { tier: 'FULL', phases_skipped: [] },
        visionText: 'A project.',
        nextAction: formatNextActionCopy(describeNextAction(state.phase, [])),
      });
      expect(out.split('\n').length).toBeLessThanOrEqual(50);
    });
  });
});
