// M5.E2 REVIEW — apply-engine integrity: the SHIP-blocking rollback gap + the
// fence-less false-success. Both are RED-first proofs-of-fail (the whole reason
// these fixes exist), reproduced from the reviewers' empirical repros.
//
// Fix 1 (rollback gap): the mechanical phase (STATE write → archive-tree apply →
//   post-verify → dangling gate) was NOT inside a try/catch that rolls back. If
//   `applyArchiveTree` throws mid-phase (here: `.planning/archive` is a regular
//   FILE → ENOTDIR at the archive mkdir), the exception escaped, the snapshot was
//   never restored, and — in fs-backup / --force-dirty modes — the durable snapshot
//   was persisted only AFTER the throw point → an UNRECOVERABLE partial write.
// Fix 2 (fence-less false-success): a STATE.md with no `---` frontmatter fence can
//   never be stamped, so the no-op gate never fires and apply falls through to
//   applied:true + a fresh tag while leaving STATE untouched (re-taggable forever).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
const readState = (dir) => readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');

// A block-worthy completed_phases entry (>150 chars) → vector-1 de-prose → the
// STATE write fires (so "STATE left mutated" is observable when rollback is absent).
const LONG_CP =
  'DISCUSS (2026-07-01) — a long-form narrative parked in a completed_phases scalar ' +
  'that runs well past the 150-char block budget so the migrate de-proses it into the body.';
const PLAN_BODY = '# M6.E1 plan\n\nContent that must survive verbatim.\n';

describe('M5.E2 REVIEW — rollback wired around the mechanical phase (Fix 1, fs-backup)', () => {
  let dir;
  beforeEach(async () => {
    // NON-git dir → probeGitState returns fs-backup (proceed:true, no --force needed):
    // there is no git net, so the durable snapshot is the ONLY recovery aid.
    dir = await mkdtemp(join(tmpdir(), 'signal-apply-fail-'));
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await writeFile(
      join(planning, 'STATE.md'),
      `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M6.E2\ncurrent_tasks: []\n` +
        `completed_phases:\n  - "${LONG_CP}"\nblockers: []\n---\n# Project State\n\nlive\n`,
      'utf-8',
    );
    // Closed Epic M6.E1: the retro is the closed-signal, the PLAN scaffold moves.
    await writeFile(join(planning, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
    await writeFile(join(planning, 'M6.E1-PLAN.md'), PLAN_BODY, 'utf-8');
    // `.planning/archive` is a regular FILE → the archive-tree mkdir throws ENOTDIR.
    await writeFile(join(planning, 'archive'), 'not a directory\n', 'utf-8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a mid-phase throw (archive ENOTDIR) rolls back STATE byte-identical + leaves a durable recovery pointer', async () => {
    const before = await readState(dir);

    // The archive-tree apply throws (ENOTDIR at its mkdir).
    await expect(applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' })).rejects.toThrow();

    // GREEN assertions (RED against unmodified source):
    //  1. STATE.md restored byte-identical (RED: left de-prosed + stamped).
    expect(await readState(dir)).toBe(before);
    //  2. no partial archive move survives (the scaffold stays at its flat path).
    expect(await readFile(join(dir, '.planning', 'M6.E1-PLAN.md'), 'utf-8')).toBe(PLAN_BODY);
    //  3. fs-backup mode: a durable recovery pointer exists despite the throw
    //     (RED: persisted only AFTER the throw point → never created).
    expect(existsSync(join(dir, '.planning', '.migrate', 'snapshot'))).toBe(true);
  });
});

describe('M5.E2 REVIEW — fence-less STATE.md refuses cleanly (Fix 2)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-fenceless-'));
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    // No `---` frontmatter fence → not a schema_version:1 file; can never be stamped.
    await writeFile(
      join(planning, 'STATE.md'),
      '# Legacy State\n\nThis file predates the YAML-frontmatter schema. ' +
        'It has no `---` fence, so there is nothing to migrate.\n',
      'utf-8',
    );
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses (applied:false), creates no tag, leaves STATE byte-identical', async () => {
    const before = await readState(dir);
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });

    // GREEN (RED against unmodified source: applied:true, changed:true, tag created):
    expect(r.applied).toBe(false);
    expect(r.changed).toBeFalsy();
    expect(r.tag ?? null).toBe(null);
    expect(String(git(dir, ['tag', '-l'])).trim()).toBe('');
    expect(await readState(dir)).toBe(before); // byte-identical
  });
});

describe('M5.E4 — B16: a rolled-back git-mode apply deletes the pre-apply tag', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-b16-tag-'));
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await writeFile(
      join(planning, 'STATE.md'),
      `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M6.E2\ncurrent_tasks: []\n` +
        `completed_phases:\n  - "${LONG_CP}"\nblockers: []\n---\n# Project State\n\nlive\n`,
      'utf-8',
    );
    await writeFile(join(planning, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
    await writeFile(join(planning, 'M6.E1-PLAN.md'), PLAN_BODY, 'utf-8');
    // `.planning/archive` is a regular FILE → the archive-tree mkdir throws ENOTDIR mid-phase.
    await writeFile(join(planning, 'archive'), 'not a directory\n', 'utf-8');
    // git mode → the pre-apply `pre-migrate-memory-<stamp>` tag IS created (fs-backup never tags).
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('deletes pre-migrate-memory-<stamp> after a successful rollback (no accumulation)', async () => {
    await expect(applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' })).rejects.toThrow();
    // B16: rollback succeeded → the now-redundant pre-apply tag is cleaned up so retries
    // don't accumulate stray tags. RED against unfixed source: `pre-migrate-memory-T1` remains.
    expect(String(git(dir, ['tag', '-l'])).trim()).toBe('');
  });
});
