// Tests for tools/lib/retro-index.js — M4.5.E9.S2.t1.
//
// FR5 foundation: enumerate retro files in .planning/, classify each as
// stub-vs-complete by scanning for [FILL IN] markers in reflection sections.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  enumerateRetros,
  isStubRetro,
} from '../tools/lib/retro-index.js';

const STUB_RETRO = `# M4.5.E1 Retrospective

> _Stub generated 2026-05-26 by M4.5.E9 backfill._

> **Epic incomplete as of backfill date 2026-05-26.**

## Timeline

[FILL IN — DISCUSS / PLAN / EXECUTE / VERIFY / REVIEW / SHIP]

## What changed mid-flight

[FILL IN — decisions]

## What assumptions broke

[FILL IN]

## What surprised us

[FILL IN]

## What we'd do differently

[FILL IN]

## What to feed back into Signal

[FILL IN]

## Anti-rationalization moment

[FILL IN]

## Links

- Plan: foo.md
`;

const COMPLETE_RETRO = `# M4.5.E3 Retrospective

> Substantive content, no FILL IN markers.

## Timeline

Real timeline content. Multiple sentences. Lots of detail about what happened, when, and for how long. Wall clock vs focused time totals.

## What changed mid-flight

Things changed mid-flight. Specifically, we noticed X and pivoted to Y, which paid off because Z. Documented in detail.

## What assumptions broke

A1 broke. A2 broke. A4 broke. Substantive analysis follows. Long body content here for byte threshold satisfaction.

## What surprised us

Many things surprised us. The dry-run gate caught real bugs. The validator green-lit on first try. Etc.

## What we'd do differently

Run hook-API verification earlier. Add spec-internal consistency check to VALIDATION. Codify dry-run patterns.

## What to feed back into Signal

DISCUSS should add a question about motivating-failure-mode alignment. PLAN-validation needs a new axis.

## Anti-rationalization moment

We almost merged S1.t10 into S1.t9 but didn't because the precedent specifically separated them. The separation was load-bearing.

## Links

- Plan: M4.5.E3-PLAN.md
- Commit range: aaa..bbb
`;

async function makeBase() {
  const base = await mkdtemp(join(tmpdir(), 'signal-retro-index-'));
  await mkdir(join(base, '.planning'), { recursive: true });
  return base;
}

describe('isStubRetro', () => {
  it('returns true when [FILL IN] markers are present', () => {
    expect(isStubRetro(STUB_RETRO)).toBe(true);
  });

  it('returns false when no [FILL IN] markers exist', () => {
    expect(isStubRetro(COMPLETE_RETRO)).toBe(false);
  });

  it('returns true when content has a single FILL IN marker', () => {
    expect(isStubRetro('## Timeline\n\n[FILL IN]\n')).toBe(true);
  });

  it('returns false on empty content', () => {
    expect(isStubRetro('')).toBe(false);
  });
});

describe('enumerateRetros', () => {
  let base;
  beforeEach(async () => {
    base = await makeBase();
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('returns empty when no retro files exist', async () => {
    const result = await enumerateRetros(base);
    expect(result).toEqual([]);
  });

  it('finds top-level .planning/*-RETROSPECTIVE.md files', async () => {
    await writeFile(
      join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'),
      STUB_RETRO,
    );
    await writeFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      COMPLETE_RETRO,
    );
    const result = await enumerateRetros(base);
    expect(result.length).toBe(2);
    const ids = result.map((r) => r.epicId).sort();
    expect(ids).toEqual(['M4.5.E1', 'M4.5.E3']);
  });

  it('finds retro files in subdirectories (path-agnostic glob per A3)', async () => {
    // Future-proof for M5.E1 wiki restructure that may relocate retros.
    await mkdir(join(base, '.planning', 'retrospectives'), { recursive: true });
    await writeFile(
      join(base, '.planning', 'retrospectives', 'M5.E1-RETROSPECTIVE.md'),
      COMPLETE_RETRO,
    );
    const result = await enumerateRetros(base);
    expect(result.length).toBe(1);
    expect(result[0].epicId).toBe('M5.E1');
    expect(result[0].path).toMatch(/retrospectives/);
  });

  it('correctly flags stub vs complete', async () => {
    await writeFile(
      join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'),
      STUB_RETRO,
    );
    await writeFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      COMPLETE_RETRO,
    );
    const result = await enumerateRetros(base);
    const byId = Object.fromEntries(result.map((r) => [r.epicId, r]));
    expect(byId['M4.5.E1'].isStub).toBe(true);
    expect(byId['M4.5.E3'].isStub).toBe(false);
  });

  it('includes lastModified timestamp on each entry', async () => {
    await writeFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      COMPLETE_RETRO,
    );
    const result = await enumerateRetros(base);
    expect(result[0].lastModified).toBeInstanceOf(Date);
  });

  it('handles mixed-state fixture (some stubs, some complete)', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'), STUB_RETRO);
    await writeFile(join(base, '.planning', 'M4.5.E2-RETROSPECTIVE.md'), STUB_RETRO);
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), COMPLETE_RETRO);
    await writeFile(join(base, '.planning', 'M4.5.E6-RETROSPECTIVE.md'), STUB_RETRO);
    await writeFile(join(base, '.planning', 'M4.5.E9-RETROSPECTIVE.md'), COMPLETE_RETRO);
    const result = await enumerateRetros(base);
    expect(result.length).toBe(5);
    const stubs = result.filter((r) => r.isStub).map((r) => r.epicId).sort();
    const complete = result.filter((r) => !r.isStub).map((r) => r.epicId).sort();
    expect(stubs).toEqual(['M4.5.E1', 'M4.5.E2', 'M4.5.E6']);
    expect(complete).toEqual(['M4.5.E3', 'M4.5.E9']);
  });

  it('parses Epic ID from filename even with unusual shapes', async () => {
    await writeFile(join(base, '.planning', 'M10.E12-RETROSPECTIVE.md'), STUB_RETRO);
    const result = await enumerateRetros(base);
    expect(result[0].epicId).toBe('M10.E12');
  });
});
