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
  renderDryRun,
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

// B12 (VERIFY) — a completed_phases entry WITHOUT a leading "PHASE (date)" token
// must de-prose to a MEANINGFUL truncated label (never the generic "[relocated…]"
// placeholder that erases which entry it was), and the dry-run must WARN that a
// non-standard/active-looking entry was relocated (verify it was actually done).
// The real nextpass dogfood find: an over-length "▶ Active: Slice SEC1 …" marker
// parked in completed_phases placeholdered + was swept into history.
const ACTIVE_MARKER =
  `▶ Active: Slice SEC1 — Supabase Security-Advisor Hardening: DISCUSS ✅ → ` +
  `EXECUTE in progress (PLAN landed 2026-07-16, 4-agent research + independent ` +
  `plan-checker PASS)`; // >150 chars → over-length → enters the de-prose set
const ACTIVE_STATE =
  `---\n` +
  `schema_version: 1\n` +
  `phase: EXECUTE\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases:\n` +
  `  - CALIBRATE (2026-05-13)\n` +
  `  - "${ACTIVE_MARKER}"\n` +
  `blockers: []\n` +
  `---\n` +
  `# Project State\n\nexisting body\n`;

// A blockers[].text with NO clean "PHASE (date)" prefix (blockers never carry one
// — they always route through deriveNonStandardLabel). Block-scalar shape → enters
// the de-prose set regardless of length. The de-prosed `text:` scalar must be a
// MEANINGFUL truncated label (never the generic "[relocated…]" placeholder), the
// blocker id must survive on its `- id:` line (identity preserved), and the full
// prose must relocate verbatim into the body under a "blockers — <id>" heading.
const BLOCKER_ID = 'blk-9f9f';
const BLOCKER_PROSE_LINE_1 =
  'The Supabase RLS policy blocks anon reads on the projects table which breaks the public dashboard';
const BLOCKER_PROSE_LINE_2 =
  'entirely until we add a policy exception for the anonymous role in the migration';
const BLOCKER_STATE =
  `---\n` +
  `schema_version: 1\n` +
  `phase: EXECUTE\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases: []\n` +
  `blockers:\n` +
  `  - id: ${BLOCKER_ID}\n` +
  `    text: |\n` +
  `      ${BLOCKER_PROSE_LINE_1}\n` +
  `      ${BLOCKER_PROSE_LINE_2}\n` +
  `    raisedAt: 2026-07-13T00:00:00.000Z\n` +
  `---\n` +
  `# Project State\n\nexisting body\n`;

describe('M5.E2 REVIEW I2 — blocker-label (B12) de-prose pins .short content', () => {
  it('derives a MEANINGFUL truncated label for a blocker text (never [relocated…])', () => {
    const { entries } = locateFrontmatterProse(BLOCKER_STATE);
    const blk = entries.find((e) => e.field === 'blockers');
    expect(blk).toBeDefined();
    expect(blk.id).toBe(BLOCKER_ID);
    // The leftover scalar is a real label, not the identity-erasing placeholder.
    expect(blk.short).not.toContain('[relocated');
    expect(blk.short).toContain('text:');
    expect(blk.short).toContain('Supabase'); // a content token from the prose
  });

  it('deproseFrontmatter keeps the label + the blocker id, relocates prose verbatim', () => {
    const { newText } = deproseFrontmatter(BLOCKER_STATE);
    const fm = newText.split(/\n---\r?\n/)[0];
    // Label survives in the frontmatter; id line is untouched (identity preserved).
    expect(fm).not.toContain('[relocated');
    expect(fm).toContain('Supabase');
    expect(fm).toContain(`- id: ${BLOCKER_ID}`);
    // Full prose relocates verbatim into the body under a "blockers — <id>" heading.
    expect(newText).toContain(`blockers — ${BLOCKER_ID}`);
    expect(newText).toContain(BLOCKER_PROSE_LINE_1);
    expect(newText).toContain(BLOCKER_PROSE_LINE_2);
  });

  it('the de-prosed blocker text scalar no longer trips the write-guard', () => {
    const { newText } = deproseFrontmatter(BLOCKER_STATE);
    expect(checkStateFrontmatterShape({ proposedContent: newText }).block).toBe(false);
  });
});

// A NORMAL over-length entry that DOES carry a clean "PHASE (date)" prefix — must
// keep its "PLAN (2026-07-16)" scalar unchanged and must NOT be flagged.
const REGRESSION_MARKER = `PLAN (2026-07-16) — ${'narrative words '.repeat(15)}`; // >150
const REGRESSION_STATE =
  `---\n` +
  `schema_version: 1\n` +
  `phase: PLAN\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases:\n` +
  `  - "${REGRESSION_MARKER}"\n` +
  `blockers: []\n` +
  `---\n` +
  `# Project State\n\nexisting body\n`;

describe('M5.E2 VERIFY B12 — meaningful de-prose label + non-standard dry-run flag', () => {
  it('derives a MEANINGFUL truncated label (never the generic [relocated…] placeholder)', () => {
    const { entries } = locateFrontmatterProse(ACTIVE_STATE);
    const active = entries.find((e) => e.field === 'completed_phases');
    expect(active).toBeDefined();
    // RED against the current placeholder behavior: today active.short is
    // `- "[relocated to STATE body — migrate-memory]"`.
    expect(active.short).not.toContain('[relocated');
    expect(active.short).toContain('SEC1');
    expect(active.nonStandard).toBe(true);
  });

  it('deproseFrontmatter leaves the meaningful label in the frontmatter (not a placeholder)', () => {
    const { newText } = deproseFrontmatter(ACTIVE_STATE);
    const fm = newText.split(/\n---\r?\n/)[0];
    expect(fm).not.toContain('[relocated');
    expect(fm).toContain('SEC1');
    // Prose still relocates verbatim to the body (faithfulness unchanged).
    expect(newText).toContain('independent');
    expect(newText).toContain('plan-checker PASS');
  });

  it('a normal "PHASE (date)" entry keeps its PLAN (2026-07-16) scalar and is NOT non-standard', () => {
    const { entries } = locateFrontmatterProse(REGRESSION_STATE);
    const e = entries.find((x) => x.field === 'completed_phases');
    expect(e).toBeDefined();
    expect(e.short.trim()).toBe('- PLAN (2026-07-16)');
    expect(e.nonStandard).toBe(false);
  });

  describe('renderDryRun warning', () => {
    let baseDir;
    afterEach(async () => {
      if (baseDir) await rm(baseDir, { recursive: true, force: true });
    });

    it('warns that a non-standard/active-looking completed_phases entry was relocated', async () => {
      baseDir = await mkdtemp(join(tmpdir(), 'signal-b12-'));
      await mkdir(join(baseDir, '.planning'), { recursive: true });
      await writeFile(join(baseDir, '.planning', 'STATE.md'), ACTIVE_STATE, 'utf-8');
      const out = await renderDryRun(baseDir);
      expect(out).toMatch(/non-standard/i);
      expect(out).toContain('SEC1');
    });

    it('does NOT warn for a normal "PHASE (date)" entry', async () => {
      baseDir = await mkdtemp(join(tmpdir(), 'signal-b12-'));
      await mkdir(join(baseDir, '.planning'), { recursive: true });
      await writeFile(join(baseDir, '.planning', 'STATE.md'), REGRESSION_STATE, 'utf-8');
      const out = await renderDryRun(baseDir);
      expect(out).not.toMatch(/non-standard/i);
    });
  });
});
