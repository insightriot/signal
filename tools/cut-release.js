#!/usr/bin/env node

// tools/cut-release.js — repo-local release tooling for Signal itself.
//
// SCOPE: this repo only. It is deliberately NOT a `/sig:` command and does not
// live in `commands/` — anything there ships to users as part of the plugin and
// would change Signal's own command roster (and every count pinned to it).
// This is the same category as `tools/validate-plugin.js`: maintainer tooling
// for building Signal, not a feature of Signal.
//
// WHY IT EXISTS. Cutting a release meant hand-editing four files that must all
// agree. `checkVersionConsistency` turns any disagreement red, so you could not
// ship a wrong one — but nothing did the edit for you, so every release was a
// manual checklist with a tripwire at the end. v0.1.17 was cut with an ad-hoc
// `node -e` one-liner and the map stamp was updated in a separate pass.
//
// It also closes `B56`. `references/facts.md` publishes a test count that has
// now gone stale at three consecutive releases, each time corrected by hand
// while the guard over it (which compares documents to each other, never to the
// suite) stayed green. Under the RELEASE reading recommended in that bug, the
// count is a release-time fact — so it is set here, from the same `vitest` run
// that gates the release. One run answers both "is the suite green" and "how
// many tests are there".
//
// Dry-run by default; `--apply` is required to write. Nothing is committed or
// tagged — this prepares the edit and gets out of the way.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// ---- args ----

export function parseReleaseArgs(argv) {
  const args = argv.slice(2);
  const apply = args.includes('--apply');
  const positional = args.filter((a) => !a.startsWith('--'));
  const titleIdx = args.indexOf('--title');
  const title = titleIdx !== -1 ? args[titleIdx + 1] : null;
  return { version: positional[0] ?? null, title, apply };
}

// ---- pure edit computation (unit-testable, no I/O) ----

/** plugin.json / package.json — bump the top-level `version` string. */
export function bumpJsonVersion(source, version) {
  const out = source.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`);
  if (out === source) throw new Error('no "version" field matched');
  return out;
}

/** docs/map/index.html — the header stamp, pinned via VERSION_SOURCES. */
export function bumpMapStamp(source, version) {
  const out = source.replace(/(Map\s+&middot;\s+v)\d+\.\d+\.\d+/, `$1${version}`);
  if (out === source) throw new Error('map header stamp not found');
  return out;
}

/**
 * CHANGELOG — fold the PENDING `## [Unreleased]` section into a released heading.
 *
 * Refuses when there is no pending section: that means the release notes were
 * never written, and a release with no notes is the failure this is meant to
 * prevent, not a case to paper over with an empty heading.
 *
 * "PENDING" is the whole fix (`B84`). This used to test `/^## \[Unreleased\]/m`
 * anywhere in the file and replace the first match — and `CHANGELOG.md` carries
 * a **permanent, historical** `[Unreleased]` section: M5.E7's v2 direction
 * audit, which deliberately shipped no code and so was never versioned. That
 * section satisfied the old guard **unconditionally and forever**, making the
 * refusal branch unreachable; and because the replace took the first match, a
 * cut with no notes written did not fail — it **relabelled the historical
 * section as the new release**, destroying the only heading that marked M5.E7
 * as no-code-shipped. Observed on the v0.1.20 cut and caught by reading the
 * diff, not by the tool or the suite.
 *
 * So the anchor is POSITIONAL: the pending section is the one above the newest
 * released `## [x.y.z]` heading. Anything below that is history and can neither
 * satisfy the guard nor be the replace target. The old test passed throughout,
 * because its fixture omitted the `[Unreleased]` heading the real file always
 * has — a guard proven on a corpus that could not exhibit the bug.
 */
const UNRELEASED_HEADING_RE = /^## \[Unreleased\].*$/m;
const RELEASED_HEADING_RE = /^## \[\d+\.\d+\.\d+\]/m;

/**
 * Locate the PENDING section — the one this cut is about.
 *
 * ONE implementation of "which section is pending", because `B82` is what
 * happens when the same question gets answered twice: a second derivation
 * cannot express what the first one means, and the two agree only on the shapes
 * that happen to be in the fixtures. `foldChangelog` and
 * `setChangelogTestCount` must agree about this or the second could rewrite a
 * released section while the first correctly refuses to.
 *
 * Returns `null` when there is no pending section — callers decide whether that
 * is fatal. It is for the fold (a release with no notes) and it is NOT for the
 * trailer (see below).
 */
function pendingSectionBounds(source) {
  const pending = source.match(UNRELEASED_HEADING_RE);
  const newestReleased = source.match(RELEASED_HEADING_RE);
  if (!pending || (newestReleased && pending.index > newestReleased.index)) return null;
  return {
    start: pending.index,
    headingLength: pending[0].length,
    end: newestReleased ? newestReleased.index : source.length,
  };
}

export function foldChangelog(source, version, date, title) {
  const bounds = pendingSectionBounds(source);

  if (!bounds) {
    const pending = source.match(UNRELEASED_HEADING_RE);
    throw new Error(
      pending
        ? 'CHANGELOG.md has no PENDING `## [Unreleased]` section — write the release notes ' +
          `first. (One exists at offset ${pending.index}, but it sits BELOW the newest ` +
          'released heading, so it is history, not this release. Folding it would relabel ' +
          'a closed record — see B84.)'
        : 'CHANGELOG.md has no `## [Unreleased]` section — write the release notes first',
    );
  }

  return (
    source.slice(0, bounds.start) +
    `## [${version}] — ${date} — ${title}` +
    source.slice(bounds.start + bounds.headingLength)
  );
}

/** `plugin/references/facts.md` — read the count currently published. */
export function readFactsTestCount(source) {
  const m = source.match(/\*\*Test count:\*\*\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * The pending section's own `N → **M tests**` trailer (`B109`).
 *
 * `setFactsTestCount` sets the count in `facts.md` from the gating run, and
 * NOTHING set the same figure where a reader actually meets it — the release
 * notes. That trailer is typed by hand into `[Unreleased]` while the Epic is
 * still adding tests, so it is stale **by construction** at the cut, not
 * occasionally: `v0.1.33`'s said `2841 → **2927 tests**` while three files
 * written in the same PR said **2979**. `B106` is the same shape one file over.
 *
 * ⚠ **ABSENCE IS NORMAL AND MUST NOT THROW.** The first design for this threw
 * on a missing trailer, reasoning that a cut which stops beats one that
 * publishes a stale figure. **Measured before building: 14 of 33 released
 * sections carry a trailer and 19 do not** — `v0.1.31`, `v0.1.25` and every
 * release before `v0.1.8` among them. Throwing would fail the cut for the more
 * common shape, which is `B42`'s defect: a newly-unconditional guard that makes
 * a legitimate mode unusable. The trailer is an optional flourish, not a
 * contract.
 *
 * ⚠ **But a no-op must not be silent** — that is `rewriteBugTally`'s bug, where
 * a replace matching nothing returned the input unchanged and the caller
 * reported success on a file it never fixed. So this returns a `note` for every
 * outcome and the CLI prints it, including the boring ones: *absent* reads as
 * absent, never as done (`B39`).
 *
 * The BASELINE is checked and deliberately NOT rewritten. `facts.md`'s pre-edit
 * count is the previous release's figure, so a disagreeing baseline is worth
 * saying out loud — but an author may legitimately span two releases, and
 * silently overwriting a number someone chose is a bigger fault than printing a
 * question about it.
 */
export const CHANGELOG_TRAILER_RE = /(\d+)(\s*→\s*\*\*)(\d+)(\s+tests\.?\*\*)/;

export function setChangelogTestCount(source, testCount, previousCount = null) {
  const bounds = pendingSectionBounds(source);
  if (!bounds) {
    throw new Error(
      'CHANGELOG.md has no PENDING `## [Unreleased]` section — write the release notes first',
    );
  }

  const section = source.slice(bounds.start, bounds.end);

  // LAST match, not first. A trailer is by definition at the FOOT of the
  // section, and the prose above it may legitimately contain the same shape —
  // release notes about this very mechanism quote `2841 → **2927 tests**` as an
  // example. Taking the first match rewrote that quoted example, left the real
  // trailer stale, and reported "corrected": a FALSE GREEN, and the exact
  // failure this function exists to prevent, committed inside it.
  //
  // `B82`'s shape once more — the fixture could not exhibit it, because a
  // hand-written fixture has one trailer and the real file has two. Caught by
  // running the tool against the real `CHANGELOG.md`, not by the suite.
  const matches = [...section.matchAll(new RegExp(CHANGELOG_TRAILER_RE.source, 'g'))];

  if (matches.length === 0) {
    return {
      next: source,
      note: `CHANGELOG trailer: none in this section — nothing to reconcile (optional; 19 of 33 past releases carry none)`,
    };
  }

  const m = matches[matches.length - 1];
  const wasBaseline = Number(m[1]);
  const wasCount = Number(m[3]);
  const next =
    source.slice(0, bounds.start) +
    section.slice(0, m.index) +
    `${m[1]}${m[2]}${testCount}${m[4]}` +
    section.slice(m.index + m[0].length) +
    source.slice(bounds.end);

  let note =
    wasCount === testCount
      ? `CHANGELOG trailer: already ${testCount} — unchanged`
      : `CHANGELOG trailer: ${wasCount} → ${testCount} (corrected from the gating run)`;

  if (matches.length > 1) {
    note +=
      `\n  note: ${matches.length} candidates in this section; used the last (the foot). ` +
      `Earlier ones read as prose examples and were left alone.`;
  }

  if (previousCount !== null && wasBaseline !== previousCount) {
    note +=
      `\n  ⚠ trailer baseline reads ${wasBaseline}; facts.md published ${previousCount} for the ` +
      `previous release. Left as written — check it is deliberate.`;
  }

  return { next, note };
}

/** references/facts.md — the published test count (`B56`, release reading). */
export function setFactsTestCount(source, count) {
  const out = source.replace(/(\*\*Test count:\*\*\s+)\d+/, `$1${count}`);
  if (out === source) throw new Error('facts.md "Test count" line not found');
  return out;
}

/**
 * references/facts.md — the "most recently **vX.Y.Z (date)**" attribution
 * beneath the figures (`B106`).
 *
 * `setFactsTestCount` updated the NUMBER and left the sentence naming the
 * release that produced it, so every cut published a fresh count attributed to
 * the PREVIOUS version. `M6.E2`'s `facts-attribution` check exists to catch
 * exactly that and fired on the v0.1.31 cut — the check worked; the tool that
 * created the condition did not fix it. Found by cutting a release, not by
 * reading this file.
 *
 * The attribution is a release-time fact for the same reason the count is: it
 * is only knowable at the cut, and nothing between cuts can re-derive it. So it
 * is set here, next to the figure it describes, rather than left to whoever
 * remembers — which is `UNREACHED-MECHANISM-ANALYSIS.md`'s class.
 *
 * The pattern is kept in step with `published-facts.js`'s `FACTS_REL`
 * (`/most recently\s+\**v?(\d+\.\d+\.\d+)/i`) — the check reads what this
 * writes, so a divergence here goes straight back to a red check.
 */
export function setFactsAttribution(source, version, date) {
  const out = source.replace(
    /(most recently\s+)\*{0,2}v?\d+\.\d+\.\d+\s*\([^)]*\)\*{0,2}/i,
    `$1**v${version} (${date})**`
  );
  if (out === source) throw new Error('facts.md "most recently vX.Y.Z (date)" attribution not found');
  return out;
}

/** The file set a release touches, in the order a reviewer reads them. */
export function releaseEdits({ version, date, title, testCount, read }) {
  // The count facts.md publishes BEFORE this edit is the previous release's
  // figure (`B56`'s release reading), which is what the trailer's baseline
  // should say. Read it here, before `setFactsTestCount` overwrites it.
  const previousCount = readFactsTestCount(read('plugin/references/facts.md'));
  const trailer = setChangelogTestCount(read('CHANGELOG.md'), testCount, previousCount);

  return [
    { file: 'plugin/.claude-plugin/plugin.json', next: bumpJsonVersion(read('plugin/.claude-plugin/plugin.json'), version) },
    { file: 'package.json', next: bumpJsonVersion(read('package.json'), version) },
    {
      file: 'CHANGELOG.md',
      // Trailer FIRST, fold second: the trailer edit is scoped by the
      // `[Unreleased]` heading, which the fold replaces. Reversing these makes
      // the pending section unfindable and the trailer silently unreconciled —
      // the bug this function exists to close, reintroduced by ordering.
      next: foldChangelog(trailer.next, version, date, title),
      note: trailer.note,
    },
    { file: 'docs/map/index.html', next: bumpMapStamp(read('docs/map/index.html'), version) },
    {
      file: 'plugin/references/facts.md',
      next: setFactsAttribution(
        setFactsTestCount(read('plugin/references/facts.md'), testCount),
        version,
        date
      ),
    },
  ];
}

// ---- I/O ----

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function currentVersion() {
  return JSON.parse(read('plugin/.claude-plugin/plugin.json')).version;
}

function assertCleanTree() {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  if (status.trim()) {
    throw new Error(
      'working tree is dirty. Commit or stash first — a release edit must be reviewable on its own:\n' +
        status.trimEnd(),
    );
  }
}

/**
 * Run the suite and return `{green, testCount}`.
 *
 * The release gate and the published count come from the SAME run. Deriving the
 * count any other way (counting `it(` in the source, say) undercounts, because
 * several suites generate cases in a loop — which is why `B56` stayed open.
 */
function runSuite() {
  const out = join(ROOT, 'node_modules/.cache/cut-release-vitest.json');
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  } catch {
    // Fall through — the report still gets written on failure, and it carries
    // the reason. A non-zero exit alone would lose the count.
  }
  const report = JSON.parse(readFileSync(out, 'utf8'));
  return { green: report.success === true, testCount: report.numTotalTests };
}

async function main(argv) {
  const { version, title, apply } = parseReleaseArgs(argv);

  if (!version || !SEMVER_RE.test(version)) {
    console.error('usage: node tools/cut-release.js <x.y.z> --title "..." [--apply]');
    process.exit(2);
  }
  if (!title) {
    console.error('--title is required: it becomes the CHANGELOG heading and the release name.');
    process.exit(2);
  }

  const from = currentVersion();
  if (from === version) {
    console.error(`plugin.json is already at ${version}.`);
    process.exit(2);
  }

  assertCleanTree();

  console.log(`Cutting ${from} → ${version}\n`);
  console.log('Running the suite (gates the release AND supplies the published count)…');
  const { green, testCount } = runSuite();
  if (!green) {
    console.error('\nSuite is RED. Not cutting a release.');
    process.exit(1);
  }
  console.log(`  green — ${testCount} tests\n`);

  // --- corpus pre-flight (2026-08-08) --------------------------------------
  // The suite runs against fixtures and Signal's own tree. BOTH are structurally
  // unrepresentative, and that is measured rather than suspected: `B82` could
  // not exist in this repo by construction (every unit here is a strict Epic ID,
  // so template and derivation agree) and was live in 8 of 12 real projects;
  // `M5.E16` found Signal's own `.planning/` shape is the MINORITY shape.
  //
  // So before shipping to ~23 projects at once, run the working tree's logic
  // against the messiest inputs available — the real corpus. This is a GATE on
  // defects, not on advisories: an advisory is work waiting in someone's repo
  // and cannot be fixed by a release.
  //
  // FAIL-OPEN, LOUDLY. A CI runner or a fresh clone has no sibling projects, and
  // refusing to release there would be absurd. But a skipped check must never
  // read as a passed one (`B39`, and the whole of `M5.E16`), so the absence is
  // announced in the same breath.
  try {
    const { scanCorpus } = await import('./cross-project-scan.js');
    const corpus = await scanCorpus();
    if (corpus.scanned === 0) {
      console.log('Corpus pre-flight: SKIPPED — no sibling projects found to scan.');
      console.log('  (Not a pass. This machine has nothing to test the release against.)\n');
    } else {
      console.log(`Corpus pre-flight: ran against ${corpus.scanned} real project(s)…`);
      if (corpus.blind.length > 0) {
        const ids = [...new Set(corpus.blind.map((b) => b.id))].join(', ');
        console.log(`  note: ${corpus.blind.length} check(s) could not be evaluated (${ids})`);
      }
      if (corpus.defects.length > 0) {
        console.error('\n  DEFECTS IN SIGNAL found in the corpus. Not cutting a release:\n');
        for (const d of corpus.defects) {
          console.error(`    ${d.projects.length}/${corpus.scanned}  ${d.id}`);
          console.error(`           ${d.projects.join(', ')}`);
        }
        console.error(
          '\n  These are regressions this working tree would ship to every project at once.\n' +
            '  Run `node tools/cross-project-scan.js` for the full report.\n'
        );
        process.exit(1);
      }
      console.log(`  clean — 0 defects (${corpus.advisories.length} project advisor${corpus.advisories.length === 1 ? 'y' : 'ies'}, not blocking)\n`);
    }
  } catch (err) {
    // A broken scanner must not block a release, but it must not be silent.
    console.log(`Corpus pre-flight: SKIPPED — the scan itself failed (${err.message}).`);
    console.log('  (Not a pass.)\n');
  }

  const date = new Date().toISOString().slice(0, 10);
  const edits = releaseEdits({ version, date, title, testCount, read });

  if (!apply) {
    console.log('DRY RUN — nothing written. Would change:\n');
    for (const e of edits) console.log(`  ${e.file}`);
    console.log(`\n  CHANGELOG heading: ## [${version}] — ${date} — ${title}`);
    console.log(`  facts.md test count: ${testCount}`);
    for (const e of edits) if (e.note) console.log(`  ${e.note}`);
    console.log('\nRe-run with --apply to write.');
    return;
  }

  for (const e of edits) writeFileSync(join(ROOT, e.file), e.next);
  console.log('Written (not committed, not tagged):\n');
  for (const e of edits) console.log(`  ${e.file}`);
  // Printed on the APPLY path too, not just the dry run: the whole point of
  // `B109` is that a figure nobody reconciled looks identical to one that was.
  for (const e of edits) if (e.note) console.log(`\n  ${e.note}`);
  console.log('\nNext:');
  console.log('  git checkout -b release/v' + version);
  console.log('  git add -A && git commit');
  console.log('  gh pr create --fill && gh pr merge --squash');
  console.log('  git tag -a v' + version + ' && git push origin v' + version);
  console.log('  gh release create v' + version);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    // AWAITED: main became async when the corpus pre-flight landed, and an
    // un-awaited call would leave this catch unable to see a rejection —
    // turning a failed release into a silent exit 0.
    await main(process.argv);
  } catch (err) {
    console.error('cut-release: ' + err.message);
    process.exit(1);
  }
}
