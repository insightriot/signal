// The project whose records the slim checks read: the nearest folder at or above `cwd` that has a
// `.planning/BACKLOG.md`, up to the git top level. Unlike `project-root.js` it needs no STATE.md
// and no phase, so it works on a project that keeps plain `.md` records and nothing else. Also the
// per-session note the two checks share.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';

import { gitEnv } from '../tools/lib/git-env.js';

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** @returns {string|null} the project folder */
export function findRecordsRoot(cwd) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, env: gitEnv(cwd), encoding: 'utf8' });
  if (top.status !== 0) return null;
  const gitTop = real(top.stdout.trim());
  let dir = real(cwd);
  for (;;) {
    if (existsSync(join(dir, '.planning', 'BACKLOG.md'))) return dir;
    const rel = relative(gitTop, dir);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
    dir = dirname(dir);
  }
}

export const readOr = (p, fallback = '') => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return fallback;
  }
};

/** The records the checks compare: BACKLOG.md and BUGS.md, joined. */
export const recordsText = (root) => readOr(join(root, '.planning', 'BACKLOG.md')) + '\n' + readOr(join(root, '.planning', 'BUGS.md'));

/** Where the before-check leaves its note for the after-check, per session and project. */
export const notePath = (sessionId, root) =>
  join(tmpdir(), `signal-build-note-${createHash('sha256').update(`${sessionId}\0${root}`).digest('hex').slice(0, 16)}.json`);
