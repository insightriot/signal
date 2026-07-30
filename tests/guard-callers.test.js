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
  for (const abs of readdirSync(join(ROOT, 'commands')).map((f) => join(ROOT, 'commands', f))) {
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
    const self = readFileSync(join(__dirname, 'guard-callers.test.js'), 'utf-8');
    expect(self).toContain('SCOPE LIMIT');
    expect(self).toContain('2 of the 4 known instances');
    expect(self).toMatch(/B39/);
    expect(self).toMatch(/B46/);
    expect(self).toContain('NOT a check for the');
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
