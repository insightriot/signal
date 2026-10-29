// Archived 2026-10-29 (course correction Step 1): these checks pinned the
// phase-entry paragraph execute.md shared word for word with verify and review,
// before execute.md was rewritten as numbered steps. Copied verbatim from the
// file named below, as it stood before the rewrite, so they use helpers defined
// there (read, MIDDLE) and are not self-contained. What they protected (the
// phase-entry call is conditional, names its own phase, and comes before the
// work) is still checked against the new file in tests/commands-wording.test.js
// and tests/phase-recording.test.js. This file does not run.

// --- from tests/commands-wording.test.js
describe('M5.E13 S2.t4 — the phase-entry instruction is conditional and shared (AC1.1)', () => {
  const CONDITION = '**Call this only if every precondition above passed.**';

  // plan.md was rewritten as numbered steps (archive/tests/plan-wording.test.js):
  // its own wording, still conditional. The others keep the shared paragraph
  // until their own rewrite.
  const SHARED = MIDDLE.filter((f) => f !== 'plan');

  it('all four middle commands make the phase-entry call conditional', () => {
    for (const f of SHARED) expect(read(f), f).toContain(CONDITION);
    expect(read('plan')).toMatch(/Only if step 1 let the command through\. Call `await transitionPhase\(baseDir, 'PLAN'\)`/);
  });

  it('the old UNCONDITIONAL phrasing is gone from every command', () => {
    // The exact string B48 was filed against.
    for (const f of MIDDLE) {
      expect(read(f), f).not.toMatch(/\*\*Before any Workflow step\*\*, call `await transitionPhase/);
    }
  });

  it('the shared wordings are IDENTICAL apart from the phase name — drift is caught, not trusted', () => {
    // A single shared wording was the requirement (FR1.1) precisely so the four
    // cannot diverge. Normalising the phase token is what makes them comparable.
    const normalised = SHARED.map((f) => {
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
  // (the remaining test in this describe was unchanged and stays live)
});
