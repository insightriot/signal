// M5.E2.S1.t7b — the apply engine: compose V1→V2→stamp in ONE invocation.
//
// The advisor's composition discriminator: vector-1 de-prose relocates
// frontmatter prose INTO the body, which can push the body past the 8 KB
// vector-2 threshold. A naive "apply the sensed vectors once" harness would
// leave v2.candidate:true → unstamped → a 2nd --apply changes files. The apply
// engine must chain V1→V2→stamp in memory so ONE --apply reaches conformance and
// a 2nd --apply is a byte-identical no-op (nextpass's real post-V1 shape).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate, runMigrate, senseState, hashState } from '../tools/lib/migrate-memory.js';
import { checkStateFrontmatterShape } from '../tools/lib/retrospective.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}

// Frontmatter prose big enough that de-prose pushes the body past 8 KB → V2 fires.
const HUGE_PROSE = 'a narrative sentence carrying real meaning across many words. '.repeat(200); // ~12 KB
const NEXTPASS_SHAPE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - CALIBRATE (2026-05-13)\n  - "DISCUSS (2026-07-01) — ${HUGE_PROSE}"\n` +
  `blockers: []\n---\n# Project State\n\n## Resume pointer\n\nlive pointer\n`;

async function setup(dir) {
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), NEXTPASS_SHAPE, 'utf-8');
  initRepo(dir);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}
const readState = (dir) => readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');

describe('M5.E2.S1.t7b applyMigrate — V1→V2→stamp composition', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-apply-'));
    await setup(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('ONE apply reaches full conformance + stamp (de-prose then relocate the big body)', async () => {
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied).toBe(true);
    // This fixture is stamp-null (legacy), so S6b routes it through the full v3
    // migration: the V1→V2 compose is now followed by the FR2 BACKLOG create-if-missing
    // (no FUTURE-IDEAS.md here → no rename move; no DECISIONS.md → no evict).
    expect(r.moves.map((m) => m.vector)).toEqual(['vector-1', 'vector-2', 'backlog-create']);

    const after = await readState(dir);
    // Frontmatter no longer blocks, body is a pointer, stamp is set.
    expect(checkStateFrontmatterShape({ proposedContent: after }).block).toBe(false);
    const sensed = senseState(after);
    expect(sensed.conformant).toBe(true);
    expect(sensed.stamped).toBe(true);
    expect(after).toContain('[STATE-HISTORY.md](STATE-HISTORY.md)');
    // The relocated prose lives in STATE-HISTORY (relocate-never-delete).
    const history = await readFile(join(dir, '.planning', 'STATE-HISTORY.md'), 'utf-8');
    expect(history).toContain('a narrative sentence carrying real meaning');
  });

  it('is idempotent — a second apply is a byte-identical no-op', async () => {
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    const mid = await readState(dir);
    const r2 = await applyMigrate(dir, { stamp: 'T2', dateStr: '2026-07-17' });
    expect(r2.applied).toBe(false); // noop — conformant + stamped
    expect(await readState(dir)).toBe(mid);
  });

  it('creates a pre-apply tag and STAGES the touched files (staged-not-committed)', async () => {
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.tag).toBe('pre-migrate-memory-T1');
    expect(String(git(dir, ['tag', '-l'])).trim()).toContain('pre-migrate-memory-T1');
    // Changes are STAGED, not committed: the index differs from HEAD, but no new commit.
    const staged = String(git(dir, ['diff', '--cached', '--name-only'])).trim();
    expect(staged).toContain('.planning/STATE.md');
    expect(staged).toContain('.planning/STATE-HISTORY.md');
    // The v3 file work is staged too (S6b): the created BACKLOG.md. A defensively-
    // snapped-but-never-created DECISIONS.md must NOT appear (it would fail the whole add).
    expect(staged).toContain('.planning/BACKLOG.md');
    expect(staged).not.toContain('.planning/DECISIONS.md');
    // Still exactly one commit (nothing was committed by the migrate).
    expect(String(git(dir, ['rev-list', '--count', 'HEAD'])).trim()).toBe('1');
    // Clean-tree revert line points at the tag.
    expect(r.revertLine).toContain('pre-migrate-memory-T1');
  });

  it('refuses on a dirty tree without --force (no write)', async () => {
    await writeFile(join(dir, 'wip.txt'), 'uncommitted user work\n', 'utf-8');
    const before = await readState(dir);
    const r = await applyMigrate(dir, { stamp: 'T1' });
    expect(r.applied).toBeFalsy();
    expect(r.refused).toBe(true);
    expect(await readState(dir)).toBe(before); // untouched
  });

  it('runMigrate wires dry-run (inputHash) → apply', async () => {
    const dry = await runMigrate(dir, { apply: false });
    expect(dry.applied).toBe(false);
    expect(dry.inputHash).toBe(hashState(NEXTPASS_SHAPE));
    const applied = await runMigrate(dir, { apply: true, stamp: 'T1', dateStr: '2026-07-17' });
    expect(applied.applied).toBe(true);
  });
});
