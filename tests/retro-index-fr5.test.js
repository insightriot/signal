// FR5 integration tests (M4.5.E9.S2.t5). Maps explicitly to AC14-17.
//
// These complement the unit-level tests in tests/retro-index.test.js by
// exercising the full enumerate → render → write → verify-on-disk loop
// against a fixture .planning/ tree with mixed stub + complete retros.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { regenerateIndex, enumerateRetros } from '../tools/lib/retro-index.js';

const STUB = `# M4.5.E1 Retrospective

## Timeline

[FILL IN — timeline]

## What changed mid-flight

[FILL IN]

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

const COMPLETE = `# M4.5.E3 Retrospective

## Timeline

Real concrete timeline content. Multiple sentences. Detailed.

## What changed mid-flight

Concrete changes. Detailed analysis. ${'Substantive content. '.repeat(5)}

## What assumptions broke

Concrete assumptions. ${'Detail. '.repeat(10)}

## What surprised us

Concrete surprises. ${'Detail. '.repeat(10)}

## What we'd do differently

Concrete changes. ${'Detail. '.repeat(10)}

## What to feed back into Signal

Concrete feedback. ${'Detail. '.repeat(10)}

## Anti-rationalization moment

We almost rationalized X but kept it. ${'Detail. '.repeat(10)}

## Links

- Plan: foo.md
`;

async function setupFixture() {
  const base = await mkdtemp(join(tmpdir(), 'signal-retro-fr5-'));
  await mkdir(join(base, '.planning'), { recursive: true });
  return base;
}

describe('FR5 — AC14 RETROSPECTIVES.md exists at documented path', () => {
  let base;
  beforeEach(async () => (base = await setupFixture()));
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC14 — regenerateIndex writes .planning/RETROSPECTIVES.md', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), COMPLETE);
    await regenerateIndex(base);
    await access(join(base, '.planning', 'RETROSPECTIVES.md'));
  });
});

describe('FR5 — AC15 Index lists every retro file (**/*-RETROSPECTIVE.md)', () => {
  let base;
  beforeEach(async () => (base = await setupFixture()));
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC15 — every retro file appears in the index by Epic ID', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'), STUB);
    await writeFile(join(base, '.planning', 'M4.5.E2-RETROSPECTIVE.md'), STUB);
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), COMPLETE);
    await writeFile(join(base, '.planning', 'M4.5.E6-RETROSPECTIVE.md'), STUB);
    await writeFile(join(base, '.planning', 'M4.5.E9-RETROSPECTIVE.md'), COMPLETE);
    await regenerateIndex(base);
    const index = await readFile(join(base, '.planning', 'RETROSPECTIVES.md'), 'utf-8');
    for (const epic of ['M4.5.E1', 'M4.5.E2', 'M4.5.E3', 'M4.5.E6', 'M4.5.E9']) {
      expect(index, `epic=${epic} missing from index`).toContain(`[${epic}]`);
    }
  });

  it("AC15 — retros in subdirectories are also indexed (forward-compatible with M5.E1 wiki shape)", async () => {
    await mkdir(join(base, '.planning', 'retrospectives'), { recursive: true });
    await writeFile(
      join(base, '.planning', 'retrospectives', 'M5.E1-RETROSPECTIVE.md'),
      COMPLETE,
    );
    await regenerateIndex(base);
    const records = await enumerateRetros(base);
    expect(records.length).toBe(1);
    expect(records[0].epicId).toBe('M5.E1');
    expect(records[0].path).toMatch(/retrospectives/);
  });
});

describe('FR5 — AC16 Each index entry link resolves to the retro file', () => {
  let base;
  beforeEach(async () => (base = await setupFixture()));
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC16 — every (target) link in the index resolves to a real file relative to .planning/', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'), STUB);
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), COMPLETE);
    await regenerateIndex(base);
    const index = await readFile(join(base, '.planning', 'RETROSPECTIVES.md'), 'utf-8');
    // Extract markdown link URLs: `](URL)` capture
    const targets = [...index.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      // Index lives in .planning/, so resolve targets relative to that dir.
      const fullPath = join(base, '.planning', target);
      await access(fullPath);
    }
  });
});

describe('FR5 — AC17 Stub/complete status accurate per [FILL IN] markers', () => {
  let base;
  beforeEach(async () => (base = await setupFixture()));
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('AC17 — mixed stub + complete fixture: status matches content', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'), STUB);
    await writeFile(join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'), COMPLETE);
    await regenerateIndex(base);
    const index = await readFile(join(base, '.planning', 'RETROSPECTIVES.md'), 'utf-8');
    // E1 row should show *stub*; E3 should show *complete*.
    const e1Line = index.split('\n').find((l) => l.includes('[M4.5.E1]'));
    const e3Line = index.split('\n').find((l) => l.includes('[M4.5.E3]'));
    expect(e1Line).toContain('*stub*');
    expect(e3Line).toContain('*complete*');
  });

  it('AC17 — status flips when a stub is edited into a complete retro', async () => {
    await writeFile(join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'), STUB);
    await regenerateIndex(base);
    let index = await readFile(join(base, '.planning', 'RETROSPECTIVES.md'), 'utf-8');
    let e1Line = index.split('\n').find((l) => l.includes('[M4.5.E1]'));
    expect(e1Line).toContain('*stub*');
    // Replace the stub file with substantive content (no [FILL IN] line-start markers).
    await writeFile(join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'), COMPLETE);
    await regenerateIndex(base);
    index = await readFile(join(base, '.planning', 'RETROSPECTIVES.md'), 'utf-8');
    e1Line = index.split('\n').find((l) => l.includes('[M4.5.E1]'));
    expect(e1Line).toContain('*complete*');
    expect(e1Line).not.toContain('*stub*');
  });
});
