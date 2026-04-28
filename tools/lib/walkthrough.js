// Helpers for the /sig:init Step 5 assumption-surfacing walkthrough (T4.8).
//
// Two responsibilities:
//   1. countMarkers — used by the pre-walkthrough zero-marker skip path. If
//      the user pre-edited PROJECT.md and resolved every `[INFERRED — ...]` /
//      `[FILL IN — ...]` marker before /sig:init Step 5 runs, the walkthrough
//      can short-circuit and emit a 1-line skip notice.
//   2. appendNote — used by the Edit and Defer capture rules. Each captured
//      note (original inferred content, user reason for edit, deferred field)
//      is appended as a `- ` bullet to PROJECT.md's `## Notes` section.
//
// Detection deliberately ignores bare `[INFERRED]` / `[FILL IN]` strings — the
// generated PROJECT.md header references them in prose ("Every `[INFERRED]`
// and `[FILL IN]` marker is your responsibility...") and those aren't real
// markers to walk. Real markers always carry a reason after the keyword (the
// templates in init.md Step 4 always emit `[INFERRED — please verify]` or
// `[FILL IN — <reason>]`).

const INFERRED_MARKER_RE = /\[INFERRED[^\]]+\]/g;
const FILL_IN_MARKER_RE = /\[FILL IN[^\]]+\]/g;

/**
 * Count the [INFERRED — ...] and [FILL IN — ...] markers in markdown content.
 * Bare `[INFERRED]` / `[FILL IN]` (no content after the keyword) do not match
 * — those are typically prose references, not unresolved markers.
 *
 * @param {string|null} content
 * @returns {{inferred: number, fillIn: number, total: number}}
 */
export function countMarkers(content) {
  if (!content) return { inferred: 0, fillIn: 0, total: 0 };
  const inferred = (content.match(INFERRED_MARKER_RE) || []).length;
  const fillIn = (content.match(FILL_IN_MARKER_RE) || []).length;
  return { inferred, fillIn, total: inferred + fillIn };
}

/**
 * Append a note (as a `- ` bullet) to the `## Notes` section. Creates the
 * section at the end of the document if it doesn't exist. Trailing blank
 * lines inside the existing section are collapsed before the bullet is
 * inserted, so repeated appends produce a single contiguous bullet list.
 *
 * @param {string|null} content
 * @param {string} note - the note body; will be wrapped as `- ${note}`
 * @returns {string|null}
 */
export function appendNote(content, note) {
  if (!content) return content;
  const trimmed = (note ?? '').trim();
  if (!trimmed) return content;
  const bullet = `- ${trimmed}`;

  const lines = content.split('\n');
  const notesIdx = lines.findIndex((l) => /^## Notes\s*$/.test(l));

  if (notesIdx === -1) {
    // No `## Notes` section — append a new one at the end. Make sure the
    // new section starts on its own (blank line before, blank line after
    // the heading) so it reads naturally regardless of how the existing
    // document terminated.
    const trailing = content.endsWith('\n') ? '' : '\n';
    return `${content}${trailing}\n## Notes\n\n${bullet}\n`;
  }

  // Find the end of the Notes section: next h2 heading or end of array.
  let endIdx = lines.length;
  for (let i = notesIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  // Walk back from endIdx-1 over trailing blank lines (and the heading line
  // itself, if the section is empty). Stop on the first non-blank line, which
  // is our last existing bullet (or the heading if the section is empty).
  let lastBodyIdx = endIdx - 1;
  while (lastBodyIdx > notesIdx && lines[lastBodyIdx].trim() === '') {
    lastBodyIdx--;
  }

  // If the section was empty, lastBodyIdx ends up on the heading; insert a
  // blank line before the bullet for conventional `## Notes\n\n- bullet` shape.
  const sectionWasEmpty = lastBodyIdx === notesIdx;
  const insertion = sectionWasEmpty ? ['', bullet] : [bullet];

  // Lines between lastBodyIdx+1 and endIdx are "padding" — blank lines that
  // separated the section's last content from the next h2 (or end-of-file).
  // Collapse them to at most one blank line, regardless of how many were
  // present originally. This normalizes inputs like `## Notes\n\n\n\n`.
  const padding = lines.slice(lastBodyIdx + 1, endIdx);
  const limitedPadding = padding.length > 0 ? [''] : [];
  const tail = lines.slice(endIdx);

  const newLines = [
    ...lines.slice(0, lastBodyIdx + 1),
    ...insertion,
    ...limitedPadding,
    ...tail,
  ];

  return newLines.join('\n');
}
