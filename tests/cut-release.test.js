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
    // Written first as "the real CHANGELOG refuses a cut" — which was true when
    // written and FALSE ten minutes later, the moment notes were written for
    // the next release. That version tested a transient property of the file
    // rather than the invariant, so it is phrased against the durable fact
    // instead: strip whatever pending section happens to exist, and what
    // REMAINS — the historical M5.E7 heading — must not satisfy the guard.
    it('the real CHANGELOG.md refuses once its pending notes are removed', async () => {
      const { readFile } = await import('node:fs/promises');
      const real = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf-8');

      // The historical heading is the whole reason this bug existed; if it ever
      // goes away, this test should say so rather than silently pass.
      expect(real).toContain('## [Unreleased] — 2026-07-26 — The v2 direction audit (M5.E7)');

      const firstRelease = real.search(/^## \[\d+\.\d+\.\d+\]/m);
      const noPending =
        real.slice(0, real.indexOf('---') + 3) + '\n\n' + real.slice(firstRelease);

      expect(() => foldChangelog(noPending, '9.9.9', '2026-01-01', 'T')).toThrow(/B84/);
    });
  });

  it('sets the facts.md test count', () => {
    expect(setFactsTestCount('- **Test count:** 1954\n', 1978)).toContain('**Test count:** 1978');
  });

  it('throws when the facts.md count line is absent', () => {
    expect(() => setFactsTestCount('- **Tests:** 10\n', 20)).toThrow(/Test count.*not found/);
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
