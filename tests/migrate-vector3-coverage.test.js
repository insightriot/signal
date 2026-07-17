// M5.E2.S2.t1 (GATE) — vector-3 assumption-1 live-coverage check.
//
// The #2c gap (evict.js:327): evictEpicNarrative NO-OPS on a closed-Epic body
// with NO Epic-ID section headings — it returns { evicted:false, reason:'no-section' }
// and the bloat is silently LEFT IN PLACE. That silent skip is exactly the
// failure this Epic exists to prevent. This gate proves the migrate path never
// takes that skip on a real bloated un-sectioned closed-Epic body: the classifier
// reclassifies it to vector-2 (whole-body byte-identical relocate — the locked
// decision, D-M5E2 §5: no new sectioning bridge; whole-body relocate carries zero
// semantic risk), and the vector-2 handler (relocateInlinedBody, S1.t5) actually
// relocates it (does not skip).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { evictEpicNarrative } from '../tools/lib/evict.js';
import {
  classifyClosedEpicBody,
  relocateInlinedBody,
} from '../tools/lib/migrate-memory.js';

const FRONTMATTER = [
  '---',
  'schema_version: 1',
  'phase: SHIP',
  'current_epic: M5.E1',
  'current_wave: null',
  'current_tasks: []',
  'completed_phases: []',
  'blockers: []',
  'last_decision_at: null',
  'last_updated_commit: null',
  'last_updated: 2026-07-16T00:00:00.000Z',
  '---',
].join('\n');

// A REAL bloated, UN-sectioned closed-Epic body: it narrates M5.E1's work in
// full (ids, dates, decisions all present in the prose) but NO heading LINE
// contains the Epic ID "M5.E1" — the headings are generic ("# Project State",
// "## Historical log", "## Decisions"). This is the exact shape a hand-migrated /
// legacy body takes: the narrative accreted without per-Epic section headings.
// Big enough (>8 KB) to be a genuine vector-2 bloat candidate.
const NARRATIVE_PARA =
  'The doc-runtime model shipped 2026-07-16. Decisions D-M5E1-1, D-M5E1-3, ' +
  'D-M5E1-6 were locked. FR1 and FR2b were delivered; AC1 and AC3 verified. ' +
  'STATE.md was reduced from 64.5 KB to 1 KB by relocating the inlined body. ';
const UNSECTIONED_BODY = [
  '# Project State',
  '',
  '## Historical log',
  '',
  NARRATIVE_PARA.repeat(40),
  '',
  '## Decisions',
  '',
  NARRATIVE_PARA.repeat(40),
  '',
].join('\n');

// A SECTIONED counterpart: a heading LINE that contains the Epic ID. This is the
// shape extractEpicSection finds → route to vector-3 evict.
const SECTIONED_BODY = [
  '# Project State',
  '',
  '## M5.E1 — Doc-runtime & memory hygiene',
  '',
  'Shipped 2026-07-16. Decisions D-M5E1-1, D-M5E1-3, D-M5E1-6 locked.',
  '',
].join('\n');

// A retrospective proves the Epic is genuinely CLOSED — so the gap-doc test below
// shows a genuinely-closed, un-sectioned, bloated Epic STILL gets silently skipped
// by evictEpicNarrative (not "it wasn't closed anyway"). Covers every discrete
// token in the narrative so a downstream coverage gate would pass.
const CLOSED_RETRO = [
  '# M5.E1 Retrospective',
  'Outcome: doc-runtime model shipped 2026-07-16 (M5.E1).',
  'Decisions D-M5E1-1, D-M5E1-3, D-M5E1-6 locked. FR1 + FR2b done. AC1, AC3 verified.',
].join('\n');

describe('M5.E2.S2.t1 vector-3 assumption-1 live-coverage gate', () => {
  let baseDir;
  let planningDir;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-v3-cov-'));
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
  const writeRetro = () =>
    writeFile(join(planningDir, 'M5.E1-RETROSPECTIVE.md'), CLOSED_RETRO, 'utf-8');
  const readState = () => readFile(join(planningDir, 'STATE.md'), 'utf-8');

  // --- the gap this gate closes (documents pre-existing evict.js:327 behavior) ---
  it('DOCUMENTS the #2c gap: evictEpicNarrative silently skips a genuinely-closed, un-sectioned, bloated Epic', async () => {
    await writeState(UNSECTIONED_BODY);
    await writeRetro(); // genuinely closed — a retrospective exists
    const before = await readState();

    const result = await evictEpicNarrative(baseDir, 'M5.E1');

    // The silent skip: no eviction, bloat left in place, STATE untouched.
    expect(result.evicted).toBe(false);
    expect(result.reason).toBe('no-section');
    expect(await readState()).toBe(before);
  });

  // --- the gate: the classifier NEVER returns that silent skip ---
  it('reclassifies an un-sectioned closed-Epic body to vector-2 (never a silent no-section skip)', () => {
    const verdict = classifyClosedEpicBody(UNSECTIONED_BODY, 'M5.E1');

    expect(verdict.sectioned).toBe(false);
    expect(verdict.route).toBe('vector-2-reclassify');
    // The whole point of the gate: never "skip / leave as-is".
    expect(verdict.route).not.toBe('skip');
    expect(verdict.route).not.toBe('no-section');
  });

  it('routes a sectioned closed-Epic body to vector-3 evict (predicate delegates to extractEpicSection)', () => {
    const verdict = classifyClosedEpicBody(SECTIONED_BODY, 'M5.E1');

    expect(verdict.sectioned).toBe(true);
    expect(verdict.route).toBe('vector-3-evict');
  });

  // --- the reclassify verdict lands on a REAL, non-skipping handler ---
  it('the vector-2 handler actually relocates the reclassified body (no second silent skip)', async () => {
    await writeState(UNSECTIONED_BODY);

    const r = await relocateInlinedBody(baseDir, { apply: true, dateStr: '2026-07-17' });

    // Not another skip — the bloat is actually removed to STATE-HISTORY.md.
    expect(r.relocated).toBe(true);
    expect(r.applied).toBe(true);
    const history = await readFile(join(planningDir, r.historyName), 'utf-8');
    expect(history).toBe(UNSECTIONED_BODY); // byte-identical whole-body relocate
    // The live STATE body no longer carries the bloat.
    expect(await readState()).not.toContain(NARRATIVE_PARA.repeat(40));
  });
});
