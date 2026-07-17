// M5.E2.S1.t8 — idempotency: apply then apply = ZERO file changes.
//
// AC: a second --apply on an already-migrated project is a byte-identical no-op,
// across every project shape (incl. already-canonical frontmatter). A
// serializer-churn impl (re-quoting / re-ordering the frontmatter on each write)
// would fail this. per-vector-sniff + the stamp are the idempotency guard;
// compare-before-write means "nothing to change" writes nothing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

const HUGE = 'a narrative sentence carrying meaning across many words. '.repeat(200); // > 8 KB
const CANONICAL =
  `---\nschema_version: 1\ndocs_layout_version: 2\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases:\n  - DISCUSS (2026-07-16)\nblockers: []\n---\n# Project State\n\nshort body\n`;
const CONFORMANT_UNSTAMPED =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases:\n  - DISCUSS (2026-07-16)\nblockers: []\n---\n# Project State\n\nshort body\n`;
const V1_ONLY =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases:\n  - "PLAN (2026-07-04) — ${'a bounded annotation of some length '.repeat(6)}"\nblockers: []\n---\n# Project State\n\nsmall body\n`;
const V2_ONLY =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n---\n# Project State\n\n${'inlined narrative paragraph here. '.repeat(600)}\n`;
const V1_V2 =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases:\n  - "DISCUSS (2026-07-01) — ${HUGE}"\nblockers: []\n---\n# Project State\n\nlive\n`;

async function treeSnapshot(dir) {
  const planning = join(dir, '.planning');
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== '.migrate') await walk(join(d, e.name));
      } else {
        out[join(d, e.name)] = await readFile(join(d, e.name), 'utf-8');
      }
    }
  }
  await walk(planning);
  return out;
}

async function setup(dir, fixture) {
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), fixture, 'utf-8');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

describe('M5.E2.S1.t8 idempotency — second apply is a byte-identical no-op', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-idem-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it.each([
    ['already-canonical (conformant + stamped)', CANONICAL],
    ['conformant-but-unstamped', CONFORMANT_UNSTAMPED],
    ['vector-1 only', V1_ONLY],
    ['vector-2 only', V2_ONLY],
    ['vector-1 + vector-2', V1_V2],
  ])('%s → apply → commit → apply = zero diff', async (_label, fixture) => {
    await setup(dir, fixture);
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    // Commit the first apply so the second runs on a clean tree.
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'migrate']);

    const before = await treeSnapshot(dir);
    const r2 = await applyMigrate(dir, { stamp: 'T2', dateStr: '2026-07-17' });
    const after = await treeSnapshot(dir);

    expect(r2.applied).toBe(false); // noop — conformant + stamped
    expect(after).toEqual(before); // byte-identical: zero file changes
    // The working tree is clean after the second apply (nothing written).
    expect(String(git(dir, ['status', '--porcelain'])).trim()).toBe('');
  });
});
