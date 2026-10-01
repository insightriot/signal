// The generated-file write guard (M6.E11 t4.1, AC-6.3, D-M6E11-25, D-M6E11-28).
// See .planning/M6.E11-VALIDATION.md row AC-6.3.
//
// With the store on, BUGS.md / BACKLOG.md / ISSUES-INBOX.md / OPEN-QUESTIONS.md
// are regenerated from item files, so any other write into them is lost at the
// next regeneration. `atomicWrite` refuses a target whose FIRST LINE is the
// marker, unless the caller says `{generated: true}` — which only the
// generator does. Signal's own docs quote the marker, so a substring match
// would refuse ordinary files; these tests pin the exact-first-line rule.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { atomicWrite } from '../plugin/tools/lib/atomic-write.js';
import { GENERATED_MARKER, isGeneratedFile, isGeneratedText } from '../plugin/tools/lib/work-marker.js';
import { GENERATED_MARKER as FROM_GENERATE } from '../plugin/tools/lib/work-generate.js';
import { WorkStoreError } from '../plugin/tools/lib/work-item.js';

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'signal-guard-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const marked = `${GENERATED_MARKER}\n# Bugs\n\n| B1 | \`fixed\` | P2 | x |\n`;

describe('atomicWrite refuses a generated file', () => {
  it('a marked file is refused with GENERATED, names the file and the fix, and is left unchanged', async () => {
    const p = join(dir, 'BUGS.md');
    await writeFile(p, marked, 'utf-8');
    let err;
    try {
      await atomicWrite(p, 'hand edit\n');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('GENERATED');
    expect(err.message).toContain(p);
    expect(err.message).toMatch(/item files/);
    expect(err.message).toContain('/sig:item');
    expect(await readFile(p, 'utf-8')).toBe(marked);
    // Refused before the temp file was written: no litter beside the target.
    expect((await readdir(dir)).filter((n) => n.startsWith('.tmp-'))).toEqual([]);
  });

  it('{generated: true} writes a marked file', async () => {
    const p = join(dir, 'BUGS.md');
    await writeFile(p, marked, 'utf-8');
    const next = `${GENERATED_MARKER}\n# Bugs\n`;
    await atomicWrite(p, next, { generated: true });
    expect(await readFile(p, 'utf-8')).toBe(next);
  });

  it('an unmarked file is written as before', async () => {
    const p = join(dir, 'BUGS.md');
    await writeFile(p, '# Bugs\n', 'utf-8');
    await atomicWrite(p, '# Bugs\n\nmore\n');
    expect(await readFile(p, 'utf-8')).toBe('# Bugs\n\nmore\n');
  });

  it('the marker quoted anywhere but the first line is ignored', async () => {
    const p = join(dir, 'DOC.md');
    const quoting = `# Notes\n\nThe generator writes \`${GENERATED_MARKER}\` as line one.\n${GENERATED_MARKER}\n`;
    await writeFile(p, quoting, 'utf-8');
    await atomicWrite(p, 'rewritten\n');
    expect(await readFile(p, 'utf-8')).toBe('rewritten\n');
  });

  it('a first line that only contains the marker (indented, or with more text) is not the marker', async () => {
    for (const first of [` ${GENERATED_MARKER}`, `${GENERATED_MARKER} extra`, `> ${GENERATED_MARKER}`]) {
      const p = join(dir, 'X.md');
      await writeFile(p, `${first}\nbody\n`, 'utf-8');
      await atomicWrite(p, 'ok\n');
      expect(await readFile(p, 'utf-8')).toBe('ok\n');
    }
  });

  it('a nonexistent target is written', async () => {
    const p = join(dir, 'NEW.md');
    await atomicWrite(p, 'fresh\n');
    expect(await readFile(p, 'utf-8')).toBe('fresh\n');
  });

  it('creating a marked file needs no flag (nothing to protect yet), but overwriting it does', async () => {
    const p = join(dir, 'BACKLOG.md');
    await atomicWrite(p, marked);
    expect(existsSync(p)).toBe(true);
    await expect(atomicWrite(p, marked)).rejects.toMatchObject({ code: 'GENERATED' });
  });
});

describe('the marker check itself', () => {
  it('the generator re-exports the one marker constant', () => {
    expect(FROM_GENERATE).toBe(GENERATED_MARKER);
  });

  it('reads the first line exactly; a CRLF file carrying the marker is still generated', () => {
    expect(isGeneratedText(`${GENERATED_MARKER}\nx`)).toBe(true);
    expect(isGeneratedText(`${GENERATED_MARKER}\r\nx`)).toBe(true);
    expect(isGeneratedText(GENERATED_MARKER)).toBe(true);
    expect(isGeneratedText(`x\n${GENERATED_MARKER}`)).toBe(false);
    expect(isGeneratedText('')).toBe(false);
    expect(isGeneratedText(null)).toBe(false);
  });

  it('isGeneratedFile reads at most 200 bytes, and a missing file is not generated', async () => {
    const p = join(dir, 'BIG.md');
    await writeFile(p, `${GENERATED_MARKER}\n${'x'.repeat(100000)}\n`, 'utf-8');
    expect(isGeneratedFile(p)).toBe(true);
    const long = join(dir, 'LONG.md');
    await writeFile(long, `${'y'.repeat(500)}\n`, 'utf-8');
    expect(isGeneratedFile(long)).toBe(false);
    expect(isGeneratedFile(join(dir, 'absent.md'))).toBe(false);
  });

  // REVIEW Suggestion: an editor that saves a UTF-8 BOM must not turn the
  // guard off — a marked file with a BOM is still generated.
  it('a leading UTF-8 BOM does not hide the marker', async () => {
    expect(isGeneratedText(`\uFEFF${GENERATED_MARKER}\nx`)).toBe(true);
    const p = join(dir, 'BOM.md');
    await writeFile(p, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${GENERATED_MARKER}\n# Bugs\n`)]));
    expect(isGeneratedFile(p)).toBe(true);
    await expect(atomicWrite(p, 'hand edit\n')).rejects.toMatchObject({ code: 'GENERATED' });
    // Only one BOM, and only at the very start.
    expect(isGeneratedText(`\uFEFF\uFEFF${GENERATED_MARKER}`)).toBe(false);
    expect(isGeneratedText(`x\n\uFEFF${GENERATED_MARKER}`)).toBe(false);
  });
});
