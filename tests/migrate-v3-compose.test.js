// M5.E3.S6a.t2 — the v2→v3 mechanical chain composed into applyMigrate.
//
// V1→V3→V2 → append-log-evict → BACKLOG-create → rename → index-regen → stamp,
// under ONE coarse lock + ONE snapshot + ONE dangling gate. The chain fires ONLY
// when the STATE stamp is BELOW the current layout version (needsV3); with the
// constant still 2 it is INERT on a real v2 repo (stamp 2) and exercised here by
// stamp-1 fixtures. Built RED-first — none of the v3 steps run before this task.
//
// Three load-bearing proofs:
//   CHECK-ITEM 1 — a conformant-STATE, evict-pending / BACKLOG-missing project
//                  MIGRATES (is not falsely no-op'd).
//   CHECK-ITEM 2 — a moved DECISIONS block's relative `](*.md)` link is RE-ROOTED
//                  to resolve from its new archive home; D-… anchors stay
//                  byte-identical; the dangling gate stays green.
//   Rollback     — a mid-apply throw at each new step rolls back BYTE-IDENTICAL
//                  (the E2 C1 lesson: the rollback wraps the whole mechanical phase).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// A CONFORMANT STATE.md (no V1/V2 vectors) stamped at `ver`. A stamp of 1 is
// v3-pending (1 < CURRENT 2 → needsV3); a stamp of 2 is a real v2 repo (inert).
const STATE = (ver) =>
  `---\nschema_version: 1\ndocs_layout_version: ${ver}\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
  `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
  `# Project State\n\nlive pointer\n`;

// DECISIONS.md: one strictly-closed M1 section (evicts) carrying a relative link to
// an EXISTING archived file (forces the re-root decision), + one current section.
const DECISIONS =
  '# Decisions\n\nProject decision log.\n\n---\n\n' +
  '## 2026-01-10 — Closed M1 decision\n\n' +
  '**Decision:** Alpha baseline (D-A-1). See [the M1 plan](archive/M1/foo.md) for detail.\n\n---\n\n' +
  '## 2026-03-05 — Current decision\n\n**Decision:** Current work (D-C-1).\n';

const BOUNDARY = '2026-03-01';
const RUN_DATE = '2026-03-10';
const milestoneOf = () => 'M1';
const OPTS = { stamp: 'T1', dateStr: RUN_DATE, boundaryDate: BOUNDARY, milestoneOf };

// Stand up a git repo with `.planning/` populated per the scenario.
async function makeRepo({ ver = 1, decisions = DECISIONS, futureIdeas = true, backlog = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'v3-compose-'));
  const planning = join(dir, '.planning');
  await mkdir(join(planning, 'archive', 'M1'), { recursive: true });
  await writeFile(join(planning, 'STATE.md'), STATE(ver), 'utf-8');
  if (decisions) await writeFile(join(planning, 'DECISIONS.md'), decisions, 'utf-8');
  // The link target the M1 block references — present, so the re-root stays valid.
  await writeFile(join(planning, 'archive', 'M1', 'foo.md'), '# foo\n', 'utf-8');
  if (futureIdeas) await writeFile(join(planning, 'FUTURE-IDEAS.md'), '# Future Ideas\n\n## idea\n\nbody\n', 'utf-8');
  if (backlog) await writeFile(join(planning, 'BACKLOG.md'), '# Backlog\n\nexisting\n', 'utf-8');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

const read = (dir, ...p) => readFile(join(dir, '.planning', ...p), 'utf-8');
const has = (dir, ...p) => existsSync(join(dir, '.planning', ...p));

// Byte-snapshot of every `.planning/**/*.md` (skip the .migrate scratch dir).
async function treeSnapshot(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== '.migrate') await walk(join(d, e.name)); }
      else if (e.name.endsWith('.md')) out[join(d, e.name)] = await readFile(join(d, e.name), 'utf-8');
    }
  }
  await walk(join(dir, '.planning'));
  return out;
}

describe('t2 — CHECK-ITEM 1: a v3-pending project MIGRATES, not no-ops', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('a conformant STATE that still needs the evict + lacks BACKLOG.md migrates', async () => {
    // Already-renamed inbox (no FUTURE-IDEAS) + no scaffold moves, so the ONLY work
    // is the append-log evict + BACKLOG create. Proves a v3-pending project MIGRATES
    // (not no-op'd). NB: needsV3 ⟹ stamp < CURRENT ⟹ plan.noop is already false, so
    // the gate's explicit v3-pending term is a defensive invariant that RESTATES that
    // (it never flips a live decision), not the sole reason this case is not no-op'd.
    dir = await makeRepo({ ver: 1, futureIdeas: false, backlog: false });
    const res = await applyMigrate(dir, OPTS);
    expect(res.applied).toBe(true);
    // BACKLOG created + the closed decision evicted (not silently no-op'd).
    expect(has(dir, 'BACKLOG.md')).toBe(true);
    expect(has(dir, 'archive', 'M1', 'DECISIONS.md')).toBe(true);
    expect(res.moves.some((m) => m.vector === 'append-log-evict')).toBe(true);
    expect(res.moves.some((m) => m.vector === 'backlog-create')).toBe(true);
  });
});

describe('t2 — CHECK-ITEM 2: re-root the moved-block relative link', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('re-roots `](archive/M1/foo.md)` → `](./foo.md)`; D-anchor byte-identical; gate green', async () => {
    dir = await makeRepo({ ver: 1, futureIdeas: false });
    const res = await applyMigrate(dir, OPTS);
    expect(res.applied).toBe(true);

    const archive = await read(dir, 'archive', 'M1', 'DECISIONS.md');
    // The relative file-link is re-rooted to resolve from archive/M1/ (sibling foo.md)…
    expect(archive).toContain('](./foo.md)');
    expect(archive).not.toContain('](archive/M1/foo.md)');
    // …while the bare D-… decision anchor stays BYTE-identical (no `](` delimiter).
    expect(archive).toContain('Alpha baseline (D-A-1)');
    // The dangling gate stayed green — the migrate applied without abort, and the
    // re-rooted link resolves (foo.md is a sibling of the archived DECISIONS.md).
    expect(existsSync(join(dir, '.planning', 'archive', 'M1', 'foo.md'))).toBe(true);
  });
});

describe('t2 — full v2→v3 compose (clean apply)', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('renames the inbox, creates BACKLOG, evicts the closed decision, regens INDEX', async () => {
    dir = await makeRepo({ ver: 1, futureIdeas: true, backlog: false });
    const res = await applyMigrate(dir, OPTS);
    expect(res.applied).toBe(true);

    // Rename (FR6): inbox renamed, source gone.
    expect(has(dir, 'ISSUES-INBOX.md')).toBe(true);
    expect(has(dir, 'FUTURE-IDEAS.md')).toBe(false);
    // BACKLOG created (FR2).
    expect(has(dir, 'BACKLOG.md')).toBe(true);
    // Append-log evict (FR5): archive created, live DECISIONS shrank + carries a pointer.
    expect(has(dir, 'archive', 'M1', 'DECISIONS.md')).toBe(true);
    const live = await read(dir, 'DECISIONS.md');
    expect(live).toContain('<!-- append-log-evicted: M1 -->');
    expect(live).not.toContain('Alpha baseline');
    expect(live).toContain('Current work (D-C-1)'); // current section stays live
    // Index regenerated (FR3) — the SOLE INDEX refresh.
    expect(has(dir, 'INDEX.md')).toBe(true);
  });

  it('is idempotent — a second apply (now stamped) is a no-op', async () => {
    dir = await makeRepo({ ver: 1, futureIdeas: true, backlog: false });
    await applyMigrate(dir, OPTS);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'migrate']);
    const before = await treeSnapshot(dir);
    const r2 = await applyMigrate(dir, { ...OPTS, stamp: 'T2' });
    expect(r2.applied).toBe(false);
    expect(await treeSnapshot(dir)).toEqual(before);
  });
});

describe('t2 — INERT on a real v2 repo (stamp 2 — the safety posture)', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('a stamp-2 project with FUTURE-IDEAS + closed DECISIONS + no BACKLOG is untouched', async () => {
    dir = await makeRepo({ ver: 2, futureIdeas: true, backlog: false });
    const before = await treeSnapshot(dir);
    const res = await applyMigrate(dir, OPTS);
    expect(res.applied).toBe(false); // no v3 work fired
    expect(has(dir, 'FUTURE-IDEAS.md')).toBe(true); // not renamed
    expect(has(dir, 'BACKLOG.md')).toBe(false); // not created
    expect(has(dir, 'archive', 'M1', 'DECISIONS.md')).toBe(false); // not evicted
    expect(await treeSnapshot(dir)).toEqual(before); // byte-identical
  });
});

describe('t2 — rollback byte-identical on a mid-apply throw (E2 C1)', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('evict anchor-gate failure (detect-only) rolls back the whole phase byte-identical', async () => {
    dir = await makeRepo({ ver: 1, futureIdeas: true, backlog: false });
    const before = await treeSnapshot(dir);
    // Force every evicted anchor to miss → the seam's detect-only fires the shared
    // rollback, then applyMigrate throws (fail-closed whole-migrate).
    await expect(
      applyMigrate(dir, { ...OPTS, resolveId: async () => '.planning/DECISIONS.md' }),
    ).rejects.toThrow(/anchor gate/i);
    // Nothing partial: DECISIONS restored, no archive, no BACKLOG, inbox NOT renamed.
    expect(await treeSnapshot(dir)).toEqual(before);
    expect(has(dir, 'FUTURE-IDEAS.md')).toBe(true);
    expect(has(dir, 'ISSUES-INBOX.md')).toBe(false);
    expect(has(dir, 'BACKLOG.md')).toBe(false);
    expect(has(dir, 'archive', 'M1', 'DECISIONS.md')).toBe(false);
  });

  it('a downstream dangling abort (after evict+BACKLOG+rename+index) rolls back byte-identical', async () => {
    dir = await makeRepo({ ver: 1, futureIdeas: true, backlog: false });
    const before = await treeSnapshot(dir);
    // Clean baseline (call 1), then a NEW dangle post-apply (call 2) → enforceNoDangling
    // aborts. By then the evict, BACKLOG, rename + index-regen have all run.
    let calls = 0;
    const scanDangling = async () => (++calls === 1 ? [] : [{ file: '.planning/STATE.md', link: 'GONE.md', target: 'GONE.md' }]);
    await expect(applyMigrate(dir, { ...OPTS, scanDangling })).rejects.toThrow(/dangling/i);
    // The WHOLE mechanical phase is restored: DECISIONS, the archive, BACKLOG, the
    // rename (inbox back to FUTURE-IDEAS), the regenerated INDEX — all byte-identical.
    expect(await treeSnapshot(dir)).toEqual(before);
    expect(has(dir, 'FUTURE-IDEAS.md')).toBe(true);
    expect(has(dir, 'ISSUES-INBOX.md')).toBe(false);
    expect(has(dir, 'BACKLOG.md')).toBe(false);
    expect(has(dir, 'archive', 'M1', 'DECISIONS.md')).toBe(false);
    expect(has(dir, 'INDEX.md')).toBe(false);
  });
});
