// FUTURE-IDEAS drain helpers (M4.5.E2.S5) — the back-half of `/sig:add`.
//
// `/sig:add` is the capture pipe into `.planning/FUTURE-IDEAS.md`; this module is
// the drain pipe out of it. `/sig:plan` calls `listDrainCandidates` to surface
// un-dispositioned entries as promotion candidates, then `applyDisposition`
// (S5.t2) to record a chosen verb inline. Both the surface step and the write
// step consume ONE shared parser (`parseEntries`) so the byte ranges they act on
// can never drift apart (R1/R5).
//
// Design constraints (from .planning/archive/M4.5/E2/M4.5.E2-PLAN.md § "2026-05-30 RE-PLAN" S5,
// .planning/archive/M4.5/E2/M4.5.E2-RESEARCH.md § Q2):
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
// No new runtime deps — pure string work; the single full-file atomicWrite is
// reused from the /sig:add substrate.

import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

import { atomicWrite } from './atomic-write.js';

// Top-level entry boundary: a line that begins with exactly `## ` (two hashes +
// space). `### …` has a non-space at index 2, so it never matches — nested
// headings stay inside their parent entry.
const HEADING_RE = /^## /;

// A heading whose title leads with a disposition marker is already disposed
// (Q2). Anchored at `^##\s*` per RESEARCH § Q2; matched against the raw heading
// line. The optional `✓ ` covers the `## ✓ SHIPPED — …` shape used in the live
// file.
const HEADING_DISPOSED_RE = /^##\s*(✓\s*)?(SHIPPED|PROMOTED|DEFERRED|MERGED|DELETED)\b/i;

// A Status line carrying the drain's OWN stamp is already disposed. The stamp
// written by applyDisposition (S5.t2) has a fixed shape — a verb, an ISO date,
// then a parenthetical containing "drain" — in both forms it emits:
//   append (entry already had a Status):  `… → Deferred 2026-05-30 (M4.5.E2 drain).`
//   insert (entry had no Status line):    `**Status:** Deferred 2026-05-30 (M4.5.E2 drain).`
// Matching that exact signature (verb + date + `(… drain)`) is what stops a
// dispositioned entry from resurfacing on the next drain.
//
// Q2 refinement (2026-05-31, user-approved in M4.5.E2 REVIEW): the original
// locked rule matched a *bare* verb anywhere in the Status (`/\b(Promoted|…)\b/`),
// which over-matched prose — e.g. `**Status:** Deferred from M4.5.E7 …` wrongly
// hid a genuine live entry (1 of 29 in the real file). Scoping to the stamp
// signature fixes that false-negative: only an actual drain disposition counts,
// not the word appearing in a sentence. (Heading markers like `## ✓ SHIPPED`
// are still caught by HEADING_DISPOSED_RE.)
const STATUS_DISPOSED_RE =
  /\b(Promoted|Deferred|Merged|Deleted)\s+\d{4}-\d{2}-\d{2}\s+\([^)\n]*\bdrain\b\)/;

// FR3 (v0.1.6): the 2026-07-04 backlog review stamped promotions as a LEADING
// blockquote (`> **Promoted 2026-07-04 → M4.5.E10** …`), which neither of the
// two REs above recognized — so those entries resurfaced on every drain. This
// matches such a stamp, ^-anchored at line start so a stamp merely QUOTED
// mid-prose (or a `> **Update …**` annotation on a still-open entry) is never
// mistaken for a real disposition. Verb set matches HEADING_DISPOSED_RE.
const BLOCKQUOTE_DISPOSED_RE =
  /^\s*>\s*\*\*(Promoted|Deferred|Merged|Shipped|Deleted)\b/i;

// FR3 (M5.E1): TERMINAL disposition markers — a strict subset of the three
// disposed REs above, with DEFERRED removed. SHIPPED/PROMOTED/MERGED/DELETED are
// disposed-for-good, so the entry is eligible to physically LEAVE the inbox for
// the archive ledger; DEFERRED is parked-but-live, so it stays. Each mirrors its
// disposed counterpart exactly (verb list minus DEFERRED) so classification can
// never drift from detection — the status variant keeps its counterpart's verb
// set (no `Shipped`; the drain never stamps "Shipped" onto a Status line).
const HEADING_TERMINAL_RE = /^##\s*(✓\s*)?(SHIPPED|PROMOTED|MERGED|DELETED)\b/i;
const STATUS_TERMINAL_RE =
  /\b(Promoted|Merged|Deleted)\s+\d{4}-\d{2}-\d{2}\s+\([^)\n]*\bdrain\b\)/;
const BLOCKQUOTE_TERMINAL_RE =
  /^\s*>\s*\*\*(Promoted|Merged|Shipped|Deleted)\b/i;

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
 *   - `dispositionKind` — the finer FR3 (M5.E1) signal: `'terminal'` for a
 *                      SHIPPED/PROMOTED/MERGED/DELETED disposition (eligible to
 *                      leave the inbox), `'deferred'` for a DEFERRED disposition
 *                      (parked-but-live, stays), `null` for un-dispositioned.
 *                      Invariant: `dispositioned === (dispositionKind !== null)`.
 *   - `range`        — `{ start, end }` byte offsets `[start, end)` of the whole
 *                      block (heading line through the byte before the next
 *                      top-level heading, or EOF). Ranges tile gap-free, so
 *                      editing one block leaves every other byte identical (R1).
 *
 * @param {string} content
 * @returns {Array<{heading: string, statusLine: string|null, dateISO: string|null, dispositioned: boolean, dispositionKind: 'terminal'|'deferred'|null, range: {start: number, end: number}}>}
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

    // FR3: a leading blockquote disposition stamp in the entry's header region
    // (first non-blank content line after the heading, fence-aware) marks the
    // entry dispositioned. Scanning only the first non-blank line keeps a stamp
    // quoted deeper in the body from being mistaken for a real disposition.
    let blockquoteDisposed = false;
    let blockquoteTerminal = false;
    {
      let hdrFence = false;
      for (let i = startLine + 1; i < endLine; i++) {
        if (isFenceMarker(lines[i])) {
          hdrFence = !hdrFence;
          continue;
        }
        if (hdrFence) continue;
        if (lines[i].trim() === '') continue;
        blockquoteDisposed = BLOCKQUOTE_DISPOSED_RE.test(lines[i]);
        blockquoteTerminal = BLOCKQUOTE_TERMINAL_RE.test(lines[i]);
        break; // first non-blank, non-fenced line decides
      }
    }

    const dispositioned =
      HEADING_DISPOSED_RE.test(headingLineRaw) ||
      STATUS_DISPOSED_RE.test(statusLine ?? '') ||
      blockquoteDisposed;

    // FR3 (M5.E1): refine to terminal-vs-deferred, gated on `dispositioned` so
    // the `dispositioned === (dispositionKind !== null)` invariant holds by
    // construction. A disposed entry is either terminal or (by elimination, since
    // the disposed verbs are exactly SHIPPED/PROMOTED/DEFERRED/MERGED/DELETED and
    // terminal covers all but DEFERRED) deferred.
    const terminalSignal =
      HEADING_TERMINAL_RE.test(headingLineRaw) ||
      STATUS_TERMINAL_RE.test(statusLine ?? '') ||
      blockquoteTerminal;
    const dispositionKind = dispositioned
      ? terminalSignal
        ? 'terminal'
        : 'deferred'
      : null;

    const start = offsets[startLine];
    const end = endLine < lines.length ? offsets[endLine] : content.length;

    return { heading, statusLine, dateISO, dispositioned, dispositionKind, range: { start, end } };
  });
}

/**
 * FR3 (M5.E1) predicate: is this entry eligible to physically leave the inbox
 * for the archive ledger? True only for a **terminal** disposition
 * (SHIPPED/PROMOTED/MERGED/DELETED) on a real inbox entry — never a `recovered`
 * entry (resurfaced from below a dangling fence; it has no stable index and must
 * never be mutated) and never a DEFERRED (parked-but-live) entry.
 *
 * @param {{dispositionKind?: string|null, recovered?: boolean}} entry
 * @returns {boolean}
 */
export function isEvictable(entry) {
  return entry.dispositionKind === 'terminal' && !entry.recovered;
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

/**
 * `listDrainCandidates` + dangling-fence recovery (FR4a, AD5). An UNCLOSED
 * fence (odd fence-marker count) leaves `parseEntries`' fence tracker stuck
 * "inside a fence" for the rest of the file, so every `## ` entry below the
 * dangling marker silently vanishes from the candidate set — an idea captured
 * after a malformed fenced sample would never surface for triage. This detects
 * that case and resurfaces the swallowed entries, plus a `danglingFence` signal
 * the command layer announces.
 *
 * `parseEntries` / `listDrainCandidates` keep their bare-return contracts (the
 * snapshot tests pin them); this is the sibling detect+recover per AD5. The
 * recovery is targeted, NOT a fence-oblivious re-parse: because the tail after
 * the *last* fence marker contains no fence markers by construction, re-parsing
 * only that tail resurfaces exactly the swallowed headings without ever
 * surfacing a heading that sits inside a legitimately-balanced fence.
 *
 * Out of scope (unchanged from parseEntries): fence-type (``` vs ~~~) matching.
 *
 * @param {string} content
 * @returns {{ candidates: ReturnType<typeof parseEntries>, danglingFence: boolean, recoveredCount: number }}
 */
export function listDrainCandidatesWithRecovery(content) {
  const candidates = listDrainCandidates(content);
  if (typeof content !== 'string' || content === '') {
    return { candidates, danglingFence: false, recoveredCount: 0 };
  }

  const lines = content.split('\n');
  let fenceCount = 0;
  let lastFenceLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceMarker(lines[i])) {
      fenceCount++;
      lastFenceLine = i;
    }
  }
  // Balanced fences → nothing swallowed → identical candidates, no warning.
  if (fenceCount % 2 === 0) {
    return { candidates, danglingFence: false, recoveredCount: 0 };
  }

  // Odd count: a dangling fence swallowed every heading after the last marker.
  // The tail past that marker has zero fence markers, so a plain re-parse of it
  // recovers exactly those headings; offset their ranges back into `content`.
  const offsets = lineOffsets(lines);
  const tailStart =
    lastFenceLine + 1 < lines.length ? offsets[lastFenceLine + 1] : content.length;
  const tail = content.slice(tailStart);
  const seenStarts = new Set(candidates.map((e) => e.range.start));
  const recovered = parseEntries(tail)
    .map((e) => ({
      ...e,
      // `recovered` entries are visible for triage-awareness but are NOT in
      // parseEntries(fullContent) — the dangling fence swallowed them — so they
      // have a valid `range` but no stable `entryIndex` for applyDisposition.
      // The tag lets /sig:plan render them yet exclude them from disposition /
      // "defer all remaining" until the fence is fixed (M4.5.E10 REVIEW F2).
      recovered: true,
      range: { start: e.range.start + tailStart, end: e.range.end + tailStart },
    }))
    .filter((e) => !e.dispositioned && !seenStarts.has(e.range.start));

  return {
    candidates: [...candidates, ...recovered],
    danglingFence: true,
    recoveredCount: recovered.length,
  };
}

// Disposition verb → the past-tense word recorded in the Status stamp. Only
// promote/defer ever stamp (delete/merge remove the block); merge/delete are
// listed for completeness but their entries are gone before a stamp would show.
const VERB_PAST = {
  promote: 'Promoted',
  defer: 'Deferred',
  merge: 'Merged',
  delete: 'Deleted',
};

// Index of the first non-fenced `**Status:**` line within a block's line array,
// or -1. Mirrors parseEntries' inner scan so surface and write agree on which
// line is "the Status line".
function statusLineIdxInBlock(lines) {
  let inFence = false;
  for (let i = 1; i < lines.length; i++) {
    if (isFenceMarker(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && STATUS_LINE_RE.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Transform a single entry's block text for `verb`. Pure string→string; the
 * caller splices the result back into the full content at the block's byte
 * range, so neighbours are never touched (R1/R5).
 *
 *   - promote / defer → record the disposition inline (never removes text):
 *       append ` → {Past} {date} ({reason}).` to the existing Status line, OR
 *       insert a fresh `**Status:** {Past} {date} ({reason}).` line under the
 *       heading when the entry has no Status line (the date-in-heading case).
 *   - delete / merge → remove the whole block (returns ''); the next heading
 *       slides up against the prior entry's trailing `---`. The reason is
 *       carried in the commit message, not the file.
 */
function transformBlock(block, verb, reason, date) {
  if (verb === 'delete' || verb === 'merge') return '';

  const past = VERB_PAST[verb];
  if (!past) throw new Error(`applyDisposition: unknown verb "${verb}".`);

  const lines = block.split('\n');
  const statusIdx = statusLineIdxInBlock(lines);

  if (statusIdx >= 0) {
    // Append the stamp to the existing Status line.
    lines[statusIdx] = `${lines[statusIdx].trimEnd()} → ${past} ${date} (${reason}).`;
    return lines.join('\n');
  }

  // No Status line — insert one under the heading (line 0). Slot it after the
  // blank line that conventionally follows the heading; if there is none,
  // insert directly after the heading.
  const insertAt = lines[1] !== undefined && lines[1].trim() === '' ? 2 : 1;
  lines.splice(insertAt, 0, `**Status:** ${past} ${date} (${reason}).`, '');
  return lines.join('\n');
}

/**
 * Record a disposition for entry `entryIndex` and return the new full content.
 * Pure — does NO I/O and does NO confirmation; the confirm gate + atomicWrite
 * live in `applyDispositionToFile`. Edits ONLY the target block's byte range, so
 * every other entry stays byte-identical (the R1 invariant the snapshot tests
 * pin). Signature matches the plan: `(content, entryIndex, verb, reason, date)`.
 *
 * @param {string} content
 * @param {number} entryIndex — index into `parseEntries(content)`
 * @param {'promote'|'defer'|'merge'|'delete'} verb
 * @param {string} reason — stamp context, e.g. "M4.5.E2 drain"
 * @param {string} date — ISO date YYYY-MM-DD
 * @returns {string} the new content
 */
export function applyDisposition(content, entryIndex, verb, reason, date) {
  const entries = parseEntries(content);
  const entry = entries[entryIndex];
  if (!entry) {
    throw new Error(
      `applyDisposition: no entry at index ${entryIndex} (have ${entries.length}).`
    );
  }
  const { start, end } = entry.range;
  const block = content.slice(start, end);
  const newBlock = transformBlock(block, verb, reason, date);
  return content.slice(0, start) + newBlock + content.slice(end);
}

/**
 * Apply a batch of dispositions in one pass (powers the "defer all remaining"
 * action, FR7.2). All ranges are computed from ONE initial parse, then applied
 * in DESCENDING entryIndex order — editing a higher-offset block never shifts a
 * lower-offset block's bytes, so each original range stays valid as the content
 * mutates beneath it. Skips duplicate indices defensively.
 *
 * @param {string} content
 * @param {Array<{entryIndex: number, verb: string, reason: string, date: string}>} dispositions
 * @returns {string} the new content
 */
export function applyDispositions(content, dispositions) {
  const entries = parseEntries(content);
  const seen = new Set();
  const ordered = [...dispositions]
    .filter((d) => {
      if (seen.has(d.entryIndex)) return false;
      seen.add(d.entryIndex);
      return true;
    })
    .sort((a, b) => b.entryIndex - a.entryIndex);

  let out = content;
  for (const { entryIndex, verb, reason, date } of ordered) {
    const entry = entries[entryIndex];
    if (!entry) {
      throw new Error(
        `applyDispositions: no entry at index ${entryIndex} (have ${entries.length}).`
      );
    }
    const { start, end } = entry.range;
    const newBlock = transformBlock(out.slice(start, end), verb, reason, date);
    out = out.slice(0, start) + newBlock + out.slice(end);
  }
  return out;
}

/**
 * Read a drain file, record one disposition, and write it back via the shared
 * full-file atomicWrite. Destructive verbs (`delete`/`merge`) MUST clear a
 * per-entry confirm gate first — `confirmPrompt(entry)` is awaited and anything
 * other than `'confirm'` aborts with the file left BYTE-for-byte unchanged
 * (R5 sub-gate; fires regardless of gate_strictness — the command supplies a
 * `strict-enum [confirm, keep]` prompt). promote/defer never prompt.
 *
 * @param {string} baseDir — project root
 * @param {string} relPath — destination path relative to baseDir (e.g. `.planning/FUTURE-IDEAS.md`)
 * @param {object} opts
 * @param {number} opts.entryIndex
 * @param {'promote'|'defer'|'merge'|'delete'} opts.verb
 * @param {string} opts.reason
 * @param {string} opts.date
 * @param {(entry: object) => Promise<'confirm'|'keep'>} [opts.confirmPrompt] — required for delete/merge
 * @param {Function} [opts.renameFn] — injected for the atomic-fail test; forwarded to atomicWrite
 * @returns {Promise<{written: boolean, kept?: boolean, verb: string, heading: string, path?: string}>}
 */
export async function applyDispositionToFile(baseDir, relPath, opts) {
  const { entryIndex, verb, reason, date, confirmPrompt, renameFn } = opts;
  const targetPath = join(baseDir, relPath);
  const content = await readFile(targetPath, 'utf-8');
  const entry = parseEntries(content)[entryIndex];
  if (!entry) {
    throw new Error(`applyDispositionToFile: no entry at index ${entryIndex} in ${relPath}.`);
  }

  if (verb === 'delete' || verb === 'merge') {
    if (typeof confirmPrompt !== 'function') {
      throw new Error(`applyDispositionToFile: "${verb}" requires a confirmPrompt.`);
    }
    const decision = await confirmPrompt(entry);
    if (decision !== 'confirm') {
      return { written: false, kept: true, verb, heading: entry.heading };
    }
  }

  const newContent = applyDisposition(content, entryIndex, verb, reason, date);
  await atomicWrite(targetPath, newContent, renameFn ? { renameFn } : undefined);
  return { written: true, verb, heading: entry.heading, path: targetPath };
}

// FR3 (M5.E1): the FUTURE-IDEAS archive ledger — where terminally-disposed
// entries physically go when they leave the inbox. Written once on first
// creation; every eviction appends a keyed block below it. Append-only; it is an
// archive, so it is intentionally NOT size-banner or write-guard watched.
const LEDGER_HEADER =
  '# FUTURE-IDEAS — archive ledger\n\n' +
  'Terminally-disposed entries (SHIPPED / PROMOTED / MERGED / DELETED) evicted from\n' +
  '`.planning/FUTURE-IDEAS.md`. Append-only; DEFERRED entries stay in the inbox.\n';

// Dedupe key for an evicted entry: sha1 of `heading + '|' + (dateISO ?? '')`.
// The ledger records `<!-- evicted-key: {key} -->` immediately above each block;
// a re-run whose key is already present appends nothing (idempotent) — the
// crash-safety backbone of the ledger-first ordering (AC4).
function evictionKey(entry) {
  return createHash('sha1').update(`${entry.heading}|${entry.dateISO ?? ''}`).digest('hex');
}

// Byte offset of the last (unclosed) fence-marker line when `content` has an odd
// fence count; `null` when fences are balanced (or none). Under a dangling fence
// an entry is only evictable if it sits FULLY ABOVE this offset (range.end ≤
// offset) — never cut a block across an unclosed fence, which would delete every
// swallowed idea below it (AD5 / R1).
function danglingFenceOffset(content) {
  const lines = content.split('\n');
  let count = 0;
  let lastLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceMarker(lines[i])) {
      count++;
      lastLine = i;
    }
  }
  if (count % 2 === 0 || lastLine < 0) return null;
  let off = 0;
  for (let i = 0; i < lastLine; i++) off += lines[i].length + 1;
  return off;
}

/**
 * FR3 (M5.E1): physically evict terminally-disposed FUTURE-IDEAS entries from
 * the inbox into an append-only archive ledger, so the inbox CONVERGES instead
 * of only growing (today `transformBlock` stamps in place, so disposed entries
 * never leave). DEFERRED entries are parked-but-live — NOT terminal — and stay.
 *
 * Two-file, crash-safe ordering — **ledger-append FIRST, then inbox-remove:**
 *   1. Read the inbox; select the terminal, non-recovered entries via isEvictable
 *      over parseEntries. Under a dangling (unclosed) fence, exclude every entry
 *      not fully ABOVE the marker and report `danglingFence` (a scoped no-op that
 *      leaves the file uncorrupted).
 *   2. Append each not-yet-ledgered block (absence detected by its
 *      `<!-- evicted-key -->` marker) to the ledger; atomicWrite the ledger FIRST.
 *   3. Remove those same blocks from the inbox — highest offset first, from ONE
 *      parse, so lower ranges stay valid (the applyDispositions pattern);
 *      atomicWrite the inbox SECOND.
 * A crash between the two writes leaves an entry in BOTH files; a re-run appends
 * nothing new to the ledger (key already present) and completes the inbox
 * removal — no dupe, no loss (AC4). The two writes are gated INDEPENDENTLY
 * (ledger on `additions`, inbox on `targets`) so the re-run still removes.
 *
 * `dryRun` writes NOTHING and returns the plan (R1 diff-preview: the inbox is
 * byte-identical after a dry run). Non-target blocks are always byte-identical
 * (exact-range splice — R1/R5).
 *
 * @param {string} baseDir — project root
 * @param {object} [opts]
 * @param {string} [opts.inboxRel='.planning/FUTURE-IDEAS.md']
 * @param {string} [opts.ledgerRel='.planning/archive/FUTURE-IDEAS-LEDGER.md']
 * @param {boolean} [opts.dryRun=false]
 * @param {string} [opts.date] — accepted for signature parity with
 *   applyDispositionToFile; the dedupe key uses each entry's own `dateISO`.
 * @param {Function} [opts.renameFn] — injected for the crash-injection test;
 *   forwarded to both atomicWrite calls.
 * @returns {Promise<{evicted: Array<{heading: string, key: string}>, planned: Array<{heading: string, key: string}>, danglingFence: boolean}>}
 */
export async function evictTerminalToLedger(baseDir, opts = {}) {
  const {
    inboxRel = '.planning/FUTURE-IDEAS.md',
    ledgerRel = '.planning/archive/FUTURE-IDEAS-LEDGER.md',
    dryRun = false,
    renameFn,
  } = opts;

  const inboxPath = join(baseDir, inboxRel);
  const ledgerPath = join(baseDir, ledgerRel);
  const content = await readFile(inboxPath, 'utf-8');

  // Reuse the existing dangling-fence signal (v0.1.6/AD5) — don't rebuild it.
  const { danglingFence } = listDrainCandidatesWithRecovery(content);
  const markerOffset = danglingFence ? danglingFenceOffset(content) : null;

  // Terminal, non-recovered entries; under a dangling fence, only those fully
  // above the marker (range.end ≤ markerOffset) so no block ever spans it.
  const entries = parseEntries(content);
  const targets = entries.filter(
    (e) => isEvictable(e) && (markerOffset === null || e.range.end <= markerOffset)
  );

  const planned = targets.map((e) => ({ heading: e.heading, key: evictionKey(e) }));

  if (dryRun) {
    return { evicted: [], planned, danglingFence };
  }

  // Step 2 — ledger-append FIRST. Read the current ledger (if any); append only
  // blocks whose key is not already present, keeping the append idempotent.
  let ledgerText = '';
  let ledgerExists = false;
  try {
    ledgerText = await readFile(ledgerPath, 'utf-8');
    ledgerExists = true;
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }

  const additions = [];
  for (const e of targets) {
    const marker = `<!-- evicted-key: ${evictionKey(e)} -->`;
    if (ledgerText.includes(marker)) continue; // already ledgered — dedupe
    additions.push(`${marker}\n${content.slice(e.range.start, e.range.end)}`);
  }

  if (additions.length > 0) {
    await mkdir(dirname(ledgerPath), { recursive: true });
    let ledger = ledgerExists ? ledgerText : LEDGER_HEADER;
    if (!ledger.endsWith('\n')) ledger += '\n';
    ledger += `\n${additions.join('\n')}`;
    if (!ledger.endsWith('\n')) ledger += '\n';
    await atomicWrite(ledgerPath, ledger, renameFn ? { renameFn } : undefined);
  }

  // Step 3 — inbox-remove SECOND. Highest offset first so each range stays valid
  // as bytes are spliced out. Gated on `targets` (NOT `additions`) so a crash
  // re-run — whose ledger additions are empty — still completes the removal.
  if (targets.length > 0) {
    const ordered = [...targets].sort((a, b) => b.range.start - a.range.start);
    let out = content;
    for (const e of ordered) {
      out = out.slice(0, e.range.start) + out.slice(e.range.end);
    }
    await atomicWrite(inboxPath, out, renameFn ? { renameFn } : undefined);
  }

  const evicted = targets.map((e) => ({ heading: e.heading, key: evictionKey(e) }));
  return { evicted, planned, danglingFence };
}
