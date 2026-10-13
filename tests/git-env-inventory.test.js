// M6.E16 r6 (REVIEW: High, security) — every git call Signal makes carries the
// shared environment (`gitEnv`, `plugin/tools/lib/git-env.js`).
//
// `gitEnv()` is what stops git from taking a planted `HEAD` + `config` +
// `objects/` + `refs/` in the project folder for a repository and running the
// command its `config` names (`tests/git-env-planted-bare-repo.test.js` runs
// that attack). It protects a call only when the call passes it, and one call
// without it is the whole hole again. So this is a STATIC check over every
// file under `plugin/tools` and `plugin/hooks`:
//
//   - a call whose first argument is the literal `'git'` — under any callee
//     name: `execFileSync`, `spawnSync`, an injected `execFn`, a local wrapper
//     — must have `gitEnv()` inside its own parentheses;
//   - the file must import `gitEnv` from `git-env.js` (or from `work-write.js`,
//     which re-exports it), so the name is the shared one;
//   - git may not be run as a shell string (`exec('git status')`) or from a
//     shell script: neither can be checked for the environment here.
//
// `PENDING` lists the files known not to pass yet, each with its exact number
// of calls and why. It may only shrink: a file that gains a call, or one that
// is fixed while its row stays, fails. Planted violations prove the scan bites.
//
// The residue, stated: a call that takes `'git'` from a variable
// (`const bin = 'git'; execFileSync(bin, …)`) is invisible here. Nothing in the
// tree does that today, and the wrappers that pass a command through
// (`inRepo`, `work-migrate-v2.js`) are called with the literal, which is seen.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { gitEnv } from '../plugin/tools/lib/git-env.js';
import * as workWrite from '../plugin/tools/lib/work-write.js';

const ROOT = process.cwd();
const DIRS = ['plugin/tools', 'plugin/hooks'];
const ENV_MODULE = 'plugin/tools/lib/git-env.js';

// Files whose git calls do not carry the environment yet. `calls` is exact.
const PENDING = [];

function filesUnder(rel) {
  const out = [];
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...filesUnder(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// Comment lines blanked (line numbers kept), so a call quoted in one is not
// counted — the same rule as `codeLines` in `tests/work-record-writers.test.js`.
// A comment after code on the same line is left in: a call quoted there is
// reported, which errs on the side of looking.
const stripComments = (text) => text.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l)).join('\n');

const GIT_CALL = /[\w$.]+\(\s*(['"`])git\1\s*[,)]/g;
const GIT_SHELL_STRING = /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|execFn)\(\s*(['"`])git\s/g;
const ENV_IMPORT = /import\s*\{[^}]*\bgitEnv\b[^}]*\}\s*from\s*'\.\/(?:git-env|work-write)\.js'/;

// The text of the call that opens at `text[open]` (a `(`), to its matching `)`.
function callText(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return text.slice(open);
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * The git calls in `source` that do not carry the shared environment.
 *
 * @param {string} source — a file's text
 * @param {{shell?: boolean}} [opts] — `shell`: a shell script, where any git command counts
 * @returns {Array<{line: number, why: string}>}
 */
function unprotectedGitCalls(source, { shell = false } = {}) {
  if (shell) {
    return source.split('\n')
      .map((l, i) => ({ line: i + 1, text: l.replace(/(^|\s)#.*$/, '') }))
      .filter((l) => /(^|[\s;&|(`])git\s+[a-z-]/.test(l.text))
      .map((l) => ({ line: l.line, why: 'a shell script runs git, where the environment cannot be checked' }));
  }
  const text = stripComments(source);
  const out = [];
  for (const m of text.matchAll(GIT_SHELL_STRING)) {
    out.push({ line: lineOf(text, m.index), why: 'git is run as a shell string' });
  }
  const calls = [...text.matchAll(GIT_CALL)];
  for (const m of calls) {
    const call = callText(text, m.index + m[0].indexOf('('));
    if (!/\bgitEnv\(\)/.test(call)) out.push({ line: lineOf(text, m.index), why: 'the call does not pass `gitEnv()`' });
  }
  if (calls.length > 0 && !ENV_IMPORT.test(text)) {
    out.push({ line: 1, why: '`gitEnv` is not imported from git-env.js (or work-write.js)' });
  }
  return out;
}

const scan = () => DIRS.flatMap(filesUnder)
  .filter((f) => /\.(?:js|cjs|mjs|sh)$/.test(f) && f !== ENV_MODULE)
  .map((file) => ({ file, found: unprotectedGitCalls(readFileSync(join(ROOT, file), 'utf-8'), { shell: file.endsWith('.sh') }) }))
  .filter((f) => f.found.length > 0);

describe('every git call carries the shared environment', () => {
  it('no file under plugin/tools or plugin/hooks runs git without `gitEnv()`', () => {
    const pending = new Set(PENDING.map((p) => p.file));
    const violations = scan().filter((f) => !pending.has(f.file))
      .flatMap((f) => f.found.map((v) => `${f.file}:${v.line} — ${v.why}`));
    expect(violations).toEqual([]);
  });

  it('a pending file has exactly the calls it was listed with — fewer means its row goes, more is a new hole', () => {
    const found = new Map(scan().map((f) => [f.file, f.found.filter((v) => v.why.startsWith('the call')).length]));
    for (const p of PENDING) {
      expect(p.reason, p.file).toEqual(expect.stringMatching(/\S/));
      expect({ file: p.file, calls: found.get(p.file) ?? 0 }).toEqual({ file: p.file, calls: p.calls });
    }
  });

  it('the scan finds git calls at all — it is not passing over an empty set', () => {
    const withCalls = DIRS.flatMap(filesUnder).filter((f) => f.endsWith('.js'))
      .filter((f) => [...stripComments(readFileSync(join(ROOT, f), 'utf-8')).matchAll(GIT_CALL)].length > 0);
    for (const known of ['branch-guard.js', 'work-store.js', 'work-write.js', 'state.js', 'jev.js', 'migrate-memory.js']) {
      expect(withCalls, known).toContain(`plugin/tools/lib/${known}`);
    }
  });

  it('planted violations are found', () => {
    const imp = "import { gitEnv } from './git-env.js';\n";
    // a direct call, an injected one over several lines, a wrapper, spawnSync
    for (const planted of [
      "execFileSync('git', ['status'], { cwd: baseDir });",
      "const out = execFn(\n  'git',\n  ['log'],\n  { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] }\n);",
      "const git = (args) => String(execFn('git', args, { cwd: baseDir })).trim();",
      'spawnSync("git", ["check-ignore", "-q", "--", name], { cwd: baseDir });',
      "run('git', args);",
    ]) expect(unprotectedGitCalls(imp + planted), planted).toMatchObject([{ why: 'the call does not pass `gitEnv()`' }]);
    // `gitEnv()` in the NEXT call does not cover this one
    expect(unprotectedGitCalls(`${imp}a('git', x, { cwd });\nb('git', y, { cwd, env: gitEnv() });`)).toHaveLength(1);
    // a local function of the same name is not the shared one
    expect(unprotectedGitCalls("const gitEnv = () => process.env;\nexecFileSync('git', ['status'], { env: gitEnv() });"))
      .toMatchObject([{ why: expect.stringContaining('not imported') }]);
    expect(unprotectedGitCalls("execSync('git status --porcelain', { cwd });")).toMatchObject([{ why: 'git is run as a shell string' }]);
    expect(unprotectedGitCalls('#!/bin/sh\nbranch=$(git branch --show-current)\n', { shell: true })).toHaveLength(1);
  });

  it('and what is not a violation is not reported', () => {
    const imp = "import { gitEnv } from './git-env.js';\n";
    expect(unprotectedGitCalls(`${imp}execFn('git', ['status'], { cwd: baseDir, env: gitEnv() });`)).toEqual([]);
    expect(unprotectedGitCalls(`${imp}execFn(\n  'git',\n  ['fetch'],\n  { cwd, env: { ...gitEnv(), GIT_TERMINAL_PROMPT: '0' } }\n);`)).toEqual([]);
    expect(unprotectedGitCalls("// execFileSync('git', ['status'])\nconst source = 'git';\nexecFn('gh', args);")).toEqual([]);
    expect(unprotectedGitCalls('#!/bin/sh\n# git log is not run here\necho "no repository"\n', { shell: true })).toEqual([]);
  });
});

describe('gitEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it('sets safe.bareRepository=explicit, and turns replace refs and grafts off', () => {
    delete process.env.GIT_CONFIG_COUNT;
    expect(gitEnv()).toMatchObject({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.bareRepository',
      GIT_CONFIG_VALUE_0: 'explicit',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_GRAFT_FILE: '/dev/null',
    });
  });

  it('adds to the settings already in the environment and overwrites none of them', () => {
    Object.assign(process.env, { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'A', GIT_CONFIG_KEY_1: 'user.email', GIT_CONFIG_VALUE_1: 'a@b.c' });
    expect(gitEnv()).toMatchObject({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_VALUE_0: 'A',
      GIT_CONFIG_KEY_1: 'user.email',
      GIT_CONFIG_VALUE_1: 'a@b.c',
      GIT_CONFIG_KEY_2: 'safe.bareRepository',
      GIT_CONFIG_VALUE_2: 'explicit',
    });
  });

  it('starts at zero when the inherited count is not a count', () => {
    for (const bad of ['', 'x', '-1', '1.5']) {
      process.env.GIT_CONFIG_COUNT = bad;
      expect(gitEnv(), JSON.stringify(bad)).toMatchObject({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.bareRepository' });
    }
  });

  it('keeps the rest of the environment, and is the one work-write.js re-exports', () => {
    expect(gitEnv().PATH).toBe(process.env.PATH);
    expect(workWrite.gitEnv).toBe(gitEnv);
  });
});
