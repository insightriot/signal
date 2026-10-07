// A proof names a COMMIT, never a ref (M6.E13 VERIFY loop 1, AC7.2 and
// D-M6E13-22). See .planning/M6.E13-VERIFICATION.md, the AC7.2 PARTIAL.
//
// git resolves `<name>^{commit}` as a branch or tag before it tries an
// abbreviated object id, so a hex-looking ref name such as `deadbee` used to
// confirm a close whose "proof" was no commit at all. The proof is now
// resolved to a full SHA that must START WITH the proof, and only that SHA is
// checked for ancestry. Covered through every caller of the check:
// confirmCloses, probeCloses and the Epic-close gate closeEpicCheck.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';

const AT = '2026-10-04T10:00:00.000Z';
const NOW = '2026-10-05T12:00:00.000Z';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const started = { type: 'started', at: AT, by, epic: 'M6.E13' };
const request = (proof) => ({ type: 'close_requested', at: AT, by, reason: 'fixed', proof });
const rec = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });

function g(cwd, args, input) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], {
    cwd,
    encoding: 'utf8',
    input,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-proof-refs-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function v2Store(dir, fixtures) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const r of fixtures) await put(dir, records.recordPath(r.id), serializeRecord(r));
}

// A bare remote with two commits on main, and a clone of it (origin/HEAD set).
function plantClone() {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  spawnSync('mkdir', ['-p', seed]);
  g(root, ['init', '-q', '--bare', '-b', 'main', remote]);
  g(seed, ['init', '-q', '-b', 'main']);
  const shas = [];
  for (let i = 0; i < 2; i += 1) {
    g(seed, ['commit', '-q', '--allow-empty', '-m', `c${i}`]);
    shas.push(g(seed, ['rev-parse', 'HEAD']));
  }
  g(seed, ['remote', 'add', 'origin', remote]);
  g(seed, ['push', '-q', '-u', 'origin', 'main']);
  g(root, ['clone', '-q', remote, work]);
  return { work, shas };
}

// Two commit objects whose ids share their first 7 hex digits, written into
// `dir`'s object store. Found by hashing synthetic commit bodies (a birthday
// search over 28 bits: tens of thousands of tries, milliseconds).
function plantAmbiguousCommits(dir, { parent = null, both = false } = {}) {
  const tree = g(dir, ['mktree'], '');
  const seen = new Map();
  const head = parent ? `parent ${parent}\n` : '';
  for (let i = 0; ; i += 1) {
    const body = `tree ${tree}\n${head}author T <t@t.co> 1700000000 +0000\ncommitter T <t@t.co> 1700000000 +0000\n\nm${i}\n`;
    const id = createHash('sha1').update(`commit ${Buffer.byteLength(body)}\0${body}`).digest('hex');
    const prefix = id.slice(0, 7);
    if (seen.has(prefix)) {
      const a = g(dir, ['hash-object', '-t', 'commit', '-w', '--stdin'], seen.get(prefix));
      const b = g(dir, ['hash-object', '-t', 'commit', '-w', '--stdin'], body);
      expect(a.slice(0, 7)).toBe(prefix);
      expect(b).toBe(id);
      return both ? { prefix, a, b } : prefix;
    }
    seen.set(prefix, body);
  }
}

// A hex name that is not a prefix of `sha` (so it can only be a ref).
const notPrefixOf = (sha, name) => {
  expect(sha.startsWith(name)).toBe(false);
  return name;
};

describe('confirmCloses and probeCloses — a hex-named ref is not a commit (AC7.2)', () => {
  it('a branch named like a hash, on origin/main\'s commit, does not confirm', async () => {
    const { work, shas } = plantClone();
    const name = notPrefixOf(shas[1], 'deadbee');
    g(work, ['branch', name, 'origin/main']);
    await v2Store(work, [rec('SIG-1', [created, request(name)])]);
    expect(records.probeCloses(work, { now: NOW }).confirmable).toEqual([]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'proof-names-a-ref' }]);
  });

  it('a tag named like a hash, on origin/main\'s commit, does not confirm', async () => {
    const { work, shas } = plantClone();
    const name = notPrefixOf(shas[1], 'cafebab');
    g(work, ['tag', name, 'origin/main']);
    await v2Store(work, [rec('SIG-1', [created, request(name)])]);
    expect(records.probeCloses(work, { now: NOW }).confirmable).toEqual([]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'proof-names-a-ref' }]);
  });

  it('a real short hash still confirms, and so does a full one', async () => {
    const { work, shas } = plantClone();
    await v2Store(work, [rec('SIG-1', [created, request(shas[0].slice(0, 7))]), rec('SIG-2', [created, request(shas[1])])]);
    expect(records.probeCloses(work, { now: NOW }).confirmable).toEqual(['SIG-1', 'SIG-2']);
    expect((await records.confirmCloses(work, { now: NOW })).confirmed).toEqual(['SIG-1', 'SIG-2']);
  });

  it('an ambiguous short id (two commits share it) does not confirm', async () => {
    const { work } = plantClone();
    const prefix = plantAmbiguousCommits(work);
    await v2Store(work, [rec('SIG-1', [created, request(prefix)])]);
    expect(records.probeCloses(work, { now: NOW }).confirmable).toEqual([]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'ambiguous-proof' }]);
  });

  // SIG-276 (M6.E14 S5): one of the two commits is on origin/main and a branch
  // is NAMED the shared prefix, pointing at it. git resolves the name as the
  // branch, the resolved commit starts with the prefix and is on main — so the
  // proof used to confirm, though it names two commits.
  it('an ambiguous short id masked by a same-named branch does not confirm (AC6.1)', async () => {
    const { work } = plantClone();
    const { prefix, a } = plantAmbiguousCommits(work, { parent: g(work, ['rev-parse', 'origin/main']), both: true });
    g(work, ['push', '-q', 'origin', `${a}:refs/heads/main`]);
    g(work, ['fetch', '-q', 'origin']);
    g(work, ['branch', prefix, a]);
    await v2Store(work, [rec('SIG-1', [created, request(prefix)])]);
    expect(records.probeCloses(work, { now: NOW }).confirmable).toEqual([]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'ambiguous-proof' }]);
  });
});

describe('requestClose / requestCloses — an ambiguous proof is refused when it is asked for (AC6.1, SIG-276)', () => {
  it('refuses a short proof two commits start with, writing nothing; a longer one is accepted', async () => {
    const { work } = plantClone();
    const { prefix, a } = plantAmbiguousCommits(work, { both: true });
    await v2Store(work, [rec('SIG-1', [created, triaged])]);
    for (const call of [
      () => records.requestClose(work, 'SIG-1', { proof: prefix, by }),
      () => records.requestCloses(work, [{ id: 'SIG-1', proof: prefix, by }]),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/start of 2 commits.*longer hash/) });
      expect(records.getRecord(work, 'SIG-1').status).toBe('T');
    }
    const ok = await records.requestClose(work, 'SIG-1', { proof: a.slice(0, 12), by });
    expect(ok.status).toBe('closing');
  });
});

describe('closeEpicCheck — a hex-named ref is not a commit on the shipping branch (D-M6E13-22)', () => {
  it('a branch named like a hash, on HEAD, leaves the item open', async () => {
    const { work, shas } = plantClone();
    const name = notPrefixOf(shas[1], 'deadbee');
    g(work, ['branch', name, 'HEAD']);
    await v2Store(work, [rec('SIG-1', [created, triaged, started, request(name)])]);
    expect(() => records.closeEpicCheck(work, 'M6.E13')).toThrow(expect.objectContaining({ code: 'OPEN_ITEMS' }));
  });

  it('a tag named like a hash, on HEAD, leaves the item open', async () => {
    const { work, shas } = plantClone();
    const name = notPrefixOf(shas[1], 'cafebab');
    g(work, ['tag', name, 'HEAD']);
    await v2Store(work, [rec('SIG-1', [created, triaged, started, request(name)])]);
    expect(() => records.closeEpicCheck(work, 'M6.E13')).toThrow(expect.objectContaining({ code: 'OPEN_ITEMS' }));
  });

  it('an ambiguous short id leaves the item open', async () => {
    const { work } = plantClone();
    const prefix = plantAmbiguousCommits(work);
    await v2Store(work, [rec('SIG-1', [created, triaged, started, request(prefix)])]);
    expect(() => records.closeEpicCheck(work, 'M6.E13')).toThrow(expect.objectContaining({ code: 'OPEN_ITEMS' }));
  });

  it('a real short hash on HEAD still counts as done', async () => {
    const { work, shas } = plantClone();
    await v2Store(work, [rec('SIG-1', [created, triaged, started, request(shas[1].slice(0, 7))])]);
    expect(records.closeEpicCheck(work, 'M6.E13')).toMatchObject({ closingOnBranch: ['SIG-1'] });
  });
});
