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

import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';

import { PLANNING_DIR, withStateLock } from './state.js';
import { atomicWrite } from './atomic-write.js';
import { verifyCardCoverage } from './evict.js';

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

/**
 * Sense a project's `.planning/` layout → a migration plan (data, mutates
 * nothing). Skeleton stub (S1.t1): returns an empty no-op plan. The real
 * stamp-first → structural-sniff → per-vector plan-data auto-sense lands in
 * S1.t6 (single-STATE) and S2.t5 (full-corpus).
 *
 * @param {string} baseDir
 * @returns {Promise<{vectors: string[], flags: string[], moves: object[]}>}
 */
export async function senseProject(baseDir) {
  return { vectors: [], flags: [], moves: [] };
}

/**
 * Orchestrate a migrate run. Dry-run (default) senses the project and returns a
 * plan WITHOUT touching disk; `--apply` performs the (staged, reversible) moves.
 * `sense` is injectable so the auto-sense brain can be swapped/tested
 * independently of the orchestration.
 *
 * Skeleton (S1.t1): with the no-op sense there are no moves, so BOTH modes are
 * write-free — the apply path grows in S1.t7. `runMigrate(baseDir)` with no opts
 * is a dry-run that touches nothing.
 *
 * @param {string} baseDir
 * @param {{apply?: boolean, force?: boolean, sense?: (baseDir: string) => Promise<object>}} [opts]
 * @returns {Promise<{applied: boolean, dryRun: boolean, plan: object, changed?: string[]}>}
 */
export async function runMigrate(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const sense = opts.sense ?? senseProject;
  const plan = await sense(baseDir);

  if (!apply) {
    return { applied: false, dryRun: true, plan };
  }
  // Apply path — the staged, reversible, gate-guarded move engine lands in
  // S1.t7. The skeleton has no moves, so this writes nothing yet.
  return { applied: true, dryRun: false, plan, changed: [] };
}
