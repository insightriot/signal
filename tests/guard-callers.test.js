// tests/guard-callers.test.js — M5.E13 S3.t3 (FR2.3), the `I2` mechanism.
//
// ─── SCOPE LIMIT, STATED UP FRONT (AC2.4) ──────────────────────────────────
//
// This file checks ONE shape of one defect class. The class is:
//
//     a guard was written, shipped, and never called.
//
// It has FOUR known instances. This test covers the CODE-SHAPED ones only:
//
//   ✅ I2   — `adherence-ceiling.js --check`, a CLI guard nothing invoked
//   ✅ B54  — `checkGateArtifacts`, an exported function nothing called
//
//   ❌ B39  — a trigger watchlist that a DOCUMENT instructs someone to walk,
//             which no command implements. Not code. Invisible here.
//   ❌ B46  — 45 dispositions written to a side artifact that nothing reads
//             back. Data, not code. Invisible here.
//
// So this covers **2 of the 4 known instances**. It is NOT a check for the
// class, and a reader must not mistake it for one. Covering the
// document-shaped instances needs a declared registry of obligations — new
// schema, new authoring, overlapping the tracker Epic — and M5.E13
// deliberately did not attempt it (D-M5E13-3: fix the instances, build the
// narrow mechanism, label the gap).
//
// ─── TWO POPULATIONS, NOT ONE (M5.E15 S6, `B81`) ───────────────────────────
//
// Guards reach this file by two different routes, and conflating them would
// misread the coverage above:
//
//   1. AUTO-DISCOVERED — `findCliGuards` scans for three argv idioms and checks
//      each hit has a caller. Growth is free: a new guard matching an idiom is
//      governed the day it is written.
//   2. GOVERNED BY NAME — a bespoke assertion per guard. Growth is manual: a
//      guard nobody writes an assertion for is not covered, and nothing says so.
//
// `checkLeak` (M5.E15) is in the SECOND group, deliberately. `D-M5E15-5` planned
// to register it in the first, and that does not land: `adherence-run.js`
// contributes ZERO of its twelve flags to the auto-discovered population, so
// registering there would have appeared to work while checking nothing — an
// uncalled guard-caller check, which is the very defect this file exists to
// catch. Widening the regex was rejected too; the ten orphans it surfaces are
// mostly options, not guards. Filed as `B81`.
//
// The consequence a reader must carry: the auto-discovered count is NOT the
// coverage count. Named guards have to be counted by reading the assertions.
//
// ─── ON WHAT COUNTS AS A "CALLER" ──────────────────────────────────────────
//
// A test counts. That was an open question at PLAN (R5) — the sole caller of
// `--check` is `tests/adherence-ceiling.test.js`, and this repo has no CI, so
// a test is Signal's only execution surface. It was ANSWERED EMPIRICALLY
// during M5.E13 EXECUTE: S4.t1 added a line to `commands/ship.md`, moving the
// corpus 407 → 408 directive lines, and the test-invoked `--check` caught the
// resulting stale ceiling immediately. A guard whose only caller is a test
// still fired on a real drift a human reviewer would have missed.
//
// The class is "never RUN", not "never run by a command". A test that runs on
// every `npm test` runs.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Every `.js` under a directory, recursively, skipping node_modules. */
function jsFilesUnder(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Find CLI guards in `tools/` — scripts that branch on a `--flag` read from
 * argv. These are the code-shaped guards this test governs.
 *
 * @returns {Array<{file: string, flag: string}>}
 */
function findCliGuards() {
  const guards = [];
  for (const abs of jsFilesUnder(join(ROOT, 'tools'))) {
    const src = readFileSync(abs, 'utf-8');
    for (const m of src.matchAll(/argv\.includes\(\s*['"](--[a-z][a-z0-9-]*)['"]\s*\)/g)) {
      guards.push({ file: relative(ROOT, abs), flag: m[1] });
    }
  }
  return guards;
}

/** Does anything outside `guardFile` invoke `guardFile` with `flag`? */
function hasCaller(guardFile, flag) {
  const base = guardFile.split('/').pop();
  const searchRoots = ['tests', 'tools', 'commands', 'hooks', 'scripts', '.github'];
  const files = [];
  for (const r of searchRoots) {
    const p = join(ROOT, r);
    try {
      if (statSync(p).isDirectory()) files.push(...jsFilesUnder(p));
    } catch {
      /* absent root — fine */
    }
  }
  // Non-JS invocation surfaces that can also carry the call.
  for (const extra of ['package.json']) {
    try {
      statSync(join(ROOT, extra));
      files.push(join(ROOT, extra));
    } catch {
      /* absent */
    }
  }
  // Markdown command files can document the invocation as the caller of record.
  for (const abs of readdirSync(join(ROOT, 'plugin', 'commands')).map((f) => join(ROOT, 'plugin', 'commands', f))) {
    if (abs.endsWith('.md')) files.push(abs);
  }

  for (const abs of files) {
    if (relative(ROOT, abs) === guardFile) continue; // the guard cannot call itself
    // Nor can THIS file: it names every guard and flag it inspects, so counting
    // itself as a caller would make the check pass vacuously for anything it
    // mentions — a checker that satisfies itself is the failure it looks for.
    if (relative(ROOT, abs) === 'tests/guard-callers.test.js') continue;
    let src;
    try {
      src = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    // The invocation must name BOTH the script and the flag — naming the
    // script alone is how `I2` looked "referenced" while never being run
    // with its guard flag.
    if (src.includes(base) && src.includes(flag)) return relative(ROOT, abs);
  }
  return null;
}

/**
 * Read ONLY the header comment block — everything above the first import.
 *
 * WHY THIS EXISTS (`B83`, found at M5.E15 VERIFY). These assertions used to read
 * the whole file, and every string they pinned also appears inside the assertion
 * that pins it. So `expect(self).toContain('SCOPE LIMIT')` was matched by its own
 * source line. Proven by deleting the ENTIRE header — all five pinned strings —
 * and watching the test stay green.
 *
 * That is precisely the failure this file was written to catch, and it says so
 * forty lines up, about `hasCaller`: "a checker that satisfies itself is the
 * failure it looks for." The scope-limit label M5.E13 shipped to stop the
 * mechanism over-claiming its coverage was itself unguarded for three releases.
 *
 * Scoping to the header makes the assertions real: the strings must appear where
 * a reader actually encounters them, not merely somewhere in the file.
 */
function headerBlock() {
  const self = readFileSync(join(__dirname, 'guard-callers.test.js'), 'utf-8');
  return self.slice(0, self.indexOf('import {'));
}

describe('M5.E13 S3.t3 — code-shaped guards have a caller (FR2.3; covers 2 of the class\'s 4 instances)', () => {
  it('finds at least one CLI guard to govern (the population is not empty)', () => {
    const guards = findCliGuards();
    expect(guards.length).toBeGreaterThan(0);
  });

  it('AC2.3 — every `--flag` guard in tools/ is invoked by something other than itself', () => {
    const orphans = [];
    for (const { file, flag } of findCliGuards()) {
      if (!hasCaller(file, flag)) orphans.push(`${file} ${flag}`);
    }
    expect(orphans, `Guard(s) with no caller — this is I2's shape: ${orphans.join(', ')}`).toEqual([]);
  });

  it('AC2.3 — the check is real: a guard with a fabricated flag has no caller and would be flagged', () => {
    // Proves the assertion above discriminates rather than passing vacuously.
    // Deleting the sole caller of a real guard is the same condition as asking
    // about a flag no caller mentions.
    expect(hasCaller('tools/adherence-ceiling.js', '--no-such-flag-exists')).toBeNull();
    expect(hasCaller('tools/adherence-ceiling.js', '--check')).not.toBeNull();
  });

  it('AC2.4 — this file states its own scope limit, in its own text', () => {
    // A mechanism that over-claims its coverage is the defect D-M5E13-3 was
    // written to correct. The label has to live where a reader will hit it.
    const header = headerBlock();
    expect(header).toContain('SCOPE LIMIT');
    expect(header).toContain('2 of the 4 known instances');
    expect(header).toMatch(/B39/);
    expect(header).toMatch(/B46/);
    expect(header).toContain('NOT a check for the');
  });

  it('AC2.4 — the scope-limit assertion is not vacuous (`B83`)', () => {
    // Guards the guard: if someone widens the read back to the whole file, the
    // strings become self-satisfying again and this goes red.
    const self = readFileSync(join(__dirname, 'guard-callers.test.js'), 'utf-8');
    const header = headerBlock();
    expect(header.length, 'header block did not parse').toBeGreaterThan(500);
    expect(header.length, 'headerBlock() is reading the test bodies too').toBeLessThan(self.length);
    expect(header).not.toContain('expect(header)');
  });

  /**
   * M5.E15 S6 (FR5, AC5.1) — the leak check has a caller, asserted BY NAME.
   *
   * `D-M5E15-5` planned to register this with `findCliGuards`, the auto-discovered
   * population above. It does not land as written, and the reason is worth keeping:
   * `findCliGuards` detects three argv idioms, and `adherence-run.js` contributes
   * ZERO of its twelve flags to that population. Registering there would have
   * *appeared* to work while checking nothing — a guard-caller check that is
   * itself an uncalled guard. Filed as `B81`.
   *
   * So this is a bespoke named assertion, the shape `B54` already established in
   * this file. It is deliberately NOT a widening of the regex: the ten orphans
   * that would surface are mostly options, not guards.
   *
   * What it protects: `checkLeak` is the entire reason a verdict from this harness
   * can be trusted after `B55`. An exported function nothing calls is precisely
   * the defect class this file exists for, and the leak check is the highest-cost
   * possible instance — the run would still complete, still print a verdict, and
   * still append a record, with nothing having been checked.
   */
  it('AC5.1 — `checkLeak` is invoked by something other than its own test', () => {
    const callers = jsFilesUnder(join(ROOT, 'tools')).filter((abs) =>
      readFileSync(abs, 'utf-8').includes('checkLeak(')
    );
    const nonSelf = callers
      .map((p) => relative(ROOT, p))
      .filter((p) => p !== 'tools/lib/adherence-leak.js');

    expect(
      nonSelf,
      'checkLeak is defined but nothing in tools/ calls it — the control arm is unverified'
    ).not.toEqual([]);
    expect(nonSelf).toContain('tools/adherence-run.js');
  });

  it('AC5.1 — the refusal path is wired, not just the check', () => {
    // Calling checkLeak and ignoring its result is the same defect one level in.
    const runner = readFileSync(join(ROOT, 'tools/adherence-run.js'), 'utf-8');
    expect(runner).toMatch(/formatLeakRefusal/);
    expect(runner).toMatch(/if\s*\(!leak\.ok\)\s*throw/);
  });

  it('AC5.2 — the header records that this guard is governed by NAME, and why', () => {
    // The pinned-strings test above proves the OLD header survived. It cannot
    // prove the new note landed — a header edit that dropped it would leave every
    // existing assertion green while the reader lost the one fact that stops them
    // reading the auto-discovered count as the coverage count.
    const header = headerBlock();
    expect(header).toContain('TWO POPULATIONS');
    expect(header).toMatch(/B81/);
    expect(header).toMatch(/auto-discovered count is NOT the\s*\/\/\s*coverage count/i);
  });

  it('AC5.2 — the note sits BELOW the four-instance list, not inside it', () => {
    // It was first committed between `✅ B54` and `❌ B39`, splitting the
    // enumeration the paragraph beneath then summarises as "2 of the 4". A
    // reader hitting a 20-line digression mid-list loses the count.
    const header = headerBlock();
    expect(header.indexOf('❌ B46')).toBeLessThan(header.indexOf('TWO POPULATIONS'));
    expect(header.indexOf('2 of the 4 known instances')).toBeLessThan(header.indexOf('TWO POPULATIONS'));
  });

  it('B54 stays fixed: `checkGateArtifacts` is gone from tools/ (the other code-shaped instance)', () => {
    // Historical records (STATE-HISTORY.md, archive/) legitimately still name
    // it — they record what was true then. Live code must not.
    const live = jsFilesUnder(join(ROOT, 'tools')).filter((abs) =>
      readFileSync(abs, 'utf-8').includes('checkGateArtifacts')
    );
    expect(live.map((p) => relative(ROOT, p))).toEqual([]);
  });
});
