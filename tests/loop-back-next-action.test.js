// SIG-373 — after a VERIFY or REVIEW FAIL, the next command is /sig:execute.
// describeNextAction read the phase alone, so /sig:drive ran /sig:review over
// a VERIFY FAIL's unfixed failures (and /sig:ship over a REVIEW FAIL's), and
// /sig:status and /sig:resume named the same wrong command. "This visit" is the
// rule loopStatusFor already uses (lastVerdictThisVisit, SIG-349).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { describeNextAction, formatNextActionCopy } from '../plugin/tools/lib/status.js';
import { lastVerdictThisVisit, loopStatusFor } from '../plugin/tools/lib/loop-ceiling.js';

const D = '2026-10-30';
const state = (phase, phase_passes, extra = {}) => ({ phase, phase_passes, ...extra });

describe('describeNextAction after a FAIL (SIG-373)', () => {
  it('this visit\'s VERIFY FAIL → /sig:execute, not /sig:review', () => {
    const s = state('VERIFY', [`VERIFY FAIL (${D})`], { phase_pass_mark: 0 });
    const desc = describeNextAction('VERIFY', [], null, s);
    expect(desc.action).toBe('/sig:execute');
    expect(desc.loopBack).toEqual({ phase: 'VERIFY', ifAccepted: '/sig:review' });
  });

  it('this visit\'s REVIEW FAIL → /sig:execute, not /sig:ship', () => {
    const s = state('REVIEW', [`VERIFY PASS (${D})`, `REVIEW FAIL (${D})`], { phase_pass_mark: 1 });
    expect(describeNextAction('REVIEW', [], null, s).action).toBe('/sig:execute');
  });

  it('a skipped REVIEW makes a VERIFY FAIL\'s accepted-limit command /sig:ship', () => {
    const s = state('VERIFY', [`VERIFY FAIL (${D})`]);
    expect(describeNextAction('VERIFY', ['REVIEW'], null, s).loopBack.ifAccepted).toBe('/sig:ship');
  });

  it('a PASS or PASS-WITH-FIXES goes on by phase', () => {
    expect(describeNextAction('VERIFY', [], null, state('VERIFY', [`VERIFY PASS (${D})`])).action).toBe('/sig:review');
    expect(describeNextAction('REVIEW', [], null, state('REVIEW', [`REVIEW PASS-WITH-FIXES (${D})`])).action).toBe('/sig:ship');
  });

  it('a FAIL from an earlier visit (before the mark) does not send it back', () => {
    // Entered VERIFY again after the loop back; nothing recorded yet in this visit.
    const s = state('VERIFY', [`VERIFY FAIL (${D})`], { phase_pass_mark: 1 });
    expect(describeNextAction('VERIFY', [], null, s).action).toBe('/sig:review');
  });

  it('with no mark (STATE written before M6.E18) the newest entry counts', () => {
    expect(describeNextAction('VERIFY', [], null, state('VERIFY', [`VERIFY FAIL (${D})`])).action).toBe('/sig:execute');
  });

  it('another phase\'s FAIL as the newest entry does not count', () => {
    // At REVIEW with VERIFY's FAIL newest: not REVIEW's verdict.
    const s = state('REVIEW', [`VERIFY FAIL (${D})`]);
    expect(describeNextAction('REVIEW', [], null, s).action).toBe('/sig:ship');
  });

  it('a state it cannot read gives the phase-only answer and never throws', () => {
    for (const s of [
      null,
      'nonsense',
      state('VERIFY', 'not a list'),
      state('VERIFY', [`VERIFY FAIL (${D})`], { phase_pass_mark: 5 }),
      state('VERIFY', [`VERIFY FAIL (${D})`], { phase_pass_mark: 'x' }),
      state('VERIFY', [42]),
      state('EXECUTE', [`VERIFY FAIL (${D})`]),
    ]) {
      expect(describeNextAction('VERIFY', [], null, s).action).toBe('/sig:review');
    }
  });

  it('no fourth argument → the result before this change', () => {
    expect(describeNextAction('VERIFY', [])).toEqual({
      recognized: true,
      action: '/sig:review',
      rawPhase: 'VERIFY',
      valid: describeNextAction('VERIFY', []).valid,
    });
  });

  it('the copy names the FAIL and the command an accepted limit goes on to', () => {
    const s = state('VERIFY', [`VERIFY FAIL (${D})`]);
    const copy = formatNextActionCopy(describeNextAction('VERIFY', [], null, s));
    expect(copy).toMatch(/^Next phase: \/sig:execute — this VERIFY recorded a FAIL/);
    expect(copy).toMatch(/accepts the failures as limits instead: \/sig:review$/);
  });
});

describe('lastVerdictThisVisit is the rule loopStatusFor uses', () => {
  // loopStatusFor reads completed_phases too; absent is "could not look" (null).
  const state = (phase, phase_passes, extra = {}) => ({ phase, phase_passes, completed_phases: [], ...extra });

  it('lifts the ceiling on this visit\'s PASS and holds it on this visit\'s FAIL', () => {
    const pass = state('VERIFY', [`VERIFY FAIL (${D})`, `VERIFY PASS (${D})`], { phase_pass_mark: 1 });
    expect(lastVerdictThisVisit(pass, 'VERIFY')).toBe('PASS');
    expect(loopStatusFor(pass, 'VERIFY', { today: D }).atCeiling).toBe(false);

    const fail = state('VERIFY', [`VERIFY FAIL (${D})`, `VERIFY FAIL (${D})`], { phase_pass_mark: 1 });
    expect(lastVerdictThisVisit(fail, 'VERIFY')).toBe('FAIL');
    expect(loopStatusFor(fail, 'VERIFY', { today: D }).atCeiling).toBe(true);
  });

  it('an earlier visit\'s PASS lifts nothing (SIG-349)', () => {
    const s = state('VERIFY', [`VERIFY PASS (${D})`, `VERIFY PASS (${D})`], { phase_pass_mark: 2 });
    expect(lastVerdictThisVisit(s, 'VERIFY')).toBe(null);
    expect(loopStatusFor(s, 'VERIFY', { today: D }).atCeiling).toBe(true);
  });
});

describe('every caller passes the state (SIG-373)', () => {
  const read = (name) => readFileSync(new URL(`../plugin/commands/${name}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');

  it('drive.md picks the next command with the state', () => {
    const text = read('drive.md');
    expect(text).toContain('describeNextAction(state.phase, profile.phases_skipped, null, state)');
    expect(text).not.toContain('describeNextAction(state.phase, profile.phases_skipped)');
  });

  it('status.md renders desc.loopBack before the plain command branch', () => {
    const text = read('status.md');
    const loop = text.indexOf('Else if `desc.loopBack` is set');
    const plain = text.indexOf('Else if `desc.action` starts with `/sig:`');
    expect(loop).toBeGreaterThan(-1);
    expect(plain).toBeGreaterThan(loop);
  });
});
