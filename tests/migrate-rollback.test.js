// M5.E2.S1.t7b — surgical rollback (advisor #4: never `git reset --hard`).
//
// A post-apply verify failure must restore the files the migrate touched
// BYTE-IDENTICAL and delete any file it newly created — and, critically on a
// --force dirty tree, must NOT touch the user's OTHER uncommitted work.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
const HUGE = 'meaningful narrative words across a sentence here. '.repeat(220); // > 8 KB → V1+V2
const STATE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "DISCUSS (2026-07-01) — ${HUGE}"\nblockers: []\n---\n# Project State\n\nlive\n`;
const readState = (dir) => readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');
const FAIL_VERIFY = () => ({ block: true, reason: 'forced-for-test' });

describe('M5.E2.S1.t7b surgical rollback', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-rb-'));
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

  it('a verify failure restores STATE.md byte-identical + deletes the newly-created STATE-HISTORY', async () => {
    const before = await readState(dir);
    await expect(
      applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17', verify: FAIL_VERIFY }),
    ).rejects.toThrow(/rolled back/i);
    expect(await readState(dir)).toBe(before); // byte-identical
    expect(existsSync(join(dir, '.planning', 'STATE-HISTORY.md'))).toBe(false); // newly-created removed
  });

  it('--force rollback restores ONLY the migrated files — the user\'s other dirty work is untouched', async () => {
    await writeFile(join(dir, 'wip.txt'), 'precious uncommitted user work\n', 'utf-8'); // makes the tree dirty
    const before = await readState(dir);
    await expect(
      applyMigrate(dir, { force: true, stamp: 'T1', dateStr: '2026-07-17', verify: FAIL_VERIFY }),
    ).rejects.toThrow(/rolled back/i);
    // The migrated file is restored…
    expect(await readState(dir)).toBe(before);
    // …and the user's unrelated dirty file is exactly as they left it (NOT git-reset away).
    expect(await readFile(join(dir, 'wip.txt'), 'utf-8')).toBe('precious uncommitted user work\n');
  });
});
