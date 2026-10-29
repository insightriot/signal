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
  verify = await readFile(join(ROOT, 'plugin', 'commands', 'verify.md'), 'utf8');
});

describe('AC1.4 — VERIFY is instructed to read REQUIREMENTS.md', () => {
  it('names the REQUIREMENTS artifact, which before M5.E10 it never did', () => {
    // Since the numbered-steps rewrite it is named by its lookup, not its file name.
    expect(verify).toContain("resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })");
  });

  it('orders the call by function name, so the instruction is checkable', () => {
    expect(verify).toMatch(/diffRequirementCoverage/);
    expect(verify).toMatch(/tools\/lib\/requirement-coverage\.js/);
  });

  it('orders the FR2 call too', () => {
    expect(verify).toMatch(/checkValidationConsistency/);
    expect(verify).toMatch(/tools\/lib\/validation-consistency\.js/);
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

describe('AC3.1 — the template gate blocks the phase', () => {
  it('orders the validator by name and points at the template', () => {
    expect(verify).toMatch(/validateVerificationContent/);
    expect(verify).toMatch(/references\/verification-template\.md/);
  });

  it('states the pairing, so a green structural result is not read as verification', () => {
    expect(verify.replace(/\s+/g, ' ')).toMatch(/not that the answers are right/);
  });
});

describe('the steps are in the exit criteria, not only the workflow', () => {
  it('a run cannot pass the gate without either half', () => {
    const exitSection = verify.slice(verify.indexOf('### Exit Criteria'));
    expect(exitSection).toMatch(/Requirement coverage run/);
    expect(exitSection).toMatch(/validateVerificationContent/);
  });
});
