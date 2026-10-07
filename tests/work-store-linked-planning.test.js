// SIG-279 (M6.E14 S1): a project whose `.planning/` is a symbolic link to a
// folder inside the repository. Before the fix, every item change refused:
// `linkedComponent` checked `.planning` itself, so the views never regenerated.
// What must stay refused: a link BELOW `.planning/`, and a `.planning` whose
// real path is outside the repository.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

const AT = '2026-10-07T10:00:00.000Z';
const by = 'claude';
const noGit = () => {
  throw new Error('not a repo');
};
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };

let base;
let outside;

async function put(root, rel, content) {
  const p = join(root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store whose `.planning` is a link to `planning-real/` in the same repo.
async function linkedStore() {
  base = await mkdtemp(join(tmpdir(), 'sig-linked-planning-'));
  await put(base, 'planning-real/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(base, `planning-real/${records.recordPath('SIG-1').replace(/^\.planning\//, '')}`,
    serializeRecord({ id: 'SIG-1', type: 'BUG', title: 't SIG-1', events: [created, triaged] }));
  await symlink('planning-real', join(base, '.planning'));
}

beforeEach(linkedStore);
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
  if (outside) await rm(outside, { recursive: true, force: true });
  outside = undefined;
});

describe('a linked .planning inside the repository (SIG-279)', () => {
  it('AC3.1: item changes succeed and the views regenerate', async () => {
    const made = await records.newItem(base, { title: 'through a link', by, at: AT }, { execFn: noGit });
    expect(made.id).toBe('SIG-2');
    const t = await records.triageItem(base, 'SIG-2', { type: 'FEAT', by, at: AT }, { execFn: noGit });
    expect(t.status).toBe('T');
    const { written } = await regenerateViews(base);
    expect(written.length).toBeGreaterThan(0);
    for (const rel of written) expect(existsSync(join(base, rel))).toBe(true);
    // The view reached the real folder, through the link.
    const backlog = written.find((r) => r.endsWith('BACKLOG.md'));
    expect(await readFile(join(base, 'planning-real', backlog.replace(/^\.planning\//, '')), 'utf-8'))
      .toContain('through a link');
  });

  it('AC3.2: a link BELOW .planning is still refused', async () => {
    // A view the store always writes, made a link to a file elsewhere in the repo.
    await put(base, 'elsewhere.md', 'not a view\n');
    await symlink(join('..', 'elsewhere.md'), join(base, 'planning-real', 'BUGS.md'));
    const err = await records.newItem(base, { title: 'x', by, at: AT }, { execFn: noGit }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.message).toMatch(/\.planning\/BUGS\.md is a symbolic link/);
    expect(await readFile(join(base, 'elsewhere.md'), 'utf-8')).toBe('not a view\n');
  });

  it('AC3.3: a .planning whose real path is outside the repository is still refused', async () => {
    outside = await mkdtemp(join(tmpdir(), 'sig-linked-outside-'));
    await put(outside, 'work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await rm(join(base, '.planning'));
    await symlink(outside, join(base, '.planning'));
    const err = await records.newItem(base, { title: 'x', by, at: AT }, { execFn: noGit }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.message).toMatch(/outside the (repo|project)/);
  });
});
