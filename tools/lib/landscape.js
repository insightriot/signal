import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PLANNING_DIR = '.planning';
const SCAN_DIR = 'scan';
const SCANNERS = ['stack', 'structure', 'activity', 'quality'];

/**
 * Read a single scanner's output file.
 * @param {string} baseDir - project root
 * @param {string} name - one of 'stack' | 'structure' | 'activity' | 'quality'
 * @returns {Promise<string|null>} file content, or null if absent
 */
export async function readScan(baseDir, name) {
  if (!SCANNERS.includes(name)) {
    throw new Error(
      `Invalid scanner name: ${name}. Must be one of: ${SCANNERS.join(', ')}`
    );
  }
  const path = join(baseDir, PLANNING_DIR, SCAN_DIR, `${name}.md`);
  if (!existsSync(path)) return null;
  return await readFile(path, 'utf-8');
}

/**
 * Read all 4 scanner outputs.
 * Missing scans surface as null entries; the synthesizer is expected to degrade
 * gracefully (mark sections as "scan output unavailable") rather than crash.
 * @param {string} baseDir
 * @returns {Promise<{stack: string|null, structure: string|null, activity: string|null, quality: string|null}>}
 */
export async function readAllScans(baseDir) {
  const results = {};
  for (const name of SCANNERS) {
    results[name] = await readScan(baseDir, name);
  }
  return results;
}

/**
 * Extract the body of an h2 markdown section by exact heading text.
 * Matches `## {heading}` and returns text up to (but not including) the next
 * `## ` line or end-of-file. Heading match is case-insensitive; body is trimmed.
 *
 * Returns null if the heading is not found OR content is null/empty.
 * Returns '' (empty string) if the section exists but is empty.
 *
 * @param {string|null} content - markdown content
 * @param {string} heading - exact heading text (without leading `## `)
 * @returns {string|null}
 */
export function extractSection(content, heading) {
  if (!content) return null;
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Anchor h2 headings to the start of a line manually (start-of-input or
  // post-newline) instead of using the `(?m:...)` inline modifier — that
  // syntax is only available on V8 12.7+ (Node 23+) and we target Node 22+.
  // Without the `m` flag, the trailing `$` continues to mean end-of-input.
  // `[ \t]*` (not `\s*`) so the trailing-whitespace allowance can't eat the
  // newline at the end of the heading line and accidentally swallow blank
  // lines belonging to the next section.
  const pattern = new RegExp(
    `(?:^|\\n)##\\s+${esc}[ \\t]*(?:\\n|$)([\\s\\S]*?)(?=\\n##\\s+|$)`,
    'i'
  );
  const match = content.match(pattern);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Embed the body of an h2 markdown section verbatim.
 *
 * Like extractSection, but preserves interior whitespace, fenced-code blocks,
 * tables, and bullets exactly as they appear in the source. The only whitespace
 * mutation is stripping trailing whitespace at the section boundary (so the
 * caller doesn't get the next heading's leading newlines).
 *
 * Designed for /sig:init Step 3's "embed verbatim" instructions: the
 * synthesizer template asks for the structure scan's Source Tree table to
 * appear unchanged in LANDSCAPE.md. Asking the LLM to "embed verbatim" is
 * what produced R1's character-drop bugs (M4.5.E7 patterns 3 + 4); this
 * helper takes the LLM out of the loop for that copy.
 *
 * Returns null if the heading is not found or content is null/empty.
 *
 * @param {string|null} content - markdown content (typically a scan output)
 * @param {string} heading - exact heading text (without leading `## `)
 * @returns {string|null}
 */
export function embedSection(content, heading) {
  if (!content) return null;
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:^|\\n)##\\s+${esc}[ \\t]*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    'i'
  );
  const match = content.match(pattern);
  if (!match) return null;
  // Strip trailing whitespace only (so the caller doesn't inherit the
  // next-heading's leading newlines), but preserve interior content verbatim.
  return match[1].replace(/\s+$/, '');
}

/**
 * Extract a labeled field from markdown content. Matches common shapes:
 *   - **Label:** value
 *   - **Label**: value
 *   **Label:** value
 *   - Label: value
 *   Label: value
 *
 * Returns the value (trimmed) or null if the label is not found.
 * Multiple matches: returns the first.
 *
 * Approach: normalize markdown bold/italic markers out of the content
 * before matching. The label is matched plainly against `Label: value`
 * after normalization. Avoids the brittleness of trying to capture
 * every variation of `**Label:**` syntax in a single regex.
 *
 * @param {string|null} content
 * @param {string} label - the label without trailing colon (case-sensitive)
 * @returns {string|null}
 */
export function extractField(content, label) {
  if (!content) return null;
  const normalized = content
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^\\s*(?:-\\s+)?${esc}\\s*:\\s*(.+?)\\s*$`,
    'm'
  );
  const match = normalized.match(pattern);
  if (!match) return null;
  return match[1].trim();
}

export { SCANNERS, SCAN_DIR, PLANNING_DIR };
// embedSection is exported inline at its definition above.
