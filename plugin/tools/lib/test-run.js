// Run the project's tests and record the result (Step 2 of the course correction, loop piece 3).
//
// VERIFY cannot record a pass without a passing record for the files as they are now
// (`recordPass` in state.js asks `checkTestRun`). The record names the files it tested by a
// fingerprint of their content, not by commit: committing the record, or the session's own notes
// under `.planning/`, does not make it stale, and a commit hook can check a tree before the commit
// exists.
//
//   node test-run.js [--command "<cmd>"]     run the tests, write .planning/TEST-RUN.json
//   node test-run.js --check                 does the record match the files now?
//
// Exit 0 when the tests passed (or, with --check, the record holds); 1 otherwise; 2 for a usage error.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { atomicWrite } from './atomic-write.js';
import { gitEnv } from './git-env.js';
import { testCommand } from './stack-detect.js';

export const RECORD_PATH = join('.planning', 'TEST-RUN.json');
const TIMEOUT_MS = 30 * 60_000;
const TAIL_LINES = 20;

/**
 * A fingerprint of every file git would see in the project (tracked or not ignored), by content,
 * leaving out `.planning/`.
 *
 * @returns {{ok: true, fingerprint: string, files: number} | {ok: false, problem: string}}
 */
export function treeFingerprint(baseDir) {
  const r = spawnSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z', '--', '.', ':(exclude).planning'], {
    cwd: baseDir,
    env: gitEnv(baseDir),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) return { ok: false, problem: `git could not list the project's files: ${String(r.stderr || r.error?.message || '').trim().split('\n')[0]}` };
  const paths = [...new Set(r.stdout.split('\0').filter(Boolean))].sort();
  const hash = createHash('sha256');
  for (const p of paths) {
    const abs = join(baseDir, p);
    const st = lstatSync(abs, { throwIfNoEntry: false });
    let body;
    if (!st) body = 'deleted';
    else if (st.isSymbolicLink()) body = `link ${readlinkSync(abs)}`;
    else if (st.isFile()) body = `file ${st.mode & 0o111 ? 'x' : '-'} ${createHash('sha256').update(readFileSync(abs)).digest('hex')}`;
    else body = 'other';
    hash.update(`${p}\0${body}\0`);
  }
  return { ok: true, fingerprint: hash.digest('hex'), files: paths.length };
}

function readRecord(baseDir) {
  const path = join(baseDir, RECORD_PATH);
  if (!existsSync(path)) return { record: null, problem: `No test record (${RECORD_PATH}): run test-run.js.` };
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof record?.fingerprint !== 'string' || typeof record?.passed !== 'boolean') {
      return { record: null, problem: `${RECORD_PATH} is not a test record: run test-run.js again.` };
    }
    return { record, problem: null };
  } catch {
    return { record: null, problem: `${RECORD_PATH} does not parse: run test-run.js again.` };
  }
}

/**
 * The command to run: the one given, else the one the last record used, else what the project's
 * manifests say.
 */
export function resolveTestCommand(baseDir, given) {
  if (typeof given === 'string' && given.trim() !== '') return { command: given.trim(), from: 'given' };
  const { record } = readRecord(baseDir);
  if (typeof record?.command === 'string' && record.command !== '') return { command: record.command, from: 'the last test record' };
  return testCommand(baseDir);
}

function head(baseDir) {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: baseDir, env: gitEnv(baseDir), encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The environment for the tests: never a worker of a vitest that may be running this. */
const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')));

/**
 * Run the tests once and write the record.
 *
 * @returns {Promise<{ok: true, record: object} | {ok: false, problem: string}>}
 */
export async function runTests(baseDir, { command } = {}) {
  const cmd = resolveTestCommand(baseDir, command);
  if (!cmd) {
    return { ok: false, problem: 'No test command found (no package.json test script, pytest, cargo or go project). Run test-run.js --command "<the command that runs your tests>".' };
  }
  const before = treeFingerprint(baseDir);
  if (!before.ok) return { ok: false, problem: before.problem };
  const started = Date.now();
  const r = spawnSync('sh', ['-c', cmd.command], { cwd: baseDir, env: childEnv(), encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 });
  const durationMs = Date.now() - started;
  const after = treeFingerprint(baseDir);
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd().split('\n');
  const record = {
    schema: 1,
    command: cmd.command,
    commandFrom: cmd.from,
    head: head(baseDir),
    fingerprint: before.fingerprint,
    files: before.files,
    changedDuringRun: !after.ok || after.fingerprint !== before.fingerprint,
    exitCode: r.status,
    passed: r.status === 0 && !r.error,
    error: r.error ? (r.error.code === 'ETIMEDOUT' ? `timed out after ${TIMEOUT_MS / 60_000} minutes` : r.error.message) : null,
    ranAt: new Date(started).toISOString(),
    durationMs,
    outputTail: output.slice(-TAIL_LINES),
  };
  await atomicWrite(join(baseDir, RECORD_PATH), JSON.stringify(record, null, 2) + '\n');
  return { ok: true, record };
}

/**
 * Does a passing record exist for the project's files as they are now?
 *
 * @returns {{ok: boolean, record: object|null, reasons: string[]}}
 */
export function checkTestRun(baseDir) {
  const { record, problem } = readRecord(baseDir);
  if (!record) return { ok: false, record: null, reasons: [problem] };
  const reasons = [];
  if (!record.passed) reasons.push(`The last test run failed (${record.command}, exit ${record.exitCode ?? record.error}).`);
  if (record.changedDuringRun) reasons.push('Files changed while the tests ran, so the record cannot say which version passed. Run test-run.js again.');
  const now = treeFingerprint(baseDir);
  if (!now.ok) reasons.push(now.problem);
  else if (now.fingerprint !== record.fingerprint) reasons.push('Files outside .planning/ changed since the tests last ran. Run test-run.js again.');
  return { ok: reasons.length === 0, record, reasons };
}

/** One line a progress file or report can quote: `test-run <fp7>: passed (npm test, exit 0, 3 s)`. */
export function formatTestRun(record) {
  const what = record.passed ? 'passed' : 'failed';
  const exit = record.error ? record.error : `exit ${record.exitCode}`;
  return `test-run ${record.fingerprint.slice(0, 7)}: ${what} (${record.command}, ${exit}, ${Math.round(record.durationMs / 1000)} s)`;
}

export const TEST_RUN_SUMMARY_RE = /^test-run ([0-9a-f]{7}): (passed|failed) \((.+), (exit -?\d+|exit null|[^,]+), (\d+) s\)$/;

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isMain()) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--command');
  if (at >= 0 && (args[at + 1] === undefined || args[at + 1].startsWith('--'))) {
    console.error('usage: node test-run.js [--command "<cmd>"] | --check');
    process.exitCode = 2;
  } else if (args.includes('--check')) {
    const c = checkTestRun(process.cwd());
    console.log(c.ok ? `Test record holds: ${formatTestRun(c.record)}` : `Test record does not hold:\n- ${c.reasons.join('\n- ')}`);
    process.exitCode = c.ok ? 0 : 1;
  } else {
    const r = await runTests(process.cwd(), { command: at >= 0 ? args[at + 1] : undefined });
    if (!r.ok) {
      console.error(r.problem);
      process.exitCode = 1;
    } else {
      console.log(formatTestRun(r.record));
      if (!r.record.passed) console.log(r.record.outputTail.join('\n'));
      if (r.record.changedDuringRun) console.log('Files changed while the tests ran; VERIFY will not accept this record.');
      process.exitCode = r.record.passed ? 0 : 1;
    }
  }
}
