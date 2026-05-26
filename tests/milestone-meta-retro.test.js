// Tests for the milestone meta-retro mechanism (M4.5.E9.S2.t6 / FR6 A6).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  composeMilestoneMetaRetro,
  generateMilestoneMetaRetro,
} from '../tools/lib/retro-index.js';

const RETRO_FIXTURE = `# X Retrospective

## Timeline

Real content.

## What surprised us

Real content.

## Links

- Plan: foo.md
`;

const STUB_FIXTURE = `# X Retrospective

## Timeline

[FILL IN]
`;

describe('composeMilestoneMetaRetro', () => {
  it('renders a stub with all expected sections', () => {
    const out = composeMilestoneMetaRetro(
      'M4.5',
      [
        { epicId: 'M4.5.E1', path: '.planning/M4.5.E1-RETROSPECTIVE.md', isStub: true },
        { epicId: 'M4.5.E3', path: '.planning/M4.5.E3-RETROSPECTIVE.md', isStub: false },
      ],
      '2026-05-26',
    );
    expect(out).toContain('# M4.5 Meta-Retrospective');
    expect(out).toContain('Generated 2026-05-26');
    expect(out).toContain('## Epic retros referenced');
    expect(out).toContain('## Synthesis');
    expect(out).toContain('## Compound learnings');
    expect(out).toContain('## Forward-looking');
    expect(out).toContain('## Links');
    // FILL IN markers on reflection sections.
    expect(out).toContain('[FILL IN');
  });

  it('lists each retro with status flag', () => {
    const out = composeMilestoneMetaRetro(
      'M4.5',
      [
        { epicId: 'M4.5.E1', path: '.planning/M4.5.E1-RETROSPECTIVE.md', isStub: true },
        { epicId: 'M4.5.E3', path: '.planning/M4.5.E3-RETROSPECTIVE.md', isStub: false },
      ],
      '2026-05-26',
    );
    expect(out).toContain('[M4.5.E1](M4.5.E1-RETROSPECTIVE.md)');
    expect(out).toContain('[M4.5.E3](M4.5.E3-RETROSPECTIVE.md)');
    expect(out).toContain('*stub*');
    expect(out).toContain('*complete*');
  });

  it('renders empty-state message when no retros exist for the milestone', () => {
    const out = composeMilestoneMetaRetro('M5', [], '2026-05-26');
    expect(out).toMatch(/no per-Epic retros under this milestone yet/i);
  });

  it('namespaces the title to the milestone ID', () => {
    const out = composeMilestoneMetaRetro('M5', [], '2026-05-26');
    expect(out).toMatch(/^# M5 Meta-Retrospective/);
    expect(out).toMatch(/M5's experience/);
  });
});

describe('generateMilestoneMetaRetro (manual trigger)', () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'signal-meta-retro-'));
    await mkdir(join(base, '.planning'), { recursive: true });
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC18 — manual trigger generates the expected file', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), RETRO_FIXTURE);
    const result = await generateMilestoneMetaRetro(base, 'M4.5', {
      today: '2026-05-26',
    });
    expect(result.written).toBe(true);
    expect(result.path).toMatch(/M4\.5-RETROSPECTIVE\.md$/);
    expect(result.retroCount).toBe(1);
    await access(result.path);
  });

  it('AC19 — generated stub references the milestone\'s Epic retros (link resolution)', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'), STUB_FIXTURE);
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), RETRO_FIXTURE);
    // A different-milestone retro should NOT appear.
    await writeFile(join(base, '.planning', 'M5.E1-RETROSPECTIVE.md'), RETRO_FIXTURE);
    await generateMilestoneMetaRetro(base, 'M4.5', { today: '2026-05-26' });
    const content = await readFile(
      join(base, '.planning', 'M4.5-RETROSPECTIVE.md'),
      'utf-8',
    );
    expect(content).toContain('[M4.5.E1](M4.5.E1-RETROSPECTIVE.md)');
    expect(content).toContain('[M4.5.E3](M4.5.E3-RETROSPECTIVE.md)');
    // M5.E1 should NOT appear (different milestone).
    expect(content).not.toContain('M5.E1-RETROSPECTIVE.md');
  });

  it("refuses to overwrite an existing milestone meta-retro unless force=true", async () => {
    await writeFile(
      join(base, '.planning', 'M4.5-RETROSPECTIVE.md'),
      '# Existing — do not overwrite',
    );
    const result = await generateMilestoneMetaRetro(base, 'M4.5', {
      today: '2026-05-26',
    });
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/exists/);
    // Confirm content unchanged.
    const onDisk = await readFile(
      join(base, '.planning', 'M4.5-RETROSPECTIVE.md'),
      'utf-8',
    );
    expect(onDisk).toContain('do not overwrite');
  });

  it('overwrites when force=true', async () => {
    await writeFile(join(base, '.planning', 'M4.5-RETROSPECTIVE.md'), '# Existing');
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), RETRO_FIXTURE);
    const result = await generateMilestoneMetaRetro(base, 'M4.5', {
      today: '2026-05-26',
      force: true,
    });
    expect(result.written).toBe(true);
    const onDisk = await readFile(
      join(base, '.planning', 'M4.5-RETROSPECTIVE.md'),
      'utf-8',
    );
    expect(onDisk).not.toContain('# Existing');
    expect(onDisk).toContain('Meta-Retrospective');
  });
});
