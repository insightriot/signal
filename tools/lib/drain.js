// FUTURE-IDEAS drain helpers (M4.5.E2.S5) — the back-half of `/sig:add`.
//
// `/sig:add` is the capture pipe into `.planning/FUTURE-IDEAS.md`; this module is
// the drain pipe out of it. `/sig:plan` calls `listDrainCandidates` to surface
// un-dispositioned entries as promotion candidates, then `applyDisposition`
// (S5.t2) to record a chosen verb inline. Both the surface step and the write
// step consume ONE shared parser (`parseEntries`) so the byte ranges they act on
// can never drift apart (R1/R5).
//
// Design constraints (from .planning/M4.5.E2-PLAN.md § "2026-05-30 RE-PLAN" S5,
// .planning/M4.5.E2-RESEARCH.md § Q2):
//   - Pure functions over a content string — no I/O. The command layer reads the
//     file, calls these, and does the single full-file atomicWrite.
//   - Fence-aware: a `## ` (or `**Status:**`) line inside a ``` / ~~~ code fence
//     is literal text, never document structure (R1 — live FUTURE-IDEAS has
//     fenced markdown samples).
//   - Tolerate a mid-file orphaned `*Last updated:*` footer (it is non-heading
//     text, so it folds into whatever entry contains it — see RESEARCH § R1).
//   - Q2: a drain candidate is any top-level `## ` entry that is NOT already
//     dispositioned. No date window — disposition-state is the only gate.
//
// No new runtime deps — pure string work.

// Top-level entry boundary: a line that begins with exactly `## ` (two hashes +
// space). `### …` has a non-space at index 2, so it never matches — nested
// headings stay inside their parent entry.
const HEADING_RE = /^## /;

// A heading whose title leads with a disposition marker is already disposed
// (Q2). Anchored at `^##\s*` per RESEARCH § Q2; matched against the raw heading
// line. The optional `✓ ` covers the `## ✓ SHIPPED — …` shape used in the live
// file.
const HEADING_DISPOSED_RE = /^##\s*(✓\s*)?(SHIPPED|PROMOTED|DEFERRED|MERGED|DELETED)\b/i;

// A Status line carrying a disposition verb is already disposed (Q2). This is
// the rule the drain stamp written by applyDisposition (S5.t2) — `… → Deferred
// 2026-05-30 (M4.5.E2 drain).` — relies on so a dispositioned entry never
// resurfaces on the next drain. Deliberately case-sensitive and prose-blind per
// the locked Q2 regex: a Status that already reads "Deferred from M4.5.E7 …"
// counts as dispositioned too (a defer decision was already recorded). Simpler
// rule chosen over a window in RESEARCH § Q2; the over-match is intentional.
const STATUS_DISPOSED_RE = /\b(Promoted|Deferred|Merged|Deleted)\b/;

// First `**Status:**` line of an entry (leading whitespace tolerated).
const STATUS_LINE_RE = /^\s*\*\*Status:\*\*/;

// An ISO date anywhere in a line: YYYY-MM-DD.
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

// True when the (trimmed) line opens or closes a fenced code block.
function isFenceMarker(line) {
  const t = line.trimStart();
  return t.startsWith('```') || t.startsWith('~~~');
}

// Byte offset where each line begins. offsets[i] is the start of line i; the
// last entry's range ends at content.length. `\n` is restored as the +1 the
// split removed.
function lineOffsets(lines) {
  const offsets = [];
  let off = 0;
  for (const line of lines) {
    offsets.push(off);
    off += line.length + 1;
  }
  return offsets;
}

/**
 * Parse a FUTURE-IDEAS-shaped markdown string into its top-level `## ` entries.
 * Fence-aware and tolerant of an orphaned mid-file footer. Content before the
 * first `## ` heading (title, intro, the first `---`) is preamble and is not an
 * entry.
 *
 * Each returned entry:
 *   - `heading`      — the title text after `## ` (trimmed); for display.
 *   - `statusLine`   — the first non-fenced `**Status:**` line in the block
 *                      (raw, trimmed), or `null` if the entry has none.
 *   - `dateISO`      — first ISO date found in the Status line, else in the
 *                      heading, else `null` (informational; Q2 uses no window).
 *   - `dispositioned`— true iff the heading marker OR the Status verb says so.
 *   - `range`        — `{ start, end }` byte offsets `[start, end)` of the whole
 *                      block (heading line through the byte before the next
 *                      top-level heading, or EOF). Ranges tile gap-free, so
 *                      editing one block leaves every other byte identical (R1).
 *
 * @param {string} content
 * @returns {Array<{heading: string, statusLine: string|null, dateISO: string|null, dispositioned: boolean, range: {start: number, end: number}}>}
 */
export function parseEntries(content) {
  if (typeof content !== 'string' || content === '') return [];

  const lines = content.split('\n');
  const offsets = lineOffsets(lines);

  // First pass — find top-level heading line indices, fence-aware.
  const headingIdxs = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceMarker(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && HEADING_RE.test(lines[i])) headingIdxs.push(i);
  }

  // Second pass — build one entry per heading, scanning its own line span for
  // the Status line (fence-aware again, since the span can contain a fence).
  return headingIdxs.map((startLine, k) => {
    const endLine = k + 1 < headingIdxs.length ? headingIdxs[k + 1] : lines.length;
    const headingLineRaw = lines[startLine];
    const heading = headingLineRaw.replace(HEADING_RE, '').trim();

    let statusLine = null;
    let innerFence = false;
    for (let i = startLine + 1; i < endLine; i++) {
      if (isFenceMarker(lines[i])) {
        innerFence = !innerFence;
        continue;
      }
      if (!innerFence && STATUS_LINE_RE.test(lines[i])) {
        statusLine = lines[i].trim();
        break;
      }
    }

    const dateFrom = (s) => {
      const m = (s ?? '').match(DATE_RE);
      return m ? m[1] : null;
    };
    const dateISO = dateFrom(statusLine) ?? dateFrom(headingLineRaw);

    const dispositioned =
      HEADING_DISPOSED_RE.test(headingLineRaw) ||
      STATUS_DISPOSED_RE.test(statusLine ?? '');

    const start = offsets[startLine];
    const end = endLine < lines.length ? offsets[endLine] : content.length;

    return { heading, statusLine, dateISO, dispositioned, range: { start, end } };
  });
}

/**
 * The drain candidate set (Q2): every top-level entry that is NOT already
 * dispositioned, in document order. No date window — disposition-state is the
 * only gate, so the first post-S5 drain surfaces the whole standing backlog
 * (the intended one-time triage; the command layer mitigates the wall with
 * compact rendering + a "defer all remaining" batch, not by hiding entries).
 *
 * @param {string} content
 * @returns {ReturnType<typeof parseEntries>}
 */
export function listDrainCandidates(content) {
  return parseEntries(content).filter((e) => !e.dispositioned);
}
