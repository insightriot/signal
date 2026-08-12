/**
 * tests/verify-coverage-wiring.test.js — AC1.4 + AC6.1.
 *
 * FR1's check is only worth building if a run is instructed to call it. This
 * pins the instruction, not the prose around it: `M5.E13` is the precedent for
 * a guard that existed and was never called, and `B39` for a check whose
 * silence read as a clean result.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
let verify;

beforeAll(async () => {
  verify = await readFile(join(ROOT, 'commands', 'verify.md'), 'utf8');
});

describe('AC1.4 — VERIFY is instructed to read REQUIREMENTS.md', () => {
  it('names the REQUIREMENTS artifact, which before M5.E10 it never did', () => {
    expect(verify).toMatch(/REQUIREMENTS\.md/);
  });

  it('orders the call by function name, so the instruction is checkable', () => {
    expect(verify).toMatch(/diffRequirementCoverage/);
    expect(verify).toMatch(/tools\/lib\/requirement-coverage\.js/);
  });

  it('orders the FR2 call too', () => {
    expect(verify).toMatch(/checkValidationConsistency/);
    expect(verify).toMatch(/tools\/lib\/validation-consistency\.js/);
  });

  it('says why a task loop is not enough — the reason travels with the instruction', () => {
    // Without this, a later editor reads Step 1b as duplicating Step 1 and
    // removes it. The justification is the load-bearing part.
    expect(verify).toMatch(/never became a task acceptance criterion/i);
  });
});

describe('AC6.1 — the denominator discipline is in the command text', () => {
  it('requires the denominator, not just the count', () => {
    expect(verify).toMatch(/\{n\} of \{total\}/);
    expect(verify).toMatch(/denominator/i);
  });

  it('requires the un-evaluable set to be reported, at zero as well', () => {
    expect(verify).toMatch(/including at zero/i);
    expect(verify).toMatch(/could not look at/i);
  });

  it('names missing requirements rather than counting them', () => {
    expect(verify).toMatch(/\*\*Name them\.\*\*/);
  });
});

describe('the step is in the exit criteria, not only the workflow', () => {
  it('a run cannot pass the gate without it', () => {
    const exitSection = verify.slice(verify.indexOf('### Exit Criteria'));
    expect(exitSection).toMatch(/Requirement coverage run/);
  });
});
