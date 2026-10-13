// Two git reads that more than one module needs (M6.E16 r6.1): `runGit` and
// `commitsStartingWith`.
//
// They lived in `work-write.js` and are moved, not rewritten; `work-write.js`
// re-exports both, so its importers are as they were. They are here because
// `work-ops.js` needs the second (`explicitCommit`) and may not import
// `work-write.js` — only a module that owns a record kind may
// (`tests/work-record-writers.test.js`). This one imports `git-env.js` only.

import { gitEnv } from './git-env.js';

const GIT_MAX_BUFFER = 256 * 1024 * 1024;

export function runGit(baseDir, args, execFn) {
  return String(execFn('git', args, { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER, env: gitEnv(baseDir) }));
}

// How many commit-like objects `prefix` abbreviates — commits, and tag objects
// that lead to a commit, which is what git counts when it resolves
// `<prefix>^{commit}`: two sharing the prefix make git call it ambiguous.
// 0 when git cannot say.
export function commitsStartingWith(baseDir, prefix, execFn) {
  let objects;
  try {
    objects = runGit(baseDir, ['rev-parse', `--disambiguate=${prefix}`], execFn).split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return 0;
  }
  // Each listed object once, counted when it is a commit or a tag (M6.E14
  // REVIEW pass 2: counting commits only accepted a proof git itself calls
  // ambiguous, which then could never confirm). Trees and blobs are not counted.
  // Two are enough to answer.
  let n = 0;
  for (const o of new Set(objects)) {
    try {
      const type = runGit(baseDir, ['cat-file', '-t', '--end-of-options', o], execFn).trim();
      // A tag counts only when it leads to a commit: git ignores one that
      // points at a blob or a tree when it resolves `<prefix>^{commit}` (REVIEW pass 3).
      if (type === 'commit') n += 1;
      else if (type === 'tag') {
        runGit(baseDir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${o}^{commit}`], execFn);
        n += 1;
      }
    } catch {
      // not inspectable: not counted
    }
    if (n > 1) break;
  }
  return n;
}
