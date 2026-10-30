// Archived 2026-10-30 (course correction Step 1, step 4b): /sig:checkpoint moved
// to archive/commands/checkpoint.md, so this check of its step order has no live
// subject. Copied verbatim from the file named below; it uses CMD from there and
// is not self-contained. What replaces it is in tests/commands-wording.test.js
// (no live instruction names /sig:checkpoint; resume's banner says to commit
// STATE.md). This file does not run.

// --- from tests/commands-wording.test.js
  // /sig:checkpoint still calls markFresh, but that rewrites only the stored
  // last_updated_commit. With STATE.md committed, the baseline is STATE.md's
  // last commit, so the refresh clears nothing until it is committed (PR #326
  // review).
  it('checkpoint.md commits STATE.md after markFresh, before reporting fresh', () => {
    const text = readFileSync(join(CMD, 'checkpoint.md'), 'utf-8');
    const fresh = text.indexOf('Call `markFresh(baseDir)`');
    const commit = text.indexOf('**Commit `STATE.md`**');
    expect(fresh).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(fresh);
    expect(commit).toBeLessThan(text.indexOf('Now fresh at:'));
  });

