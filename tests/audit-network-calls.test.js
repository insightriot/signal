import { describe, it, expect } from 'vitest';
import { existsSync, accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'tools/audit-network-calls.js');
const SEEDED_FIXTURE = join(__dirname, 'fixtures/audit-network-calls-seeded');

/**
 * Privacy-posture contract for tools/audit-network-calls.js.
 *
 * Pinned at RED commit time (M4.5.E3.S1.t1) before the script exists.
 * Turns GREEN when S1.t2 implements the script. The audit script is the
 * automated verification mechanism behind README's "no network calls
 * beyond Claude's API" claim.
 */

describe('tools/audit-network-calls.js — contract', () => {
  it('exists and is executable', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    expect(() => accessSync(SCRIPT, constants.X_OK)).not.toThrow();
  });

  it('exits 0 against the current repo (no network calls in source dirs)', () => {
    const result = spawnSync('node', [SCRIPT], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
  });

  it('exits 1 + reports the violation path when given a directory containing fetch()', () => {
    const result = spawnSync('node', [SCRIPT, SEEDED_FIXTURE], { encoding: 'utf-8' });
    expect(result.status).toBe(1);
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toMatch(/with-fetch\.js/);
  });
});
