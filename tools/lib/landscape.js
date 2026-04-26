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
  // Without the `m` flag, `$` is end-of-string. With the inline `(?m:...)`
  // group we anchor only the headings (h2 must start its own line) while
  // letting `$` in the closing lookahead mean end-of-input.
  const pattern = new RegExp(
    `(?m:^##\\s+${esc}\\s*$)\\n([\\s\\S]*?)(?=(?m:^##\\s+)|$)`,
    'i'
  );
  const match = content.match(pattern);
  if (!match) return null;
  return match[1].trim();
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
