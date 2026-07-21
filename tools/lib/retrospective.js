// tools/lib/retrospective.js — M4.5.E9 retrospective core helpers.
//
// Lands the parsing + path-derivation + validation layer (S1.t3 + S1.t4).
// Subsequent tasks bolt onto this surface:
//   S1.t5 — expectedRetroPath(state), isEpicCloseShip(state, milestoneContent)
//   S1.t11 — tier-specific minimum byte thresholds (replace placeholders below)
//
// Section headings per tier are locked exact-string per RESEARCH § 3.6.
// Byte thresholds are PLACEHOLDERS pending measurement-driven replacement
// in S1.t11 — they're shaped roughly per RESEARCH § 3.5 recommendations.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { EPIC_ID_STRICT_RE, PHASES } from './state.js';

// Pre-SHIP work phases in canonical order — everything in PHASES between
// CALIBRATE and SHIP (both exclusive). Derived from PHASES (state.js:16) so the
// sequence has a single source of truth. CALIBRATE is excluded (it's how we got
// here, never a completed_phases gate requirement); SHIP is the phase being
// entered, not a prerequisite. The tier-required set is this minus a profile's
// `phases_skipped` (B26 / M5.E5.T2).
const PRE_SHIP_PHASES = PHASES.slice(
  PHASES.indexOf('DISCUSS'),
  PHASES.indexOf('SHIP'),
);

// ---- Per-tier required sections (locked, exact-string match) ----

const TIER_SECTIONS = {
  SKETCH: [
    '## What worked',
    "## What didn't",
    '## Feed back into Signal',
  ],
  FEATURE: [
    '## Timeline',
    '## What surprised us',
    "## What we'd do differently",
    '## What to feed back into Signal',
    '## Links',
  ],
  SPIKE: [
    '## What we learned',
    '## Did the spike resolve its question',
    '## Next: build, abandon, or continue',
  ],
  FULL: [
    '## Timeline',
    '## What changed mid-flight',
    '## What assumptions broke',
    '## What surprised us',
    "## What we'd do differently",
    '## What to feed back into Signal',
    '## Anti-rationalization moment',
    '## Links',
  ],
};

/**
 * Return the canonical, ordered list of `## ` headings required for a given
 * tier's retrospective. Returns a fresh array on each call (callers can
 * mutate without polluting the source-of-truth).
 *
 * @param {string} tier — SKETCH | FEATURE | SPIKE | FULL
 * @returns {string[]}
 */
export function getRequiredSections(tier) {
  const sections = TIER_SECTIONS[tier];
  if (!sections) {
    throw new Error(
      `getRequiredSections: unknown tier "${tier}" (expected one of SKETCH, FEATURE, SPIKE, FULL)`,
    );
  }
  return [...sections];
}

// ---- Section parser ----

/**
 * Walk markdown content and split it into `## `-anchored sections.
 *
 * Returns `{ headings, sectionsByHeading }`:
 *   - headings: array of heading strings in document order (e.g. "## Timeline")
 *   - sectionsByHeading: map heading string → body text (preserves leading /
 *     trailing whitespace so callers can decide trim policy)
 *
 * Only h2 (`## `) is treated as a section boundary. h1 (`# `) and h3 (`### `)
 * are body content. Content before the first `## ` heading is dropped — the
 * convention is: a retro file opens with `## ` headings, no preamble.
 *
 * @param {string} markdown
 * @returns {{headings: string[], sectionsByHeading: Record<string, string>}}
 */
export function parseSections(markdown) {
  const lines = markdown.split('\n');
  const headings = [];
  const sectionsByHeading = {};
  let currentHeading = null;
  let buffer = [];

  // h2 detector: line starts with exactly `##` followed by a non-`#` char.
  // `## Foo` matches; `### Foo` doesn't; `#### Foo` doesn't; `# Foo` doesn't.
  const H2 = /^##[^#]/;

  const flush = () => {
    if (currentHeading !== null) {
      sectionsByHeading[currentHeading] = buffer.join('\n');
    }
  };

  for (const line of lines) {
    if (H2.test(line)) {
      flush();
      currentHeading = line;
      headings.push(line);
      buffer = [];
    } else if (currentHeading !== null) {
      buffer.push(line);
    }
  }
  flush();

  return { headings, sectionsByHeading };
}

// ---- Path derivation ----

/**
 * Compute the retrospective file path for an Epic ID. Handles both the
 * M{milestone}.{submilestone}.E{N} shape (e.g., M4.5.E9) and the
 * M{milestone}.E{N} shape (e.g., M5.E1).
 *
 * Returns a relative path rooted at the project's baseDir convention.
 *
 * @param {string} epicId
 * @returns {string}
 */
export function deriveRetroPath(epicId) {
  if (!epicId || typeof epicId !== 'string') {
    throw new Error('deriveRetroPath: epicId is required');
  }
  // Shapes: M4.E1, M4.5.E1, M10.E1, M5.E12, M4.5.6.E1 (in case of nested),
  // but NOT bare "E9" or arbitrary strings. Shape is the shared
  // EPIC_ID_STRICT_RE (state.js) — single source of truth (M4.5.E11.S1.t1).
  if (!EPIC_ID_STRICT_RE.test(epicId)) {
    throw new Error(
      `deriveRetroPath: malformed epicId "${epicId}" (expected M{N}[.{N}]*.E{N})`,
    );
  }
  return `.planning/${epicId}-RETROSPECTIVE.md`;
}

/**
 * Is the given Epic "done"? True iff its `{EpicID}-RETROSPECTIVE.md` exists on
 * disk — the unambiguous SHIP-complete signal (M4.5.E11.S1.t5). NOT `phase:
 * SHIP`: Signal's STATE never moves SHIP into `completed_phases`, so `phase:
 * SHIP` means "in/past SHIP", not done. Returns false for a malformed/empty
 * `epicId` (never throws — a non-Epic-shaped value isn't a done Epic). Powers
 * the done-Epic guard: a writing command against a done Epic with no `--epic`
 * must halt rather than clobber that Epic's artifacts.
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @returns {boolean}
 */
export function isEpicDone(baseDir, epicId) {
  if (typeof epicId !== 'string' || !EPIC_ID_STRICT_RE.test(epicId)) return false;
  return existsSync(join(baseDir, deriveRetroPath(epicId)));
}

// ---- Template loader ----

/**
 * Read references/retrospective-template.md and extract the template block
 * for the given tier. The block is delimited by the literal HTML comments:
 *
 *   <!-- TEMPLATE: {TIER} -->
 *   ...content...
 *   <!-- /TEMPLATE: {TIER} -->
 *
 * Returned content has the marker lines stripped and surrounding blank
 * lines trimmed, leaving a ready-to-paste retro skeleton.
 *
 * Throws (does not silently fall back) when either marker is missing —
 * silent fallback would mean a SKETCH retro could accidentally use the
 * FULL template, which validateRetroContent would then reject for missing
 * headings the user never asked for.
 *
 * @param {string} tier
 * @param {string} baseDir
 * @returns {Promise<string>}
 */
export async function loadTemplate(tier, baseDir) {
  const path = join(baseDir, 'references', 'retrospective-template.md');
  const content = await readFile(path, 'utf-8');

  const startMarker = `<!-- TEMPLATE: ${tier} -->`;
  const endMarker = `<!-- /TEMPLATE: ${tier} -->`;

  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(
      `loadTemplate: marker "<!-- TEMPLATE: ${tier} -->" not found in ${path}`,
    );
  }
  const endIdx = content.indexOf(endMarker, startIdx + startMarker.length);
  if (endIdx === -1) {
    throw new Error(
      `loadTemplate: closing marker "<!-- /TEMPLATE: ${tier} -->" not found after opening marker in ${path}`,
    );
  }

  const inner = content.slice(startIdx + startMarker.length, endIdx);
  // Trim leading + trailing whitespace lines but preserve internal blank
  // lines (section bodies want their breathing room).
  return inner.replace(/^\n+/, '').replace(/\n+$/, '');
}

// ---- Validation ----

// Per-tier minimum byte thresholds. Measured + wired in S1.t11 from the
// shipped references/retrospective-template.md.
//
// PLAN deviation surfaced: the PLAN spec suggested coefficient 150B per
// section, but the PLAN AC ("minimally-filled template — one sentence per
// section — passes") is incompatible with 150B. One sentence is ~50-70B
// of body; using 150B per section pushes the threshold beyond what one
// sentence per section can clear. The AC is the binding constraint
// (user-facing behavior); the 150B suggestion was a rough cut from
// RESEARCH § 3.5 that didn't survive the AC.
//
// Resolved by using coefficient 60B per section, which:
//   1. Rejects heading-only templates (template_floor < threshold)
//   2. Rejects "x"-body retros (a few bytes per section, well below floor + 60B/section)
//   3. Accepts one substantive sentence per section
//
// Measurements + formula (M4.5.E9.S1.t11, 2026-05-26):
//   threshold = template_floor + 60B × required_section_count
//   SKETCH:  60B + 60 × 3 = 240B
//   FEATURE: 114B + 60 × 5 = 414B
//   SPIKE:    99B + 60 × 3 = 279B
//   FULL:    207B + 60 × 8 = 687B
//
// If a tier proves too lenient or too strict in dogfood (S1.t12 will be
// the first dogfood), the right knob is the 60B coefficient, not the floor.
const BYTE_THRESHOLDS = {
  SKETCH: 240,
  FEATURE: 414,
  SPIKE: 279,
  FULL: 687,
};

/**
 * Validate a retrospective file's content against its tier's contract.
 *
 * Checks (FR3 / AC6-9):
 *   1. Content is non-empty (after whitespace strip)
 *   2. All required ## section headings are present (exact-string)
 *   3. No required section has an empty body
 *   4. Total content meets the tier's minimum byte threshold
 *
 * `[FILL IN]` markers do NOT trigger failure here — they're allowed in stub
 * retros (per D-E9-7). Distinguishing stub from complete is the caller's job;
 * for now both go through this validator with identical rules. (FR3 item 4
 * in REQUIREMENTS contemplates differentiated behavior; the S1.t6 ship.md
 * gate is where stub-vs-complete policy gets applied.)
 *
 * @param {string} content — file contents
 * @param {string} tier — SKETCH | FEATURE | SPIKE | FULL
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateRetroContent(content, tier) {
  // Resolve required sections first — throws cleanly on unknown tier.
  const required = getRequiredSections(tier);
  const errors = [];

  // 1. Empty check (whitespace-only counts as empty).
  if (content == null || content.trim().length === 0) {
    return { valid: false, errors: ['retro file is empty'] };
  }

  // 2 + 3. Parse and check heading presence + body non-emptiness.
  const { headings, sectionsByHeading } = parseSections(content);
  const headingSet = new Set(headings);

  for (const requiredHeading of required) {
    if (!headingSet.has(requiredHeading)) {
      errors.push(
        `missing required section heading "${requiredHeading}" for ${tier} tier`,
      );
      continue;
    }
    const body = sectionsByHeading[requiredHeading] ?? '';
    if (body.trim().length === 0) {
      errors.push(
        `required section "${requiredHeading}" has empty body — every required section needs substantive content`,
      );
    }
  }

  // 4. Tier minimum-byte threshold check.
  const threshold = BYTE_THRESHOLDS[tier];
  const byteLength = Buffer.byteLength(content, 'utf-8');
  if (threshold && byteLength < threshold) {
    errors.push(
      `retro content is too short: ${byteLength} bytes is below the ${tier} threshold of ${threshold} bytes`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ---- State + milestone integration ----

/**
 * Compute the expected retrospective path from STATE.md frontmatter shape.
 * Returns null when `current_epic` is missing/empty — the caller is
 * responsible for surfacing the right user-facing error in that case
 * (S1.t6 ship.md FR1 pre-check has the documented message).
 *
 * @param {{current_epic?: string|null} | null | undefined} state
 * @returns {string | null}
 */
export function expectedRetroPath(state) {
  if (!state) return null;
  const epicId = state.current_epic;
  if (!epicId) return null;
  // Delegate to deriveRetroPath — propagates malformed-epic errors.
  return deriveRetroPath(epicId);
}

/**
 * Determine whether the SHIP about to fire closes the Epic.
 *
 * Returns true iff the Epic shows at least one shipped slice AND has no
 * remaining pending slices in the milestone file. Shelved slices DO NOT
 * count as pending (regression-tested for E1.S3-S5 — D-E3-12 shelved them
 * yet E1 is effectively closed for retro purposes).
 *
 * Workflow assumption: the slice's own SHIP work updates MILESTONE-{N}.md
 * to mark the slice as shipped BEFORE `/sig:ship` is invoked for the
 * Epic-close event. This matches the M4.5.E3 pattern where the closing
 * SHIP commit (dc43ebf) refreshed STATE.md + CONTEXT.md after MILESTONE
 * annotations were already in earlier slice commits.
 *
 * @param {{current_epic?: string|null} | null | undefined} state
 * @param {string} milestoneContent — full file contents of MILESTONE-{N}.md
 * @returns {boolean}
 */
export function isEpicCloseShip(state, milestoneContent) {
  if (!state) return false;
  const epicId = state.current_epic;
  if (!epicId) return false;
  if (!milestoneContent) return false;

  const statusRow = findEpicStatusRow(milestoneContent, epicId);
  if (statusRow === null) return false;

  const hasShipped = /\bshipped\b/i.test(statusRow);
  if (!hasShipped) return false;

  const hasPending = /\bpending\b/i.test(statusRow);
  // "in flight" is also a non-terminal state; treat as pending.
  const hasInFlight = /\bin\s+flight\b/i.test(statusRow);

  return !hasPending && !hasInFlight;
}

/**
 * Does `completedPhases` contain an entry for `phase`? Entries are single-line
 * scalars shaped `PHASE (YYYY-MM-DD)` or `PHASE (date) — note`, so match the
 * leading phase-name token at a word boundary — the `(date)` suffix must not
 * defeat the match (D2 assumption 3). Phase names are known uppercase-letter
 * constants, so no regex escaping is needed.
 *
 * @param {string[]} completedPhases
 * @param {string} phase
 * @returns {boolean}
 */
function completedContainsPhase(completedPhases, phase) {
  if (!Array.isArray(completedPhases)) return false;
  const re = new RegExp(`^${phase}\\b`);
  return completedPhases.some(
    (entry) => typeof entry === 'string' && re.test(entry.trim()),
  );
}

/**
 * The STATE-based Epic-close fallback (B26 / M5.E5.T2). True when STATE alone
 * shows the current Epic has reached its close: `current_epic` set, `phase ===
 * 'SHIP'`, and `completed_phases` covers every tier-enabled pre-SHIP phase.
 *
 * The required set is `PRE_SHIP_PHASES` minus `profile.phases_skipped`
 * (FULL/FEATURE → all 5; SKETCH `[REVIEW]` → through VERIFY; SPIKE `[REVIEW,
 * SHIP]` skips SHIP, so a SHIP-phase state never arises and this never fires).
 * When `profile` is absent, nothing is skipped — the full pre-SHIP set, which
 * is the correct default for Signal's own FULL-tier self-hosted flow.
 *
 * This is the STATE half of the combined Epic-close predicate. Callers gate it
 * on milestone-ROW ABSENCE (`findEpicStatusRow === null`), NOT a pure OR, so a
 * maintained `pending` / `in flight` row still wins for a legit per-slice ship
 * (D-E9-5). It never reads the milestone table itself.
 *
 * @param {{current_epic?: string|null, phase?: string, completed_phases?: string[], completedPhases?: string[]} | null | undefined} state
 * @param {{phases_skipped?: string[]} | null | undefined} profile
 * @returns {boolean}
 */
export function isEpicCloseByState(state, profile) {
  if (!state) return false;
  if (!state.current_epic) return false;
  if (state.phase !== 'SHIP') return false;

  const skipped = new Set(profile?.phases_skipped ?? []);
  const required = PRE_SHIP_PHASES.filter((p) => !skipped.has(p));
  const completed = state.completed_phases ?? state.completedPhases ?? [];

  return required.every((phase) => completedContainsPhase(completed, phase));
}

// ---- Hook helpers (D-E9-8 layers 2 + 3) ----

/**
 * Extract `completed_phases` list entries from a raw STATE.md frontmatter
 * block. Each entry is a single-line `- PHASE (date)` scalar; quotes are
 * stripped. Returns `[]` for an absent or inline-empty (`completed_phases: []`)
 * list. Raw-text parse (no YAML dep) to keep the PreToolUse hook synchronous
 * and circular-import-free.
 *
 * @param {string} fm — the raw frontmatter text (between the `---` fences)
 * @returns {string[]}
 */
function parseCompletedPhasesFromFrontmatter(fm) {
  const lines = fm.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^completed_phases:/.test(l));
  if (idx === -1) return [];
  if (/^completed_phases:\s*\S/.test(lines[idx])) return []; // inline (e.g. [])
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^[A-Za-z_][A-Za-z0-9_]*:/.test(lines[i])) break; // next top-level key
    const item = lines[i].match(/^\s*-\s*(.+)$/);
    if (item) out.push(item[1].replace(/^["']|["']$/g, '').trim());
  }
  return out;
}

/**
 * Decide whether a proposed STATE.md write should be blocked by the
 * PreToolUse hook (layer 2 of D-E9-8). The proposed new content is parsed,
 * and we look for the load-bearing signal: the write would record an
 * Epic-close SHIP (`phase: SHIP` AND `completed_phases` covering every
 * tier-enabled pre-SHIP phase). If the matching retro file isn't on disk, block.
 *
 * B26 (M5.E5.T2): the prior trigger keyed off a `- SHIP` entry in
 * `completed_phases`, but Signal never writes a SHIP completion entry
 * (references/epic-native-flow.md:27) — so that path was structurally dead.
 * Re-keyed off tier-complete pre-SHIP phases. Tier-awareness comes from
 * `args.profile.phases_skipped`; with no profile it requires the full pre-SHIP
 * set (the self-hosted FULL default).
 *
 * The check fires regardless of whether `/sig:ship` was the invoker — that's
 * the bypass-resistance the layer adds beyond the command-internal check.
 *
 * @param {object} args
 * @param {string} args.proposedContent — the post-write STATE.md content
 * @param {string} args.baseDir — project root
 * @param {{phases_skipped?: string[]}} [args.profile] — tier profile (optional)
 * @param {(state: object) => string|null} [args.expectedRetroPathFn] — DI for testing
 * @param {(p: string) => boolean} [args.fileExistsFn] — DI for testing
 * @returns {{block: boolean, reason?: string, retroPath?: string}}
 */
export function checkProposedStateWrite(args) {
  const {
    proposedContent,
    baseDir,
    profile,
    expectedRetroPathFn = expectedRetroPath,
    fileExistsFn,
  } = args;

  // Parse frontmatter inline — duplicating the lightweight pattern from
  // state.js to avoid a circular import. We only need a few fields.
  const m = proposedContent.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { block: false };
  const fm = m[1];

  const phaseMatch = fm.match(/^phase:\s*(.+)$/m);
  const phase = phaseMatch ? phaseMatch[1].trim() : null;
  if (phase !== 'SHIP') return { block: false };

  // Epic-close signal (B26): phase SHIP + completed_phases covers every
  // tier-enabled pre-SHIP phase. NOT a `- SHIP` entry (Signal never writes one).
  const completed = parseCompletedPhasesFromFrontmatter(fm);
  const skipped = new Set(profile?.phases_skipped ?? []);
  const required = PRE_SHIP_PHASES.filter((p) => !skipped.has(p));
  const coversPreShip = required.every((p) => completedContainsPhase(completed, p));
  if (!coversPreShip) return { block: false };

  const currentEpicMatch = fm.match(/^current_epic:\s*(\S+)\s*$/m);
  const currentEpic = currentEpicMatch ? currentEpicMatch[1].replace(/['"]/g, '') : null;
  if (!currentEpic || currentEpic === 'null') return { block: false };

  const retroPath = expectedRetroPathFn({ current_epic: currentEpic });
  if (!retroPath) return { block: false };

  const fullPath = join(baseDir, retroPath);
  const exists = fileExistsFn ? fileExistsFn(fullPath) : defaultFileExists(fullPath);
  if (exists) return { block: false };

  return {
    block: true,
    retroPath,
    reason:
      `M4.5.E9 enforcement: STATE.md write would mark Epic-close SHIP for ${currentEpic} ` +
      `without ${retroPath}. Create the retro file (template at ` +
      `references/retrospective-template.md), then re-attempt the write.`,
  };
}

// --- FR1 (v0.1.6): block prose landing in STATE.md frontmatter fields ---
//
// A SIBLING to checkProposedStateWrite (which gates on phase: SHIP). The prose
// check must fire on ANY phase, so it cannot nest inside that SHIP-gated path;
// the hook composes both predicates and blocks if either fires.
//
// RAW-TEXT, not parseFrontmatter: parseFrontmatter throws on malformed YAML,
// which a prose blob often IS (unquoted colons, bare newlines) — a parse-first
// design would fail OPEN and miss its headline case (the 455 KB cmmc pollution).
// So we walk the raw frontmatter lines.
//
// Blacklist stance: block only clearly-malformed input; when in doubt, ALLOW.
// A false positive wedges a stranger's write (the P1 harm); a false negative
// just defers to FR2's read-time size banner. Budgets are deliberately generous.

// A completed_phases entry is a single-line scalar `PHASE (YYYY-MM-DD)` (~17-24
// chars) or an annotated `PHASE (date) — <note>` (observed legit max 58 chars).
const COMPLETED_PHASES_MAX = 150;
// A blockers[].text is a short structured summary (observed legit max ~52,
// e.g. "Marketplace install hangs on first run; tracked under F2").
const BLOCKER_TEXT_MAX = 500;
// Defense-in-depth (REVIEW, security-Low): the hook runs synchronously in the
// Edit/Write path. A runaway multi-MB *well-formed* frontmatter would incur a
// proportional line-walk stall. Legit frontmatter is a few KB, so a 1 MB
// ceiling never trips a real file; past it we fail open (FR2's banner flags the
// oversized file anyway).
const FRONTMATTER_SCAN_CEILING = 1024 * 1024;
// B8: the guard evaluates the WHOLE proposed file, not the delta, so a file with
// several offending entries only unblocks via one save that fixes them all —
// correcting them one at a time fails on every intermediate write. The block
// message is the only channel the user sees, so it must say this or the escape
// stays invisible (confirmed live on a 529 KB STATE.md with 10 prose entries).
const WHOLE_FILE_NOTE =
  ' Note: this check reads the whole file, so if more than one entry is ' +
  'affected they must all be fixed in a single save — correcting them one at a ' +
  'time will fail on every attempt.';

/**
 * Detect prose that would pollute a STATE.md frontmatter list field
 * (`completed_phases` scalars / `blockers[].text`). Operates on the RAW
 * frontmatter text, per-field, and NEVER throws (fail-open → { block: false }).
 *
 * @param {object} args
 * @param {string} args.proposedContent — the post-write STATE.md content
 * @returns {{block: boolean, reason?: string}}
 */
export function checkStateFrontmatterShape(args) {
  try {
    const proposedContent = args?.proposedContent;
    if (typeof proposedContent !== 'string') return { block: false };
    // CRLF-tolerant (REVIEW): a Windows STATE.md (autocrlf) must get the same
    // protection as an LF one — an `\n`-only anchor would leave it unguarded.
    const m = proposedContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return { block: false };
    if (m[1].length > FRONTMATTER_SCAN_CEILING) return { block: false };
    const lines = m[1].split(/\r?\n/);

    const isTopKey = (line) => /^[A-Za-z_][A-Za-z0-9_]*:/.test(line);

    // Raw block of lines under a top-level `key:` list (lines after `key:` up
    // to the next top-level key or EOF). null if absent or inlined (`key: []`).
    const sectionLines = (key) => {
      const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
      if (idx === -1) return null;
      if (/^[A-Za-z_][A-Za-z0-9_]*:\s*\S/.test(lines[idx])) return null; // inline
      const out = [];
      for (let i = idx + 1; i < lines.length; i++) {
        if (isTopKey(lines[i])) break;
        out.push(lines[i]);
      }
      return out;
    };

    // Split a section into per-item chunks (an item starts at a `- ` marker;
    // deeper non-blank lines are continuations of the preceding item).
    const itemChunks = (secLines) => {
      const items = [];
      let cur = null;
      for (const line of secLines) {
        if (/^\s*-\s/.test(line)) {
          if (cur) items.push(cur);
          cur = [line];
        } else if (cur && line.trim() !== '') {
          cur.push(line);
        }
      }
      if (cur) items.push(cur);
      return items;
    };

    // completed_phases — scalar strings. Multi-line OR over-budget = prose.
    const cp = sectionLines('completed_phases');
    if (cp) {
      for (const chunk of itemChunks(cp)) {
        if (chunk.length > 1) {
          return {
            block: true,
            reason:
              'STATE.md frontmatter: a completed_phases entry spans multiple lines. ' +
              'Entries must be single-line "PHASE (YYYY-MM-DD)" scalars — move the ' +
              'narrative into the STATE.md body below the frontmatter, then re-write.' +
              WHOLE_FILE_NOTE,
          };
        }
        const value = chunk[0]
          .replace(/^\s*-\s*/, '')
          .replace(/^["']|["']$/g, '')
          .trim();
        if (value.length > COMPLETED_PHASES_MAX) {
          return {
            block: true,
            reason:
              `STATE.md frontmatter: a completed_phases entry is ${value.length} chars ` +
              `(budget ${COMPLETED_PHASES_MAX}). Entries must be short "PHASE (date)" ` +
              'labels — move the narrative into the STATE.md body, then re-write.' +
              WHOLE_FILE_NOTE,
          };
        }
      }
    }

    // blockers — object mappings. Inspect ONLY the text: value; NEVER flag a
    // blocker for being multi-line (a real blocker is a 3-line id/text/raisedAt
    // object). Only its text: value can be prose.
    const bl = sectionLines('blockers');
    if (bl) {
      for (const line of bl) {
        const tm = line.match(/^\s*text:\s*(.*)$/);
        if (!tm) continue;
        const raw = tm[1].trim();
        if (/^[|>][+-]?\s*$/.test(raw)) {
          return {
            block: true,
            reason:
              'STATE.md frontmatter: a blockers[].text is a multi-line block scalar. ' +
              'Blocker text must be a short single-line summary — trim it, then re-write.' +
              WHOLE_FILE_NOTE,
          };
        }
        if (raw.length > BLOCKER_TEXT_MAX) {
          return {
            block: true,
            reason:
              `STATE.md frontmatter: a blockers[].text is ${raw.length} chars ` +
              `(budget ${BLOCKER_TEXT_MAX}). Keep blocker text a short summary — ` +
              'trim it, then re-write.' +
              WHOLE_FILE_NOTE,
          };
        }
      }
    }

    return { block: false };
  } catch {
    return { block: false }; // fail-open: never wedge a write on our own error
  }
}

/**
 * Detect "dirty EXECUTE" state for the SessionStart(resume) hook (layer 3
 * of D-E9-8). Dirty = STATE.md says we're mid-EXECUTE for an Epic that
 * already looks like it should have shipped (per the milestone file), and
 * no retro exists.
 *
 * Returns a banner message to inject into additionalContext, or null when
 * the state is clean.
 *
 * @param {object} args
 * @param {{current_epic?: string|null, phase?: string}} args.state
 * @param {string} args.milestoneContent
 * @param {string} args.baseDir
 * @param {(p: string) => boolean} [args.fileExistsFn] — DI for testing
 * @returns {string | null}
 */
export function detectDirtyExecute(args) {
  const { state, milestoneContent, baseDir, fileExistsFn } = args;
  if (!state || state.phase !== 'EXECUTE') return null;
  if (!state.current_epic) return null;
  // Only warn when MILESTONE.md shows the Epic IS at close (per
  // isEpicCloseShip) but STATE.md still says EXECUTE — that's the gap the
  // hook exists to surface.
  if (!isEpicCloseShip(state, milestoneContent)) return null;
  const retroPath = expectedRetroPath(state);
  if (!retroPath) return null;
  const exists = fileExistsFn
    ? fileExistsFn(join(baseDir, retroPath))
    : defaultFileExists(join(baseDir, retroPath));
  if (exists) return null;

  return (
    `[signal] M4.5.E9 enforcement reminder: Epic ${state.current_epic} ` +
    `looks closed in MILESTONE.md but STATE.md still says EXECUTE, and ` +
    `no retro file exists at \`${retroPath}\`. Before \`/sig:ship\` can ` +
    `close this Epic, create the retro from the tier-appropriate template ` +
    `(see \`references/retrospective-template.md\`). The SHIP command will ` +
    `hard-block until the retro lands.`
  );
}

function defaultFileExists(path) {
  // Sync existsSync is safe + cheap; hook scripts need synchronous decisions.
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

// ---- Command-internal SHIP enforcement (D-E9-8 layer 1) ----

/**
 * The command-internal FR1 pre-check invoked from `commands/ship.md`.
 *
 * Returns a structured result the caller uses to decide whether to halt.
 * Shapes:
 *   - { halt: false, retroPath, isEpicClose: true }                 — proceed
 *   - { halt: false, skipped: true, reason }                        — per-slice ship; skip
 *   - { halt: true, code: 'NO_CURRENT_EPIC', message }              — A2 empty
 *   - { halt: true, code: 'NO_RETRO_FILE', retroPath, message }     — AC1
 *   - { halt: true, code: 'INVALID_RETRO', retroPath, message }     — content fails validator
 *
 * The function has NO bypass parameter — D-E9-3's "no bypass" applies. Extra
 * args passed by the caller are ignored.
 *
 * @param {object} args
 * @param {{current_epic?: string|null} | null} args.state
 * @param {{tier: string}} args.profile
 * @param {string} args.milestoneContent — full content of MILESTONE-{N}.md
 * @param {string} args.baseDir
 */
export async function shipFR1Check(args) {
  const { state, profile, milestoneContent, baseDir } = args;

  // (1) current_epic edge cases (A2).
  if (!state || !state.current_epic) {
    return {
      halt: true,
      code: 'NO_CURRENT_EPIC',
      message:
        'No current_epic in STATE.md. Run `/sig:resume` or set current_epic before invoking `/sig:ship`.',
    };
  }

  // (2) Per-Epic vs per-Slice gating. If this isn't the closing SHIP for the
  // Epic, FR1 doesn't fire — slice ships are exempt per D-E9-5.
  //
  // B26 (M5.E5.T2): the milestone table is the primary signal, but on the
  // self-hosted flow MILESTONE-{n}.md can lack the Epic's row entirely (as
  // MILESTONE-5.md had no E4 row), so findEpicStatusRow returns null and
  // isEpicCloseShip is false — the gate silently skipped. Fall back to STATE,
  // but ONLY when the row is ABSENT, so a maintained "pending"/"in flight" row
  // still wins for a legit per-slice ship (not a pure OR).
  const rowStatus = milestoneContent
    ? findEpicStatusRow(milestoneContent, state.current_epic)
    : null;
  const isEpicClose =
    isEpicCloseShip(state, milestoneContent) ||
    (rowStatus === null && isEpicCloseByState(state, profile));
  if (!isEpicClose) {
    return {
      halt: false,
      skipped: true,
      reason:
        'not an Epic-close SHIP (per-Slice SHIP or Epic not yet near close); FR1 retro enforcement does not apply',
    };
  }

  // (3) Derive retro path.
  const retroPath = expectedRetroPath(state);

  // (4) Read and validate.
  const tierAnchor =
    'references/retrospective-template.md#' +
    String(profile.tier).toLowerCase() +
    '-tier';

  let content;
  try {
    content = await readFile(join(baseDir, retroPath), 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        halt: true,
        code: 'NO_RETRO_FILE',
        retroPath,
        message:
          `M4.5.E9 enforcement: \`RETROSPECTIVE.md\` required before SHIP can close. ` +
          `Create \`${retroPath}\` from the ${profile.tier}-tier template ` +
          `(see \`${tierAnchor}\`), then re-invoke \`/sig:ship\`.`,
      };
    }
    throw err;
  }

  const result = validateRetroContent(content, profile.tier);
  if (!result.valid) {
    return {
      halt: true,
      code: 'INVALID_RETRO',
      retroPath,
      message:
        `Retro at \`${retroPath}\` failed ${profile.tier}-tier validation: ` +
        result.errors.join('; ') +
        `. Edit the file (template at \`${tierAnchor}\`), then re-invoke \`/sig:ship\`.`,
    };
  }

  return { halt: false, retroPath, isEpicClose: true };
}

/**
 * Extract the status column from a MILESTONE-{N}.md table row matching the
 * given Epic ID. Returns null when not found.
 *
 * @param {string} milestoneContent
 * @param {string} epicId
 * @returns {string | null}
 */
function findEpicStatusRow(milestoneContent, epicId) {
  const epicNumMatch = epicId.match(/\.E(\d+)$/);
  if (!epicNumMatch) return null;
  const epicNum = epicNumMatch[1];

  for (const line of milestoneContent.split('\n')) {
    const match = line.match(/^\|\s*\*{0,2}E(\d+)\b[^|]*\|([^|]+)\|/);
    if (match && match[1] === epicNum) {
      return match[2].trim();
    }
  }
  return null;
}
