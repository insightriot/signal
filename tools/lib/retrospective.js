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
import { join } from 'node:path';

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
  // but NOT bare "E9" or arbitrary strings.
  if (!/^M\d+(\.\d+)*\.E\d+$/.test(epicId)) {
    throw new Error(
      `deriveRetroPath: malformed epicId "${epicId}" (expected M{N}[.{N}]*.E{N})`,
    );
  }
  return `.planning/${epicId}-RETROSPECTIVE.md`;
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
