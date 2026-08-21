import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { applyRigorOverrides } from '../plugin/tools/lib/profile.js';

const CMD_DIR = fileURLToPath(new URL('../plugin/commands/', import.meta.url));
const read = (f) => readFileSync(join(CMD_DIR, f), 'utf-8');

// The four phase-approval boxes that became conditional (B74), and the flag each
// one must name. SHIP is deliberately absent — see its own test below.
const CONDITIONAL = {
  'discuss.md': 'confirm_discuss',
  'plan.md': 'confirm_plan',
  'verify.md': 'confirm_verify',
  'review.md': 'confirm_review',
};

describe('B74 — the phase-approval boxes are conditional, and name their flag', () => {
  it.each(Object.entries(CONDITIONAL))('%s gates its approval box on %s', (file, flag) => {
    const box = read(file)
      .split('\n')
      .find((l) => /^- \[ \].*approves/.test(l));
    expect(box, `${file} has no "- [ ] ... approves" exit-criteria line`).toBeDefined();
    expect(box).toContain(`gates.${flag}`);
  });

  it('SHIP stays UNCONDITIONAL, because it is a floor and not a tier-gated ask', () => {
    // The asymmetry is the correct shape. If someone "fixes" it for consistency,
    // an unattended run would silently clear the merge gate — re-litigating
    // D-M5E17-5 by omission, which is exactly how ship.md's old self-exemption
    // survived thirteen releases.
    const box = read('ship.md')
      .split('\n')
      .find((l) => /^- \[ \].*approves PR for merge/.test(l));
    expect(box).toBeDefined();
    expect(box).toMatch(/unconditional/i);
    expect(box).toContain('floor');
    expect(box).not.toContain('gates.confirm_ship');
  });
});

describe('B108 — no command maps gate_strictness to confirm cadence', () => {
  // gate_strictness sets ONE gate: anti_rationalization. v0.1.31 moved confirm
  // cadence to `attention` and left three command files describing the old dial.
  // This catches the next one rather than trusting a sweep.
  const OFFENDER = /`gate_strictness:\s*(off|light|strict)`[^|\n]*\|[^|\n]*\b(confirm|auto-advance)\b/i;

  const files = readdirSync(CMD_DIR).filter((f) => f.endsWith('.md'));

  it.each(files)('%s has no gate_strictness→confirm table row', (file) => {
    const offending = read(file)
      .split('\n')
      .filter((l) => OFFENDER.test(l))
      // anti-rationalization is gate_strictness's one real gate job.
      .filter((l) => !/anti-?rationalization/i.test(l))
      // Anti-rationalization tables quote the temptation in the first cell —
      // `| "gate_strictness: strict means I should confirm..." | No. ... |`.
      // Those rows DENY the mapping; matching them would flag the fix as the bug.
      .filter((l) => !/^\|\s*"/.test(l.trim()));
    expect(offending, `${file} still maps gate_strictness to confirm cadence`).toEqual([]);
  });

  it('gate_strictness really does set only anti_rationalization among the gates', () => {
    // Derived, not asserted: if a future change gives gate_strictness another
    // gate, this fails and the docs above become wrong on purpose.
    const mk = (g) => ({ rigor_overrides: { gate_strictness: g, attention: 'attended' } });
    const light = applyRigorOverrides({}, mk('light')).gates;
    const strict = applyRigorOverrides({}, mk('strict')).gates;

    const differing = Object.keys({ ...light, ...strict }).filter((k) => light[k] !== strict[k]);
    expect(differing).toEqual(['anti_rationalization']);
  });
});

describe('B75 — the in-phase dial is named where the in-phase ceremony lives', () => {
  it.each(['discuss.md', 'plan.md', 'execute.md'])('%s names confirm_in_phase', (file) => {
    expect(read(file)).toContain('gates.confirm_in_phase');
  });

  it('confirm_in_phase is true ONLY at attended', () => {
    const at = (a) => applyRigorOverrides({}, { rigor_overrides: { attention: a } }).gates.confirm_in_phase;
    expect(at('attended')).toBe(true);
    expect(at('checkpointed')).toBe(false);
    expect(at('unattended')).toBe(false);
  });
});
