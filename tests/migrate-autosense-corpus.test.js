// M5.E2.S2.t5b — full-corpus auto-sense brain + fixture matrix.
//
// senseProject unifies ONE per-project plan: the 3 within-STATE vectors + the
// archive-tree move set + the axis-2 corpus classification (append-logs left
// alone, bloated milestone docs flagged for MANUAL review). Proven across a
// fixture matrix of project shapes.
//
// THE LOAD-BEARING PROOF-OF-FAIL (append-log protection, doc-runtime-model §1
// axis-2): a large `DECISIONS.md` must be LEFT UNTOUCHED — never relocated,
// evicted, de-prosed, or even flagged as "bloat" (an append-log grows BY DESIGN;
// "large ≠ bloated" is the exact fallacy axis-2 exists to kill). Demonstrated RED
// against a naive "large = bloated" brain that flags DECISIONS.md → the untouched
// assertion fails; the axis-2 partition (append-log → left-alone) turns it GREEN.
// The spec says "moved"; no move-path for an append-log exists (planArchiveMoves
// only emits `{epicId}-{suffix}.md`, the vectors only touch STATE.md, and
// deliverable 4 forbids building a corpus relocator), so the RED manifests in the
// aggregated flag set — and the fixture also asserts DECISIONS.md is absent from
// `archive.moveMap` (the never-relocated invariant, cheap + always-green).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  senseProject,
  senseCorpusHygiene,
  classifyDocGrowthPolicy,
  renderDryRun,
  applyMigrate,
  CURRENT_LAYOUT_VERSION,
} from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// --- fixtures (project shapes) --------------------------------------------------

const CONFORMANT_STATE =
  `---\nschema_version: 1\ndocs_layout_version: ${CURRENT_LAYOUT_VERSION}\nphase: PLAN\n` +
  `current_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases:\n  - DISCUSS (2026-07-16)\nblockers: []\n---\n` +
  `# Project State\n\nshort live body\n`;

// partial — conformant body but UNSTAMPED + a vector-1 over-length prose entry.
const PARTIAL_STATE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "PLAN (2026-07-04) — ${'a bounded narrative annotation of some length '.repeat(6)}"\n` +
  `blockers: []\n---\n# Project State\n\nsmall body\n`;

// linear — GSD-style numeric-phase project, NO Epics, NO retros.
const LINEAR_STATE =
  `---\nschema_version: 1\ndocs_layout_version: ${CURRENT_LAYOUT_VERSION}\nphase: BUILD\n` +
  `current_tasks: []\ncompleted_phases:\n  - 01-setup (2026-01-02)\n  - 02-scaffold (2026-01-03)\nblockers: []\n---\n` +
  `# Project State\n\nlinear numeric-phase project, no Epic sections\n`;

// non-standard — conformant STATE, plus oddly-named docs the brain must leave alone.
const NONSTANDARD_STATE =
  `---\nschema_version: 1\ndocs_layout_version: ${CURRENT_LAYOUT_VERSION}\nphase: PLAN\n` +
  `current_epic: M5.E2\ncurrent_tasks: []\ncompleted_phases:\n  - DISCUSS (2026-07-16)\nblockers: []\n---\n` +
  `# Project State\n\nshort body\n`;

// CMMC-shape — the multi-line quoted completed_phases pollution (vector-1). Reuses
// the exact SHAPE tests/migrate-vector1.test.js builds.
const CMMC_STATE =
  `---\n` +
  `schema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n` +
  `  - CALIBRATE (2026-05-13)\n` +
  `  - "**Active: Slice SEC1 — Supabase hardening: DISCUSS done then\n` +
  `    PLAN done landed 2026-07-01 (4-agent research plus MCP pulls plus\n` +
  `    independent plan-checker 8-dim PASS-WITH-NOTES)"\n` +
  `blockers: []\n---\n# Project State\n\nexisting body\n`;

// nextpass-shape — one big un-sectioned inlined body (vector-2).
const NEXTPASS_STATE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases: []\nblockers: []\n---\n# Project State\n\n${'inlined narrative paragraph here. '.repeat(600)}\n`;

// A big append-log (> the 8 KB corpus-bloat threshold) — the load-bearing tempt.
const BIG_DECISIONS =
  `# Decisions\n\n${'- 2026-01-01 D-x — a locked decision with rationale and IDs D-M5E2-1 FR6. '.repeat(200)}\n`;

async function mkProject(files) {
  const dir = await mkdtemp(join(tmpdir(), 'signal-corpus-'));
  const planning = join(dir, '.planning');
  await mkdir(planning, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(planning, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content, 'utf-8');
  }
  return dir;
}

function initGit(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

async function treeSnapshot(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== '.migrate') await walk(join(d, e.name));
      } else {
        out[join(d, e.name)] = await readFile(join(d, e.name), 'utf-8');
      }
    }
  }
  await walk(join(dir, '.planning'));
  return out;
}

// --- axis-2 classifier (unit) ---------------------------------------------------
describe('M5.E2.S2.t5b classifyDocGrowthPolicy — model §1 axis-2', () => {
  it('classes append-logs, spine, milestone, and other docs', () => {
    expect(classifyDocGrowthPolicy('DECISIONS.md')).toBe('append-log');
    expect(classifyDocGrowthPolicy('RETROSPECTIVES.md')).toBe('append-log');
    expect(classifyDocGrowthPolicy('INDEX.md')).toBe('spine');
    expect(classifyDocGrowthPolicy('MILESTONE-4.5.md')).toBe('milestone');
    expect(classifyDocGrowthPolicy('MILESTONE-5.md')).toBe('milestone');
    expect(classifyDocGrowthPolicy('PROJECT.md')).toBe('other');
    expect(classifyDocGrowthPolicy('M5.E2-PLAN.md')).toBe('other');
  });
});

// --- THE LOAD-BEARING PROOF-OF-FAIL: append-log left untouched -------------------
describe('M5.E2.S2.t5b append-log protection — DECISIONS.md left untouched', () => {
  let dir;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('a large DECISIONS.md is NOT relocated, NOT flagged — surfaced as left-alone', async () => {
    // A conformant STATE + a genuinely-closed Epic (so archive-tree DOES produce a
    // move) + a big append-log. The move set proves archive-tree fires; the
    // assertion proves DECISIONS.md is nowhere in it.
    dir = await mkProject({
      'STATE.md': CONFORMANT_STATE,
      'DECISIONS.md': BIG_DECISIONS,
      'M6.E1-RETROSPECTIVE.md': '# M6.E1 retro\n',
      'M6.E1-PLAN.md': '# M6.E1 plan\n\ncontent\n',
    });
    const plan = await senseProject(dir);

    // (1) NOT flagged as bloat (RED against a "large = bloated" brain).
    expect(plan.flags.some((f) => String(f.file ?? '').endsWith('DECISIONS.md'))).toBe(false);
    // (2) NOT relocated — absent from the archive move set + moveMap (the
    //     never-relocated invariant).
    expect(plan.archive.moves.some((m) => m.from.endsWith('DECISIONS.md') || m.to.endsWith('DECISIONS.md'))).toBe(false);
    expect([...plan.archive.moveMap.keys()].some((k) => k.endsWith('DECISIONS.md'))).toBe(false);
    // (3) SURFACED as left-alone (the "shouldn't touch" display, command doc §35).
    expect(plan.appendLogs.some((a) => a.file.endsWith('DECISIONS.md'))).toBe(true);

    // The closed Epic's scaffold IS in the move set — proving the brain isn't just
    // inert (the moveMap has entries; DECISIONS.md simply isn't one of them).
    expect([...plan.archive.moveMap.keys()].some((k) => k.endsWith('M6.E1-PLAN.md'))).toBe(true);
  });

  it('the human-facing dry-run shows DECISIONS.md as an append-log left alone', async () => {
    dir = await mkProject({ 'STATE.md': CONFORMANT_STATE, 'DECISIONS.md': BIG_DECISIONS });
    const out = await renderDryRun(dir);
    expect(out).toMatch(/append-log/i);
    expect(out).toContain('DECISIONS.md');
  });

  it('APPLY leaves a big DECISIONS.md byte-identical (archive-tree never relocates it)', async () => {
    // Deliverable 2 says "untouched by archive-tree" — an APPLY-time writer. Prove
    // the safety property where the WRITE happens (not just in the plan): apply on a
    // conformant STATE + a genuinely-closed Epic (so an archive move DOES fire) + a
    // big append-log that does NOT reference the moved scaffold. The scaffold moves;
    // DECISIONS.md stays byte-identical + is never in the moved set. (Its protection
    // at the MOVE layer is structural — it doesn't match `{epicId}-{suffix}` — so
    // this is the regression guard for a future corpus relocator, FR5/E3.)
    dir = await mkProject({
      'STATE.md': CONFORMANT_STATE,
      'DECISIONS.md': BIG_DECISIONS,
      'M6.E1-RETROSPECTIVE.md': '# M6.E1 retro\n',
      'M6.E1-PLAN.md': '# M6.E1 plan\n\ncontent\n',
    });
    initGit(dir);
    const before = await readFile(join(dir, '.planning', 'DECISIONS.md'), 'utf-8');
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied).toBe(true);
    // The closed scaffold actually moved (the archive-tree step ran)…
    expect(r.moves.some((m) => m.vector === 'archive-tree')).toBe(true);
    expect(existsSync(join(dir, '.planning', 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(true);
    // …but DECISIONS.md is byte-identical and was never relocated into the archive.
    expect(await readFile(join(dir, '.planning', 'DECISIONS.md'), 'utf-8')).toBe(before);
    expect(existsSync(join(dir, '.planning', 'archive', 'M6', 'E1', 'DECISIONS.md'))).toBe(false);
  });

  it('senseCorpusHygiene lists append-logs and never flags them', async () => {
    dir = await mkProject({
      'STATE.md': CONFORMANT_STATE,
      'DECISIONS.md': BIG_DECISIONS,
      'RETROSPECTIVES.md': '# Retros index\n- a\n',
    });
    const corpus = await senseCorpusHygiene(dir);
    expect(corpus.appendLogs.map((a) => a.file.split('/').pop()).sort()).toEqual(
      ['DECISIONS.md', 'RETROSPECTIVES.md'],
    );
    expect(corpus.flags.some((f) => String(f.file ?? '').includes('DECISIONS'))).toBe(false);
  });
});

// --- milestone conservatism (deliverable 4 / S2.t3 handoff) ---------------------
describe('M5.E2.S2.t5b milestone docs — flag for manual review, NEVER auto-move', () => {
  let dir;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('a bloated MILESTONE-N.md is FLAGGED (manual review), not relocated', async () => {
    const bigMilestone = `# Milestone 4\n\n${'milestone narrative that piled up over time. '.repeat(300)}\n`;
    dir = await mkProject({
      'STATE.md': CONFORMANT_STATE,
      'MILESTONE-4.md': bigMilestone,
    });
    const plan = await senseProject(dir);
    // Flagged for MANUAL review…
    expect(plan.flags.some((f) => f.kind === 'milestone-bloat' && f.file.endsWith('MILESTONE-4.md'))).toBe(true);
    // …but NEVER in the move set (relocate-never-delete conservatism).
    expect(plan.archive.moves.some((m) => m.from.endsWith('MILESTONE-4.md'))).toBe(false);
    expect([...plan.archive.moveMap.keys()].some((k) => k.endsWith('MILESTONE-4.md'))).toBe(false);
  });

  it('a SMALL milestone doc is left alone (below the bloat threshold)', async () => {
    dir = await mkProject({
      'STATE.md': CONFORMANT_STATE,
      'MILESTONE-9.md': '# Milestone 9\n\ntiny\n',
    });
    const plan = await senseProject(dir);
    expect(plan.flags.some((f) => f.file && f.file.endsWith('MILESTONE-9.md'))).toBe(false);
  });
});

// --- the fixture matrix: each shape asserts its correct plan ---------------------
describe('M5.E2.S2.t5b fixture matrix — each project shape → correct unified plan', () => {
  let dir;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('conformant → a TRUE no-op (no vectors, no evicts, no moves)', async () => {
    dir = await mkProject({ 'STATE.md': CONFORMANT_STATE });
    const plan = await senseProject(dir);
    expect(plan.vectors).toEqual([]);
    expect(plan.v3.evicts).toHaveLength(0);
    expect(plan.archive.moves).toHaveLength(0);
    expect(plan.noop).toBe(true);
  });

  it('conformant → zero diff on apply (idempotent no-op)', async () => {
    dir = await mkProject({ 'STATE.md': CONFORMANT_STATE });
    initGit(dir);
    const before = await treeSnapshot(dir);
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    const after = await treeSnapshot(dir);
    expect(r.applied).toBe(false);
    expect(after).toEqual(before);
    expect(String(git(dir, ['status', '--porcelain'])).trim()).toBe('');
  });

  it('partial → vector-1 pending, not a no-op', async () => {
    dir = await mkProject({ 'STATE.md': PARTIAL_STATE });
    const plan = await senseProject(dir);
    expect(plan.vectors).toContain('vector-1');
    expect(plan.noop).toBe(false);
  });

  it('linear (GSD numeric-phase, no Epics) → no evicts, no archive moves', async () => {
    dir = await mkProject({ 'STATE.md': LINEAR_STATE, '01-plan.md': '# step one\n' });
    const plan = await senseProject(dir);
    expect(plan.v3.evicts).toHaveLength(0);
    expect(plan.archive.moves).toHaveLength(0);
    // The numeric-prefixed doc is neither flagged nor moved (an 'other' doc).
    expect(plan.flags.some((f) => f.file && f.file.endsWith('01-plan.md'))).toBe(false);
    expect(plan.noop).toBe(true);
  });

  it('non-standard (odd doc names) → brain leaves unknown docs alone', async () => {
    dir = await mkProject({
      'STATE.md': NONSTANDARD_STATE,
      'SCRATCH.md': '# scratchpad\nrandom\n',
      'notes.md': '# notes\nfree-form\n',
    });
    const plan = await senseProject(dir);
    expect(plan.flags.some((f) => f.file && /SCRATCH\.md|notes\.md/.test(f.file))).toBe(false);
    expect(plan.archive.moves).toHaveLength(0);
    expect(plan.noop).toBe(true);
  });

  it('CMMC-shape (multi-line quoted completed_phases) → vector-1', async () => {
    dir = await mkProject({ 'STATE.md': CMMC_STATE });
    const plan = await senseProject(dir);
    expect(plan.vectors).toContain('vector-1');
    expect(plan.v1.entries.length).toBeGreaterThan(0);
    expect(plan.noop).toBe(false);
  });

  it('nextpass-shape (big un-sectioned body) → vector-2', async () => {
    dir = await mkProject({ 'STATE.md': NEXTPASS_STATE });
    const plan = await senseProject(dir);
    expect(plan.vectors).toContain('vector-2');
    expect(plan.v2.candidate).toBe(true);
    expect(plan.noop).toBe(false);
  });
});

// --- unified plan shape ---------------------------------------------------------
describe('M5.E2.S2.t5b senseProject — one unified per-project plan object', () => {
  let dir;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('returns 3 vectors + archive + appendLogs + unified flags in one object', async () => {
    dir = await mkProject({ 'STATE.md': CONFORMANT_STATE, 'DECISIONS.md': BIG_DECISIONS });
    const plan = await senseProject(dir);
    // within-STATE vectors
    expect(plan).toHaveProperty('vectors');
    expect(plan).toHaveProperty('v1');
    expect(plan).toHaveProperty('v2');
    expect(plan).toHaveProperty('v3');
    // archive-tree
    expect(plan).toHaveProperty('archive.moves');
    expect(plan.archive.moveMap instanceof Map).toBe(true);
    // corpus classification
    expect(Array.isArray(plan.appendLogs)).toBe(true);
    expect(Array.isArray(plan.flags)).toBe(true);
    // stamp + noop rollup
    expect(plan).toHaveProperty('stamped');
    expect(plan).toHaveProperty('noop');
  });
});
