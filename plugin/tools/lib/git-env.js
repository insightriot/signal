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
//   the repository git would use from `baseDir` is not a `.git`
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
//   commit's parents the same way, and is not read either.
// - the variables that point git somewhere else are not inherited
//   (`REDIRECTS`, r6.1): with `GIT_DIR` and its like set by whatever started
//   Signal, git would not look at `baseDir` at all, and
//   `GIT_CONFIG_PARAMETERS` carries settings (`-c core.fsmonitor=…`) with it.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

const REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_PARAMETERS', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY'];

// A git directory that cannot exist: `/dev/null` is not a folder.
const NO_REPOSITORY = '/dev/null/not-a-repository';

/**
 * For tests only. No git older than 2.38 is installed where the suite runs,
 * so `tests/git-env-old-git.test.js` sets `withoutBareRepositorySetting` to
 * leave `safe.bareRepository` out of the environment — which is all an old
 * git makes of it — and shows that `gitEnv(baseDir)` still turns git away.
 * Nothing in Signal sets it.
 */
export const testSeam = { withoutBareRepositorySetting: false };

function baseEnv() {
  const env = { ...process.env };
  for (const name of REDIRECTS) delete env[name];
  if (testSeam.withoutBareRepositorySetting) return { ...env, GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null' };
  const inherited = Number(env.GIT_CONFIG_COUNT);
  const n = Number.isInteger(inherited) && inherited > 0 ? inherited : 0;
  return {
    ...env,
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_GRAFT_FILE: '/dev/null',
    GIT_CONFIG_COUNT: String(n + 1),
    [`GIT_CONFIG_KEY_${n}`]: 'safe.bareRepository',
    [`GIT_CONFIG_VALUE_${n}`]: 'explicit',
  };
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
  if (baseDir !== undefined && repositoryWithoutDotGit(baseDir, env)) env.GIT_DIR = NO_REPOSITORY;
  return env;
}

/**
 * Would git, run in `baseDir`, use a repository that is not a `.git` — a
 * folder that only looks like one?
 *
 * Git looks in each folder from `baseDir` upward: first for a `.git`, then at
 * whether the folder itself is laid out as a repository, which takes an entry
 * named `HEAD` in it. So when the walk up reaches a `.git` and no folder on
 * the way holds a `HEAD`, the answer is no and git is not asked — the usual
 * case, at the cost of a few `stat`s. Only when a `HEAD` is met first is git
 * asked which directory it found (`rev-parse --git-dir`, which reads the
 * repository's format and runs nothing a `config` names), and the answer
 * is yes unless that directory is a `.git` or lies inside one (a linked
 * worktree, `.git/worktrees/<name>`; a submodule, `.git/modules/<name>`).
 * A path named `.git` cannot be committed, so a planted layout is never one.
 *
 * Nothing is remembered between calls: a folder may become a repository.
 *
 * @param {string} baseDir
 * @param {Record<string, string>} [env] — the environment git is asked with
 * @returns {boolean} false too when there is no repository at all, or git cannot be asked
 */
export function repositoryWithoutDotGit(baseDir, env = baseEnv()) {
  if (!headBeforeDotGit(baseDir)) return false;
  let found;
  try {
    // `--git-dir` (every git has it) prints `.` for the folder itself, so the
    // answer is resolved against `baseDir`.
    found = resolve(baseDir, String(execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: PROBE_TIMEOUT_MS, env,
    })).trim());
  } catch (err) {
    // Git that knows `safe.bareRepository` refuses the folder, and names the
    // setting when it does: a yes. So is a probe that did not answer at all
    // (killed at the time limit). Anything else is git saying there is no
    // repository, which the call itself will be told too.
    return err?.signal != null || err?.code === 'ETIMEDOUT' || String(err?.stderr ?? '').includes('safe.bareRepository');
  }
  return !(basename(found) === '.git' || found.includes(`${sep}.git${sep}`));
}

const PROBE_TIMEOUT_MS = 5000;

// Walking up from `dir`: is a folder holding a `HEAD` met before (or in) the
// first folder holding a `.git`? False at the top with neither.
function headBeforeDotGit(dir) {
  let at = resolve(dir);
  for (;;) {
    if (existsSync(join(at, 'HEAD'))) return true;
    if (existsSync(join(at, '.git'))) return false;
    const up = dirname(at);
    if (up === at) return false;
    at = up;
  }
}
