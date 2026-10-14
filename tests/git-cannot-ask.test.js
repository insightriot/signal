// M6.E16 r6.5 — a git Signal cannot use means "could not ask", never "this
// is not a repository".
//
// With a git older than 2.38 (or one whose version cannot be read) Signal
// runs no git call, and every call fails the way git fails where there is no
// repository. Code that took its "no repository" branch on that failure went
// on to WRITE, or to skip a check: a migration applied on a dirty tree and
// said "not a git checkout"; an item ID was handed out without reading the
// other branches; a short proof was recorded unchecked.
//
// `gitCannotAsk(baseDir)` (`plugin/tools/lib/git-env.js`) is the one answer,
// and each of those places asks it first. Every test here is in a REAL
// repository, with the version forced; the control for the migration is the
// folder with no repository and no git at all, which behaves as before.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { gitCannotAsk, testSeam } from '../plugin/tools/lib/git-env.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { requestUnitClose } from '../plugin/tools/lib/unit-records.js';
import { closeEpic, refuseHeadThatProvesNothing } from '../plugin/tools/lib/work-ops.js';
import { dischargeBacklogRows } from '../plugin/tools/lib/backlog.js';
import { probeGitState, runMigrate } from '../plugin/tools/lib/migrate-memory.js';
import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { isStaleVsOrigin, isStateStale } from '../plugin/tools/lib/state.js';
import { renderResumeBriefing } from '../plugin/tools/lib/resume.js';
import * as branchGuard from '../plugin/tools/lib/branch-guard.js';
import { isGitRepo as storeIsGitRepo } from '../plugin/tools/lib/work-store.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { checkGitVersion } from '../plugin/tools/lib/doctor.js';
import { snapshotTree } from './helpers/write-inventory.js';

const NEED = 'Signal needs git 2.38 or newer for its git-backed checks';
const OLD = `${NEED}; this is git 2.34.1`;
const MISSING = `${NEED}; git could not be run here`;
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
  root = await mkdtemp(join(tmpdir(), 'sig-cannot-ask-'));
  work = join(root, 'work');
  await mkdir(work, { recursive: true });
});
afterEach(async () => {
  testSeam.gitVersion = undefined;
  await rm(root, { recursive: true, force: true });
});
async function put(rel, content, base = work) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const STATE = '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M7.E3\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nlast_updated_commit: HEAD_SHA\n---\n\n# State\n';

// A real repository holding a v2 store with unit records: the Epic open, one
// open item, a retrospective. Everything committed. Returns HEAD.
async function repoWithStore() {
  g(work, 'init', '-q', '-b', 'main');
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: [{ type: 'opened', at: AT, by }] }));
  await put(records.recordPath('SIG-1'), serializeRecord({ id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }] }));
  await put(records.recordPath('SIG-2'), serializeRecord({ id: 'SIG-2', type: 'CHORE', title: 'Tidy the index', events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }] }));
  await put(`.planning/${EPIC}-RETROSPECTIVE.md`, '# Retrospective\n\n## Timeline\n\nIt shipped.\n');
  await put('.planning/STATE.md', STATE);
  await regenerateViews(work);
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'c0');
  return g(work, 'rev-parse', 'HEAD');
}
const old = () => { testSeam.gitVersion = 'git version 2.34.1'; };
const refusal = async (fn) => {
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  expect(err, 'it was not refused').toBeDefined();
  expect(err.message).toContain(OLD);
  expect(err.message).not.toMatch(/not a git repository|needs a git repository|does not name a commit/);
  return err;
};

describe('gitCannotAsk: the one answer', () => {
  it('a git that works: null, in a repository and outside one', async () => {
    await repoWithStore();
    expect(gitCannotAsk(work)).toBeNull();
    expect(gitCannotAsk(root)).toBeNull();
  });

  it('a git too old, or one whose version cannot be read: the reason, wherever the folder is', async () => {
    await repoWithStore();
    old();
    expect(gitCannotAsk(work)).toBe(OLD);
    expect(gitCannotAsk(root)).toBe(OLD);
    testSeam.gitVersion = 'garbage';
    expect(gitCannotAsk(root)).toBe(`${NEED}; the version of the git installed here could not be read`);
  });

  it('no git at all: the reason where a `.git` entry is at or above the folder — a folder, a file, a dangling link — and null where there is none', async () => {
    await repoWithStore();
    await mkdir(join(work, 'packages', 'app'), { recursive: true });
    await put('.git', 'gitdir: /somewhere/else\n', join(root, 'gitfile'));
    await mkdir(join(root, 'plain', 'deep'), { recursive: true });
    testSeam.gitVersion = null;
    expect(gitCannotAsk(work)).toBe(MISSING);
    expect(gitCannotAsk(join(work, 'packages', 'app'))).toBe(MISSING);
    expect(gitCannotAsk(join(root, 'gitfile'))).toBe(MISSING);
    expect(gitCannotAsk(join(root, 'plain', 'deep'))).toBeNull();
  });

  it('both `isGitRepo`s give one answer when git cannot be used: false', async () => {
    await repoWithStore();
    expect([branchGuard.isGitRepo(work), storeIsGitRepo(work)]).toEqual([true, true]);
    old();
    expect([branchGuard.isGitRepo(work), storeIsGitRepo(work)]).toEqual([false, false]);
  });
});

describe('the migrations: a dirty real repository is not migrated as "not a git checkout"', { timeout: 60_000 }, () => {
  it('probeGitState, old git: does not proceed, and the reason is the version', async () => {
    await repoWithStore();
    await put('src/not-committed.js', '// work in progress\n');
    old();
    const probe = probeGitState(work);
    expect(probe).toMatchObject({ proceed: false, reason: `${OLD}. Nothing was written.` });
    expect(probe.mode).not.toBe('fs-backup');
  });

  it('runMigrate and runWorkStoreMigrate, old git: the dry run proposes nothing, the apply is refused, nothing is written', async () => {
    await repoWithStore();
    await put('src/not-committed.js', '// work in progress\n');
    const before = snapshotTree(work);
    old();
    for (const apply of [false, true]) {
      const lists = await runWorkStoreMigrate(work, { apply, key: 'SIG', expectedHash: 'x' });
      expect(lists).toMatchObject({ applied: false, refused: true, reason: `${OLD}. Nothing was written.` });
      expect(lists.report).toBeUndefined();
      const memory = await runMigrate(work, { apply, sense: () => { throw new Error('the project was read'); } });
      expect(memory).toMatchObject({ applied: false, refused: true, plan: null, reason: `${OLD}. Nothing was written.` });
    }
    expect(snapshotTree(work)).toEqual(before);
  });

  it('no git at all: refused inside a repository; a folder with no repository is a filesystem snapshot, as before', async () => {
    await repoWithStore();
    await mkdir(join(root, 'plain', '.planning'), { recursive: true });
    testSeam.gitVersion = null;
    expect(probeGitState(work)).toMatchObject({ proceed: false, reason: `${MISSING}. Nothing was written.` });
    const noGit = () => { throw new Error('spawn git ENOENT'); };
    expect(probeGitState(join(root, 'plain'), { execFn: noGit })).toMatchObject({
      mode: 'fs-backup', proceed: true, warnings: ['Not a git repository — using a filesystem snapshot for reversibility.'],
    });
  });

  it('the control: with the installed git the same dirty repository is refused as dirty, and a clean one proceeds', async () => {
    await repoWithStore();
    expect(probeGitState(work)).toMatchObject({ mode: 'git', proceed: true });
    await put('src/not-committed.js', '// work in progress\n');
    expect(probeGitState(work)).toMatchObject({ mode: 'git', proceed: false, dirty: true });
  });
});

describe('writes that need git\'s answer refuse when it could not be asked', { timeout: 60_000 }, () => {
  it('nextIdV2: no ID is handed out without reading the other branches', async () => {
    await repoWithStore();
    // SIG-3 exists on another branch only.
    g(work, 'checkout', '-q', '-b', 'other');
    await put(records.recordPath('SIG-3'), serializeRecord({ id: 'SIG-3', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }] }));
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'other');
    g(work, 'checkout', '-q', 'main');
    expect(records.nextIdV2(work)).toEqual({ id: 'SIG-4', basis: 'git-log' });
    old();
    let err;
    try {
      records.nextIdV2(work);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'IO' });
    expect(err.message).toBe(`cannot allocate an ID: the IDs on other branches could not be read (${OLD}). Nothing was written.`);
  });

  it('a close requested with a short proof — item and unit — is refused; the full hash is still recorded', async () => {
    const head = await repoWithStore();
    old();
    const before = snapshotTree(work);
    expect((await refusal(() => records.requestClose(work, 'SIG-1', { proof: head.slice(0, 10), by, at: AT }))).code).toBe('CONFIG');
    expect((await refusal(() => requestUnitClose(work, EPIC, { proof: head.slice(0, 10), by, at: AT }))).code).toBe('CONFIG');
    expect(snapshotTree(work)).toEqual(before);
    await records.requestClose(work, 'SIG-1', { proof: head, by, at: AT });
    expect(records.getRecord(work, 'SIG-1').status).toBe('closing');
  });

  it('closeEpic and dischargeBacklogRows with an explicit commit: the reason is the version, not "does not name a commit"', async () => {
    const head = await repoWithStore();
    old();
    const before = snapshotTree(work);
    const close = await refusal(() => closeEpic(work, EPIC, { by, at: AT, commit: head }));
    expect(close.message).toBe(`${EPIC}: \`commit\` ${head} could not be checked: ${OLD}. Nothing was written.`);
    await refusal(() => dischargeBacklogRows(work, { rows: ['tidy the index'], by: EPIC, at: '2026-10-01', commit: head }));
    expect(snapshotTree(work)).toEqual(before);
  });

  it('refuseHeadThatProvesNothing refuses by itself', async () => {
    const head = await repoWithStore();
    expect(() => refuseHeadThatProvesNothing(work, EPIC, head)).not.toThrow();
    old();
    let err;
    try {
      refuseHeadThatProvesNothing(work, EPIC, head);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'CONFIG' });
    expect(err.message).toBe(`${EPIC}: the close would record HEAD as its proof, and whether that commit says anything about this Epic could not be checked: ${OLD}. Nothing was written.`);
  });
});

describe('/sig:doctor: the git version is a check', () => {
  it('ok with the installed git and with 2.38; not ok, with the sentence, for an older one, an unreadable one and none', () => {
    expect(checkGitVersion()).toEqual({ ok: true, message: 'git: 2.38 or newer — Signal\'s git-backed checks run.' });
    testSeam.gitVersion = 'git version 2.38.0';
    expect(checkGitVersion().ok).toBe(true);
    for (const [line, why] of [['git version 2.37.9', `${NEED}; this is git 2.37.9`], ['garbage', `${NEED}; the version of the git installed here could not be read`], [null, MISSING]]) {
      testSeam.gitVersion = line;
      const check = checkGitVersion();
      expect(check.ok).toBe(false);
      expect(check.message.startsWith(`git: ${why}. Update git; `)).toBe(true);
    }
  });
});

describe('STATE.md against history and origin: not checked is said', { timeout: 60_000 }, () => {
  it('both checks carry the reason, and /sig:resume prints one line', async () => {
    const head = await repoWithStore();
    await put('.planning/STATE.md', STATE.replace('HEAD_SHA', head));
    expect((await isStateStale(work, { bypassGrace: true })).cannotCheck).toBeUndefined();
    old();
    const local = await isStateStale(work, { bypassGrace: true });
    const origin = await isStaleVsOrigin(work);
    expect(local).toEqual({ stale: false, commitCount: 0, commits: [], cannotCheck: OLD });
    expect(origin).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false, cannotCheck: OLD });
    const LINE = `⚠ STATE.md was not compared with the work history or with origin: ${OLD}.`;
    const state = { phase: 'EXECUTE', current_epic: EPIC, current_tasks: [], completed_phases: [] };
    const said = (params) => renderResumeBriefing({ state, ...params }).split('\n').filter((l) => l === LINE).length;
    expect(said({ isStaleResult: local, originDriftResult: origin })).toBe(1);
    expect(said({ originDriftResult: origin })).toBe(1);
    expect(said({ isStaleResult: { stale: false, commitCount: 0, commits: [] }, originDriftResult: { stale: false, aheadCount: 0 } })).toBe(0);
  });
});
