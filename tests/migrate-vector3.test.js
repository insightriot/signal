// M5.E2.S2.t2 — vector-3 retroactive evict LOOP.
//
// Relocates CLOSED-Epic narrative out of the live STATE body into the archive
// tree, gated by faithfulness, via the LOCK-FREE relocateFaithful spine (never the
// self-locking evictEpicNarrative). The load-bearing proof-of-fail is the
// NO-FABRICATE gate: a closed-LOOKING body section with no retrospective must be
// SKIPPED + FLAGGED, never evicted against a fabricated card. Also covers: a
// genuine closed Epic (retro present) is evicted + conservation holds; the
// per-evict gate aborts a lossy card with zero partial writes; the mixed-body
// guard never whole-body-relocates on one Epic's behalf; and the apply path holds
// the coarse lock ONCE (no re-entry — evictEpicNarrative would throw under it).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { withStateLock } from '../tools/lib/state.js';
import { evictEpicNarrative } from '../tools/lib/evict.js';
import {
  planVector3,
  senseVector3,
  applyMigrate,
} from '../tools/lib/migrate-memory.js';

const FRONTMATTER = [
  '---',
  'schema_version: 1',
  'phase: SHIP',
  'current_epic: M5.E2',
  'current_wave: null',
  'current_tasks: []',
  'completed_phases: []',
  'blockers: []',
  'last_decision_at: null',
  'last_updated_commit: null',
  'last_updated: 2026-07-16T00:00:00.000Z',
  '---',
].join('\n');

// A live body with an M5.E1 Epic-ID section heading — the "closed-looking" shape
// extractEpicSection finds. Narrative carries IDs + a date so coverage is testable.
const M5E1_SECTION_BODY = [
  '# Project State',
  '',
  '## M5.E1 — Doc-runtime & memory hygiene',
  '',
  'Shipped 2026-07-16. Decisions D-M5E1-1, D-M5E1-3 locked. FR1 + FR2b delivered.',
  '',
].join('\n');

// A faithful retrospective covering every discrete token M5E1_SECTION_BODY carries.
const M5E1_RETRO_FAITHFUL = [
  '# M5.E1 Retrospective',
  'Outcome: doc-runtime shipped 2026-07-16 (M5.E1).',
  'Decisions D-M5E1-1, D-M5E1-3 locked. FR1 + FR2b done.',
].join('\n');

describe('M5.E2.S2.t2 vector-3 retroactive evict loop', () => {
  let baseDir;
  let planningDir;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-v3-loop-'));
    planningDir = join(baseDir, '.planning');
    await mkdir(planningDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  // FRONTMATTER ends at the closing '---'; the '\n' separator makes the fence
  // close as '---\n' so the extracted body region equals `body` byte-for-byte.
  const writeState = (body) =>
    writeFile(join(planningDir, 'STATE.md'), FRONTMATTER + '\n' + body, 'utf-8');
  const writeRetro = (epicId, content) =>
    writeFile(join(planningDir, `${epicId}-RETROSPECTIVE.md`), content, 'utf-8');
  const readState = () => readFile(join(planningDir, 'STATE.md'), 'utf-8');
  const archivePath = (m, e) =>
    join(planningDir, 'archive', m, e, 'STATE-NARRATIVE.md');

  // --- THE LOAD-BEARING PROOF-OF-FAIL: no-fabricate gate --------------------
  it('NO-FABRICATE: a closed-looking section with NO retrospective is SKIPPED + FLAGGED, never evicted', async () => {
    await writeState(M5E1_SECTION_BODY);
    // Deliberately NO M5.E1-RETROSPECTIVE.md — the Epic is not genuinely closed.
    const raw = await readState();

    // (a) The pure router flags it and evicts NOTHING (no card to verify against).
    //     A fabricate-a-card impl would instead push M5.E1 into `evicts` (using the
    //     section as its own card) — this assertion is the RED tripwire.
    const plan = planVector3(raw, new Map()); // no closed Epics
    expect(plan.evicts).toHaveLength(0);
    expect(
      plan.flags.some((f) => f.kind === 'no-retrospective' && f.epicId === 'M5.E1'),
    ).toBe(true);

    // (b) The apply loop leaves the section LIVE, writes NO archive, and NEVER
    //     fabricates a retrospective to force the evict.
    await applyMigrate(baseDir, { stamp: 'T', dateStr: '2026-07-17' });
    const after = await readState();
    expect(after).toContain('## M5.E1'); // section not evicted
    expect(after).toContain('Decisions D-M5E1-1'); // narrative still live
    expect(existsSync(archivePath('M5', 'E1'))).toBe(false); // no archive fabricated
    expect(existsSync(join(planningDir, 'M5.E1-RETROSPECTIVE.md'))).toBe(false); // no card fabricated
  });

  // --- happy path: genuine closed Epic → evicted, gate passes, conservation --
  it('evicts a genuinely-closed Epic (retro present) to archive/<m>/<e>/ + pointer, byte-identical', async () => {
    await writeState(M5E1_SECTION_BODY);
    await writeRetro('M5.E1', M5E1_RETRO_FAITHFUL);

    const result = await applyMigrate(baseDir, { stamp: 'T', dateStr: '2026-07-17' });

    // Evicted: the narrative left the live body for the archive + a pointer stayed.
    const after = await readState();
    expect(after).toContain('- M5.E1 — evicted to .planning/archive/M5/E1/STATE-NARRATIVE.md');
    expect(after).not.toContain('Decisions D-M5E1-1, D-M5E1-3 locked'); // no longer in live body

    // Archive holds the narrative, byte-identical (move-never-delete; conservation).
    const archive = await readFile(archivePath('M5', 'E1'), 'utf-8');
    expect(archive).toContain('## M5.E1 — Doc-runtime & memory hygiene');
    expect(archive).toContain('Decisions D-M5E1-1, D-M5E1-3 locked. FR1 + FR2b delivered.');

    // The move is recorded as a vector-3 move.
    expect(result.moves.some((m) => m.vector === 'vector-3' && m.epicId === 'M5.E1')).toBe(true);
  });

  // --- the per-evict gate ACTUALLY runs: a lossy card aborts, zero partial writes -
  it('a lossy card (retro drops an ID the section carries) ABORTS the apply — no partial writes', async () => {
    // Section carries D-M5E1-9; the retro omits it → coverage FAILS.
    const body = [
      '# Project State',
      '',
      '## M5.E1 — Doc-runtime',
      '',
      'Shipped 2026-07-16. Decisions D-M5E1-1, D-M5E1-9 locked. FR1 done.',
      '',
    ].join('\n');
    const lossyRetro = [
      '# M5.E1 Retrospective',
      'Outcome: shipped 2026-07-16 (M5.E1). Decisions D-M5E1-1 locked. FR1 done.',
      // NOTE: D-M5E1-9 is dropped — the gate must catch it.
    ].join('\n');
    await writeState(body);
    await writeRetro('M5.E1', lossyRetro);
    const before = await readState();

    await expect(
      applyMigrate(baseDir, { stamp: 'T', dateStr: '2026-07-17' }),
    ).rejects.toThrow(/M5\.E1/);

    // Zero partial writes: STATE body unchanged, no archive left behind.
    expect(await readState()).toBe(before);
    expect(existsSync(archivePath('M5', 'E1'))).toBe(false);
  });

  // --- multi-evict mid-loop abort: SIBLING evicts are undone (no partial writes) -
  it('aborts mid-loop on a lossy SECOND card and rolls back the first Epic\'s already-written archive', async () => {
    // Two closed Epics, both with live sections + retros. M5.E1 (processed first,
    // sort order) has a faithful card; M5.E2\'s card is lossy. The loop writes
    // M5.E1\'s archive to disk, then M5.E2\'s gate fails → the throw must roll back
    // M5.E1\'s archive AND leave STATE.md byte-identical (zero partial writes).
    const body = [
      '# Project State',
      '',
      '## M5.E1 — Doc-runtime',
      'Shipped 2026-07-16. Decisions D-M5E1-1 locked. FR1 done.',
      '',
      '## M5.E2 — Migrate-memory',
      'Shipped 2026-07-17. Decisions D-M5E2-1, D-M5E2-9 locked. FR6 done.',
      '',
    ].join('\n');
    await writeState(body);
    await writeRetro('M5.E1', '# M5.E1 Retro\nShipped 2026-07-16 (M5.E1). D-M5E1-1 locked. FR1 done.');
    // M5.E2 card DROPS D-M5E2-9 → coverage fails on the second evict.
    await writeRetro('M5.E2', '# M5.E2 Retro\nShipped 2026-07-17 (M5.E2). D-M5E2-1 locked. FR6 done.');
    const before = await readState();

    await expect(
      applyMigrate(baseDir, { stamp: 'T', dateStr: '2026-07-17' }),
    ).rejects.toThrow(/M5\.E2/);

    // The FIRST Epic's archive (written before the abort) is rolled back...
    expect(existsSync(archivePath('M5', 'E1'))).toBe(false);
    expect(existsSync(archivePath('M5', 'E2'))).toBe(false);
    // ...and STATE.md is byte-identical to before (no partial in-body pointer).
    expect(await readState()).toBe(before);
  });

  // --- mixed-body guard: never whole-body-relocate on one Epic's behalf ------
  it('MIXED body: a closed Epic with no live section is NOT whole-body-relocated (guard)', async () => {
    // M5.E1 owns a LIVE section (no retro → stays live). M5.E2 is closed (retro)
    // but has NO section in the body. A wrong impl that acted on M5.E2's
    // vector-2-reclassify with a whole-body relocate would drag M5.E1's live
    // section into STATE-HISTORY.md — the catastrophe this guard prevents.
    await writeState(M5E1_SECTION_BODY);
    await writeRetro('M5.E2', '# M5.E2 Retrospective\nClosed 2026-07-16 (M5.E2).');

    const sense = await senseVector3(baseDir, await readState());
    expect(sense.evicts).toHaveLength(0);
    expect(sense.skips.some((s) => s.epicId === 'M5.E2' && s.reason === 'mixed-body-guard')).toBe(true);
    expect(sense.flags.some((f) => f.kind === 'no-retrospective' && f.epicId === 'M5.E1')).toBe(true);

    await applyMigrate(baseDir, { stamp: 'T', dateStr: '2026-07-17' });

    // No whole-body relocate happened; M5.E1's live section survives.
    expect(existsSync(join(planningDir, 'STATE-HISTORY.md'))).toBe(false);
    expect(await readState()).toContain('## M5.E1 — Doc-runtime & memory hygiene');
  });

  // --- idempotency (FR6.4): a re-run on an already-evicted project is a no-op -
  it('is idempotent — re-running after an evict does not re-evict (pointer skip)', async () => {
    await writeState(M5E1_SECTION_BODY);
    await writeRetro('M5.E1', M5E1_RETRO_FAITHFUL);
    await applyMigrate(baseDir, { stamp: 'T1', dateStr: '2026-07-17' });
    const afterFirst = await readState();

    const second = await applyMigrate(baseDir, { stamp: 'T2', dateStr: '2026-07-17' });

    expect(second.applied).toBe(false); // nothing left to do
    expect(await readState()).toBe(afterFirst); // byte-identical no-op
  });

  // --- §9 lock composition: the apply path never re-enters the coarse lock ---
  it('evictEpicNarrative (self-locking) THROWS under the held coarse lock — why V3 uses the lock-free spine', async () => {
    await writeState(M5E1_SECTION_BODY);
    await writeRetro('M5.E1', M5E1_RETRO_FAITHFUL);

    await withStateLock(baseDir, async () => {
      await expect(evictEpicNarrative(baseDir, 'M5.E1')).rejects.toThrow(
        /lock|another .*state write/i,
      );
    });
  });

  it('applyMigrate evicts holding the coarse lock ONCE — completion proves no self-locking re-entry', async () => {
    await writeState(M5E1_SECTION_BODY);
    await writeRetro('M5.E1', M5E1_RETRO_FAITHFUL);

    // If V3 had called the self-locking evictEpicNarrative under the coarse lock,
    // this would reject with "another state write is running". It completes → the
    // evict went through the lock-free relocateFaithful spine.
    const result = await applyMigrate(baseDir, { stamp: 'T', dateStr: '2026-07-17' });
    expect(result.moves.some((m) => m.vector === 'vector-3')).toBe(true);
    expect(existsSync(archivePath('M5', 'E1'))).toBe(true);
    // Lock released after apply — a subsequent self-locking write succeeds.
    await withStateLock(baseDir, async () => true);
  });
});
