// tests/commands-wording.test.js — M5.E13 S2.t4/t5 (FR1.1, FR1.4).
//
// Two prose invariants that no test held before, and whose absence is why
// `B48` and `B51` both shipped:
//
//   AC1.1 — the four middle phase commands state the phase-entry transition in
//           ONE shared wording, conditional on preconditions passing.
//   AC1.5 — no command instructs a phase transition that the NEXT command also
//           performs.
//
// Prose is agent-executed, so it is exactly as load-bearing as code and gets
// exactly as much pinning. M5.E8 established the technique on ADHERENCE-LOG.md.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CMD = join(ROOT, 'commands');
const MIDDLE = ['plan', 'execute', 'verify', 'review'];
const read = (f) => readFileSync(join(CMD, `${f}.md`), 'utf-8');

describe('M5.E13 S2.t4 — the phase-entry instruction is conditional and shared (AC1.1)', () => {
  const CONDITION = '**Call this only if every precondition above passed.**';

  it('all four middle commands carry the conditional clause', () => {
    for (const f of MIDDLE) expect(read(f), f).toContain(CONDITION);
  });

  it('the old UNCONDITIONAL phrasing is gone from every command', () => {
    // The exact string B48 was filed against.
    for (const f of MIDDLE) {
      expect(read(f), f).not.toMatch(/\*\*Before any Workflow step\*\*, call `await transitionPhase/);
    }
  });

  it('the four wordings are IDENTICAL apart from the phase name — drift is caught, not trusted', () => {
    // A single shared wording was the requirement (FR1.1) precisely so the four
    // cannot diverge. Normalising the phase token is what makes them comparable.
    const normalised = MIDDLE.map((f) => {
      const src = read(f);
      const start = src.indexOf(CONDITION);
      expect(start, `${f}: conditional clause missing`).toBeGreaterThan(-1);
      const end = src.indexOf('\n## ', start);
      return src
        .slice(start, end === -1 ? undefined : end)
        .replace(/\b(PLAN|EXECUTE|VERIFY|REVIEW)\b/g, '{PHASE}');
    });
    for (const n of normalised.slice(1)) expect(n).toBe(normalised[0]);
  });

  it('each command still names its OWN phase in the call (normalisation did not hide a copy-paste bug)', () => {
    for (const f of MIDDLE) {
      const phase = f.toUpperCase();
      expect(read(f), f).toContain(`transitionPhase(baseDir, '${phase}')`);
    }
  });
});

describe('M5.E13 S2.t5 — no command sets a phase the next command also sets (AC1.5, B51)', () => {
  it('discuss.md no longer instructs the DISCUSS close to set phase: PLAN', () => {
    const src = read('discuss');
    // B51: the stale block was doubly wrong — the pre-M5.E9 convention (the
    // OUTGOING command advanced the phase) AND the pre-schema_version:1 file
    // format (## Current Phase headings, which parseFrontmatter cannot read).
    // Line-anchored: an actual markdown HEADING, not a backticked mention of
    // one. The prose that replaced the block necessarily names it, and a naive
    // substring match flags the explanation as the defect.
    expect(src).not.toMatch(/^##\s*Current Phase\s*$/m);
    expect(src).not.toMatch(/^##\s*Completed Phases\s*$/m);
  });

  it('AUDIT (recorded either way — "nothing to change" is a result, not a skip)', () => {
    // calibrate.md: describes the CALIBRATE->DISCUSS handoff, a transition no
    // other command claims. Checked 2026-07-29: no collision, nothing changed.
    expect(read('calibrate')).toContain('transitionPhase');
    // ship.md: already-corrected prose (M5.E9/B43). SHIP is terminal, so
    // nothing transitions out of it and no next command can double-record.
    expect(read('ship')).toContain('transitionPhase');
    // The audit's finding is asserted, so a future edit that introduces a
    // double-set in either file fails here rather than being rediscovered.
    for (const f of ['calibrate', 'ship', 'discuss']) {
      expect(read(f), `${f}: pre-schema_v1 phase-heading block reintroduced`).not.toMatch(
        /^##\s*Completed Phases\s*$/m
      );
    }
  });

  it('no OTHER command file carries the stale pre-schema_v1 phase-set block either', () => {
    const stale = readdirSync(CMD)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => /^##\s*Completed Phases\s*$/m.test(readFileSync(join(CMD, f), 'utf-8')));
    expect(stale).toEqual([]);
  });
});
