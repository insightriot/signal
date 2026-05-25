import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findJargonHits } from './helpers/template-lint.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FACTS_PATH = join(ROOT, 'references/facts.md');
const README_PATH = join(ROOT, 'README.md');
const SECURITY_PATH = join(ROOT, 'SECURITY.md');

const readme = readFileSync(README_PATH, 'utf-8');
const facts = readFileSync(FACTS_PATH, 'utf-8');
const securityExists = existsSync(SECURITY_PATH);
const security = securityExists ? readFileSync(SECURITY_PATH, 'utf-8') : '';

function extractFact(label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`);
  const m = facts.match(re);
  return m ? m[1].trim() : null;
}

const NODE_VERSION = extractFact('Node\\.js');
const CLAUDE_CODE_VERSION = extractFact('Claude Code');
const TEST_COUNT = extractFact('Test count');
const LICENSE = extractFact('License');

/**
 * Cross-file consistency tests — pins the fact-string contract between
 * references/facts.md (source-of-truth) and user-facing docs that cite
 * its values. Also lints SECURITY.md (when it lands in S2.t5) for
 * Signal workflow vocabulary that strangers shouldn't have to learn to
 * file a security report.
 *
 * Pinned RED at S2.t2 before S2.t3-t5 land. Each subsequent task
 * turns the corresponding assertion(s) GREEN.
 */

describe('cross-file consistency: references/facts.md <-> README + SECURITY.md', () => {
  it('facts.md parses (Node, Claude Code, Test count, License)', () => {
    expect(NODE_VERSION).toBeTruthy();
    expect(CLAUDE_CODE_VERSION).toBeTruthy();
    expect(TEST_COUNT).toBeTruthy();
    expect(LICENSE).toBeTruthy();
  });

  it('1. README cites the canonical Node.js version', () => {
    expect(readme).toContain(`Node.js ${NODE_VERSION}`);
  });

  it('2. README cites the canonical Claude Code version', () => {
    expect(readme).toContain(`Claude Code ${CLAUDE_CODE_VERSION}`);
  });

  it('3. If README or SECURITY.md cite a test count, it matches facts.md', () => {
    // Vacuous-pass shape: only enforce if a doc actually mentions a count.
    const countRe = /\b(\d{3,4})\s+tests?\b/g;
    for (const [doc, content] of [['README.md', readme], ['SECURITY.md', security]]) {
      if (!content) continue;
      const hits = [...content.matchAll(countRe)].map((m) => m[1]);
      for (const hit of hits) {
        expect(hit, `${doc} mentions "${hit} tests" but facts.md says ${TEST_COUNT}`).toBe(TEST_COUNT);
      }
    }
  });

  it('4. If README mentions a runtime-dependency count, it is "1" / "one"', () => {
    // Vacuous-pass shape (no dep-count mention is added by this Epic; this
    // test exists to prevent drift if a future doc edit adds one).
    const depMentionRe = /\b(one|1|two|2|three|3|several|many)\s+runtime\s+dependenc/i;
    const m = readme.match(depMentionRe);
    if (m) {
      expect(m[1].toLowerCase()).toMatch(/^(one|1)$/);
    }
  });

  it.skipIf(!securityExists)('5. SECURITY.md contains no Signal workflow vocabulary', () => {
    const jargonRe = /\b(Tier|Phase|Slice|Wave|Epic|Milestone)\b|\/sig:/;
    const hits = findJargonHits(security, jargonRe);
    expect(
      hits,
      'SECURITY.md leaks Signal workflow vocabulary — strangers should not need to learn it to file a security report:\n' +
        hits.map((h) => `  L${h.line}: ${h.match} — ${h.preview}`).join('\n'),
    ).toEqual([]);
  });

  it('6. README has "## Privacy & telemetry" section', () => {
    expect(readme).toMatch(/^## Privacy & telemetry$/m);
  });

  it('7. README has "### Requirements & compatibility" section nested under Install', () => {
    expect(readme).toMatch(/^### Requirements & compatibility$/m);
  });

  it('8. README links to docs/map/index.html', () => {
    expect(readme).toContain('docs/map/index.html');
  });

  it('9. README has "## Open Source Origins" section with 9 source-repo URLs', () => {
    expect(readme).toMatch(/^## Open Source Origins$/m);

    const expectedRepoUrls = [
      'https://github.com/gsd-build/get-shit-done',
      'https://github.com/addyosmani/agent-skills',
      'https://github.com/garrytan/gstack',
      'https://github.com/phuryn/pm-skills',
      'https://github.com/obra/superpowers',
      'https://github.com/everyinc/compound-engineering',
      'https://github.com/OthmanAdi/planning-with-files',
      'https://github.com/Yeachan-Heo/oh-my-claudecode',
      'https://github.com/Tibsfox/gsd-skill-creator',
    ];
    for (const url of expectedRepoUrls) {
      expect(readme, `README missing source-repo URL: ${url}`).toContain(url);
    }
  });
});
