// M6.E17 S3 — wall-clock tests live in the perf run, and the next one lands there.
//
// Why (SIG-303, SIG-139, D-M6E17-4): three timing tests failed under load and
// heavy git tests timed out under local parallelism. Each false failure costs a
// re-run and teaches people to ignore failures. The two wall-clock tests at
// scale now run in `npm run test:perf`, one file at a time; this guard keeps a
// new budget from landing in `npm test` unnoticed.
//
// THE GRANDFATHER LIST is the debt register (CLAUDE.md § House rules): files
// that already paired a timer with an upper bound when the guard landed, each
// with the reason it stays in the main suite. It may shrink; it may not grow —
// a new budget goes in PERF_TESTS (vitest.config.js) instead.
//
// What it detects is deliberately crude: a file that reads a timer AND asserts
// `toBeLessThan`/`toBeLessThanOrEqual` anywhere. Two entries below are false
// matches, listed as such rather than special-cased in the detector.
//
// Proof-of-fail: fails before S3 — the perf configs and the CI step do not exist.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');

// Any `.now(` call (performance, an alias of it, Date), any hrtime, `new Date()`
// arithmetic, and perf_hooks; an upper bound is toBeLessThan or a `<` comparison
// asserted true. Widened at M6.E17 REVIEW (I9): the first form missed an aliased
// import, a bare hrtime, `new Date()` and `expect(t < n).toBe(true)`.
const TIMER_RE = /\.now\(|\bhrtime\b|new Date\(\)|perf_hooks/;
const TIMER_RE_G = new RegExp(TIMER_RE.source, 'g');
const BOUND_RE = /toBeLessThan|<=?\s*[\w.]+\s*\)\s*\.toBe\(true\)/;

/** Test files that pair a timer read with an upper bound and are neither perf files nor grandfathered. */
export function unlistedBudgets(files, { perf, grandfathered }) {
  const allowed = new Set([...perf, ...Object.keys(grandfathered)]);
  // A grandfathered file is allowed only up to its recorded timer count.
  const over = (f) => grandfathered[f.path] && (f.text.match(TIMER_RE_G) || []).length > grandfathered[f.path].timers;
  return files.filter((f) => TIMER_RE.test(f.text) && BOUND_RE.test(f.text) && (!allowed.has(f.path) || over(f))).map((f) => f.path);
}

// Recorded 2026-10-15, at the guard's landing. Each reason was read from the
// assertion in the file. `timers` is the file's count of timer reads, so a
// listed file cannot gain a second budget unseen. Shrink freely; never grow:
// the keys are checked against the list as committed at GRANDFATHER_PIN, so
// growing it takes more than an edit to this file (M6.E17 REVIEW I9). The
// `timers` counts are not pinned: raising one is an edit here, seen only in
// the diff.
const GRANDFATHERED = {
  'tests/add.test.js': { timers: 1, why: 'false match: Date.now builds a stale-lock fixture; the bounds compare string positions' },
  'tests/append-decision-mark-fresh.test.js': { timers: 2, why: 'false match: Date.now brackets a recorded timestamp; the bound is ordering, not time' },
  'tests/advise-live-measurement.test.js': { timers: 2, why: 'backtracking guard: a 30,000-character whitespace run parses in under 250 ms' },
  'tests/advise-review-fixes.test.js': { timers: 4, why: 'scale guard: 4,000 backlog rows format in under 500 ms; candidate to move to the perf run' },
  'tests/backlog-discharge.test.js': { timers: 2, why: 'backtracking guard: a 200,000-backtick heading parses in under 1 s' },
  'tests/hook-store-below.test.js': { timers: 2, why: 'a looping symlink is refused within 50 ms (the hook runs on every write)' },
  'tests/hook-work-write-guard-r61.test.js': { timers: 8, why: 'the write hook answers quickly on a 16,000-folder path and on hard links: 50-200 ms' },
  'tests/jev.test.js': { timers: 2, why: 'checks that a request timeout fires: 2 s bound on an aborted call' },
  'tests/milestone-table-marker-lines.test.js': { timers: 3, why: 'backtracking guard: 200,000-space lines parse in under 500 ms' },
  'tests/unit-text-slow-input.test.js': { timers: 7, why: 'slow-input guards: long space runs in unit cells, 0.5-2 s' },
  'tests/work-migrate-bugs-r1.test.js': { timers: 5, why: 'linear-time guard: 8,000 unclosed BUGS.md rows segment in under 2 s' },
  'tests/work-migrate-hostile.test.js': { timers: 3, why: 'linear-time guards on hostile list text (2 s each) and a growth ratio under 64' },
  'tests/work-migrate-lists-apply.test.js': { timers: 3, why: 'scale guard: a 400-row backlog dry-run migration in under 5 s; candidate to move to the perf run' },
  'tests/work-migrate-propose.test.js': { timers: 3, why: 'growth-ratio guard (under 64), not an absolute time' },
  'tests/work-migrate-r4.test.js': { timers: 3, why: 'growth-ratio guard (under 64), not an absolute time' },
  'tests/work-migrate-units-plan.test.js': { timers: 3, why: 'growth-ratio guard (under 64, best of several runs), not an absolute time' },
};
const GRANDFATHER_PIN = '9477ffa7';

function testFiles(rel) {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${rel}/${e.name}`;
    if (e.isDirectory() && e.name !== 'node_modules') out.push(...testFiles(p));
    else if (e.isFile() && e.name.endsWith('.test.js')) out.push({ path: p, text: readFileSync(join(ROOT, p), 'utf-8') });
  }
  return out;
}

describe('AC4.1 — the perf files run in their own serial run, not in npm test', () => {
  it('npm test excludes them; the perf config includes exactly them, one file at a time', async () => {
    const { default: main, PERF_TESTS } = await import('../vitest.config.js');
    const { default: perf } = await import('../vitest.perf.config.js');
    expect(PERF_TESTS).toEqual(['tests/unit-records-perf.test.js', 'tests/work-records-perf.test.js']);
    for (const f of PERF_TESTS) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
      expect(main.test.exclude).toContain(f);
    }
    expect(perf.test.include).toEqual(PERF_TESTS);
    expect(perf.test.fileParallelism).toBe(false);
  });

  it('the 10,000-record case left work-records.test.js', () => {
    expect(readFileSync(join(ROOT, 'tests/work-records.test.js'), 'utf-8')).not.toMatch(/10,000 records/);
    expect(readFileSync(join(ROOT, 'tests/work-records-perf.test.js'), 'utf-8')).toMatch(/10,000 records/);
  });

  it('npm run test:perf exists', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts['test:perf']).toBe('vitest run --config vitest.perf.config.js');
  });
});

describe('AC4.2 — CI runs the perf run as its own step', () => {
  // Read as YAML, not text: a commented-out step matched the text check (REVIEW I8).
  it('test.yml runs npm run test:perf after npm test, in the same job, unconditionally', () => {
    const wf = parseYaml(readFileSync(join(ROOT, '.github/workflows/test.yml'), 'utf-8'));
    const steps = wf.jobs.test.steps;
    const main = steps.findIndex((st) => st.run === 'npm test');
    const perf = steps.findIndex((st) => st.run === 'npm run test:perf');
    expect(main).toBeGreaterThan(-1);
    expect(perf).toBeGreaterThan(main);
    expect(steps[perf].if).toBeUndefined();
    expect(steps[perf]['continue-on-error']).toBeUndefined();
    expect(wf.jobs.test.if).toBeUndefined();
  });
});

describe('AC4.3 — local runs cap their workers; CI does not', () => {
  it('maxWorkers is capped when CI is unset', async () => {
    const src = readFileSync(join(ROOT, 'vitest.config.js'), 'utf-8');
    expect(src).toMatch(/maxWorkers: process\.env\.CI \? undefined : '50%'/);
  });
});

describe('AC4.4 — a new wall-clock budget outside the perf run fails', () => {
  const opts = { perf: ['tests/p.test.js'], grandfathered: { 'tests/old.test.js': 'why' } };

  it('flags a file with a timer read and an upper bound that is not listed', () => {
    const files = [
      { path: 'tests/new.test.js', text: 'const t = performance.now(); expect(performance.now() - t).toBeLessThan(100);' },
      { path: 'tests/hr.test.js', text: 'const t = process.hrtime.bigint(); expect(x).toBeLessThan(5);' },
    ];
    expect(unlistedBudgets(files, opts)).toEqual(['tests/new.test.js', 'tests/hr.test.js']);
  });

  // REVIEW I9: each of these got past the first detector.
  it('flags an aliased performance, a bare hrtime, new Date() arithmetic, and a `<` asserted true', () => {
    const files = [
      { path: 'tests/alias.test.js', text: "import { performance as perf } from 'node:perf_hooks'; const a = perf.now(); expect(perf.now() - a).toBeLessThan(100);" },
      { path: 'tests/bare-hr.test.js', text: "import { hrtime } from 'node:process'; const a = hrtime.bigint(); expect(hrtime.bigint() - a).toBeLessThan(10n);" },
      { path: 'tests/date.test.js', text: 'const a = new Date(); expect(new Date() - a).toBeLessThan(100);' },
      { path: 'tests/lt.test.js', text: 'const a = Date.now(); expect(Date.now() - a < 100).toBe(true);' },
    ];
    expect(unlistedBudgets(files, opts)).toEqual(files.map((f) => f.path));
  });

  it('flags a grandfathered file that gains a timer read beyond its recorded count', () => {
    const g = { grandfathered: { 'tests/old.test.js': { timers: 1, why: 'why' } }, perf: [] };
    expect(unlistedBudgets([{ path: 'tests/old.test.js', text: 'Date.now(); toBeLessThan(1)' }], g)).toEqual([]);
    expect(unlistedBudgets([{ path: 'tests/old.test.js', text: 'Date.now(); Date.now(); toBeLessThan(1)' }], g)).toEqual(['tests/old.test.js']);
  });

  it('passes a perf file, a grandfathered file, and a file with only one half', () => {
    const files = [
      { path: 'tests/p.test.js', text: 'performance.now(); toBeLessThan(1)' },
      { path: 'tests/old.test.js', text: 'Date.now(); toBeLessThan(1)' },
      { path: 'tests/timer-only.test.js', text: 'const at = Date.now();' },
      { path: 'tests/bound-only.test.js', text: 'expect(a).toBeLessThan(b);' },
    ];
    expect(unlistedBudgets(files, opts)).toEqual([]);
  });

  it('this repository has no unlisted budget', async () => {
    const { PERF_TESTS } = await import('../vitest.config.js');
    // This file's own fixtures contain timer reads; it is the detector, not a budget.
    const files = [...testFiles('tests'), ...testFiles('tools')].filter((f) => f.path !== 'tests/timing-budget-guard.test.js');
    expect(unlistedBudgets(files, { perf: PERF_TESTS, grandfathered: GRANDFATHERED })).toEqual([]);
  });

  it('the grandfather list may shrink, not grow — and every entry still matches', () => {
    const pinned = execFileSync('git', ['show', `${GRANDFATHER_PIN}:tests/timing-budget-guard.test.js`], { cwd: ROOT, encoding: 'utf-8' });
    const pinnedKeys = new Set([...pinned.matchAll(/^ {2}'(tests\/[^']+)':/gm)].map((m) => m[1]));
    expect(pinnedKeys.size).toBe(16);
    for (const path of Object.keys(GRANDFATHERED)) expect(pinnedKeys.has(path), `${path} was not on the list at ${GRANDFATHER_PIN}`).toBe(true);
    for (const [path, { why }] of Object.entries(GRANDFATHERED)) {
      expect(why.length, `${path} has a reason`).toBeGreaterThan(10);
      const full = join(ROOT, path);
      expect(existsSync(full), `${path} exists — remove it from the list if it was deleted`).toBe(true);
      const text = readFileSync(full, 'utf-8');
      expect(TIMER_RE.test(text) && BOUND_RE.test(text), `${path} still has a budget — remove it from the list if not`).toBe(true);
    }
  });
});
