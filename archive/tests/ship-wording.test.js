// Archived 2026-10-31 (course correction Step 1): these checks pinned wording in
// ship.md before it was rewritten as numbered steps with no history. Copied
// verbatim from the files named below, as they stood on main before the
// rewrite, so they use helpers defined there and are not self-contained. What
// they protected is still checked against the new file, in the files named
// beside each block. This file does not run.

// --- from tests/commands-wording.test.js (the PR is still required and the
// exemption is still refused there: "the hand-off still requires a PR and an
// approval", "no LIVE instruction says the PR is optional")
  it('the removal is recorded, not silently dropped (AC1.5 convention)', () => {
    expect(ship()).toMatch(/No direct-to-main exemption/i);
    expect(ship()).toContain('D-M5E17-5');
  });

// --- from tests/pr-reviewer-effort.test.js (readReviewerEffort reading every run
// on the head commit is checked against the code in that file's own tests)
    expect(line).toMatch(/every run on the head commit/);
