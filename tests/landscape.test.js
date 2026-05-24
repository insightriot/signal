import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readScan,
  readAllScans,
  extractSection,
  extractField,
  embedSection,
  SCANNERS,
} from '../tools/lib/landscape.js';

let baseDir;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'signal-landscape-'));
  await mkdir(join(baseDir, '.planning', 'scan'), { recursive: true });
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe('readScan', () => {
  it('returns content when scan file exists', async () => {
    await writeFile(join(baseDir, '.planning', 'scan', 'stack.md'), '# Stack Scan\n\n## Languages\n\n- TypeScript: 80%\n');
    const content = await readScan(baseDir, 'stack');
    expect(content).toContain('# Stack Scan');
    expect(content).toContain('TypeScript: 80%');
  });

  it('returns null when scan file is absent', async () => {
    const content = await readScan(baseDir, 'stack');
    expect(content).toBeNull();
  });

  it('throws on invalid scanner name', async () => {
    await expect(readScan(baseDir, 'invalid')).rejects.toThrow(/Invalid scanner name/);
  });

  it('accepts all four canonical names', async () => {
    for (const name of SCANNERS) {
      const result = await readScan(baseDir, name);
      expect(result).toBeNull();
    }
  });
});

describe('readAllScans', () => {
  it('returns all 4 scans when all exist', async () => {
    for (const name of SCANNERS) {
      await writeFile(join(baseDir, '.planning', 'scan', `${name}.md`), `# ${name} scan\n`);
    }
    const all = await readAllScans(baseDir);
    expect(Object.keys(all).sort()).toEqual([...SCANNERS].sort());
    for (const name of SCANNERS) {
      expect(all[name]).toContain(`${name} scan`);
    }
  });

  it('returns null entries for missing scans without crashing', async () => {
    await writeFile(join(baseDir, '.planning', 'scan', 'stack.md'), '# stack scan\n');
    const all = await readAllScans(baseDir);
    expect(all.stack).toContain('stack scan');
    expect(all.structure).toBeNull();
    expect(all.activity).toBeNull();
    expect(all.quality).toBeNull();
  });

  it('returns 4 null entries when no scans exist', async () => {
    const all = await readAllScans(baseDir);
    expect(all).toEqual({ stack: null, structure: null, activity: null, quality: null });
  });
});

describe('extractSection', () => {
  const sample = `# Title

## First Section

First section body.
Multiple lines.

## Second Section

Second body.

- list item
- another

## Third Section

Third body.
`;

  it('extracts a section by heading', () => {
    const result = extractSection(sample, 'First Section');
    expect(result).toBe('First section body.\nMultiple lines.');
  });

  it('extracts a middle section, stopping at the next ##', () => {
    const result = extractSection(sample, 'Second Section');
    expect(result).toBe('Second body.\n\n- list item\n- another');
  });

  it('extracts the last section, going to end-of-file', () => {
    const result = extractSection(sample, 'Third Section');
    expect(result).toBe('Third body.');
  });

  it('returns null when heading is not found', () => {
    expect(extractSection(sample, 'Nonexistent')).toBeNull();
  });

  it('returns null on null content', () => {
    expect(extractSection(null, 'Anything')).toBeNull();
  });

  it('returns null on empty content', () => {
    expect(extractSection('', 'Anything')).toBeNull();
  });

  it('is case-insensitive on heading match', () => {
    expect(extractSection(sample, 'first section')).toBe('First section body.\nMultiple lines.');
    expect(extractSection(sample, 'FIRST SECTION')).toBe('First section body.\nMultiple lines.');
  });

  it('handles headings with regex-special characters', () => {
    const content = '## Languages (top 5)\n\nTypeScript\nPython\n\n## Other\n';
    expect(extractSection(content, 'Languages (top 5)')).toBe('TypeScript\nPython');
  });

  it('does not match h1 or h3 headings (only h2)', () => {
    const content = '# Section\n\ntop level\n\n### Section\n\nthird level\n';
    expect(extractSection(content, 'Section')).toBeNull();
  });

  it('returns empty string for empty section body', () => {
    const content = '## Empty\n\n## Next\n\nbody\n';
    expect(extractSection(content, 'Empty')).toBe('');
  });
});

describe('extractField', () => {
  it('extracts from "- **Label:** value" line', () => {
    const content = '- **Status:** active\n- **Phase:** PLAN\n';
    expect(extractField(content, 'Status')).toBe('active');
    expect(extractField(content, 'Phase')).toBe('PLAN');
  });

  it('extracts from "**Label:** value" line (no list marker)', () => {
    const content = '**Tier:** FULL\n';
    expect(extractField(content, 'Tier')).toBe('FULL');
  });

  it('extracts from "Label: value" line (no markdown emphasis)', () => {
    const content = 'Author: Brett\n';
    expect(extractField(content, 'Author')).toBe('Brett');
  });

  it('returns null when label not found', () => {
    expect(extractField('## Header\n\nbody\n', 'Missing')).toBeNull();
  });

  it('returns null on null content', () => {
    expect(extractField(null, 'Anything')).toBeNull();
  });

  it('returns first match when label appears multiple times', () => {
    const content = '- **Status:** active\n- **Status:** dormant\n';
    expect(extractField(content, 'Status')).toBe('active');
  });

  it('handles labels with regex-special characters', () => {
    const content = '- **Tests (90d):** 47\n';
    expect(extractField(content, 'Tests (90d)')).toBe('47');
  });

  it('trims whitespace from extracted value', () => {
    const content = '- **Status:**   active   \n';
    expect(extractField(content, 'Status')).toBe('active');
  });
});

describe('embedSection', () => {
  it('returns full section body verbatim for a structure-scan Source Tree table', () => {
    const scan = [
      '# Structure Scan',
      '',
      '## Source Tree (depth-3)',
      '',
      'Source root: `lib/`',
      '',
      '| Path | Annotation |',
      '|---|---|',
      '| `index.js` | Top-level entry (224 bytes) |',
      '| `lib/` | Library source — 6 files |',
      '',
      '## Test Surface',
      '',
      '- Dedicated directory: test/',
      '',
    ].join('\n');
    const body = embedSection(scan, 'Source Tree (depth-3)');
    expect(body).toContain('| Path | Annotation |');
    expect(body).toContain('| `index.js` | Top-level entry (224 bytes) |');
    expect(body).toContain('| `lib/` | Library source — 6 files |');
    expect(body).toContain('Source root: `lib/`');
    expect(body).not.toContain('## Test Surface');
    expect(body).not.toContain('Dedicated directory: test/');
  });

  it('returns null for a missing heading', () => {
    const scan = '# Stack Scan\n\n## Languages\n\n- JavaScript: 100%\n';
    expect(embedSection(scan, 'Nonexistent Heading')).toBeNull();
    expect(embedSection(null, 'Languages')).toBeNull();
    expect(embedSection('', 'Languages')).toBeNull();
  });

  it('preserves fenced-code blocks and table cell content verbatim', () => {
    const scan = [
      '## README',
      '',
      '**First 30 lines:**',
      '',
      '```',
      '[![Express Logo](https://example.com/logo.png)](https://expressjs.com/)',
      '',
      '**Fast, unopinionated, minimalist web framework for [Node.js](https://nodejs.org).**',
      '```',
      '',
      '## CHANGELOG',
      '',
      'Other content',
      '',
    ].join('\n');
    const body = embedSection(scan, 'README');
    expect(body).toContain('```\n[![Express Logo]');
    expect(body).toContain('**Fast, unopinionated, minimalist web framework for [Node.js](https://nodejs.org).**');
    const fenceCount = (body.match(/```/g) || []).length;
    expect(fenceCount).toBe(2);
    expect(body).not.toContain('## CHANGELOG');
    expect(body).not.toContain('Other content');
  });
});
