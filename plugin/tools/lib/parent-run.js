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
 * cleanup rather than turned into an outcome. SIGINT and SIGTERM run the same
 * cleanup before the process ends, which is why vitest is spawned async: a
 * synchronous spawn holds the event loop, and the handler never runs. SIGKILL
 * cannot be caught, so every run first sweeps the temp folders of runs whose
 * owner process is gone (M6.E17 REVIEW I3).
 *
 * A FAILURE IS PROOF ONLY WHEN IT IS NOT A MISSING FILE (REVIEW I2). Only the
 * named tests are copied, so a test that reads a fixture or lazily imports a
 * helper new in the same change fails on the base for that reason alone. A
 * file whose every failure is a missing file or module is could-not-run. The
 * per-file line names the first failure and every test that passed on the
 * base, so a hollow test beside a real one in the same file is visible.
 *
 * THE COPY STAYS INSIDE THE WORKTREE (REVIEW I1). A symlink on the base commit
 * along a test's path would send the copy, and a file that survives cleanup,
 * wherever it points. Such a file is could-not-run.
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

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { gitEnv } from './git-env.js';

const TEMP_PREFIX = 'sig-parent-run-';
const PER_FILE_TIMEOUT_MS = 300_000;
const OWNER_FILE = 'owner.pid';
const CHILD_FILE = 'child.pid';
const SIGNALS = ['SIGINT', 'SIGTERM'];

/** A failure message that says a file or module was absent, not that an assertion failed. */
const MISSING_RE = /ENOENT|Cannot find module|Cannot find package|Failed to (?:resolve|load) (?:import|url)|ERR_MODULE_NOT_FOUND/;

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
 * @param {string|null} [baseText] — the file as it is on the base, or null when it is new
 */
export function classifyReport(report, absFile, fallback, baseText = null) {
  if (!report || !Array.isArray(report.testResults)) {
    return { outcome: 'could-not-run', reason: fallback || 'vitest wrote no report' };
  }
  const entry = report.testResults.find((r) => typeof r?.name === 'string' && resolve(r.name) === absFile);
  if (!entry) return { outcome: 'could-not-run', reason: 'vitest reported no result for this file' };
  const assertions = Array.isArray(entry.assertionResults) ? entry.assertionResults : [];
  const name = (a) => a.fullName || a.title || '(unnamed)';
  const failing = assertions.filter((a) => a?.status === 'failed');
  if (failing.length > 0) {
    const firstLine = (a) => String((Array.isArray(a.failureMessages) && a.failureMessages[0]) || '').trim().split('\n')[0];
    const why = failing.map(firstLine);
    if (why.every((w) => MISSING_RE.test(w))) {
      return { outcome: 'could-not-run', reason: `failed on the base only on a missing file or module: ${why[0]}` };
    }
    return {
      outcome: 'failed',
      failed: failing.map(name),
      total: assertions.length,
      // Only tests new since the base: an old test passing there is expected.
      // A title absent from the base's copy of the file is new (a heuristic:
      // a renamed old test reads as new).
      passed: assertions
        .filter((a) => a?.status === 'passed' && !(baseText && baseText.includes(a.title)))
        .map(name),
      why: why.find((w) => !MISSING_RE.test(w)) || '',
    };
  }
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

/** Is the process `pid` still running? */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Remove the worktree registrations and temp folders of runs whose owner is gone (a SIGKILL). */
function sweepStale(root, tempRoot) {
  let names;
  try {
    names = readdirSync(tempRoot).filter((n) => n.startsWith(TEMP_PREFIX));
  } catch {
    return;
  }
  for (const n of names) {
    const temp = join(tempRoot, n);
    let pid;
    try {
      pid = Number(readFileSync(join(temp, OWNER_FILE), 'utf-8').trim());
    } catch {
      continue; // not ours to judge: no owner recorded
    }
    if (!Number.isInteger(pid) || pid <= 0 || alive(pid)) continue;
    // Its vitest outlives a SIGKILL and would write into the folder after it
    // is removed, so end that process group first.
    try {
      const child = Number(readFileSync(join(temp, CHILD_FILE), 'utf-8').trim());
      if (Number.isInteger(child) && child > 0) process.kill(-child, 'SIGKILL');
    } catch {
      // no child recorded, or it is already gone
    }
    try {
      git(root, ['worktree', 'remove', '--force', join(temp, 'wt')]);
    } catch {
      // registered in another repository, or already gone
    }
    rmSync(temp, { recursive: true, force: true });
  }
  try {
    git(root, ['worktree', 'prune']);
  } catch {
    // nothing more to do
  }
}

/** Run one vitest child; resolve with its status, or an error on timeout. Kills the child's group on `abort`. */
function runChild(args, opts, track, childFile) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { ...opts, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    if (child.pid) writeFileSync(childFile, String(child.pid));
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-4000);
    });
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    };
    track.kill = kill;
    const timer = setTimeout(() => {
      kill();
      done({ status: null, stderr, error: new Error(`timed out after ${PER_FILE_TIMEOUT_MS / 1000} s`) });
    }, PER_FILE_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      done({ status: null, stderr, error });
    });
    child.on('exit', (status) => {
      clearTimeout(timer);
      track.kill = null;
      done({ status, stderr, error: null });
    });
  });
}

/** Does the dependency lock differ between `sha` and the working tree? `null` when git cannot say. */
function dependenciesDiffer(baseDir, sha) {
  // The lock, not package.json: a new script is not a dependency change.
  const r = spawnSync('git', ['diff', '--quiet', sha, '--', 'package-lock.json'], {
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

  const tempRoot = realpathSync(tmpdir());
  sweepStale(root, tempRoot);
  const temp = mkdtempSync(join(tempRoot, TEMP_PREFIX));
  writeFileSync(join(temp, OWNER_FILE), String(process.pid));
  const wt = join(temp, 'wt');
  const link = join(wt, 'node_modules');
  let worktreeMade = false;
  const track = { kill: null };

  const cleanup = () => {
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
  };
  const onSignal = (signal) => {
    track.kill?.();
    cleanup();
    for (const sig of SIGNALS) process.removeListener(sig, onSignal);
    process.kill(process.pid, signal);
  };
  for (const sig of SIGNALS) process.once(sig, onSignal);

  try {
    try {
      git(root, ['worktree', 'add', '--detach', wt, sha]);
      worktreeMade = true;
    } catch (err) {
      for (const r of runnable) Object.assign(r, { outcome: 'could-not-run', reason: `the worktree was not created: ${errText(err)}` });
      return { base: sha, depsDiffer, results };
    }
    if (!existsSync(link)) symlinkSync(join(root, 'node_modules'), link, 'dir');
    const realWt = realpathSync(wt);
    for (const r of runnable) {
      const dest = join(wt, normalize(r.file));
      if (!insideWorktree(realWt, dest)) {
        Object.assign(r, { outcome: 'could-not-run', reason: `${r.file}: a symlink on the base commit leads outside the worktree; not copied` });
        continue;
      }
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, normalize(r.file)), dest);
    }
    hooks.onWorktree?.(wt);

    for (const [i, r] of runnable.entries()) {
      if (r.outcome !== null) continue;
      const out = join(temp, `report-${i}.json`);
      const rel = relative(wt, join(wt, normalize(r.file))).split(sep).join('/');
      const child = await runChild(
        [vitestEntry, 'run', rel, '--root', wt, '--reporter=json', `--outputFile=${out}`],
        { cwd: wt, env: childEnv() },
        track,
        join(temp, CHILD_FILE)
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
      let baseText = null;
      try {
        baseText = git(root, ['show', `${sha}:${r.file.split(sep).join('/')}`]);
      } catch {
        baseText = null; // the file is new since the base
      }
      Object.assign(r, classifyReport(report, join(wt, normalize(r.file)), fallback, baseText));
    }
    return { base: sha, depsDiffer, results };
  } finally {
    for (const sig of SIGNALS) process.removeListener(sig, onSignal);
    cleanup();
  }
}

/**
 * Does `dest` stay inside the worktree, with no symlink on the way? Checks the
 * deepest existing ancestor's real path, and refuses a destination that is
 * itself a link. Directories made after this are plain folders inside it.
 */
function insideWorktree(realWt, dest) {
  if (lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()) return false;
  let dir = dirname(dest);
  while (!existsSync(dir)) dir = dirname(dir);
  const real = realpathSync(dir);
  return real === realWt || real.startsWith(realWt + sep);
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
        ? `${r.failed.length} of ${r.total ?? r.failed.length} tests failed: ${r.failed.slice(0, 3).join('; ')}${r.failed.length > 3 ? `; and ${r.failed.length - 3} more` : ''}` +
          (r.why ? ` (${r.why})` : '') +
          (r.passed?.length ? `; new tests that passed on the base: ${r.passed.join('; ')}` : '')
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

// Compared as resolved file paths, not URLs: through a symlinked plugin folder
// or a path with a space the raw strings differ, main() never ran, and the
// tool exited 0 with no output, which is its "proof" answer (M6.E17 VERIFY D3).
const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    process.exitCode = await main(process.argv);
  } catch (err) {
    console.error(`parent-run: ${err.message}`);
    process.exitCode = 1;
  }
}
