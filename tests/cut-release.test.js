import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseReleaseArgs,
  bumpJsonVersion,
  bumpMapStamp,
  foldChangelog,
  setFactsTestCount,
  setFactsAttribution,
  setChangelogTestCount,
  readFactsTestCount,
  releaseEdits,
} from '../tools/cut-release.js';
import { VERSION_SOURCES } from '../plugin/tools/lib/doc-hygiene.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * `tools/cut-release.js` — repo-local release tooling.
 *
 * Only the PURE edit functions are tested. The script's I/O half shells out to
 * git and runs the whole suite, so importing that path from inside the suite
 * would be recursive and slow — the same seam `tests/adherence-suite-guard.js`
 * keeps for the adherence harness.
 */

describe('cut-release: argument parsing', () => {
  it('reads version, title and --apply', () => {
    const a = parseReleaseArgs(['node', 'x', '0.1.18', '--title', 'A thing', '--apply']);
    expect(a).toEqual({ version: '0.1.18', title: 'A thing', apply: true });
  });

  it('defaults to a dry run — writing is opt-in', () => {
    expect(parseReleaseArgs(['node', 'x', '0.1.18', '--title', 'T']).apply).toBe(false);
  });

  it('returns a null version when none is given', () => {
    expect(parseReleaseArgs(['node', 'x']).version).toBeNull();
  });
});

describe('cut-release: the edits', () => {
  it('bumps a JSON version field', () => {
    expect(bumpJsonVersion('{\n  "version": "0.1.17"\n}', '0.1.18')).toContain('"version": "0.1.18"');
  });

  it('throws rather than silently no-op when the version field is missing', () => {
    // A silent no-op is how a release ships with one file un-bumped.
    expect(() => bumpJsonVersion('{"name":"sig"}', '0.1.18')).toThrow(/no "version" field/);
  });

  it('bumps the map header stamp', () => {
    const html = '<p class="meta">Map &middot; v0.1.17 &middot; <a href="x">c</a></p>';
    expect(bumpMapStamp(html, '0.1.18')).toContain('Map &middot; v0.1.18');
  });

  it('throws when the map stamp is absent', () => {
    expect(() => bumpMapStamp('<p>no stamp</p>', '0.1.18')).toThrow(/stamp not found/);
  });

  it('folds [Unreleased] into a dated, titled heading', () => {
    const out = foldChangelog('# CL\n\n## [Unreleased]\n\n### Fixed\n- x\n', '0.1.18', '2026-08-03', 'A thing');
    expect(out).toContain('## [0.1.18] — 2026-08-03 — A thing');
    expect(out).not.toContain('[Unreleased]');
    expect(out).toContain('- x'); // the notes survive
  });

  it('refuses to cut a release with no [Unreleased] notes', () => {
    // Releasing with no notes is the failure this prevents, not a case to
    // paper over by emitting an empty heading.
    expect(() => foldChangelog('# CL\n\n## [0.1.17] — old\n', '0.1.18', '2026-08-03', 'T')).toThrow(
      /no `## \[Unreleased\]` section/,
    );
  });

  // B84. The fixture above omits [Unreleased] entirely — but the REAL
  // CHANGELOG.md always has one, permanently: M5.E7's v2 direction audit
  // shipped no code and was never versioned. So the guard above was proven on
  // a corpus that could not exhibit the bug, and in the real file the refusal
  // branch was unreachable while the replace silently relabelled that historical
  // section as the new release. Observed on the v0.1.20 cut.
  describe('B84 — a historical [Unreleased] below the newest release is not notes', () => {
    const WITH_HISTORICAL = [
      '# CL',
      '',
      '## [0.1.19] — 2026-08-06 — Newest release',
      '- shipped',
      '',
      '## [Unreleased] — 2026-07-26 — The v2 direction audit (M5.E7)',
      '- no code shipped, so no version was cut',
      '',
    ].join('\n');

    it('REFUSES rather than relabelling it', () => {
      expect(() => foldChangelog(WITH_HISTORICAL, '0.1.20', '2026-08-06', 'T')).toThrow(/B84/);
    });

    it('leaves the historical heading byte-identical when it refuses', () => {
      // Asserting only that it threw would pass even if the damage had landed.
      let after = WITH_HISTORICAL;
      try {
        after = foldChangelog(WITH_HISTORICAL, '0.1.20', '2026-08-06', 'T');
      } catch {
        /* expected */
      }
      expect(after).toBe(WITH_HISTORICAL);
      expect(after).toContain('## [Unreleased] — 2026-07-26 — The v2 direction audit (M5.E7)');
    });

    it('folds the PENDING section and leaves the historical one alone', () => {
      const src = ['# CL', '', '## [Unreleased]', '- the real notes', '', WITH_HISTORICAL.split('\n').slice(2).join('\n')].join('\n');
      const out = foldChangelog(src, '0.1.20', '2026-08-06', 'A thing');
      expect(out).toContain('## [0.1.20] — 2026-08-06 — A thing');
      expect(out).toContain('- the real notes');
      // The historical heading survives, untouched.
      expect(out).toContain('## [Unreleased] — 2026-07-26 — The v2 direction audit (M5.E7)');
    });

    // The guarantee stated against the file that actually ships, not a fixture.
    //
    // ── History of this assertion, kept because it is the point ──────────────
    // v1: "the real CHANGELOG refuses a cut" — true when written, FALSE ten
    //     minutes later once notes existed for the next release. It tested a
    //     transient property of the file rather than the invariant.
    // v2: strip whatever pending section exists; what REMAINS — the historical
    //     M5.E7 `[Unreleased]` heading — must not satisfy the guard. It carried
    //     an explicit instruction: "if it ever goes away, this test should say
    //     so rather than silently pass."
    // v3 (2026-08-18): IT WENT AWAY, and the test said so — it failed the
    //     moment the heading was relabelled to
    //     `## 2026-07-26 — … · analysis only, no version cut`, which resolved
    //     the contradiction the heading carried (finished work labelled
    //     unreleased). The instruction was honoured rather than the assertion
    //     weakened.
    //
    // v4 (2026-08-20): v3 REPEATED v1's error, inverted. "No `[Unreleased]`
    //     heading anywhere" is a transient property too — it holds only while
    //     no release notes are pending, so WRITING THE NOTES failed the suite.
    //     That is the normal, required first step of every cut (`foldChangelog`
    //     refuses without a pending section), so the guard blocked the workflow
    //     it exists to protect. Found by writing notes for the 0.1.20-era loop
    //     work, not by reading this file.
    //
    // What is durable: `B84`'s hazard is POSITIONAL, and so is the anchor in
    // `foldChangelog` — a pending section sits ABOVE the newest released
    // heading, and anything below it is history that must never satisfy the
    // guard. So that is what this asserts. A pending `[Unreleased]` at the top
    // is not a defect; it is a release in progress.
    it('the real CHANGELOG.md carries no [Unreleased] heading BELOW the newest release, for B84 to trip over', async () => {
      const { readFile } = await import('node:fs/promises');
      const real = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf-8');

      const newestReleased = real.match(/^## \[\d+\.\d+\.\d+\]/m);
      expect(newestReleased, 'CHANGELOG.md has no released heading at all').not.toBeNull();
      const history = real.slice(newestReleased.index);
      expect(history).not.toMatch(/^##\s*\[Unreleased\]/m);

      // And the section that used to carry it is still present, now labelled
      // for what it is — so this cannot pass by the entry having been deleted.
      expect(real).toContain('## 2026-07-26 — The v2 direction audit (M5.E7) · analysis only, no version cut');
    });
  });

  it('sets the facts.md test count', () => {
    expect(setFactsTestCount('- **Test count:** 1954\n', 1978)).toContain('**Test count:** 1978');
  });

  it('throws when the facts.md count line is absent', () => {
    expect(() => setFactsTestCount('- **Tests:** 10\n', 20)).toThrow(/Test count.*not found/);
  });

  // B106. `setFactsTestCount` updated the number and left the sentence naming
  // the release that produced it, so every cut published a fresh count
  // attributed to the PREVIOUS version. Caught by M6.E2's `facts-attribution`
  // check firing on the v0.1.31 cut — the check worked, the tool did not.
  describe('setFactsAttribution', () => {
    const LINE =
      'Set at each release by `tools/cut-release.js` — most recently **v0.1.30 (2026-08-18)**. Deriving it any other way undercounts.';

    it('re-points the attribution at the release being cut', () => {
      const out = setFactsAttribution(LINE, '0.1.31', '2026-08-21');
      expect(out).toContain('most recently **v0.1.31 (2026-08-21)**');
      expect(out).not.toContain('0.1.30');
      // The surrounding prose is untouched — this rewrites a fact, not a sentence.
      expect(out).toContain('Deriving it any other way undercounts.');
    });

    it('throws rather than silently no-opping when the attribution is absent', () => {
      // `rewriteBugTally`'s lesson (B82/M6.E2): a replace that matches nothing
      // returns the input unchanged, and the caller reports success on a file
      // it never fixed. A release must fail loudly instead.
      expect(() => setFactsAttribution('no attribution here', '1.0.0', '2026-01-01')).toThrow(
        /attribution not found/
      );
    });

    // The check reads what the tool writes. If these two patterns drift, the
    // cut goes green and `facts-attribution` goes red — which is the failure
    // this pins, not a hypothetical.
    it('produces output that published-facts.js FACTS_REL can parse back', async () => {
      const { readFile } = await import('node:fs/promises');
      const checkSrc = await readFile(
        new URL('../plugin/tools/lib/published-facts.js', import.meta.url),
        'utf-8'
      );
      const declared = checkSrc.match(/^const FACTS_REL = (\/.*\/[a-z]*);$/m);
      expect(declared, 'FACTS_REL not found in published-facts.js').not.toBeNull();

      const body = declared[1].replace(/^\/(.*)\/([a-z]*)$/, '$1');
      const flags = declared[1].replace(/^\/(.*)\/([a-z]*)$/, '$2');
      const factsRel = new RegExp(body, flags);

      const out = setFactsAttribution(LINE, '0.1.31', '2026-08-21');
      expect(out.match(factsRel)?.[1]).toBe('0.1.31');
    });
  });
});

/**
 * `B109` — the release notes' own test-count trailer.
 *
 * `setFactsTestCount` set the figure in `facts.md`; nothing set the same figure
 * where a reader actually meets it. The trailer is typed by hand into
 * `[Unreleased]` while the Epic is still adding tests, so it is stale BY
 * CONSTRUCTION at the cut.
 */
describe('B109 — the CHANGELOG test-count trailer', () => {
  const PENDING = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '- a thing',
    '',
    '2841 → **2927 tests**.',
    '',
    '## [0.1.32] — 2026-08-21 — prior',
    '',
    '2789 → **2841 tests**.',
    '',
  ].join('\n');

  it('corrects the pending trailer to the gating run count', () => {
    const { next, note } = setChangelogTestCount(PENDING, 2979);
    expect(next).toContain('2841 → **2979 tests**.');
    expect(note).toMatch(/2927 → 2979/);
  });

  it('reproduces the exact v0.1.33 defect and fixes it', () => {
    // The real numbers: the trailer said 2927 while facts.md, CLAUDE.md and
    // CONTEXT.md — written in the same PR — all said 2979.
    expect(PENDING).toContain('**2927 tests**');
    expect(setChangelogTestCount(PENDING, 2979).next).not.toContain('**2927 tests**');
  });

  it('leaves the RELEASED section\'s trailer byte-identical (B84\'s anchor)', () => {
    const { next } = setChangelogTestCount(PENDING, 2979);
    expect(next).toContain('2789 → **2841 tests**.');
    // The released heading and everything under it is history.
    const history = (src) => src.slice(src.indexOf('## [0.1.32]'));
    expect(history(next)).toBe(history(PENDING));
  });

  /**
   * The design call this function exists to record. The first draft THREW on a
   * missing trailer; measuring first said 14 of 33 released sections carry one
   * and 19 do not, so throwing would fail the cut for the more common shape.
   */
  describe('absence is legitimate — 19 of 33 past releases carry no trailer', () => {
    const NO_TRAILER = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '- notes with no test count',
      '',
      '## [0.1.32] — 2026-08-21 — prior',
      '',
      '2789 → **2841 tests**.',
      '',
    ].join('\n');

    it('does NOT throw', () => {
      expect(() => setChangelogTestCount(NO_TRAILER, 2979)).not.toThrow();
    });

    it('returns the source unchanged', () => {
      expect(setChangelogTestCount(NO_TRAILER, 2979).next).toBe(NO_TRAILER);
    });

    it('says so rather than passing silently — rewriteBugTally\'s lesson', () => {
      const { note } = setChangelogTestCount(NO_TRAILER, 2979);
      expect(note).toMatch(/none in this section/);
      // An absent trailer must never render as a completed reconciliation.
      expect(note).not.toMatch(/corrected|already/);
    });

    it('does not reach DOWN into the released section for a trailer', () => {
      // NO_TRAILER's only `N → **M tests**` lives below the newest release.
      // Matching it would rewrite history — B84's failure, one function over.
      expect(setChangelogTestCount(NO_TRAILER, 2979).next).toContain('2789 → **2841 tests**.');
    });
  });

  describe('the baseline is checked and deliberately not rewritten', () => {
    it('flags a baseline that disagrees with what facts.md published', () => {
      const { note } = setChangelogTestCount(PENDING, 2979, 2800);
      expect(note).toMatch(/baseline reads 2841/);
      expect(note).toMatch(/facts\.md published 2800/);
    });

    it('leaves the baseline number itself alone', () => {
      expect(setChangelogTestCount(PENDING, 2979, 2800).next).toContain('2841 → **2979 tests**');
    });

    it('stays quiet when the baseline agrees', () => {
      expect(setChangelogTestCount(PENDING, 2979, 2841).note).not.toMatch(/baseline/);
    });
  });

  /**
   * Found by running the tool against the REAL `CHANGELOG.md`, not by the suite.
   *
   * The notes for this very fix quote `2841 → **2927 tests**` as an example in
   * their prose, above the section's actual trailer. Taking the FIRST match
   * rewrote the quoted example, left the real trailer stale, and reported
   * "corrected" — a false green, inside the function written to prevent one.
   *
   * `B82` again: a hand-written fixture has one trailer, the real file has two.
   */
  describe('the trailer is the LAST match, because prose above it may quote one', () => {
    const WITH_QUOTED_EXAMPLE = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      "- **A fix.** `v0.1.33`'s said `2841 → **2927 tests**` while facts.md said 2979.",
      '',
      '2979 → **2992 tests**.',
      '',
      '## [0.1.33] — 2026-08-24 — prior',
      '',
    ].join('\n');

    it('rewrites the foot trailer, not the quoted example', () => {
      const { next } = setChangelogTestCount(WITH_QUOTED_EXAMPLE, 3000);
      expect(next).toContain('2979 → **3000 tests**.');
      expect(next).toContain('`2841 → **2927 tests**`'); // prose preserved verbatim
    });

    it('reports the count it actually changed, not the one it skipped', () => {
      // The pre-fix bug reported "2927 → 3000" while editing the wrong line.
      const { note } = setChangelogTestCount(WITH_QUOTED_EXAMPLE, 3000);
      expect(note).toMatch(/2992 → 3000/);
      expect(note).not.toMatch(/2927/);
    });

    it('does NOT count the quotation as a candidate at all', () => {
      // Backtick filtering runs first, so the quoted example never competes.
      // The multi-candidate disclosure is therefore silent here — one real
      // trailer, one quotation, no ambiguity to report.
      const { note } = setChangelogTestCount(WITH_QUOTED_EXAMPLE, 3000);
      expect(note).not.toMatch(/candidates/);
    });

    it('discloses ambiguity only when two REAL trailers are present', () => {
      const two = [
        '# CL', '', '## [Unreleased]', '',
        '1 → **2 tests**.', '', 'more prose', '', '2979 → **2992 tests**.', '',
        '## [0.1.33] — x — y', '',
      ].join('\n');
      const { next, note } = setChangelogTestCount(two, 3000);
      expect(note).toMatch(/2 candidates/);
      expect(next).toContain('2979 → **3000 tests**.');
      expect(next).toContain('1 → **2 tests**.'); // the earlier one is left alone
    });
  });

  /**
   * The `**N tests.**` variant — period INSIDE the bold — is real and frozen in
   * history (v0.1.14, v0.1.11). Pinned against the live file because released
   * sections never change; asserting anything about the PENDING section would
   * be `B105`'s trap, a test on a transient property of the repository.
   */
  it('matches the historical `tests.**` variant that real releases used', () => {
    const real = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    expect(real).toMatch(/→ \*\*\d+ tests\.\*\*/); // the variant exists in history
    const { next } = setChangelogTestCount(
      ['# CL', '', '## [Unreleased]', '', '1736 → **1806 tests.**', '', '## [0.1.13] — x — y', ''].join('\n'),
      1900,
    );
    expect(next).toContain('1736 → **1900 tests.**');
  });

  /**
   * The deeper half of the same bug, found by CI review on the fix for the
   * shallow half. "Last match" only rescues a quotation that sits ABOVE a real
   * trailer. 19 of 33 released sections carry NO trailer, so the common shape
   * is a section that quotes the pattern and has none — there the single match
   * IS the quotation, and the pre-fix code rewrote it and said "corrected".
   */
  describe('a quotation is not a trailer, even when it is the only match', () => {
    const QUOTE_ONLY = [
      '# CL',
      '',
      '## [Unreleased]',
      '',
      '- A fix. The old notes said `2841 → **2927 tests**`, which was wrong.',
      '',
      '## [0.1.33] — 2026-08-24 — prior',
      '',
    ].join('\n');

    it('leaves a quoted figure alone when there is no real trailer', () => {
      expect(setChangelogTestCount(QUOTE_ONLY, 3000).next).toBe(QUOTE_ONLY);
    });

    it('reports absence rather than a false "corrected"', () => {
      const { note } = setChangelogTestCount(QUOTE_ONLY, 3000);
      expect(note).toMatch(/none in this section/);
      expect(note).not.toMatch(/corrected/);
    });

    it('still finds a real trailer that sits BELOW a quotation', () => {
      const src = QUOTE_ONLY.replace('\n## [0.1.33]', '\n2979 → **2992 tests**.\n\n## [0.1.33]');
      const { next } = setChangelogTestCount(src, 3000);
      expect(next).toContain('2979 → **3000 tests**.');
      expect(next).toContain('`2841 → **2927 tests**`');
    });

    it('is backtick parity, not line position — real trailers appear mid-line', () => {
      // e.g. v0.1.28's: "…while a live session holds the copy. 2664 → **2681 tests**."
      const midLine = ['# CL', '', '## [Unreleased]', '', 'Some prose. 2664 → **2681 tests**.', '', '## [0.1.27] — x — y', ''].join('\n');
      expect(setChangelogTestCount(midLine, 2700).next).toContain('2664 → **2700 tests**.');
    });
  });

  /**
   * `releaseEdits` runs the trailer BEFORE the fold, so a throw here would fire
   * first and hide `foldChangelog`'s `B84` message — the one that names the
   * offset and explains that the heading is history. That message exists
   * precisely for the state an operator finds most confusing.
   */
  it('leaves the fatal B84 diagnostic to foldChangelog rather than pre-empting it', () => {
    const HISTORICAL_ONLY = ['# CL', '', '## [0.1.33] — x — y', '', '## [Unreleased]', '', '- history', ''].join('\n');
    expect(() => setChangelogTestCount(HISTORICAL_ONLY, 3000)).not.toThrow();

    const read = (rel) => {
      if (rel === 'CHANGELOG.md') return HISTORICAL_ONLY;
      if (rel === 'plugin/references/facts.md') return '- **Test count:** 1\n\nmost recently **v0.1.32 (2026-08-21)**.';
      if (rel === 'docs/map/index.html') return 'Map &middot; v0.1.32';
      return '{"version": "0.1.32"}';
    };
    // The composed path must still surface B84's specific wording.
    expect(() =>
      releaseEdits({ version: '0.1.34', date: '2026-08-25', title: 't', testCount: 2, read }),
    ).toThrow(/B84/);
  });

  it('reads the published count back out of facts.md', () => {
    expect(readFactsTestCount('- **Test count:** 2979 (set at each release)')).toBe(2979);
    expect(readFactsTestCount('nothing here')).toBeNull();
  });

  /**
   * THE ORDERING INVARIANT. The trailer edit is scoped by the `[Unreleased]`
   * heading, which the fold replaces — so folding first makes the pending
   * section unfindable and the trailer silently unreconciled. That is the bug
   * this closes, reintroduced by a line swap, and nothing else would catch it.
   */
  it('releaseEdits reconciles the trailer AND folds the heading, in that order', () => {
    const read = (rel) => {
      if (rel === 'CHANGELOG.md') return PENDING;
      if (rel === 'plugin/references/facts.md')
        return '- **Test count:** 2841\n\nSet at each release, most recently **v0.1.32 (2026-08-21)**.';
      return '{"version": "0.1.32"}';
    };
    const edits = releaseEdits({
      version: '0.1.33',
      date: '2026-08-24',
      title: 'a title',
      testCount: 2979,
      read: (rel) => (rel === 'docs/map/index.html' ? 'Map &middot; v0.1.32' : read(rel)),
    });
    const changelog = edits.find((e) => e.file === 'CHANGELOG.md');
    expect(changelog.next).toContain('## [0.1.33] — 2026-08-24 — a title');
    expect(changelog.next).toContain('2841 → **2979 tests**.');
    expect(changelog.next).not.toContain('**2927 tests**');
    expect(changelog.note).toBeTruthy();
  });

  it('every releaseEdits entry that carries a note is surfaced, not swallowed', () => {
    // The CLI prints `e.note` on BOTH the dry-run and apply paths. A note that
    // exists and is never printed is the same failure as no note at all.
    const src = readFileSync(join(ROOT, 'tools/cut-release.js'), 'utf8');
    const printsNote = src.match(/if \(e\.note\) console\.log/g) ?? [];
    expect(printsNote.length).toBeGreaterThanOrEqual(2);
  });
});

describe('cut-release covers every version site', () => {
  // These three tests are about VERSION-SITE COVERAGE, not about the fold
  // guard, so they need a CHANGELOG in the state a real cut runs against: notes
  // already written under a pending `## [Unreleased]` at the top.
  //
  // Before B84 they read the file raw and it happened to work — because the
  // historical `[Unreleased]` heading lower down always satisfied the old
  // guard. That silent dependency is exactly the defect: these tests were
  // green *because* the bug existed. The precondition is now stated instead of
  // borrowed.
  const read = (rel) => {
    const raw = readFileSync(join(ROOT, rel), 'utf8');
    if (rel !== 'CHANGELOG.md') return raw;
    return raw.replace(/^---$/m, '---\n\n## [Unreleased]\n\n### Fixed\n- seeded by the test\n');
  };

  it('touches every file in VERSION_SOURCES that carries a version', () => {
    // The actual regression risk: someone adds a sixth entry to VERSION_SOURCES
    // and the release script keeps bumping five, so CI goes red mid-release
    // with no obvious cause. marketplace.json is excluded deliberately — it
    // uses the relative "." source and carries no version to bump (D-M5E17-4).
    const touched = new Set(
      releaseEdits({ version: '9.9.9', date: '2026-01-01', title: 'T', testCount: 1, read }).map(
        (e) => e.file,
      ),
    );
    const expected = VERSION_SOURCES.map((s) => s.file).filter(
      (f) => f !== '.claude-plugin/marketplace.json',
    );
    for (const f of expected) {
      expect(touched.has(f), `VERSION_SOURCES lists ${f} but cut-release.js does not update it`).toBe(
        true,
      );
    }
  });

  it('also updates references/facts.md, which VERSION_SOURCES does not cover', () => {
    // B56: the published test count is a release-time fact under the reading
    // recommended in that bug. Not a version site, but the same release-time
    // obligation, and it has gone stale at three consecutive releases.
    const files = releaseEdits({
      version: '9.9.9',
      date: '2026-01-01',
      title: 'T',
      testCount: 1,
      read,
    }).map((e) => e.file);
    expect(files).toContain('plugin/references/facts.md');
  });

  it('produces edits that satisfy checkVersionConsistency for every file it writes', () => {
    const edits = releaseEdits({
      version: '9.9.9',
      date: '2026-01-01',
      title: 'T',
      testCount: 1,
      read,
    });
    const byFile = Object.fromEntries(edits.map((e) => [e.file, e.next]));
    expect(byFile['plugin/.claude-plugin/plugin.json']).toContain('"version": "9.9.9"');
    expect(byFile['package.json']).toContain('"version": "9.9.9"');
    expect(byFile['CHANGELOG.md']).toMatch(/^## \[9\.9\.9\] — 2026-01-01 — T$/m);
    expect(byFile['docs/map/index.html']).toContain('Map &middot; v9.9.9');
  });
});

describe('cut-release stays repo-local', () => {
  it('is not a /sig: command — it lives in tools/, not commands/', () => {
    // Putting it in commands/ would ship it to users as part of the plugin and
    // change Signal's own command roster, which several counts are pinned to.
    // Same category as tools/validate-plugin.js: tooling for BUILDING Signal.
    const src = readFileSync(join(ROOT, 'tools/cut-release.js'), 'utf8');
    expect(src).toMatch(/SCOPE: this repo only/);
    expect(() => readFileSync(join(ROOT, 'plugin/commands/cut-release.md'), 'utf8')).toThrow();
  });

  it('does not commit, tag, or push — it prepares the edit and stops', () => {
    const src = readFileSync(join(ROOT, 'tools/cut-release.js'), 'utf8');
    for (const forbidden of ['git commit', 'git tag', 'git push']) {
      // Present in the printed "Next:" instructions, never in an execFileSync.
      expect(src).not.toMatch(new RegExp(`execFileSync\\([^)]*${forbidden.split(' ')[1]}`));
    }
  });
});
