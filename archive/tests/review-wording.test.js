// Archived 2026-10-30 (course correction Step 1): these checks pinned wording in
// review.md before it was rewritten as numbered steps. Copied verbatim from the
// files named below, as they stood on main before the rewrite, so they use
// helpers defined there (read, MIDDLE, review, flat, doc, step) and are not
// self-contained. What they protected is still checked against the new file:
//   - the phase-entry call is conditional and names its own phase:
//     tests/commands-wording.test.js (all four middle commands now use step 2's
//     own wording, so the shared paragraph and its identity check are gone);
//   - the ceiling is counted from passes and exits and the visit mark: the code
//     itself, tests/loop-ceiling.test.js and tests/review-steps.test.js (the
//     paragraphs explaining it were removed from review.md);
//   - the fresh-context reviewers get nothing but the change and requirements:
//     tests/fresh-reviewer-dispatch.test.js, now on the instruction "Give each
//     nothing else" instead of the phrase "omissions are the mechanism".
// The rest of tests/review-loop-doc-contract.test.js was re-anchored on the new
// step headings, not archived. This file does not run.

// --- from tests/commands-wording.test.js
describe('M5.E13 S2.t4 — the phase-entry instruction is conditional and shared (AC1.1)', () => {
  const CONDITION = '**Call this only if every precondition above passed.**';

  // plan.md, execute.md and verify.md were rewritten as numbered steps
  // (archive/tests/plan-wording.test.js, execute-wording.test.js, verify-wording.test.js):
  // their own wording, still conditional. The others keep the shared paragraph
  // until their own rewrite.
  const REWRITTEN = ['plan', 'execute', 'verify'];
  const SHARED = MIDDLE.filter((f) => !REWRITTEN.includes(f));

  it('all four middle commands make the phase-entry call conditional', () => {
    for (const f of SHARED) expect(read(f), f).toContain(CONDITION);
    for (const f of REWRITTEN) {
      expect(read(f), f).toMatch(
        new RegExp(`Only if step 1 let the command through\\. Call \`await transitionPhase\\(baseDir, '${f.toUpperCase()}'\\)\``)
      );
    }
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

  it('each command still names its OWN phase in the call (normalisation did not hide a copy-paste bug)', () => {
    for (const f of MIDDLE) {
      const phase = f.toUpperCase();
      expect(read(f), f).toContain(`transitionPhase(baseDir, '${phase}')`);
    }
  });
});

// --- from tests/review-loop-doc-contract.test.js
  it('review.md says the count is the larger of passes and exits', () => {
    expect(review).toMatch(/larger of/);
    expect(review).toContain('phase_passes');
  });

  it('the ceiling paragraph describes the visit marker, no longer "not checked (SIG-349)"', () => {
    const para = flat.slice(flat.search(/\*\*The ceiling is counted, not remembered\.\*\*/), flat.search(/Render the halt with/));
    expect(para).not.toMatch(/which visit wrote that entry is not checked/);
    expect(para).toMatch(/phase_pass_mark/);
  });

// --- from tests/fresh-reviewer-dispatch.test.js
    it.each(forbidden)('review.md § 4.5 explicitly withholds %s', (doc_name) => {
      const re = new RegExp(`\\*\\*[Nn]ot\\*\\*[^\\n]*\`${doc_name}\`|\`${doc_name}\`[^\\n]*`);
      expect(re.test(step), `§ 4.5 must say ${doc_name} is withheld`).toBe(true);
      expect(step).toMatch(/omissions are the mechanism/);
    });
