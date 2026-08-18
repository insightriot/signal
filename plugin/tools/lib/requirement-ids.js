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
// SPELLINGS vs. FAMILIES — the distinction that governs what belongs here.
//
//   A SPELLING is one concept written differently. `FR-16` and `FR2b` are both
//   functional-requirement IDs, and real projects use both — Signal writes
//   `FR2b`, the field-fixture project writes `FR-16`. Excluding a spelling would BE
//   the second definition this module exists to prevent, so every pattern is
//   spelling-tolerant and BOTH consumers inherit that.
//
//   A FAMILY is a different concept: `NFR` is not `FR`. Which families a
//   consumer composes is that consumer's call, made explicitly at its call
//   site — see `extractIds` in `evict.js`, which deliberately omits NFR.
//
// The hyphenated spellings are not hypothetical and were not guessed: the
// artifact pair FR1's field fixture is taken from writes `AC-16.10`, `FR-16`
// and `NFR-9.2` throughout, and the pre-M5.E10 patterns matched NONE of it.

// Functional-requirement IDs: FR1, FR2a, FR2b, FR-16, FR-16.2.
export const FR_ID_RE = /\bFR-?\d+(?:\.\d+)?[a-z]?\b/g;
// Non-functional-requirement IDs: NFR1, NFR-9, NFR-9.2. `\bFR` cannot match
// inside `NFR` — there is no word boundary between `N` and `F` — so FR and NFR
// never double-count the same token.
export const NFR_ID_RE = /\bNFR-?\d+(?:\.\d+)?[a-z]?\b/g;
// Acceptance-criterion IDs: AC1, AC6.4, AC-16.10. `AC-seed` is excluded — the
// digit is what makes it an id, or every hyphenated `AC-` word in prose becomes
// one.
export const AC_ID_RE = /\bAC-?\d+(?:\.\d+)?\b/g;

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

/**
 * Every requirement ID declared in `text` — FR + NFR + AC.
 *
 * This is FR1's DENOMINATOR: the set a VERIFICATION artifact is diffed against.
 * It composes all three families because a requirement-coverage diff that
 * silently ignored non-functional requirements would report itself complete
 * while never having looked at them.
 *
 * ORDER IS PART OF THE CONTRACT: FR, then NFR, then AC, each in order of first
 * appearance. S2 names missing ids to a person, and family-grouped reads as a
 * report where id-sorted reads as a dump — `AC-16.1, AC-16.2, …` buries the one
 * missing NFR among ten ACs. Pinned by test, not left to the caller to sort.
 *
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function extractRequirementIds(text) {
  return [
    ...matchIds(text, FR_ID_RE),
    ...matchIds(text, NFR_ID_RE),
    ...matchIds(text, AC_ID_RE),
  ];
}

/**
 * One spelling for comparison: `AC-16.1` and `AC16.1` are the same requirement.
 *
 * Comparison only — the ORIGINAL spelling is what gets reported, because a
 * report naming an id the reader cannot find in their own file is worse than
 * no report.
 *
 * @param {string} id
 * @returns {string}
 */
export function canonicalId(id) {
  return id.replace(/^(NFR|FR|AC)-/, '$1');
}

/**
 * The requirement GROUP an id belongs to: `AC-16.10` → `FR-16`, `FR2b` →
 * `FR-2`, `NFR-9.2` → `NFR-9`.
 *
 * An acceptance criterion is numbered after the functional requirement it
 * belongs to — `AC-16.*` are the criteria OF `FR-16` — so they share a group.
 * `NFR` keeps its own namespace: `NFR-9` and `FR-9` are unrelated requirements
 * that merely share a number.
 *
 * @param {string} id
 * @returns {string}
 */
export function groupOf(id) {
  const m = /^(NFR|FR|AC)-?(\d+)/.exec(id);
  if (!m) return id;
  return `${m[1] === 'NFR' ? 'NFR' : 'FR'}-${m[2]}`;
}

/**
 * Drop ids that are group HEADINGS rather than checkable requirements.
 *
 * `FR-16` sitting above `AC-16.1`…`AC-16.11` is the name of a group whose
 * criteria are the things a VERIFICATION covers and a test map maps; counting
 * it as its own requirement inflates every denominator by one and reports the
 * heading itself as unverified. A group with no sub-numbered children keeps its
 * id — there, the id IS the requirement.
 *
 * Shared rather than duplicated: both FR1's coverage diff and FR2's
 * self-consistency check need exactly this rule, and two copies of "which token
 * is a real requirement" is the drift `B82` was.
 *
 * @param {string[]} ids
 * @returns {string[]}
 */
export function dropGroupLabels(ids) {
  const hasChildren = new Set();
  for (const id of ids) {
    if (/\.\d+$/.test(id)) hasChildren.add(groupOf(id));
  }
  return ids.filter((id) => /\.\d+$/.test(id) || !hasChildren.has(groupOf(id)));
}
