import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SHIP = join(ROOT, 'plugin/commands/ship.md');

/**
 * FR6 / AC6.1–AC6.3 — the pre-ship checklist anchor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TEST PROVES: the checklist line EXISTS in commands/ship.md.
 *
 * WHAT IT CANNOT PROVE — and this label is the point of the test, not a caveat
 * appended to it: that any maintainer ever reads the line, or acts on it. A
 * green result here is evidence about a file's contents and nothing else.
 *
 * The precedent is M5.E9, which shipped a phase-entry instruction it could not
 * verify and said so in its own test header rather than let a passing test imply
 * otherwise. That admission is what opened M5.E8. Repeating the label here keeps
 * the same honesty at the same cost.
 *
 * D-M5E8-3 chose the checklist over a trigger deliberately: `B39` established
 * that Signal's triggers have never once been walked. A checklist line a human
 * reads at ship time is weaker than a mechanism and stronger than a trigger
 * nobody runs — and that trade is recorded rather than papered over.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe('ship.md pre-ship checklist — adherence anchor (AC6.1–6.3)', () => {
  const ship = readFileSync(SHIP, 'utf-8');

  it('§1 Pre-Ship Checklist contains an adherence line', () => {
    const section = ship.slice(ship.indexOf('### 1. Pre-Ship Checklist'), ship.indexOf('### 2. Git History'));
    expect(section).toMatch(/adherence/i);
  });

  it('the line names the command a maintainer would actually run', () => {
    const section = ship.slice(ship.indexOf('### 1. Pre-Ship Checklist'), ship.indexOf('### 2. Git History'));
    expect(section).toContain('tools/adherence-run.js');
  });

  it('the line is scoped to command WORDING changes, per FR6', () => {
    const section = ship.slice(ship.indexOf('### 1. Pre-Ship Checklist'), ship.indexOf('### 2. Git History'));
    const line = section.split('\n').find(l => /adherence/i.test(l));
    expect(line).toMatch(/wording|command file|commands\//i);
  });

  it('it sits beside the existing docs/map line (AC6.1)', () => {
    const lines = ship.split('\n');
    const mapAt = lines.findIndex(l => l.includes('docs/map'));
    const adherenceAt = lines.findIndex(l => /adherence/i.test(l) && l.trim().startsWith('- [ ]'));
    expect(mapAt).toBeGreaterThan(-1);
    expect(adherenceAt).toBeGreaterThan(-1);
    expect(Math.abs(adherenceAt - mapAt)).toBeLessThanOrEqual(3);
  });

  it('"no run needed" is a valid outcome — the line must not read as mandatory ceremony', () => {
    const section = ship.slice(ship.indexOf('### 1. Pre-Ship Checklist'), ship.indexOf('### 2. Git History'));
    const line = section.split('\n').find(l => /adherence/i.test(l));
    expect(line).toMatch(/valid outcome|if .* changed|no run needed/i);
  });
});
