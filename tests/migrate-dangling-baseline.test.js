// M5.E2.S1.t7c — pre-apply dangling-link baseline + dry-run three-tier render.
//
// FR6.3 "before AND after": a dangling link that ALREADY existed before the
// migrate must not be attributed to it (else a stranger's pre-broken repo can
// never be migrated). Only NEW dangles the migrate introduces abort+rollback.
// Proof-of-fail: a pre-existing dangle attributed to the migrate → apply aborts →
// the test (which expects success) fails.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

// M5.E4.T4.1 — B23(a): the ORGANIC (non-injected) re-root-to-missing dangle path.
//
// The append-log evict re-roots the inline `](*.md)` links inside each evicted
// DECISIONS block (rerootEvictPlan) so they resolve from the block's NEW archive
// home. That reroot recomputes each link's relative path to the SAME absolute
// target, so a link that RESOLVED before the move still resolves after — the reroot
// is resolution-PRESERVING and can never, on its own, turn a resolving link into a
// dangle. (The happy path — `](archive/M1/foo.md)` → `](./foo.md)`, gate green — is
// already covered by migrate-v3-compose.test.js CHECK-ITEM 2.) So B23(a)'s literal
// framing — "a link that resolves pre-migrate but the reroot makes it dangle" — is
// UNREACHABLE: computeLinkEdits rebuilds `rel` to the identical absolute target.
//
// What IS reachable, and what this block pins, is the REAL, non-injected dangling
// gate → abort → byte-identical rollback — driven by a genuinely-missing target
// rather than a stubbed scanner (the other abort tests around it stub `scanDangling`
// or `resolveId`: the `:87` case below, and migrate-v3-compose's downstream-dangling
// case): a link whose target is GENUINELY missing sitting inside a strictly-closed
// DECISIONS block. Eviction moves the block to
// archive/M1/ AND re-roots the still-broken link, so computeDanglingDelta — which
// keys on `file\0link` — sees a NEW file + NEW link text and cannot subtract it
// against the pre-apply baseline. enforceNoDangling flags it; applyMigrate aborts and
// rolls back byte-identical.
//
// FINDING (surfaced for triage — product code is out of scope for this coverage
// task): this abort fires on a PRE-EXISTING dangle (ghost.md was missing before the
// migrate touched anything). That is in tension with the `:81` contract above ("a
// PRE-EXISTING dangle is NOT attributed to the migrate — apply succeeds") and FR6.3
// ("a dangling link that ALREADY existed ... must not be attributed to it, else a
// stranger's pre-broken repo can never be migrated"): a stranger whose closed
// DECISIONS section carries ANY broken `](*.md)` link is blocked from migrating.
// Baseline-subtraction is defeated by the evict's OWN block-move + reroot changing
// both the file path and the link text. The rollback is fail-SAFE (never a partial
// write), but the over-eager abort is a candidate bug. This test asserts the CURRENT
// behavior (abort + full rollback); it does not endorse it as correct.
describe('M5.E4 — B23(a): a REAL (non-injected) dangle inside an EVICTED closed-milestone block', () => {
  // A v3-pending STATE (docs_layout_version below CURRENT → needsV3) so the append-log
  // evict fires under applyMigrate.
  const V3_STATE =
    `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
    `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
    `# Project State\n\nlive pointer\n`;
  // One strictly-closed M1 section (evicts) whose inline link points at a GENUINELY
  // missing file (ghost.md is never created), + one current section that stays live.
  const V3_DECISIONS =
    '# Decisions\n\nProject decision log.\n\n---\n\n' +
    '## 2026-01-10 — Closed M1 decision\n\n' +
    '**Decision:** Alpha baseline (D-A-1). See [the M1 plan](./ghost.md) for detail.\n\n---\n\n' +
    '## 2026-03-05 — Current decision\n\n**Decision:** Current work (D-C-1).\n';
  const EVICT_OPTS = { stamp: 'T1', dateStr: '2026-03-10', boundaryDate: '2026-03-01', milestoneOf: () => 'M1' };

  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-b23a-'));
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await writeFile(join(planning, 'STATE.md'), V3_STATE, 'utf-8');
    await writeFile(join(planning, 'DECISIONS.md'), V3_DECISIONS, 'utf-8');
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('the migrate re-roots a real broken link → the non-injected gate aborts + rolls back byte-identical', async () => {
    const decisionsPath = join(dir, '.planning', 'DECISIONS.md');
    const before = await readFile(decisionsPath, 'utf-8');
    // The dangle is REAL, not injected: ghost.md is genuinely absent and NO stubbed
    // scanDangling / resolveId is passed — the live scanDanglingLinks gate catches it.
    expect(existsSync(join(dir, '.planning', 'ghost.md'))).toBe(false);

    let err;
    try {
      await applyMigrate(dir, EVICT_OPTS);
    } catch (e) {
      err = e;
    }
    expect(err, 'applyMigrate must abort on the re-rooted dangle').toBeDefined();
    expect(err.message).toMatch(/dangling/i);
    // The offending dangle is the migrate's OWN re-rooted link at its NEW archive home
    // (…->../../ghost.md), proving the reroot machinery — not a stubbed scanner —
    // produced it.
    expect(err.message).toContain('archive/M1/DECISIONS.md');
    expect(err.message).toContain('ghost.md');

    // Full rollback: the live DECISIONS.md is byte-identical and the archive the evict
    // began writing was removed (never a partial write).
    expect(await readFile(decisionsPath, 'utf-8')).toBe(before);
    expect(existsSync(join(dir, '.planning', 'archive', 'M1', 'DECISIONS.md'))).toBe(false);
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
