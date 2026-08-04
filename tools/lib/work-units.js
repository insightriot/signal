/**
 * Units of work, derived from filenames (M5.E18 FR1).
 *
 * Signal's archive machinery was Epic-gated by construction: `planArchiveMoves`
 * takes a list of known-closed Epic IDs and CONSTRUCTS `{epicId}-{suffix}.md`
 * names to look for. That is generate-and-check, and it cannot see a project
 * that does not name its work `M{n}.E{n}` — 8 of 12 real projects. This module
 * does the opposite job: it PARSES whatever is on disk.
 *
 * The two jobs need different inputs. A suffix list that is complete for
 * generating Signal's own filenames is not complete for parsing everyone
 * else's, which is why `PHASE10-S5` under-forms here (its only artifact is a
 * `RUNBOOK`, deliberately not a scaffold suffix — see `.planning/M5.E18-PLAN.md`
 * § "Not doing").
 *
 * THE RULE, in three passes:
 *
 *   1. Right-anchored suffix match. `PHASE10-S4-PLAN.md` -> `PHASE10-S4`, not
 *      `PHASE10` — the match is anchored at the END, so nested units survive.
 *   2. Categorical phase-name exclusion. A linear project legitimately writes
 *      `PLAN-PLAN.md` (`resolveArtifactPath` pattern 3), and deriving a unit
 *      called "PLAN" would archive its live plan. The seven canonical phases
 *      are a CLOSED, ENUMERATED set — this is a category, not a threshold.
 *   3. Conservative fold. `nextpass` writes plan-side artifacts as
 *      `PLAN-{unit}-{ARTIFACT}.md` and execution-side as `{unit}-{ARTIFACT}.md`,
 *      so one slice derives as two units — with the VERIFICATION on one side
 *      and the PLAN on the other. Left alone, closure resolution archives HALF
 *      A SLICE. So a unit `U` folds into a unit `V` when `U` ends with `-V`
 *      AND `V` was independently derived.
 *
 * WHY A FOLD AND NOT A PREFIX STRIP. PLAN specified "strip a leading phase
 * marker, then fold". Measured against all four real split pairs, the strip is
 * REDUNDANT — the fold alone merges all four, including the one the strip
 * cannot (`PLAN-SLICE-VOICE1` strips to `SLICE-VOICE1`, but its sibling is
 * `VOICE1`; the fold matches it directly because `PLAN-SLICE-VOICE1` ends with
 * `-VOICE1`). The fold is also strictly more conservative: it only ever renames
 * a unit onto a name the corpus already evidences, so a `PLAN-ORPHAN` with no
 * `ORPHAN` sibling is left exactly as derived. Dropping the strip is a
 * simplification against the plan, recorded in `M5.E18-PROGRESS.md`.
 */
import { SCAFFOLD_SUFFIXES } from './archive-tree.js';
import { PHASES } from './state.js';

const PHASE_NAMES = new Set(PHASES);

/**
 * The artifacts that prove a unit was **executed**, as opposed to merely scoped.
 *
 * NOT a narrower `SCAFFOLD_SUFFIXES` — a different question. `SCAFFOLD_SUFFIXES`
 * answers *"what archives with a closed unit"*; this answers *"what evidences
 * that work actually happened"*. `REQUIREMENTS` is deliberately absent: a unit
 * can be scoped and parked, and treating that as worked would manufacture a
 * chore for every idea anyone ever wrote down.
 *
 * Extracted from `state-drift.js` at M5.E18 S1.t2, where it was a local regex.
 * Its own tests caught the conflation when the extraction first defaulted
 * everything to `SCAFFOLD_SUFFIXES` — the rule is shared, the vocabulary is the
 * caller's.
 */
export const WORKED_SUFFIXES = Object.freeze([
  'PLAN',
  'PROGRESS',
  'VERIFICATION',
  'REVIEW',
]);

/**
 * The unit currently being worked, read from the RAW `current_epic` string
 * (M5.E18 FR3).
 *
 * Deliberately routed through NOTHING. `EPIC_ID_STRICT_RE`, `detectMode`,
 * `isEpicDone` and `readEffectiveProfile` all answer null / false / `'linear'`
 * for a non-strict value like `PHASE12` or `M1` — which is the right answer to
 * *"is this a strict Epic ID"* and the wrong answer to *"which unit is current"*.
 * Any not-current guard routed through one of them receives `null`, silently
 * never fires, and the unit being edited today becomes archivable. That is the
 * seam `B53` opened and `B72` widened.
 *
 * The four shapes on the real corpus, measured: 4 projects hold a value, 3 hold
 * `null`, 1 has the field absent from its frontmatter, and 4 have no frontmatter
 * at all (their `readState` returns null or throws). All four collapse to "no
 * unit is current" — the collapse is asserted in the tests so that splitting
 * them later has to be a decision.
 *
 * @param {object|null|undefined} state  a `readState()` result
 * @returns {string|null} the raw value, byte-for-byte, or null
 */
export function currentUnit(state) {
  const raw = state?.current_epic;
  if (typeof raw !== 'string') return null;
  return raw.trim() === '' ? null : raw;
}

/**
 * Match a scaffold suffix at the END of a filename stem.
 *
 * Prefers the LONGEST suffix, which is what keeps the match right-anchored:
 * for a stem ending `-VERIFICATION`, both `VERIFICATION` and nothing else
 * match, but the general rule matters where suffixes share a tail. A stem that
 * IS a bare suffix (`PLAN.md`) is not a unit — it is a root singleton.
 *
 * @param {string} stem  filename without the `.md`
 * @returns {string|null} the unit name, or null when no suffix matches
 */
function matchSuffix(stem, suffixes) {
  let best = null;
  for (const suffix of suffixes) {
    if (stem === suffix) continue;
    if (!stem.endsWith(`-${suffix}`)) continue;
    if (best === null || suffix.length > best.length) best = suffix;
  }
  if (best === null) return null;
  const unit = stem.slice(0, -(best.length + 1));
  return unit === '' ? null : unit;
}

/**
 * Resolve the fold target for `unit` against the set of independently-derived
 * unit names: the LONGEST other unit `v` such that `unit` ends with `-v`.
 *
 * Longest wins so the most specific sibling is chosen when several match.
 * Returns null when nothing matches — the conservative default.
 *
 * @param {string} unit
 * @param {Set<string>} derived
 * @returns {string|null}
 */
function foldTarget(unit, derived) {
  let best = null;
  for (const v of derived) {
    if (v === unit) continue;
    if (!unit.endsWith(`-${v}`)) continue;
    if (best === null || v.length > best.length) best = v;
  }
  return best;
}

/**
 * Group `.md` filenames into units of work.
 *
 * Total and deterministic: every `.md` input lands in exactly one of `units` or
 * `ungrouped`, and the result does not depend on input order. Non-`.md` input
 * is ignored rather than thrown on.
 *
 * `ungrouped` is ALWAYS an array, including when empty — an empty collection
 * must stay distinguishable from one that was never computed (`B39`'s shape).
 *
 * The RULE is shared; the SUFFIX VOCABULARY is the caller's. `SCAFFOLD_SUFFIXES`
 * (the default) answers *"what archives with a closed unit"*; `WORKED_SUFFIXES`
 * answers *"what evidences work happened"*. Passing the wrong one silently
 * changes the question — see `WORKED_SUFFIXES`' note.
 *
 * @param {string[]} filenames  bare filenames, not paths
 * @param {{suffixes?: readonly string[]}} [opts]
 * @returns {{units: Map<string, string[]>, ungrouped: string[]}}
 */
export function deriveUnits(filenames, opts = {}) {
  const suffixes = opts.suffixes ?? SCAFFOLD_SUFFIXES;
  const ungrouped = [];
  const raw = new Map();

  // Pass 1 + 2 — suffix match, then the categorical phase-name exclusion.
  for (const name of [...(filenames ?? [])].sort()) {
    if (typeof name !== 'string' || !name.endsWith('.md')) continue;
    const unit = matchSuffix(name.slice(0, -3), suffixes);
    if (unit === null || PHASE_NAMES.has(unit)) {
      ungrouped.push(name);
      continue;
    }
    if (!raw.has(unit)) raw.set(unit, []);
    raw.get(unit).push(name);
  }

  // Pass 3 — the conservative fold. Targets are resolved against the ORIGINAL
  // derived set, so folding is single-hop and cannot chain: a unit that only
  // exists because something folded into it never becomes a fold target
  // itself, and the result stays independent of iteration order.
  const derived = new Set(raw.keys());
  const units = new Map();
  for (const [unit, files] of [...raw.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const target = foldTarget(unit, derived) ?? unit;
    if (!units.has(target)) units.set(target, []);
    units.get(target).push(...files);
  }
  for (const files of units.values()) files.sort();

  return { units, ungrouped: ungrouped.sort() };
}
