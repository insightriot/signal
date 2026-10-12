// M6.E16 r1.6 (REVIEW pass 1: C-S1, C-S3, T-I3) — three small things about a
// unit's close request. See .planning/M6.E16-VALIDATION.md rows "AC4.1 — proof"
// and "AC2.1 — writers".
//
//   T-I3  a short proof that more than one commit starts with is refused when
//         the close is requested, and when it is requested again;
//   C-S1  `closeEpic` scans `pr` and `release` as the writer stores them, so a
//         hit hidden by an invisible character stops it with `{aborted}`,
//         never a TypeError;
//   C-S3  `confirmUnitClose` is gone: a shipped close is confirmed only by
//         `confirmCloses`, which checks the commit against the default branch.
// Real git, in a temp repository per test. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const opened = { type: 'opened', at: AT, by };
const RETRO = '# Retrospective\n\n## Timeline\n\nIt shipped.\n';

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
  root = await mkdtemp(join(tmpdir(), 'sig-unit-close-small-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store with unit records in a real repository, everything committed.
async function project(unitRecords) {
  g(root, ['init', '-q', '-b', 'feat']);
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`${UNITS}/.keep`, '');
  for (const [id, events] of unitRecords) await put(`${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
  await put('.planning/M7.E3-RETROSPECTIVE.md', RETRO);
  await regenerateViews(root);
  g(root, ['add', '-A']);
  g(root, ['commit', '-q', '-m', 'the Epic']);
  return g(root, ['rev-parse', 'HEAD']);
}

// Two commit objects whose ids share their first 7 hex digits, written into
// the repository's object store (as `tests/work-records-proof-refs.test.js`).
function plantAmbiguousCommits() {
  const tree = g(root, ['mktree'], '');
  const seen = new Map();
  for (let i = 0; ; i += 1) {
    const body = `tree ${tree}\nauthor T <t@t.co> 1700000000 +0000\ncommitter T <t@t.co> 1700000000 +0000\n\nm${i}\n`;
    const id = createHash('sha1').update(`commit ${Buffer.byteLength(body)}\0${body}`).digest('hex');
    const prefix = id.slice(0, 7);
    if (seen.has(prefix)) {
      const a = g(root, ['hash-object', '-t', 'commit', '-w', '--stdin'], seen.get(prefix));
      g(root, ['hash-object', '-t', 'commit', '-w', '--stdin'], body);
      return { prefix, a };
    }
    seen.set(prefix, body);
  }
}

describe('a close request refuses a short proof that names more than one commit (T-I3)', () => {
  it('requestUnitClose: SCHEMA, nothing written; a longer hash of the same commit is accepted', async () => {
    await project([['M7.E3', [opened]]]);
    const { prefix, a } = plantAmbiguousCommits();
    const before = snapshotTree(root);
    await expect(units.requestUnitClose(root, 'M7.E3', { proof: prefix, by, at: AT }))
      .rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/start of 2 commits.*longer hash.*Nothing was written/) });
    expect(snapshotTree(root)).toEqual(before);
    expect(await units.requestUnitClose(root, 'M7.E3', { proof: a.slice(0, 12), by, at: AT })).toMatchObject({ status: 'closing' });
  });

  it('rerequestUnitClose: SCHEMA, the earlier request stands; a longer hash is accepted', async () => {
    const head = await project([['M7.E3', [opened, { type: 'close_requested', at: AT, by, proof: '0123abc' }]]]);
    const { prefix, a } = plantAmbiguousCommits();
    const before = snapshotTree(root);
    await expect(units.rerequestUnitClose(root, 'M7.E3', { proof: prefix, by, at: AT }))
      .rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/start of 2 commits.*longer hash/) });
    expect(snapshotTree(root)).toEqual(before);
    expect(units.getUnit(root, 'M7.E3').closing_proof).toBe('0123abc');
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(await units.rerequestUnitClose(root, 'M7.E3', { proof: a.slice(0, 12), by, at: AT })).toMatchObject({ closing_proof: a.slice(0, 12) });
  });
});

describe('closeEpic scans pr and release as they will be stored (C-S1)', () => {
  // A key with a zero-width space inside it: the raw text is no hit, the
  // stored text (invisible characters removed) is.
  const HIDDEN = `AKIA​${'ABCDEFGH'.repeat(2)}`;

  it.each([['pr'], ['release']])('a hit only in the cleaned %s stops the close with {aborted}; nothing is written', async (field) => {
    await project([['M7.E3', [opened]]]);
    const before = snapshotTree(root);
    const out = await closeEpic(root, 'M7.E3', { by, at: AT, [field]: HIDDEN });
    expect(out).toEqual({ aborted: 'sensitive-data-pending', sensitiveHits: [expect.objectContaining({ type: 'aws-key' })] });
    expect(snapshotTree(root)).toEqual(before);
    const ok = await closeEpic(root, 'M7.E3', { by, at: AT, [field]: HIDDEN }, { acknowledgeSensitive: true });
    expect(ok.status).toBe('close-requested');
  });

  it('the same on a re-request, and on a unit with no record yet (no record is created for a stopped close)', async () => {
    await project([['M7.E3', [opened, { type: 'close_requested', at: AT, by, proof: '0123abc' }]]]);
    const before = snapshotTree(root);
    expect(await closeEpic(root, 'M7.E3', { by, at: AT, pr: HIDDEN })).toMatchObject({ aborted: 'sensitive-data-pending' });
    await put('.planning/M7.E4-RETROSPECTIVE.md', RETRO);
    g(root, ['add', '-A']);
    g(root, ['commit', '-q', '-m', 'a retrospective']);
    const again = snapshotTree(root);
    expect(await closeEpic(root, 'M7.E4', { by, at: AT, pr: HIDDEN })).toMatchObject({ aborted: 'sensitive-data-pending' });
    expect(snapshotTree(root)).toEqual(again);
    expect(before.get(`${UNITS}/M7.E3.json`)).toBe(again.get(`${UNITS}/M7.E3.json`));
  });
});

describe('a shipped close has one route (C-S3)', () => {
  it('the unit library exports no confirmUnitClose: confirmCloses (work-records.js) is the only writer of a shipped close', () => {
    expect(Object.keys(units)).not.toContain('confirmUnitClose');
    expect(typeof units.planUnitConfirms).toBe('function');
  });

  it('closeUnit still refuses shipped, and names the route that exists', async () => {
    await project([['M7.E3', [opened]]]);
    const err = await units.closeUnit(root, 'M7.E3', { reason: 'shipped', by }).catch((e) => e);
    expect(err).toMatchObject({ code: 'SCHEMA' });
    expect(err.message).toContain('confirmCloses');
    expect(err.message).not.toContain('confirmUnitClose');
  });
});
