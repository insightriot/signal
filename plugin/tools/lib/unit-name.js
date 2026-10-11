// tools/lib/unit-name.js — what a unit may be called (M5.E18 S6, NFR4).
//
// A leaf: it imports nothing. `archive-tree.js` uses the rule for a directory
// name under `.planning/archive/` and re-exports it; `unit-records.js` uses it
// for a record's file name. Both import it from here so neither has to import
// the other for it (M6.E16 S6: `archive-tree.js` reads unit records).

// Units are DERIVED from filenames (S1), so a `/` cannot occur in practice and
// the real corpus has no hostile name. That is luck of inventory, not safety:
// the derivation rule could widen, and a project could name a file anything. So
// the constraint is stated rather than assumed.
//
// First character must be alphanumeric — that alone blocks `.`, `..`, `.hidden`
// and `/abs`. The charset excludes `/` and `\`. `..` anywhere is rejected
// separately because `.` must remain legal INSIDE a name: `M4.5.E1` and `v0.1.6`
// are both real units.
const SAFE_UNIT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Is this unit name safe to use as a path component under `.planning/archive/`?
 * @param {unknown} unit
 * @returns {boolean}
 */
export function isSafeUnitName(unit) {
  if (typeof unit !== 'string' || unit.length === 0 || unit.length > 100) return false;
  if (unit.includes('..')) return false;
  return SAFE_UNIT_RE.test(unit);
}
