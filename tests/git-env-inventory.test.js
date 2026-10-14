// M6.E16 r6 (REVIEW: High, security) — every git call Signal makes carries the
// shared environment (`gitEnv`, `plugin/tools/lib/git-env.js`).
//
// `gitEnv()` is what stops git from taking a planted `HEAD` + `config` +
// `objects/` + `refs/` in the project folder for a repository and running the
// command its `config` names (`tests/git-env-planted-bare-repo.test.js` runs
// that attack). It protects a call only when the call passes it, and one call
// without it is the whole hole again. So this is a STATIC check over every
// file under `plugin/tools` and `plugin/hooks`. The rules are written out in
// `tests/helpers/git-call-scan.js`, which reads each file's syntax tree
// (r6.2 — the first version matched text, and eight shapes got past it; each
// is planted below).
//
// What the scan still CANNOT see — the residue, stated:
//
//   - a command that arrives as a parameter and is passed on
//     (`inRepo`, `work-migrate-v2.js`: `execFn(cmd, args, …)`). Its callers
//     are seen — they write `'git'` — and the wrapper sets `env` itself;
//   - a command put together at run time (`'g' + 'it'`, a property of an
//     object, a value read from a file);
//   - an `execFn` the CALLER wrote (`pr-review-findings.js` hands `gh`'s
//     environment to it as a third argument): one that drops that argument
//     runs `gh` with its own;
//   - what is spread into `env` AFTER `...gitEnv(<folder>)`
//     (`{ ...gitEnv(baseDir), ...ORIGIN_FETCH_ENV }`, `state.js`): a later key
//     could put back a variable `gitEnv` took out. The one such spread adds
//     four prompt-and-ssh settings;
//   - a `cwd` that comes from a spread (`{ ...opts, env: gitEnv(root) }`,
//     `adherence-harness.js`): the folder is not compared with it;
//   - `git-env.js` itself, which asks git one question without
//     `safe.bareRepository` on purpose (`repositoryWithoutDotGit`);
//   - any file outside `plugin/tools` and `plugin/hooks`.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { gitEnv } from '../plugin/tools/lib/git-env.js';
import * as workWrite from '../plugin/tools/lib/work-write.js';
import { countGitCalls, unprotectedGitCalls } from './helpers/git-call-scan.js';

const ROOT = process.cwd();
const DIRS = ['plugin/tools', 'plugin/hooks'];
const ENV_MODULE = 'plugin/tools/lib/git-env.js';

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
const scanned = () => DIRS.flatMap(filesUnder).filter((f) => /\.(?:js|cjs|mjs|sh)$/.test(f) && f !== ENV_MODULE);
const read = (file) => readFileSync(join(ROOT, file), 'utf-8');

const IMP = "import { execFileSync, spawnSync } from 'node:child_process';\nimport { gitEnv } from './git-env.js';\n";
const whys = (code, opts) => unprotectedGitCalls(code, opts).map((v) => v.why);

describe('every git call carries the shared environment', () => {
  it('no file under plugin/tools or plugin/hooks runs git without `gitEnv(<folder>)`', () => {
    const violations = scanned()
      .flatMap((file) => unprotectedGitCalls(read(file), { shell: file.endsWith('.sh') }).map((v) => `${file}:${v.line} — ${v.why}`));
    expect(violations).toEqual([]);
  });

  it('the scan finds git calls at all — it is not passing over an empty set', () => {
    const calls = new Map(scanned().filter((f) => f.endsWith('.js')).map((f) => [f, countGitCalls(read(f))]));
    for (const known of ['branch-guard.js', 'work-store.js', 'git-objects.js', 'state.js', 'jev.js', 'migrate-memory.js', 'pr-review-findings.js']) {
      expect(calls.get(`plugin/tools/lib/${known}`), known).toBeGreaterThan(0);
    }
    // As many as there were when this was written; a new call is fine, far fewer is a scan gone blind.
    expect([...calls.values()].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(45);
  });

  it('a call without the environment is found, under any callee and however it is laid out', () => {
    for (const planted of [
      "execFileSync('git', ['status'], { cwd: baseDir });",
      "const out = execFn(\n  'git',\n  ['log'],\n  { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] }\n);",
      "const git = (args) => String(execFn('git', args, { cwd: baseDir })).trim();",
      'spawnSync("git", ["check-ignore", "-q", "--", name], { cwd: baseDir });',
      "run('git', args);",
      "execFn('gh', ['pr', 'view'], { cwd: baseDir, env: { ...process.env } });",
      "run('gh', args);",
      "execFileSync(`git`, ['status'], { cwd: baseDir });",
    ]) expect(whys(IMP + planted), planted).toEqual([expect.stringContaining('does not pass `gitEnv()`')]);
    // `gitEnv()` in the NEXT call does not cover this one
    expect(whys(`${IMP}a('git', x, { cwd });\nb('git', y, { cwd, env: gitEnv(cwd) });`)).toHaveLength(1);
  });

  // r6.2: each of these passed the first, text-matching version of this scan.
  it.each([
    ['(b) the name only in a comment', "execFileSync('git', ['status'], { cwd: baseDir, env: process.env /* gitEnv(baseDir) */ });", 'neither `gitEnv(<folder>)`'],
    ['(b) the name only in a string', "execFileSync('git', ['status'], { cwd: baseDir, env: { NOTE: 'gitEnv(baseDir)' } });", 'neither `gitEnv(<folder>)`'],
    ['(b) the name in a trailing comment', "execFileSync('git', ['status'], { cwd: baseDir }); // env: gitEnv(baseDir)", 'no `env` key'],
    ['(c) a second `env:` after the first', "execFileSync('git', ['status'], { env: gitEnv(baseDir), cwd: baseDir, env: process.env });", 'more than one `env` key'],
    ['(c) a spread after `env`', "execFileSync('git', ['status'], { cwd: baseDir, env: gitEnv(baseDir), ...o });", 'spread after `env`'],
    ['(c) the environment only on one side of a choice', "execFileSync('git', ['status'], { cwd: baseDir, env: safe ? gitEnv(baseDir) : process.env });", 'neither `gitEnv(<folder>)`'],
    ['(c) `gitEnv` spread, but not first', "execFileSync('git', ['status'], { cwd: baseDir, env: { ...process.env, ...gitEnv(baseDir) } });", 'neither `gitEnv(<folder>)`'],
    ['(d) a path to git', "execFileSync('/usr/bin/git', ['status'], { cwd: baseDir });", 'does not pass `gitEnv()`'],
    ['(d) git.exe', "execFileSync('C:\\\\Program Files\\\\Git\\\\bin\\\\git.exe', ['status'], { cwd: baseDir });", 'does not pass `gitEnv()`'],
    ['(d) a path to gh', "execFn('/opt/homebrew/bin/gh', ['pr', 'view'], { cwd });", 'does not pass `gitEnv()`'],
    ['(f) a shell string through a wrapper', "run('git status --porcelain', { cwd });", 'shell string'],
    ['(f) a shell string in a template', 'sh(`git log --oneline`);', 'shell string'],
    ['(g) the arguments in a spread', "execFileSync(...['git', ['status'], { cwd: baseDir }]);", 'spread'],
    ['(g) the options in a spread', "execFileSync('git', ...rest);", 'not one object written in the call'],
    ['(g) the options in a variable', "execFileSync('git', ['status'], opts);", 'not one object written in the call'],
    ['(k) a misspelt key', "execFileSync('git', ['status'], { cwd: baseDir, envv: gitEnv(baseDir) });", 'no `env` key'],
    ['(k) a computed key', "execFileSync('git', ['status'], { cwd: baseDir, [env]: gitEnv(baseDir) });", 'no `env` key'],
    ['(a) git held in a constant', "const GIT = 'git';\nexecFileSync(GIT, ['status'], { cwd: baseDir });", 'held in `GIT`'],
    ['(a) git assigned to a variable', "let bin;\nbin = '/usr/bin/git';\nspawnSync(bin, ['status']);", 'held in `bin`'],
    ['(a) gh held in a constant, with the environment', "const GH = 'gh';\nexecFn(GH, args, { cwd, env: gitEnv(cwd) });", 'held in `GH`'],
    ['no folder: nothing is looked at', "execFn('git', ['status'], { cwd: baseDir, env: gitEnv() });", 'given no folder'],
    ['another folder than the call runs in', "execFn('git', ['status'], { cwd: repo, env: gitEnv(baseDir) });", 'another folder'],
    ['another folder, `cwd` in shorthand', "execFn('gh', args, { cwd, env: gitEnv(baseDir) });", 'another folder'],
  ])('planted: %s', (_label, planted, why) => {
    expect(whys(IMP + planted), planted).toEqual([expect.stringContaining(why)]);
  });

  it('planted: (h) a shell is not reachable at all — `exec`, `execSync`, another name, another way in, `shell: true`', () => {
    const noShell = (code) => whys(code).filter((w) => /child_process|shell/.test(w));
    expect(noShell("import { execSync } from 'node:child_process';\nexecSync('ls');")).toHaveLength(1);
    expect(noShell("import { exec } from 'child_process';")).toHaveLength(1);
    expect(noShell("import { execFileSync as run } from 'node:child_process';")).toHaveLength(1);
    expect(noShell("import * as cp from 'node:child_process';")).toHaveLength(1);
    expect(noShell("import cp from 'node:child_process';")).toHaveLength(1);
    expect(noShell("const { execSync } = await import('node:child_process');")).toHaveLength(1);
    expect(noShell("import { createRequire } from 'node:module';\nconst cp = createRequire(import.meta.url)('child_process');")).toHaveLength(1);
    expect(noShell("import { spawn } from 'node:child_process';\nspawn('ls', [], { shell: true });")).toHaveLength(1);
    expect(noShell("import { spawnSync } from 'node:child_process';\nspawnSync(cmd, { shell });")).toHaveLength(1);
    expect(noShell("import { spawnSync } from 'node:child_process';\nspawnSync('ls', [], { shell: false });")).toEqual([]);
  });

  it('planted: a `gitEnv` that is not the shared one, and a shell script that runs git', () => {
    expect(whys("const gitEnv = () => process.env;\nexecFileSync('git', ['status'], { env: gitEnv(dir) });")).toEqual([expect.stringContaining('not imported')]);
    expect(whys("import { gitEnv } from './my-env.js';\nexecFileSync('git', ['status'], { env: gitEnv(dir) });")).toEqual([expect.stringContaining('not imported')]);
    expect(whys("import { env as gitEnv } from './git-env.js';\nexecFileSync('git', ['status'], { env: gitEnv(dir) });")).toEqual([expect.stringContaining('not imported')]);
    expect(whys('#!/bin/sh\nbranch=$(git branch --show-current)\n', { shell: true })).toHaveLength(1);
    expect(whys('#!/bin/sh\ngh pr view\n', { shell: true })).toHaveLength(1);
  });

  it('and what is not a violation is not reported', () => {
    for (const fine of [
      "execFn('git', ['status'], { cwd: baseDir, env: gitEnv(baseDir) });",
      "execFn(\n  'git',\n  ['fetch'],\n  { cwd, env: { ...gitEnv(cwd), GIT_TERMINAL_PROMPT: '0' } }\n);",
      "execFileSync('git', ['init', '-q'], { ...opts, env: gitEnv() });",
      "execFileSync('git', ['add', '-A'], { ...opts, env: gitEnv(root) });",
      "execFn('gh', args, { cwd, env: gitEnv(cwd) });",
      "execFn('gh', args, { cwd: baseDir, 'env': { ...gitEnv(baseDir), GH_PROMPT_DISABLED: '1' } });",
      // the word is not the command: a value, a comparison, a list of names, another program
      "let source = 'git';\nconst plan = { mode: 'git', source };\nif (probe.mode === 'git') report(plan);",
      "const KNOWN = ['git', 'npm', 'gh'];\nexecFn('npm', args);",
      "// execFileSync('git', ['status'])\nconst note = 'run git status yourself';",
    ]) expect(whys(IMP + fine), fine).toEqual([]);
    // a hook file's import of the shared module, by its own path
    expect(whys("import { spawnSync } from 'node:child_process';\nimport { gitEnv } from '../tools/lib/git-env.js';\nspawnSync('git', ['status'], { cwd, env: gitEnv(cwd) });")).toEqual([]);
    expect(whys('#!/bin/sh\n# git log is not run here\necho "no repository"\n', { shell: true })).toEqual([]);
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
      GIT_CONFIG_COUNT: '2',
      // r6.3: git's advice about a grafts file stays off stderr
      GIT_CONFIG_KEY_0: 'advice.graftFileDeprecated',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'safe.bareRepository',
      GIT_CONFIG_VALUE_1: 'explicit',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_GRAFT_FILE: '/dev/null',
    });
  });

  it('adds to the settings already in the environment and overwrites none of them', () => {
    Object.assign(process.env, { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'A', GIT_CONFIG_KEY_1: 'user.email', GIT_CONFIG_VALUE_1: 'a@b.c' });
    expect(gitEnv()).toMatchObject({
      GIT_CONFIG_COUNT: '4',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_VALUE_0: 'A',
      GIT_CONFIG_KEY_1: 'user.email',
      GIT_CONFIG_VALUE_1: 'a@b.c',
      GIT_CONFIG_KEY_2: 'advice.graftFileDeprecated',
      GIT_CONFIG_VALUE_2: 'false',
      GIT_CONFIG_KEY_3: 'safe.bareRepository',
      GIT_CONFIG_VALUE_3: 'explicit',
    });
  });

  it('starts at zero when the inherited count is not a count', () => {
    for (const bad of ['', 'x', '-1', '1.5']) {
      process.env.GIT_CONFIG_COUNT = bad;
      expect(gitEnv(), JSON.stringify(bad)).toMatchObject({ GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_1: 'safe.bareRepository' });
    }
  });

  // r6.1: with any of these inherited, git would not look at the folder it is
  // run in, or would take settings (`-c core.fsmonitor=…`) from whoever set them.
  it('does not pass on the variables that point git somewhere else', () => {
    const redirects = [
      'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_PARAMETERS', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
      // r6.3: these change which objects and refs an ancestry question reads
      'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_SHALLOW_FILE', 'GIT_NAMESPACE',
    ];
    for (const name of redirects) process.env[name] = '/somewhere/else';
    const env = gitEnv();
    for (const name of redirects) expect(env, name).not.toHaveProperty(name);
    expect(process.env.GIT_DIR).toBe('/somewhere/else'); // the process's own environment is not touched
  });

  it('keeps the rest of the environment, and is the one work-write.js re-exports', () => {
    expect(gitEnv().PATH).toBe(process.env.PATH);
    expect(workWrite.gitEnv).toBe(gitEnv);
  });
});
