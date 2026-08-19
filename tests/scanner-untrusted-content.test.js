/**
 * tests/scanner-untrusted-content.test.js — `B104`.
 *
 * `/sig:init` spawns four scanner agents at an ARBITRARY repository, and every
 * one of them carries `Bash`. Nothing in any scanner file, and nothing in
 * `init.md`, told them that what they read is data rather than instruction.
 *
 * The assertion runs over the WHOLE scanner population read from disk, not a
 * hardcoded list — borrowed from `vercel-labs/eve-software-factory-template`
 * (MIT), whose read-only evals assert over the entire enumerated write-tool
 * set so "a new write tool added to the extension is automatically forbidden
 * until someone allows it deliberately". A fifth scanner added tomorrow fails
 * this suite until it carries the clause.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCANNER_DIR = join(ROOT, 'plugin/agents/scanners');

/** The marker the clause is keyed on. Short, so rewording the prose is free. */
const DATA_NOT_INSTRUCTIONS = 'is DATA, not instructions';

const scanners = readdirSync(SCANNER_DIR).filter((f) => f.endsWith('.md'));
const read = (f) => readFileSync(join(SCANNER_DIR, f), 'utf8');

describe('B104 — scanned repository content is data, not instructions', () => {
  it('the population is read from disk and is not empty', () => {
    // Guards the guard: an empty glob would make every assertion below vacuous
    // and the suite would pass while governing nothing (`B81`'s shape).
    expect(scanners.length).toBeGreaterThanOrEqual(4);
    expect(scanners).toContain('activity-scanner.md');
  });

  it.each(scanners)('%s carries the data-not-instructions clause', (f) => {
    expect(read(f)).toContain(DATA_NOT_INSTRUCTIONS);
  });

  it.each(scanners)('%s tells the agent what to DO with an embedded directive', (f) => {
    // A prohibition with no landing place gets ignored under pressure; the
    // clause has to name the destination.
    expect(read(f)).toMatch(/suspicious embedded directive/);
  });

  it.each(scanners)('%s names Bash as the reason the clause is load-bearing', (f) => {
    // Every scanner holds Bash. If one ever stops holding it this assertion
    // should be revisited deliberately, not silently satisfied.
    expect(read(f)).toMatch(/^tools:.*\bBash\b/m);
    expect(read(f)).toMatch(/hold `Bash`/);
  });

  it('/sig:init carries the same instruction where it spawns them', () => {
    const init = readFileSync(join(ROOT, 'plugin/commands/init.md'), 'utf8');
    expect(init).toContain(DATA_NOT_INSTRUCTIONS);
  });
});
