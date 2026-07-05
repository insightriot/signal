// Tests for detectSchemaDrift + readSchemaDrift (M4.5.E10.S4.t1, FR5).
//
// A read-only diagnostic: is a project's STATE.md schema_version behind (needs
// migration) or ahead (written by a newer Signal) of what this Signal supports?
// It must NOT route through readState — readState throws StateSchemaError for
// BOTH the ahead and missing-key cases indistinguishably (state.js:263-274), so
// AC5.3's "report rather than crash" needs parseFrontmatter + a numeric compare
// against the exported SCHEMA_VERSION (AD6).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  detectSchemaDrift,
  readSchemaDrift,
  stringifyFrontmatter,
  SCHEMA_VERSION,
} from '../tools/lib/state.js';

async function plantRawState(tempDir, raw) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await writeFile(join(tempDir, '.planning', 'STATE.md'), raw, 'utf-8');
}

describe('detectSchemaDrift (pure)', () => {
  it('AC5.2: returns null when the version equals expected', () => {
    expect(detectSchemaDrift(SCHEMA_VERSION, SCHEMA_VERSION)).toBeNull();
    expect(detectSchemaDrift(1, 1)).toBeNull();
  });

  it('AC5.1: reports "behind" with a migration pointer when below expected', () => {
    const finding = detectSchemaDrift(0, 1);
    expect(finding.status).toBe('behind');
    expect(finding.message).toMatch(/migrat/i);
  });

  it('AC5.3: reports "ahead" (fail-closed) when above expected, no throw', () => {
    const finding = detectSchemaDrift(999, 1);
    expect(finding.status).toBe('ahead');
    expect(finding.message).toMatch(/newer|upgrade/i);
  });

  it('treats a legacy/missing version (null/undefined) as behind', () => {
    expect(detectSchemaDrift(null, 1).status).toBe('behind');
    expect(detectSchemaDrift(undefined, 1).status).toBe('behind');
  });

  it('defaults `expected` to SCHEMA_VERSION', () => {
    expect(detectSchemaDrift(SCHEMA_VERSION)).toBeNull();
    expect(detectSchemaDrift(SCHEMA_VERSION + 1).status).toBe('ahead');
  });
});

describe('readSchemaDrift (file, read-only)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-drift-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('AC5.4: returns null when there is no STATE.md', async () => {
    expect(await readSchemaDrift(tempDir)).toBeNull();
  });

  it('AC5.2: returns null for a current-schema STATE.md', async () => {
    const raw = stringifyFrontmatter(
      { schema_version: SCHEMA_VERSION, phase: 'EXECUTE' },
      '# body\n'
    );
    await plantRawState(tempDir, raw);
    expect(await readSchemaDrift(tempDir)).toBeNull();
  });

  it('AC5.1: reports "behind" for a numeric version below expected', async () => {
    await plantRawState(tempDir, '---\nschema_version: 0\nphase: EXECUTE\n---\n# body\n');
    const finding = await readSchemaDrift(tempDir);
    expect(finding.status).toBe('behind');
    expect(finding.message).toMatch(/migrat/i);
  });

  it('AC5.3: reports "ahead" for a version above expected (no crash)', async () => {
    await plantRawState(tempDir, '---\nschema_version: 999\nphase: EXECUTE\n---\n# body\n');
    const finding = await readSchemaDrift(tempDir);
    expect(finding.status).toBe('ahead');
  });

  it('reports "behind" for a legacy (no-frontmatter) STATE.md', async () => {
    await plantRawState(tempDir, '# Project State\n\n## Current Phase\nEXECUTE\n');
    const finding = await readSchemaDrift(tempDir);
    expect(finding.status).toBe('behind');
  });

  it('reports "unreadable" for malformed frontmatter YAML (no crash)', async () => {
    await plantRawState(tempDir, '---\nschema_version: : : bad\n  - broken\n---\n# body\n');
    const finding = await readSchemaDrift(tempDir);
    expect(finding.status).toBe('unreadable');
    expect(finding.message).toMatch(/unreadable|malformed/i);
  });

  it('AC5.5: is read-only — STATE.md mtime is unchanged', async () => {
    await plantRawState(tempDir, '---\nschema_version: 999\nphase: EXECUTE\n---\n# body\n');
    const p = join(tempDir, '.planning', 'STATE.md');
    const before = (await stat(p)).mtimeMs;
    await readSchemaDrift(tempDir);
    const after = (await stat(p)).mtimeMs;
    expect(after).toBe(before);
  });
});
