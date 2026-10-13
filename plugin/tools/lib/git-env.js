// The environment of every git call Signal makes (M6.E16 r6).
//
// A leaf module — it imports nothing — so every module that runs git can
// import it without a cycle. `tests/git-env-inventory.test.js` fails when a
// git call under `plugin/tools` or `plugin/hooks` does not carry it.
//
// - `safe.bareRepository=explicit`: git refuses a repository it finds without
//   a `.git` — a folder that merely holds `HEAD`, `config`, `objects/` and
//   `refs/`. A project can live in a subfolder of a larger repository, and
//   those four names committed into that subfolder would otherwise make git
//   read the committed `config`, where `core.fsmonitor` is a command run at
//   `git status`. Git reads this setting only from the user's or system's
//   configuration or from the command's own, never from a repository's — the
//   environment is the command's own. Appended to any `GIT_CONFIG_COUNT`
//   already in the environment, so the caller's own settings stay.
//   Git older than 2.38 does not know the setting and ignores it.
// - `GIT_NO_REPLACE_OBJECTS`: replace refs are not honoured (REVIEW pass 1,
//   S-L5). `git replace` can make a commit on the default branch stand for
//   another whose parent is unmerged work, and the ancestry question would
//   then answer yes for a commit nobody merged.
// - `GIT_GRAFT_FILE=/dev/null`: a grafts file (`info/grafts`) rewrites a
//   commit's parents the same way, and is not read either.
export function gitEnv() {
  const inherited = Number(process.env.GIT_CONFIG_COUNT);
  const n = Number.isInteger(inherited) && inherited > 0 ? inherited : 0;
  return {
    ...process.env,
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_GRAFT_FILE: '/dev/null',
    GIT_CONFIG_COUNT: String(n + 1),
    [`GIT_CONFIG_KEY_${n}`]: 'safe.bareRepository',
    [`GIT_CONFIG_VALUE_${n}`]: 'explicit',
  };
}
