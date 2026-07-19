// Living BACKLOG.md + drain promote helpers (M5.E3.S4 / FR2).
//
// `.planning/BACKLOG.md` is the single groomed, sequenced roadmap — the /sig:plan
// drain classifies each promoted inbox entry (work→BACKLOG / bug→BUGS) and folds
// it in here with a retitle + a roadmap|hygiene tag (roadmap-vs-hygiene is a Tag
// on each entry, NOT a separate file — AC2.1). The raw inbox block simultaneously
// double-homes in the archive ledger via the existing evictTerminalToLedger, so
// the BACKLOG entry can be groomed (old `## ` heading dropped for the retitle)
// with zero risk to the "0 content dropped" faithfulness AC — the ledger is the
// verbatim backstop.
//
// Design constraints (from .planning/M5.E3-PLAN.md § S4):
//   - Idempotent create-if-missing (skeleton = intro + `*Last updated:*` footer).
//   - A promote appends `## {title}` + `**Tag:** {tag}` + the block body, inserted
//     ABOVE the footer via `insertAboveFooter` (reused from add.js).
//   - sha1-dedupe: the entry carries `<!-- backlog-key: {sha1(block)} -->`; a
//     second promote of the SAME source block is a no-op. Keying on the raw,
//     byte-stable inbox block (not an LLM-rendered title/body) is what makes a
//     crash-then-re-run converge (t4): the block is byte-identical on re-run, so
//     its key still matches the already-present marker.
//
// No new runtime deps — pure string work over the shared add.js substrate.

import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

import { atomicWrite } from './atomic-write.js';
import { insertAboveFooter, rewriteFooter, buildBugsEntry, insertAtEnd } from './add.js';

const BACKLOG_REL = '.planning/BACKLOG.md';
const BUGS_REL = '.planning/BUGS.md';

// Roadmap-vs-hygiene is a strict enum tag on each BACKLOG entry (AC2.1).
const VALID_TAGS = new Set(['roadmap', 'hygiene']);

/** Today as an ISO date (YYYY-MM-DD); overridable by callers for determinism. */
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The BACKLOG.md skeleton: title, one-line purpose, `*Last updated:*` footer.
 * When a dated backlog-review snapshot (`BACKLOG-REVIEW-*.md`) is present, add a
 * one-line pointer to it — the CONTENT restructure of that snapshot into this
 * roadmap is a later dogfood judgment pass (S6b), NOT done here (create-if-missing
 * only). `snapshotRel` is the snapshot's filename (a sibling of BACKLOG.md in
 * `.planning/`), or `null`.
 */
function backlogSkeleton(date, snapshotRel) {
  const lines = [
    '# Backlog',
    '',
    'Groomed, sequenced roadmap — promoted from the issues inbox. Roadmap-vs-hygiene is a **Tag** on each entry, not a separate file.',
    '',
  ];
  if (snapshotRel) {
    lines.push(
      `> Seeded from [\`${snapshotRel}\`](${snapshotRel}) — its content restructure into this roadmap is pending (M5.E3.S6b).`,
      ''
    );
  }
  lines.push(`*Last updated: ${date}*`, '');
  return lines.join('\n');
}

// The dated backlog-review snapshot filename in `.planning/`, if one exists, else
// null. Globs `BACKLOG-REVIEW-*.md` so any dated snapshot seeds the pointer; a
// born-on-v3 project (no snapshot) gets the plain skeleton.
function findSnapshot(baseDir) {
  let entries;
  try {
    entries = readdirSync(join(baseDir, '.planning'));
  } catch {
    return null;
  }
  return entries.find((n) => /^BACKLOG-REVIEW-.*\.md$/.test(n)) ?? null;
}

/**
 * Idempotent create-if-missing for `.planning/BACKLOG.md`. Writes the skeleton
 * (intro + `*Last updated:*` footer) only when the file is absent; an existing
 * BACKLOG.md is left byte-for-byte untouched. When a `BACKLOG-REVIEW-*.md`
 * snapshot is present, the skeleton carries a pointer to it (the snapshot's
 * content is restructured into the roadmap later, in S6b — not here).
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @param {{today?: string}} [opts] — `today` seeds the initial footer date.
 * @returns {Promise<{created: boolean, path: string, seededFrom?: string|null}>}
 */
export async function createBacklogIfMissing(baseDir, opts = {}) {
  const path = join(baseDir, BACKLOG_REL);
  if (existsSync(path)) {
    return { created: false, path };
  }
  const date = opts.today ?? isoToday();
  const snapshot = findSnapshot(baseDir);
  await mkdir(dirname(path), { recursive: true });
  await atomicWrite(path, backlogSkeleton(date, snapshot));
  return { created: true, path, seededFrom: snapshot };
}

// Remove a leading top-level `## ` heading line (and one following blank line)
// from an inbox block — the retitle replaces it. Blocks handed in by the drain
// start exactly at their `## ` heading (parseEntries range), so this is a
// targeted one-block op, never a re-parse. A block with no leading heading (a
// bare body, e.g. from a test or a headingless capture) is returned unchanged.
function stripLeadingHeading(block) {
  if (!/^##\s/.test(block)) return block;
  const nl = block.indexOf('\n');
  const rest = nl === -1 ? '' : block.slice(nl + 1);
  return rest.replace(/^\n/, '');
}

// The idea content carried into a groomed BACKLOG/BUGS entry: the block minus
// its leading `## ` heading and its trailing `---` separator, trimmed. The ledger
// keeps the raw block verbatim, so this grooming loses nothing.
function groomBlockBody(block) {
  const stripped = stripLeadingHeading(block);
  return stripped.replace(/\n*-{3,}\s*$/, '').trim();
}

// The heading for a promoted entry: the caller's retitle if supplied, else the
// source block's own `## ` heading, else the first few words of the body.
function resolveTitle(title, block) {
  const t = (title ?? '').trim();
  if (t) return t;
  const m = block.match(/^##\s+(.+)$/m);
  if (m) return m[1].trim();
  return block.trim().split(/\s+/).slice(0, 6).join(' ') || 'Untitled';
}

/** sha1 of the raw source block — the stable dedupe key (see module header). */
export function backlogKey(block) {
  return createHash('sha1').update(block).digest('hex');
}

/**
 * Promote a classified WORK entry into `.planning/BACKLOG.md`: append a
 * `## {title}` entry carrying `**Tag:** {tag}` (roadmap|hygiene) + the groomed
 * block body, inserted ABOVE the footer, with a sha1-dedupe marker (AC2.1). A
 * second promote of the SAME source block (same key) is a no-op — regardless of
 * a different tag or title — so a crash-then-re-run never duplicates.
 *
 * Creates BACKLOG.md first if missing (idempotent).
 *
 * @param {string} baseDir — project root
 * @param {object} opts
 * @param {string} opts.block — the raw source inbox block (dedupe key = sha1(block))
 * @param {'roadmap'|'hygiene'} opts.tag
 * @param {string} [opts.title] — retitle; falls back to the block's heading
 * @param {string} [opts.today] — ISO date for the footer bump
 * @returns {Promise<{written: boolean, deduped?: boolean, path: string, key: string}>}
 */
export async function promoteToBacklog(baseDir, { block, tag, title, today } = {}) {
  if (!VALID_TAGS.has(tag)) {
    throw new Error(
      `promoteToBacklog: tag must be "roadmap" or "hygiene", got ${JSON.stringify(tag)}.`
    );
  }
  const date = today ?? isoToday();
  await createBacklogIfMissing(baseDir, { today: date });

  const path = join(baseDir, BACKLOG_REL);
  const key = backlogKey(block);
  const marker = `<!-- backlog-key: ${key} -->`;
  const content = await readFile(path, 'utf-8');
  if (content.includes(marker)) {
    return { written: false, deduped: true, path, key };
  }

  const heading = resolveTitle(title, block);
  const body = groomBlockBody(block);
  const entry = [`## ${heading}`, '', `**Tag:** ${tag}`, marker, '', body, '', '---'].join('\n');

  const inserted = insertAboveFooter(content, entry);
  const bumped = rewriteFooter(inserted, date);
  await atomicWrite(path, bumped);
  return { written: true, path, key };
}

/** The minimal BUGS.md skeleton used only when a promote must create it. */
function bugsSkeleton() {
  return ['# Bugs', '', 'Confirmed defects and verified findings.', ''].join('\n');
}

/**
 * Promote a classified BUG entry into `.planning/BUGS.md`: a SIMPLE entry
 * (heading + `**Status:** needs-triage` + verbatim body + `---`) built by S1's
 * `buildBugsEntry` and appended at EOF the same way `captureToBugs` does — no
 * B-ID, no table row (triage is a later human step). Carries a `<!-- bugs-key -->`
 * sha1(block) dedupe marker so a re-promote of the same source block is a no-op.
 *
 * Deviation from `captureToBugs` (which throws on a missing BUGS.md): the drain
 * creates BUGS.md if absent, so a bug-classified promote never fails on a project
 * whose BUGS.md has not been scaffolded yet. (Documented S4 deviation.)
 *
 * @param {string} baseDir — project root
 * @param {object} opts
 * @param {string} opts.block — the raw source inbox block (dedupe key = sha1(block))
 * @param {string} [opts.title] — retitle; falls back to the block's heading
 * @returns {Promise<{written: boolean, deduped?: boolean, path: string, key: string}>}
 */
export async function promoteToBugs(baseDir, { block, title } = {}) {
  const path = join(baseDir, BUGS_REL);
  const key = backlogKey(block);
  const marker = `<!-- bugs-key: ${key} -->`;

  let content;
  if (existsSync(path)) {
    content = await readFile(path, 'utf-8');
  } else {
    await mkdir(dirname(path), { recursive: true });
    content = bugsSkeleton();
  }
  if (content.includes(marker)) {
    return { written: false, deduped: true, path, key };
  }

  const heading = resolveTitle(title, block);
  const body = groomBlockBody(block);
  const built = buildBugsEntry({ body, title: heading });
  // Inject the dedupe marker under the needs-triage Status line so it travels
  // with the entry and a re-promote sees it (crash-safe convergence for t4).
  const entry = built.replace(
    '**Status:** needs-triage',
    `**Status:** needs-triage\n${marker}`
  );
  const next = insertAtEnd(content, entry);
  await atomicWrite(path, next);
  return { written: true, path, key };
}
