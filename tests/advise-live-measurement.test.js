// M6.E8 S1 t1.1 — the live-measurement test (NFR6).
//
// Every vocabulary the advisor ranks on records the count it produced on THIS
// repository's own BACKLOG.md, beside the pattern, as a frozen `*_MEASURED`
// constant. This file is what turns those numbers from comments into claims: it
// runs the real file through the real readers — `readCorpus` at depth 4, the
// real discharge status, the real `classifyRows` — and asserts each count.
//
// Why it exists: `declaresNotLiveWork`'s docblock recorded "50 live rows: parked
// ×2, not sprint material ×1, reconciliation ×2" on 2026-09-06 and nothing ever
// re-ran it. By 2026-09-14 the file had 48 live rows. A count in a comment is a
// claim written from memory the moment the file moves.
//
// ⚠ EXACTLY ONE CONSTANT BREAKS AT THIS EPIC'S OWN SHIP, and the history of this
// sentence is the lesson. It first said ONE, reasoned from the shape of the work
// rather than a simulation. A reviewer simulated the strike and made it SEVEN —
// correct at the time, because population (`rows`) assertions had just been
// added. Removing those assertions (see the `*_MEASURED` docblock) puts it back
// at one, this time measured: striking this Epic's row drops `TRIGGER_MET` from
// 3 hits to 2, and no other constant moves.
//
// **Bumping that one in the SHIP commit is the correct response, not a
// workaround:** a vocabulary's reach genuinely changed by one row, and a human
// genuinely looked at that row. That is what these pins are for.
//
// ⚠ THIS IS A REPO-FILE PIN, AND IT IS NOT `B120`'s SHAPE. `drain-standing`
// AC2.2c fires whenever the inbox is USED as intended (a capture lands). These
// fire when a row starts or stops matching a predicate — which is exactly the
// moment a human should re-read the hit and decide whether the vocabulary is
// still precise. The failure message says so and names the remedy; it is a
// re-measurement step, not a mystery red.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCKED_MEASURED, TRIGGER_MET_MEASURED } from '../plugin/tools/lib/advise.js';
import { declaresBugDischarge, NOT_LIVE_MEASURED } from '../plugin/tools/lib/backlog.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('M6.E8 t1.1 — every *_MEASURED constant has the shape the pins read', () => {
  for (const [name, m] of [
    ['BLOCKED_MEASURED', BLOCKED_MEASURED],
    ['TRIGGER_MET_MEASURED', TRIGGER_MET_MEASURED],
    ['NOT_LIVE_MEASURED', NOT_LIVE_MEASURED],
  ]) {
    it(`${name} is frozen, carries on / hits, and carries NO population field`, () => {
      expect(Object.isFrozen(m)).toBe(true);
      expect(m.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(m.hits)).toBe(true);
      // ⚠ Asserted ABSENT, not merely unused. A population pinned here fires on
      // any ordinary backlog edit — `B120`'s shape, and the thing this Epic's own
      // requirements warn against. If someone reintroduces it, this says so.
      expect(m, 'a population field is B120\'s shape — pin named rows, not counts').not.toHaveProperty('rows');
    });
  }
});

describe('M6.E8 t3.2 (FR2 amended — D-M6E8-7) — BLOCKED_RE is not widened, and the gate row is not what blocks', () => {
  it('AC2.2 — the pattern is byte-identical to what M6.E7 shipped, so nothing blocked before is unblocked after', () => {
    const src = readFileSync(join(repoRoot, 'plugin/tools/lib/advise.js'), 'utf8');
    const line = src.match(/^const BLOCKED_RE = (.+);$/m)?.[1];
    expect(line).toBe(String.raw`/\b(?:blocked on|gated on|depends on|trigger[^.\n]{0,60}\b(?:is\s+)?NOT met|unmet trigger)\b/i`);
  });
});

describe('M6.E8 — the bug-discharge pattern stays LINEAR (REVIEW pass 2, security audit)', () => {
  // The widening that taught the predicate past tense also made its separator
  // optional between two unbounded whitespace runs, which is quadratic: 1.9 ms at
  // 1k spaces, 161 ms at 10k, 1.5 s at 30k, 5.9 s at 60k. `LEADING_ID_RE` in the
  // same file bounds its runs for exactly this class and records the 3.9 s
  // measurement behind it — the lesson was already written down one function up.
  // This pin is what stops it coming back: the shape is invisible to reading, and
  // the author's own earlier probe tried every shape but this one.
  it('does not backtrack on a long whitespace run after a bug id', () => {
    for (const filler of [' ', '\t']) {
      const heading = `B1${filler.repeat(30000)}x`;
      const started = performance.now();
      declaresBugDischarge(heading);
      const ms = performance.now() - started;
      expect(
        ms,
        `declaresBugDischarge took ${ms.toFixed(0)}ms on 30k ${filler === ' ' ? 'spaces' : 'tabs'} — the separator group is unbounded again`
      ).toBeLessThan(250);
    }
  });

  it('a row saying a fix BROKE something is NOT read as discharging that bug', () => {
    // Three shapes, removed across two review rounds, all saying the same thing:
    // a row about a bug is not a claim that the bug is closed. The prepositional
    // form went with the `for` branch; the noun forms went when the bare verbs
    // did; the bug-as-subject forms went when the separator became required.
    for (const text of [
      'The fix for `B75` broke `B76`',
      'The fix for B75 regressed',
      'The B75 fix broke B76',
      'B75 fixes the ceiling',
    ]) {
      expect(declaresBugDischarge(text).id, `"${text}" is not a discharge claim`).toBeNull();
    }
  });
});
