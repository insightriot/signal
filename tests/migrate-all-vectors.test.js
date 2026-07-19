// M5.E2 VERIFY — combined ALL-VECTORS integration fixture (the Nyquist gap).
//
// Every prior idempotency/rollback proof exercised ONE vector in isolation
// (migrate-idempotency = STATE-only V1/V2; migrate-archive-apply = archive-only;
// migrate-vector3 = V3-only; migrate-rollback = V1+V2). NONE fired V1 + V2 + V3 +
// archive-tree in a SINGLE applyMigrate. This fixture does — the compose order is
// V1 (frontmatter de-prose) → V3 (closed-Epic evict) → V2 (big-body relocate) →
// stamp → STATE write → archive-tree → dangling gate (see applyMigrate). V3 and
// archive-tree both write under archive/<m>/<e>/ (disjoint filenames in
// principle) — this proves it in practice, plus the load-bearing composition
// proof (idempotency) and the extended-snapshot all-or-nothing rollback under
// full composition.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  runMigrate,
  applyMigrate,
  senseState,
  deproseFrontmatter,
  conserves,
  WORD,
} from '../tools/lib/migrate-memory.js';
import { extractEpicSection } from '../tools/lib/evict.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// --- the ONE fixture that triggers all four vectors in a single apply ----------

// V2: a large un-sectioned body (> 8 KB) that stays over the threshold even after
// V3 evicts the M5.E1 section — link-free bulk so it word-conserves cleanly.
const BIG_NARRATIVE =
  'A live inlined narrative paragraph carrying meaning across many plain words. '.repeat(300);
// V1: an over-length completed_phases annotation (> 150 chars) that de-proses.
const V1_LONG =
  'a bounded but over-length annotation carrying real narrative meaning that must survive the de-prose verbatim '.repeat(3);
// V1: a blockers[].text block scalar (the cmmc pollution shape) that de-proses.
const BLOCKER_PROSE_1 =
  'The install path resolves wrong on first run under a stranger clone and the hook never fires so the guard is silently absent for the whole session.';
const BLOCKER_PROSE_2 =
  'A second sentence of blocker narrative that pushes this text field well past the five hundred character budget so the write guard would block it and the migrate must relocate it into the state body verbatim without dropping a single token of the prose it carries here now.';

// The scaffold link lives in the un-sectioned body (relocated to STATE-HISTORY.md
// by V2), so STATE-HISTORY.md becomes a REWRITTEN referrer — archive-tree's fresh
// re-sense picks up the V2-created file the pre-write snapshot loop never saw.
const STATE = [
  '---',
  'schema_version: 1',
  'phase: PLAN',
  'current_epic: M5.E2',
  'current_tasks: []',
  'completed_phases:',
  `  - "PLAN (2026-07-02) — ${V1_LONG}"`,
  'blockers:',
  '  - id: BR-1',
  '    text: |',
  `      ${BLOCKER_PROSE_1}`,
  `      ${BLOCKER_PROSE_2}`,
  '    raisedAt: 2026-07-03',
  '---',
  '# Project State',
  '',
  BIG_NARRATIVE,
  '',
  'See [the plan](M5.E1-PLAN.md) for the archived scaffold.',
  '',
  '## M5.E1 — Doc-runtime & memory hygiene',
  '',
  'Shipped 2026-07-16. Decisions D-M5E1-1, D-M5E1-3 locked. FR1 + FR2b delivered.',
  '',
].join('\n');

// V3: the retrospective is the closed-signal AND the card V3 verifies against; it
// covers every discrete token the M5.E1 section carries (IDs + date). It is NOT a
// scaffold suffix, so archive-tree never moves it (stays in root).
const M5E1_RETRO = [
  '# M5.E1 Retrospective',
  'Outcome: doc-runtime shipped 2026-07-16 (M5.E1).',
  'Decisions D-M5E1-1, D-M5E1-3 locked. FR1 + FR2b done.',
].join('\n');

// archive-tree: a closed-Epic scaffold in root → relocated to archive/M5/E1/.
const PLAN_BODY = '# M5.E1 plan\n\nScaffold content that must survive verbatim.\n';
// The referrer that links the scaffold — archive-tree rewrites this link.
const NOTES_BODY = 'Project notes. See [the plan](M5.E1-PLAN.md) for details.\n';

const bodyOf = (t) => t.slice(t.indexOf('\n---\n') + '\n---\n'.length);
const read = (dir, rel) => readFile(join(dir, '.planning', rel), 'utf-8');
const abs = (dir, rel) => join(dir, '.planning', rel);

async function setup(dir) {
  const p = join(dir, '.planning');
  await mkdir(p, { recursive: true });
  await writeFile(join(p, 'STATE.md'), STATE, 'utf-8');
  await writeFile(join(p, 'M5.E1-RETROSPECTIVE.md'), M5E1_RETRO, 'utf-8');
  await writeFile(join(p, 'M5.E1-PLAN.md'), PLAN_BODY, 'utf-8');
  await writeFile(join(p, 'NOTES.md'), NOTES_BODY, 'utf-8');
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

describe('M5.E2 all-vectors integration — V1 + V2 + V3 + archive-tree in one apply', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-allvec-'));
    await setup(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // --- 1. All four vectors fire in ONE apply → conformant + stamped ------------
  it('fires all four vectors in a single apply — conformant + docs_layout_version: 3 stamped', async () => {
    const r = await runMigrate(dir, { apply: true, stamp: 'T1', dateStr: '2026-07-17' });

    // The dry-run plan (sensed on the PRE-apply project) sees every vector.
    expect(r.plan.vectors).toEqual(expect.arrayContaining(['vector-1', 'vector-2']));
    expect(r.plan.v3.evicts.length).toBeGreaterThan(0);
    expect(r.plan.archive.moves.length).toBeGreaterThan(0);

    // The apply recorded all four as first-class moves.
    expect(r.applied).toBe(true);
    const vectorsRun = r.moves.map((m) => m.vector);
    expect(vectorsRun).toEqual(
      expect.arrayContaining(['vector-1', 'vector-3', 'vector-2', 'archive-tree']),
    );

    // Reached conformance in ONE invocation and stamped it to CURRENT (bumped 2→3
    // by S6a.t4). This fixture is stamp-NULL → needsV3 is TRUE (the 6dc7fa2 nullfix
    // routes stamp-null through the v3 migration) → the relocated tail gate stamps it
    // to CURRENT on full v3-conformance.
    expect(r.stampedTo).toBe(3);
    const finalState = await read(dir, 'STATE.md');
    const s = senseState(finalState);
    expect(s.conformant).toBe(true);
    expect(s.stamped).toBe(true);

    // V3 narrative + the archive-tree scaffold COEXIST in archive/M5/E1/ — the
    // "disjoint filenames in principle" the composition must prove in practice.
    expect(existsSync(abs(dir, 'archive/M5/E1/STATE-NARRATIVE.md'))).toBe(true); // V3
    expect(existsSync(abs(dir, 'archive/M5/E1/M5.E1-PLAN.md'))).toBe(true); // archive-tree
    // The scaffold left its flat root path; STATE-HISTORY holds the relocated body.
    expect(existsSync(abs(dir, 'M5.E1-PLAN.md'))).toBe(false);
    expect(existsSync(abs(dir, 'STATE-HISTORY.md'))).toBe(true);
  });

  // --- 2. Idempotency — the LOAD-BEARING composition proof ---------------------
  it('is idempotent — a second apply on the migrated project is a byte-identical no-op', async () => {
    await runMigrate(dir, { apply: true, stamp: 'T1', dateStr: '2026-07-17' });
    // Commit the first apply so the second runs on a clean tree.
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'migrate']);

    const before = await treeSnapshot(dir);
    const r2 = await applyMigrate(dir, { stamp: 'T2', dateStr: '2026-07-17' });
    const after = await treeSnapshot(dir);

    // If V1's de-prose had pushed the body past the V2 threshold and the first
    // apply had NOT composed V1→V2, this second apply would relocate again and
    // change files. Zero diff proves the compose reached conformance in one pass.
    expect(r2.applied).toBe(false);
    expect(after).toEqual(before);
    expect(String(git(dir, ['status', '--porcelain'])).trim()).toBe('');
  });

  // --- 3. Faithfulness across all vectors --------------------------------------
  it('conserves the de-prose + evict content and moves the archive scaffold byte-identical', async () => {
    await runMigrate(dir, { apply: true, stamp: 'T1', dateStr: '2026-07-17' });

    const history = await read(dir, 'STATE-HISTORY.md');
    const narrative = await read(dir, 'archive/M5/E1/STATE-NARRATIVE.md');

    // V1 de-prose: every token of the relocated frontmatter prose survives in the
    // body (now in STATE-HISTORY.md), zero dropped — the B8 catastrophe guard.
    const { removedProse } = deproseFrontmatter(STATE);
    const consV1 = conserves(removedProse, history, WORD);
    expect(consV1.pass).toBe(true);
    expect(consV1.missing).toHaveLength(0);
    // Ground-truth anchors (break the helper-on-helper circularity for the blocker
    // path, the one V1 shape no existing test exercises).
    expect(history).toContain('past the five hundred character budget'); // blocker prose
    expect(history).toContain('that must survive the de-prose verbatim'); // completed_phases prose

    // V2: the big un-sectioned body is word-conserved in STATE-HISTORY.md.
    const consV2 = conserves(BIG_NARRATIVE, history, WORD);
    expect(consV2.pass).toBe(true);
    expect(consV2.missing).toHaveLength(0);

    // V3 evict: the archived narrative is byte-identical to the extracted section
    // (move-never-delete); the live body kept only the one-line pointer.
    const expectedSection = extractEpicSection(bodyOf(STATE), 'M5.E1').section;
    expect(narrative).toBe(expectedSection);
    expect(history).toContain('- M5.E1 — evicted to .planning/archive/M5/E1/STATE-NARRATIVE.md');

    // archive-tree: the scaffold moved byte-identical; the referrers were rewritten
    // (NOTES.md AND the V2-created STATE-HISTORY.md — proving the fresh re-sense).
    expect(await read(dir, 'archive/M5/E1/M5.E1-PLAN.md')).toBe(PLAN_BODY);
    expect(await read(dir, 'NOTES.md')).toContain('[the plan](./archive/M5/E1/M5.E1-PLAN.md)');
    expect(history).toContain('](./archive/M5/E1/M5.E1-PLAN.md)');
    expect(history).not.toContain('](M5.E1-PLAN.md)');
  });

  // --- 4. All-or-nothing rollback under full composition -----------------------
  it('rolls back EVERY touched file byte-identical when the dangling gate trips', async () => {
    const stateBefore = await read(dir, 'STATE.md');
    const notesBefore = await read(dir, 'NOTES.md');
    const planBefore = await read(dir, 'M5.E1-PLAN.md');
    const retroBefore = await read(dir, 'M5.E1-RETROSPECTIVE.md');

    // Injected scanner: clean baseline (call 1), a NEW dangling link post-apply
    // (call 2) → enforceNoDangling aborts + surgically rolls back. By that point
    // V1/V3/V2 have written STATE.md, STATE-HISTORY.md, the V3 archive, and
    // archive-tree has moved the scaffold + rewritten the referrers.
    let calls = 0;
    const scanDangling = async () => {
      calls += 1;
      return calls === 1
        ? []
        : [{ file: '.planning/STATE.md', link: 'GONE.md', target: 'GONE.md' }];
    };

    await expect(
      applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17', scanDangling }),
    ).rejects.toThrow(/dangling/i);

    // Every file the composed apply touched is restored to its pre-apply bytes…
    expect(await read(dir, 'STATE.md')).toBe(stateBefore); // V1/V3/V2 write undone
    expect(await read(dir, 'NOTES.md')).toBe(notesBefore); // referrer rewrite undone
    expect(existsSync(abs(dir, 'M5.E1-PLAN.md'))).toBe(true); // move source restored
    expect(await read(dir, 'M5.E1-PLAN.md')).toBe(planBefore);
    expect(await read(dir, 'M5.E1-RETROSPECTIVE.md')).toBe(retroBefore); // never touched
    // …and every file the apply newly created is removed (no partial writes).
    expect(existsSync(abs(dir, 'STATE-HISTORY.md'))).toBe(false); // V2 dest
    expect(existsSync(abs(dir, 'archive/M5/E1/STATE-NARRATIVE.md'))).toBe(false); // V3 dest
    expect(existsSync(abs(dir, 'archive/M5/E1/M5.E1-PLAN.md'))).toBe(false); // archive-tree dest
  });
});
