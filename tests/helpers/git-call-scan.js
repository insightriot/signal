// The scan behind `tests/git-env-inventory.test.js` (M6.E16 r6.2): which git
// (or `gh`) calls in a source file do not carry the shared environment
// (`gitEnv`, `plugin/tools/lib/git-env.js`).
//
// It reads the file's SYNTAX TREE, not its text (the parser is the one eslint
// brings, found through eslint so the test names no package of its own). The
// first version matched text, and passed every one of these:
// `env: process.env /* gitEnv() */` (the name in a comment), a second `env:`
// after the first, `'/usr/bin/git'`, a command held in a constant, the
// arguments in a spread, `envv:` for `env:`, and git inside a shell string.
//
// The rules, for a `.js` file:
//
//   1. Only `execFileSync`, `spawnSync`, `execFile` and `spawn` may be
//      imported from `child_process`, by those names, in an `import`
//      statement. `exec` and `execSync` run a shell string, where a command
//      cannot be read; any other way to reach the module (a namespace import,
//      `require`, `import()`) cannot be followed. And no call may pass
//      `shell:` anything but `false`.
//   2. A call is a GIT CALL when its first argument is the text `git` or
//      `gh`, or a path to one (`/usr/bin/git`, `git.exe`) — under any callee:
//      `execFileSync`, an injected `execFn`, a local wrapper.
//   3. A git call must write its options in the call, as an object, with
//      EXACTLY ONE key spelt `env`, nothing spread after it, and for its
//      value `gitEnv(<folder>)` itself or an object that begins
//      `...gitEnv(<folder>)`. Where the options name `cwd`, the folder is
//      that one. `gitEnv()` with no folder is for `git init` alone.
//   4. Nothing may stand in for the command: a variable or constant given the
//      text `git`/`gh` and passed as a first argument, the arguments of an
//      exec or spawn call in a spread, a string that begins `git ` or `gh `
//      passed as a first argument.
//   5. A file with a git call imports `gitEnv` from `git-env.js` (or
//      `work-write.js`, which re-exports it) and declares no `gitEnv` of its own.
//
// What it still cannot see is said in the test's header.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = createRequire(require.resolve('eslint'))('espree');

const SAFE_IMPORTS = new Set(['execFileSync', 'spawnSync', 'execFile', 'spawn']);
const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);
const ENV_SOURCE = /(?:^|\/)(?:git-env|work-write)\.js$/;
const COMMAND = /(?:^|[\\/])(?:git|gh)(?:\.exe)?$/i;
const SHELL_COMMAND = /^\s*(?:git|gh)\s/;
const EXEC_NAME = /exec|spawn/i;

// The text of a string or of a template with nothing computed in it, else null.
function textOf(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}
const isCommand = (node) => {
  const text = textOf(node);
  return text !== null && COMMAND.test(text);
};
const keyOf = (prop) => (prop.type !== 'Property' || prop.computed ? null : prop.key.type === 'Identifier' ? prop.key.name : textOf(prop.key));
const calleeName = (node) => (node.callee.type === 'Identifier' ? node.callee.name
  : node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier' ? node.callee.property.name : '');
const isGitEnvCall = (node) => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'gitEnv';

function* nodes(node) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) yield* nodes(n);
    return;
  }
  if (typeof node.type === 'string') yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'range' && value !== null && typeof value === 'object') yield* nodes(value);
  }
}

/**
 * The git calls in `source` that do not carry the shared environment, and the
 * ways around the scan that it holds.
 *
 * @param {string} source — a file's text
 * @param {{shell?: boolean}} [opts] — `shell`: a shell script, where any git command counts
 * @returns {Array<{line: number, why: string}>}
 */
export function unprotectedGitCalls(source, { shell = false } = {}) {
  if (shell) {
    return source.split('\n')
      .map((l, i) => ({ line: i + 1, text: l.replace(/(^|\s)#.*$/, '') }))
      .filter((l) => /(^|[\s;&|(`])(?:git|gh)\s+[a-z-]/.test(l.text))
      .map((l) => ({ line: l.line, why: 'a shell script runs git, where the environment cannot be checked' }));
  }
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true, range: true });
  const text = (node) => source.slice(node.range[0], node.range[1]);
  const out = [];
  const say = (node, why) => out.push({ line: node.loc.start.line, why });
  const all = [...nodes(tree)];

  // 1. how child_process is reached, and no shell
  const importSources = new Set();
  for (const n of all) {
    if (n.type === 'ImportDeclaration' && CHILD_PROCESS.has(n.source.value)) {
      importSources.add(n.source);
      for (const s of n.specifiers) {
        if (s.type !== 'ImportSpecifier' || !SAFE_IMPORTS.has(s.imported.name) || s.local.name !== s.imported.name) {
          say(s, `\`${text(s)}\` from child_process: only execFileSync, spawnSync, execFile and spawn, under their own names — a shell string, or a module reached another way, cannot be checked`);
        }
      }
    }
  }
  for (const n of all) {
    if (textOf(n) !== null && CHILD_PROCESS.has(textOf(n)) && !importSources.has(n)) say(n, 'child_process is reached without an `import` statement, where its calls cannot be followed');
    if (n.type === 'Property' && keyOf(n) === 'shell' && !(n.value.type === 'Literal' && n.value.value === false)) say(n, '`shell:` is set: the command would be a shell string');
  }

  // 4. names that hold the command
  const held = new Set();
  for (const n of all) {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && isCommand(n.init)) held.add(n.id.name);
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && isCommand(n.right)) held.add(n.left.name);
  }

  let gitCalls = 0;
  for (const n of all) {
    if (n.type !== 'CallExpression' && n.type !== 'NewExpression') continue;
    const [first, second] = n.arguments;
    if (first === undefined) continue;
    if (first.type === 'SpreadElement' && EXEC_NAME.test(calleeName(n))) {
      say(n, 'the arguments are a spread: the command cannot be read');
      continue;
    }
    if (first.type === 'Identifier' && held.has(first.name)) {
      say(n, `the command is held in \`${first.name}\`: write \`'git'\` in the call`);
      continue;
    }
    if (textOf(first) !== null && SHELL_COMMAND.test(textOf(first))) {
      say(n, 'git is run as a shell string');
      continue;
    }
    if (!isCommand(first)) continue;
    gitCalls += 1;

    // 3. the options
    const options = n.arguments.slice(1).filter((a) => a.type === 'ObjectExpression');
    if (options.length !== 1 || n.arguments.slice(1).some((a) => a.type === 'SpreadElement')) {
      say(n, 'the call does not pass `gitEnv()`: its options are not one object written in the call');
      continue;
    }
    const props = options[0].properties;
    const envAt = props.map((p, i) => (keyOf(p) === 'env' ? i : -1)).filter((i) => i !== -1);
    if (envAt.length === 0) {
      say(n, 'the call does not pass `gitEnv()`: its options have no `env` key');
      continue;
    }
    if (envAt.length > 1) {
      say(n, 'the options have more than one `env` key: the last one wins');
      continue;
    }
    if (props.slice(envAt[0] + 1).some((p) => p.type === 'SpreadElement')) {
      say(n, 'something is spread after `env`, and could replace it');
      continue;
    }
    const value = props[envAt[0]].value;
    const call = isGitEnvCall(value) ? value
      : value.type === 'ObjectExpression' && value.properties[0]?.type === 'SpreadElement' && isGitEnvCall(value.properties[0].argument)
        ? value.properties[0].argument : null;
    if (call === null) {
      say(n, 'the call does not pass `gitEnv()`: `env` is neither `gitEnv(<folder>)` nor an object that begins `...gitEnv(<folder>)`');
      continue;
    }
    if (call.arguments.length === 0) {
      const init = second?.type === 'ArrayExpression' && textOf(second.elements[0]) === 'init' && textOf(first) === 'git';
      if (!init) say(n, '`gitEnv()` is given no folder, and the call is not `git init`');
      continue;
    }
    const cwd = props.find((p) => keyOf(p) === 'cwd');
    if (cwd !== undefined && text(cwd.value) !== text(call.arguments[0])) {
      say(n, `\`gitEnv(${text(call.arguments[0])})\` looks at another folder than the call runs in (\`cwd: ${text(cwd.value)}\`)`);
    }
  }

  // 5. the shared `gitEnv`, and no other
  if (gitCalls > 0) {
    const imported = all.some((n) => n.type === 'ImportDeclaration' && ENV_SOURCE.test(n.source.value)
      && n.specifiers.some((s) => s.type === 'ImportSpecifier' && s.imported.name === 'gitEnv' && s.local.name === 'gitEnv'));
    const local = all.some((n) => (n.type === 'VariableDeclarator' || n.type === 'FunctionDeclaration') && n.id?.type === 'Identifier' && n.id.name === 'gitEnv');
    if (!imported || local) say(tree, '`gitEnv` is not imported from git-env.js (or work-write.js)');
  }
  return out.sort((a, b) => a.line - b.line);
}

/** How many git calls `source` makes (rule 2), for a test that the scan is not passing over nothing. */
export function countGitCalls(source) {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  return [...nodes(tree)].filter((n) => (n.type === 'CallExpression' || n.type === 'NewExpression') && isCommand(n.arguments[0])).length;
}
