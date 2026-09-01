import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { canProceedUnattended } from '../plugin/tools/lib/drive.js';
import { LOOP_BOUNDED_PHASES, loopStatusFor } from '../plugin/tools/lib/loop-ceiling.js';

const ROOT = join(import.meta.dirname, '..');
const DRIVE_MD = join(ROOT, 'plugin/commands/drive.md');

const readDrive = () => readFile(DRIVE_MD, 'utf-8');

/**
 * B113 — `drive.md` documented the two-argument call to `canProceedUnattended`, and the
 * ceiling that call is supposed to enforce can therefore only ever refuse.
 *
 * The call site is PROSE, which is why nothing caught it: the suite covered the function
 * and never the only file that calls it. These tests read the command file itself, so the
 * defect cannot come back silently.
 */
describe('B113 — drive.md documents a call that can actually pass the loop ceiling', () => {
  it('the documented canProceedUnattended call passes loopStatus', async () => {
    const md = await readDrive();
    const calls = [...md.matchAll(/canProceedUnattended\(([^)]*)\)/g)].map((m) => m[1]);

    expect(calls.length).toBeGreaterThan(0);
    // Every documented call — not just the first — has to carry the third argument.
    for (const args of calls) {
      expect(args).toMatch(/loopStatus/);
    }
  });

  it('drive.md names loopStatusFor, the only thing that can produce that argument', async () => {
    const md = await readDrive();
    expect(md).toMatch(/loopStatusFor/);
  });

  it('drive.md can render both refusal reasons the ceiling produces', async () => {
    const md = await readDrive();
    // `loop-unknown` and `loop-ceiling` are kept distinct in code precisely so a halt says
    // which one happened; a command file that names neither cannot honour that.
    expect(md).toMatch(/loop-ceiling/);
    expect(md).toMatch(/loop-unknown/);
  });

  it('the two-argument call it used to document really does refuse at every bounded phase', () => {
    // The proof this test exists: the old shape is not merely untidy, it is a permanent halt.
    const profile = { tier: 'FULL', rigor_overrides: { gate_strictness: 'off' } };
    for (const phase of LOOP_BOUNDED_PHASES) {
      const twoArg = canProceedUnattended(phase, profile);
      expect(twoArg.proceed).toBe(false);
      expect(twoArg.reason).toBe('loop-unknown');
    }
  });

  it('the documented three-argument shape can proceed when the count is under the ceiling', () => {
    const profile = { tier: 'FULL', rigor_overrides: { gate_strictness: 'off' } };
    for (const phase of LOOP_BOUNDED_PHASES) {
      const state = { completed_phases: [] };
      const loopStatus = loopStatusFor(state, phase);
      expect(loopStatus).not.toBeNull();
      const r = canProceedUnattended(phase, profile, { loopStatus });
      expect(r.reason).not.toBe('loop-unknown');
    }
  });
});

/**
 * The generalisation, and the reason this file is not a single assertion.
 *
 * `drive.md` carries an "Authoritative references" list naming module symbols. B113 was
 * that list being INCOMPLETE — `loopStatusFor` was missing, and the body matched the list
 * rather than the code. So the whole list is checked against real exports: a symbol named
 * there that does not exist, or a reference to a module that does not, fails the suite.
 */
describe('drive.md — every symbol its reference list names actually exists', () => {
  it('resolves every listed module symbol against the real module', async () => {
    const md = await readDrive();
    const lines = md.split('\n');
    const refs = lines
      .filter((l) => /^- `tools\/lib\/[\w-]+\.js` — /.test(l))
      .map((l) => {
        const modPath = /^- `(tools\/lib\/[\w-]+\.js)`/.exec(l)[1];
        const symbols = [...l.slice(l.indexOf('—')).matchAll(/`([A-Za-z_][\w]*)`/g)].map(
          (m) => m[1],
        );
        return { modPath, symbols };
      });

    expect(refs.length).toBeGreaterThan(0);

    for (const { modPath, symbols } of refs) {
      const mod = await import(join(ROOT, 'plugin', modPath));
      for (const sym of symbols) {
        expect(
          Object.hasOwn(mod, sym),
          `drive.md names \`${sym}\` from ${modPath}, which does not export it`,
        ).toBe(true);
      }
    }
  });
});
