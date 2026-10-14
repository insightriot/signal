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

/**
 * `text` with every run of whitespace that holds a line break made one space,
 * so the words on either side stay apart; a run without one is kept as it was
 * written. One pass over the text: each run is matched once, by a pattern with
 * nothing after it to backtrack into, so a megabyte of spaces costs a megabyte
 * (REVIEW pass 1, S-M1 — the pattern this replaces tried every start of a long
 * run and cost its length squared).
 *
 * @param {string} text
 * @returns {string}
 */
export const oneLine = (text) => text.replace(/\s+/g, (run) => (run.includes('\n') || run.includes('\r') ? ' ' : run));

/**
 * `text` with every character outside printable ASCII written as a `\uXXXX`
 * escape: a line break, a control character or an invisible one is then
 * something a person sees, and nothing a terminal or a reader acts on.
 *
 * @param {unknown} text
 * @returns {string}
 */
export const ascii = (text) => String(text).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** How much of a path or a name from the disk a message prints. A record's path is under 140 characters. */
export const NAME_SHOWN_MAX = 240;
/** How much of a record's value a refusal echoes. */
export const VALUE_SHOWN_MAX = 300;

/**
 * A path, a file name or an ID read from the disk, as a message may print it
 * (REVIEW pass 1, S-M2): `ascii`, and at most `max` characters of it — a
 * longer one ends `... (N characters)`. A name of printable ASCII under the
 * limit comes back as it is. The exact path stays in the structured result
 * beside the message, for code that opens the file.
 *
 * @param {unknown} text
 * @param {number} [max]
 * @returns {string}
 */
export function shownName(text, max = NAME_SHOWN_MAX) {
  const s = String(text);
  return s.length <= max ? ascii(s) : `${ascii(s.slice(0, max))}... (${s.length} characters)`;
}

// A branch or remote name that is plainly a name (M6.E16 r6.3): letters,
// digits, `.`, `_`, `/` and `-`, at most 100 of them, and no `-` first (which
// a command would read as an option). Git allows far more — `;`, `$`, `|`,
// a backtick, a space-like character — and a name comes from whoever pushed
// the branch.
const REF_NAME_RE = /^[A-Za-z0-9._/][A-Za-z0-9._/-]{0,99}$/;

/**
 * May this branch or remote name be written into a message or a command?
 *
 * @param {unknown} name
 * @returns {boolean}
 */
export const isPlainRefName = (name) => typeof name === 'string' && REF_NAME_RE.test(name);

// A name that is not plainly one may still be SHOWN — `fix/#123`,
// `feature/c++`, `user@fix` — when it is short and holds nothing a shell, a
// terminal or a reader of markdown acts on: no space or space-like character,
// no control or invisible character, and none of `` ` $ ; | & < > ( ) ' " \ ``.
const REF_SHOWN_MAX = 60;
const REF_NOT_SHOWN_RE = /[\s`$;|&<>()'"\\\p{C}\p{Z}]/u;

/**
 * A name that is not plainly a name (`isPlainRefName`), as it may be shown:
 * through `ascii`, so `café` reads `café`. Null when it may not be shown
 * at all — over 60 characters, empty, or holding one of the characters above.
 *
 * @param {unknown} name
 * @returns {string|null}
 */
export function oddRefNameShown(name) {
  const s = String(name);
  return s.length === 0 || s.length > REF_SHOWN_MAX || REF_NOT_SHOWN_RE.test(s) ? null : ascii(s);
}

/**
 * A branch, remote or tag name as a message shows it: the name when it is
 * plainly one (`isPlainRefName`); otherwise a note in brackets — with the
 * name, escaped, when it may be shown (`oddRefNameShown`), and with only its
 * length when it may not. Never put what this returns into a command: ask
 * `isPlainRefName` first, and give no command when it says no.
 *
 * @param {unknown} name
 * @param {'branch'|'remote'|'tag'} [what]
 * @returns {string}
 */
export function shownRef(name, what = 'branch') {
  if (isPlainRefName(name)) return name;
  const shown = oddRefNameShown(name);
  return shown === null
    ? `(a ${what} whose name is not shown: ${String(name).length} characters)`
    : `(${what} \`${shown}\` — its name cannot be written safely in a command, so none is given)`;
}

/**
 * A record's value as a refusal echoes it (REVIEW pass 1, S-L1): its JSON,
 * through `shownName` — so a 2 MB title gives a message of a few hundred
 * characters, and a value of printable ASCII under the limit reads as
 * `JSON.stringify` wrote it.
 *
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
export function echoed(value, max = VALUE_SHOWN_MAX) {
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    json = undefined; // a cycle, a BigInt: nothing a parsed record holds
  }
  return shownName(json === undefined ? String(value) : json, max);
}
