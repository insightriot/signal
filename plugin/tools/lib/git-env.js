// The environment of every git call Signal makes (M6.E16 r6).
//
// A leaf module — it imports no other Signal module — so every module that
// runs git can import it without a cycle. `tests/git-env-inventory.test.js`
// fails when a git (or `gh`) call under `plugin/tools` or `plugin/hooks` does
// not carry it.
//
// The threat: a project can live in a subfolder of a larger repository, and a
// folder that merely holds `HEAD`, `config`, `objects/` and `refs/` —
// committed into that subfolder — is taken by git, run from there, for a
// repository of its own. Git then reads the committed `config`, where
// `core.fsmonitor` is a command run at `git status`.
//
// - `safe.bareRepository=explicit` stops it: git refuses a repository it
//   finds without a `.git`. Git reads this setting only from the user's or
//   system's configuration or from the command's own, never from a
//   repository's — the environment is the command's own. Appended to any
//   `GIT_CONFIG_COUNT` already in the environment, so the caller's own
//   settings stay.
// - Git older than 2.38 does not know the setting and ignores it. Signal does
//   not try to do git's search for it (r6.4: a look of its own, built for
//   those versions, was wrong seven times in three rounds). It asks git's
//   version, once, and on an older git — or one it cannot read the version of
//   — runs NO git-backed check: `gitEnv` then throws instead of returning an
//   environment, which every call evaluates before it starts a process, so no
//   git process is started; the error is shaped like git's own "not a git
//   repository" failure, which every caller already handles; and
//   `gitUnusableReason` says why in plain words for the callers that tell
//   the user.
//
// And, for every call:
//
// - `GIT_NO_REPLACE_OBJECTS`: replace refs are not honoured (REVIEW pass 1,
//   S-L5). `git replace` can make a commit on the default branch stand for
//   another whose parent is unmerged work, and the ancestry question would
//   then answer yes for a commit nobody merged.
// - `GIT_GRAFT_FILE=/dev/null`: a grafts file (`info/grafts`) rewrites a
//   commit's parents the same way, and is not read either. Git answers a
//   grafts file it is pointed at with a few lines of advice on stderr, on
//   calls that succeed; `advice.graftFileDeprecated=false` keeps them out of
//   what a caller reads or a user sees (r6.3).
// - the variables that point git somewhere else are not inherited
//   (`REDIRECTS`, r6.1): with `GIT_DIR` and its like set by whatever started
//   Signal, git would not look at the folder it is run in at all,
//   `GIT_CONFIG_PARAMETERS` carries settings (`-c core.fsmonitor=…`) with it,
//   and the last three change which objects and refs an ancestry question is
//   answered from.

import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REDIRECTS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_PARAMETERS', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_SHALLOW_FILE', 'GIT_NAMESPACE',
];

/** The first git that knows `safe.bareRepository`. */
export const GIT_NEEDED = Object.freeze({ major: 2, minor: 38 });

/**
 * For tests only; nothing in Signal sets it. `gitVersion`: what
 * `git --version` is taken to have printed — a string, or `null` for "git
 * could not be run" — instead of asking the installed git. `undefined`
 * (the default) asks it.
 */
export const testSeam = { gitVersion: undefined };

const VERSION_TIMEOUT_MS = 5000;
let asked; // what `git --version` printed (null: it could not be run); undefined until asked

// `git --version`, once for the process. Run from the top of the disk, with
// nothing in its environment but where programs are: it is not run in the
// project, so no repository is looked for there and no configuration of the
// project's is read — git looks for a pager setting even for this command,
// and would read a repository's `config` to find one.
function versionLine() {
  if (testSeam.gitVersion !== undefined) return testSeam.gitVersion;
  if (asked === undefined) {
    try {
      asked = String(execFileSync('git', ['--version'], {
        cwd: '/',
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: VERSION_TIMEOUT_MS,
        env: { PATH: process.env.PATH ?? '', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      }));
    } catch {
      asked = null;
    }
  }
  return asked;
}

// `git version 2.39.3 (Apple Git-146)`, `git version 2.42.0.windows.1`,
// `git version 2.38`: the two numbers, read strictly — the words, then
// digits, a dot, digits, then the end, a dot or a space. Anything else is
// not a version Signal can read.
const VERSION_RE = /^git version (\d{1,4})\.(\d{1,4})(?:$|[. ])/;

/**
 * Why Signal runs no git-backed check with the git that is installed, in
 * words for a person — or null when it does (git 2.38 or newer).
 *
 * @returns {string|null}
 */
export function gitUnusableReason() {
  const line = versionLine();
  const need = `Signal needs git ${GIT_NEEDED.major}.${GIT_NEEDED.minor} or newer for its git-backed checks`;
  if (line === null) return `${need}; git could not be run here`;
  const first = line.split('\n')[0].trim();
  const m = VERSION_RE.exec(first);
  if (m === null) return `${need}; the version of the git installed here could not be read`;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  if (major > GIT_NEEDED.major || (major === GIT_NEEDED.major && minor >= GIT_NEEDED.minor)) return null;
  return `${need}; this is git ${first.slice('git version '.length).split(' ')[0]}`;
}

// Is there an entry named `.git` in `baseDir` or a folder above it? Only ever
// used to choose between refusing and treating the folder as no repository
// when git cannot be run at all — never to decide what git may read.
/**
 * What `git-failed` means, and what to do (M6.E16 r7.1): git was there and
 * could not read this repository — not "no repository", not "not merged".
 * One sentence for the confirm line, the sweep, the hand-confirm refusal and
 * the branch gate.
 */
export const GIT_FAILED = 'git could not read the repository — a broken config, a `.git` pointing nowhere, a folder git does not trust — '
  + 'fix that and run the confirm again';

// Exported for `defaultBranchRef` (`work-write.js`, M6.E16 r7.1), which asks
// the same question before it reads a failed git call as "no repository".
export function dotGitAtOrAbove(baseDir) {
  for (let dir = resolve(String(baseDir)); ; dir = dirname(dir)) {
    if (lstatSync(join(dir, '.git'), { throwIfNoEntry: false }) !== undefined) return true;
    if (dirname(dir) === dir) return false;
  }
}

/**
 * Why git could NOT BE ASKED about `baseDir` — which is not the same as
 * "this is not a repository" (M6.E16 r6.5). Null when it can be asked.
 *
 * A git that is too old, or whose version cannot be read: always the reason
 * — there may be a repository, and nothing may conclude there is none. No
 * git at all: the reason when a `.git` entry is at or above the folder (a
 * repository somebody made, which Signal must not write past unasked); null
 * when there is none, where the folder is treated as no repository, as it
 * was before the gate.
 *
 * A caller that WRITES, or that would weaken a check, on "no repository"
 * asks this first and refuses with what it returns.
 *
 * @param {string} baseDir
 * @returns {string|null}
 */
export function gitCannotAsk(baseDir) {
  const reason = gitUnusableReason();
  if (reason === null) return null;
  if (versionLine() !== null) return reason;
  let found;
  try {
    found = dotGitAtOrAbove(baseDir);
  } catch {
    found = true; // the folders above could not be read: the safe side
  }
  return found ? reason : null;
}

/**
 * The environment for a git call run in `baseDir`.
 *
 * Pass the folder the call runs in (its `cwd`); `git init`, which runs where
 * no repository is yet, passes none. The folder is not looked at — it is
 * named so that every call says where it runs, which the inventory test
 * holds every call to.
 *
 * @param {string} [baseDir]
 * @returns {Record<string, string>}
 * @throws {Error} `GitUnusableError` (see `unusable`) when the installed git is older than 2.38, or its
 *   version cannot be read: the call that asked for the environment then starts no process
 */
// eslint-disable-next-line no-unused-vars -- the folder is part of every call's shape (see above)
export function gitEnv(baseDir) {
  const reason = gitUnusableReason();
  if (reason !== null) throw unusable(reason);
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null' };
  for (const name of REDIRECTS) delete env[name];
  const inherited = Number(env.GIT_CONFIG_COUNT);
  let n = Number.isInteger(inherited) && inherited > 0 ? inherited : 0;
  for (const [key, value] of [['advice.graftFileDeprecated', 'false'], ['safe.bareRepository', 'explicit']]) {
    env[`GIT_CONFIG_KEY_${n}`] = key;
    env[`GIT_CONFIG_VALUE_${n}`] = value;
    n += 1;
  }
  env.GIT_CONFIG_COUNT = String(n);
  return env;
}

// What a git call is refused with when the installed git is one Signal runs
// no check on. It is thrown from `gitEnv`, which every call evaluates BEFORE
// it starts a process — so no git process is started at all, in the project
// folder or anywhere — and it is shaped like git's own failure for "no
// repository here" (`status` 128, the words on `stderr`), which every caller
// already handles as it handles a failed git call.
function unusable(reason) {
  const err = new Error(reason);
  err.name = 'GitUnusableError';
  err.status = 128;
  err.stderr = `fatal: not a git repository: ${reason}`;
  return err;
}
