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

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, sep } from 'node:path';

import { PLANNING_DIR, withStateLock } from './state.js';
import { atomicWrite } from './atomic-write.js';
import { verifyCardCoverage } from './evict.js';
import { checkStateFrontmatterShape } from './retrospective.js';

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
 * nothing). Reads STATE.md and delegates to the pure `senseState`. Full-corpus
 * sensing (vector-3 evict + archive tree + other docs) lands in S2.t5; this
 * covers the single-STATE V1 + V2 vectors the S1 harness consumes.
 *
 * @param {string} baseDir
 */
export async function senseProject(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) {
    return { vectors: [], v1: { entries: [] }, v2: { candidate: false, bytes: 0 }, flags: [], stamp: null, stamped: false, conformant: true, noop: true, needsStamp: false, reason: 'no-state-file' };
  }
  const raw = await readFile(statePath, 'utf-8');
  return senseState(raw);
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

/** SHA-256 of the STATE.md bytes — the TOCTOU binding token (dry-run → apply). */
export function hashState(text) {
  return createHash('sha256').update(String(text), 'utf-8').digest('hex');
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
    if (plan.noop) {
      return { applied: false, changed: false, moves: [], inputHash, mode: probe.mode, warnings: probe.warnings };
    }

    // In-memory pre-apply snapshot of the files this apply may touch (surgical
    // rollback source — restores ONLY these, never the whole tree).
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
    await snap('STATE.md');

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

    // Stamp only when the composed result is conformant (t8 hardens the policy).
    if (senseState(text).conformant) {
      text = spliceDocsLayoutVersion(text, CURRENT_LAYOUT_VERSION);
    }

    // One STATE.md write (compare-before-write).
    if (text !== raw) await atomicWrite(statePath, text);

    // Post-apply verify → surgical rollback on failure.
    const v = verify(text);
    if (v.block) {
      await rollback();
      throw new Error(`applyMigrate: post-apply verify failed (${v.reason ?? 'blocked'}) — rolled back.`);
    }

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
