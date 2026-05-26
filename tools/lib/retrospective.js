// tools/lib/retrospective.js — M4.5.E9 retrospective core helpers.
//
// Lands the parsing + path-derivation layer (S1.t3). Subsequent tasks bolt
// onto this surface:
//   S1.t4 — validateRetroContent(content, tier)
//   S1.t5 — expectedRetroPath(state), isEpicCloseShip(state, milestoneContent)
//   S1.t11 — tier-specific minimum byte thresholds (wired into validateRetroContent)
//
// Section headings per tier are locked exact-string per RESEARCH § 3.6.

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
