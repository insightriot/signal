// M5.E2.S1.t8 — stampOnConformance (the Alembic blind-stamp guard).
//
// A stamp asserts "this file matches the current layout." Stamping a still-
// polluted file would be a LIE that then suppresses the upgrade banner + makes
// the auto-sense think it's done. So the stamp is written ONLY on full
// conformance. Proof-of-fail: a stamp written on a non-conformant file → fails.

import { describe, it, expect } from 'vitest';

import { stampOnConformance, senseState, CURRENT_LAYOUT_VERSION } from '../tools/lib/migrate-memory.js';

const CONFORMANT =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - DISCUSS (2026-07-16)\nblockers: []\n---\n# Project State\n\nshort body\n`;
const POLLUTED =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "PLAN (2026-07-04) — ${'narrative prose that far exceeds the budget '.repeat(6)}"\n` +
  `blockers: []\n---\nbody\n`;

describe('M5.E2.S1.t8 stampOnConformance', () => {
  it('stamps a conformant file to CURRENT_LAYOUT_VERSION', () => {
    const out = stampOnConformance(CONFORMANT);
    expect(out).toMatch(new RegExp(`^docs_layout_version: ${CURRENT_LAYOUT_VERSION}$`, 'm'));
    expect(senseState(out).stamped).toBe(true);
  });

  it('does NOT stamp a non-conformant file — the blind-stamp guard (proof-of-fail)', () => {
    const out = stampOnConformance(POLLUTED);
    expect(out).toBe(POLLUTED); // unchanged
    expect(out).not.toMatch(/docs_layout_version:/);
  });

  it('is idempotent — stamping an already-stamped conformant file is a byte-identical no-op', () => {
    const once = stampOnConformance(CONFORMANT);
    expect(stampOnConformance(once)).toBe(once);
  });
});
