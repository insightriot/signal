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
// `core.fsmonitor` is a command run at `git status`. Two things stop it:
//
// - `safe.bareRepository=explicit`: git refuses a repository it finds without
//   a `.git`. Git reads this setting only from the user's or system's
//   configuration or from the command's own, never from a repository's — the
//   environment is the command's own. Appended to any `GIT_CONFIG_COUNT`
//   already in the environment, so the caller's own settings stay.
//   Git older than 2.38 does not know the setting and ignores it, so:
// - `gitEnv(baseDir)` looks for itself (r6.1), whatever the git version. When
//   the repository git would use from `baseDir` is such a folder
//   (`repositoryWithoutDotGit`), the environment it returns names a git
//   directory that cannot exist (`GIT_DIR`), and every git command given it
//   fails with "not a git repository" before reading any configuration.
//   Every caller already takes that failure for "no repository here".
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
//   Signal, git would not look at `baseDir` at all, `GIT_CONFIG_PARAMETERS`
//   carries settings (`-c core.fsmonitor=…`) with it, and the last three
//   change which objects and refs an ancestry question is answered from.

import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

const REDIRECTS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_PARAMETERS', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_SHALLOW_FILE', 'GIT_NAMESPACE',
];

// Git directories that cannot exist (`/dev/null` is not a folder). The name
// is what git's own error then shows, where a caller prints it.
const NO_REPOSITORY = '/dev/null/not-a-repository';
const NO_ANSWER = '/dev/null/git-did-not-answer-in-time';

/**
 * For tests only; nothing in Signal sets either.
 *
 * `withoutBareRepositorySetting`: no git older than 2.38 is installed where
 * the suite runs, so `tests/git-env-planted-bare-repo.test.js` leaves
 * `safe.bareRepository` out of the environment — which is all an old git
 * makes of it — and shows that `gitEnv(baseDir)` still turns git away.
 * `asked`: how many times git has been asked where a folder's repository is
 * (`repositoryWithoutDotGit`), so a test can see that an answer was reused.
 */
export const testSeam = { withoutBareRepositorySetting: false, asked: 0 };

// `env` with these settings appended to the ones already in it.
function withSettings(env, settings) {
  const inherited = Number(env.GIT_CONFIG_COUNT);
  let n = Number.isInteger(inherited) && inherited > 0 ? inherited : 0;
  const out = { ...env };
  for (const [key, value] of settings) {
    out[`GIT_CONFIG_KEY_${n}`] = key;
    out[`GIT_CONFIG_VALUE_${n}`] = value;
    n += 1;
  }
  out.GIT_CONFIG_COUNT = String(n);
  return out;
}

// The environment without `safe.bareRepository`: what the look is made with.
function cleanEnv() {
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null' };
  for (const name of REDIRECTS) delete env[name];
  return withSettings(env, [['advice.graftFileDeprecated', 'false']]);
}

function baseEnv() {
  const env = cleanEnv();
  return testSeam.withoutBareRepositorySetting ? env : withSettings(env, [['safe.bareRepository', 'explicit']]);
}

/**
 * The environment for a git call run in `baseDir`.
 *
 * Pass the folder the call runs in (its `cwd`). Without one nothing is looked
 * at — for `git init` only, which runs where no repository is yet.
 *
 * @param {string} [baseDir]
 * @returns {Record<string, string>}
 */
export function gitEnv(baseDir) {
  const env = baseEnv();
  if (baseDir === undefined) return env;
  const found = look(baseDir);
  if (found !== 'no') env.GIT_DIR = found === 'planted' ? NO_REPOSITORY : NO_ANSWER;
  return env;
}

/**
 * Would git, run in `baseDir`, use a repository that is not a `.git` — a
 * folder that only looks like one? (Also yes when git did not answer the
 * question in time: the call is then turned away too, see `gitEnv`.)
 *
 * GIT IS ASKED, always (r6.3): `rev-parse --git-dir`, which reads the
 * repository's format and runs nothing a `config` names. A walk of the
 * folders that tried to answer without asking was wrong twice — git reads
 * `HEAD` without following a link, walks the real path and not the written
 * one, and passes over a `.git` that is no repository — and cannot be made
 * equal to git's own search in a few lines.
 *
 * The answer is read from WHERE the directory git reports is, never from
 * whether git refused (versions differ) nor from its name alone. A planted
 * layout is found by git walking UP from the folder, so the git directory is
 * the folder itself or a folder above it — and is not a `.git`, nor inside
 * one. That is the yes. A real git directory that is not called `.git` lies
 * somewhere else — a worktree of a bare repository (`bare.git/worktrees/x`),
 * `git init --separate-git-dir`, a `.git` that is a link — and is reached
 * through a `.git` entry, which no repository can carry in its files: no.
 * From inside a bare repository the answer is yes; Signal has no business
 * there.
 *
 * The answer is remembered for the life of the process, for the real path of
 * `baseDir` AND for what the folders from there to the top hold that git's
 * search looks at (`searchPrint`): when a folder becomes a repository, or
 * stops being one, that changes and git is asked again.
 *
 * @param {string} baseDir
 * @returns {boolean} false too when there is no repository at all, or git cannot be asked
 */
export function repositoryWithoutDotGit(baseDir) {
  return look(baseDir) !== 'no';
}

const PROBE_TIMEOUT_MS = 5000;
const remembered = new Map();

// 'no', 'planted', or 'timeout' (git did not answer: turned away as well).
function look(baseDir) {
  const real = physical(resolve(baseDir));
  const print = searchPrint(real);
  const was = remembered.get(real);
  if (was?.print === print) return was.answer;
  const answer = ask(baseDir, real);
  remembered.set(real, { print, answer });
  return answer;
}

function ask(baseDir, real) {
  testSeam.asked += 1;
  let found;
  try {
    // Asked WITHOUT `safe.bareRepository` (`cleanEnv`), so that every git
    // reports the directory it found and none refuses instead. `--git-dir`
    // (every git has it) prints `.` for the folder itself, `.git` at the top
    // of a work tree and a full path below it, so the answer is resolved
    // against the folder.
    found = physical(resolve(real, String(execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: PROBE_TIMEOUT_MS, env: cleanEnv(),
    })).trim()));
  } catch (err) {
    // Git says there is no repository (or cannot be run), which the call
    // itself will be told too. A probe killed at the time limit did not
    // answer: the call is turned away, and told so.
    return err?.signal != null || err?.code === 'ETIMEDOUT' ? 'timeout' : 'no';
  }
  const above = found === real || real.startsWith(found.endsWith(sep) ? found : found + sep);
  return above && !underDotGit(found) ? 'planted' : 'no';
}

// The real path, or the path as given when it does not resolve.
function physical(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

// Is `abs` a `.git`, or inside one (a linked worktree, `.git/worktrees/<name>`;
// a submodule, `.git/modules/<name>`; a `hooks` folder)?
const underDotGit = (abs) => basename(abs) === '.git' || abs.includes(`${sep}.git${sep}`);

// What git's search looks at, from `real` to the top, as one string: in each
// folder the `.git` entry and the `HEAD` entry, each by what it is (never
// following a link), its number, its size and when it last changed — and,
// where either is there, the same for the folder itself and for what makes a
// folder a repository (`objects`, `refs`, and inside a `.git` folder its own
// `HEAD`). `git init`, a removed `.git`, a planted layout appearing or going:
// each changes it.
function searchPrint(real) {
  const of = (path) => {
    try {
      const s = lstatSync(path, { bigint: true });
      return `${s.mode}/${s.ino}/${s.size}/${s.mtimeNs}`;
    } catch (err) {
      return err?.code ?? 'error';
    }
  };
  const parts = [];
  for (let at = real; ; at = dirname(at)) {
    const [dotGit, head] = [of(join(at, '.git')), of(join(at, 'HEAD'))];
    parts.push(dotGit, head);
    if (dotGit !== 'ENOENT' || head !== 'ENOENT') {
      parts.push(of(at), of(join(at, 'objects')), of(join(at, 'refs')), of(join(at, '.git', 'HEAD')));
    }
    if (dirname(at) === at) break;
  }
  return parts.join('|');
}
