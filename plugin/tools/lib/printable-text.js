// Text a person reads before they confirm, and text kept from a hand-written
// source (M6.E16 t7.1). A leaf: it imports nothing, so the unit library and
// the migration can both use it.

/**
 * `s` with no control characters — C0, DEL, C1 — and no bidi overrides or
 * isolates: a terminal would act on them, or show the text in another order
 * than it is stored. Every control (Cc) and format (Cf) character goes, which
 * takes in the marks that move or hide text (LRM, RLM, ALM, zero-width, the
 * BOM) and the invisible tag characters that could carry text a model reads
 * and a person does not (M6.E15 REVIEW pass 4); plus the line and paragraph
 * separators and the variation selectors. Applied per line by a caller that
 * wants its own line breaks kept.
 *
 * @param {unknown} s
 * @returns {string}
 */
export const printable = (s) => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029\p{Variation_Selector}]/gu, '');

/**
 * `text` cut to at most `max` characters, ending in `…` when it was cut.
 * Nothing else changes — no whitespace is folded — so text at or under the
 * limit comes back as it was given. Never ends on half of a surrogate pair.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function cut(text, max) {
  if (text.length <= max) return text;
  let head = text.slice(0, max - 1);
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1);
  return `${head}…`;
}
