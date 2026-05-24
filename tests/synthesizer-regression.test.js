// Synthesizer regression tests for M4.5.E7 (synthesizer prose-quality).
//
// Background: docs/install-verification.md § R1 documented 6 character-drop
// patterns observed when /sig:init synthesized LANDSCAPE.md + baseline
// PROJECT.md from scanner output on expressjs/express (2026-05-19 biz-machine
// dogfood). M4.5.E7's Layer B + Layer C test architecture (per
// M4.5.E7-RESEARCH.md § 3) asserts against on-disk fixtures rather than
// live LLM output — see tests/fixtures/synthesizer-bug-r1/README.md for
// fixture provenance.
//
// Layer B (this file): deterministic regression coverage at the synthesizer
// seam — heading-literal preservation, round-trip via extractSection, plus
// the embedSection helper that lets the synthesizer copy scan sections
// verbatim instead of asking the LLM to reproduce them.
//
// Layer C (also this file, lower section): prompt-template lint against
// commands/init.md, catching the anti-pattern shapes that produce the
// free-form prose drops (patterns 5 + 6 in R1).

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractSection } from '../tools/lib/landscape.js';

const FIXTURE_DIR = new URL('./fixtures/synthesizer-bug-r1/', import.meta.url).pathname;
const EXPECTED_LANDSCAPE = join(FIXTURE_DIR, 'expected', 'LANDSCAPE.md');
const EXPECTED_PROJECT = join(FIXTURE_DIR, 'expected', 'PROJECT.md');
const ACTUAL_LANDSCAPE = join(FIXTURE_DIR, 'actual', 'LANDSCAPE.md');
const ACTUAL_PROJECT = join(FIXTURE_DIR, 'actual', 'PROJECT.md');

async function read(path) {
  return readFile(path, 'utf8');
}

// ─── Layer B: heading-literal preservation ────────────────────────────────

describe('synthesizer Layer B: heading literals (issue-E7-pattern-1 + pattern-2)', () => {
  it('preserves Inferred-goals heading literally in expected/LANDSCAPE.md — issue-E7-pattern-1', async () => {
    const expected = await read(EXPECTED_LANDSCAPE);
    const headingRegex = /^## Inferred goals & uncertainties$/m;
    expect(headingRegex.test(expected)).toBe(true);

    // RED-state assertion: same regex must NOT match actual/ (the buggy form).
    const actual = await read(ACTUAL_LANDSCAPE);
    expect(headingRegex.test(actual)).toBe(false);

    // And the buggy form ("## Ierred goals") should be in actual/ and not in expected/.
    expect(/^## Ierred goals & uncertainties$/m.test(actual)).toBe(true);
    expect(/^## Ierred goals & uncertainties$/m.test(expected)).toBe(false);
  });

  it('preserves Constraints heading literally in expected/PROJECT.md — issue-E7-pattern-2', async () => {
    const expected = await read(EXPECTED_PROJECT);
    const headingRegex = /^## Constraints$/m;
    expect(headingRegex.test(expected)).toBe(true);

    const actual = await read(ACTUAL_PROJECT);
    expect(headingRegex.test(actual)).toBe(false);
    expect(/^## ints$/m.test(actual)).toBe(true);
    expect(/^## ints$/m.test(expected)).toBe(false);
  });
});

// ─── Layer B: round-trip via extractSection ───────────────────────────────

describe('synthesizer Layer B: round-trip via extractSection', () => {
  it('every h2 heading in expected/LANDSCAPE.md is recoverable via extractSection', async () => {
    const content = await read(EXPECTED_LANDSCAPE);
    const headings = [...content.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings.length).toBeGreaterThanOrEqual(7);

    for (const heading of headings) {
      const section = extractSection(content, heading);
      expect(section, `extractSection("${heading}") returned null`).not.toBeNull();
      expect(section.length, `extractSection("${heading}") returned empty body`).toBeGreaterThan(0);
    }
  });

  it('every h2 heading in expected/PROJECT.md is recoverable via extractSection', async () => {
    const content = await read(EXPECTED_PROJECT);
    const headings = [...content.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings.length).toBeGreaterThanOrEqual(6);

    for (const heading of headings) {
      const section = extractSection(content, heading);
      expect(section, `extractSection("${heading}") returned null`).not.toBeNull();
      expect(section.length, `extractSection("${heading}") returned empty body`).toBeGreaterThan(0);
    }
  });
});

// ─── Layer B: sibling heading-boundary smells ─────────────────────────────

describe('synthesizer Layer B: sibling heading boundaries', () => {
  it('no h2 heading in expected/ files is suspiciously short (< 5 chars after "## ")', async () => {
    const files = [
      { name: 'LANDSCAPE.md', content: await read(EXPECTED_LANDSCAPE) },
      { name: 'PROJECT.md', content: await read(EXPECTED_PROJECT) },
    ];
    // Whitelist legitimately-short headings used by Signal's templates.
    const SHORT_OK = new Set(['Vision', 'Scope', 'Notes']);
    for (const { name, content } of files) {
      const headings = [...content.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      for (const heading of headings) {
        if (heading.length < 5 && !SHORT_OK.has(heading)) {
          throw new Error(`${name}: heading "${heading}" is only ${heading.length} chars — likely a character-drop bug`);
        }
      }
    }
  });

  it('expected/ headings are alphabetic / well-formed (no leading punctuation, no whitespace artifacts)', async () => {
    const files = [await read(EXPECTED_LANDSCAPE), await read(EXPECTED_PROJECT)];
    for (const content of files) {
      const headings = [...content.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      for (const heading of headings) {
        // Leading char should be alphanumeric (not a stray punctuation from a char-drop bug)
        expect(/^[A-Za-z0-9]/.test(heading), `heading "${heading}" doesn't start with [A-Za-z0-9]`).toBe(true);
        // No internal double-space
        expect(/  /.test(heading), `heading "${heading}" contains double-space`).toBe(false);
        // No trailing whitespace
        expect(heading, 'heading has trailing whitespace').toBe(heading.trim());
      }
    }
  });

  it('actual/ contains the buggy heading "## Ierred goals" (RED-state anchor for pattern 1)', async () => {
    const actual = await read(ACTUAL_LANDSCAPE);
    expect(actual).toContain('## Ierred goals & uncertainties');
  });

  it('actual/ contains the buggy heading "## ints" (RED-state anchor for pattern 2)', async () => {
    const actual = await read(ACTUAL_PROJECT);
    expect(/^## ints$/m.test(actual)).toBe(true);
  });
});

// ─── Layer B: embedSection helper — RED until S1.t5 ───────────────────────

describe('synthesizer Layer B: embedSection helper (RED until M4.5.E7.S1.t5)', () => {
  it('embedSection helper is exported from tools/lib/landscape.js', async () => {
    const landscape = await import('../tools/lib/landscape.js');
    expect(typeof landscape.embedSection, 'embedSection is not exported from landscape.js — implement in S1.t5').toBe('function');
  });
});

// ─── Layer B: init.md template references embedSection (S1.t6) ────────────

describe('synthesizer Layer B: init.md template wiring (S1.t6)', () => {
  it('commands/init.md Step 3 references embedSection for the structure-scan Source Tree', async () => {
    const initMd = await read(new URL('../commands/init.md', import.meta.url).pathname);
    expect(initMd).toContain("embedSection(scans.structure, 'Source Tree (depth-3)')");
    expect(initMd.match(/embedSection/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

// ─── Layer C: prompt-template lint against commands/init.md (S1.t7) ───────
//
// Property tests asserting shape properties of the template that, if
// violated, induce the M4.5.E7 R1 prose-anti-patterns (mostly 4, 5, 6).
// Patterns 1 + 2 (heading drops) are Layer B; patterns 5 + 6 (sentence /
// code-fence boundary + mid-word truncation in dense prose) are this layer.

import {
  loadTemplate,
  findLongLines,
  findSentenceBeforeFence,
  findShortHeadings,
  findDoubleBraces,
} from './helpers/template-lint.js';

const MAX_LINE_LEN = 500;
const MIN_HEADING_LEN = 8;
const SHORT_HEADING_WHITELIST = new Set(['Vision', 'Scope', 'Notes']);

describe('synthesizer Layer C: commands/init.md prompt-template lint', () => {
  it('no template line exceeds 500 chars (catches pattern-6-style dense-prose truncation)', async () => {
    const { lines } = await loadTemplate('commands/init.md');
    const violations = findLongLines(lines, MAX_LINE_LEN);
    expect(
      violations,
      `Found ${violations.length} lines > ${MAX_LINE_LEN} chars:\n${violations
        .map((v) => `  L${v.line} (${v.length} chars): ${v.preview}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('no template line places a sentence-terminator before a fenced-code opener (catches pattern 5)', async () => {
    const { lines } = await loadTemplate('commands/init.md');
    const violations = findSentenceBeforeFence(lines);
    expect(
      violations,
      `Found ${violations.length} sentence-then-fence-on-same-line:\n${violations
        .map((v) => `  L${v.line}: ${v.preview}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('no h2 heading literal in template is shorter than 8 chars (excluding Vision/Scope/Notes)', async () => {
    const { lines } = await loadTemplate('commands/init.md');
    const violations = findShortHeadings(lines, MIN_HEADING_LEN, SHORT_HEADING_WHITELIST);
    expect(
      violations,
      `Found ${violations.length} suspiciously-short h2 headings:\n${violations
        .map((v) => `  L${v.line}: "${v.heading}" (${v.heading.length} chars)`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('no template line contains double-braces ({{ or }}) — single-brace placeholders only', async () => {
    const { lines } = await loadTemplate('commands/init.md');
    const violations = findDoubleBraces(lines);
    expect(
      violations,
      `Found ${violations.length} double-brace patterns:\n${violations
        .map((v) => `  L${v.line}: ${v.preview}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('lint helpers also apply cleanly to commands/discuss.md and commands/calibrate.md (sibling-template coverage)', async () => {
    for (const rel of ['commands/discuss.md', 'commands/calibrate.md']) {
      const { lines } = await loadTemplate(rel);
      expect(findDoubleBraces(lines), `${rel}: double-braces`).toEqual([]);
      expect(findSentenceBeforeFence(lines), `${rel}: sentence-then-fence`).toEqual([]);
    }
  });
});
