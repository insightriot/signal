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

// The names Windows keeps for devices. A file called one of them — in any
// letter case, with or without an extension (`NUL`, `nul.json`, `Com1.notes`)
// — cannot be created there, or opens the device instead.
const DEVICE_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']);

/**
 * Is this name a Windows device name: what stands before its first `.`, in
 * any letter case, is one of `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`,
 * `LPT1`–`LPT9` (REVIEW pass 1, S-L3). A unit record's file is named for its
 * unit, so such a unit could not be checked out on Windows.
 *
 * Separate from `isSafeUnitName` on purpose: that rule also decides what a
 * project WITHOUT unit records may archive, and it is unchanged (AC6.4).
 *
 * @param {unknown} name
 * @returns {boolean}
 */
export function isReservedDeviceName(name) {
  if (typeof name !== 'string') return false;
  const dot = name.indexOf('.');
  return DEVICE_NAMES.has((dot === -1 ? name : name.slice(0, dot)).toUpperCase());
}
