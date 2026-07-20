// Unit tests for the shared symlink-aware confinement helper (M5.E4.T1.2, B14 /
// FR2). The module is a verbatim extraction of the M5.E2 REVIEW re-assert, so
// these lock its contract at the single new home:
//   - realpathNearestExisting resolves the deepest existing ancestor;
//   - a LEAF-file symlink is SAFE (the check anchors on dirname, never the leaf);
//   - a DIRECTORY symlink under .planning/ escaping the tree THROWS;
//   - .planning/ itself being a symlink OUT of the repo THROWS.
// Real FS symlink fixtures under a mkdtemp temp dir (no git needed).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  realpathNearestExisting,
  assertRealInsidePlanning,
} from '../tools/lib/path-confine.js';

describe('realpathNearestExisting', () => {
  let base;
  let outside;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'signal-pc-'));
    outside = await mkdtemp(join(tmpdir(), 'signal-pc-out-'));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('resolves an existing directory to its real path', () => {
    expect(realpathNearestExisting(base)).toBe(realpathSync(base));
  });

  it('walks up to the deepest existing ancestor for a not-yet-created path', async () => {
    const planning = join(base, '.planning');
    await mkdir(planning, { recursive: true });
    // .planning/archive/M9/E1/STATE-NARRATIVE.md does not exist yet — the nearest
    // existing ancestor is .planning/ itself.
    const dest = join(planning, 'archive', 'M9', 'E1', 'STATE-NARRATIVE.md');
    expect(realpathNearestExisting(dest)).toBe(realpathSync(planning));
  });

  it('follows a directory symlink to its real (out-of-tree) target', async () => {
    const planning = join(base, '.planning');
    await mkdir(planning, { recursive: true });
    await symlink(outside, join(planning, 'archive'));
    // The nearest existing ancestor of a not-yet-created file under the symlink
    // resolves OUT of the repo — this is exactly what the confinement check reads.
    const dest = join(planning, 'archive', 'M9', 'STATE-NARRATIVE.md');
    expect(realpathNearestExisting(dest)).toBe(realpathSync(outside));
  });
});

describe('assertRealInsidePlanning', () => {
  let base;
  let outside;
  let planning;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'signal-pc-'));
    outside = await mkdtemp(join(tmpdir(), 'signal-pc-out-'));
    planning = join(base, '.planning');
    await mkdir(planning, { recursive: true });
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('allows a normal in-.planning dest (real directory)', () => {
    const dest = join(planning, 'archive', 'M9', 'E1', 'STATE-NARRATIVE.md');
    expect(() => assertRealInsidePlanning(base, dest, 'unit')).not.toThrow();
  });

  it('allows a LEAF-file symlink pointing OUT of the tree (anchors on dirname, not the leaf)', async () => {
    // The leaf is a symlink escaping the repo, but the parent dir (.planning/) is
    // real — atomicWrite renames over the leaf and never follows it, so this is safe.
    const target = join(outside, 'target.md');
    await writeFile(target, 'x', 'utf-8');
    const leaf = join(planning, 'NOTES.md');
    await symlink(target, leaf);
    expect(() => assertRealInsidePlanning(base, leaf, 'unit')).not.toThrow();
  });

  it('throws when a DIRECTORY symlink under .planning/ escapes the tree', async () => {
    await symlink(outside, join(planning, 'archive'));
    const dest = join(planning, 'archive', 'M9', 'E1', 'STATE-NARRATIVE.md');
    expect(() => assertRealInsidePlanning(base, dest, 'unit')).toThrow(
      /escapes \.planning\/ via a directory symlink/
    );
  });

  it('throws when .planning/ itself is a symlink pointing OUT of the repo', async () => {
    // Rebuild base with .planning as a symlink to the outside dir.
    await rm(planning, { recursive: true, force: true });
    await symlink(outside, planning);
    const dest = join(planning, 'archive', 'M9', 'STATE-NARRATIVE.md');
    expect(() => assertRealInsidePlanning(base, dest, 'unit')).toThrow(
      /resolves outside the repo .* refusing a symlinked planning root/
    );
  });

  it('allows a nested-but-real dir that resolves inside real .planning/', async () => {
    const sub = join(planning, 'sub');
    await mkdir(sub, { recursive: true });
    const dest = join(sub, 'deep.md');
    expect(() => assertRealInsidePlanning(base, resolve(dest), 'unit')).not.toThrow();
  });
});
