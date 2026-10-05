// The unit id a heading or a title LEADS with (`M6.E4`, `B113`), in one place.
//
// A leaf module — no imports from `lib/` — and deliberately NOT a list parser:
// it tests ONE string for a leading id. `legacy-lists.js` uses it on each
// BACKLOG.md heading it parses (store off), and `drive.js` uses it on a work
// record's title (store on), so both paths rank "leads with a unit id" by the
// same rule (M6.E13 t7.1b R5). Kept out of `legacy-lists.js`, whose functions
// throw under the parser ban, because the store-on path must be able to call it.
//
// The id a row LEADS with, past the decoration real headings carry: an ordinal
// (`1. `), a status glyph, backticks, bold, strikethrough.
//
// **Both decoration runs are BOUNDED, and that is a fix rather than a style.**
// Written first as `[…]*(?:\d+\.\s*)?[…]*`, two adjacent overlapping star-runs
// backtrack quadratically on a non-matching heading: measured at REVIEW, a line
// of 50,000 backticks took **3.9 seconds** inside `parseBacklogRows`, and
// `/sig:docs-sweep` runs this over every heading in the file. Real heading decoration
// is a handful of characters, so a bound costs nothing and removes the class.
export const LEADING_ID_RE =
  /^[\s`*_~✅▶⚠✂]{0,40}(?:\d+\.\s{0,4})?[\s`*_~]{0,10}((?:M\d+(?:\.\d+)?\.E\d+)|(?:B\d+))\b/;

/**
 * The unit or bug id `text` leads with, or null.
 *
 * @param {unknown} text — one heading or title
 * @returns {string|null}
 */
export function leadingUnitId(text) {
  const m = String(text ?? '').match(LEADING_ID_RE);
  return m ? m[1] : null;
}
