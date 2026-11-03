// What a task's executor agent actually did, read from git rather than from its report (Step 2).
//
// EXECUTE runs this after each executor agent returns. Verdicts:
//   done      exactly one new commit on top of the start, a clean tree, nothing under .planning/
//   not-done  no new commit
//   check     anything else: more than one commit, a dirty tree, .planning/ touched, history rewritten
// It also runs the task's new or changed test files against the start commit (parent-run.js), so
// the proof that they fail without the change comes from this tool, not from the agent.
//
//   node task-result.js --start <commit> [--json]     (run in the project's directory)

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runOnBase, formatParentRun } from './parent-run.js';
import { gitEnv } from './git-env.js';

const TEST_FILE_RE = /(^|\/)(tests?|__tests__)\/|[._-](test|spec)\.[cm]?[jt]sx?$/;

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, env: gitEnv(cwd), encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

/**
 * @param {string} baseDir
 * @param {{start: string, proof?: boolean}} opts — proof: false skips the parent run (tests)
 */
export async function checkTaskResult(baseDir, { start, proof = true }) {
  const startSha = start && !start.startsWith('-') ? git(baseDir, ['rev-parse', '--verify', `${start}^{commit}`]) : { ok: false };
  if (!startSha.ok) return { verdict: 'check', problems: [`${start} is not a commit.`], commits: [], files: [] };

  const problems = [];
  if (!git(baseDir, ['merge-base', '--is-ancestor', startSha.out, 'HEAD']).ok) {
    problems.push('HEAD does not descend from the start commit: history was rewritten.');
  }
  const commits = git(baseDir, ['rev-list', '--reverse', `${startSha.out}..HEAD`]).out.split('\n').filter(Boolean);
  const files = git(baseDir, ['diff', '--name-only', startSha.out, 'HEAD']).out.split('\n').filter(Boolean);
  const dirty = (spawnSync('git', ['status', '--porcelain'], { cwd: baseDir, env: gitEnv(baseDir), encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean);

  if (commits.length > 1) problems.push(`${commits.length} commits since the start; a task is one commit.`);
  if (dirty.length) problems.push(`The working tree has uncommitted changes: ${dirty.slice(0, 5).map((l) => l.slice(3)).join(', ')}${dirty.length > 5 ? ', …' : ''}.`);
  const planning = files.filter((f) => f.startsWith('.planning/'));
  if (planning.length) problems.push(`The task changed files under .planning/: ${planning.join(', ')}.`);

  const tests = files.filter((f) => TEST_FILE_RE.test(f));
  let parentRun = null;
  if (proof && commits.length > 0 && tests.length > 0) {
    parentRun = formatParentRun(await runOnBase(baseDir, { base: startSha.out, tests }));
  }

  const verdict = commits.length === 0 && problems.length === 0 ? 'not-done' : problems.length ? 'check' : 'done';
  return {
    verdict,
    problems,
    commit: commits.length === 1 ? commits[0] : null,
    commits,
    files,
    tests,
    parentRun: parentRun ?? (tests.length ? null : 'no new or changed test file: a stated gap'),
  };
}

export function formatTaskResult(r) {
  const lines = [`Task result: ${r.verdict}${r.commit ? ` (commit ${r.commit.slice(0, 7)})` : ''}`];
  for (const p of r.problems) lines.push(`- ${p}`);
  if (r.files.length) lines.push(`Files: ${r.files.join(', ')}`);
  if (r.parentRun) lines.push(r.parentRun);
  return lines.join('\n');
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isMain()) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--start');
  const r = await checkTaskResult(process.cwd(), { start: at >= 0 ? args[at + 1] : null });
  process.stdout.write((args.includes('--json') ? JSON.stringify(r, null, 2) : formatTaskResult(r)) + '\n');
  process.exitCode = r.verdict === 'done' ? 0 : 1;
}
