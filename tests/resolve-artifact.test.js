// Tests for resolveArtifactPath (M4.5.E10.S2.t1, FR1 Epic-prefix resolver).
//
// /sig:resume Step 3 tries a small precedence ladder to locate a phase's
// artifact. This adds pattern 0 — the Epic-prefixed name (`M4.5.E10-PLAN.md`)
// — above the legacy numeric/no-prefix/phase-literal patterns, so hand-managed
// Epic-prefixed projects (Signal-on-Signal) stop reporting "artifact not found".
//
// The resolver is pure over an injectable `existsFn`, so most cases run in
// memory; one case uses the real fixture to prove the existsSync default.

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveArtifactPath } from '../tools/lib/resume.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build an existsFn over an explicit allow-list of absolute paths.
const existsOver = (planningDir, names) => {
  const set = new Set(names.map((n) => join(planningDir, n)));
  return (p) => set.has(p);
};

const P = '/proj/.planning';

describe('resolveArtifactPath', () => {
  // AC1.1 — Epic-prefixed resolves when current_epic is set and the file exists.
  it('AC1.1: resolves the Epic-prefixed artifact when current_epic is set', () => {
    const existsFn = existsOver(P, ['M4.5.E10-PLAN.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'M4.5.E10', existsFn });
    expect(out).toBe(join(P, 'M4.5.E10-PLAN.md'));
  });

  // AC1.2 — legacy numeric resolves; pattern-0 is skipped when current_epic null.
  it('AC1.2: resolves a legacy numeric artifact and skips pattern-0 when current_epic is null', () => {
    const existsFn = existsOver(P, ['1-PLAN.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: null, existsFn });
    expect(out).toBe(join(P, '1-PLAN.md'));
  });

  // AC1.3 — precedence: Epic-prefixed (0) wins over a legacy match (1).
  it('AC1.3: Epic-prefixed wins precedence over a co-existing legacy artifact', () => {
    const existsFn = existsOver(P, ['M4.5.E10-PLAN.md', '1-PLAN.md', 'PLAN.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'M4.5.E10', phase: 'PLAN', existsFn });
    expect(out).toBe(join(P, 'M4.5.E10-PLAN.md'));
  });

  // AC1.4 — no match returns null (no crash, no false match).
  it('AC1.4: returns null when no pattern matches', () => {
    const existsFn = existsOver(P, ['UNRELATED.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'M4.5.E10', phase: 'PLAN', existsFn });
    expect(out).toBeNull();
  });

  // Pattern 2 (no-prefix) and pattern 3 (phase-literal) still resolve.
  it('resolves the no-prefix artifact (pattern 2)', () => {
    const existsFn = existsOver(P, ['REQUIREMENTS.md']);
    expect(resolveArtifactPath(P, 'REQUIREMENTS', { existsFn })).toBe(join(P, 'REQUIREMENTS.md'));
  });

  it('resolves the phase-literal artifact (pattern 3, e.g. PLAN-PLAN.md)', () => {
    const existsFn = existsOver(P, ['PLAN-PLAN.md']);
    expect(resolveArtifactPath(P, 'PLAN', { phase: 'PLAN', existsFn })).toBe(join(P, 'PLAN-PLAN.md'));
  });

  // Legacy ascending-N tie-break: the lowest N wins.
  it('breaks legacy ties by ascending N (1 before 2)', () => {
    const existsFn = existsOver(P, ['1-PLAN.md', '2-PLAN.md']);
    expect(resolveArtifactPath(P, 'PLAN', { existsFn })).toBe(join(P, '1-PLAN.md'));
  });

  // Traversal reject: a malicious current_epic must NOT produce a pattern-0
  // match, even when everything "exists". It must fall through to the first
  // legacy candidate instead.
  it('rejects a traversal current_epic and falls through to legacy (../etc)', () => {
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: '../etc', existsFn: () => true });
    // pattern-0 skipped -> first tried candidate is the numeric 1-PLAN.md.
    expect(out).toBe(join(P, '1-PLAN.md'));
    expect(out).not.toContain('..');
  });

  it('rejects a mid-path traversal current_epic and falls through (E1/../..)', () => {
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'E1/../..', existsFn: () => true });
    expect(out).toBe(join(P, '1-PLAN.md'));
    expect(out).not.toContain('..');
  });

  // A sanitized Epic id containing dots/dashes (the real shape) is accepted.
  it('accepts the real Epic id shape (dots + dashes)', () => {
    const existsFn = existsOver(P, ['M4.5.E10-REQUIREMENTS.md']);
    const out = resolveArtifactPath(P, 'REQUIREMENTS', { currentEpic: 'M4.5.E10', existsFn });
    expect(out).toBe(join(P, 'M4.5.E10-REQUIREMENTS.md'));
  });

  // On-disk fixture: the real existsSync default finds the Epic-prefixed file.
  it('resolves against the real filesystem (existsSync default)', () => {
    const planningDir = join(__dirname, 'fixtures', 'resume', 'epic-prefixed', '.planning');
    const out = resolveArtifactPath(planningDir, 'PLAN', { currentEpic: 'M4.5.E99' });
    expect(out).toBe(join(planningDir, 'M4.5.E99-PLAN.md'));
  });
});
