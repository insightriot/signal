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
import { withStateLock } from './state.js';
import { resolveInboxPath, resolveLedgerPath } from './inbox-path.js';
import { promoteToBacklog, promoteToBugs } from './backlog.js';
import { WorkStoreError } from './work-item.js';
import { isStoreOn } from './work-store.js';
import {
  isFenceMarker,
  listDrainCandidates,
  listDrainCandidatesWithRecovery,
  listStandingEntries,
  parseEntries,
  parseTriggerWatchlist,
  statusLineIdxInBlock,
} from './legacy-lists.js';

// M6.E11 (t4.4, AC-6.3, D-M6E11-25): with the work store on, the inbox is
// GENERATED from item files — a stamp, a promote or an eviction written into
// it would vanish at the next regeneration, and the promote would duplicate
// work `/sig:item triage` owns. So every drain write refuses outright, before
// it takes `.state.lock` or reads the inbox. A dry run too: one rule is
// easier to trust than two. (The write guard in `atomicWrite` would refuse
// anyway, but half-way through a two-file write and with a less useful
// message.) A broken WORK.md throws CONFIG here — never a fallback.
function refuseWhenStoreOn(baseDir, what) {
  if (!isStoreOn(baseDir).on) return;
  throw new WorkStoreError('GENERATED', `${what}: the work store is on, so the inbox (.planning/ISSUES-INBOX.md) `
    + 'is generated from the item files under .planning/work/inbox/ and the drain does not write it. '
    + 'Sort the inbox with `/sig:item triage` instead.');
}

// `parseEntries` and the `listDrain*` family — with the heading, Status-line and
// disposition regexes they read — live in `legacy-lists.js` since M6.E13 t4.1
// (Decision 12), the one home of every Markdown list parser. Re-exported here
// under the same names; the writers below call them from there, so surface
// and write still consume ONE parser (R1/R5).
export { parseEntries, listDrainCandidates, listStandingEntries, listDrainCandidatesWithRecovery, parseTriggerWatchlist };

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

// Disposition verb → the past-tense word recorded in the Status stamp. Only
// promote/defer/shipped ever stamp (delete/merge remove the block); merge/delete
// are listed for completeness but their entries are gone before a stamp shows.
//
// `shipped` added 2026-08-09, and it is a WIRING change, not a new capability:
// `HEADING_DISPOSED_RE`, `HEADING_TERMINAL_RE` and both blockquote variants have
// recognised `SHIPPED` since M5.E1, and the comment at the `dispositioned`
// branch states the model outright — *"the disposed verbs are exactly
// SHIPPED/PROMOTED/DEFERRED/MERGED/DELETED"*. Five verbs in the reader, four in
// the writer. The one `## ✓ SHIPPED` entry in the live inbox was written by
// hand, because nothing could produce one.
//
// WHY IT MATTERS RATHER THAN BEING TIDY. Without it, an entry describing work
// that is already done has no honest disposition: `defer` postpones a finished
// thing, and `delete` removes the record of why the thing exists — in a repo
// whose standing rule is relocate-never-delete. Both were on offer; neither was
// true, and a verb set that cannot describe the situation is how 52 captures
// accumulated 5 stamps. Surfaced 2026-08-09 by Brett, refusing to defer
// completed work — the objection was to the vocabulary, and the vocabulary was
// the defect.
//
// `shipped` is TERMINAL (the entry may later leave for the archive ledger) and
// STAMPS rather than removing, so the reasoning behind shipped work stays
// readable in the file where it was captured.
const VERB_PAST = {
  promote: 'Promoted',
  defer: 'Deferred',
  merge: 'Merged',
  delete: 'Deleted',
  shipped: 'Shipped',
};

// `statusLineIdxInBlock` (the write side's copy of parseEntries' Status-line
// scan) lives in `legacy-lists.js` beside the scan it mirrors (M6.E13 t4.1).

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
 *   - shipped → stamps exactly like promote/defer. It is TERMINAL (eligible to
 *       leave for the archive ledger later) but it does NOT remove the block,
 *       because the capture usually holds the reasoning behind the shipped
 *       work and that reasoning is the part worth keeping.
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
 * @param {'promote'|'defer'|'shipped'|'merge'|'delete'} verb
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
 * @param {'promote'|'defer'|'shipped'|'merge'|'delete'} opts.verb
 * @param {string} opts.reason
 * @param {string} opts.date
 * @param {(entry: object) => Promise<'confirm'|'keep'>} [opts.confirmPrompt] — required for delete/merge
 * @param {Function} [opts.renameFn] — injected for the atomic-fail test; forwarded to atomicWrite
 * @param {Function} [opts._afterRead] — FR5 read-enclosure test seam (B25/M5.E5.T3):
 *   awaited once right after the version-establishing read, before the write. Defaults
 *   to undefined (no-op) so production is byte-identical — mirrors atomic-write.js#renameFn.
 * @returns {Promise<{written: boolean, kept?: boolean, verb: string, heading: string, path?: string}>}
 */
export async function applyDispositionToFileCore(baseDir, relPath, opts) {
  refuseWhenStoreOn(baseDir, 'applyDispositionToFile');
  const { entryIndex, verb, reason, date, confirmPrompt, renameFn } = opts;
  const targetPath = join(baseDir, relPath);
  const content = await readFile(targetPath, 'utf-8');
  // FR6/B29: own-property + typeof guard — an inherited Object.prototype._afterRead
  // must never reach this awaited-under-lock seam (check `opts`, not a destructured local).
  if (Object.hasOwn(opts, '_afterRead') && typeof opts._afterRead === 'function') await opts._afterRead();
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

/**
 * FR5 (M5.E4) — DUAL-ROLE split: `applyDispositionToFile` is BOTH `promoteDrainEntry`'s
 * inner stamp helper AND a standalone command write (commands/plan.md defer/delete). This
 * self-locking wrapper is the STANDALONE path — it acquires the coarse `.planning/.state.lock`
 * so a concurrent state writer can't lost-update the inbox. `promoteDrainEntry`'s locked core
 * calls the lock-free `applyDispositionToFileCore` directly (it already holds the lock — a
 * nested acquire would re-enter the non-reentrant lock and throw, §9). The exported name is
 * unchanged so commands/plan.md needs no edit.
 *
 * @param {string} baseDir — project root
 * @param {string} relPath — destination path relative to baseDir
 * @param {object} opts — see `applyDispositionToFileCore`
 */
export async function applyDispositionToFile(baseDir, relPath, opts) {
  refuseWhenStoreOn(baseDir, 'applyDispositionToFile');
  return withStateLock(baseDir, () => applyDispositionToFileCore(baseDir, relPath, opts));
}

// FR3 (M5.E1): the capture-inbox archive ledger — where terminally-disposed
// entries physically go when they leave the inbox. Written once on first
// creation; every eviction appends a keyed block below it. Append-only; it is an
// archive, so it is intentionally NOT size-banner or write-guard watched. The
// header tracks the RESOLVED inbox name (FR6 rename: `ISSUES-INBOX.md`, or legacy
// `FUTURE-IDEAS.md`) so a born-v3 ledger never mis-titles itself.
function ledgerHeader(inboxRel) {
  const inboxName = inboxRel.replace(/^.*\//, '').replace(/\.md$/, '');
  return (
    `# ${inboxName} — archive ledger\n\n` +
    'Terminally-disposed entries (SHIPPED / PROMOTED / MERGED / DELETED) evicted from\n' +
    `\`${inboxRel}\`. Append-only; DEFERRED entries stay in the inbox.\n`
  );
}

// Dedupe key for an evicted entry: sha1 of the entry's whole block BODY.
// Keying on heading+date was NOT unique — two distinct entries sharing a
// heading and date (e.g. a date embedded in the heading) collide, and a
// cross-run collision (marker already in the ledger from a prior run) makes the
// second entry get spliced from the inbox but never appended → silent loss from
// the move-never-delete archive. The block body is the entry's identity, and it
// preserves crash-idempotency: on a crash re-run the un-removed inbox block is
// byte-identical, so its hash still matches the ledgered marker and it still
// dedupes. The ledger records `<!-- evicted-key: {key} -->` above each block.
function evictionKey(entry, content) {
  return createHash('sha1').update(content.slice(entry.range.start, entry.range.end)).digest('hex');
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
 * @param {string} [opts.inboxRel] — defaults to `resolveInboxPath(baseDir)`
 *   (legacy `FUTURE-IDEAS.md` or v3 `ISSUES-INBOX.md`, whichever is present).
 * @param {string} [opts.ledgerRel] — defaults to `resolveLedgerPath(baseDir)`
 *   (paired with the resolved inbox; existing ledger wins).
 * @param {boolean} [opts.dryRun=false]
 * @param {string} [opts.date] — accepted for signature parity with
 *   applyDispositionToFile; the dedupe key uses each entry's own `dateISO`.
 * @param {Function} [opts.renameFn] — injected for the crash-injection test;
 *   forwarded to both atomicWrite calls.
 * @param {Function} [opts._afterRead] — FR5 read-enclosure test seam (B25/M5.E5.T3):
 *   awaited once right after the version-establishing inbox read (the file under test),
 *   before any write. Defaults to undefined (no-op); mirrors atomic-write.js#renameFn.
 * @returns {Promise<{evicted: Array<{heading: string, key: string}>, planned: Array<{heading: string, key: string}>, danglingFence: boolean}>}
 */
async function evictTerminalToLedgerCore(baseDir, opts = {}) {
  const { dryRun = false, renameFn } = opts;
  // Resolve inside the body (baseDir is the first arg, unavailable in a default
  // param). An explicit inboxRel/ledgerRel still wins; otherwise route through
  // the resolver so a legacy and a v3 repo both work (FR1 / R1).
  const inboxRel = opts.inboxRel ?? resolveInboxPath(baseDir);
  const ledgerRel = opts.ledgerRel ?? resolveLedgerPath(baseDir);

  const inboxPath = join(baseDir, inboxRel);
  const ledgerPath = join(baseDir, ledgerRel);
  const content = await readFile(inboxPath, 'utf-8');
  // FR6/B29: own-property + typeof guard (check `opts`, not a destructured local).
  if (Object.hasOwn(opts, '_afterRead') && typeof opts._afterRead === 'function') await opts._afterRead();

  // Reuse the existing dangling-fence signal (v0.1.6/AD5) — don't rebuild it.
  const { danglingFence } = listDrainCandidatesWithRecovery(content);
  const markerOffset = danglingFence ? danglingFenceOffset(content) : null;

  // Terminal, non-recovered entries; under a dangling fence, only those fully
  // above the marker (range.end ≤ markerOffset) so no block ever spans it.
  const entries = parseEntries(content);
  const targets = entries.filter(
    (e) => isEvictable(e) && (markerOffset === null || e.range.end <= markerOffset)
  );

  const planned = targets.map((e) => ({ heading: e.heading, key: evictionKey(e, content) }));

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
  const staged = new Set(); // keys appended this run — dedupe within the batch too
  for (const e of targets) {
    const key = evictionKey(e, content);
    const marker = `<!-- evicted-key: ${key} -->`;
    if (ledgerText.includes(marker) || staged.has(key)) continue; // dedupe (prior run OR this batch)
    staged.add(key);
    additions.push(`${marker}\n${content.slice(e.range.start, e.range.end)}`);
  }

  if (additions.length > 0) {
    await mkdir(dirname(ledgerPath), { recursive: true });
    let ledger = ledgerExists ? ledgerText : ledgerHeader(inboxRel);
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

  const evicted = targets.map((e) => ({ heading: e.heading, key: evictionKey(e, content) }));
  return { evicted, planned, danglingFence };
}

/**
 * FR5 (M5.E4): self-locking wrapper around `evictTerminalToLedgerCore`. Acquires the
 * coarse `.planning/.state.lock` for the WHOLE two-file RMW (ledger-append FIRST, then
 * inbox-remove) so the read of the inbox and both writes sit inside ONE lock and a
 * concurrent state writer can't lost-update. The exported name is unchanged, so
 * commands/ship.md + commands/plan.md need no edit.
 *
 * @param {string} baseDir — project root
 * @param {object} [opts] — see `evictTerminalToLedgerCore`
 * @returns {Promise<{evicted: Array<{heading: string, key: string}>, planned: Array<{heading: string, key: string}>, danglingFence: boolean}>}
 */
export async function evictTerminalToLedger(baseDir, opts = {}) {
  refuseWhenStoreOn(baseDir, 'evictTerminalToLedger');
  return withStateLock(baseDir, () => evictTerminalToLedgerCore(baseDir, opts));
}

/**
 * FR2 (M5.E3): the drain's classify-and-promote step. A confirmed `promote` is a
 * two-part move — classify the destination, then physically route the idea and
 * stamp the source terminal:
 *
 *   1. **Destination first** — `work` → `promoteToBacklog` (with a roadmap|hygiene
 *      tag), `bug` → `promoteToBugs`. Each is sha1(block)-dedupe-guarded, so a
 *      duplicate call (a crash re-run) is a no-op.
 *   2. **Then stamp** — `applyDispositionToFile(..., verb: 'promote')` records
 *      `→ Promoted {date} ({reason})` on the inbox entry, which the terminal REs
 *      recognize, so the entry becomes evictable. Eviction itself is the separate
 *      batch step (`evictTerminalToLedger`) the command runs after all promotes.
 *
 * Destination-before-stamp is the crash-safe ordering (S4.t4): if the process
 * dies between the two writes, the re-run re-promotes (destination dedupe holds)
 * and completes the stamp; the entry then double-homes — groomed in BACKLOG/BUGS,
 * verbatim in the ledger — and leaves the inbox on the next eviction.
 *
 * `block` MUST be the raw source block (`content.slice(range.start, range.end)`)
 * — the byte-stable dedupe key. `entryIndex` indexes `parseEntries(inbox)`; since
 * a promote stamp appends inline (never removes the block), sequential promotes
 * keep their indices without a re-parse.
 *
 * @param {string} baseDir — project root
 * @param {object} opts
 * @param {'work'|'bug'} opts.classification
 * @param {string} opts.block — raw source inbox block (dedupe key)
 * @param {'roadmap'|'hygiene'} [opts.tag] — required for `work`
 * @param {string} [opts.title] — retitle for the destination entry
 * @param {number} opts.entryIndex — index into `parseEntries(inbox)` to stamp
 * @param {string} opts.reason — stamp context, e.g. "M5.E3 drain"
 * @param {string} opts.date — ISO date YYYY-MM-DD
 * @param {string} [opts.inboxRel] — defaults to `resolveInboxPath(baseDir)`
 * @param {Function} [opts.renameFn] — injected for the crash-injection test;
 *   forwarded to the stamp's atomicWrite (the write BETWEEN destination + evict).
 * @param {Function} [opts._afterRead] — FR5 read-enclosure test seam (B25/M5.E5.T3):
 *   awaited once after the step-1 destination write, before the step-2 inbox-stamp RMW.
 *   Defaults to undefined (no-op); mirrors atomic-write.js#renameFn. NOT forwarded to the
 *   inner applyDispositionToFileCore (that call passes explicit opts), so it fires exactly once.
 * @returns {Promise<{destination: 'backlog'|'bugs', deduped: boolean, heading: string}>}
 */
async function promoteDrainEntryCore(baseDir, opts = {}) {
  const { classification, block, tag, title, entryIndex, reason, date, renameFn } = opts;
  const inboxRel = opts.inboxRel ?? resolveInboxPath(baseDir);

  // Step 1 — destination FIRST (dedupe-guarded → crash-safe re-run).
  let destination;
  let dest;
  if (classification === 'work') {
    dest = await promoteToBacklog(baseDir, { block, tag, title, today: date });
    destination = 'backlog';
  } else if (classification === 'bug') {
    dest = await promoteToBugs(baseDir, { block, title });
    destination = 'bugs';
  } else {
    throw new Error(
      `promoteDrainEntry: classification must be "work" or "bug", got ${JSON.stringify(classification)}.`
    );
  }

  // FR6/B29: own-property + typeof guard (check `opts`, not a destructured local).
  if (Object.hasOwn(opts, '_afterRead') && typeof opts._afterRead === 'function') await opts._afterRead();

  // Step 2 — stamp the inbox entry `→ Promoted` (terminal; eviction is the batch
  // sweep). promote never prompts, so no confirmPrompt is needed. §9: this core runs
  // INSIDE the `promoteDrainEntry` wrapper's lock, so it MUST call the lock-free
  // `applyDispositionToFileCore` — the self-locking `applyDispositionToFile` wrapper
  // would re-enter the non-reentrant lock and throw (the DUAL-ROLE split's whole point).
  const stamp = await applyDispositionToFileCore(baseDir, inboxRel, {
    entryIndex,
    verb: 'promote',
    reason,
    date,
    renameFn,
  });

  return { destination, deduped: Boolean(dest.deduped), heading: stamp.heading };
}

/**
 * FR5 (M5.E4): self-locking wrapper around `promoteDrainEntryCore`. Acquires the coarse
 * `.planning/.state.lock` for the WHOLE promote RMW (destination-first write, then the
 * inbox stamp) so both writes sit inside ONE lock and a concurrent state writer can't
 * lost-update. The exported name is unchanged, so commands/plan.md needs no edit.
 *
 * @param {string} baseDir — project root
 * @param {object} opts — see `promoteDrainEntryCore`
 * @returns {Promise<{destination: 'backlog'|'bugs', deduped: boolean, heading: string}>}
 */
export async function promoteDrainEntry(baseDir, opts = {}) {
  refuseWhenStoreOn(baseDir, 'promoteDrainEntry');
  return withStateLock(baseDir, () => promoteDrainEntryCore(baseDir, opts));
}

// --- M5.E13 S3.t1 (FR2.1, `B39`): the trigger-watchlist walk — `parseTriggerWatchlist`
// lives in `legacy-lists.js` since M6.E13 t4.1, re-exported above.
