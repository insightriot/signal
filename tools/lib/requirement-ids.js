// The one place a requirement ID is recognised (M5.E10 S1, AC S1.1).
//
// Two consumers with DIFFERENT jobs share these patterns:
//
//   1. `evict.js`'s coverage gate — proves no discrete token was LOST when a
//      closed Epic's narrative is distilled into a card. It asks "does every ID
//      in the source survive into the card?"
//   2. FR1's requirement-coverage diff — enumerates what requirements EXIST in
//      a REQUIREMENTS artifact, to diff against the VERIFICATION artifact. It
//      asks "which declared requirements were never verified?"
//
// They are the same recognition problem and were about to become two
// implementations of it (`B82`'s shape: a second definition of "which files
// belong to this unit" that could not express the first). Hence one module.
//
// S1.t1 is a MOVE, not a change: the two patterns below are byte-identical to
// the ones `evict.js` carried, and the existing evict suite is what proves it.

// Functional-requirement IDs: FR1, FR2a, FR2b.
export const FR_ID_RE = /\bFR\d+[a-z]?\b/g;
// Acceptance-criterion IDs: AC1, AC6.4, AC-seed is excluded (needs a digit).
export const AC_ID_RE = /\bAC\d+(?:\.\d+)?\b/g;

/**
 * Distinct matches of `re` in `text`, in order of first appearance.
 *
 * Resets `lastIndex` before use: these regexes are module-level `/g` constants
 * shared by two consumers, so a stateful scan would make the SECOND caller get
 * a different answer than the first.
 *
 * @param {string|null|undefined} text
 * @param {RegExp} re
 * @returns {string[]}
 */
export function matchIds(text, re) {
  if (!text) return [];
  re.lastIndex = 0;
  const out = new Set();
  for (const m of text.matchAll(re)) out.add(m[0]);
  re.lastIndex = 0;
  return [...out];
}
