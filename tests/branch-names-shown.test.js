// M6.E16 r6.1 — a branch or remote name reaches a message only through
// `shownName` (`printable-text.js`).
//
// Git allows a branch or a remote to be called almost anything: an em space,
// a right-to-left override (U+202E, which makes a terminal show the text after
// it backwards), a backtick. The name comes from whoever pushed the branch.
// In a message every character outside printable ASCII is written as its
// `\uXXXX` escape, so what a person reads is what is stored; the exact name
// stays in the structured result, for code that compares it.
//
// Real git, in temp folders. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import {
  BRANCH_GATE, checkBranchPosture, formatBranchHalt, formatBranchLine, formatBranchUnknown, readPullRequestEvidence,
} from '../plugin/tools/lib/branch-guard.js';
import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import { checkClosedProofs } from '../plugin/tools/lib/sweep.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';

// A backtick, an em space (U+2003) and a right-to-left override (U+202E).
const NAME = 'ma`in x‮y';
const SHOWN = 'ma`in\\u2003x\\u202ey';
const RAW = new RegExp('[\\u2003\\u202e]'); // either character as it is, unescaped
const AT = '2026-10-01T10:00:00.000Z';
const by = 'claude';
const EPIC = 'M7.E3';
const UNITS = '.planning/work/units';

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
let work;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-names-shown-'));
  work = join(root, 'work');
  await mkdir(work, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function put(rel, content) {
  const p = join(work, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
// A repository whose one branch is NAME, pushed to `origin`, which records it
// as the default branch. `unit`: a v2 store with the Epic's unit, committed first.
async function onDefaultBranch({ unit = null, remote = 'origin' } = {}) {
  g(work, 'init', '-q', '-b', NAME);
  if (unit) {
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put(`${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: unit }));
    await put(`.planning/${EPIC}-RETROSPECTIVE.md`, '# Retrospective\n\n## Timeline\n\nIt shipped.\n');
    await regenerateViews(work);
    g(work, 'add', '-A');
  }
  g(work, 'commit', '-q', '--allow-empty', '-m', 'c0');
  g(root, 'init', '-q', '--bare', '-b', NAME, join(root, 'remote.git'));
  g(work, 'remote', 'add', remote, join(root, 'remote.git'));
  g(work, 'push', '-q', '-u', remote, NAME);
  if (remote === 'origin') g(work, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${NAME}`);
  return g(work, 'rev-parse', 'HEAD');
}

describe('a branch name with an em space, a right-to-left override and a backtick', { timeout: 60_000 }, () => {
  it('the branch gate: the exact name in the result, the escaped one in every message', async () => {
    await onDefaultBranch();
    const posture = checkBranchPosture(work, { tier: 'FULL' });
    expect(posture).toMatchObject({ status: BRANCH_GATE.ON_DEFAULT, currentBranch: NAME, defaultBranch: NAME });
    expect(posture.reason).toBe(`HEAD is the default branch (${SHOWN})`);
    const halt = formatBranchHalt(posture, { command: '/sig:execute' });
    expect(halt).toContain(`HALT — you are on ${SHOWN}, the default branch.`);
    const overridden = checkBranchPosture(work, { tier: 'FULL', override: true });
    for (const text of [halt, formatBranchLine(posture), formatBranchLine(overridden)]) {
      expect(text).toContain(SHOWN);
      expect(text).not.toMatch(RAW);
    }
  });

  it('readPullRequestEvidence: "a pull request cannot exist for the default branch" names it escaped', async () => {
    await onDefaultBranch();
    const execFn = (cmd, args, opts) => {
      if (cmd === 'gh' && args[0] === 'auth') return '';
      if (cmd === 'gh') throw new Error('no pull requests found');
      const r = spawnSync(cmd, args, { ...opts, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout;
    };
    const out = readPullRequestEvidence(work, { execFn });
    expect(out).toMatchObject({ status: 'none', reason: `HEAD is ${SHOWN}; a pull request cannot exist for the default branch` });
  });

  it('remotes, none named origin: the names the gate lists are escaped', async () => {
    await onDefaultBranch({ remote: 'up‮stream' });
    const posture = checkBranchPosture(work, { tier: 'FULL' });
    expect(posture.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(posture.reason).toContain('(this repository has: up\\u202estream)');
    expect(posture.reason).not.toMatch(RAW);
    expect(formatBranchUnknown(posture)).not.toMatch(RAW);
  });

  it('closeEpic, HEAD on that default branch with work uncommitted: the refusal names the branch escaped', async () => {
    await onDefaultBranch({ unit: [{ type: 'opened', at: AT, by }] });
    await put('src/the-epic.js', '// not committed\n');
    const err = await closeEpic(work, EPIC, { by, at: AT }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toContain(`already on the default branch (origin/${SHOWN})`);
    expect(err.message).not.toMatch(RAW);
  });

  it('the sweep, a close whose commit is not on that branch: the advisory names the branch escaped', async () => {
    const proof = 'c'.repeat(40);
    await onDefaultBranch({
      unit: [{ type: 'opened', at: AT, by }, { type: 'close_requested', at: AT, by, proof }, { type: 'closed', at: AT, by, reason: 'shipped', proof }],
    });
    const found = checkClosedProofs(work);
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain(`is not on origin/${SHOWN} in this clone`);
    expect(found[0].message).not.toMatch(RAW);
  });
});
