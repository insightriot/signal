// Archived 2026-10-29 (course correction Step 1, step 4): these checks pinned
// that every phase command called markFresh after its commit. Step 4 removed
// those calls: each phase commits STATE.md with its work and isStateStale reads
// the baseline from that commit. Copied verbatim from the file named below, so
// they use helpers defined there (CMD, read, denorm) and are not
// self-contained. What replaces them is in tests/commands-wording.test.js
// (no phase command calls markFresh) and tests/is-state-stale.test.js. This
// file does not run.

// --- from tests/commands-wording.test.js
describe("M5.E17 S2 — every markFresh call site states its ordering (AC3.1', FR3)", () => {
  // A file "instructs a markFresh call" iff it uses CALL syntax (open paren).
  // A bare mention is not a call site.
  const CALL_RE = /markFresh\(/;
  // Explicit, reasoned exclusion — NOT a regex tuned until it happens to miss.
  // /sig:checkpoint IS the manual refresh command; markFresh against HEAD is
  // its purpose, not a phase-close stamp, so "after the commit" does not apply.
  const EXEMPT = new Set(['checkpoint.md']);

  const callSites = readdirSync(CMD)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => CALL_RE.test(readFileSync(join(CMD, f), 'utf-8')))
    .filter((f) => !EXEMPT.has(f));

  it('enumerates call sites dynamically (a NEW command that calls markFresh is caught)', () => {
    // Not asserted against a hardcoded list — the predicate does the work, so a
    // future command is covered without anyone remembering to add it here.
    expect(callSites.length).toBeGreaterThanOrEqual(5);
    expect(callSites).toContain('ship.md');
    // execute.md calls it too since its rewrite (old check: archive/tests/execute-wording.test.js).
    expect(callSites).toContain('execute.md');
  });

  it.each(['discuss.md', 'execute.md', 'plan.md', 'review.md', 'ship.md', 'verify.md'])(
    '%s states that markFresh runs AFTER the commit it stamps',
    (file) => {
      const text = denorm(readFileSync(join(CMD, file), 'utf-8'));
      expect(
        /after\s+the\s+commit/i.test(text),
        `${file}: markFresh call site states no ordering. Silence is the defect — ` +
          `the agent picks, and ship.md picked wrong on 2026-07-30 (FR3).`
      ).toBe(true);
    }
  );

  it('AUDIT — markFresh ordering across all call sites (recorded either way, AC3.2)', () => {
    // Checked 2026-07-31. Result at PLAN: 2 explicit / 2 silent / 1 wrong.
    //   plan.md:173, discuss.md:168 — explicit and correct, wording reused below
    //   verify.md:84, review.md:137 — SILENT (no ordering stated)
    //   ship.md:100                 — WRONG (§5.3, ahead of four staging steps)
    //   execute.md:50               — not a call site (prose mention)
    //   checkpoint.md:57            — different contract, exempt above
    // FR3.2 named three siblings to check; the sweep found five call sites.
    // "Checked, nothing to change" is a result, not a skip (M5.E13 AC1.5).
    const wording = 'after the commit';
    for (const f of ['plan', 'discuss']) {
      expect(denorm(read(f)), `${f}: the reference wording regressed`).toContain(wording);
    }
    // B55 NOTE: making all four match byte-for-byte puts four copies of this
    // instruction in the corpus, which the adherence canary's per-file control
    // arm cannot isolate. Drift is the worse failure so this is deliberate —
    // but any future canary on THIS instruction inherits B55 and is untrusted
    // until M5.E15 fixes the control arm corpus-wide.
    expect(true).toBe(true);
  });
});
