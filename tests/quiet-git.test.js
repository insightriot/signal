// M6.E16 r6.2 — no git process the suite starts does housekeeping
// (`tests/helpers/quiet-git.js`, a setup file: see there for why).
//
// The failure it prevents came and went, because the repack ran in the
// background. Here it is made certain: a repository set to pack as soon as it
// holds ONE loose object, and to do it before `git commit` returns. Without
// the setup file the commit leaves a pack behind; with it, none — the
// environment's settings win over the repository's.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { gitEnv } from '../plugin/tools/lib/git-env.js';
import { snapshotTree } from './helpers/write-inventory.js';

const git = (cwd, args, env = process.env) => {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sig-quiet-git-'));
  git(dir, ['init', '-q', '-b', 'main']);
  // As eager as git can be made: pack at one loose object, and not in the background.
  git(dir, ['config', 'gc.auto', '1']);
  git(dir, ['config', 'gc.autoDetach', 'false']);
  git(dir, ['config', 'maintenance.auto', 'true']);
  git(dir, ['config', 'maintenance.autoDetach', 'false']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const packs = () => readdirSync(join(dir, '.git', 'objects', 'pack')).filter((f) => f.endsWith('.pack'));
// Git decides whether to pack by counting the loose objects whose name starts
// `17` (one folder of the 256, as a sample). So: files whose blobs land there.
function sampledContent(count) {
  const out = [];
  for (let i = 0; out.length < count; i += 1) {
    const body = `sample ${i}\n`;
    if (createHash('sha1').update(`blob ${Buffer.byteLength(body)}\0${body}`).digest('hex').startsWith('17')) out.push(body);
  }
  return out;
}
function commitSomeFiles(env = process.env) {
  sampledContent(3).forEach((body, i) => writeFileSync(join(dir, `f${i}.txt`), body));
  git(dir, ['add', '-A'], env);
  git(dir, ['commit', '-q', '-m', 'files'], env);
}

describe('git does no housekeeping in the suite', () => {
  it('the settings are in the environment every git process inherits, and in the one Signal builds', () => {
    expect(git(dir, ['config', '--get', 'gc.auto'])).toBe('0');
    expect(git(dir, ['config', '--get', 'maintenance.auto'])).toBe('false');
    expect(git(dir, ['config', '--get', 'gc.auto'], gitEnv(dir))).toBe('0');
    expect(git(dir, ['config', '--get', 'maintenance.auto'], gitEnv(dir))).toBe('false');
  });

  it('a commit in a repository set to pack at once leaves no pack, and a tree read after it stays as it is', () => {
    commitSomeFiles();
    expect(packs()).toEqual([]);
    const before = snapshotTree(dir);
    git(dir, ['status', '--porcelain']);
    git(dir, ['log', '--oneline']);
    expect(snapshotTree(dir)).toEqual(before);
  });

  it('the control: without those settings the same commit packs — which is what a test used to see, some of the time', () => {
    const bare = { ...process.env };
    for (const k of Object.keys(bare)) if (/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$/.test(k)) delete bare[k];
    commitSomeFiles(bare);
    expect(packs().length).toBeGreaterThan(0);
  });
});
