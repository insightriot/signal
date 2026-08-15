import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CALIBRATE = readFileSync(join(ROOT, 'plugin/commands/calibrate.md'), 'utf8');
const TIER_DEFS = readFileSync(join(ROOT, 'plugin/references/tier-definitions.md'), 'utf8');

/**
 * Instructions that contradict other instructions (`M5.E17`'s class), found in
 * the tier-routing rules themselves.
 *
 * `commands/calibrate.md` § 3 — the file that EXECUTES — says "Apply these
 * rules in order. First match wins" and orders them FULL → SPIKE → SKETCH →
 * FEATURE. `references/tier-definitions.md` listed them FULL → SKETCH → SPIKE
 * → FEATURE and said nothing about precedence.
 *
 * That is not cosmetic, because the gate sets overlap:
 *
 *   {scope: throwaway, stakes: none, novelty: first-for-org,
 *    reversibility: trivial, horizon: hours}
 *
 * satisfies BOTH. Signal returns SPIKE; a reader of tier-definitions.md
 * concluded SKETCH. Nothing compared the two documents, so both could sit there
 * disagreeing indefinitely — which is exactly what M5.E17 shipped tests for.
 *
 * These assertions compare one document against another. They deliberately do
 * NOT re-encode the rules here: a third copy of the rule set would be a third
 * thing to drift.
 */

/**
 * The tier names of a document's NUMBERED decision list, in list order.
 *
 * Anchored on the numbering rather than on "first mention", because both files
 * discuss tiers in prose around the list (the worked overlap example names
 * SPIKE and SKETCH before the rules begin). A first-mention scan reads that
 * prose as the rule order and reports a disagreement that isn't there.
 *
 * The two files number their rules differently — `1. **FULL** if…` in
 * calibrate.md, `**1. FULL escalators**` in tier-definitions.md — so the
 * pattern is passed in rather than guessed.
 */
function orderedTiers(section, re) {
  return [...section.matchAll(re)].map((m) => m.groups.tier);
}

const CALIBRATE_RULE_RE = /^\d+\.\s+(?:Else\s+)?\*\*(?<tier>FULL|SPIKE|SKETCH|FEATURE)\*\*/gm;
const TIERDEFS_RULE_RE = /^\*\*\d+\.\s+(?<tier>FULL|SPIKE|SKETCH|FEATURE)\b/gm;

function calibrateDecisionSection() {
  const start = CALIBRATE.indexOf('### 3. Derive the tier');
  expect(start, 'calibrate.md § 3 "Derive the tier" heading not found').toBeGreaterThan(-1);
  const rest = CALIBRATE.slice(start);
  const end = rest.indexOf('### 4.');
  return end === -1 ? rest : rest.slice(0, end);
}

function tierDefsGateSection() {
  const start = TIER_DEFS.indexOf('### The gates are ordered');
  expect(start, 'tier-definitions.md gate-order heading not found').toBeGreaterThan(-1);
  const rest = TIER_DEFS.slice(start);
  const end = rest.indexOf('## Tier-to-Defaults Table');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('tier precedence: calibrate.md and tier-definitions.md must agree', () => {
  it('calibrate.md states that order matters and first match wins', () => {
    expect(calibrateDecisionSection()).toMatch(/in order.*first match wins/is);
  });

  it('tier-definitions.md states that order matters and first match wins', () => {
    // The omission of this sentence WAS the bug. Its absence read as
    // "the order is presentational", which is how the two documents diverged.
    expect(tierDefsGateSection()).toMatch(/in the order given below.*first match wins/is);
  });

  it('both documents list all four gates', () => {
    // Guards the extractors themselves: if a heading format changes, the
    // regexes return [] and every order assertion below would pass vacuously.
    expect(orderedTiers(calibrateDecisionSection(), CALIBRATE_RULE_RE)).toHaveLength(4);
    expect(orderedTiers(tierDefsGateSection(), TIERDEFS_RULE_RE)).toHaveLength(4);
  });

  it('both documents evaluate the gates in the SAME order', () => {
    const fromCalibrate = orderedTiers(calibrateDecisionSection(), CALIBRATE_RULE_RE);
    const fromTierDefs = orderedTiers(tierDefsGateSection(), TIERDEFS_RULE_RE);
    expect(
      fromTierDefs,
      `tier-definitions.md orders the gates ${fromTierDefs.join(' → ')} but ` +
        `calibrate.md (the file that executes) orders them ${fromCalibrate.join(' → ')}`,
    ).toEqual(fromCalibrate);
  });

  it('the executed order is FULL → SPIKE → SKETCH → FEATURE', () => {
    // Pinned explicitly so a synchronized edit to BOTH files still has to be
    // deliberate. The previous test only proves they agree — two documents can
    // agree on a wrong order.
    expect(orderedTiers(calibrateDecisionSection(), CALIBRATE_RULE_RE)).toEqual([
      'FULL',
      'SPIKE',
      'SKETCH',
      'FEATURE',
    ]);
  });

  it('tier-definitions.md documents the overlapping input that makes order load-bearing', () => {
    // A rule whose stated justification is missing gets "simplified" back out
    // by the next editor. The worked case is the justification.
    const section = tierDefsGateSection();
    expect(section).toMatch(/first-for-org/);
    expect(section).toMatch(/satisfies the SPIKE gates \*\*and\*\* the SKETCH gates/i);
  });

  it('the 2x2 intuition table is still flagged as not the whole story', () => {
    // The 2x2 above the gates maps LOW-stakes/HIGH-novelty to SPIKE and
    // LOW/LOW to SKETCH. Read alone it implies novelty alone separates them,
    // which the gates contradict. The caveat is what keeps it honest.
    expect(TIER_DEFS).toMatch(/It's not the whole story/i);
  });
});
