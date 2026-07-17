// M5.E2.S1.t7b — TOCTOU hash binding (advisor #5: abort before ANY write).
//
// The dry-run computes a hash of STATE.md; apply re-reads under the lock and, if
// the file drifted since the dry-run, aborts BEFORE touching anything — never a
// partial apply that already wrote STATE.md before noticing the drift.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate, runMigrate } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
const HUGE = 'meaningful narrative words across a sentence here. '.repeat(220);
const STATE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "DISCUSS (2026-07-01) — ${HUGE}"\nblockers: []\n---\n# Project State\n\nlive\n`;
const readState = (dir) => readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');

describe('M5.E2.S1.t7b TOCTOU hash binding', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-toctou-'));
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

  it('aborts before any write when STATE.md drifted since the dry-run hash', async () => {
    const dry = await runMigrate(dir, { apply: false });
    // A concurrent process changes STATE.md between the dry-run and the apply.
    // (force:true bypasses the dirty-tree refusal so this isolates the TOCTOU
    // check — a distinct safety gate that must still fire under --force.)
    const drifted = STATE + '\nconcurrent edit\n';
    await writeFile(join(dir, '.planning', 'STATE.md'), drifted, 'utf-8');

    await expect(
      applyMigrate(dir, { expectedHash: dry.inputHash, force: true, stamp: 'T1', dateStr: '2026-07-17' }),
    ).rejects.toThrow(/toctou|changed since/i);

    // No partial apply — STATE.md is exactly the drifted content, untouched.
    expect(await readState(dir)).toBe(drifted);
  });

  it('proceeds when the hash still matches (no drift)', async () => {
    const dry = await runMigrate(dir, { apply: false });
    const r = await applyMigrate(dir, { expectedHash: dry.inputHash, stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied).toBe(true);
  });
});
