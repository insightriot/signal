// M5.E2.S1.t7c — pre-apply dangling-link baseline + dry-run three-tier render.
//
// FR6.3 "before AND after": a dangling link that ALREADY existed before the
// migrate must not be attributed to it (else a stranger's pre-broken repo can
// never be migrated). Only NEW dangles the migrate introduces abort+rollback.
// Proof-of-fail: a pre-existing dangle attributed to the migrate → apply aborts →
// the test (which expects success) fails.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  scanDanglingLinks,
  computeDanglingDelta,
  applyMigrate,
  renderDryRun,
  runMigrate,
} from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
const HUGE = 'meaningful narrative words across a sentence here. '.repeat(220);
const STATE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "DISCUSS (2026-07-01) — ${HUGE}"\nblockers: []\n---\n# Project State\n\nlive\n`;

async function setup(dir, { danglingDoc = false } = {}) {
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), STATE, 'utf-8');
  if (danglingDoc) {
    // A PRE-EXISTING dangling link, unrelated to the migrate.
    await writeFile(join(dir, '.planning', 'NOTES.md'), 'see [gone](MISSING.md) and [ok](STATE.md)\n', 'utf-8');
  }
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

describe('M5.E2.S1.t7c scanDanglingLinks + computeDanglingDelta', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-dang-'));
    await setup(dir, { danglingDoc: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a dangling .md link, ignores a valid one', async () => {
    const dangles = await scanDanglingLinks(dir);
    expect(dangles.some((d) => d.target === 'MISSING.md')).toBe(true);
    expect(dangles.some((d) => d.target === 'STATE.md')).toBe(false); // STATE.md exists
  });

  it('computeDanglingDelta returns only NEW dangles (baseline subtracted)', () => {
    const before = [{ file: '.planning/A.md', link: 'x.md', target: 'x.md' }];
    const after = [
      { file: '.planning/A.md', link: 'x.md', target: 'x.md' }, // pre-existing
      { file: '.planning/B.md', link: 'y.md', target: 'y.md' }, // NEW
    ];
    const delta = computeDanglingDelta(before, after);
    expect(delta).toHaveLength(1);
    expect(delta[0].target).toBe('y.md');
  });
});

describe('M5.E2.S1.t7c applyMigrate dangling attribution', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-dang2-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a PRE-EXISTING dangle is NOT attributed to the migrate (apply succeeds)', async () => {
    await setup(dir, { danglingDoc: true }); // NOTES.md → MISSING.md dangles before we touch anything
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied).toBe(true); // the pre-existing dangle did not block the migrate
  });

  it('a NEW dangle the migrate introduces → abort + rollback', async () => {
    await setup(dir);
    // Injected scanner: clean baseline, then a new dangle post-apply.
    let calls = 0;
    const scanDangling = async () => {
      calls += 1;
      return calls === 1 ? [] : [{ file: '.planning/STATE.md', link: 'GONE.md', target: 'GONE.md' }];
    };
    await expect(
      applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17', scanDangling }),
    ).rejects.toThrow(/dangling/i);
  });
});

describe('M5.E2.S1.t7c renderDryRun (three-tier)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-render-'));
    await setup(dir, { danglingDoc: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('renders counts, mechanical moves, and the faithfulness diff + flags pre-existing dangles', async () => {
    const out = await renderDryRun(dir);
    // Tier 1 — counts.
    expect(out).toMatch(/vector-1/);
    expect(out).toMatch(/vector-2/);
    // Tier 3 — the faithfulness diff shows the prose that will move.
    expect(out).toMatch(/meaningful narrative words/);
    // Pre-existing dangles are surfaced SEPARATELY (the migrate isn't blamed).
    expect(out).toMatch(/pre-existing dangling/i);
    expect(out).toMatch(/MISSING\.md/);
    // Nothing was written by the dry-run.
    const dry = await runMigrate(dir, { apply: false });
    expect(dry.applied).toBe(false);
  });
});

describe('M5.E4 — B15: the blocking dangling gate scans the FULL file (no 1 MB truncation)', () => {
  it('finds a dangling .md link PAST the 1 MB scan cap (RED under the old slice)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'b15-scan-'));
    const p = join(dir, '.planning');
    await mkdir(p, { recursive: true });
    // >1 MB of filler, THEN a dangling .md link past the old 1 MB truncation point.
    const filler = 'x'.repeat(1024 * 1024 + 100);
    await writeFile(
      join(p, 'BIG.md'),
      `${filler}\n\nA [dangling](does-not-exist-past-cap.md) link.\n`,
      'utf-8',
    );
    const dangling = await scanDanglingLinks(dir);
    // RED with the 1 MB slice: the link past the cap was never scanned → missed.
    expect(dangling.some((d) => /does-not-exist-past-cap\.md/.test(d.target))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});
