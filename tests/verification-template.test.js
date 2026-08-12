/**
 * tests/verification-template.test.js — FR3's template and its gate.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateVerificationContent,
  getRequiredVerificationSections,
} from '../tools/lib/verification-template.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const LIMITS = [
  '## What this could not establish',
  '',
  'Two end-to-end paths are asserted at the integration layer rather than in the browser suite,',
  'and the migration path was not exercised against a populated database.',
].join('\n');

const good = (tier) =>
  ({
    FULL: [
      '## Verdict',
      '',
      'PASS with two documented limits. Every declared requirement is verified.',
      '',
      '## Gate results',
      '',
      '| Gate | Result |',
      '|---|---|',
      '| Test suite | 2485 passed / 0 failed (baseline 2410) |',
      '',
      '## Requirement coverage',
      '',
      '**Coverage: 11 of 11**, scoped to groups FR-16 and NFR-9.',
      'Missing: none. Deferred: AC-16.3. Could not evaluate: no groups unattributed.',
      '',
      '## Nyquist compliance',
      '',
      'Every criterion has red-before-green evidence except AC5.1, a declared deviation.',
      '',
      LIMITS,
    ],
    SKETCH: [
      '## Verdict',
      '',
      'PASS — the script does what it was written to do, checked by hand against three inputs.',
      '',
      '## Coverage',
      '',
      '3 of 3 behaviours checked; the total is the list in the one-line plan.',
      '',
      LIMITS,
    ],
  })[tier].join('\n');

describe('AC3.1 / AC3.3 — the locked sections', () => {
  it('every tier requires the limits section', () => {
    for (const tier of ['SKETCH', 'FEATURE', 'SPIKE', 'FULL']) {
      expect(getRequiredVerificationSections(tier)).toContain('## What this could not establish');
    }
  });

  it('throws on an unknown tier rather than silently requiring nothing', () => {
    expect(() => getRequiredVerificationSections('GOLD')).toThrow(/unknown tier/);
  });

  it('accepts a well-filled report', () => {
    expect(validateVerificationContent(good('FULL'), 'FULL')).toEqual({ valid: true, errors: [] });
    expect(validateVerificationContent(good('SKETCH'), 'SKETCH').valid).toBe(true);
  });
});

describe('AC3.1 — an artifact missing either element fails', () => {
  it('fails when the limits section is missing entirely', () => {
    const without = good('FULL').replace(LIMITS, '');
    const r = validateVerificationContent(without, 'FULL');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/missing required section heading "## What this could not establish"/);
  });

  it('fails when no denominator appears anywhere', () => {
    const bare = good('FULL').replace('**Coverage: 11 of 11**', '**All criteria verified**');
    const r = validateVerificationContent(bare, 'FULL');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/no denominator found/);
  });

  it('accepts 6/11 as readily as "6 of 11"', () => {
    const slash = good('FULL').replace('11 of 11', '11/11');
    expect(validateVerificationContent(slash, 'FULL').valid).toBe(true);
  });
});

describe('AC3.2 / RK3 — present-but-empty fails, because presence was never the requirement', () => {
  it('fails when the limits section has an empty body', () => {
    const empty = good('FULL').replace(LIMITS, '## What this could not establish\n');
    const r = validateVerificationContent(empty, 'FULL');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/empty body/);
  });

  it('fails when the limits section says "None."', () => {
    // The whole point of RK3: a heading everyone fills with one word is how a
    // required section becomes a formality.
    const token = good('FULL').replace(LIMITS, '## What this could not establish\n\nNone.\n');
    const r = validateVerificationContent(token, 'FULL');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/present but says nothing/);
  });

  it('accepts a genuine "this does not apply, and here is why"', () => {
    const explained = good('FULL').replace(
      LIMITS,
      [
        '## What this could not establish',
        '',
        'Nothing was left unexercised: this phase changed one pure function, and its',
        'entire input domain is enumerated by the test table above.',
      ].join('\n')
    );
    expect(validateVerificationContent(explained, 'FULL').valid).toBe(true);
  });
});

describe('NFR3 — malformed input never throws', () => {
  it('returns an error rather than throwing on empty / non-string content', () => {
    for (const bad of [null, undefined, '', '   ', 42]) {
      expect(validateVerificationContent(bad, 'FULL')).toEqual({
        valid: false,
        errors: ['verification report is empty'],
      });
    }
  });
});

describe('AC3.3 — the template states that it proves nothing alone', () => {
  it('says so in its own text, and names the check it is paired with', async () => {
    const template = await readFile(join(ROOT, 'references', 'verification-template.md'), 'utf8');
    expect(template).toMatch(/proves nothing on its own/i);
    expect(template).toMatch(/diffRequirementCoverage/);
    // The pairing is the claim: structure catches a report that never asked;
    // only the derived check tests the answer.
    expect(template).toMatch(/theatre/i);
  });

  it('the locked headings in the template match the validator exactly', async () => {
    const template = await readFile(join(ROOT, 'references', 'verification-template.md'), 'utf8');
    for (const tier of ['SKETCH', 'FEATURE', 'SPIKE', 'FULL']) {
      const block = template.slice(
        template.indexOf(`<!-- TEMPLATE: ${tier} -->`),
        template.indexOf(`<!-- /TEMPLATE: ${tier} -->`)
      );
      for (const heading of getRequiredVerificationSections(tier)) {
        expect(block, `${tier} template must contain ${heading}`).toContain(`${heading}\n`);
      }
    }
  });

  it('an UNFILLED template block fails the gate — copying it is not shipping it', async () => {
    // The tempting assertion is that each template block passes its own
    // validator. That would be wrong, and writing it is what showed why: a
    // template is a form, and `{n} of {total}` is a placeholder, not a
    // denominator. Making the blank form pass would mean accepting the exact
    // artifact this gate exists to reject — so the real requirement is the
    // opposite one, pinned here.
    const template = await readFile(join(ROOT, 'references', 'verification-template.md'), 'utf8');
    for (const tier of ['SKETCH', 'FULL']) {
      const block = template
        .slice(
          template.indexOf(`<!-- TEMPLATE: ${tier} -->`) + `<!-- TEMPLATE: ${tier} -->`.length,
          template.indexOf(`<!-- /TEMPLATE: ${tier} -->`)
        )
        .trim();
      const r = validateVerificationContent(block, tier);
      expect(r.valid, `the unfilled ${tier} template must not pass`).toBe(false);
      expect(r.errors.join(' ')).toMatch(/no denominator found/);
    }
  });
});
