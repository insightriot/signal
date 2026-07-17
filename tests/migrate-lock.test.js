// M5.E2.S1.t7b — coarse-lock composition (§9 proof-of-fail).
//
// The apply engine holds the coarse `.state.lock` ONCE and composes the PURE
// cores. It must NEVER call a self-locking wrapper under that lock — the lock is
// non-reentrant (O_EXCL), so a nested acquire throws. This test makes that
// concrete: a self-locking wrapper called under a held lock throws; the apply
// (which uses pure cores) completes.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { withStateLock } from '../tools/lib/state.js';
import {
  applyMigrate,
  setDocsLayoutVersion,
  applyDeproseVector1,
  relocateInlinedBody,
} from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
const HUGE = 'meaningful narrative words across a sentence here. '.repeat(220);
const STATE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "DISCUSS (2026-07-01) — ${HUGE}"\nblockers: []\n---\n# Project State\n\nlive\n`;

describe('M5.E2.S1.t7b coarse-lock composition (§9)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-lock-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, '.planning', 'STATE.md'), STATE, 'utf-8');
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

  it.each([
    ['setDocsLayoutVersion', (d) => setDocsLayoutVersion(d, 2)],
    ['applyDeproseVector1', (d) => applyDeproseVector1(d, { apply: true })],
    ['relocateInlinedBody', (d) => relocateInlinedBody(d, { apply: true })],
  ])('a self-locking %s called UNDER the held coarse lock throws (why the harness uses pure cores)', async (_name, fn) => {
    await withStateLock(dir, async () => {
      await expect(fn(dir)).rejects.toThrow(/lock|another .*state write/i);
    });
  });

  it('applyMigrate completes holding the coarse lock once (composes pure cores, no re-entry)', async () => {
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied).toBe(true);
    // The lock is released after apply — a subsequent self-locking write succeeds.
    await expect(setDocsLayoutVersion(dir, 2)).resolves.toBeUndefined();
  });
});
