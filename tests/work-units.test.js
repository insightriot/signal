import { describe, it, expect } from 'vitest';
import { deriveUnits, WORKED_SUFFIXES } from '../plugin/tools/lib/work-units.js';
import { SCAFFOLD_SUFFIXES } from '../plugin/tools/lib/archive-tree.js';

/**
 * M5.E18 S1 — units of work, derived from filenames.
 *
 * Signal's archive paths are Epic-gated by construction: `planArchiveMoves`
 * filters through `EPIC_ID_STRICT_RE`, so 8 of 12 real projects cannot archive
 * anything. FR1 replaces "construct `{epicId}-{suffix}.md` and check presence"
 * with "parse whatever is on disk".
 *
 * Every expected value below was MEASURED against the real tree named in the
 * test, at M5.E18 PLAN (see `.planning/M5.E18-RESEARCH.md`), not invented.
 */

// ---- Real filename inventories, transcribed from the measured corpus ----

// eval-project-A: writes PLAN-phase artifacts as `PLAN-{unit}-{ARTIFACT}.md` and
// execution artifacts as `{unit}-{ARTIFACT}.md`, so a naive rule sees one slice
// as two. Verified as ONE slice by reading them: `GATE-A-PROGRESS.md` links
// "Plan: [PLAN-GATE-A.md]" directly.
const EVAL_PROJECT_A_SPLIT_PAIRS = [
  'PLAN-GATE-A-RESEARCH.md',
  'PLAN-GATE-A-VALIDATION.md',
  'GATE-A-PROGRESS.md',
  'PLAN-SC1-RESEARCH.md',
  'PLAN-SC1-VALIDATION.md',
  'SC1-PROGRESS.md',
  'SC1-VERIFICATION.md',
  'PLAN-SLICE-SSO-RESEARCH.md',
  'PLAN-SLICE-SSO-VALIDATION.md',
  'SLICE-SSO-PROGRESS.md',
  'SLICE-SSO-REVIEW.md',
  'SLICE-SSO-VERIFICATION.md',
  'PLAN-SLICE-VOICE1-RESEARCH.md',
  'PLAN-SLICE-VOICE1-VALIDATION.md',
  'VOICE1-PROGRESS.md',
];

// eval-project-E: `resolveArtifactPath` pattern 3 — the literal-substitution
// `{PHASE}-{ARTIFACT}.md` form a linear project legitimately writes.
const AGENT_BUILDER = [
  'PLAN-PLAN.md',
  'PLAN-PROGRESS.md',
  'PLAN-RESEARCH.md',
  'PLAN-VALIDATION.md',
  'REVIEW-REVIEW.md',
  'VERIFY-VERIFICATION.md',
  'CONTEXT.md',
  'PROJECT.md',
  'STATE.md',
];

// eval-project-C, the AC1.4' fixture. PHASE10-S5 under-forms on purpose:
// its only file is a RUNBOOK, which is not a scaffold suffix.
const TRACTION_ENGINE = [
  'PHASE7-PLAN.md', 'PHASE7-VERIFICATION.md',
  'PHASE8-PLAN.md', 'PHASE8-VERIFICATION.md', 'PHASE8-SHIP.md',
  'PHASE9-PLAN.md', 'PHASE9-PROGRESS.md',
  'PHASE10-PLAN.md', 'PHASE10-SHIP.md',
  'PHASE10-S4-PLAN.md',
  'PHASE10-S5-RUNBOOK.md',
  'PHASE11-PLAN.md', 'PHASE11-SHIP.md',
  'PHASE12-PLAN.md',
  'PHASE13-PLAN.md', 'PHASE13-PROGRESS.md', 'PHASE13-RESEARCH.md',
  'PHASE13-SCOPE.md', 'PHASE13-VALIDATION.md', 'PHASE13-VERIFICATION.md',
  'CONTEXT.md', 'DECISIONS.md', 'INDEX.md', 'LANDSCAPE.md',
  'OPEN-QUESTIONS.md', 'FUTURE-IDEAS.md', 'BUGS.md',
];

const unitNames = (files) => [...deriveUnits(files).units.keys()].sort();

describe('M5.E18 S1 / FR1 — deriveUnits', () => {
  describe('AC1.1 — right-anchored, not first-hyphen', () => {
    it('PHASE10-S4-PLAN.md derives PHASE10-S4 (nested unit survives)', () => {
      expect(unitNames(['PHASE10-S4-PLAN.md'])).toEqual(['PHASE10-S4']);
    });

    it('a nested unit and its parent coexist as separate units', () => {
      const u = unitNames(['PHASE10-PLAN.md', 'PHASE10-S4-PLAN.md']);
      expect(u).toEqual(['PHASE10', 'PHASE10-S4']);
    });
  });

  describe("AC1.2' — all four measured split pairs resolve to ONE unit each", () => {
    // The correction ratified at PLAN: the requirements framed
    // `PLAN-GATE-A-RESEARCH.md` -> `PLAN-GATE-A` as CORRECT. It is the defect —
    // it puts the VERIFICATION on one side of a split and the PLAN on the
    // other, so FR2 would archive half a slice.
    //
    // `B82` (fixed): that last clause described a defect this fold prevents in
    // the DERIVATION and `planArchiveMoves` then reintroduced in the MOVER, by
    // rebuilding candidates from a `{unit}-{suffix}` template that cannot
    // express a fold. Measured live on `eval-project-A` and `eval-project-D`: the
    // derivation resolved `SLICE-SSO` to 5 files while the mover planned 3.
    // The end-to-end invariant is now pinned in `archive-destination.test.js`
    // ("B82"); this block keeps pinning the derivation half.
    const { units } = deriveUnits(EVAL_PROJECT_A_SPLIT_PAIRS);

    it('GATE-A: the plan-side and execution-side files land in one unit', () => {
      expect(units.has('GATE-A')).toBe(true);
      expect(units.has('PLAN-GATE-A')).toBe(false);
      expect(units.get('GATE-A').sort()).toEqual([
        'GATE-A-PROGRESS.md', 'PLAN-GATE-A-RESEARCH.md', 'PLAN-GATE-A-VALIDATION.md',
      ]);
    });

    it('SC1: one unit', () => {
      expect(units.has('SC1')).toBe(true);
      expect(units.has('PLAN-SC1')).toBe(false);
    });

    it('SLICE-SSO: one unit', () => {
      expect(units.has('SLICE-SSO')).toBe(true);
      expect(units.has('PLAN-SLICE-SSO')).toBe(false);
    });

    it('VOICE1: one unit — the pair a bare phase-name strip does NOT merge', () => {
      // `PLAN-SLICE-VOICE1` strips to `SLICE-VOICE1`, but the sibling is
      // `VOICE1`. This is the case that proved a lexical strip insufficient.
      expect(units.has('VOICE1')).toBe(true);
      expect(units.has('PLAN-SLICE-VOICE1')).toBe(false);
      expect(units.has('SLICE-VOICE1')).toBe(false);
      expect(units.get('VOICE1').sort()).toEqual([
        'PLAN-SLICE-VOICE1-RESEARCH.md', 'PLAN-SLICE-VOICE1-VALIDATION.md', 'VOICE1-PROGRESS.md',
      ]);
    });

    it('the whole eval-project-A split set collapses to exactly four units', () => {
      expect(unitNames(EVAL_PROJECT_A_SPLIT_PAIRS)).toEqual(['GATE-A', 'SC1', 'SLICE-SSO', 'VOICE1']);
    });
  });

  describe('AC1.2" — the fold is conservative', () => {
    it('SLICE-SSO does NOT fold, because no unit named SSO exists', () => {
      expect(unitNames(['SLICE-SSO-PROGRESS.md'])).toEqual(['SLICE-SSO']);
    });

    it('a unit is never folded into a name that is not itself a derived unit', () => {
      // `PLAN-ORPHAN` has no `ORPHAN` sibling, so it stays as derived rather
      // than being renamed to something nothing evidences.
      expect(unitNames(['PLAN-ORPHAN-RESEARCH.md'])).toEqual(['PLAN-ORPHAN']);
    });
  });

  describe('AC1.3 — Epic IDs keep working (this replaces nothing that works)', () => {
    it('M1-PLAN.md derives M1', () => {
      expect(unitNames(['M1-PLAN.md'])).toEqual(['M1']);
    });

    it('M5.E16-PLAN.md derives M5.E16', () => {
      expect(unitNames(['M5.E16-PLAN.md'])).toEqual(['M5.E16']);
    });
  });

  describe("AC1.4' — eval-project-C, the corrected expected set", () => {
    it('derives exactly the measured units', () => {
      expect(unitNames(TRACTION_ENGINE)).toEqual([
        'PHASE10', 'PHASE10-S4', 'PHASE11', 'PHASE12', 'PHASE13',
        'PHASE7', 'PHASE8', 'PHASE9',
      ]);
    });

    it('PHASE10-S5 under-forms — RUNBOOK is not a scaffold suffix', () => {
      const { units, ungrouped } = deriveUnits(TRACTION_ENGINE);
      expect(units.has('PHASE10-S5')).toBe(false);
      expect(ungrouped).toContain('PHASE10-S5-RUNBOOK.md');
    });

    it('root singletons are in no unit', () => {
      const { ungrouped } = deriveUnits(TRACTION_ENGINE);
      for (const f of ['CONTEXT.md', 'DECISIONS.md', 'INDEX.md', 'LANDSCAPE.md',
        'OPEN-QUESTIONS.md', 'FUTURE-IDEAS.md']) {
        expect(ungrouped, `${f} must not be swept into a unit`).toContain(f);
      }
    });
  });

  describe('AC1.5 — ungrouped is a named collection, reported unconditionally', () => {
    it('files with no recognised suffix land in ungrouped', () => {
      const { ungrouped } = deriveUnits([
        'eval-project-A-STACK-DECISION.md', 'BUGHUNT-2026-06-12.md', 'PLAN-SLICE-VOICE1.md',
      ]);
      // Sorted, so the lowercase corpus label sorts after the uppercase names.
      expect(ungrouped.sort()).toEqual([
        'BUGHUNT-2026-06-12.md', 'PLAN-SLICE-VOICE1.md', 'eval-project-A-STACK-DECISION.md',
      ]);
    });

    it('an EMPTY ungrouped is distinguishable from an unreported one', () => {
      // The B39 shape: printing nothing must not read as "checked and clean".
      const r = deriveUnits(['M1-PLAN.md']);
      expect(r.ungrouped).toEqual([]);
      expect(Array.isArray(r.ungrouped)).toBe(true);
    });
  });

  describe('AC1.6 — a PHASE NAME is not a unit of work', () => {
    it('eval-project-E derives ZERO units', () => {
      // `PLAN-PLAN.md` etc. are resolveArtifactPath pattern 3 — phase artifacts
      // of one linear project. Deriving a unit called "PLAN" and archiving it
      // would archive the project's live plan.
      expect(unitNames(AGENT_BUILDER)).toEqual([]);
    });

    it('every canonical phase name is excluded', () => {
      const files = ['CALIBRATE', 'DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP']
        .map((p) => `${p}-PROGRESS.md`);
      expect(unitNames(files)).toEqual([]);
    });

    it('a unit merely STARTING with a phase word is untouched', () => {
      // The exclusion is on the whole name, not a prefix — `PLANNER` is a unit.
      expect(unitNames(['PLANNER-PLAN.md'])).toEqual(['PLANNER']);
    });
  });

  describe('the suffix vocabulary is the CALLER\'s question, not a narrower default', () => {
    // Found by AC1.7' during the state-drift.js extraction: sharing the rule AND
    // defaulting the vocabulary broke six of check (c)'s own tests. WORKED_SUFFIXES
    // is not a subset-for-convenience — it answers "was this EXECUTED", where
    // SCAFFOLD_SUFFIXES answers "does this archive with a closed unit".
    const PARKED = ['M5.E14-REQUIREMENTS.md', 'M5.E13-PLAN.md', 'M5.E13-RETROSPECTIVE.md'];

    it('the default vocabulary sees a scoped-and-parked unit', () => {
      expect([...deriveUnits(PARKED).units.keys()].sort()).toEqual(['M5.E13', 'M5.E14']);
    });

    it('WORKED_SUFFIXES does NOT — REQUIREMENTS alone is not evidence of work', () => {
      // If this ever equals the line above, check (c) starts manufacturing a
      // chore for every idea anyone wrote down and parked.
      const u = deriveUnits(PARKED, { suffixes: WORKED_SUFFIXES }).units;
      expect([...u.keys()]).toEqual(['M5.E13']);
      expect(u.has('M5.E14')).toBe(false);
    });

    it('the two vocabularies are genuinely different sets', () => {
      expect(WORKED_SUFFIXES).not.toEqual(SCAFFOLD_SUFFIXES);
      expect(WORKED_SUFFIXES).not.toContain('REQUIREMENTS');
      for (const s of WORKED_SUFFIXES) expect(SCAFFOLD_SUFFIXES).toContain(s);
    });
  });

  describe('totality and idempotence', () => {
    // De-duplicated: CONTEXT.md legitimately appears in two of the fixture
    // inventories above, and `deriveUnits` takes a file LIST, not a multiset.
    const CORPUS = [...new Set([...EVAL_PROJECT_A_SPLIT_PAIRS, ...AGENT_BUILDER, ...TRACTION_ENGINE])];

    it('every input file lands in exactly one of units/ungrouped', () => {
      const { units, ungrouped } = deriveUnits(CORPUS);
      const placed = [...units.values()].flat();
      expect(placed.length + ungrouped.length).toBe(CORPUS.length);
      expect(new Set([...placed, ...ungrouped]).size).toBe(CORPUS.length);
    });

    it('non-.md input is ignored, not crashed on', () => {
      const { units, ungrouped } = deriveUnits(['config.json', 'M1-PLAN.md', 'notes.txt']);
      expect([...units.keys()]).toEqual(['M1']);
      expect(ungrouped).toEqual([]);
    });

    it('is deterministic across input order', () => {
      const a = unitNames(CORPUS);
      const b = unitNames([...CORPUS].reverse());
      expect(a).toEqual(b);
    });

    it('handles empty input', () => {
      const { units, ungrouped } = deriveUnits([]);
      expect(units.size).toBe(0);
      expect(ungrouped).toEqual([]);
    });
  });
});
