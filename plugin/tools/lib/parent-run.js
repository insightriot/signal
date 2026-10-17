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
 * THE SWEEP TRUSTS ONLY WHAT THIS TOOL MADE (REVIEW pass 2, P2-I1). Runs live in
 * one private folder per user (mode 0700, checked: not a link, owned by this
 * user), not loose in the shared temp folder, where anyone could plant a run.
 * The owner is recorded with its start time, so a reused pid is not "alive".
 * A worktree is force-removed only when it is a real folder (not a link) that
 * git lists for this project, and a child is killed only when it is still the
 * node process recorded. The proof itself is an integrity check over the
 * project's own files, not a security boundary: base code runs with your rights.
 *
 * A FAILURE IS PROOF ONLY WHEN IT IS NOT A MISSING FILE (REVIEW I2). Only the
 * named tests are copied, so a test that reads a fixture or lazily imports a
 * helper new in the same change fails on the base for that reason alone. A
 * file whose every failure is a missing module, or a missing file that is in
 * the project but was not copied, is could-not-run. Any other missing-file
 * error is what the code under test did, so it counts (REVIEW pass 2, P2-I8).
 *
 * A HOLLOW TEST BESIDE A REAL ONE IS NOT PROOF (P2-I2). A new test that passed
 * on the base, in a file that failed there, is counted in the summary line
 * ("k new tests passed on the base"), the line a round keeps as its record,
 * and the run exits 1. "New" means the base's copy does not define that title:
 * a quoted title must match exactly, and a template title matches with its
 * placeholders standing for any text. So a new hollow test whose title fits an
 * old template (`${x} in ${y}` and "stays in place") still reads as old.
 *
 * THE COPY STAYS INSIDE THE WORKTREE (REVIEW I1). A symlink on the base commit
 * along a test's path would send the copy, and a file that survives cleanup,
 * wherever it points. Such a file is could-not-run.
 *
 * Command line (exit 0 only when every file failed on the base and no new test
 * passed there; 1 otherwise;
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
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
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

const RUN_PREFIX = 'run-';
const PER_FILE_TIMEOUT_MS = 300_000;
const OWNER_FILE = 'owner.pid';
const CHILD_FILE = 'child.pid';
const SIGNALS = ['SIGINT', 'SIGTERM'];

/**
 * A failure that says a module was absent, not that an assertion failed.
 * Anchored at the error's start: an assertion that merely mentions one of
 * these words is a real failure (REVIEW pass 2, P2-I8).
 */
const MISSING_MODULE_RE = /^(?:\w*Error: )?(?:Cannot find (?:module|package)|Failed to (?:resolve|load) (?:import|url)|.*\bERR_MODULE_NOT_FOUND\b)/;
/** A missing-file error, with the path it names. */
const ENOENT_RE = /^(?:\w*Error: )?ENOENT\b[^']*'([^']+)'/;

/**
 * The summary line `formatParentRun` writes, which a REVIEW fix round or an
 * EXECUTE slice pastes as its record. Readers of those records match this
 * rather than re-deriving the grammar.
 */
export const PARENT_RUN_SUMMARY_RE =
  /^parent-run ([0-9a-f]{7,40}|\S+): (\d+) of (\d+) failed on the base(?:, (\d+) passed)?(?:, (\d+) could not run)?(?:, (\d+) new tests? passed on the base)?(?: \(dependencies differ from the base\))?$/;

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
export function classifyReport(report, absFile, fallback, baseText = null, { worktrees = [], project = null, baseNames = null } = {}) {
  if (!report || !Array.isArray(report.testResults)) {
    return { outcome: 'could-not-run', reason: fallback || 'vitest wrote no report' };
  }
  const entry = report.testResults.find((r) => typeof r?.name === 'string' && resolve(r.name) === absFile);
  if (!entry) return { outcome: 'could-not-run', reason: 'vitest reported no result for this file' };
  const assertions = Array.isArray(entry.assertionResults) ? entry.assertionResults : [];
  // A test is old when the base's copy of the file has it. vitest's own list of the
  // base file names it exactly, describe blocks and all (P3-I6); without that list,
  // the titles the base's source spells out.
  const isBaseTitle = baseTitles(baseText);
  const isOld = baseNames
    ? (a) => baseNames.has([...(Array.isArray(a.ancestorTitles) ? a.ancestorTitles : []), a.title].join(' > '))
    : (a) => isBaseTitle(a.title);
  const name = (a) => a.fullName || a.title || '(unnamed)';
  const failing = assertions.filter((a) => a?.status === 'failed');
  if (failing.length > 0) {
    const firstLine = (a) => String((Array.isArray(a.failureMessages) && a.failureMessages[0]) || '').trim().split('\n')[0];
    const why = failing.map(firstLine);
    // A missing file counts as "not copied" only when it is a path in the worktree
    // that exists in the project: a fixture new in the change. Any other ENOENT is
    // what the code under test did, which is the failure being proved (P2-I8).
    // vitest runs in the worktree, so a relative path is a path in it (P3-I1).
    const notCopied = (w) => {
      const path = ENOENT_RE.exec(w)?.[1];
      if (!path || !project) return false;
      const wt = isAbsolute(path) ? worktrees.find((t) => path.startsWith(t + sep)) : null;
      const rel = isAbsolute(path) ? (wt ? path.slice(wt.length + 1) : null) : normalize(path);
      if (rel === null || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return false;
      return existsSync(join(project, rel));
    };
    const missing = (w) => MISSING_MODULE_RE.test(w) || notCopied(w);
    if (why.every(missing)) {
      return { outcome: 'could-not-run', reason: `failed on the base only on a missing file or module: ${why[0]}` };
    }
    return {
      outcome: 'failed',
      failed: failing.map(name),
      total: assertions.length,
      // Only tests new since the base: an old test passing there is expected.
      // A renamed old test reads as new, which is the safe direction. Without
      // vitest's list (the base file did not collect), a template title in the
      // base's source can still hide a new test that fits it (P2-I2).
      passed: assertions
        .filter((a) => a?.status === 'passed' && !isOld(a))
        .map(name),
      why: why.find((w) => !missing(w)) || '',
    };
  }
  const message = typeof entry.message === 'string' ? entry.message.trim() : '';
  if (message) return { outcome: 'could-not-run', reason: message.split('\n')[0] };
  if (!assertions.some((a) => a?.status === 'passed')) {
    return { outcome: 'could-not-run', reason: 'no test in this file ran' };
  }
  return { outcome: 'passed' };
}

/**
 * The test titles a base file defines, as a predicate. A quoted title must
 * match exactly; a template title matches with each `${…}` (or `%s`-style
 * placeholder) standing for any text, provided it has literal text too.
 */
export function baseTitles(baseText) {
  if (typeof baseText !== 'string') return () => false;
  const exact = new Set();
  const patterns = [];
  const CALL_RE = /\b(?:it|test)(?:\.\w+)*(?:\([^)]*\))?\(\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
  for (const [, quote, raw] of baseText.matchAll(CALL_RE)) {
    const text = raw.replace(/\\([\s\S])/g, '$1');
    const parts = (quote === '`' ? raw.split(/\$\{[^}]*\}/) : [raw]).flatMap((p) => p.split(/%[sdifjo#%]/));
    if (parts.length === 1) {
      exact.add(text);
    } else if (parts.join('').trim() !== '') {
      const esc = (p) => p.replace(/\\([\s\S])/g, '$1').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push(new RegExp(`^${parts.map(esc).join('.*')}$`));
    }
  }
  return (title) => exact.has(title) || patterns.some((re) => re.test(title));
}

/** The environment for the child vitest: never a worker of a vitest that may be running us. */
function childEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')));
}

/**
 * `ps` in one locale and time zone, so a start time recorded by one run reads the
 * same in another run started from a different shell (P3-I2).
 */
const psEnv = () => ({ ...process.env, LC_ALL: 'C', TZ: 'UTC' });

/** When `pid` started, as `ps` prints it; '' when there is no such process, or no `ps`. */
function startedAt(pid) {
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf-8', env: psEnv() });
  return r.status === 0 && typeof r.stdout === 'string' ? r.stdout.trim() : '';
}

/** Is there a process with this pid at all? EPERM means there is, and not ours. */
function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Is a run's owner, recorded as "<pid> <start time>", still running? When a start
 * time cannot be read (no `ps`, or none recorded), only the pid can be checked,
 * and a live pid keeps the run: cannot tell is not dead (P3-I2). The cost is a
 * folder kept after a killed run whose pid was reused, never a live run deleted.
 */
function ownerAlive(pid, recorded) {
  const at = startedAt(pid);
  const recordedAt = recorded.slice(String(pid).length).trim();
  if (at === '' || recordedAt === '') return pidExists(pid);
  return recorded === `${pid} ${at}`;
}

/**
 * Is `pid` still the process recorded as `recorded` ("<pid> <start time>")?
 * A pid and its start time together name one process; a reused pid has a later
 * start. (vitest retitles itself "node (vitest)", so its command line cannot say.)
 */
function isSameProcess(pid, recorded) {
  const at = startedAt(pid);
  return at !== '' && recorded === `${pid} ${at}`;
}

/** Is `pid` a node process? vitest retitles itself, but its command name stays node. */
function isNode(pid) {
  const r = spawnSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf-8', env: psEnv() });
  return r.status === 0 && /(^|\/)node(\.exe)?$/.test(String(r.stdout).trim());
}

/**
 * This user's private folder for runs, made if absent. Returns null when the
 * path is a link, not a folder, or not this user's: then nothing in it is trusted.
 */
function runsFolder() {
  const uid = process.getuid?.();
  const path = join(realpathSync(tmpdir()), `sig-parent-runs-${uid ?? 'user'}`);
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (err) {
    if (err.code !== 'EEXIST') return null;
  }
  const st = lstatSync(path);
  if (!st.isDirectory() || st.isSymbolicLink() || (uid !== undefined && st.uid !== uid)) return null;
  if ((st.mode & 0o077) !== 0) chmodSync(path, 0o700);
  return path;
}

/** Remove the worktree registrations and temp folders of runs whose owner is gone (a SIGKILL). */
function sweepStale(root, runs) {
  let names;
  try {
    names = readdirSync(runs).filter((n) => n.startsWith(RUN_PREFIX));
  } catch {
    return;
  }
  let listed = [];
  try {
    listed = git(root, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
  } catch {
    // nothing is listed, so no worktree is force-removed
  }
  for (const n of names) {
    const temp = join(runs, n);
    if (!lstatSync(temp, { throwIfNoEntry: false })?.isDirectory()) continue;
    let owner;
    try {
      owner = readFileSync(join(temp, OWNER_FILE), 'utf-8').trim();
    } catch {
      continue; // not ours to judge: no owner recorded
    }
    const pid = Number(owner.split(' ')[0]);
    if (!Number.isInteger(pid) || pid <= 0 || ownerAlive(pid, owner)) continue;
    // Its vitest outlives a SIGKILL and would write into the folder after it
    // is removed, so end that process group first.
    // Only if that pid is still the vitest this folder started: a pid left for
    // days may have been reused by an unrelated process.
    try {
      const recorded = readFileSync(join(temp, CHILD_FILE), 'utf-8').trim();
      const child = Number(recorded.split(' ')[0]);
      if (Number.isInteger(child) && child > 0 && isSameProcess(child, recorded) && isNode(child)) {
        process.kill(-child, 'SIGKILL');
        // A process killed mid-write can still finish creating a file, which
        // brings the folder back after the remove below: wait for the group to go.
        const until = Date.now() + 2000;
        while (pidExists(-child) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    } catch {
      // no child recorded, or it is already gone
    }
    const wt = join(temp, 'wt');
    if (lstatSync(wt, { throwIfNoEntry: false })?.isDirectory() && listed.includes(realpathSync(wt))) {
      try {
        git(root, ['worktree', 'remove', '--force', wt]);
      } catch {
        // already gone
      }
    }
    try {
      rmSync(temp, { recursive: true, force: true }); // removes a link, never what it points at
    } catch {
      // another run is sweeping it too; what is left is swept next time
    }
  }
  try {
    git(root, ['worktree', 'prune']);
  } catch {
    // nothing more to do
  }
}

/** Run one vitest child; resolve with its status, or an error on timeout. Kills the child's group on `abort`. */
function runChild(args, opts, track, childFile, stderrFile) {
  return new Promise((done) => {
    // stderr goes to a file, not a pipe: a pipe closes when this process is
    // killed, and the orphaned vitest then exits on its own, racing the sweep.
    const fd = openSync(stderrFile, 'w');
    const child = spawn(process.execPath, args, { ...opts, detached: true, stdio: ['ignore', 'ignore', fd] });
    closeSync(fd);
    if (child.pid) writeFileSync(childFile, `${child.pid} ${startedAt(child.pid)}`);
    const tail = () => {
      try {
        return readFileSync(stderrFile, 'utf-8').slice(-4000);
      } catch {
        return '';
      }
    };
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
      done({ status: null, stderr: tail(), error: new Error(`timed out after ${PER_FILE_TIMEOUT_MS / 1000} s`) });
    }, PER_FILE_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      done({ status: null, stderr: tail(), error });
    });
    child.on('exit', (status) => {
      clearTimeout(timer);
      track.kill = null;
      done({ status, stderr: tail(), error: null });
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

  const runs = runsFolder();
  if (!runs) {
    for (const r of runnable) Object.assign(r, { outcome: 'could-not-run', reason: `the run folder in ${tmpdir()} is a link or not this user's; not used` });
    return { base: sha, depsDiffer, results };
  }
  sweepStale(root, runs);
  const temp = mkdtempSync(join(runs, RUN_PREFIX));
  writeFileSync(join(temp, OWNER_FILE), `${process.pid} ${startedAt(process.pid)}`);
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
    for (const [i, r] of runnable.entries()) {
      const dest = join(wt, normalize(r.file));
      if (!insideWorktree(realWt, dest)) {
        Object.assign(r, { outcome: 'could-not-run', reason: `${r.file}: a symlink on the base commit leads outside the worktree; not copied` });
        continue;
      }
      // Before the copy replaces it: which tests the base's file has, as vitest names them (P3-I6).
      if (lstatSync(dest, { throwIfNoEntry: false })?.isFile()) r.baseNames = await listTests(vitestEntry, wt, dest, temp, i, track);
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
        join(temp, CHILD_FILE),
        join(temp, `stderr-${i}.log`)
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
      const { baseNames } = r;
      delete r.baseNames;
      Object.assign(
        r,
        classifyReport(report, join(wt, normalize(r.file)), fallback, baseText, { worktrees: [realWt, wt], project: root, baseNames })
      );
    }
    return { base: sha, depsDiffer, results };
  } finally {
    for (const sig of SIGNALS) process.removeListener(sig, onSignal);
    cleanup();
  }
}

/**
 * The full names (`describe > title`) of the tests in one base file, from
 * `vitest list`; null when vitest listed none for it (the file did not collect),
 * and the caller falls back to the titles its source spells out.
 */
async function listTests(vitestEntry, wt, dest, temp, i, track) {
  const out = join(temp, `list-${i}.json`);
  const rel = relative(wt, dest).split(sep).join('/');
  // `--json=<path>`, joined: given apart, the next argument is taken as the path and overwritten.
  await runChild([vitestEntry, 'list', rel, '--root', wt, `--json=${out}`], { cwd: wt, env: childEnv() }, track,
    join(temp, CHILD_FILE), join(temp, `list-stderr-${i}.log`));
  try {
    const listed = JSON.parse(readFileSync(out, 'utf-8'));
    const names = listed.filter((e) => typeof e?.file === 'string' && resolve(e.file) === dest && typeof e.name === 'string').map((e) => e.name);
    return names.length > 0 ? new Set(names) : null;
  } catch {
    return null;
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
  // A new test that passed on the base is hollow even in a file that failed:
  // it is in the summary line, the record a round keeps (P2-I2).
  const hollow = result.results.reduce((n, r) => n + (r.outcome === 'failed' ? r.passed?.length ?? 0 : 0), 0);
  if (hollow) head += `, ${hollow} new test${hollow === 1 ? '' : 's'} passed on the base`;
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

/** Exit 0 only when there was at least one file, every one failed on the base, and no new test passed there. */
export function exitCodeFor(result) {
  const proven = (r) => r.outcome === 'failed' && !(r.passed?.length > 0);
  return result.results.length > 0 && result.results.every(proven) ? 0 : 1;
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
