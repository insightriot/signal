// M5.E3.S6b — stamp-null projects route through the v3 migration (rollout fix).
//
// At the combined E1+E2+E3 release EVERY existing external project is stamp-null:
// `docs_layout_version` is unreleased, so nobody has it yet. The v3 gate was
// `stamp !== null && stamp < CURRENT` — which EXCLUDES stamp-null, so those projects
// never ran the v3 file work (FUTURE-IDEAS→ISSUES-INBOX rename, BACKLOG create,
// append-log evict) and never converged on the new layout. The fix treats stamp-null
// as pre-v3 (`stamp === null || stamp < CURRENT`), in BOTH the migrate gate AND the
// resume/status layout banner (a stamp-null project that is not yet v3-conformant on
// disk must nudge the migrate; an already-v3-structured one must stay silent).
//
// Built RED-first, both directions, real files planted on disk (the conformance +
// banner paths read the filesystem — a STATE-text-only fixture can't exercise them):
//   1. stamp-null + FUTURE-IDEAS.md (no BACKLOG) → dry-run PLANS the v3 chain,
//      apply RUNS it (rename + BACKLOG-create) + stamps to CURRENT, and it BANNERS
//      before migrating.                                              [ARMING — was RED]
//   2. stamp-null already v3-structured (ISSUES-INBOX + BACKLOG)   → no-op-then-stamp,
//      banner SILENT.                                                [GUARD — must stay]
//   3. born-on-v3 (stamp == CURRENT) + a stray FUTURE-IDEAS.md      → gate INERT (no
//      rename planned), banner SILENT.        [REGRESSION GUARD — must NOT re-arm v3]
//   4. stamp-null + NO FUTURE-IDEAS + NO BACKLOG (the ordinary legacy project) →
//      BANNERS + apply CREATES BACKLOG.  [DISCRIMINATOR — the "lacks BACKLOG" trigger;
//      a v3Rename-only banner fix leaves this silent → non-convergent.]

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  renderDryRun,
  applyMigrate,
  CURRENT_LAYOUT_VERSION,
} from '../tools/lib/migrate-memory.js';
import { readLayoutBanner } from '../tools/lib/status.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

// A clean, vector-free STATE.md at a given (or absent) stamp. `stampLine` is spliced
// in verbatim so the null case omits docs_layout_version entirely (the real legacy
// shape — a schema_version:1 file that predates the layout stamp).
const stateAt = (stampLine) =>
  `---\nschema_version: 1\n${stampLine}phase: EXECUTE\ncurrent_epic: M5.E3\n` +
  `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
  `# Project State\n\nlive pointer\n`;

const STATE_NULL = stateAt(''); // legacy: no docs_layout_version
const STATE_V3 = stateAt(`docs_layout_version: ${CURRENT_LAYOUT_VERSION}\n`); // born-on-v3

const p = (dir, ...rest) => join(dir, '.planning', ...rest);

async function plant(dir, { state, futureIdeas = false, backlog = false } = {}) {
  await mkdir(p(dir), { recursive: true });
  await writeFile(p(dir, 'STATE.md'), state, 'utf-8');
  if (futureIdeas) await writeFile(p(dir, 'FUTURE-IDEAS.md'), '# Future Ideas\n\n## An idea\n\nbody\n', 'utf-8');
  if (backlog) await writeFile(p(dir, 'BACKLOG.md'), '# Backlog\n', 'utf-8');
  return dir;
}

describe('S6b — stamp-null routes through v3 (arming direction)', () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'stampnull-arm-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('1a: dry-run PLANS the v3 chain (rename + BACKLOG-create) for a stamp-null FUTURE-IDEAS project', async () => {
    await plant(dir, { state: STATE_NULL, futureIdeas: true, backlog: false });
    const dry = await renderDryRun(dir);
    // The FR6 inbox rename is sensed (v3Rename on) → one archive-tree move…
    expect(dry).toMatch(/archive-tree moves:\s+1/);
    // …and the FR2 BACKLOG-create line appears (printed only when needsV3).
    expect(dry).toMatch(/BACKLOG\.md \(FR2\):\s+will create/);
  });

  it('1b: apply RUNS the v3 chain (inbox renamed, BACKLOG created) + stamps to CURRENT', async () => {
    await plant(dir, { state: STATE_NULL, futureIdeas: true, backlog: false });
    initRepo(dir);
    const res = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-19' });
    expect(res.applied).toBe(true);
    // Inbox renamed (the load-bearing v3 file work the old gate skipped).
    expect(existsSync(p(dir, 'ISSUES-INBOX.md'))).toBe(true);
    expect(existsSync(p(dir, 'FUTURE-IDEAS.md'))).toBe(false);
    // BACKLOG created.
    expect(existsSync(p(dir, 'BACKLOG.md'))).toBe(true);
    // Stamp lands on TRUE v3-conformance (via the tail gate, not the false v2 stamp).
    const finalState = await readFile(p(dir, 'STATE.md'), 'utf-8');
    expect(finalState).toContain(`docs_layout_version: ${CURRENT_LAYOUT_VERSION}`);
  });

  it('1c: BANNERS before migrating (stamp-null + FUTURE-IDEAS is pre-v3)', async () => {
    await plant(dir, { state: STATE_NULL, futureIdeas: true, backlog: false });
    expect(await readLayoutBanner(dir)).not.toBeNull();
  });
});

describe('S6b — stamp-null already v3-structured (silent guard)', () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'stampnull-v3-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('2a: banner SILENT (ISSUES-INBOX present, BACKLOG present, clean STATE)', async () => {
    await plant(dir, { state: STATE_NULL, futureIdeas: false, backlog: true });
    await writeFile(p(dir, 'ISSUES-INBOX.md'), '# Issues Inbox\n', 'utf-8');
    expect(await readLayoutBanner(dir)).toBeNull();
  });

  it('2b: migrate is a no-op-then-stamp (stamps to CURRENT, no file churn)', async () => {
    await plant(dir, { state: STATE_NULL, futureIdeas: false, backlog: true });
    await writeFile(p(dir, 'ISSUES-INBOX.md'), '# Issues Inbox\n', 'utf-8');
    initRepo(dir);
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-19' });
    const finalState = await readFile(p(dir, 'STATE.md'), 'utf-8');
    expect(finalState).toContain(`docs_layout_version: ${CURRENT_LAYOUT_VERSION}`);
    // No inbox was created behind our back; the v3-structured shape is preserved.
    expect(existsSync(p(dir, 'FUTURE-IDEAS.md'))).toBe(false);
  });
});

describe('S6b — born-on-v3 stays inert (regression guard — the fix must NOT re-arm it)', () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bornv3-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('3a: gate INERT — a stray FUTURE-IDEAS.md on a stamp==CURRENT project plans NO rename', async () => {
    // The sharpest gate guard: stamp == CURRENT ⟹ needsV3 false under BOTH the old
    // (`3 !== null && 3 < 3`) and the new (`3 === null || 3 < 3`) predicate. Even with
    // a rename candidate present, the v3 chain must not fire.
    await plant(dir, { state: STATE_V3, futureIdeas: true, backlog: true });
    const dry = await renderDryRun(dir);
    expect(dry).toMatch(/archive-tree moves:\s+0/);
    expect(dry).not.toMatch(/will create/);
  });

  it('3b: banner SILENT (integer-stamp short-circuit, stamp == CURRENT)', async () => {
    await plant(dir, { state: STATE_V3, futureIdeas: false, backlog: true });
    expect(await readLayoutBanner(dir)).toBeNull();
  });
});

describe('S6b — ordinary legacy project (no FUTURE-IDEAS, no BACKLOG) — the discriminator', () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'stampnull-plain-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  // The case that separates the complete fix from a v3Rename-only banner: no
  // FUTURE-IDEAS to rename (so archive.moves stays 0), but BACKLOG is missing → the
  // project is NOT v3-conformant → it must banner, else it never converges.
  it('4a: BANNERS on a stamp-null project whose only pre-v3 signal is the missing BACKLOG', async () => {
    await plant(dir, { state: STATE_NULL, futureIdeas: false, backlog: false });
    expect(await readLayoutBanner(dir)).not.toBeNull();
  });

  it('4b: apply CONVERGES it — BACKLOG created + stamped to CURRENT', async () => {
    await plant(dir, { state: STATE_NULL, futureIdeas: false, backlog: false });
    initRepo(dir);
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-19' });
    expect(existsSync(p(dir, 'BACKLOG.md'))).toBe(true);
    const finalState = await readFile(p(dir, 'STATE.md'), 'utf-8');
    expect(finalState).toContain(`docs_layout_version: ${CURRENT_LAYOUT_VERSION}`);
  });
});
