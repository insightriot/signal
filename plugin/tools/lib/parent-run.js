/**
 * parent-run — prove that a new test fails on the base commit (M6.E17 S1,
 * `D-M6E17-3`, `SIG-325`).
 *
 * WHY. "This test fails without the fix" was a habit, done by hand in a
 * worktree when someone remembered. M6.E16 pass 2 shipped four hollow tests a
 * run on the base would have caught a day earlier; M6.E14's AC7.2 proved
 * nothing until it was run on the parent. This makes the run a command.
 *
 * WHAT IT DOES. Checks out `base` into a temporary worktree, copies the named
 * test files onto it FROM THE WORKING TREE (under strict TDD a new test is
 * absent on the base by definition), links the project's `node_modules`, and
 * runs the main checkout's vitest once per file with a JSON report. Each file
 * comes back as one of three outcomes:
 *
 *   failed         — at least one test in it failed on the base. The proof.
 *   passed         — every test in it passed on the base. No proof: the test
 *                    does not need the change (a hollow test).
 *   could-not-run  — git failed, the worktree was not made, the file is not
 *                    in the working tree, vitest reported nothing for it, or
 *                    it did not load (an import of a module the base lacks).
 *                    NEVER reported as proof: a test that cannot load proves
 *                    nothing about its assertions.
 *
 * WHY ONE RUN PER FILE, READ FROM JSON. vitest 3 exits 1 for a failed test, for
 * "no test files found" and for an import error alike, so the exit code cannot
 * separate proof from could-not-run. The JSON report can, per file.
 *
 * The worktree, the link and the temp dir are removed on every exit path,
 * thrown errors included (`finally`); an unexpected error is re-thrown after
 * cleanup rather than turned into an outcome.
 *
 * Command line (exit 0 only when every file failed on the base; 1 otherwise;
 * 2 for a usage error):
 *
 *   node parent-run.js (--base <commit> | --of <commit>) <test file>...
 *
 * `--of <commit>` means that commit's parent. The base is always stated: a
 * slice spans several commits and a fix round's base is the head at the pass
 * that found the issues, so "the parent" alone is ambiguous.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { gitEnv } from './git-env.js';

const TEMP_PREFIX = 'sig-parent-run-';
const PER_FILE_TIMEOUT_MS = 300_000;

/**
 * The summary line `formatParentRun` writes, which a REVIEW fix round or an
 * EXECUTE slice pastes as its record. Readers of those records match this
 * rather than re-deriving the grammar.
 */
export const PARENT_RUN_SUMMARY_RE =
  /^parent-run ([0-9a-f]{7,40}|\S+): (\d+) of (\d+) failed on the base(?:, (\d+) passed)?(?:, (\d+) could not run)?(?: \(dependencies differ from the base\))?$/;

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, env: gitEnv(cwd), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const errText = (err) => String(err?.stderr || err?.message || err).trim().split('\n')[0];

/** A test path the tool will copy: relative, inside the project, a file in the working tree. */
function checkTestPath(baseDir, file) {
  if (typeof file !== 'string' || file === '') return 'not a file path';
  if (isAbsolute(file)) return 'is absolute; name it relative to the project root';
  const norm = normalize(file);
  if (norm === '..' || norm.startsWith(`..${sep}`)) return 'is outside the project';
  const abs = join(baseDir, norm);
  if (!existsSync(abs) || !statSync(abs).isFile()) return 'is not a file in the working tree';
  return null;
}

/**
 * Classify one file from vitest's JSON report.
 *
 * @param {object|null} report — parsed `--reporter=json` output, or null when none was written
 * @param {string} absFile — the file's real path inside the worktree
 * @param {string} fallback — what to say when there is no report
 */
export function classifyReport(report, absFile, fallback) {
  if (!report || !Array.isArray(report.testResults)) {
    return { outcome: 'could-not-run', reason: fallback || 'vitest wrote no report' };
  }
  const entry = report.testResults.find((r) => typeof r?.name === 'string' && resolve(r.name) === absFile);
  if (!entry) return { outcome: 'could-not-run', reason: 'vitest reported no result for this file' };
  const assertions = Array.isArray(entry.assertionResults) ? entry.assertionResults : [];
  const failed = assertions.filter((a) => a?.status === 'failed').map((a) => a.fullName || a.title || '(unnamed)');
  if (failed.length > 0) return { outcome: 'failed', failed };
  const message = typeof entry.message === 'string' ? entry.message.trim() : '';
  if (message) return { outcome: 'could-not-run', reason: message.split('\n')[0] };
  if (!assertions.some((a) => a?.status === 'passed')) {
    return { outcome: 'could-not-run', reason: 'no test in this file ran' };
  }
  return { outcome: 'passed' };
}

/** The environment for the child vitest: never a worker of a vitest that may be running us. */
function childEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')));
}

/** Does the dependency lock differ between `sha` and the working tree? `null` when git cannot say. */
function dependenciesDiffer(baseDir, sha) {
  const r = spawnSync('git', ['diff', '--quiet', sha, '--', 'package-lock.json', 'package.json'], {
    cwd: baseDir,
    env: gitEnv(baseDir),
    stdio: 'ignore',
  });
  if (r.status === 0) return false;
  if (r.status === 1) return true;
  return null;
}

/**
 * Run `tests` against a worktree of `base`.
 *
 * @param {string} baseDir — the project root (the repository's top level)
 * @param {{base: string, tests: string[]}} spec
 * @param {{onWorktree?: (path: string) => void}} [hooks] — test seam, called once the worktree, link and copied tests exist
 * @returns {Promise<{base: string, depsDiffer: boolean|null, results: Array<{file: string,
 *   outcome: 'failed'|'passed'|'could-not-run', reason?: string, failed?: string[]}>}>}
 */
export async function runOnBase(baseDir, { base, tests }, hooks = {}) {
  const files = Array.isArray(tests) ? tests : [];
  const all = (reason) => ({
    base,
    depsDiffer: null,
    results: files.map((file) => ({ file, outcome: 'could-not-run', reason })),
  });

  if (typeof base !== 'string' || base === '' || base.startsWith('-')) {
    return all(`base ${JSON.stringify(base)} is not a commit name`);
  }

  let root;
  let sha;
  try {
    root = realpathSync(baseDir);
    const top = realpathSync(git(root, ['rev-parse', '--show-toplevel']));
    if (top !== root) return all(`run from the repository root (${top}), not ${root}`);
    sha = git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  } catch (err) {
    return all(`base ${JSON.stringify(base)} does not resolve to a commit: ${errText(err) || 'git failed'}`);
  }

  const results = files.map((file) => {
    const bad = checkTestPath(root, file);
    return bad ? { file, outcome: 'could-not-run', reason: `${file} ${bad}` } : { file, outcome: null };
  });
  const runnable = results.filter((r) => r.outcome === null);
  const depsDiffer = dependenciesDiffer(root, sha);
  if (runnable.length === 0) return { base: sha, depsDiffer, results };

  const vitestEntry = join(root, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitestEntry)) {
    for (const r of runnable) Object.assign(r, { outcome: 'could-not-run', reason: 'vitest is not installed in this project (node_modules/vitest)' });
    return { base: sha, depsDiffer, results };
  }

  const temp = mkdtempSync(join(realpathSync(tmpdir()), TEMP_PREFIX));
  const wt = join(temp, 'wt');
  const link = join(wt, 'node_modules');
  let worktreeMade = false;
  try {
    try {
      git(root, ['worktree', 'add', '--detach', wt, sha]);
      worktreeMade = true;
    } catch (err) {
      for (const r of runnable) Object.assign(r, { outcome: 'could-not-run', reason: `the worktree was not created: ${errText(err)}` });
      return { base: sha, depsDiffer, results };
    }
    if (!existsSync(link)) symlinkSync(join(root, 'node_modules'), link, 'dir');
    for (const r of runnable) {
      const dest = join(wt, normalize(r.file));
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, normalize(r.file)), dest);
    }
    hooks.onWorktree?.(wt);

    for (const [i, r] of runnable.entries()) {
      const out = join(temp, `report-${i}.json`);
      const rel = relative(wt, join(wt, normalize(r.file))).split(sep).join('/');
      const child = spawnSync(
        process.execPath,
        [vitestEntry, 'run', rel, '--root', wt, '--reporter=json', `--outputFile=${out}`],
        { cwd: wt, env: childEnv(), encoding: 'utf-8', timeout: PER_FILE_TIMEOUT_MS }
      );
      let report = null;
      try {
        report = JSON.parse(readFileSync(out, 'utf-8'));
      } catch {
        report = null;
      }
      const fallback = child.error
        ? `vitest did not finish: ${child.error.message}`
        : `vitest wrote no report (exit ${child.status}): ${String(child.stderr || '').trim().split('\n').slice(-1)[0] || 'no output'}`;
      Object.assign(r, classifyReport(report, join(wt, normalize(r.file)), fallback));
    }
    return { base: sha, depsDiffer, results };
  } finally {
    try {
      if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(link);
    } catch {
      // the worktree removal below takes the link with it
    }
    if (worktreeMade) {
      try {
        git(root, ['worktree', 'remove', '--force', wt]);
      } catch {
        // pruned below once the directory is gone
      }
    }
    rmSync(temp, { recursive: true, force: true });
    try {
      git(root, ['worktree', 'prune']);
    } catch {
      // nothing more to do; the directory is already gone
    }
  }
}

/**
 * One summary line, then one line per file.
 *
 * The summary line is what a REVIEW fix round or an EXECUTE slice pastes as its
 * `**Parent run:**` record, so its shape is stable:
 * `parent-run <sha7>: <n> of <m> failed on the base[, <k> passed][, <j> could not run]`.
 */
export function formatParentRun(result) {
  const count = (o) => result.results.filter((r) => r.outcome === o).length;
  const total = result.results.length;
  const short = String(result.base).slice(0, 7);
  let head = `parent-run ${short}: ${count('failed')} of ${total} failed on the base`;
  if (count('passed')) head += `, ${count('passed')} passed`;
  if (count('could-not-run')) head += `, ${count('could-not-run')} could not run`;
  if (result.depsDiffer === true) head += ' (dependencies differ from the base)';
  const lines = [head];
  for (const r of result.results) {
    const detail =
      r.outcome === 'failed'
        ? `${r.failed.length} failing: ${r.failed.slice(0, 3).join('; ')}${r.failed.length > 3 ? `; and ${r.failed.length - 3} more` : ''}`
        : r.outcome === 'passed'
          ? 'passes without the change — no proof'
          : r.reason;
    lines.push(`  ${r.outcome.padEnd(13)} ${r.file} — ${detail}`);
  }
  return lines.join('\n');
}

/** Exit 0 only when there was at least one file and every one failed on the base. */
export function exitCodeFor(result) {
  return result.results.length > 0 && result.results.every((r) => r.outcome === 'failed') ? 0 : 1;
}

const USAGE = 'usage: node parent-run.js (--base <commit> | --of <commit>) <test file>...';

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(2),
      options: { base: { type: 'string' }, of: { type: 'string' } },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if ((values.base === undefined) === (values.of === undefined) || positionals.length === 0) {
    console.error(`name exactly one of --base or --of, and at least one test file\n${USAGE}`);
    return 2;
  }
  const base = values.base ?? (values.of.startsWith('-') ? values.of : `${values.of}^`);
  const result = await runOnBase(process.cwd(), { base, tests: positionals });
  console.log(formatParentRun(result));
  return exitCodeFor(result);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = await main(process.argv);
  } catch (err) {
    console.error(`parent-run: ${err.message}`);
    process.exitCode = 1;
  }
}
