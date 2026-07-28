import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, accessSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENTRY_POINT = join(ROOT, 'tools/adherence-run.js');
const ENTRY_POINT_BASENAME = 'adherence-run.js';

/**
 * AC1.2 / NFR1 — the harness stays OUT of the test suite.
 *
 * `npm test` must remain deterministic, offline and free. The entry point in
 * tools/adherence-run.js invokes a real agent and costs real money; a single
 * `import` of it from a test file would make the suite non-deterministic, slow,
 * paid, and — worst — would make a red suite mean "the API was down" instead of
 * "the code is wrong".
 *
 * This guard is a mechanical check that the seam holds. It is the counterpart to
 * tests/adherence-harness.test.js, which imports only the PURE mechanics.
 *
 * WHAT THIS CANNOT PROVE: that the suite is free of agent calls by some other
 * route. It proves this specific, obvious one is closed.
 */

function testFiles() {
  const out = [];
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.js')) out.push(p);
    }
  };
  walk(__dirname);
  return out;
}

describe('adherence harness — suite isolation (AC1.2)', () => {
  it('the agent-invoking entry point exists and is executable', () => {
    expect(existsSync(ENTRY_POINT)).toBe(true);
    expect(() => accessSync(ENTRY_POINT, constants.X_OK)).not.toThrow();
  });

  it('NO test file imports the entry point', () => {
    const offenders = [];
    for (const file of testFiles()) {
      if (file.endsWith('adherence-suite-guard.test.js')) continue; // names it as data
      const src = readFileSync(file, 'utf-8');
      const importsIt =
        /\bfrom\s+['"][^'"]*adherence-run(\.js)?['"]/.test(src) ||
        /\bimport\s*\(\s*['"][^'"]*adherence-run(\.js)?['"]/.test(src) ||
        /\brequire\s*\(\s*['"][^'"]*adherence-run(\.js)?['"]/.test(src);
      if (importsIt) offenders.push(file.replace(ROOT + '/', ''));
    }
    expect(offenders).toEqual([]);
  });

  it('the entry point is the ONLY place the agent CLI is actually spawned', () => {
    // The pure mechanics module may NAME the CLI (it resolves --version through an
    // injectable exec), but must never spawn it with `-p` / `--print`, which is
    // what costs money.
    const mechanics = readFileSync(join(ROOT, 'tools/lib/adherence-harness.js'), 'utf-8');
    expect(mechanics).not.toMatch(/['"]--print['"]/);
    expect(mechanics).not.toMatch(/\[\s*['"]-p['"]/);
  });

  it('no test file shells out to the entry point either', () => {
    // Scoped to actual spawn sites, not any mention: a doc comment naming the
    // entry point (as tests/adherence-harness.test.js does, to document the seam)
    // is not a violation. The first draft of this check flagged exactly that.
    const SPAWN = /\b(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/;
    const offenders = [];
    for (const file of testFiles()) {
      if (file.endsWith('adherence-suite-guard.test.js')) continue;
      const src = readFileSync(file, 'utf-8');
      for (const line of src.split('\n')) {
        if (line.includes(ENTRY_POINT_BASENAME) && SPAWN.test(line)) {
          offenders.push(`${file.replace(ROOT + '/', '')}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
