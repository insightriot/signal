// M6.E16 r6.2 — git does no housekeeping behind a test's back.
//
// `git commit` (and merge, fetch, rebase) may start `git gc --auto` or
// `git maintenance run --auto` when it finishes — in the BACKGROUND. It packs
// loose objects and refs some time later, so a test that reads a repository's
// files before a call and after it ("nothing was written":
// `snapshotTree`, `tests/helpers/write-inventory.js`) sometimes saw
// `.git/objects/*` move though the call under test wrote nothing. That failed
// `tests/unit-close-head-proof.test.js` now and then on CI (git 2.55).
//
// Turned off here for every git process the suite starts, whoever starts it —
// a test's own helper or Signal's code — through the environment, which git
// reads as its own settings and which wins over a repository's `config`.
// Appended after any settings already in the environment. A test that builds
// an environment of its own for git, without `process.env`, does not get it.
//
// `tests/quiet-git.test.js` shows it holds, and what happens without it.
const settings = [['gc.auto', '0'], ['maintenance.auto', 'false']];
const inherited = Number(process.env.GIT_CONFIG_COUNT);
let n = Number.isInteger(inherited) && inherited > 0 ? inherited : 0;
for (const [key, value] of settings) {
  process.env[`GIT_CONFIG_KEY_${n}`] = key;
  process.env[`GIT_CONFIG_VALUE_${n}`] = value;
  n += 1;
}
process.env.GIT_CONFIG_COUNT = String(n);
