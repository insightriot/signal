// M6.E16.S2.t2.7 — reading and folding unit records grows in proportion to
// their number (NFR performance). See .planning/M6.E16-VALIDATION.md row
// "NFR performance", and tests/work-migrate-propose.test.js (the 2,000 → 32,000
// precedent this follows: a 4× step with an 8× line is within reach of timing
// noise, SIG-293).
//
// `listUnits` is the timed call: one directory read, then read + parse +
// validate + fold per record. No git subprocess is in it.

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { listUnits } from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';

const AT = '2026-10-11T10:00:00.000Z';
const SHA = '0123abc';
const by = 'claude';
const opened = { type: 'opened', at: AT, by };
const closing = { type: 'close_requested', at: AT, by, proof: SHA };
const shipped = { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA };
const held = { type: 'held', at: AT, by, reason: 'still read daily' };

// One of four histories per unit, so every branch of the fold is in the timing.
const HISTORIES = [[opened], [opened, closing], [opened, closing, shipped], [opened, closing, shipped, held]];

const made = [];
function storeOf(n) {
  const base = mkdtempSync(join(tmpdir(), 'sig-units-perf-'));
  made.push(base);
  const dir = join(base, '.planning', 'work', 'units');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(base, '.planning', 'work', 'WORK.md'), '---\nkey: SIG\nschema_version: 2\n---\n');
  for (let i = 1; i <= n; i += 1) {
    const id = `M${1 + (i % 9)}.E${i}`;
    writeFileSync(join(dir, `${id}.json`), UNIT_KIND.serializeRecord({ id, title: `Unit ${i}`, events: HISTORIES[i % 4] }));
  }
  return base;
}

function timed(base) {
  const t0 = performance.now();
  const out = listUnits(base);
  return { ms: performance.now() - t0, out };
}
const best = (base) => Math.min(...[0, 1, 2, 3, 4].map(() => timed(base).ms));

afterAll(() => {
  for (const base of made) rmSync(base, { recursive: true, force: true });
});

describe('unit records — list and fold is linear in the number of units (NFR performance)', () => {
  // Sixteen times the units: linear ~16×, quadratic ~256×; the line is at 64×.
  it('2,000 → 32,000 units costs under 64×, best of five, and every unit is read', () => {
    const small = storeOf(2000);
    const large = storeOf(32000);
    best(small); // warm-up: the first call pays for JIT and a cold directory
    const smallMs = best(small);
    const largeMs = best(large);
    const ratio = largeMs / smallMs;
    console.log(`[NFR] unit records, list+fold, best of five: 2,000 in ${smallMs.toFixed(1)} ms, 32,000 in ${largeMs.toFixed(1)} ms — ${ratio.toFixed(1)}× for 16× the units`);
    const { units, broken } = listUnits(large);
    expect(broken).toEqual([]);
    expect(units).toHaveLength(32000);
    expect(units.filter((u) => u.status === 'closed')).toHaveLength(16000);
    expect(units.filter((u) => u.held)).toHaveLength(8000);
    expect(ratio).toBeLessThan(64);
  }, 60_000);

  it('500 units list and fold in under a second', () => {
    const base = storeOf(500);
    timed(base); // warm-up
    const { ms, out } = timed(base);
    console.log(`[NFR] unit records, list+fold: 500 in ${ms.toFixed(1)} ms`);
    expect(out.broken).toEqual([]);
    expect(out.units).toHaveLength(500);
    expect(ms).toBeLessThan(1000);
  }, 60_000);
});
