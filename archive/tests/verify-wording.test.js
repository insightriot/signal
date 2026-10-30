// Archived 2026-10-29 (course correction Step 1): these checks pinned wording in
// verify.md before it was rewritten as numbered steps. Copied verbatim from the
// files named below, as they stood before the rewrite, so they use helpers
// defined there (read, MIDDLE, verify, CONDITION) and are not self-contained.
// What they protected is still checked against the new file:
//   - the phase-entry call is conditional, names its own phase, and comes before
//     the work: tests/commands-wording.test.js, tests/phase-recording.test.js;
//   - the coverage check runs on the report and the validator gates it:
//     tests/verify-coverage-wiring.test.js, tests/verify-steps.test.js.
// The validator's three failure modes are its own error messages now, checked in
// tests/verification-template.test.js. This file does not run.

// --- from tests/commands-wording.test.js
describe('M5.E13 S2.t4 — the phase-entry instruction is conditional and shared (AC1.1)', () => {
  const CONDITION = '**Call this only if every precondition above passed.**';

  // plan.md and execute.md were rewritten as numbered steps
  // (archive/tests/plan-wording.test.js, archive/tests/execute-wording.test.js):
  // their own wording, still conditional. The others keep the shared paragraph
  // until their own rewrite.
  const REWRITTEN = ['plan', 'execute'];
  const SHARED = MIDDLE.filter((f) => !REWRITTEN.includes(f));

  it('all four middle commands make the phase-entry call conditional', () => {
    for (const f of SHARED) expect(read(f), f).toContain(CONDITION);
    for (const f of REWRITTEN) {
      expect(read(f), f).toMatch(
        new RegExp(`Only if step 1 let the command through\\. Call \`await transitionPhase\\(baseDir, '${f.toUpperCase()}'\\)\``)
      );
    }
  });
});

// --- from tests/review-loop-doc-contract.test.js
//   ['verify.md', verify, /^### 5a\. Record the pass\b.*$/m, "recordPass(baseDir, 'VERIFY'"],
//   const start = verify.search(/^### 5a\. Record the pass\b.*$/m);

// --- from tests/verify-coverage-wiring.test.js
describe('AC1.4 — VERIFY is instructed to read REQUIREMENTS.md', () => {
  it('names the REQUIREMENTS artifact, which before M5.E10 it never did', () => {
    expect(verify).toMatch(/REQUIREMENTS\.md/);
  });

  it('says why a task loop is not enough — the reason travels with the instruction', () => {
    // Without this, a later editor reads Step 1b as duplicating Step 1 and
    // removes it. The justification is the load-bearing part.
    expect(verify).toMatch(/never became a task acceptance criterion/i);
  });
});

describe('AC3.1 — the template gate blocks the phase', () => {
  it('names all three structural failure modes, including present-but-empty', () => {
    expect(verify).toMatch(/empty body/i);
    expect(verify).toMatch(/says nothing/i);
    expect(verify).toMatch(/no denominator appears anywhere/i);
  });

  it('states the pairing, so a green structural result is not read as verification', () => {
    expect(verify).toMatch(/cannot check the answers/i);
    expect(verify).toMatch(/theatre/i);
  });
});
