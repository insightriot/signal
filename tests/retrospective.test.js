// Tests for tools/lib/retrospective.js — core parsers (M4.5.E9.S1.t3).
//
// validateRetroContent + expectedRetroPath + isEpicCloseShip land in S1.t4
// and S1.t5; their tests live here too once those tasks ship.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseSections,
  getRequiredSections,
  deriveRetroPath,
  loadTemplate,
} from '../tools/lib/retrospective.js';

describe('parseSections', () => {
  it('identifies all ## headings and captures section bodies', () => {
    const md = `# Retro

## Timeline

Stuff happened.

## What surprised us

Many things.

Multiple paragraphs.

## Links

- a
- b
`;
    const result = parseSections(md);
    expect(result.headings).toEqual([
      '## Timeline',
      '## What surprised us',
      '## Links',
    ]);
    expect(result.sectionsByHeading['## Timeline'].trim()).toBe(
      'Stuff happened.',
    );
    expect(result.sectionsByHeading['## What surprised us'].trim()).toBe(
      'Many things.\n\nMultiple paragraphs.',
    );
    expect(result.sectionsByHeading['## Links'].trim()).toBe('- a\n- b');
  });

  it('returns empty arrays for content with no ## headings', () => {
    const md = `# Just a title\n\nSome prose.\n`;
    const result = parseSections(md);
    expect(result.headings).toEqual([]);
    expect(result.sectionsByHeading).toEqual({});
  });

  it('does NOT treat # (h1) or ### (h3) as section headings', () => {
    const md = `# Title

### Subsection

Body.

## Real heading

Real body.
`;
    const result = parseSections(md);
    expect(result.headings).toEqual(['## Real heading']);
  });
});

describe('getRequiredSections', () => {
  it('returns the locked SKETCH headings in canonical order', () => {
    expect(getRequiredSections('SKETCH')).toEqual([
      '## What worked',
      "## What didn't",
      '## Feed back into Signal',
    ]);
  });

  it('returns the locked FEATURE headings in canonical order', () => {
    expect(getRequiredSections('FEATURE')).toEqual([
      '## Timeline',
      '## What surprised us',
      "## What we'd do differently",
      '## What to feed back into Signal',
      '## Links',
    ]);
  });

  it('returns the locked SPIKE headings in canonical order', () => {
    expect(getRequiredSections('SPIKE')).toEqual([
      '## What we learned',
      '## Did the spike resolve its question',
      '## Next: build, abandon, or continue',
    ]);
  });

  it('returns the locked FULL headings in canonical order', () => {
    expect(getRequiredSections('FULL')).toEqual([
      '## Timeline',
      '## What changed mid-flight',
      '## What assumptions broke',
      '## What surprised us',
      "## What we'd do differently",
      '## What to feed back into Signal',
      '## Anti-rationalization moment',
      '## Links',
    ]);
  });

  it('throws on an unknown tier', () => {
    expect(() => getRequiredSections('TRIVIAL')).toThrow(/unknown tier/i);
  });
});

describe('deriveRetroPath', () => {
  it('handles M4.5.E{N} shape', () => {
    expect(deriveRetroPath('M4.5.E9')).toBe(
      '.planning/M4.5.E9-RETROSPECTIVE.md',
    );
    expect(deriveRetroPath('M4.5.E3')).toBe(
      '.planning/M4.5.E3-RETROSPECTIVE.md',
    );
  });

  it('handles M{N}.E{N} shape (future milestones like M5.E1)', () => {
    expect(deriveRetroPath('M5.E1')).toBe('.planning/M5.E1-RETROSPECTIVE.md');
    expect(deriveRetroPath('M6.E12')).toBe(
      '.planning/M6.E12-RETROSPECTIVE.md',
    );
  });

  it('throws on a malformed Epic ID', () => {
    expect(() => deriveRetroPath('')).toThrow();
    expect(() => deriveRetroPath('not-an-epic-id')).toThrow();
    expect(() => deriveRetroPath('E9')).toThrow();
  });
});

describe('loadTemplate', () => {
  let tempDir;
  const TEMPLATE_FIXTURE = `# Retrospective Templates

How to use prose.

<!-- TEMPLATE: SKETCH -->
## What worked

[FILL IN]

## What didn't

[FILL IN]

## Feed back into Signal

[FILL IN]
<!-- /TEMPLATE: SKETCH -->

Prose between.

<!-- TEMPLATE: FULL -->
## Timeline

[FILL IN]

## Links

[FILL IN]
<!-- /TEMPLATE: FULL -->
`;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-retro-tmpl-test-'));
    await mkdir(join(tempDir, 'references'), { recursive: true });
    await writeFile(
      join(tempDir, 'references', 'retrospective-template.md'),
      TEMPLATE_FIXTURE,
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('extracts the SKETCH template content between markers', async () => {
    const content = await loadTemplate('SKETCH', tempDir);
    expect(content).toContain('## What worked');
    expect(content).toContain("## What didn't");
    expect(content).toContain('## Feed back into Signal');
    // Marker lines themselves are stripped.
    expect(content).not.toContain('<!-- TEMPLATE: SKETCH -->');
    expect(content).not.toContain('<!-- /TEMPLATE: SKETCH -->');
    // Does not contain other tiers' content.
    expect(content).not.toContain('## Timeline');
  });

  it('extracts the FULL template content between markers', async () => {
    const content = await loadTemplate('FULL', tempDir);
    expect(content).toContain('## Timeline');
    expect(content).toContain('## Links');
    expect(content).not.toContain('## What worked');
  });

  it('throws when the requested tier is not found in the file', async () => {
    await expect(loadTemplate('FEATURE', tempDir)).rejects.toThrow(
      /TEMPLATE: FEATURE/,
    );
  });

  it('loads from the real references/retrospective-template.md', async () => {
    // Smoke test against the actual file shipped in S1.t2.
    const repoRoot = process.cwd();
    const full = await loadTemplate('FULL', repoRoot);
    const sections = parseSections(full).headings;
    expect(sections).toEqual(getRequiredSections('FULL'));
    const sketch = await loadTemplate('SKETCH', repoRoot);
    const sketchSections = parseSections(sketch).headings;
    expect(sketchSections).toEqual(getRequiredSections('SKETCH'));
  });
});
