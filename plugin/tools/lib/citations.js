// The citation verifier — `M6.E7` S1. The property `/sig:advise` claims about
// itself: every claim it makes carries a citation that mechanically resolves.
//
// ⚠ WHY A TEXTUAL SCAN CANNOT WORK, and why this reads ONE structural position.
// The advisor quotes corpus text, and corpus text is full of backticked tokens
// that look exactly like citations and are not the advisor's claims. Measured on
// live `.planning/BACKLOG.md` rows: 108 path-like backticked tokens, 51 of which
// do not resolve from repo root (`../analysis/LOOP-GOAL-DIRECTION.md`,
// `wiki/AGENTS.md`, `.landing.lock`, …). A scan of the whole artifact would fire
// on the first quoted row, the run boundary would refuse, and the artifact would
// never be written — AC1.1 unsatisfiable while AC1.3 holds. So citations are
// emitted through one helper into one recognisable position — a trailing
// `— evidence: ` region on a claim line — and this module reads only that.
//
// ⚠ THE MARKER IS THE CONTRACT, so quoted text must not contain it. Extraction
// takes the FIRST marker occurrence on a line and treats the rest of the line as
// evidence. A quoted row that carried the literal marker would pull its own
// tokens into the region and fail the run — loudly, which is the correct
// direction to fail, but it is the renderer's job not to let it happen
// (`renderArtifact` strips the marker from quoted text). Stated here because the
// two halves of that contract live in different files.
//
// ⚠ WHAT THIS DOES NOT DO. It checks that a path exists and that a line is
// within it. It does not check that the cited line SAYS what the claim says it
// says. That is the same limit `M5.E10`'s seven checks and `B75`'s ask-record
// both publish: the semantic half is not built here.
//
// Grammar, deliberately NARROWER than the frozen `BACKLOG-REVIEW` artifact's.
// Enumerated over that file: `path` ×68, `path:line` ×35, bare-line `:219` ×32,
// range/list ×8 — and 56 of its ~65 path-bearing citations are relative to some
// other directory, not repo root. The advisor emits repo-root-relative `path` or
// `path:line[-lineEnd]` only, so the other forms need not be parsed. That is
// legitimate because this verifies THE ADVISOR'S OWN OUTPUT — it must not be
// described as a general reader of the frozen review, because it is not one.

import { statSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { realpathNearestExisting } from './path-confine.js';

/**
 * The one structural position a citation may occupy. Exported so the renderer
 * and the extractor cannot drift — a second literal copy of this string is how
 * the `B89` class starts.
 */
export const EVIDENCE_MARKER = '— evidence:';

/**
 * How many citations one verification pass will resolve against disk.
 *
 * `B15`'s rule: a bounded scan REPORTS its truncation rather than quietly
 * returning a short answer. Above this ceiling the result carries
 * `truncated: {limit, total}` and `ok` is false — a verifier that says "ok"
 * about a set it did not finish reading is the silent pass.
 *
 * 500 is roughly ten times the live corpus's ~50 rows, so a real run never
 * reaches it; it exists to bound a pathological input, not to trim a normal one.
 */
export const CITATION_SCAN_CEILING = 500;

/** `path`, `path:12`, `path:112-118`, `path:112–118` (en-dash and hyphen). */
const TOKEN_WITH_LINES = /^(.+?):(\d+)(?:[-–](\d+))?$/;

/**
 * Pull every citation out of the evidence positions in `text`.
 *
 * Returns `[{raw, path, line, lineEnd, offset}]` in document order. `line` and
 * `lineEnd` are `undefined` when the citation names a whole file.
 *
 * An unparseable token inside the marker is COLLECTED, not dropped — its whole
 * text becomes the path, which then fails to resolve. Dropping it would be
 * under-reporting, and under-reporting is what makes a gate decorative.
 */
export function extractCitations(text) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const found = [];
  let lineStart = 0;

  for (const line of text.split('\n')) {
    const markerAt = line.indexOf(EVIDENCE_MARKER);
    if (markerAt !== -1) {
      const regionStart = markerAt + EVIDENCE_MARKER.length;
      const region = line.slice(regionStart);
      const backticked = /`([^`\n]+)`/g;
      let m;
      while ((m = backticked.exec(region)) !== null) {
        const raw = m[1].trim();
        if (raw.length === 0) continue;
        // +1 steps past the opening backtick; the second term re-adds whatever
        // `trim()` removed, so `offset` points at the first character of `raw`
        // rather than at the whitespace before it. The invariant this field
        // exists for is `text.slice(offset, offset + raw.length) === raw`, and
        // without the adjustment a token written as `` ` path.md` `` breaks it.
        const offset = lineStart + regionStart + m.index + 1 + (m[1].length - m[1].trimStart().length);
        const parts = TOKEN_WITH_LINES.exec(raw);
        if (parts) {
          found.push({
            raw,
            path: parts[1],
            line: Number(parts[2]),
            lineEnd: parts[3] === undefined ? undefined : Number(parts[3]),
            offset,
          });
        } else {
          found.push({ raw, path: raw, line: undefined, lineEnd: undefined, offset });
        }
      }
    }
    lineStart += line.length + 1; // +1 for the '\n' that split consumed
  }

  return found;
}

/**
 * Confine a cited path to the repo before any disk touch (`B22`).
 *
 * Two checks, in this order: lexical (normalizes `..`, rejects absolutes), then
 * a realpath re-assert on the nearest existing ancestor — because the lexical
 * guard does NOT follow symlinks, and git tracks directory symlinks (mode
 * 120000). Returns the absolute path, or a string reason.
 */
function confine(baseDir, citedPath) {
  if (citedPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(citedPath)) {
    return { reason: 'citations must be repo-root-relative; this one is absolute' };
  }
  // TWO CHECKS, and each does a job the other cannot.
  //
  // Lexical first, against `resolve(baseDir)` — the UN-resolved root, because
  // `abs` is built from the un-resolved root too and comparing the two forms was
  // the redundancy a reviewer flagged. It normalizes `..` and catches a traversal
  // before anything touches the disk (`B22`).
  //
  // Then realpath, which the lexical check cannot do: git tracks directory
  // symlinks (mode 120000), and a checked-in one inside the repo escapes a purely
  // textual guard.
  const lexicalBase = resolve(baseDir);
  const abs = resolve(baseDir, citedPath);
  if (abs !== lexicalBase && !abs.startsWith(lexicalBase + sep)) {
    return { reason: 'resolves outside the repo' };
  }
  const realBase = realpathNearestExisting(baseDir);
  const real = realpathNearestExisting(abs);
  if (real !== realBase && !real.startsWith(realBase + sep)) {
    return { reason: 'resolves outside the repo (through a symlink)' };
  }
  return { abs };
}

/** Lines in a file, counting the way an editor does: a trailing newline adds none. */
function countLines(content) {
  if (content.length === 0) return 0;
  const n = content.split('\n').length;
  return content.endsWith('\n') ? n - 1 : n;
}

/**
 * Verify every citation in `text` against disk.
 *
 * Returns `{ok, resolved, unresolved, truncated}`. `truncated` is `null` when the
 * whole set was examined, else `{limit, total}`.
 *
 * ⚠ `ok: true` on ZERO citations is correct here and VACUOUS at a gate. Nothing
 * was wrong because nothing was claimed. The run boundary in `advise.js` asserts
 * a COUNT for exactly this reason — an extractor that missed the renderer's
 * grammar would hand a caller `ok: true` over an artifact with nothing checked.
 */
export async function verifyCitations(baseDir, text) {
  const all = extractCitations(text);
  const truncated =
    all.length > CITATION_SCAN_CEILING ? { limit: CITATION_SCAN_CEILING, total: all.length } : null;
  const examined = truncated ? all.slice(0, CITATION_SCAN_CEILING) : all;

  const resolved = [];
  const unresolved = [];

  for (const c of examined) {
    const confined = confine(baseDir, c.path);
    if (confined.reason) {
      unresolved.push({ ...c, reason: confined.reason });
      continue;
    }
    const abs = confined.abs;
    if (!existsSync(abs)) {
      unresolved.push({ ...c, reason: 'does not exist' });
      continue;
    }
    // ⚠ NOT `isDirectory()`. A directory is only the shape that occurred to me;
    // the guard has to be "is this a regular file", because a FIFO passes an
    // is-not-a-directory test and then HANGS the await below rather than
    // throwing — which a try/catch around the read cannot save. Sockets and
    // device nodes are the same class. Refusing before the read is the only
    // version that works. (Reviewer-found; their suggested fix was the wrap,
    // which covers the throw and not the hang.)
    const st = statSync(abs);
    if (!st.isFile()) {
      const kind = st.isDirectory() ? 'is a directory, which cannot carry a line' : 'is not a regular file';
      unresolved.push({ ...c, reason: kind });
      continue;
    }
    if (c.line === undefined) {
      resolved.push(c);
      continue;
    }
    if (c.lineEnd !== undefined && c.lineEnd < c.line) {
      unresolved.push({ ...c, reason: 'range ends before its start' });
      continue;
    }
    // `existsSync` passed and it is a regular file, and it can STILL be
    // unreadable — mode 000, a permissions change between the two calls. This
    // function documents `{ok, resolved, unresolved, truncated}`; letting EACCES
    // out of it breaks that contract for every caller, including the `render`
    // seam and any future one.
    let content;
    try {
      content = await readFile(abs, 'utf8');
    } catch (err) {
      unresolved.push({ ...c, reason: `could not be read — ${err.code ?? err.message}` });
      continue;
    }
    const total = countLines(content);
    const highest = c.lineEnd ?? c.line;
    if (c.line < 1 || highest > total) {
      unresolved.push({ ...c, reason: `file has only ${total} lines` });
      continue;
    }
    resolved.push(c);
  }

  return { ok: unresolved.length === 0 && truncated === null, resolved, unresolved, truncated };
}
