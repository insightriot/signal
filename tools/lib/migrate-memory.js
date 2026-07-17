// tools/lib/migrate-memory.js — the /sig:migrate-memory command engine (M5.E2, FR6/FR7).
//
// Auto-sensing doc-runtime migrate: reorganizes the INVOKING project's
// `.planning/` docs to the FR1 model (de-prose frontmatter, relocate bloated
// bodies, evict closed-Epic narrative, build the archive tree). The three
// non-negotiables (NFR safety-first):
//   - dry-run by DEFAULT (FR6.1) — --apply is required to write;
//   - relocate-never-delete (FR6.3) — the removed content lands in its new home
//     BEFORE the source is shortened, verified by the faithfulness gate;
//   - git-reversible (FR6.2) — apply leaves changes staged-not-committed in the
//     invoking repo, with a pre-migrate tag + the exact revert line printed.
//
// This is the S1.t1 SHELL: arg parse + the orchestration entry + a no-op sense
// stub. The engine grows across the slice — the faithfulness gate (S1.t3), the
// vector de-prose/relocate mechanics (S1.t4/t5), the auto-sense brain (S1.t6),
// the safety harness (S1.t7), and the stamp+idempotency (S1.t8). Until then both
// modes are write-free (the dry-run write-nothing invariant is the load-bearing
// AC and must hold from the first commit).

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, sep } from 'node:path';

import { PLANNING_DIR, withStateLock, EPIC_ID_STRICT_RE } from './state.js';
import { atomicWrite } from './atomic-write.js';
import {
  extractEpicSection,
  verifyCardCoverage,
  extractCarryOvers,
  insertCarryOvers,
  deriveEpicArchiveDir,
} from './evict.js';
import { enumerateRetros } from './retro-index.js';
import { checkStateFrontmatterShape } from './retrospective.js';
import { toPosix, detectUnhandledLinkForms, senseArchiveTree, applyArchiveTree } from './archive-tree.js';

// verifyFaithful IS verifyCardCoverage under the migrate command's name — a
// re-export, NOT a rename (evict.js keeps verifyCardCoverage; check-state-write
// and evictEpicNarrative still call it there). It is the discrete-token
// (ID/date/status) COVERAGE backstop — NOT the vector-1 prose gate. The vector-1
// gate is WORD conservation (advisor pin, confirmed empirically): verifyFaithful
// returns pass:true on a TOTAL deletion of pure prose that carries no IDs, so it
// cannot be what guards the B8 catastrophe.
export const verifyFaithful = verifyCardCoverage;

/**
 * Parse the command flags. Dry-run is the default (FR6.1) — writing requires an
 * explicit `--apply`; `--force` lets apply proceed on a dirty working tree
 * (consumed by the S1.t7 safety harness). Fail-open: non-array / unknown input
 * degrades to a dry-run (the safe default), never throws.
 *
 * @param {string[]} argv
 * @returns {{apply: boolean, force: boolean}}
 */
export function parseMigrateArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  return {
    apply: args.includes('--apply'),
    force: args.includes('--force'),
  };
}

// --- docs_layout_version stamp (FR7.1) — raw-line splice, never a serializer ---
//
// The stamp is its OWN axis (distinct from schema_version and the plugin's
// release SemVer). It is written by a RAW-LINE splice, never a stringifyYaml
// round-trip (cross-cutting §1): a full re-serialize reformats/reorders the whole
// block (drops comments, normalizes spacing, re-quotes) — a churny, potentially
// lossy rewrite of a stranger's STATE.md for a one-line change.
//
// LOCK BOUNDARY (advisor / §9): `spliceDocsLayoutVersion` is a PURE, lock-free,
// no-I/O core; the self-locking `setDocsLayoutVersion` wrapper is for STANDALONE
// use only. The migrate harness (S1.t7/t8) holds the coarse `.state.lock` ONCE
// and calls the pure core directly — a nested `withStateLock` under the coarse
// lock would throw ("another state write is running", <5s) or stale-unlink the
// coarse lock after its 5s TTL (the exact §9 hazard `evictEpicNarrative` has).

// Capture the frontmatter fences so the block can be reconstructed byte-for-byte.
const FRONTMATTER_SPLICE_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/;
const DOCS_LAYOUT_KEY = 'docs_layout_version';

/**
 * Return `text` with `docs_layout_version: n` set in the STATE.md frontmatter —
 * REPLACING the value in place if the key is present, else INSERTING a line
 * right after `schema_version:` (or at the top of the block if that's absent).
 * Pure + lock-free + CRLF-tolerant. Every OTHER frontmatter line and the whole
 * body stay byte-identical. Returns `text` unchanged when there is no
 * frontmatter (no fabrication — the harness gates conformance separately).
 *
 * @param {string} text  full STATE.md content (frontmatter + body)
 * @param {number} n      the layout version (integer axis, FR7.1)
 * @returns {string}
 */
export function spliceDocsLayoutVersion(text, n) {
  if (!Number.isInteger(n)) {
    throw new Error(
      `spliceDocsLayoutVersion: n must be an integer, got ${JSON.stringify(n)}.`
    );
  }
  const m = String(text).match(FRONTMATTER_SPLICE_RE);
  if (!m) return text; // no frontmatter — nothing to stamp
  const [, open, block, close, body] = m;
  const nl = open.includes('\r\n') ? '\r\n' : '\n';
  const lines = block.split(/\r?\n/);
  const newLine = `${DOCS_LAYOUT_KEY}: ${n}`;

  const existingIdx = lines.findIndex((l) => new RegExp(`^${DOCS_LAYOUT_KEY}:`).test(l));
  if (existingIdx !== -1) {
    lines[existingIdx] = newLine; // replace in place — position preserved
  } else {
    // Insert right after schema_version: (group the two version axes); fall back
    // to the top of the block when there's no schema_version line.
    const schemaIdx = lines.findIndex((l) => /^schema_version:/.test(l));
    const at = schemaIdx === -1 ? 0 : schemaIdx + 1;
    lines.splice(at, 0, newLine);
  }
  return `${open}${lines.join(nl)}${close}${body}`;
}

/**
 * Self-locking convenience wrapper for STANDALONE stamping: acquire the coarse
 * STATE lock, splice, compare-before-write. NEVER call this from inside the
 * migrate harness's coarse-locked apply (it would re-enter the non-reentrant
 * lock — use the pure `spliceDocsLayoutVersion` core there).
 *
 * @param {string} baseDir
 * @param {number} n
 */
export async function setDocsLayoutVersion(baseDir, n) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  return withStateLock(baseDir, async () => {
    const raw = await readFile(statePath, 'utf-8');
    const next = spliceDocsLayoutVersion(raw, n);
    if (next !== raw) {
      await atomicWrite(statePath, next); // compare-before-write → idempotent no-op
    }
  });
}

// --- the faithfulness gate (S1.t3) — relocate-never-delete, verified ----------
//
// Extracted + generalized from evict.js:343-391 (the byte-identical archive
// spine), minus the Epic/retro coupling, plus a second conservation mode and the
// B8 body-not-grown hard-fail. Two conservation modes (cross-cutting §2):
//   BYTE — archive/verbatim relocation: the new home equals the source exactly.
//   WORD — in-body relocation: every source token survives in the new home
//          (indent-/reflow-agnostic). This is the load-bearing VECTOR-1 gate.

export const BYTE = 'byte';
export const WORD = 'word';

/**
 * Pure conservation check — the B8 "body shrank but the new home didn't grow"
 * guard. The relocated content must be fully present in its new home:
 *   BYTE — `newHome` equals `source` exactly (archive/verbatim).
 *   WORD — every whitespace-delimited token of `source` appears in `newHome` at
 *          least as many times (multiset containment; indent-/reflow-agnostic).
 *          A dropped sentence removes its tokens from `newHome` → fail. Catches
 *          a WHOLESALE drop (the B8 catastrophe: hundreds of tokens vanish); it
 *          is NOT a semantic-faithfulness check (a single-word paraphrase is the
 *          human-eyeball blind spot, cross-cutting §7).
 *
 * @param {string} source
 * @param {string} newHome
 * @param {'byte'|'word'} [mode=WORD]
 * @returns {{pass: boolean, mode: string, missing: string[]}}
 */
export function conserves(source, newHome, mode = WORD) {
  const src = String(source ?? '');
  const dst = String(newHome ?? '');
  if (mode === BYTE) {
    return { pass: dst === src, mode, missing: dst === src ? [] : ['<byte-identity>'] };
  }
  if (mode !== WORD) {
    throw new Error(`conserves: unknown mode ${JSON.stringify(mode)} (expected 'byte' | 'word').`);
  }
  const tokenize = (s) => s.split(/\s+/).filter(Boolean);
  const have = new Map();
  for (const t of tokenize(dst)) have.set(t, (have.get(t) ?? 0) + 1);
  const need = new Map();
  for (const t of tokenize(src)) need.set(t, (need.get(t) ?? 0) + 1);
  const missing = [];
  for (const [tok, count] of need) {
    if ((have.get(tok) ?? 0) < count) missing.push(tok);
  }
  return { pass: missing.length === 0, mode, missing };
}

/**
 * Relocate `sourceText` to a new home, verifying NO loss two independent ways:
 *   1. CONSERVATION — the new home actually GREW to hold the content (BYTE
 *      identity for archive/verbatim, WORD containment for in-body). This is the
 *      B8 body-not-grown guard and the load-bearing vector-1 gate.
 *   2. COVERAGE backstop — verifyFaithful (= verifyCardCoverage) proves no
 *      discrete ID / ISO date / status token was dropped from `card`.
 * Both must pass or the relocation FAILS (`pass:false`) and the caller refuses
 * the apply / rolls back. This primitive NEVER shortens the source — the caller
 * does that, gated on `pass`, so a failed gate can never leave content deleted.
 *
 * BYTE mode writes `sourceText` to `destAbs` and reads it back — that readback IS
 * the "new home grew by exactly the source" proof; the separate `card` (e.g. a
 * RETROSPECTIVE for vector-3) is what coverage is checked against. WORD mode does
 * NOT write (source & dest share a file for in-body relocation — the caller
 * writes the combined file, gated on `pass`); `card` is the new-home body region
 * the content moved into, and both conservation + coverage run against it.
 *
 * @param {object} args
 * @param {string} args.sourceText  the content being relocated
 * @param {string} [args.card]      new-home representation for coverage (and, in
 *                                  WORD mode, for conservation). Defaults to
 *                                  `sourceText` (a byte-identical move covers
 *                                  itself).
 * @param {string} args.destAbs     absolute path of the new home file
 * @param {string} args.baseDir     project root (path confinement)
 * @param {'byte'|'word'} [args.mode=BYTE]
 * @param {string[]} [args.dropped] explicitly-acknowledged dropped items
 * @param {string} [args.pointer]   one-line pointer left behind (echoed back)
 * @returns {Promise<{pass, mode, conservation, coverage, destAbs, pointer}>}
 */
export async function relocateFaithful(args) {
  const { sourceText, destAbs, baseDir, mode = BYTE, dropped = [], pointer = null } = args;
  const card = args.card ?? sourceText;

  // Defense-in-depth path confinement (mirrors evict.js / resume.js / add.js):
  // the new home must stay inside the project's .planning/ — the trailing sep
  // defeats the sibling-prefix bug (.planning-evil/).
  const planningRoot = resolve(baseDir, PLANNING_DIR);
  if (!resolve(destAbs).startsWith(planningRoot + sep)) {
    throw new Error(
      `relocateFaithful: dest ${destAbs} escapes ${PLANNING_DIR}/ (baseDir ${baseDir}).`
    );
  }

  let conservation;
  if (mode === BYTE) {
    await mkdir(dirname(destAbs), { recursive: true });
    await atomicWrite(destAbs, sourceText);
    const landed = await readFile(destAbs, 'utf-8'); // "grew by exactly source" proof
    conservation = conserves(sourceText, landed, BYTE);
  } else if (mode === WORD) {
    conservation = conserves(sourceText, card, WORD);
  } else {
    throw new Error(`relocateFaithful: unknown mode ${JSON.stringify(mode)} (expected 'byte' | 'word').`);
  }

  const coverage = verifyFaithful(sourceText, card, { dropped });
  const pass = conservation.pass && coverage.pass;
  return { pass, mode, conservation, coverage, destAbs, pointer };
}

// --- vector-1 de-prose (S1.t4) — relocate frontmatter-list prose to the body --
//
// The acute nextpass/cmmc case: completed_phases entries and blockers[].text
// fields became huge prose blocks, wedging the check-state-write write-guard. The
// LOCATOR (net-new — checkStateFrontmatterShape only returns a boolean) finds the
// offending entries + their line ranges; the TRANSFORM relocates each entry's
// prose verbatim into the STATE body (leaving a short scalar), never deleting it.
//
// Budgets mirror checkStateFrontmatterShape (retrospective.js) so the locator
// flags EXACTLY what the write-guard blocks — kept honest by the post-transform
// `block:false` re-check in the tests.
const COMPLETED_PHASES_MAX = 150;
const BLOCKER_TEXT_MAX = 500;

const isTopKeyLine = (line) => /^[A-Za-z_][A-Za-z0-9_]*:/.test(line);

// Parse STATE.md into frontmatter fences + block lines + body (CRLF-aware).
function splitFrontmatter(text) {
  const m = String(text).match(FRONTMATTER_SPLICE_RE);
  if (!m) return null;
  const [, open, block, close, body] = m;
  return { open, block, close, body, nl: open.includes('\r\n') ? '\r\n' : '\n', lines: block.split(/\r?\n/) };
}

// [start,end) line range of a top-level list key's items (null if absent/inline).
function listSectionRange(lines, key) {
  const keyIdx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (keyIdx === -1) return null;
  if (/^[A-Za-z_][A-Za-z0-9_]*:\s*\S/.test(lines[keyIdx])) return null; // inline `key: []`
  let end = lines.length;
  for (let i = keyIdx + 1; i < lines.length; i++) {
    if (isTopKeyLine(lines[i])) { end = i; break; }
  }
  return { start: keyIdx + 1, end };
}

// Group a [start,end) range into `- `-led items, tracking each item's line span.
function itemRanges(lines, start, end) {
  const items = [];
  let cur = null;
  for (let i = start; i < end; i++) {
    if (/^\s*-\s/.test(lines[i])) {
      if (cur) items.push(cur);
      cur = { start: i, end: i + 1 };
    } else if (cur && lines[i].trim() !== '') {
      cur.end = i + 1;
    }
  }
  if (cur) items.push(cur);
  return items;
}

// Within a blocker object's line span, locate its text: field span + value.
function blockerTextSpan(lines, objStart, objEnd) {
  for (let i = objStart; i < objEnd; i++) {
    const tm = lines[i].match(/^(\s*)text:\s*(.*)$/);
    if (!tm) continue;
    const indent = tm[1].length;
    const rest = tm[2];
    if (/^[|>][+-]?\s*$/.test(rest)) {
      // Block scalar: continuation is more-indented than the text: key, up to the
      // next object-level key (raisedAt) or the object's end.
      let j = i + 1;
      const content = [];
      for (; j < objEnd; j++) {
        if (lines[j].trim() === '') { content.push(''); continue; }
        if ((lines[j].match(/^(\s*)/)[1].length) <= indent) break;
        content.push(lines[j].trim());
      }
      return { start: i, end: j, isBlockScalar: true, value: content.join('\n').trim() };
    }
    return { start: i, end: i + 1, isBlockScalar: false, value: rest.trim() };
  }
  return null;
}

/**
 * The LOCATOR (net-new — checkStateFrontmatterShape returns only a boolean).
 * Returns the exact frontmatter-list entries that pollute the write-guard, each
 * with its line range (within the frontmatter block), the verbatim `original`
 * prose to relocate, and the `short` scalar to leave in its place. Empty entries
 * list = already clean.
 *
 * @param {string} text  full STATE.md content
 * @returns {{entries: Array<{field, index?, id?, startLine, endLine, original, originalForBody, short, reason}>}}
 */
export function locateFrontmatterProse(text) {
  const fm = splitFrontmatter(text);
  if (!fm) return { entries: [] };
  const { lines } = fm;
  const entries = [];

  // completed_phases — scalar strings; multi-line OR >150 chars is prose.
  const cpRange = listSectionRange(lines, 'completed_phases');
  if (cpRange) {
    const items = itemRanges(lines, cpRange.start, cpRange.end);
    items.forEach((item, index) => {
      const itemLines = lines.slice(item.start, item.end);
      const multiline = itemLines.length > 1;
      const singleVal = itemLines[0]
        .replace(/^\s*-\s*/, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      if (!multiline && singleVal.length <= COMPLETED_PHASES_MAX) return; // clean
      const indent = (itemLines[0].match(/^(\s*)-/) ?? ['', ''])[1];
      const firstRaw = itemLines[0].replace(/^\s*-\s*/, '').replace(/^["']/, '');
      const phaseDate = firstRaw.match(/^([A-Z]+\s*\(\d{4}-\d{2}-\d{2}\))/);
      const short = `${indent}- ${phaseDate ? phaseDate[1] : '"[relocated to STATE body — migrate-memory]"'}`;
      entries.push({
        field: 'completed_phases',
        index,
        startLine: item.start,
        endLine: item.end,
        original: itemLines.join('\n'),
        originalForBody: itemLines.join('\n'),
        short,
        reason: multiline ? 'multi-line' : 'over-length',
      });
    });
  }

  // blockers — object mappings; only the text: value can be prose (block scalar
  // OR >500 chars). NEVER flag a blocker for being a multi-line object.
  const blRange = listSectionRange(lines, 'blockers');
  if (blRange) {
    const objs = itemRanges(lines, blRange.start, blRange.end);
    for (const obj of objs) {
      const span = blockerTextSpan(lines, obj.start, obj.end);
      if (!span) continue;
      if (!span.isBlockScalar && span.value.length <= BLOCKER_TEXT_MAX) continue; // clean
      const idLine = lines.slice(obj.start, obj.end).find((l) => /^\s*(-\s*)?id:/.test(l)) ?? '';
      const id = (idLine.match(/id:\s*(\S+)/) ?? ['', `blocker@${obj.start}`])[1];
      const indent = (lines[span.start].match(/^(\s*)/) ?? ['', ''])[1];
      entries.push({
        field: 'blockers',
        id,
        startLine: span.start,
        endLine: span.end,
        original: span.value,
        originalForBody: span.value,
        short: `${indent}text: "[relocated to STATE body — migrate-memory, blocker ${id}]"`,
        reason: span.isBlockScalar ? 'block-scalar' : 'over-budget',
      });
    }
  }

  return { entries };
}

// Build the body section that receives the relocated prose (verbatim + attributed).
function buildRelocationSection(entries, nl) {
  const parts = [
    '## Relocated frontmatter narrative (migrate-memory)',
    '',
    'Prose lifted out of STATE.md frontmatter lists to satisfy the doc-runtime model (FR1). Verbatim — nothing dropped.',
    '',
  ];
  for (const e of entries) {
    const label = e.field === 'blockers'
      ? `blockers — ${e.id}`
      : `completed_phases — entry ${e.index}`;
    parts.push(`### ${label}`, '', e.originalForBody, '');
  }
  return parts.join(nl);
}

/**
 * PURE vector-1 de-prose transform. Relocates every offending frontmatter-list
 * entry's prose verbatim into the STATE body under a labeled section, leaving a
 * short scalar behind. Returns the new text + the relocation records + the
 * concatenated `removedProse` (the conservation gate's source). No I/O, no lock.
 * A no-op (changed:false, text unchanged) when the frontmatter is already clean.
 *
 * @param {string} text  full STATE.md content
 * @returns {{changed: boolean, newText: string, relocations: object[], removedProse: string}}
 */
export function deproseFrontmatter(text) {
  const fm = splitFrontmatter(text);
  if (!fm) return { changed: false, newText: text, relocations: [], removedProse: '' };
  const { entries } = locateFrontmatterProse(text);
  if (entries.length === 0) {
    return { changed: false, newText: text, relocations: [], removedProse: '' };
  }
  const { open, close, body, nl, lines } = fm;

  // Rebuild the frontmatter block: replace each offending line range with its
  // single short-scalar line. Splice from LAST to FIRST so earlier ranges stay
  // valid.
  const newLines = lines.slice();
  const sorted = [...entries].sort((a, b) => b.startLine - a.startLine);
  for (const e of sorted) {
    newLines.splice(e.startLine, e.endLine - e.startLine, e.short);
  }
  const newBlock = newLines.join(nl);

  // Append the relocation section to the body (verbatim prose → new home).
  const relSection = buildRelocationSection(entries, nl);
  const trimmedBody = body.replace(/\s+$/, '');
  const newBody = `${trimmedBody}${nl}${nl}${relSection}${nl}`;

  const removedProse = entries.map((e) => e.originalForBody).join('\n');
  return {
    changed: true,
    newText: `${open}${newBlock}${close}${newBody}`,
    relocations: entries,
    removedProse,
  };
}

/**
 * Standalone on-disk vector-1 de-prose (self-locking wrapper; the harness uses
 * the pure `deproseFrontmatter` core under its coarse lock). Runs the WORD
 * conservation gate BEFORE any write — a lossy transform throws rather than
 * writing (the B8 guard at the apply seam). Dry-run (apply:false) reports the
 * relocations + conservation verdict, writing nothing.
 *
 * @param {string} baseDir
 * @param {{apply?: boolean}} [opts]
 * @returns {Promise<{applied: boolean, changed: boolean, relocations: object[], conservation: object}>}
 */
export async function applyDeproseVector1(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  const raw = await readFile(statePath, 'utf-8');
  const { changed, newText, relocations, removedProse } = deproseFrontmatter(raw);

  const m = newText.match(FRONTMATTER_SPLICE_RE);
  const body = m ? m[4] : newText;
  const conservation = conserves(removedProse, body, WORD);

  if (!apply || !changed) {
    return { applied: false, changed, relocations, conservation };
  }
  if (!conservation.pass) {
    throw new Error(
      `applyDeproseVector1: WORD conservation FAILED (missing: ${conservation.missing
        .slice(0, 5)
        .join(', ')}…) — refusing to write a lossy de-prose.`
    );
  }
  await withStateLock(baseDir, async () => {
    await atomicWrite(statePath, newText);
  });
  return { applied: true, changed, relocations, conservation };
}

// --- vector-2 inlined-body relocate (S1.t5) — big body → STATE-HISTORY.md -----
//
// The E1-by-hand case (STATE.md 64.5 KB → 1 KB): a schema_v1 STATE.md whose body
// is a big inlined narrative. Relocate the body BYTE-IDENTICAL to STATE-HISTORY.md
// and leave a one-line pointer, preserving the frontmatter VERBATIM (no
// serializer round-trip — cross-cutting §1). History-first ordering (model:
// upgradeStateFile:189-216) makes a crash between the two writes re-run cleanly.

const VECTOR2_MARKER = 'migrate-memory:vector-2';
const VECTOR2_MARKER_RE = /migrate-memory:vector-2/;

function buildVector2Pointer(historyName, dateStr, nl) {
  return [
    '# Project State',
    '',
    `<!-- ${VECTOR2_MARKER} relocated the prior inlined body to ${historyName} on ${dateStr}. The YAML frontmatter above is the authoritative machine-readable state. -->`,
    '',
    `The prior inlined body was relocated to [${historyName}](${historyName}) by migrate-memory (vector-2) on ${dateStr}.`,
    '',
  ].join(nl);
}

/**
 * Pure vector-2 planner. Given the STATE.md text + whether/what STATE-HISTORY.md
 * already holds, decides the history target (clobber-guard → dated sibling;
 * crash-reuse → reuse an identical existing one) and the new STATE.md text.
 * `skip:true` when there's no frontmatter or the body is already a pointer.
 */
function planVector2(raw, { dateStr, historyExists, historyContent }) {
  const fm = splitFrontmatter(raw);
  if (!fm) return { skip: true, reason: 'no-frontmatter' };
  if (VECTOR2_MARKER_RE.test(fm.body)) return { skip: true, reason: 'already-relocated' };

  let historyName = 'STATE-HISTORY.md';
  let reuseExisting = false;
  if (historyExists) {
    if (historyContent === fm.body) {
      reuseExisting = true; // crash re-run — the identical body is already there
    } else {
      historyName = `STATE-HISTORY-${dateStr}.md`; // clobber-guard — don't overwrite
    }
  }
  const pointerBody = buildVector2Pointer(historyName, dateStr, fm.nl);
  return {
    skip: false,
    historyName,
    reuseExisting,
    body: fm.body,
    bytes: fm.body.length,
    newText: `${fm.open}${fm.block}${fm.close}${pointerBody}`,
  };
}

/**
 * Standalone on-disk vector-2 relocate (self-locking wrapper; the harness uses
 * the pure `planVector2` core under its coarse lock). Dry-run reports the target;
 * apply relocates the body byte-identical to STATE-HISTORY.md (history-first),
 * then rewrites STATE.md to the pointer, all under the state lock. Asserts the
 * archived copy is byte-identical before returning (move-never-delete accounting).
 *
 * @param {string} baseDir
 * @param {{apply?: boolean, dateStr?: string}} [opts]
 * @returns {Promise<{relocated: boolean, applied: boolean, historyName?: string, bytes?: number, reason?: string}>}
 */
export async function relocateInlinedBody(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const dateStr = opts.dateStr ?? new Date().toISOString().split('T')[0];
  const planningDir = join(baseDir, PLANNING_DIR);
  const statePath = join(planningDir, 'STATE.md');
  const primaryHistory = join(planningDir, 'STATE-HISTORY.md');

  const planNow = async () => {
    const raw = await readFile(statePath, 'utf-8');
    const historyExists = existsSync(primaryHistory);
    const historyContent = historyExists ? await readFile(primaryHistory, 'utf-8') : null;
    return planVector2(raw, { dateStr, historyExists, historyContent });
  };

  const plan = await planNow();
  if (!apply || plan.skip) {
    return { relocated: false, applied: false, ...plan };
  }

  return withStateLock(baseDir, async () => {
    const p = await planNow(); // re-read under the lock (TOCTOU for standalone use)
    if (p.skip) return { relocated: false, applied: false, ...p };
    const historyPath = join(planningDir, p.historyName);
    // History FIRST (byte-identical), then the STATE.md pointer. A crash between
    // leaves STATE.md still big + un-marked → the next run reuses the identical
    // history rather than duplicating it.
    if (!p.reuseExisting) await atomicWrite(historyPath, p.body);
    const landed = await readFile(historyPath, 'utf-8');
    if (landed !== p.body) {
      throw new Error('relocateInlinedBody: STATE-HISTORY copy is not byte-identical to the relocated body.');
    }
    await atomicWrite(statePath, p.newText);
    return { relocated: true, applied: true, historyName: p.historyName, bytes: p.bytes };
  });
}

// --- vector-3 classify/route (S2.t1) — never a silent no-section skip ----------
//
// The #2c gap: evictEpicNarrative (evict.js:327) NO-OPS on a closed-Epic body
// with no Epic-ID section heading — it returns reason 'no-section' and the bloat
// is silently LEFT IN PLACE. That silent skip is the exact failure this Epic
// exists to prevent. This classifier closes the gap by routing every closed-Epic
// body to a real handler:
//   - SECTIONED (extractEpicSection finds an Epic-ID heading) → vector-3 evict
//     (the S2.t2 loop relocates that section via the lock-free relocateFaithful
//     spine — NOT the self-locking evictEpicNarrative, per cross-cutting §9).
//   - UN-SECTIONED (no such heading) → RECLASSIFY to vector-2: relocate the WHOLE
//     body byte-identical via relocateInlinedBody (D-M5E2 §5: whole-body relocate
//     carries zero semantic risk, so no new sectioning bridge is built).
// It NEVER returns a "skip / leave as-is" verdict — that is the whole gate.
//
// PREDICATE IDENTITY (correctness property): the sectioned check is literally the
// same extractEpicSection(body, epicId).found call evictEpicNarrative makes, so
// "classified sectioned" ⟺ "evict would actually find a section" with zero
// daylight — re-deriving sectioning with any other heuristic could reopen the gap.
//
// SCOPE: pure classification/routing only — no I/O, no lock, no wiring into
// senseState/senseProject/applyMigrate (that routing loop is S2.t2).
//
// @param {string} body    the closed-Epic STATE.md body (below the frontmatter)
// @param {string} epicId  e.g. "M5.E1" (the caller has already confirmed closed)
// @returns {{sectioned: boolean, route: 'vector-3-evict'|'vector-2-reclassify', reason: string}}
export function classifyClosedEpicBody(body, epicId) {
  const sec = extractEpicSection(body, epicId);
  if (sec.found) {
    return {
      sectioned: true,
      route: 'vector-3-evict',
      reason: `epic-id section found (heading: "${sec.heading}") — evict narrative (vector-3)`,
    };
  }
  return {
    sectioned: false,
    route: 'vector-2-reclassify',
    reason: `no ${epicId} section heading — reclassify whole body to vector-2 (byte-identical relocate)`,
  };
}

// --- vector-3 retroactive evict LOOP (S2.t2) — closed-Epic narrative → archive -
//
// Applies evict-on-close RETROACTIVELY to a project's backlog of already-closed
// Epics. A retrospective's existence is the closed-signal (enumerateRetros globs
// `.planning/*-RETROSPECTIVE.md`). Candidate discovery is the UNION of
//   (a) retro-derived closed-Epic IDs, and
//   (b) Epic-ID section headings found live in the STATE body,
// because the no-fabricate gate can only FLAG a closed-LOOKING body section whose
// Epic has no retrospective if sensing actually scanned the body for it.
//
// Routing precedence (order is load-bearing — see the two guards):
//   1. body already carries this Epic's eviction pointer → idempotent SKIP (FR6.4).
//      Detected by the pointer MARKER, not extractEpicSection (post-evict the
//      heading is gone, so a re-run would else mis-route the already-archived Epic).
//   2. live section + retrospective → EVICT the section slice (vector-3).
//   3. live section + NO retrospective → SKIP + no-fabricate FLAG. Never fabricate
//      a card to force an evict — the load-bearing safety gate of this Epic.
//   4. no section + retrospective (classifier → vector-2-reclassify) → V3 does NOT
//      whole-body relocate. Whole body un-sectioned → defer to the vector-2 step;
//      MIXED body (another Epic owns a live section) → SKIP (the guard: a literal
//      whole-body relocate here would drag that live section into history).
//   5. no section + no retrospective → no-op.
//
// STRUCTURAL mixed-body guard (S2.t1 handoff): V3's ONLY write is an
// extractEpicSection-SLICE evict via the lock-free relocateFaithful spine — it
// NEVER performs a whole-body relocate. The whole-body vector-2 relocate stays in
// the size-based, whole-STATE V2 step. So the mixed-body catastrophe is impossible
// by construction, not by a runtime check.

// The evict pointer MARKER (byte-for-byte the prefix planEpicEvict / evict.js
// writes) — the idempotency probe. A re-run must see this and skip.
function hasEvictionPointer(body, epicId) {
  const esc = String(epicId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^- ${esc} — evicted to `, 'm').test(String(body));
}

// Epic-level IDs that own a heading LINE in the body (the live-section candidates).
// Scans heading lines only (mirrors extractEpicSection's heading-keyed scoping);
// captures the Epic-level prefix (M{N}[.{N}]*.E{N}) even from a deeper heading.
function discoverEpicSectionIds(body) {
  const ids = new Set();
  for (const line of String(body).split('\n')) {
    if (!/^#{1,6}[ \t]/.test(line)) continue;
    const m = line.match(/\bM\d+(?:\.\d+)*\.E\d+\b/);
    if (m && EPIC_ID_STRICT_RE.test(m[0])) ids.add(m[0]);
  }
  return [...ids];
}

// Numeric-segment Epic-ID sort (M5.E2 < M5.E10) — deterministic plan/moves order.
function compareEpicIds(a, b) {
  const na = a.match(/\d+/g)?.map(Number) ?? [];
  const nb = b.match(/\d+/g)?.map(Number) ?? [];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * PURE per-Epic evict planner. Given the STATE body, a closed Epic ID, and its
 * card (the RETROSPECTIVE content), returns the planned mutation WITHOUT any I/O
 * or lock: the extracted section (the archive source), the coverage verdict, the
 * archive-relative path, the one-line pointer (evict.js format — the idempotency
 * marker), and the rewritten body (pointer routed under "## Closed work" when
 * present, else in-situ; open carry-overs lifted UP into a live section). Mirrors
 * evictEpicNarrative's body mechanics but lock-free + frontmatter-agnostic (the
 * caller splices it back under the frontmatter verbatim). The authoritative gate
 * is relocateFaithful at apply time; `coverage` here is for the dry-run diff.
 *
 * @param {string} body    STATE.md body (below the frontmatter)
 * @param {string} epicId
 * @param {string} card    the retrospective content (coverage source-of-truth)
 * @param {{dropped?: string[], carryOverHeading?: string, cardPath?: string}} [opts]
 */
export function planEpicEvict(body, epicId, card, opts = {}) {
  const { dropped = [], carryOverHeading = 'In-flight', cardPath = null } = opts;
  const sec = extractEpicSection(body, epicId);
  if (!sec.found) return { evict: false, reason: 'no-section', epicId };

  const coverage = verifyCardCoverage(sec.section, card ?? '', { dropped });
  const archiveRel = `${deriveEpicArchiveDir(epicId)}/STATE-NARRATIVE.md`;
  const cardName = cardPath
    ? String(cardPath).replace(`${PLANNING_DIR}/`, '')
    : `${epicId}-RETROSPECTIVE.md`;
  const pointer = `- ${epicId} — evicted to ${archiveRel} · card: ${cardName}`;

  // Route the pointer under "## Closed work" (the skeleton's advertised home) so
  // it isn't orphaned under the previous Epic's heading; else splice in-situ
  // (mirrors evict.js:375-384).
  const closedRe = /(?:^|\n)##\s+Closed work[ \t]*\n/;
  let newBody;
  if (closedRe.test(sec.before) || closedRe.test(sec.after)) {
    const withoutSection = (sec.before + sec.after).replace(/\n{3,}/g, '\n\n');
    const cm = withoutSection.match(closedRe);
    const at = cm.index + cm[0].length;
    newBody = `${withoutSection.slice(0, at)}${pointer}\n${withoutSection.slice(at)}`;
  } else {
    newBody = `${sec.before}${pointer}\n${sec.after}`;
  }

  const carriedOver = extractCarryOvers(sec.section);
  newBody = insertCarryOvers(newBody, carryOverHeading, epicId, carriedOver);

  return {
    evict: coverage.pass,
    reason: coverage.pass ? null : 'lossy-card',
    epicId,
    section: sec.section,
    coverage,
    archiveRel,
    pointer,
    newBody,
    carriedOver,
    card: card ?? '',
  };
}

/**
 * PURE vector-3 router. Decides, for the union of (retro-derived closed Epics) and
 * (body Epic-ID section headings), which sections to EVICT, which to FLAG (the
 * no-fabricate + mixed-body-defer flags), and which to SKIP (idempotent /
 * mixed-body-guard). No I/O, no lock. The caller (applyMigrate) executes the evict
 * set sequentially via relocateFaithful under the ONE coarse lock.
 *
 * @param {string} stateText  full STATE.md content
 * @param {Map<string,{path:string,content:string}>|Object} cards  closed Epic → card
 * @returns {{evicts: object[], flags: object[], skips: object[], whollyUnsectioned: boolean}}
 */
export function planVector3(stateText, cards) {
  const fm = splitFrontmatter(stateText);
  const body = fm ? fm.body : String(stateText ?? '');
  const closed = cards instanceof Map ? cards : new Map(Object.entries(cards ?? {}));

  const bodyIds = discoverEpicSectionIds(body);
  const whollyUnsectioned = bodyIds.length === 0;
  const candidates = [...new Set([...closed.keys(), ...bodyIds])].sort(compareEpicIds);

  const evicts = [];
  const flags = [];
  const skips = [];

  for (const epicId of candidates) {
    // 1. Already evicted (pointer present) → idempotent skip. MUST precede the
    //    no-section branch: post-evict the heading is gone, so extractEpicSection
    //    would return found:false and mis-route an already-archived Epic (FR6.4).
    if (hasEvictionPointer(body, epicId)) {
      skips.push({ epicId, reason: 'already-archived' });
      continue;
    }

    const sec = extractEpicSection(body, epicId);
    const card = closed.get(epicId);

    if (sec.found) {
      if (card) {
        // 2. Live section + retrospective → evict the slice.
        const p = planEpicEvict(body, epicId, card.content, { cardPath: card.path });
        evicts.push({
          epicId,
          card: card.content,
          cardPath: card.path,
          archiveRel: p.archiveRel,
          pointer: p.pointer,
          coverage: p.coverage,
        });
      } else {
        // 3. Live section + NO retrospective → skip + no-fabricate FLAG.
        flags.push({
          kind: 'no-retrospective',
          epicId,
          reason: `closed-looking live section for ${epicId} but no ${epicId}-RETROSPECTIVE.md — SKIPPED (never fabricate a card to force an evict)`,
        });
      }
    } else if (card) {
      // 4. No section + retrospective. classifier → vector-2-reclassify. V3 never
      //    whole-body relocates: defer the un-sectioned whole body to the vector-2
      //    step; a MIXED body is a guard-skip (a whole-body relocate here would
      //    drag a live section into history).
      classifyClosedEpicBody(body, epicId); // honor the S2.t1 routing handoff
      if (whollyUnsectioned) {
        flags.push({
          kind: 'vector-2-defer',
          epicId,
          reason: `${epicId} is closed + its narrative is un-sectioned in a whole-body body — handled by the vector-2 whole-body relocate, not V3`,
        });
      } else {
        skips.push({
          epicId,
          reason: 'mixed-body-guard',
          note: `${epicId} closed but un-sectioned in a MIXED body (another Epic owns a live section) — NOT whole-body relocating (would drag that live section into history)`,
        });
      }
    }
    // 5. No section + no retrospective → no-op (nothing to do).
  }

  return { evicts, flags, skips, whollyUnsectioned };
}

/**
 * Disk-aware vector-3 sense: glob the closed Epics (enumerateRetros), read each
 * card, and delegate to the pure planVector3. Adds the INDEX.md refresh flag (§10)
 * when evicts would move narrative AND a hand-curated `.planning/INDEX.md` exists —
 * migrate NEVER auto-writes INDEX.md, only flags it. Read-only.
 *
 * @param {string} baseDir
 * @param {string} stateText  full STATE.md content
 */
export async function senseVector3(baseDir, stateText) {
  const retros = await enumerateRetros(baseDir);
  const cards = new Map();
  for (const r of retros) {
    let content = '';
    try {
      content = await readFile(join(baseDir, r.path), 'utf-8');
    } catch {
      content = '';
    }
    cards.set(r.epicId, { path: r.path, content });
  }
  const plan = planVector3(stateText, cards);
  if (plan.evicts.length > 0 && existsSync(join(baseDir, PLANNING_DIR, 'INDEX.md'))) {
    plan.flags = [
      ...plan.flags,
      {
        kind: 'index-refresh',
        reason: 'INDEX.md is hand-curated and may reference now-archived narrative — review it manually (this migrate will NOT auto-write INDEX.md)',
      },
    ];
  }
  return plan;
}

// --- git-state probe (S1.t7a) — refuse / proceed / downgrade matrix -----------
//
// Decides whether apply can rely on git for reversibility (`git` mode) or must
// fall back to a filesystem snapshot (`fs-backup` mode), or must REFUSE. Every
// git call is fail-safe: a git failure degrades toward fs-backup, never crashes.

/**
 * @param {string} baseDir
 * @param {{execFn?: typeof execFileSync, force?: boolean}} [opts]
 * @returns {{mode: 'git'|'fs-backup', proceed: boolean, dirty: boolean, warnings: string[], reason?: string}}
 */
export function probeGitState(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const force = opts.force ?? false;
  const git = (args) =>
    String(execFn('git', args, { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  const warnings = [];

  // 1. A git work tree at all? (non-repo → fs-backup)
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return {
      mode: 'fs-backup',
      proceed: true,
      dirty: false,
      warnings: ['Not a git repository — using a filesystem snapshot for reversibility.'],
    };
  }

  // 2. Unborn HEAD (no commits) → no commit to tag/reset to → fs-backup.
  try {
    git(['rev-parse', '--verify', 'HEAD']);
  } catch {
    return {
      mode: 'fs-backup',
      proceed: true,
      dirty: false,
      warnings: ['Repository has no commits yet (unborn HEAD) — using a filesystem snapshot for reversibility.'],
    };
  }

  // 3. .planning/ gitignored → git can't track the changes → fs-backup.
  //    `check-ignore -q` exits 0 when ignored (returns), 1 when not (throws).
  try {
    git(['check-ignore', '-q', '.planning/STATE.md']);
    return {
      mode: 'fs-backup',
      proceed: true,
      dirty: false,
      warnings: ['.planning/ is gitignored — git can\'t track the migrate\'s changes; using a filesystem snapshot for reversibility.'],
    };
  } catch {
    /* not ignored — good, continue */
  }

  // 4. Submodule? (proceed as git, but flag it — the superproject tracks the ref)
  try {
    if (git(['rev-parse', '--show-superproject-working-tree'])) {
      warnings.push('This repo is a git submodule — the migrate stages changes inside it; the superproject tracks the submodule ref separately.');
    }
  } catch {
    /* ignore */
  }

  // 5. Detached HEAD? (proceed — the pre-apply tag still anchors a rollback)
  try {
    git(['symbolic-ref', '-q', 'HEAD']);
  } catch {
    warnings.push('Detached HEAD — the pre-apply tag still anchors a rollback point.');
  }

  // 6. Dirty tree? Refuse without --force; with --force, rollback stays surgical.
  let dirty = false;
  try {
    dirty = git(['status', '--porcelain']).length > 0;
  } catch {
    /* ignore — treat as clean */
  }
  if (dirty && !force) {
    return {
      mode: 'git',
      proceed: false,
      dirty: true,
      warnings,
      reason: 'Working tree is dirty. Commit or stash your changes, or re-run with --force (rollback stays surgical — only the files the migrate touches are restored).',
    };
  }
  if (dirty && force) {
    warnings.push('--force on a dirty tree: rollback restores ONLY the files the migrate touches (surgical) — never the whole tree.');
  }

  return { mode: 'git', proceed: true, dirty, warnings };
}

// --- single-STATE auto-sense (S1.t6) — stamp-first → structural sniff → plan ---
//
// Produces plan-DATA, mutating nothing. Conservative (FR6.5): only entries the
// write-guard would BLOCK go in the auto-move set (v1.entries); a block:false-
// but-LONG entry is FLAGGED for human attention, never auto-moved. V3 (retro
// evict) + the full-corpus brain are S2 — this covers V1 + V2 for the harness.

// The current doc-runtime layout version (FR7.1). t8 owns the write policy
// (stamp only on full conformance); t6 reads it for the stamp-first no-op.
export const CURRENT_LAYOUT_VERSION = 2;

// A body over this size that isn't already a pointer is a vector-2 candidate (a
// conformant skeleton body is ~1 KB; E1's inlined body was 64.5 KB).
const INLINED_BODY_THRESHOLD = 8 * 1024;
// Soft "long but legal" thresholds — below the write-guard block budgets. An
// entry between the soft and the block threshold is FLAGGED, never auto-moved.
const COMPLETED_PHASES_SOFT = 100; // block budget 150
const BLOCKER_TEXT_SOFT = 300; // block budget 500

function readDocsLayoutVersion(text) {
  const fm = splitFrontmatter(text);
  if (!fm) return null;
  const line = fm.lines.find((l) => /^docs_layout_version:/.test(l));
  const m = line && line.match(/^docs_layout_version:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function senseInlinedBody(text) {
  const fm = splitFrontmatter(text);
  if (!fm) return { candidate: false, bytes: 0 };
  const bytes = fm.body.length;
  if (VECTOR2_MARKER_RE.test(fm.body)) return { candidate: false, bytes }; // already relocated
  return { candidate: bytes > INLINED_BODY_THRESHOLD, bytes };
}

// Block:false-but-LONG entries — surfaced as ambiguity flags, NEVER auto-moved.
function locateSoftLongEntries(text) {
  const fm = splitFrontmatter(text);
  if (!fm) return [];
  const { lines } = fm;
  const flags = [];

  const cpRange = listSectionRange(lines, 'completed_phases');
  if (cpRange) {
    for (const item of itemRanges(lines, cpRange.start, cpRange.end)) {
      const itemLines = lines.slice(item.start, item.end);
      if (itemLines.length > 1) continue; // multi-line = block-worthy (auto-move)
      const val = itemLines[0].replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, '').trim();
      if (val.length > COMPLETED_PHASES_SOFT && val.length <= COMPLETED_PHASES_MAX) {
        flags.push({ kind: 'long-completed-phase', chars: val.length, detail: val.slice(0, 60) });
      }
    }
  }

  const blRange = listSectionRange(lines, 'blockers');
  if (blRange) {
    for (const obj of itemRanges(lines, blRange.start, blRange.end)) {
      const span = blockerTextSpan(lines, obj.start, obj.end);
      if (!span || span.isBlockScalar) continue; // block scalar = auto-move
      if (span.value.length > BLOCKER_TEXT_SOFT && span.value.length <= BLOCKER_TEXT_MAX) {
        flags.push({ kind: 'long-blocker-text', chars: span.value.length, detail: span.value.slice(0, 60) });
      }
    }
  }
  return flags;
}

/**
 * Stamp `text` to `version` ONLY when it is fully conformant (the Alembic
 * blind-stamp guard, S1.t8): a stamp asserts "this file matches the layout," so
 * stamping a still-polluted file would lie. Returns `text` unchanged when not
 * conformant. Pure.
 *
 * @param {string} text
 * @param {number} [version=CURRENT_LAYOUT_VERSION]
 * @returns {string}
 */
export function stampOnConformance(text, version = CURRENT_LAYOUT_VERSION) {
  return senseState(text).conformant ? spliceDocsLayoutVersion(text, version) : text;
}

/**
 * PURE single-STATE auto-sense. Reads the FR7 stamp, structurally sniffs the two
 * within-STATE bloat vectors, and returns the plan-data:
 *   - `vectors`     — which of ['vector-1','vector-2'] apply (the auto-move set).
 *   - `v1.entries`  — the block-worthy frontmatter-prose entries (locator output).
 *   - `v2`          — {candidate, bytes} for the big-inlined-body relocation.
 *   - `flags`       — block:false-but-long ambiguity flags (flag-only, per FR6.5).
 *   - `stamped`     — stamp === CURRENT_LAYOUT_VERSION.
 *   - `conformant`  — no vectors detected.
 *   - `noop`        — stamped AND conformant (nothing to do at all).
 *   - `needsStamp`  — conformant but unstamped (the stamp is the only action).
 * Mutates nothing.
 *
 * @param {string} stateText  full STATE.md content
 */
export function senseState(stateText) {
  const stamp = readDocsLayoutVersion(stateText);
  const stamped = stamp === CURRENT_LAYOUT_VERSION;
  const v1 = locateFrontmatterProse(stateText); // block-worthy auto-move set
  const v2 = senseInlinedBody(stateText);
  const flags = locateSoftLongEntries(stateText);

  const vectors = [];
  if (v1.entries.length > 0) vectors.push('vector-1');
  if (v2.candidate) vectors.push('vector-2');

  const conformant = vectors.length === 0;
  return {
    stamp,
    stamped,
    vectors,
    v1,
    v2,
    flags,
    conformant,
    noop: conformant && stamped,
    needsStamp: conformant && !stamped,
  };
}

/**
 * Sense the invoking project's `.planning/` → migration plan-data (mutates
 * nothing). Reads STATE.md, delegates the single-STATE V1 + V2 vectors to the
 * pure `senseState`, and folds in the disk-aware V3 (retroactive closed-Epic
 * evict) sense so `noop` accounts for un-evicted closed-Epic narrative. (Archive
 * tree + other-doc full-corpus sensing lands in S2.t5.)
 *
 * @param {string} baseDir
 */
export async function senseProject(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) {
    return { vectors: [], v1: { entries: [] }, v2: { candidate: false, bytes: 0 }, flags: [], v3: { evicts: [], flags: [], skips: [] }, stamp: null, stamped: false, conformant: true, noop: true, needsStamp: false, reason: 'no-state-file' };
  }
  const raw = await readFile(statePath, 'utf-8');
  const base = senseState(raw);
  const v3 = await senseVector3(baseDir, raw);
  return { ...base, v3, noop: base.noop && v3.evicts.length === 0 };
}

// --- dangling-link baseline + dry-run render (S1.t7c) -------------------------
//
// FR6.3 "before AND after": scan .planning/ for dangling inline .md links BEFORE
// apply (the baseline) so pre-existing breakage isn't attributed to the migrate;
// only NEW dangles it introduces abort+rollback. (Reference-style/HTML links are
// out of LINK_RE — S2.t4 adds the detect-and-warn floor for those.)

const DANGLING_LINK_RE = /\]\(([^)]+)\)/g;
const isExternalLink = (t) => /^(https?:|mailto:|#)/.test(t);

// Per-file scan cap (cross-cutting §4 — mirrors retrospective.js's 1 MB
// FRONTMATTER_SCAN_CEILING, which isn't exported): a pathological huge file can
// never hang the gate. Legit `.planning/` docs are a few KB; 1 MB is generous.
const FILE_SCAN_CEILING = 1024 * 1024;

// §10 (INDEX descope): the hand-curated `.planning/INDEX.md` is NEVER auto-
// rewritten, so a move can legitimately leave an INDEX link stale. An INDEX dangle
// is therefore a dry-run FLAG, never an abort (constraint 3). Repo-root-rel POSIX.
const INDEX_REL = `${PLANNING_DIR}/INDEX.md`;
const isIndexRel = (fileRepoRel) => toPosix(fileRepoRel) === INDEX_REL;

async function walkMarkdown(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '.migrate') out.push(...(await walkMarkdown(p))); // skip scratch
    } else if (e.name.endsWith('.md')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Scan the project's `.planning/` for dangling inline `.md` links (a `](target)`
 * whose `.md` target doesn't resolve). Read-only. Returns `[{file, link, target}]`.
 *
 * @param {string} baseDir
 * @returns {Promise<Array<{file: string, link: string, target: string}>>}
 */
export async function scanDanglingLinks(baseDir) {
  const files = await walkMarkdown(join(baseDir, PLANNING_DIR));
  const dangling = [];
  for (const f of files) {
    let text;
    try {
      text = await readFile(f, 'utf-8');
    } catch {
      continue;
    }
    if (text.length > FILE_SCAN_CEILING) text = text.slice(0, FILE_SCAN_CEILING);
    for (const m of text.matchAll(DANGLING_LINK_RE)) {
      const raw = m[1].trim();
      if (isExternalLink(raw)) continue;
      const target = raw.split(/\s+/)[0].split('#')[0]; // strip title + anchor
      if (!target.endsWith('.md')) continue;
      if (!existsSync(resolve(dirname(f), target))) {
        dangling.push({ file: relative(baseDir, f), link: raw, target });
      }
    }
  }
  return dangling;
}

/**
 * The NEW dangling links in `after` that weren't in `before` (the baseline).
 * @param {Array} before @param {Array} after @returns {Array}
 */
export function computeDanglingDelta(before, after) {
  const key = (d) => `${d.file} ${d.link}`;
  const seen = new Set(before.map(key));
  return after.filter((d) => !seen.has(key(d)));
}

// --- blocking dangling-link gate (S2.t4, FM7) ---------------------------------
//
// Turns the prototype's ADVISORY link verification (archive-migrate.mjs:115-133 —
// scan then log AFTER the moves already committed) into a BLOCKING post-apply
// gate: any migrate-caused dangling reference -> hard abort + surgical rollback
// (never a log-after-commit). Coverage:
//   - inline `](path)` .md links -> `scanDanglingLinks` (delta vs the FR6.3
//     "before" baseline; pre-existing dangles are NOT attributed to the migrate);
//   - residual flat paths (a moved file's OLD `.planning/<file>` path still
//     literally present -- a skipped prose/link rewrite) -> `scanResidualFlatPaths`.
//     These come from THIS run's moveMap, so they are inherently migrate-caused
//     (the path was valid until this migrate moved the file) -- no baseline
//     subtraction needed;
//   - anchors (`file#heading`) -> FLAGGED at-risk in the dry-run (not aborted): a
//     `#heading` whose FILE is missing is already caught by the inline .md check;
//     file-present-heading-moved is flagged for manual review (full slug
//     resolution is skipped to avoid false-aborts -- the "clean run -> no false
//     abort" AC);
//   - reference-style `[a]: path` + HTML `<a href>` -> detect-and-warn floor in
//     the dry-run (see `scanUnhandledLinkForms` / `detectUnhandledLinkForms`).
// SS10: an `INDEX.md` dangle is a FLAG, never an abort -- the hand-curated INDEX
// is never auto-rewritten, so a move legitimately leaves its links stale.

/**
 * Residual flat paths: for each moved file (a moveMap entry keyed on its OLD
 * repo-root-relative POSIX `.planning/<file>` path), scan the corpus for that old
 * path still literally present anywhere (link OR prose) -- a rewrite the migrate
 * SHOULD have performed but skipped. The moved file's own new home is exempt (it
 * may legitimately quote its former path in verbatim history). Read-only, scans
 * capped at FILE_SCAN_CEILING. applyMigrate feeds the live archive-tree moveMap
 * (S2.t5a); an empty moveMap (no archive moves) is a no-op.
 *
 * @param {string} baseDir
 * @param {Map<string,string>} moveMap  original->new (repo-root-relative POSIX)
 * @returns {Promise<Array<{file: string, target: string}>>}
 */
export async function scanResidualFlatPaths(baseDir, moveMap) {
  if (!moveMap || moveMap.size === 0) return [];
  const froms = [...moveMap.keys()].map(toPosix);
  const files = await walkMarkdown(join(baseDir, PLANNING_DIR));
  const residual = [];
  for (const f of files) {
    let text;
    try {
      text = await readFile(f, 'utf-8');
    } catch {
      continue;
    }
    if (text.length > FILE_SCAN_CEILING) text = text.slice(0, FILE_SCAN_CEILING);
    const rel = toPosix(relative(baseDir, f));
    for (const from of froms) {
      if (rel === toPosix(moveMap.get(from))) continue; // the moved file's own new home
      if (text.includes(from)) residual.push({ file: rel, target: from });
    }
  }
  return residual;
}

/**
 * At-risk anchors (dry-run flag, not abort): inline `](file#heading)` links whose
 * target file is one the migrate MOVES or REWRITES -- after the change the
 * `#heading` may no longer resolve. Cheap (no heading-slug resolution -> no
 * false-abort); the human verifies. A `#heading` whose file is entirely missing is
 * caught by the inline .md dangle check instead. Read-only, scans capped.
 *
 * @param {string} baseDir
 * @param {Set<string>} touchedRel  repo-root-relative POSIX paths the migrate touches
 * @returns {Promise<Array<{file: string, target: string, anchor: string}>>}
 */
export async function scanAtRiskAnchors(baseDir, touchedRel = new Set()) {
  if (!touchedRel || touchedRel.size === 0) return [];
  const files = await walkMarkdown(join(baseDir, PLANNING_DIR));
  const out = [];
  for (const f of files) {
    let text;
    try {
      text = await readFile(f, 'utf-8');
    } catch {
      continue;
    }
    if (text.length > FILE_SCAN_CEILING) text = text.slice(0, FILE_SCAN_CEILING);
    const linker = toPosix(relative(baseDir, f));
    for (const m of text.matchAll(DANGLING_LINK_RE)) {
      const raw = m[1].trim();
      if (isExternalLink(raw)) continue;
      const [targetPath, anchor = ''] = raw.split(/\s+/)[0].split(/(#.*)/);
      if (!anchor || !targetPath.endsWith('.md')) continue;
      const cand1 = toPosix(relative(baseDir, resolve(dirname(f), targetPath)));
      const cand2 = toPosix(targetPath);
      const target = touchedRel.has(cand1) ? cand1 : touchedRel.has(cand2) ? cand2 : null;
      if (target) out.push({ file: linker, target, anchor });
    }
  }
  return out;
}

/**
 * Detect-and-warn floor (plan-checker fix 4): reference-style `[label]: path` and
 * HTML `<a href>` links are OUTSIDE the inline `](path)` rewriter, so the migrate
 * neither rewrites nor validates them. This surfaces every occurrence across the
 * corpus so the dry-run can warn "present, not auto-rewritten -- verify manually"
 * -- NOT silently ignored, NOT claimed as rewritten. Read-only, scans capped.
 *
 * @param {string} baseDir
 * @returns {Promise<Array<{file: string, form: 'reference'|'html', target: string}>>}
 */
export async function scanUnhandledLinkForms(baseDir) {
  const files = await walkMarkdown(join(baseDir, PLANNING_DIR));
  const out = [];
  for (const f of files) {
    let text;
    try {
      text = await readFile(f, 'utf-8');
    } catch {
      continue;
    }
    if (text.length > FILE_SCAN_CEILING) text = text.slice(0, FILE_SCAN_CEILING);
    const file = toPosix(relative(baseDir, f));
    for (const form of detectUnhandledLinkForms(text)) out.push({ file, ...form });
  }
  return out;
}

/**
 * Partition post-apply dangling references into ABORTING (migrate-caused -> hard
 * fail) and FLAGS (INDEX.md SS10 dangles -- surfaced, never abort). Inline dangles
 * are the baseline-subtracted delta (FR6.3 "before"); residual flat paths are
 * already this-run-caused (moveMap-keyed) so they enter as-is.
 *
 * @param {{baseline: Array, after: Array, residual: Array}} args
 * @returns {{aborting: Array, flags: Array}}
 */
export function partitionDangling({ baseline = [], after = [], residual = [] }) {
  const aborting = [];
  const flags = [];
  for (const d of computeDanglingDelta(baseline, after)) {
    (isIndexRel(d.file) ? flags : aborting).push({ kind: 'dangling-link', ...d });
  }
  for (const r of residual) {
    (isIndexRel(r.file) ? flags : aborting).push({ kind: 'residual-flat-path', ...r });
  }
  return { aborting, flags };
}

/**
 * The BLOCKING dangling-link gate. Scans the post-apply corpus, partitions into
 * abort vs flag, and on ANY aborting entry invokes the caller's SURGICAL `rollback`
 * (the per-file pre-apply snapshot -- never `git reset --hard`) and throws. SS9:
 * the caller holds the ONE coarse lock; this gate does no locking of its own.
 * Returns the FLAG set (INDEX dangles) when it does not abort.
 *
 * @param {string} baseDir
 * @param {{baseline?: Array, moveMap?: Map, rollback?: () => Promise<void>,
 *          scanDangling?: (baseDir: string) => Promise<Array>}} [args]
 * @returns {Promise<{flags: Array}>}
 */
export async function enforceNoDangling(baseDir, args = {}) {
  const { baseline = [], moveMap = new Map(), rollback, scanDangling = scanDanglingLinks } = args;
  const after = await scanDangling(baseDir);
  const residual = await scanResidualFlatPaths(baseDir, moveMap);
  const { aborting, flags } = partitionDangling({ baseline, after, residual });
  if (aborting.length > 0) {
    if (rollback) await rollback();
    throw new Error(
      `applyMigrate: the migrate introduced ${aborting.length} dangling reference(s) (${aborting
        .map((a) => `${a.file}->${a.target}`)
        .slice(0, 3)
        .join(', ')}...) -- rolled back, no partial writes. Pre-existing dangles and INDEX.md/anchor at-risk items are not attributed (flagged in the dry-run).`
    );
  }
  return { flags };
}

/**
 * Render the dry-run in three tiers — counts / mechanical moves / faithfulness
 * diff — plus a SEPARATE list of pre-existing dangling links (so the migrate
 * isn't blamed for them). The faithfulness diff is what the human approves; a
 * passing test suite is NOT the faithfulness gate (model §5). Reads only.
 *
 * @param {string} baseDir
 * @returns {Promise<string>}
 */
export async function renderDryRun(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) return 'No .planning/STATE.md found — nothing to migrate.';
  const raw = await readFile(statePath, 'utf-8');
  const plan = senseState(raw);
  const baseline = await scanDanglingLinks(baseDir);

  // Project the moves (in memory, no write) for the mechanical + faithfulness tiers.
  const relocations = plan.v1.entries;
  let postV1 = raw;
  if (relocations.length > 0) postV1 = deproseFrontmatter(raw).newText;
  const v2 = senseState(postV1).v2;
  // Disk-aware V3 sense (retroactive closed-Epic evict) — read-only.
  const v3 = await senseVector3(baseDir, raw);
  const noop = plan.noop && v3.evicts.length === 0;

  // S2.t4 link-hygiene surfacing (read-only): at-risk anchors into files the
  // migrate rewrites (STATE.md when any vector/evict fires — its headings shift),
  // and the detect-and-warn floor for reference-style / HTML links the inline
  // rewriter does NOT touch. S2.t5a adds the archive-tree moves: a link
  // `](movedFile#heading)` resolves (in the PRE-apply layout the dry-run scans) to
  // the moved file's CURRENT (source) path — the moveMap KEY — so add the keys so
  // at-risk anchors into MOVED files are flagged too (before, only STATE.md-rewrite
  // anchors were).
  const archive = await senseArchiveTree(baseDir);
  const touched = new Set();
  if (!noop) touched.add(`${PLANNING_DIR}/STATE.md`);
  for (const from of archive.moveMap.keys()) touched.add(from);
  const atRiskAnchors = await scanAtRiskAnchors(baseDir, touched);
  const unhandledForms = await scanUnhandledLinkForms(baseDir);

  const L = [];
  L.push('== /sig:migrate-memory — DRY RUN (nothing written) ==', '');
  // Tier 1 — counts.
  L.push('— Tier 1: counts —');
  L.push(`  vectors:              ${plan.vectors.length ? plan.vectors.join(', ') : '(none — conformant)'}`);
  L.push(`  vector-1 relocations: ${relocations.length}`);
  L.push(`  vector-2 (big body):  ${v2.candidate ? `yes (${v2.bytes} B → STATE-HISTORY.md)` : 'no'}`);
  L.push(`  vector-3 (closed-Epic evicts): ${v3.evicts.length}`);
  L.push(`  ambiguity flags:      ${plan.flags.length + v3.flags.length}`);
  L.push(`  stamp:                ${plan.stamped ? `already ${CURRENT_LAYOUT_VERSION}` : `will set docs_layout_version: ${CURRENT_LAYOUT_VERSION} on conformance`}`);
  L.push('');
  // Tier 2 — mechanical moves.
  L.push('— Tier 2: mechanical moves —');
  if (noop) L.push('  (already conformant + stamped — no-op)');
  for (const e of relocations) {
    const where = e.field === 'blockers' ? `blockers[${e.id}].text` : `completed_phases[${e.index}]`;
    L.push(`  ${where} (${e.reason}) → STATE body; frontmatter left: ${e.short.trim()}`);
  }
  if (v2.candidate) L.push('  STATE body → STATE-HISTORY.md (byte-identical) + pointer');
  for (const ev of v3.evicts) {
    L.push(`  ${ev.epicId} narrative → ${ev.archiveRel} (byte-identical) + pointer; card: ${ev.cardPath}`);
  }
  for (const f of plan.flags) L.push(`  FLAG (not moved): ${f.kind} — ${f.chars} chars — "${f.detail}…"`);
  for (const f of v3.flags) L.push(`  FLAG (not moved): ${f.kind} — ${f.reason}`);
  L.push('');
  // Tier 3 — faithfulness diff (the human-approved content).
  L.push('— Tier 3: faithfulness diff (review each before approving) —');
  if (relocations.length === 0 && v3.evicts.length === 0) L.push('  (no prose to relocate)');
  for (const e of relocations) {
    const preview = e.originalForBody.replace(/\s+/g, ' ').slice(0, 200);
    L.push(`  • ${e.field === 'blockers' ? e.id : `entry ${e.index}`}: "${preview}${e.originalForBody.length > 200 ? '…' : ''}"`);
  }
  for (const ev of v3.evicts) {
    L.push(`  • ${ev.epicId} evict — card coverage ${ev.coverage.pass ? 'PASS' : `FAIL (missing ids:${ev.coverage.missing.ids.join(',')} dates:${ev.coverage.missing.dates.join(',')} tokens:${ev.coverage.missing.tokens.join(',')})`}`);
  }
  L.push('');
  // Pre-existing dangling links — surfaced SEPARATELY (FR6.3 "before").
  L.push(`— Pre-existing dangling links (${baseline.length}) — NOT caused by this migrate —`);
  for (const d of baseline) L.push(`  ${d.file} → ${d.target}`);
  if (baseline.length === 0) L.push('  (none)');
  L.push('');
  // At-risk anchors — the target section may move; the #heading is NOT auto-verified.
  L.push(`— At-risk anchors (${atRiskAnchors.length}) — target section may move; verify the #heading still resolves —`);
  for (const a of atRiskAnchors) L.push(`  ${a.file} → ${a.target}${a.anchor}`);
  if (atRiskAnchors.length === 0) L.push('  (none)');
  L.push('');
  // Detect-and-warn floor (plan-checker fix 4): reference-style + HTML links are
  // present, NOT auto-rewritten by the inline pass — surfaced for manual review.
  L.push(`— Reference-style / HTML links (${unhandledForms.length}) — present, NOT auto-rewritten; verify manually —`);
  for (const u of unhandledForms) L.push(`  ${u.file} → [${u.form}] ${u.target}`);
  if (unhandledForms.length === 0) L.push('  (none)');

  return L.join('\n');
}

// --- apply engine (S1.t7b) — compose V1→V2→stamp under ONE coarse lock --------
//
// Composes the pure vector cores in memory under a SINGLE coarse `.state.lock`
// (§9 — never the self-locking wrappers), reaches conformance in one invocation
// (advisor: V1 de-prose can push the body past the V2 threshold, so V1→V2 must
// chain or idempotency breaks + nextpass keeps a 529 KB body), stamps on
// conformance, verifies, and rolls back SURGICALLY from an in-memory snapshot on
// any failure (never `git reset --hard` — that would nuke a --force user's other
// uncommitted work). TOCTOU: aborts before any write if STATE.md drifted since
// the dry-run.

const bodyOf = (text) => {
  const m = String(text).match(FRONTMATTER_SPLICE_RE);
  return m ? m[4] : String(text);
};

// Splice a new body under the EXISTING frontmatter, verbatim (no serializer
// round-trip — cross-cutting §1). Used by the V3 evict loop to re-home a body
// after a section is relocated.
const withBody = (text, newBody) => {
  const fm = splitFrontmatter(text);
  return fm ? `${fm.open}${fm.block}${fm.close}${newBody}` : String(newBody);
};

/** SHA-256 of the STATE.md bytes — the TOCTOU binding token (dry-run → apply). */
export function hashState(text) {
  return createHash('sha256').update(String(text), 'utf-8').digest('hex');
}

/**
 * The SURGICAL per-file snapshot + rollback the migrate reuses everywhere (the S2.t4
 * gate + S1.t7 apply share ONE implementation). `snap(rel)` records a touched file's
 * pre-apply bytes (or its non-existence); `rollback()` restores ONLY those files
 * byte-identical and removes any the run newly created — NEVER a whole-tree
 * `git reset --hard` (which would nuke a `--force` user's other uncommitted work).
 * `rel` is relative to `planningDir`.
 *
 * @param {string} planningDir
 * @returns {{snapshot: Map, snap: (rel: string) => Promise<void>, rollback: () => Promise<void>}}
 */
export function createSnapshotter(planningDir) {
  const snapshot = new Map(); // rel → {abs, existed, bytes}
  const snap = async (rel) => {
    const abs = join(planningDir, rel);
    const existed = existsSync(abs);
    snapshot.set(rel, { abs, existed, bytes: existed ? await readFile(abs, 'utf-8') : null });
  };
  const rollback = async () => {
    for (const s of snapshot.values()) {
      if (s.existed) await atomicWrite(s.abs, s.bytes);
      else if (existsSync(s.abs)) await rm(s.abs);
    }
  };
  return { snapshot, snap, rollback };
}

/**
 * The apply engine. Probe → (refuse | proceed) → under ONE coarse lock: TOCTOU
 * bind, in-memory snapshot, compose V1→V2→stamp, one write, verify, surgical
 * rollback on failure, tag + stage (git) / persist snapshot (fs / --force-dirty).
 *
 * @param {string} baseDir
 * @param {{force?: boolean, expectedHash?: string, execFn?: typeof execFileSync,
 *          stamp?: string, dateStr?: string, verify?: (text: string) => {block: boolean, reason?: string}}} [opts]
 */
export async function applyMigrate(baseDir, opts = {}) {
  const force = opts.force ?? false;
  const execFn = opts.execFn ?? execFileSync;
  const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const dateStr = opts.dateStr ?? new Date().toISOString().split('T')[0];
  const verify = opts.verify ?? ((text) => checkStateFrontmatterShape({ proposedContent: text }));
  const scanDangling = opts.scanDangling ?? scanDanglingLinks;

  const probe = probeGitState(baseDir, { execFn, force });
  if (!probe.proceed) {
    return { applied: false, refused: true, reason: probe.reason, warnings: probe.warnings };
  }

  const planningDir = join(baseDir, PLANNING_DIR);
  const statePath = join(planningDir, 'STATE.md');

  return withStateLock(baseDir, async () => {
    const raw = await readFile(statePath, 'utf-8');

    // TOCTOU: bind to the dry-run's hash. Mismatch → abort BEFORE any write.
    const inputHash = hashState(raw);
    if (opts.expectedHash && opts.expectedHash !== inputHash) {
      throw new Error(
        'applyMigrate: STATE.md changed since the dry-run (TOCTOU) — aborting before any write. Re-run the dry-run.'
      );
    }

    const plan = senseState(raw);
    // V3 (retroactive closed-Epic evict) is disk-aware, so senseState's noop is
    // V3-BLIND: a clean-frontmatter, small-body, already-stamped STATE.md with
    // closed-Epic sections still to evict is exactly V3's job. Fold V3 into the
    // gate so that case isn't early-returned as a no-op.
    const v3sense = await senseVector3(baseDir, raw);

    // Archive-tree sense (read-only, under the ONE coarse lock — §9): closed-scaffold
    // FILE moves + per-file referrer link/prose rewrites. Sensed HERE (before the
    // noop gate) for two reasons: (1) a conformant-STATE project can still have
    // un-archived closed scaffolds, so the gate must NOT early-return it as a no-op;
    // (2) it is read BEFORE any write, so the extended snapshot set + the
    // enforceNoDangling moveMap both derive from it. The moveMap is invariant across
    // the V1/V3/V2 compose (STATE.md is not a scaffold doc), so sensing it now is safe.
    const archiveSense = await senseArchiveTree(baseDir);
    const archiveMoveMap = archiveSense.moveMap;

    if (plan.noop && v3sense.evicts.length === 0 && archiveMoveMap.size === 0) {
      return { applied: false, changed: false, moves: [], inputHash, mode: probe.mode, warnings: probe.warnings };
    }

    // In-memory pre-apply snapshot of the files this apply may touch (surgical
    // rollback source — restores ONLY these, never the whole tree). The S2.t4 gate
    // reuses this SAME snapshot/rollback via createSnapshotter.
    const { snapshot, snap, rollback } = createSnapshotter(planningDir);
    await snap('STATE.md');
    // snap a file ONCE — never clobber an existing snapshot entry. Critical: the
    // archive-tree snapshot extension (below) must NOT overwrite STATE.md's raw
    // pre-apply bytes with its post-write composed bytes (that would make rollback
    // restore the composed text, not the original), nor re-snap the V3/V2 archive
    // files after they were created.
    const snapOnce = async (rel) => {
      if (!snapshot.has(rel)) await snap(rel);
    };

    // Pre-apply dangling-link baseline (FR6.3 "before") — pre-existing dangles
    // are NOT attributed to the migrate; only NEW ones abort.
    const danglingBaseline = await scanDangling(baseDir);

    const moves = [];
    let text = raw;

    // --- compose V1 → V2 → stamp in memory (one STATE.md write at the end) ---
    if (plan.v1.entries.length > 0) {
      const d = deproseFrontmatter(text);
      const cons = conserves(d.removedProse, bodyOf(d.newText), WORD);
      if (!cons.pass) {
        throw new Error(`applyMigrate: V1 WORD conservation failed (missing: ${cons.missing.slice(0, 5).join(', ')}…) — no write performed.`);
      }
      text = d.newText;
      moves.push({ vector: 'vector-1', relocations: d.relocations.length });
    }

    // --- V3: evict closed-Epic narrative SECTIONS (relocateFaithful spine, §9) --
    // Sense on the post-V1 text (V1 only appends a frontmatter-narrative section —
    // no Epic heading — so the evict set is stable). Each evict is a SLICE relocate
    // via the LOCK-FREE relocateFaithful (never evictEpicNarrative, which self-locks
    // and would re-enter this coarse lock). V3 NEVER whole-body relocates — the
    // mixed-body catastrophe is structurally impossible. Per-evict gate: a lossy
    // card (or a broken byte-relocate) hard-fails → surgical rollback, no partial
    // writes. Body is re-derived per evict so sequential evicts compose correctly.
    const v3 = await senseVector3(baseDir, text);
    for (const ev of v3.evicts) {
      const p = planEpicEvict(bodyOf(text), ev.epicId, ev.card, { cardPath: ev.cardPath });
      if (!p.evict) {
        // Known-lossy card at plan time — abort before writing anything for it.
        await rollback();
        throw new Error(
          `applyMigrate: V3 evict of ${ev.epicId} would drop content the card doesn't cover (${p.reason}) — rolled back, no partial writes.`
        );
      }
      // Register the NEW archive file BEFORE the write so a later gate failure's
      // surgical rollback removes it.
      const archiveKey = p.archiveRel.replace(`${PLANNING_DIR}/`, '');
      await snap(archiveKey);
      const rel = await relocateFaithful({
        sourceText: p.section,
        card: ev.card,
        destAbs: join(baseDir, p.archiveRel),
        baseDir,
        mode: BYTE,
      });
      if (!rel.pass) {
        await rollback();
        throw new Error(
          `applyMigrate: V3 evict gate failed for ${ev.epicId} (conservation:${rel.conservation.pass} coverage:${rel.coverage.pass}) — rolled back, no partial writes.`
        );
      }
      text = withBody(text, p.newBody);
      moves.push({ vector: 'vector-3', epicId: ev.epicId, archiveRel: p.archiveRel });
    }

    let historyName = null;
    if (senseState(text).v2.candidate) {
      const primaryHistory = join(planningDir, 'STATE-HISTORY.md');
      const historyExists = existsSync(primaryHistory);
      const historyContent = historyExists ? await readFile(primaryHistory, 'utf-8') : null;
      const p2 = planVector2(text, { dateStr, historyExists, historyContent });
      historyName = p2.historyName;
      await snap(historyName);
      if (!p2.reuseExisting) {
        // Write STATE-HISTORY byte-identical to the post-V1 body (BYTE gate).
        const rel = await relocateFaithful({
          sourceText: p2.body,
          destAbs: join(planningDir, historyName),
          baseDir,
          mode: BYTE,
        });
        if (!rel.pass) {
          await rollback();
          throw new Error('applyMigrate: V2 BYTE conservation failed — rolled back.');
        }
      }
      text = p2.newText;
      moves.push({ vector: 'vector-2', historyName, bytes: p2.bytes });
    }

    // Stamp only when the composed result is fully conformant (the Alembic
    // blind-stamp guard — a partial run that didn't reach conformance leaves the
    // stamp ABSENT so a re-run continues safely).
    text = stampOnConformance(text, CURRENT_LAYOUT_VERSION);

    // One STATE.md write (compare-before-write).
    if (text !== raw) await atomicWrite(statePath, text);

    // Post-apply verify → surgical rollback on failure.
    const v = verify(text);
    if (v.block) {
      await rollback();
      throw new Error(`applyMigrate: post-apply verify failed (${v.reason ?? 'blocked'}) — rolled back.`);
    }

    // --- archive-tree: relocate closed-scaffold FILES + rewrite referrers (§9) ---
    // Runs AFTER the STATE.md write so it rewrites the FINAL composed STATE.md's
    // scaffold-links; the within-STATE vector moves (V1/V3/V2) are already on disk.
    // LOCK-FREE spine: applyArchiveTree never self-locks and never calls
    // evictEpicNarrative — it runs under THIS apply's ONE coarse lock.
    if (archiveMoveMap.size > 0) {
      // Extend the surgical snapshot to EVERY file the archive step touches BEFORE
      // any archive write, so an abort below (or in enforceNoDangling) rolls back
      // ALL of them byte-identical — else STATE.md rolls back but a rewritten
      // referrer stays mutated = partial write. Derived from senseArchiveTree's
      // moveMap + editsByFile: every move SOURCE + DEST, plus every referrer whose
      // link/prose edits are non-empty. Paths are repo-root-relative POSIX; snap()
      // keys are relative to planningDir, so strip the leading `.planning/`.
      for (const [from, to] of archiveMoveMap) {
        await snapOnce(from.replace(`${PLANNING_DIR}/`, '')); // move source (removed)
        await snapOnce(to.replace(`${PLANNING_DIR}/`, '')); // move dest (created)
      }
      for (const [f, edits] of archiveSense.editsByFile) {
        if (edits.length > 0) await snapOnce(f.replace(`${PLANNING_DIR}/`, '')); // referrer
      }
      const archiveResult = await applyArchiveTree(baseDir, { apply: true });
      moves.push({
        vector: 'archive-tree',
        moves: archiveResult.moves.length,
        rewrittenFiles: archiveResult.rewrittenFiles,
      });
    }

    // Post-apply BLOCKING dangling-link gate (S2.t4): migrate-caused dangling
    // references — inline .md dangles (delta vs the pre-apply baseline, FR6.3
    // "before") + residual flat paths (this run's archive moveMap) — HARD abort +
    // surgical rollback (never a log-after-commit). INDEX.md dangles (§10) +
    // at-risk anchors are flagged, never aborted. §9: this runs inside the ONE
    // coarse lock and reuses THIS apply's snapshot rollback (extended above to the
    // archive-touched files so a rewritten referrer is never left partially written).
    await enforceNoDangling(baseDir, {
      baseline: danglingBaseline,
      moveMap: archiveMoveMap,
      rollback,
      scanDangling,
    });

    // Persist the snapshot for durable surgical undo on the non-tag paths
    // (fs-backup OR --force on a dirty tree; git-clean relies on the tag).
    let snapshotDir = null;
    if (probe.mode === 'fs-backup' || (probe.dirty && force)) {
      snapshotDir = join(planningDir, '.migrate', 'snapshot');
      await mkdir(snapshotDir, { recursive: true });
      await writeFile(join(planningDir, '.migrate', '.gitignore'), '*\n', 'utf-8');
      for (const [rel, s] of snapshot) {
        if (s.existed) await atomicWrite(join(snapshotDir, rel.replace(/\//g, '__')), s.bytes);
      }
    }

    // Tag (git + HEAD) + stage the SPECIFIC mutated files (staged-not-committed).
    let tag = null;
    let revertLine;
    const touched = [...snapshot.keys()].map((rel) => `${PLANNING_DIR}/${rel}`);
    if (probe.mode === 'git') {
      try {
        execFn('git', ['tag', `pre-migrate-memory-${stamp}`], { cwd: baseDir, stdio: ['ignore', 'ignore', 'ignore'] });
        tag = `pre-migrate-memory-${stamp}`;
      } catch {
        tag = null;
      }
      try {
        execFn('git', ['add', ...touched], { cwd: baseDir, stdio: ['ignore', 'ignore', 'ignore'] });
      } catch {
        /* staging is best-effort — the changes are on disk regardless */
      }
      revertLine =
        probe.dirty && force
          ? `# --force on a dirty tree: restore ONLY the migrated files from ${snapshotDir} — do NOT 'git reset --hard' (it would discard your other uncommitted work).`
          : `git reset --hard ${tag ?? '<pre-apply-commit>'}   # discards the staged migrate changes`;
    } else {
      revertLine = `# reversibility via filesystem snapshot — restore the migrated files from ${snapshotDir}.`;
    }

    return {
      applied: true,
      changed: true,
      moves,
      historyName,
      stampedTo: readDocsLayoutVersion(text),
      tag,
      revertLine,
      inputHash,
      mode: probe.mode,
      warnings: probe.warnings,
    };
  });
}

/**
 * Orchestrate a migrate run. Dry-run (default) senses the project and returns the
 * plan + `inputHash` (the TOCTOU binding token) WITHOUT touching disk; `--apply`
 * hands off to `applyMigrate`, binding to the dry-run's hash. `sense` is
 * injectable so the auto-sense brain can be swapped/tested independently.
 *
 * @param {string} baseDir
 * @param {{apply?: boolean, force?: boolean, expectedHash?: string, stamp?: string,
 *          dateStr?: string, sense?: (baseDir: string) => Promise<object>}} [opts]
 */
export async function runMigrate(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const sense = opts.sense ?? senseProject;
  const plan = await sense(baseDir);

  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  const inputHash = existsSync(statePath) ? hashState(await readFile(statePath, 'utf-8')) : null;

  if (!apply) {
    return { applied: false, dryRun: true, plan, inputHash };
  }
  const result = await applyMigrate(baseDir, {
    ...opts,
    expectedHash: opts.expectedHash ?? inputHash,
  });
  return { ...result, plan };
}
