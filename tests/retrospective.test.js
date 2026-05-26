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
  validateRetroContent,
  expectedRetroPath,
  isEpicCloseShip,
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

// --- Helpers for validateRetroContent tests ---

// Compose a well-formed retro file for a given tier. Each section gets a
// generous paragraph to satisfy minimum-byte thresholds.
function wellFormedRetro(tier) {
  const sections = getRequiredSections(tier);
  const longBody =
    'Concrete substantive paragraph that captures meaningful retrospective content. '.repeat(
      6,
    ) + '\n';
  return sections.map((h) => `${h}\n\n${longBody}`).join('\n');
}

// Compose a retro missing one required section.
function retroMissingSection(tier, indexToOmit) {
  const sections = getRequiredSections(tier);
  const longBody = 'Meaningful body content here. '.repeat(15) + '\n';
  return sections
    .filter((_, i) => i !== indexToOmit)
    .map((h) => `${h}\n\n${longBody}`)
    .join('\n');
}

// Compose a retro with all headings present but empty bodies.
function retroWithEmptyBodies(tier) {
  const sections = getRequiredSections(tier);
  return sections.map((h) => `${h}\n\n`).join('\n');
}

describe('validateRetroContent', () => {
  it('rejects empty content (AC6)', () => {
    const result = validateRetroContent('', 'FULL');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /empty/i.test(e))).toBe(true);
  });

  it('rejects whitespace-only content as empty', () => {
    const result = validateRetroContent('   \n\n\t\n  ', 'FULL');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /empty/i.test(e))).toBe(true);
  });

  it.each([
    ['SKETCH'],
    ['FEATURE'],
    ['SPIKE'],
    ['FULL'],
  ])(
    'rejects retro missing a required heading (%s tier, AC7)',
    (tier) => {
      const sections = getRequiredSections(tier);
      // Omit each section in turn — every position should produce an error.
      for (let i = 0; i < sections.length; i++) {
        const content = retroMissingSection(tier, i);
        const result = validateRetroContent(content, tier);
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) =>
            e.includes(sections[i]),
          ),
          `tier=${tier} missing="${sections[i]}" got errors=${JSON.stringify(result.errors)}`,
        ).toBe(true);
      }
    },
  );

  it.each([
    ['SKETCH'],
    ['FEATURE'],
    ['SPIKE'],
    ['FULL'],
  ])(
    'rejects retro with heading but empty body (%s tier, AC8)',
    (tier) => {
      const content = retroWithEmptyBodies(tier);
      const result = validateRetroContent(content, tier);
      expect(result.valid).toBe(false);
      // At least one error must reference an empty-body section.
      expect(
        result.errors.some((e) => /empty body|no body|empty section/i.test(e)),
      ).toBe(true);
    },
  );

  it.each([
    ['SKETCH'],
    ['FEATURE'],
    ['SPIKE'],
    ['FULL'],
  ])('accepts a well-formed retro (%s tier, AC9)', (tier) => {
    const content = wellFormedRetro(tier);
    const result = validateRetroContent(content, tier);
    expect(
      result.valid,
      `tier=${tier} errors=${JSON.stringify(result.errors)}`,
    ).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects content below the tier minimum-byte threshold', () => {
    // FULL has a substantially higher threshold than SKETCH; a content blob
    // that's all-headings + one-word bodies will satisfy heading + non-empty-
    // body checks but fail the byte floor.
    const tinyButValid = getRequiredSections('FULL')
      .map((h) => `${h}\n\nx\n`)
      .join('\n');
    const result = validateRetroContent(tinyButValid, 'FULL');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /threshold|byte|too short/i.test(e))).toBe(
      true,
    );
  });

  it('throws on unknown tier (delegates to getRequiredSections)', () => {
    expect(() => validateRetroContent('content', 'TRIVIAL')).toThrow(
      /unknown tier/i,
    );
  });
});

describe('expectedRetroPath', () => {
  it('returns derived path when current_epic is populated', () => {
    expect(expectedRetroPath({ current_epic: 'M4.5.E9' })).toBe(
      '.planning/M4.5.E9-RETROSPECTIVE.md',
    );
    expect(expectedRetroPath({ current_epic: 'M5.E1' })).toBe(
      '.planning/M5.E1-RETROSPECTIVE.md',
    );
  });

  it('returns null when current_epic is null / empty / undefined', () => {
    expect(expectedRetroPath({ current_epic: null })).toBe(null);
    expect(expectedRetroPath({ current_epic: '' })).toBe(null);
    expect(expectedRetroPath({ current_epic: undefined })).toBe(null);
    expect(expectedRetroPath({})).toBe(null);
  });

  it('returns null when state itself is null or missing', () => {
    expect(expectedRetroPath(null)).toBe(null);
    expect(expectedRetroPath(undefined)).toBe(null);
  });

  it('propagates malformed-epic errors from deriveRetroPath', () => {
    expect(() => expectedRetroPath({ current_epic: 'bogus' })).toThrow(
      /malformed/i,
    );
  });
});

describe('isEpicCloseShip', () => {
  // Realistic-shaped MILESTONE-4.5.md status table for fixture testing.
  const MILESTONE_CONTENT = `
| **Epic** | Status | Notes |
|---|---|---|
| E1 — Stranger-install path bulletproof | S1 shipped 2026-05-15 (v0.1.1); **S2 Phase A shipped 2026-05-19**; **S3–S5 ⏸ shelved 2026-05-24** | Notes... |
| E2 — \`/sig:add\` capture-and-route | S1 shipped 2026-05-14; S2–S5 pending | Notes... |
| **E3 — Public-facing docs rewrite** | **✓ shipped 2026-05-24 (v0.1.3 candidate)** | Notes... |
| E4 — Worked example + comparison page | pending | |
| **E9 — Retro Foundations** | DISCUSS + PLAN done 2026-05-25; EXECUTE in flight | Notes... |
`;

  it('returns true when Epic is fully shipped (Epic-close ceremony)', () => {
    expect(
      isEpicCloseShip({ current_epic: 'M4.5.E3' }, MILESTONE_CONTENT),
    ).toBe(true);
  });

  it('returns true when remaining slices are all shelved (regression: E1.S3-S5)', () => {
    // E1 has S1 shipped + S2 Phase A shipped + S3-S5 shelved. No pending.
    // The closing SHIP for E1 should enforce the retro.
    expect(
      isEpicCloseShip({ current_epic: 'M4.5.E1' }, MILESTONE_CONTENT),
    ).toBe(true);
  });

  it('returns false when other slices remain pending', () => {
    // E2 has S2-S5 pending. Mid-Epic SHIPs should NOT enforce retro.
    expect(
      isEpicCloseShip({ current_epic: 'M4.5.E2' }, MILESTONE_CONTENT),
    ).toBe(false);
  });

  it('returns false when the Epic has not shipped anything yet', () => {
    // E9 is in flight; no slice has shipped yet. Not a close ship.
    expect(
      isEpicCloseShip({ current_epic: 'M4.5.E9' }, MILESTONE_CONTENT),
    ).toBe(false);
  });

  it('returns false when Epic is entirely pending', () => {
    // E4 has no shipped slices.
    expect(
      isEpicCloseShip({ current_epic: 'M4.5.E4' }, MILESTONE_CONTENT),
    ).toBe(false);
  });

  it('returns false when current_epic is null / missing', () => {
    expect(isEpicCloseShip({ current_epic: null }, MILESTONE_CONTENT)).toBe(
      false,
    );
    expect(isEpicCloseShip({}, MILESTONE_CONTENT)).toBe(false);
    expect(isEpicCloseShip(null, MILESTONE_CONTENT)).toBe(false);
  });

  it("returns false when the Epic ID isn't present in milestoneContent", () => {
    expect(
      isEpicCloseShip({ current_epic: 'M99.E99' }, MILESTONE_CONTENT),
    ).toBe(false);
  });
});
