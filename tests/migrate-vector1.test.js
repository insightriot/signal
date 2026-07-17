// M5.E2.S1.t4 — vector-1 de-prose: relocate frontmatter-list prose to the body.
//
// The acute 529 KB nextpass / 455 KB cmmc case: completed_phases entries and
// blockers[].text fields became huge prose blocks, wedging the write-guard hook.
// The migrate must RELOCATE that prose into the STATE body (leaving a short
// scalar), never DELETE it (the B8 catastrophe). Size is incidental — these
// fixtures reproduce the exact SHAPES the check-state-write hook flags.
//
// Proof-of-fail: post-transform frontmatter re-checks block:false AND the body
// grew by ~ the relocated prose AND word-conservation holds. A delete-impl
// (strip frontmatter prose, don't relocate) leaves the body unchanged → the
// conservation + body-grew assertions fail.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  locateFrontmatterProse,
  deproseFrontmatter,
  applyDeproseVector1,
  conserves,
  WORD,
} from '../tools/lib/migrate-memory.js';
import { checkStateFrontmatterShape } from '../tools/lib/retrospective.js';

// A STATE.md carrying every offending shape at once (the whole-file nextpass case):
//  - a CLEAN completed_phases entry (must be left untouched)
//  - a MULTI-LINE quoted completed_phases entry (the cmmc pollution)
//  - an OVER-LENGTH single-line completed_phases entry (>150)
//  - an OVER-BUDGET blockers[].text (>500)
//  - a BLOCK-SCALAR blockers[].text (text: | …)
const OVERLEN = `PLAN (2026-07-04) — ${'narrative '.repeat(20)}`; // ~220 chars
const OVERBUDGET = `blocker prose ${'x '.repeat(300)}`; // >500 chars
const POLLUTED_STATE =
  `---\n` +
  `schema_version: 1\n` +
  `phase: PLAN\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases:\n` +
  `  - CALIBRATE (2026-05-13)\n` +
  `  - "**Active: Slice SEC1 — Supabase hardening: DISCUSS done then\n` +
  `    PLAN done landed 2026-07-01 (4-agent research plus MCP pulls plus\n` +
  `    independent plan-checker 8-dim PASS-WITH-NOTES)"\n` +
  `  - "${OVERLEN}"\n` +
  `blockers:\n` +
  `  - id: blk-1a2b\n` +
  `    text: ${OVERBUDGET}\n` +
  `    raisedAt: 2026-07-13T00:00:00.000Z\n` +
  `  - id: blk-3c4d\n` +
  `    text: |\n` +
  `      first paragraph of narrative prose that should never\n` +
  `      live inside a structured blocker text field at all\n` +
  `    raisedAt: 2026-07-13T00:00:00.000Z\n` +
  `---\n` +
  `# Project State\n\n## Resume pointer\n\nexisting body\n`;

describe('M5.E2.S1.t4 locateFrontmatterProse (the net-new locator)', () => {
  it('returns the exact offending entries + ranges, not just a boolean', () => {
    const { entries } = locateFrontmatterProse(POLLUTED_STATE);
    // 2 completed_phases (multi-line + over-length) + 2 blockers (over-budget + block-scalar).
    expect(entries).toHaveLength(4);
    const fields = entries.map((e) => e.field).sort();
    expect(fields).toEqual(['blockers', 'blockers', 'completed_phases', 'completed_phases']);
    for (const e of entries) {
      expect(typeof e.original).toBe('string');
      expect(e.original.length).toBeGreaterThan(0);
      expect(Number.isInteger(e.startLine)).toBe(true);
      expect(e.endLine).toBeGreaterThanOrEqual(e.startLine);
      expect(typeof e.short).toBe('string');
    }
  });

  it('does NOT flag the clean CALIBRATE entry', () => {
    const { entries } = locateFrontmatterProse(POLLUTED_STATE);
    expect(entries.some((e) => /CALIBRATE \(2026-05-13\)/.test(e.original))).toBe(false);
  });

  it('returns no entries for already-clean frontmatter', () => {
    const clean =
      `---\nschema_version: 1\nphase: PLAN\ncompleted_phases:\n  - DISCUSS (2026-07-13)\nblockers: []\n---\nbody\n`;
    expect(locateFrontmatterProse(clean).entries).toHaveLength(0);
  });
});

describe('M5.E2.S1.t4 deproseFrontmatter (pure transform)', () => {
  it('produces frontmatter that re-checks block:false (the write-guard is satisfied)', () => {
    const { newText, changed } = deproseFrontmatter(POLLUTED_STATE);
    expect(changed).toBe(true);
    expect(checkStateFrontmatterShape({ proposedContent: newText }).block).toBe(false);
  });

  it('GREW the body by ~ the relocated prose (proof-of-fail vs a delete-impl)', () => {
    const { newText } = deproseFrontmatter(POLLUTED_STATE);
    const bodyOf = (t) => t.split(/\n---\r?\n/)[1] ?? '';
    expect(bodyOf(newText).length).toBeGreaterThan(bodyOf(POLLUTED_STATE).length + 400);
  });

  it('relocated prose is word-conserved in the new body (NOTHING deleted)', () => {
    const { newText, removedProse } = deproseFrontmatter(POLLUTED_STATE);
    const body = newText.split(/\n---\r?\n/)[1] ?? '';
    expect(conserves(removedProse, body, WORD).pass).toBe(true);
  });

  it('preserves the multi-line cmmc prose verbatim in the body', () => {
    const { newText } = deproseFrontmatter(POLLUTED_STATE);
    expect(newText).toContain('independent plan-checker 8-dim PASS-WITH-NOTES');
    expect(newText).toContain('first paragraph of narrative prose that should never');
  });

  it('leaves the clean CALIBRATE entry untouched in the frontmatter', () => {
    const { newText } = deproseFrontmatter(POLLUTED_STATE);
    const fm = newText.split(/\n---\r?\n/)[0];
    expect(fm).toContain('- CALIBRATE (2026-05-13)');
  });

  it('is a no-op on already-clean frontmatter (changed:false, text unchanged)', () => {
    const clean =
      `---\nschema_version: 1\nphase: PLAN\ncompleted_phases:\n  - DISCUSS (2026-07-13)\nblockers: []\n---\nbody\n`;
    const r = deproseFrontmatter(clean);
    expect(r.changed).toBe(false);
    expect(r.newText).toBe(clean);
  });
});

describe('M5.E2.S1.t4 applyDeproseVector1 (on disk, standalone wrapper)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-v1-'));
    await mkdir(join(baseDir, '.planning'), { recursive: true });
    await writeFile(join(baseDir, '.planning', 'STATE.md'), POLLUTED_STATE, 'utf-8');
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('dry-run (apply:false) writes nothing but reports the relocations', async () => {
    const before = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    const r = await applyDeproseVector1(baseDir, { apply: false });
    const after = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    expect(after).toBe(before); // untouched
    expect(r.relocations.length).toBe(4);
    expect(r.applied).toBe(false);
  });

  it('apply relocates on disk; frontmatter re-checks clean; prose preserved; conservation held', async () => {
    const r = await applyDeproseVector1(baseDir, { apply: true });
    expect(r.applied).toBe(true);
    expect(r.conservation.pass).toBe(true);
    const after = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    expect(checkStateFrontmatterShape({ proposedContent: after }).block).toBe(false);
    expect(after).toContain('independent plan-checker 8-dim PASS-WITH-NOTES');
  });

  it('apply is idempotent — a second run finds nothing to do', async () => {
    await applyDeproseVector1(baseDir, { apply: true });
    const mid = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    const r2 = await applyDeproseVector1(baseDir, { apply: true });
    const after = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    expect(r2.relocations.length).toBe(0);
    expect(after).toBe(mid);
  });
});
