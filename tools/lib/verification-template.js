// FR3 — the VERIFICATION report's structural gate (M5.E10 S3.t2).
//
// Two elements every tier must carry: a DENOMINATOR TABLE ({n} of {total},
// never a bare count) and a "What this could not establish" section.
//
// The mechanism is `validateRetroContent`'s, reused rather than reinvented:
// exact-string-locked headings, non-empty bodies, and a byte threshold. That
// combination has already survived contact with stub artifacts, which is the
// failure mode here too — `B64` was a stub retrospective passing for closure at
// five separate decision sites.
//
// WHAT THIS GATE DOES NOT DO, stated here because `AC3.3` requires the pairing
// to be visible in the artifact itself: it checks that the report ASKED the
// questions. It cannot check the answers. A denominator can be wrong and a
// limits section can omit the limit that mattered. Only FR1's
// `diffRequirementCoverage` compares the report against the requirements.
//
// PRESENT-BUT-EMPTY FAILS (`AC3.2` / RK3). Structural presence was never the
// requirement. "None" under a required heading is how a section becomes a
// formality, so a minimum body size applies to the limits section specifically
// — the one most likely to be filled with a word.

import { parseSections } from './retrospective.js';

const LIMITS_HEADING = '## What this could not establish';

const TIER_SECTIONS = Object.freeze({
  SKETCH: ['## Verdict', '## Coverage', LIMITS_HEADING],
  FEATURE: ['## Verdict', '## Gate results', '## Requirement coverage', LIMITS_HEADING],
  SPIKE: ['## Verdict', '## What the spike established', LIMITS_HEADING],
  FULL: [
    '## Verdict',
    '## Gate results',
    '## Requirement coverage',
    '## Nyquist compliance',
    LIMITS_HEADING,
  ],
});

// Total content floor per tier. The SHAPE is the retro validator's; the VALUES
// are not, and copying them was the first thing that broke — the retro floors
// are calibrated for eight sections of narrative, and rejected a terse but
// complete five-section verification report at 653 bytes. Roughly one filled
// sentence per required section, which is what a floor is for: rejecting a
// stub, not legislating length.
const BYTE_THRESHOLDS = Object.freeze({
  SKETCH: 240,
  FEATURE: 400,
  SPIKE: 280,
  FULL: 600,
});

// The limits section's own floor. Deliberately flat across tiers: the reason a
// SKETCH gets a smaller report is fewer sections, not a thinner account of what
// went unchecked. ~1 sentence.
const LIMITS_BODY_MIN_BYTES = 60;

// `6 of 11`, `6/11`, `6 of 11 criteria`. A bare count never matches.
const DENOMINATOR_RE = /\b\d+\s*(?:of|\/)\s*\d+\b/;

/**
 * The locked headings for a tier.
 * @param {string} tier
 * @returns {string[]}
 */
export function getRequiredVerificationSections(tier) {
  const sections = TIER_SECTIONS[tier];
  if (!sections) {
    throw new Error(
      `getRequiredVerificationSections: unknown tier "${tier}" (expected one of SKETCH, FEATURE, SPIKE, FULL)`
    );
  }
  return [...sections];
}

/**
 * Validate a VERIFICATION artifact's structure against its tier's contract.
 *
 * @param {string|null|undefined} content
 * @param {string} tier
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateVerificationContent(content, tier) {
  const required = getRequiredVerificationSections(tier);
  const errors = [];

  if (content == null || typeof content !== 'string' || content.trim().length === 0) {
    return { valid: false, errors: ['verification report is empty'] };
  }

  const { headings, sectionsByHeading } = parseSections(content);
  const headingSet = new Set(headings);

  for (const heading of required) {
    if (!headingSet.has(heading)) {
      errors.push(`missing required section heading "${heading}" for ${tier} tier`);
      continue;
    }
    const body = sectionsByHeading[heading] ?? '';
    if (body.trim().length === 0) {
      errors.push(
        `required section "${heading}" has empty body — every required section needs substantive content`
      );
      continue;
    }
    if (heading === LIMITS_HEADING && Buffer.byteLength(body.trim(), 'utf-8') < LIMITS_BODY_MIN_BYTES) {
      // The section most likely to be answered with a word, and the one whose
      // absence is least visible — a report naming no limits reads as a report
      // with none.
      errors.push(
        `required section "${heading}" is present but says nothing (${Buffer.byteLength(
          body.trim(),
          'utf-8'
        )} bytes, minimum ${LIMITS_BODY_MIN_BYTES}) — if a limit genuinely does not apply, write the sentence explaining why`
      );
    }
  }

  if (!DENOMINATOR_RE.test(content)) {
    errors.push(
      'no denominator found — every coverage claim must read "{n} of {total}", never a bare count. A total that was never stated cannot be checked by a reader'
    );
  }

  const threshold = BYTE_THRESHOLDS[tier];
  const byteLength = Buffer.byteLength(content, 'utf-8');
  if (threshold && byteLength < threshold) {
    errors.push(
      `verification content is too short: ${byteLength} bytes is below the ${tier} threshold of ${threshold} bytes`
    );
  }

  return { valid: errors.length === 0, errors };
}
