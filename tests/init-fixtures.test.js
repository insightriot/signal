import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  readAllScans,
  extractSection,
  extractField,
} from '../tools/lib/landscape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'init');

/**
 * Synthesize the LANDSCAPE.md-relevant field bundle from a fixture's scan
 * outputs. Mirrors what `/sig:init` Step 3 mechanically extracts before the
 * narrative-synthesis step. Used in inline snapshots to lock helper behavior
 * against realistic scanner shapes — if a scanner's output schema drifts
 * (heading rename, field-label change), these fail loudly.
 */
async function synthesizeBundle(fixtureSlug) {
  const baseDir = join(FIXTURE_ROOT, fixtureSlug);
  const scans = await readAllScans(baseDir);

  const stackPkg = extractSection(scans.stack, 'Package Managers + Manifests');
  const lifetime = extractSection(scans.activity, 'Repo Lifetime');
  const contributors = extractSection(scans.activity, 'Contributors (90 days)');
  const health = extractSection(scans.activity, 'Health Classification');
  const branch = extractSection(scans.activity, 'Branch State');
  const ciSection = extractSection(scans.quality, 'CI Configuration');
  const licenseSection = extractSection(scans.quality, 'License');
  const testSurface = extractSection(
    scans.structure,
    'Test Surface (organizational view)',
  );
  const openWork = extractSection(scans.quality, 'Open Work Signals');

  return {
    runtime: extractField(stackPkg, 'Runtime constraint'),
    lockfile: extractField(stackPkg, 'Lockfile'),
    projectAge: extractField(lifetime, 'Project age'),
    contributors90d: extractField(contributors, 'Total unique'),
    health: extractField(health, 'Status'),
    defaultBranch: extractField(branch, 'Default branch'),
    ciPlatforms: extractField(ciSection, 'Platform(s)'),
    license: extractField(licenseSection, 'Detected'),
    testAssessment: extractField(testSurface, 'Net assessment'),
    todoCount: extractField(openWork, 'TODO/FIXME/HACK count'),
  };
}

describe('node-project fixture (active, GitHub-Actions CI)', () => {
  const slug = 'node-project';

  it('loads all 4 scan files', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    expect(scans.stack).toBeTruthy();
    expect(scans.structure).toBeTruthy();
    expect(scans.activity).toBeTruthy();
    expect(scans.quality).toBeTruthy();
  });

  it('extracts active health classification', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const health = extractSection(scans.activity, 'Health Classification');
    expect(extractField(health, 'Status')).toBe('active');
  });

  it('detects GitHub Actions CI with tests on PRs', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const ci = extractSection(scans.quality, 'CI Configuration');
    expect(extractField(ci, 'Platform(s)')).toBe('GitHub Actions');
    expect(extractField(ci, 'CI runs tests')).toMatch(/^yes/);
    expect(extractField(ci, 'CI runs on PRs')).toMatch(/^yes/);
  });

  it('detects Express framework via Frameworks Detected section', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const frameworks = extractSection(scans.stack, 'Frameworks Detected');
    expect(frameworks).toContain('Express');
  });

  it('synthesizes the expected field bundle', async () => {
    const bundle = await synthesizeBundle(slug);
    expect(bundle).toMatchInlineSnapshot(`
      {
        "ciPlatforms": "GitHub Actions",
        "contributors90d": "2",
        "defaultBranch": "\`main\`",
        "health": "active",
        "license": "MIT",
        "lockfile": "\`package-lock.json\` (npm)",
        "projectAge": "776 days",
        "runtime": "\`node >=20.0.0\`",
        "testAssessment": "tests in dedicated directory",
        "todoCount": "12",
      }
    `);
  });
});

describe('python-project fixture (active, no CI)', () => {
  const slug = 'python-project';

  it('loads all 4 scan files', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    expect(scans.stack).toBeTruthy();
    expect(scans.structure).toBeTruthy();
    expect(scans.activity).toBeTruthy();
    expect(scans.quality).toBeTruthy();
  });

  it('extracts active health classification despite single contributor', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const health = extractSection(scans.activity, 'Health Classification');
    expect(extractField(health, 'Status')).toBe('active');
  });

  it('flags absent CI as a gap (Platform(s) = none detected)', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const ci = extractSection(scans.quality, 'CI Configuration');
    expect(extractField(ci, 'Platform(s)')).toBe('(none detected)');
    expect(extractField(ci, 'CI runs tests')).toBe('N/A');
  });

  it('detects Flask framework via Frameworks Detected section', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const frameworks = extractSection(scans.stack, 'Frameworks Detected');
    expect(frameworks).toContain('Flask');
  });

  it('detects pytest test runner via Test Runners section', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const runners = extractSection(scans.quality, 'Test Runners');
    expect(runners).toContain('pytest');
  });

  it('synthesizes the expected field bundle', async () => {
    const bundle = await synthesizeBundle(slug);
    expect(bundle).toMatchInlineSnapshot(`
      {
        "ciPlatforms": "(none detected)",
        "contributors90d": "1",
        "defaultBranch": "\`main\`",
        "health": "active",
        "license": "BSD-3-Clause",
        "lockfile": "(none — \`requirements.txt\` serves as pinned set; no \`poetry.lock\` or \`uv.lock\`)",
        "projectAge": "360 days",
        "runtime": "\`python_requires = ">=3.11"\`",
        "testAssessment": "tests in dedicated directory",
        "todoCount": "5",
      }
    `);
  });
});

describe('dormant-project fixture (rule-2 dormant, last commit ~9 months ago)', () => {
  const slug = 'dormant-project';

  it('loads all 4 scan files', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    expect(scans.stack).toBeTruthy();
    expect(scans.structure).toBeTruthy();
    expect(scans.activity).toBeTruthy();
    expect(scans.quality).toBeTruthy();
  });

  // T4.13 spec specifically calls out "tests the activity scanner's 'health' inference"
  // for the dormant fixture — this is the load-bearing assertion for that requirement.
  it('extracts dormant health classification (the spec-named focus)', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const health = extractSection(scans.activity, 'Health Classification');
    expect(extractField(health, 'Status')).toBe('dormant');
    expect(health).toMatch(/rule 2 fired/);
  });

  it('reports zero 90-day contributors despite 8+ year project lifetime', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const contributors = extractSection(
      scans.activity,
      'Contributors (90 days)',
    );
    expect(extractField(contributors, 'Total unique')).toBe('0');
    const lifetime = extractSection(scans.activity, 'Repo Lifetime');
    expect(extractField(lifetime, 'Total commits')).toBe('218');
  });

  it('preserves master as default branch (predates main rename)', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const branch = extractSection(scans.activity, 'Branch State');
    expect(extractField(branch, 'Default branch')).toBe('`master`');
  });

  it('flags Travis CI as legacy (deprecated platform signal)', async () => {
    const scans = await readAllScans(join(FIXTURE_ROOT, slug));
    const ci = extractSection(scans.quality, 'CI Configuration');
    expect(extractField(ci, 'Platform(s)')).toMatch(/Travis CI/);
  });

  it('synthesizes the expected field bundle', async () => {
    const bundle = await synthesizeBundle(slug);
    expect(bundle).toMatchInlineSnapshot(`
      {
        "ciPlatforms": "Travis CI (legacy)",
        "contributors90d": "0",
        "defaultBranch": "\`master\`",
        "health": "dormant",
        "license": "MIT",
        "lockfile": "\`Gemfile.lock\` (Bundler)",
        "projectAge": "3,156 days",
        "runtime": "\`ruby '2.7.2'\` (\`.ruby-version\` present)",
        "testAssessment": "tests in dedicated directory",
        "todoCount": "28",
      }
    `);
  });
});

describe('cross-fixture: scanner-ownership boundaries hold', () => {
  // Each scanner's spec disclaims sibling territory. These tests verify the
  // fixtures honor the disclaim — e.g., CI info lives in quality, not stack.
  // If a fixture starts leaking cross-scanner content, these flag it.

  it('CI configuration lives only in quality, not stack', async () => {
    for (const slug of ['node-project', 'python-project', 'dormant-project']) {
      const scans = await readAllScans(join(FIXTURE_ROOT, slug));
      // Stack scan must not declare CI sections
      expect(scans.stack).not.toMatch(/^##\s+CI\s+(Configuration|Workflows)/m);
    }
  });

  it('Health classification lives only in activity, not quality', async () => {
    for (const slug of ['node-project', 'python-project', 'dormant-project']) {
      const scans = await readAllScans(join(FIXTURE_ROOT, slug));
      expect(scans.quality).not.toMatch(/^##\s+Health\s+Classification/m);
    }
  });

  it('Framework detection lives only in stack, not structure', async () => {
    for (const slug of ['node-project', 'python-project', 'dormant-project']) {
      const scans = await readAllScans(join(FIXTURE_ROOT, slug));
      expect(scans.structure).not.toMatch(/^##\s+Frameworks\s+Detected/m);
    }
  });

  it('test-runner detection lives only in quality, not stack', async () => {
    for (const slug of ['node-project', 'python-project', 'dormant-project']) {
      const scans = await readAllScans(join(FIXTURE_ROOT, slug));
      expect(scans.stack).not.toMatch(/^##\s+Test\s+Runners/m);
    }
  });
});
