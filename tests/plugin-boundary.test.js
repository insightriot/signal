// M6.E1 S1 — the payload boundary detector (AC1.2, AC1.2a, AC2.1).
//
// The invariant this Epic hangs on:
//
//   NO FILE IN THE PAYLOAD MAY REACH OUTSIDE THE PAYLOAD ROOT.
//
// The docs are explicit that paths traversing outside the plugin root "will
// not work after installation because those external files are not copied to
// the cache." The failure is therefore INVISIBLE LOCALLY — the file exists in
// the repo, every test passes, and it breaks only on a user's machine.
//
// The detector runs against whichever layout is on disk: before S2 the payload
// dirs sit at the repo root; after S2 they sit under `plugin/`. Same assertions,
// both layouts, so this file is written once and re-run as the proof for S2.
//
// ── AC1.2a: WHAT THIS DETECTOR REACHES, AND WHAT IT DOES NOT ──────────────
//
// Stated because a detector that reports "no matches" without declaring its
// reach is B81 — an assertion that cannot distinguish "found everything" from
// "found one thing." Publishing the population is half the check.
//
// REACHES (mechanical, high confidence):
//   1. Static relative import/require specifiers in payload `.js` files.
//      Resolved against the importing file and compared to the payload root.
//   2. `${CLAUDE_PLUGIN_ROOT}/...` references containing a `..` segment,
//      in any payload file type.
//   3. Literal citations of known non-payload repo directories
//      (tests/ analysis/ docs/ examples/) and of `tools/*.js` maintainer
//      scripts, in `commands/**` and `agents/**`.
//
// DOES NOT REACH (declared, not discovered later):
//   a. COMPUTED paths — `join(dir, name)` where either part is a variable.
//      Static text cannot say where those land.
//   b. `dirname()`/`__dirname` ARITHMETIC DEPTH. `dirname(dirname(x))` is a
//      path escape or not depending on where x is; deciding needs evaluation,
//      not grep. This is exactly what plugin-root-geometry.test.js exists to
//      cover, by EXECUTING the modules at the post-move depth. The two files
//      are complements: this one reads text, that one runs code.
//   c. Paths inside prose that do not look like paths ("the analysis doc",
//      "the sandbox project").
//   d. Runtime-constructed paths from user input or config.
//   e. `.planning/...` is deliberately NOT treated as an escape: it names the
//      USER'S project directory, not anything in the plugin, and flagging it
//      would be a false positive on nearly every command file.
//
// FALSE POSITIVES IT KNOWINGLY PRODUCES (rule 3 only, and measured):
//   Of the 31 citations rule 3 matches today, roughly nine are not references
//   to this repository at all — they are ILLUSTRATIVE or GENERIC: a skill
//   telling a user to keep ADRs in `docs/decisions/`, a task-breakdown example
//   naming `tests/path/to/test.ts`, a scanner describing a `tests/` directory
//   in someone else's project. Rule 3 matches text shaped like a path and
//   cannot tell "a path in Signal's repo" from "a path in the user's repo" or
//   "a path in an example". That is why rule 3 is a RATCHET over a recorded
//   set rather than a prohibition: the check is "nothing new appeared",
//   which is sound under a false-positive rate, and not "every match is a
//   defect", which is not.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/** After S2 the payload lives under `plugin/`; before it, at the repo root. */
export const PAYLOAD_ROOT = existsSync(join(REPO, 'plugin', 'commands'))
  ? join(REPO, 'plugin')
  : REPO;

const PAYLOAD_DIRS = ['commands', 'agents', 'skills', 'references', 'hooks', join('tools', 'lib')];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const payloadFiles = PAYLOAD_DIRS.flatMap((d) => walk(join(PAYLOAD_ROOT, d)));
const payloadJs = payloadFiles.filter((f) => f.endsWith('.js'));

/**
 * True when `abs` is outside the PAYLOAD — i.e. not inside any payload
 * directory under the payload root.
 *
 * ⚠ THE OBVIOUS VERSION OF THIS FUNCTION IS A FALSE GREEN, and it was written
 * first. `relative(PAYLOAD_ROOT, abs).startsWith('..')` reads correctly and is
 * structurally incapable of firing before S2: today PAYLOAD_ROOT *is* the repo
 * root, so `../../tests/x.js` resolves to `<repo>/tests/x.js`, which is inside
 * it. A deliberately-escaping probe planted in `tools/lib/` passed clean.
 *
 * Caught by mutation-testing the detector, not by reading it — which is the
 * whole argument for AC1.2a. The check that guards this Epic's central
 * invariant would have reported "no escapes" for the entire pre-move period
 * and then been trusted after the move.
 *
 * The payload boundary is the SET OF PAYLOAD DIRECTORIES, not the root that
 * happens to contain them. Post-move the two coincide; pre-move they do not,
 * and the pre-move case is the one that has to work for this test to have any
 * value before S2 lands.
 */
function escapes(abs) {
  const rel = relative(PAYLOAD_ROOT, abs);
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) return true;
  return !PAYLOAD_DIRS.some((d) => rel === d || rel.startsWith(`${d}${sep}`));
}

// Static relative specifiers only — a bare specifier ('node:fs', 'yaml') is a
// module resolution, not a path, and cannot escape a directory.
const SPECIFIER_RE = /(?:from|import|require)\s*\(?\s*['"](\.[^'"]*)['"]/g;

describe('M6.E1 — the payload never reaches outside the payload root', () => {
  it('finds a non-empty population to govern (this check is not vacuous)', () => {
    // B81's first assertion, and its lesson: state the size, do not merely
    // assert non-emptiness. A population of 1 passes `toBeGreaterThan(0)`.
    expect(payloadFiles.length).toBeGreaterThan(100);
    expect(payloadJs.length).toBeGreaterThan(30);
  });

  it('no relative import in a payload .js file resolves outside the payload root', () => {
    const escapesFound = [];
    for (const file of payloadJs) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(SPECIFIER_RE)) {
        const target = resolve(dirname(file), m[1]);
        if (escapes(target)) {
          escapesFound.push(`${relative(REPO, file)} → ${m[1]}`);
        }
      }
    }
    expect(escapesFound, `payload imports escaping the payload root:\n${escapesFound.join('\n')}`)
      .toEqual([]);
  });

  it('no ${CLAUDE_PLUGIN_ROOT} reference climbs out with a `..` segment', () => {
    const bad = [];
    for (const file of payloadFiles) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}(\/[^\s"'`)]*)?/g)) {
        if ((m[1] ?? '').split('/').includes('..')) bad.push(`${relative(REPO, file)} → ${m[0]}`);
      }
    }
    expect(bad, `CLAUDE_PLUGIN_ROOT references escaping the plugin root:\n${bad.join('\n')}`)
      .toEqual([]);
  });
});

// ── AC2.1 — citations of things that will not ship ────────────────────────
//
// These do NOT break functionality: every one is a documentation pointer or a
// Signal-maintainer step, not a file a command must read to run. They break
// something quieter — a user following a command file to a path their install
// does not contain.
//
// The allowlist is a RATCHET, not an amnesty: the recorded set is what existed
// when the boundary was drawn, and a NEW citation fails this test. Each entry
// is dispositioned in S2.
// Grouped by what S2 has to DO with each, because "31 citations" is not
// actionable and three categories are.
const NON_PAYLOAD_CITATIONS = new Set([
  // (A) NOT references to this repo — illustrative or generic. Nothing to fix;
  //     they are here only so the ratchet has a complete baseline.
  'docs/',
  'docs/ADRs',
  'docs/decisions/',
  'docs/ideas/',
  'tests/',
  'tests/docs/security',
  'tests/review',
  'tests/path/to/test.ts',
  'tests/routes/auth.test.ts',

  // (B) Real citations in `references/**` — shipped docs pointing at tests and
  //     tools that will NOT ship. Dead links for a user; harmless to function.
  'tests/agent-reachability.test.js',
  'tests/anti-rationalization-forms.test.js',
  'tests/cross-file-consistency.test.js',
  'tests/fixtures/epic-native/linear/',
  'tests/hook-state-write.test.js',
  'tests/hook-warn-dirty-execute.test.js',
  'tests/private-name-guard.test.js',
  'tests/tier-precedence-consistency.test.js',
  'tools/cut-release.js',
  'docs/migration-state-schema-v0.1.x.md',
  'examples/Example-cmmc-STATE.md',
  'examples/sandbox/',
  'examples/sandbox/README.md',

  // (C) Real citations in `commands/**` + `agents/**` — the user-facing half.
  'analysis/UNREACHED-MECHANISM-ANALYSIS.md',
  'docs/api.md',
  'docs/install-troubleshooting.md',
  'docs/install-verification.md',
  'docs/map',
  'docs/map/index.html',
  'tests/doctor-script-gen.test.js',
  'tests/prescribed-cli.test.js',
  'tools/adherence-run.js', // AC2.2 — becomes a marked Signal-repository step
]);

describe('M6.E1 — citations of paths that will not exist in an install', () => {
  const cited = new Set();
  for (const file of payloadFiles.filter((f) => f.endsWith('.md'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:tests|analysis|docs|examples)\/[A-Za-z0-9_./-]*/g)) {
      cited.add(m[0].replace(/[.,)]+$/, ''));
    }
    for (const m of src.matchAll(/\btools\/[a-z-]+\.js/g)) cited.add(m[0]);
  }

  it('introduces no NEW citation of a non-shipped path', () => {
    const novel = [...cited].filter((c) => !NON_PAYLOAD_CITATIONS.has(c)).sort();
    expect(
      novel,
      `new citation(s) of paths that will not be in a user's install:\n${novel.join('\n')}\n` +
        `Either point at a URL, mark it a Signal-repository step, or add it to ` +
        `NON_PAYLOAD_CITATIONS with a reason.`
    ).toEqual([]);
  });

  it('ratchets in BOTH directions — a disposed citation must leave the list too', () => {
    // An exact-set match, not a subset check. A one-directional ratchet lets
    // the recorded set drift into describing a tree that no longer exists,
    // which is the stale-record class this repo keeps re-finding. If S2
    // disposes of an entry, removing it here is part of that work.
    const stale = [...NON_PAYLOAD_CITATIONS].filter((c) => !cited.has(c)).sort();
    expect(
      stale,
      `NON_PAYLOAD_CITATIONS names path(s) no payload file cites any more — ` +
        `delete them from the set:\n${stale.join('\n')}`
    ).toEqual([]);
  });

  it('governs a population whose size is stated, not implied', () => {
    // B81's lesson stated numerically: 31 today. If this number moves, the
    // move should be visible in a diff rather than absorbed silently.
    expect(cited.size).toBe(31);
  });
});
