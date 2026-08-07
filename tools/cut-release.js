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

export function foldChangelog(source, version, date, title) {
  const pending = source.match(UNRELEASED_HEADING_RE);
  const newestReleased = source.match(RELEASED_HEADING_RE);
  const isPending = pending && (!newestReleased || pending.index < newestReleased.index);

  if (!isPending) {
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
    source.slice(0, pending.index) +
    `## [${version}] — ${date} — ${title}` +
    source.slice(pending.index + pending[0].length)
  );
}

/** references/facts.md — the published test count (`B56`, release reading). */
export function setFactsTestCount(source, count) {
  const out = source.replace(/(\*\*Test count:\*\*\s+)\d+/, `$1${count}`);
  if (out === source) throw new Error('facts.md "Test count" line not found');
  return out;
}

/** The file set a release touches, in the order a reviewer reads them. */
export function releaseEdits({ version, date, title, testCount, read }) {
  return [
    { file: '.claude-plugin/plugin.json', next: bumpJsonVersion(read('.claude-plugin/plugin.json'), version) },
    { file: 'package.json', next: bumpJsonVersion(read('package.json'), version) },
    { file: 'CHANGELOG.md', next: foldChangelog(read('CHANGELOG.md'), version, date, title) },
    { file: 'docs/map/index.html', next: bumpMapStamp(read('docs/map/index.html'), version) },
    { file: 'references/facts.md', next: setFactsTestCount(read('references/facts.md'), testCount) },
  ];
}

// ---- I/O ----

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function currentVersion() {
  return JSON.parse(read('.claude-plugin/plugin.json')).version;
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

function main(argv) {
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

  const date = new Date().toISOString().slice(0, 10);
  const edits = releaseEdits({ version, date, title, testCount, read });

  if (!apply) {
    console.log('DRY RUN — nothing written. Would change:\n');
    for (const e of edits) console.log(`  ${e.file}`);
    console.log(`\n  CHANGELOG heading: ## [${version}] — ${date} — ${title}`);
    console.log(`  facts.md test count: ${testCount}`);
    console.log('\nRe-run with --apply to write.');
    return;
  }

  for (const e of edits) writeFileSync(join(ROOT, e.file), e.next);
  console.log('Written (not committed, not tagged):\n');
  for (const e of edits) console.log(`  ${e.file}`);
  console.log('\nNext:');
  console.log('  git checkout -b release/v' + version);
  console.log('  git add -A && git commit');
  console.log('  gh pr create --fill && gh pr merge --squash');
  console.log('  git tag -a v' + version + ' && git push origin v' + version);
  console.log('  gh release create v' + version);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv);
  } catch (err) {
    console.error('cut-release: ' + err.message);
    process.exit(1);
  }
}
