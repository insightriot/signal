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
const DEMO_SCRIPT = join(DOCS_DIR, 'demo-script.md');
const TESTER_BRIEF = join(DOCS_DIR, 'tester-brief.md');

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

  it('states the accurate privacy claim — no over-claim drift (M4.5.E10.S5.t3)', () => {
    const content = readFileSync(LAUNCH_POST, 'utf8');
    // Must NOT resurrect the old over-claim: Signal DOES make two network calls
    // (the GitHub version check + the origin-drift git fetch), so "no network
    // calls beyond Anthropic's API" is false (SD3/AD3).
    expect(content).not.toContain('no network calls beyond');
    // Must state the two real, data-free calls accurately + consistently with
    // the README's Privacy section.
    expect(content).toMatch(/version check/i);
    expect(content).toMatch(/git fetch/i);
    expect(content).toMatch(/your own/i);
    expect(content).toMatch(/no analytics, no telemetry/i);
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

describe('docs/demo-script.md (M4.5.E5 S1.t3 — FR2)', () => {
  it('exists', () => {
    expect(existsSync(DEMO_SCRIPT)).toBe(true);
  });

  it('states the install-mode assumptions (macOS + marketplace install)', () => {
    // Per research: a dev-checkout recording shows fallback agent names +
    // unset CLAUDE_PLUGIN_ROOT, not the install path a peer experiences.
    const content = readFileSync(DEMO_SCRIPT, 'utf8');
    expect(content).toMatch(/macOS/);
    expect(content).toMatch(/marketplace install/i);
  });

  it('records the calibrate-before-status command sequence', () => {
    // A clean /sig:init writes STATE but not PROFILE; /sig:status reads PROFILE,
    // so /sig:calibrate must come before /sig:status in the recorded sequence.
    const content = readFileSync(DEMO_SCRIPT, 'utf8');
    expect(content).toContain('/sig:init');
    expect(content).toContain('/sig:calibrate');
    expect(content).toContain('/sig:status');
  });

  it('has no dead relative links', () => {
    assertLinksResolve(DEMO_SCRIPT);
  });
});

describe('docs/tester-brief.md (M4.5.E5 S2.t6 — FR3 + FR4)', () => {
  it('exists', () => {
    expect(existsSync(TESTER_BRIEF)).toBe(true);
  });

  it('embeds a copy-paste friction-log template (paired TEMPLATE markers)', () => {
    // Mirrors references/retrospective-template.md: a copy-paste block delimited
    // by `<!-- TEMPLATE: friction-log -->` / `<!-- /TEMPLATE: friction-log -->`
    // so a tester can lift it verbatim into their own log.
    const content = readFileSync(TESTER_BRIEF, 'utf8');
    expect(content).toContain('<!-- TEMPLATE: friction-log -->');
    expect(content).toContain('<!-- /TEMPLATE: friction-log -->');
  });

  it('carries the Mac-only caveat (matches README.md wording)', () => {
    // README.md: "Verified on macOS; Linux/WSL untested". The brief must set the
    // same expectation so a peer on Linux/WSL self-selects out before testing.
    const content = readFileSync(TESTER_BRIEF, 'utf8');
    expect(content).toMatch(/macOS/);
    expect(content).toMatch(/Linux(\s*\/\s*WSL|\s+and\s+WSL)/i);
    expect(content).toMatch(/untested/i);
  });

  it('has no dead relative links', () => {
    assertLinksResolve(TESTER_BRIEF);
  });
});
