// Store-off equivalence (M6.E11 t6.1, AC-1.2).
// See .planning/M6.E11-VALIDATION.md row AC-1.2.
//
// A project without `.planning/work/WORK.md` must see exactly what it saw
// before this Epic. `golden.json` was captured by `tests/helpers/store-off-golden.js`
// from the writer code BEFORE S4 changed any writer; this re-runs the same
// script against today's code and compares every byte and every resolver
// answer. Step by step, so a failure names the write path that moved.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { captureStoreOff, GOLDEN_PATH } from './helpers/store-off-golden.js';

const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8'));

describe('store off: every touched write path is byte-identical to the pre-S4 baseline', async () => {
  const now = await captureStoreOff();

  it('ran with the same frozen clock as the baseline', () => {
    expect(now.frozenAt).toBe(golden.frozenAt);
  });

  it('the artifact resolver answers exactly as before', () => {
    expect(now.resolver).toEqual(golden.resolver);
  });

  for (const part of ['fixture', 'fresh']) {
    it(`${part}: the same steps ran, in the same order`, () => {
      expect(now[part].steps.map((s) => s.name)).toEqual(golden[part].steps.map((s) => s.name));
    });

    golden[part].steps.forEach((want, i) => {
      it(`${part}: ${want.name}`, () => {
        const got = now[part].steps[i];
        expect(got.result).toEqual(want.result);
        expect(got.changed).toEqual(want.changed);
      });
    });

    it(`${part}: the whole tree at the end is byte-identical (no stray files, no leftover locks)`, () => {
      expect(Object.keys(now[part].final)).toEqual(Object.keys(golden[part].final));
      expect(now[part].final).toEqual(golden[part].final);
    });
  }

  it('the baseline itself exercises the paths S4 changes (guards against a hollow golden)', () => {
    const names = golden.fixture.steps.map((s) => s.name).join('\n');
    for (const needle of ['add: default inbox', 'add: --bug', 'add: --question', 'checkpoint',
      'drain: defer', 'drain: evict', 'promoteToBacklog', 'promoteToBugs', 'dischargeBacklogRows',
      'rollback', 'atomicWrite', 'archive-tree: apply']) {
      expect(names).toContain(needle);
    }
    // No step silently threw in the baseline.
    for (const part of ['fixture', 'fresh']) {
      for (const s of golden[part].steps) expect(s.result).not.toHaveProperty('threw');
    }
    expect(golden.fixture.final).not.toHaveProperty(['.planning/work/WORK.md']);
  });
});
