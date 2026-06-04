import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// Guard for the M4.5.E5 launch assets (launch post, demo script, tester brief).
//
// Docs-Epic Nyquist posture (per M4.5.E5-VALIDATION.md): the verifiable ACs are
// mechanical — link-integrity (AC8), launch-post word budget (AC1), and the
// presence of load-bearing, accuracy-critical strings (the exact privacy
// sentence, the Mac-only caveat, the demo's install-mode assumptions). Prose
// quality / accuracy / usability are manual-acknowledged at VERIFY.
//
// Each slice adds its block + the doc that satisfies it in the same slice, so
// the root suite is green at every slice checkpoint.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DOCS_DIR = join(REPO_ROOT, 'docs');

const LAUNCH_POST = join(DOCS_DIR, 'launch-post.md');

// Count whitespace-separated word tokens in a markdown body.
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Extract every markdown link target [text](url) from a doc, dropping any
// "title" and #anchor, and return the relative (on-disk) ones.
function relativeLinkTargets(content) {
  const targets = [];
  const re = /\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    let url = m[1].trim().split(/\s+/)[0]; // drop optional "title"
    url = url.split('#')[0]; // drop anchor
    if (!url) continue;
    if (/^(https?:|mailto:|tel:)/i.test(url)) continue; // external — not on-disk
    targets.push(url);
  }
  return targets;
}

// Assert every relative link in `absDocPath` resolves to an existing file/dir.
function assertLinksResolve(absDocPath) {
  const content = readFileSync(absDocPath, 'utf8');
  const docDir = dirname(absDocPath);
  const dead = relativeLinkTargets(content).filter(
    (rel) => !existsSync(resolve(docDir, rel)),
  );
  expect(dead, `dead relative links in ${absDocPath}`).toEqual([]);
}

describe('docs/launch-post.md (M4.5.E5 S1.t2 — FR1)', () => {
  it('exists', () => {
    expect(existsSync(LAUNCH_POST)).toBe(true);
  });

  it('is within the ~600–800 word budget (tolerant band 550–850)', () => {
    const words = wordCount(readFileSync(LAUNCH_POST, 'utf8'));
    expect(words).toBeGreaterThanOrEqual(550);
    expect(words).toBeLessThanOrEqual(850);
  });

  it('uses the exact privacy sentence from the README (no over-claim drift)', () => {
    const content = readFileSync(LAUNCH_POST, 'utf8');
    expect(content).toContain(
      'no network calls beyond what Claude Code itself makes to Anthropic',
    );
  });

  it('links to the landscape analysis, the comparison page, and the worked example', () => {
    const content = readFileSync(LAUNCH_POST, 'utf8');
    expect(content).toContain('analysis/REPO-ANALYSIS.md');
    expect(content).toContain('vs.md');
    expect(content).toContain('examples/url-shortener');
  });

  it('has no dead relative links', () => {
    assertLinksResolve(LAUNCH_POST);
  });
});
