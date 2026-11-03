// The Signal project a folder belongs to: the nearest folder at or above it with a
// `.planning/STATE.md`, up to the git top level (a Signal project can sit in a subfolder of its
// repository). Shared by the hooks; null when there is none or git cannot say.

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';

import { gitEnv } from '../tools/lib/git-env.js';

const realpathLoose = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};
const isInside = (dir, top) => {
  const rel = relative(realpathLoose(top), realpathLoose(dir));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** @returns {{root: string, state: string} | null} the project folder and its STATE.md text */
export function findProjectRoot(cwd) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, env: gitEnv(cwd), encoding: 'utf8' });
  if (top.status !== 0) return null;
  const gitTop = top.stdout.trim();
  let root = cwd;
  for (;;) {
    try {
      return { root, state: readFileSync(join(root, '.planning', 'STATE.md'), 'utf8') };
    } catch {
      const up = dirname(root);
      if (up === root || !isInside(up, gitTop)) return null;
      root = up;
    }
  }
}

/** The `phase:` in STATE.md's frontmatter (CRLF accepted), or undefined. */
export const statePhase = (state) => state.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].match(/^phase:\s*['"]?(\w+)/m)?.[1];
