// M5.E2.S1.t2 — docs_layout_version frontmatter mutator (raw-line splice).
//
// Cross-cutting §1: raw frontmatter lines, NEVER a stringifyYaml round-trip. The
// stamp write must touch ONLY the docs_layout_version line (insert when absent,
// replace when present) and leave every other frontmatter line byte-identical.
//
// Proof-of-fail (strict): a stringifyFrontmatter/stringifyYaml round-trip impl
// reformats the WHOLE block (normalizes spacing, drops comments, re-quotes), so
// the "every non-docs line is byte-identical" assertion FAILS for it. This
// fixture deliberately carries irregular spacing + a comment line that only a
// raw splice preserves.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { spliceDocsLayoutVersion, setDocsLayoutVersion } from '../tools/lib/migrate-memory.js';

// Irregular spacing (`phase:   PLAN`) + a trailing comment: a stringifyYaml
// round-trip normalizes the spacing and DROPS the comment; a raw splice keeps
// both verbatim. This is the discriminator.
const STATE_NO_STAMP =
  `---\n` +
  `schema_version: 1\n` +
  `phase:   PLAN\n` + // irregular spacing — must survive verbatim
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases: []\n` +
  `# hand-added note that a yaml round-trip would drop\n` +
  `blockers: []\n` +
  `---\n` +
  `# Project State\n\nbody line\n`;

const STATE_WITH_STAMP =
  `---\n` +
  `schema_version: 1\n` +
  `docs_layout_version: 1\n` +
  `phase:   PLAN\n` +
  `current_epic: M5.E2\n` +
  `---\n` +
  `# Project State\n\nbody\n`;

// Lines that must be preserved byte-for-byte regardless of the splice.
const nonDocsLines = (text) =>
  text.split('\n').filter((l) => !/^docs_layout_version:/.test(l));

describe('M5.E2.S1.t2 spliceDocsLayoutVersion (pure, lock-free)', () => {
  it('INSERTS docs_layout_version when absent (right after schema_version)', () => {
    const out = spliceDocsLayoutVersion(STATE_NO_STAMP, 2);
    expect(out).toMatch(/^schema_version: 1\ndocs_layout_version: 2\n/m);
    // Every non-docs line is byte-identical to the input (proof-of-fail vs a
    // round-trip impl: the irregular spacing + comment survive verbatim).
    expect(nonDocsLines(out)).toEqual(nonDocsLines(STATE_NO_STAMP));
    // The body is untouched.
    expect(out.endsWith('# Project State\n\nbody line\n')).toBe(true);
  });

  it('REPLACES the value when docs_layout_version is already present (in place)', () => {
    const out = spliceDocsLayoutVersion(STATE_WITH_STAMP, 2);
    expect(out).toMatch(/^docs_layout_version: 2$/m);
    expect(out).not.toMatch(/docs_layout_version: 1/);
    expect(nonDocsLines(out)).toEqual(nonDocsLines(STATE_WITH_STAMP));
    // Exactly one docs_layout_version line — no duplicate inserted.
    expect(out.match(/^docs_layout_version:/gm)).toHaveLength(1);
  });

  it('is idempotent — splicing the same n twice is byte-identical', () => {
    const once = spliceDocsLayoutVersion(STATE_NO_STAMP, 2);
    const twice = spliceDocsLayoutVersion(once, 2);
    expect(twice).toBe(once);
  });

  it('is CRLF-tolerant — a Windows STATE keeps CRLF line endings', () => {
    const crlf = STATE_NO_STAMP.replace(/\n/g, '\r\n');
    const out = spliceDocsLayoutVersion(crlf, 2);
    expect(out).toContain('docs_layout_version: 2\r\n');
    expect(out).not.toContain('docs_layout_version: 2\n\r'); // no mangled endings
    expect(nonDocsLines(out.replace(/\r\n/g, '\n'))).toEqual(nonDocsLines(STATE_NO_STAMP));
  });

  it('returns text unchanged when there is no frontmatter (no fabrication)', () => {
    const noFm = '# just a body\n\nno frontmatter here\n';
    expect(spliceDocsLayoutVersion(noFm, 2)).toBe(noFm);
  });

  it('rejects a non-integer n (defensive — the stamp is an integer axis, FR7.1)', () => {
    expect(() => spliceDocsLayoutVersion(STATE_NO_STAMP, 2.5)).toThrow();
    expect(() => spliceDocsLayoutVersion(STATE_NO_STAMP, 'two')).toThrow();
  });
});

describe('M5.E2.S1.t2 setDocsLayoutVersion (self-locking wrapper, on disk)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-stamp-'));
    await mkdir(join(baseDir, '.planning'), { recursive: true });
    await writeFile(join(baseDir, '.planning', 'STATE.md'), STATE_NO_STAMP, 'utf-8');
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('stamps the on-disk STATE.md, preserving every other frontmatter line', async () => {
    await setDocsLayoutVersion(baseDir, 2);
    const after = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    expect(after).toMatch(/^docs_layout_version: 2$/m);
    expect(nonDocsLines(after)).toEqual(nonDocsLines(STATE_NO_STAMP));
  });

  it('is idempotent on disk — re-stamping the same n is a byte-identical no-op', async () => {
    await setDocsLayoutVersion(baseDir, 2);
    const first = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    await setDocsLayoutVersion(baseDir, 2);
    const second = await readFile(join(baseDir, '.planning', 'STATE.md'), 'utf-8');
    expect(second).toBe(first);
  });
});
