// Tiny lint helper for prompt-template markdown files (commands/*.md).
//
// Used by tests/synthesizer-regression.test.js to enforce shape properties
// against commands/init.md that catch the prose-anti-patterns producing
// M4.5.E7 R1 patterns 4, 5, 6. Deliberately minimal — ~50 LOC, no deps,
// returns plain arrays of violations the test can format into messages.

import { readFile } from 'node:fs/promises';

/**
 * Read a commands/*.md file from the repo root.
 * @param {string} relPath - e.g. 'commands/init.md'
 * @returns {Promise<{path: string, content: string, lines: string[]}>}
 */
export async function loadTemplate(relPath) {
  const path = new URL('../../' + relPath, import.meta.url).pathname;
  const content = await readFile(path, 'utf8');
  return { path, content, lines: content.split('\n') };
}

/**
 * Find lines exceeding maxLen characters.
 * Long template lines correlate with LLM truncation under dense generation —
 * pattern 6 in R1 (the `contributoiteria.` mid-word drop) is the canonical
 * symptom.
 *
 * @param {string[]} lines
 * @param {number} maxLen
 * @returns {{line: number, length: number, preview: string}[]}
 */
export function findLongLines(lines, maxLen) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > maxLen) {
      out.push({
        line: i + 1,
        length: lines[i].length,
        preview: lines[i].slice(0, 70) + '…',
      });
    }
  }
  return out;
}

/**
 * Find sentence-terminators (. ! ?) followed by a triple-backtick fence
 * opener on the same line (no blank-line gap). Pattern 5 in R1 — `).git
 * fetch --unshallow\`` — emerges when the template doesn't provide enough
 * structural separation between prose and code, and the model collapses the
 * boundary.
 *
 * @param {string[]} lines
 * @returns {{line: number, preview: string}[]}
 */
export function findSentenceBeforeFence(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/[.!?]\s*```/.test(lines[i])) {
      out.push({ line: i + 1, preview: lines[i].slice(0, 70) + '…' });
    }
  }
  return out;
}

/**
 * Find h2 headings shorter than minLen chars (excluding a whitelist of
 * legitimately-short Signal headings like Vision / Scope / Notes). Patterns
 * 1 + 2 in R1 (`## Ierred goals`, `## ints`) are the symptom: if a template
 * literal heading is itself short, it's hard to distinguish "this is what
 * was meant" from "characters got dropped."
 *
 * @param {string[]} lines
 * @param {number} minLen
 * @param {Set<string>} whitelist - heading texts that are OK to be short
 * @returns {{line: number, heading: string}[]}
 */
export function findShortHeadings(lines, minLen, whitelist = new Set()) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## (.+)$/);
    if (!m) continue;
    const heading = m[1].trim();
    if (heading.length < minLen && !whitelist.has(heading)) {
      out.push({ line: i + 1, heading });
    }
  }
  return out;
}

/**
 * Find double-braces (`{{` or `}}`) which are unambiguously typos in
 * Signal's template syntax (we use single-brace `{placeholder}` and never
 * Mustache-style doubles). Single-level nesting like
 * `{contents of agents/scanners/{name}-scanner.md verbatim}` is OK.
 *
 * @param {string[]} lines
 * @returns {{line: number, preview: string}[]}
 */
export function findDoubleBraces(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\{\{|\}\}/.test(lines[i])) {
      out.push({ line: i + 1, preview: lines[i].slice(0, 70) + '…' });
    }
  }
  return out;
}

/**
 * Find each line in `content` that matches `jargonRegex`. Used by
 * tests/cross-file-consistency.test.js to enforce that user-facing docs
 * (notably SECURITY.md, which lands in M4.5.E3.S2.t5) don't leak
 * Signal's internal workflow vocabulary (Tier / Phase / Slice / Wave /
 * Epic / Milestone, or any /sig:* command reference).
 *
 * @param {string} content - full file contents
 * @param {RegExp} jargonRegex - pattern to match per line
 * @returns {{line: number, match: string, preview: string}[]}
 */
export function findJargonHits(content, jargonRegex) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(jargonRegex);
    if (m) {
      out.push({
        line: i + 1,
        match: m[0],
        preview: lines[i].slice(0, 70) + (lines[i].length > 70 ? '…' : ''),
      });
    }
  }
  return out;
}
