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
// script is not seen, nor one whose folder depends on a variable other than $HOME; and it checks the working tree, so a commit that stages less than was tested
// passes here (`task-result.js` reports the files left uncommitted).

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitEnv } from '../tools/lib/git-env.js';
import { checkTestRun, resolveTestCommand } from '../tools/lib/test-run.js';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'lib', 'test-run.js');

// One shell word: quoted, or plain up to a space or an operator.
const WORD = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|()\x60'"]+)`;
/** `git commit`, with any options git takes before the subcommand (`-c k=v`, `-C dir`, `--no-pager`). */
const GIT_COMMIT_RE = new RegExp(String.raw`(?:^|[\s;&|(\x60])git((?:\s+(?:-[cC]\s+${WORD}|-\S+))*)\s+commit(?=$|[\s;&|)\x60])`);
const C_RE = new RegExp(String.raw`-C\s+(${WORD})`, 'g');
const CD_RE = new RegExp(String.raw`(?:^|[;&|(])\s*cd\s+(${WORD})\s*(?=&&|;|\|\|)`, 'g');

/** A folder the shell would reach, or null when it depends on what this hook cannot know ($VAR). */
function shellDir(word, at) {
  let d = /^(["']).*\1$/.test(word) ? word.slice(1, -1) : word;
  if (!word.startsWith("'")) d = d.replace(/^~(?=\/|$)/, process.env.HOME ?? '~').replace(/\$\{?HOME\}?/g, process.env.HOME ?? '$HOME');
  if (/[$`~]/.test(d)) return null;
  return resolve(at, d);
}
const shellQuote = (p) => `'${p.replace(/'/g, `'\\''`)}'`;

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
  const m = typeof command === 'string' ? command.match(GIT_COMMIT_RE) : null;
  if (!m) return 0;

  const shellCwd = typeof event.cwd === 'string' && isAbsolute(event.cwd) ? event.cwd : process.cwd();
  // The commit runs where an earlier `cd X &&` and then `git -C <dir>` put it: check that project,
  // not the shell's. A folder that depends on a variable is not known, so the commit is let through.
  const words = [...command.slice(0, m.index + 1).matchAll(CD_RE)].map((c) => c[1]).concat([...m[1].matchAll(C_RE)].map((c) => c[1]));
  let cwd = shellCwd;
  for (const w of words) {
    cwd = shellDir(w, cwd);
    if (cwd === null) return 0;
  }
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
  const cmd = `cd ${shellQuote(root)} && node ${shellQuote(TOOL)}`;
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
