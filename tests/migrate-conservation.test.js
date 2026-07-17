// M5.E2.S1.t3 — conservation invariants (the B8 body-not-grown guard).
//
// Two modes (cross-cutting §2):
//   BYTE — archive/verbatim relocation: the new home equals the source exactly.
//          Mutate it by ONE byte → the byte-identity assert fails.
//   WORD — in-body relocation: every whitespace-delimited token of the source
//          survives in the new home (indent-/reflow-agnostic). Drop a word →
//          word-conservation fails.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { conserves, relocateFaithful, BYTE, WORD } from '../tools/lib/migrate-memory.js';

describe('M5.E2.S1.t3 conserves — BYTE mode (archive/verbatim)', () => {
  it('passes when the new home is byte-identical', () => {
    const s = 'line one\nline two\n';
    expect(conserves(s, s, BYTE).pass).toBe(true);
  });

  it('FAILS when the archive copy is mutated by one byte (proof-of-fail)', () => {
    const s = 'abcdef';
    expect(conserves(s, 'abcdeX', BYTE).pass).toBe(false);
  });

  it('FAILS when the archive copy is truncated (a partial write)', () => {
    const s = 'the whole section\n';
    expect(conserves(s, 'the whole', BYTE).pass).toBe(false);
  });
});

describe('M5.E2.S1.t3 conserves — WORD mode (in-body relocation)', () => {
  it('passes when every source token survives (indent-agnostic, reflowed)', () => {
    const prose = 'we refactored the auth flow because it was fragile';
    // Relocated into a body region with skeleton headers + re-indentation.
    const newHome = '## Closed work\n  we refactored the auth\n  flow because it was fragile\n';
    expect(conserves(prose, newHome, WORD).pass).toBe(true);
  });

  it('FAILS when a word is dropped (proof-of-fail)', () => {
    const prose = 'we refactored the auth flow because it was fragile';
    const dropped = 'we refactored the auth flow because it was'; // "fragile" gone
    const r = conserves(prose, dropped, WORD);
    expect(r.pass).toBe(false);
    expect(r.missing).toContain('fragile');
  });

  it('FAILS on the B8 catastrophe — the whole prose dropped into an empty home', () => {
    const prose = 'a long paragraph of narrative that carries no ids or dates at all';
    expect(conserves(prose, '', WORD).pass).toBe(false);
  });

  it('counts multiplicity — dropping one of two identical words fails', () => {
    // source needs "the" x2; new home has it x1 → a real drop, not masked.
    expect(conserves('keep the and the other', 'keep the other', WORD).pass).toBe(false);
  });
});

describe('M5.E2.S1.t3 relocateFaithful — BYTE mode writes + verifies on disk', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-reloc-byte-'));
    await mkdir(join(baseDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('writes the source byte-identical to dest and passes', async () => {
    const section = '## M9.E1\n\nnarrative body\nwith lines\n';
    const destAbs = join(baseDir, '.planning', 'archive', 'M9', 'E1', 'STATE-NARRATIVE.md');
    const r = await relocateFaithful({ sourceText: section, destAbs, baseDir, mode: BYTE });
    expect(r.pass).toBe(true);
    expect(r.conservation.pass).toBe(true);
    // The archive copy is byte-identical (the original survives in full).
    expect(await readFile(destAbs, 'utf-8')).toBe(section);
  });

  it('refuses a dest that escapes .planning/ (path confinement)', async () => {
    const destAbs = join(baseDir, 'escape.md'); // outside .planning/
    await expect(
      relocateFaithful({ sourceText: 'x', destAbs, baseDir, mode: BYTE }),
    ).rejects.toThrow(/escapes/);
  });
});
