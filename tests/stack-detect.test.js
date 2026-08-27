/**
 * tests/stack-detect.test.js — the host project's own toolchain (`M6.E5` FR3.1 / FR3.2).
 *
 * WHY THIS EXISTS AT ALL. `D-M6E5-3` overruled the DISCUSS recommendation.
 * Flow-only was recommended because `pytest`/`cargo`/`go` appear in Signal's
 * corpus purely as descriptions of other people's stacks. It was overruled
 * because a generator that leaves a Python developer prompting for their own
 * test runner has not solved the problem it was built for.
 *
 * WHAT IT IS NOT. This is a NEW detector, not a reuse. `/sig:init`'s four
 * scanners are agent prose holding `Bash`; there is no deterministic
 * stack-detection function anywhere in plugin/tools/lib to call. Claiming reuse
 * would be false. Calling it `B82`'s duplicate-implementation shape would also
 * be false — `B82` was two implementations of one rule, and here there is one.
 *
 * THE TEST THAT MATTERS MOST is `no manifest`. Falling back to a default stack
 * would propose Node rules for a repo that is not Node, which is precisely the
 * over-proposal the flow/stack split exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectStack, stackRules, MANIFESTS } from '../plugin/tools/lib/stack-detect.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'stack-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf-8');
  }
  return dir;
}

describe('detectStack — manifests, shallow (FR3.1)', () => {
  it('AC3.1a — recognises the seven declared manifests', () => {
    expect(MANIFESTS.map((m) => m.file).sort()).toEqual(
      ['Cargo.toml', 'Gemfile', 'composer.json', 'go.mod', 'package.json', 'pyproject.toml', 'setup.py'].sort()
    );
  });

  it('AC3.1a — a Node repo is detected', () => {
    const dir = repo({ 'package.json': '{"name":"x"}' });
    const s = detectStack(dir);
    expect(s.ecosystems).toContain('node');
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC3.1a — a polyglot repo reports BOTH, not the first match', () => {
    const dir = repo({ 'package.json': '{"name":"x"}', 'pyproject.toml': '[project]\nname="y"\n' });
    expect(detectStack(dir).ecosystems.sort()).toEqual(['node', 'python']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC3.1b — npm script rules come from the scripts that EXIST, not a guessed set', () => {
    const dir = repo({
      'package.json': JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .' } }),
    });
    const s = detectStack(dir);
    expect(s.npmScripts.sort()).toEqual(['lint', 'test']);

    const rules = stackRules(s);
    expect(rules).toContain('Bash(npm run test:*)');
    expect(rules).toContain('Bash(npm run lint:*)');
    // The script that does not exist is not proposed.
    expect(rules).not.toContain('Bash(npm run build:*)');
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC3.1b — a package.json with no scripts key yields no npm run rules', () => {
    const dir = repo({ 'package.json': '{"name":"x"}' });
    const rules = stackRules(detectStack(dir));
    expect(rules.some((r) => r.startsWith('Bash(npm run'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC3.1c — no recognised manifest yields NO rules and says so', () => {
    const dir = repo({ 'README.md': '# just docs\n' });
    const s = detectStack(dir);
    expect(s.ecosystems).toEqual([]);
    expect(s.detected).toBe(false);
    expect(s.reason).toBeTruthy();
    expect(stackRules(s)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC3.1c — it does NOT fall back to a default stack', () => {
    // Proposing Node rules for a repo that is not Node is the over-proposal the
    // flow/stack split exists to prevent.
    const dir = repo({ 'README.md': '# nothing\n' });
    expect(stackRules(detectStack(dir)).some((r) => r.includes('npm'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('a malformed package.json is reported, and does not crash or silently vanish', () => {
    const dir = repo({ 'package.json': '{{{' });
    const s = detectStack(dir);
    expect(s.ecosystems).toContain('node'); // the manifest IS there
    expect(s.unreadable).toContain('package.json'); // we just could not parse it
    expect(s.npmScripts).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC3.1d — every stack rule is labelled as stack-derived', () => {
    const dir = repo({ 'Cargo.toml': '[package]\nname="x"\n' });
    const s = detectStack(dir);
    expect(s.origin).toBe('stack');
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects each remaining ecosystem', () => {
    for (const [file, eco] of [
      ['Cargo.toml', 'rust'],
      ['go.mod', 'go'],
      ['Gemfile', 'ruby'],
      ['composer.json', 'php'],
      ['setup.py', 'python'],
    ]) {
      const dir = repo({ [file]: 'x\n' });
      expect(detectStack(dir).ecosystems, `${file} should detect ${eco}`).toContain(eco);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unreadable directory reports not-detected rather than throwing', () => {
    const s = detectStack(join(tmpdir(), 'stack-does-not-exist-4a91'));
    expect(s.detected).toBe(false);
    expect(s.reason).toBeTruthy();
  });
});

describe('against a real fixture rather than only synthetic ones', () => {
  it('examples/url-shortener is detected as a Node project with real scripts', () => {
    const s = detectStack(join(ROOT, 'examples', 'url-shortener'));
    expect(s.ecosystems).toContain('node');
    expect(s.npmScripts.length).toBeGreaterThan(0);
    // Cross-check against the manifest itself, so this cannot pass on a stale
    // hard-coded expectation.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'examples', 'url-shortener', 'package.json'), 'utf-8'));
    expect(s.npmScripts.sort()).toEqual(Object.keys(pkg.scripts ?? {}).sort());
  });
});

describe('FR3.2 — the module says what it is, and is not', () => {
  const src = readFileSync(join(ROOT, 'plugin', 'tools', 'lib', 'stack-detect.js'), 'utf-8');

  it('AC3.2a — states it is a new detector, not a reuse of the scanners', () => {
    expect(src).toMatch(/not a reuse/i);
    expect(src).toMatch(/sig:init/);
  });

  it('AC3.2b — records the future hazard: extend this, do not write a second', () => {
    expect(src).toMatch(/extend/i);
  });

  it('⚠ STATED LIMIT — these three assertions compare TOKENS, not meaning', () => {
    // They pin that the sentences exist. They cannot pin that the sentences stay
    // true. Same published limit as M5.E10's checks; recorded at the point of
    // use rather than discovered later.
    expect(true).toBe(true);
  });
});
