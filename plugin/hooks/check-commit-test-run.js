#!/usr/bin/env node
// PreToolUse(Bash) hook: during EXECUTE, a `git commit` needs a passing test run of the files as
// they are now (Step 2 of the course correction, loop piece 4).
//
// It reads the record `tools/lib/test-run.js` writes (`.planning/TEST-RUN.json`) and blocks the
// command (exit 2, the reason on stderr) when the record is missing, failed, or older than the
// files outside `.planning/`. It fires for the executor agent's commits as well as the session's
// own: plugin hooks see a subagent's tool calls.
//
// It lets through:
// - any command that is not a `git commit`, and any phase but EXECUTE;
// - a commit when nothing outside `.planning/` differs from HEAD (the session recording progress);
// - a project where no test command can be found and there is no record: it warns instead, since
//   VERIFY refuses a pass there anyway (`recordPass`);
// - anything it cannot read. A broken hook must not stop work, so every failure exits 0.
//
// Limits: it finds `git commit` by a pattern on the command, so a commit made through an alias or a
// script is not seen; and it checks the working tree, so a commit that stages less than was tested
// passes here (`task-result.js` reports the files left uncommitted).

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitEnv } from '../tools/lib/git-env.js';
import { checkTestRun, resolveTestCommand } from '../tools/lib/test-run.js';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'lib', 'test-run.js');

/** `git commit`, with any options git takes before the subcommand (`-c k=v`, `-C dir`, `--no-pager`). */
const GIT_COMMIT_RE = /(?:^|[\s;&|(`])git(?:\s+(?:-[cC]\s+\S+|-\S+))*\s+commit(?=$|[\s;&|)`])/;

const isInside = (dir, top) => {
  const rel = relative(realpathLoose(top), realpathLoose(dir));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const realpathLoose = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return 0;
  }
  if (event?.tool_name !== 'Bash') return 0;
  const command = event?.tool_input?.command;
  if (typeof command !== 'string' || !GIT_COMMIT_RE.test(command)) return 0;

  const cwd = typeof event.cwd === 'string' && isAbsolute(event.cwd) ? event.cwd : process.cwd();
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, env: gitEnv(cwd), encoding: 'utf8' });
  if (top.status !== 0) return 0;
  // The project is the nearest folder at or above the cwd with a .planning/STATE.md, up to the git top
  // level: a Signal project can sit in a subfolder of its repository.
  const gitTop = top.stdout.trim();
  let root = cwd;
  let state;
  for (;;) {
    try {
      state = readFileSync(join(root, '.planning', 'STATE.md'), 'utf8');
      break;
    } catch {
      const up = dirname(root);
      if (up === root || !isInside(up, gitTop)) return 0;
      root = up;
    }
  }
  const phase = state.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].match(/^phase:\s*['"]?(\w+)/m)?.[1];
  if (phase !== 'EXECUTE') return 0;

  const outside = spawnSync('git', ['status', '--porcelain', '-z', '-uall', '--', '.', ':(exclude).planning'], { cwd: root, env: gitEnv(root), encoding: 'utf8' });
  if (outside.status !== 0 || outside.stdout === '') return 0;

  const run = checkTestRun(root);
  if (run.ok) return 0;
  const cmd = `node "${TOOL}"`;
  if (!run.record && !resolveTestCommand(root)) {
    process.stderr.write(`Signal: no test command was found for this project, so this commit is not checked. Give one with ${cmd} --command "<the command that runs your tests>"; VERIFY will not pass without it.\n`);
    return 0;
  }
  process.stderr.write(
    `Signal blocked this commit, and nothing in that command ran: during EXECUTE a commit needs a passing test run of the files as they are now.\n` +
      run.reasons.map((r) => `- ${r}\n`).join('') +
      `Run ${cmd}, fix what fails, and commit again. Leave .planning/TEST-RUN.json out of a task's commit.\n`,
  );
  return 2;
}

try {
  process.exit(main());
} catch {
  process.exit(0);
}
