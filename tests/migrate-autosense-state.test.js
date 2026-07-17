// M5.E2.S1.t6 — single-STATE auto-sense (V1 + V2). Stamp-first → structural
// sniff → per-project plan-data. Plan is DATA — it mutates nothing.
//
// Conservative auto-sense (FR6.5): only entries the write-guard would BLOCK go
// in the auto-move set; a block:false-but-LONG entry is FLAGGED, never moved.
// Proof-of-fail: a block:false-but-long entry appearing in the auto-move set →
// the test fails (it must be flag-only).

import { describe, it, expect } from 'vitest';

import { senseState, CURRENT_LAYOUT_VERSION } from '../tools/lib/migrate-memory.js';

const FM = (extra = '') =>
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n${extra}blockers: []\n`;

const STAMPED_CONFORMANT =
  `---\nschema_version: 1\ndocs_layout_version: ${CURRENT_LAYOUT_VERSION}\nphase: PLAN\n` +
  `current_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases:\n  - DISCUSS (2026-07-16)\nblockers: []\n---\n# Project State\n\nshort body\n`;

describe('M5.E2.S1.t6 senseState — stamp-first no-op', () => {
  it('a stamped + conformant STATE is a no-op (no vectors, noop:true)', () => {
    const plan = senseState(STAMPED_CONFORMANT);
    expect(plan.vectors).toEqual([]);
    expect(plan.stamped).toBe(true);
    expect(plan.conformant).toBe(true);
    expect(plan.noop).toBe(true);
  });

  it('a conformant-but-UNSTAMPED STATE has no moves but is not a no-op (needs a stamp)', () => {
    const conformantNoStamp =
      FM('completed_phases:\n  - DISCUSS (2026-07-16)\n') + '---\n# Project State\n\nshort body\n';
    const plan = senseState(conformantNoStamp);
    expect(plan.vectors).toEqual([]);
    expect(plan.conformant).toBe(true);
    expect(plan.stamped).toBe(false);
    expect(plan.noop).toBe(false);
    expect(plan.needsStamp).toBe(true);
  });
});

describe('M5.E2.S1.t6 senseState — vector detection', () => {
  it('detects vector-1 (offending frontmatter prose) as an auto-move', () => {
    const polluted =
      FM('completed_phases:\n  - "' + `PLAN (2026-07-04) — ${'narrative '.repeat(20)}` + '"\n') +
      '---\nbody\n';
    const plan = senseState(polluted);
    expect(plan.vectors).toContain('vector-1');
    expect(plan.v1.entries.length).toBeGreaterThan(0);
    expect(plan.noop).toBe(false);
  });

  it('detects vector-2 (a big inlined body) as a planned move', () => {
    const bigBody = 'inlined narrative paragraph. '.repeat(600); // ~17 KB
    const inlined = FM('completed_phases: []\n') + `---\n# Project State\n\n${bigBody}\n`;
    const plan = senseState(inlined);
    expect(plan.vectors).toContain('vector-2');
    expect(plan.v2.candidate).toBe(true);
    expect(plan.v2.bytes).toBeGreaterThan(8 * 1024);
  });

  it('does NOT flag an already-relocated (pointer) body as vector-2', () => {
    const pointer =
      FM('completed_phases: []\n') +
      '---\n# Project State\n\n<!-- migrate-memory:vector-2 relocated the prior inlined body to STATE-HISTORY.md on 2026-07-17. -->\n\npointer\n';
    const plan = senseState(pointer);
    expect(plan.vectors).not.toContain('vector-2');
  });
});

describe('M5.E2.S1.t6 senseState — conservative flag-not-move', () => {
  it('a block:false-but-LONG completed_phases entry is FLAGGED, never auto-moved (proof-of-fail)', () => {
    // ~120 chars: over the soft flag threshold (100), under the block budget (150).
    const longButLegal = `PLAN (2026-07-04) — ${'a legit but longish annotation '.repeat(3)}`.slice(0, 120);
    const state = FM(`completed_phases:\n  - "${longButLegal}"\n`) + '---\nbody\n';
    const plan = senseState(state);
    // It must NOT be in the auto-move set…
    expect(plan.v1.entries.some((e) => e.original.includes('longish'))).toBe(false);
    expect(plan.vectors).not.toContain('vector-1');
    // …it must be surfaced as an ambiguity flag instead.
    expect(plan.flags.some((f) => f.kind === 'long-completed-phase')).toBe(true);
  });

  it('a short clean entry is neither moved nor flagged', () => {
    const state = FM('completed_phases:\n  - DISCUSS (2026-07-16)\n') + '---\nbody\n';
    const plan = senseState(state);
    expect(plan.v1.entries).toEqual([]);
    expect(plan.flags).toEqual([]);
  });
});
