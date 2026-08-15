import { describe, it, expect, afterEach } from 'vitest';
import { resolveSignalPath, PLUGIN_ROOT } from './helpers/roots.js';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPluginCopy, PLUGIN_COPY_EXCLUDE } from '../plugin/tools/lib/adherence-harness.js';
import { loadCanaryRegistry, CANARY_REGISTRY_PATH } from '../plugin/tools/lib/adherence-verdict.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// M6.E1: plugin-relative paths resolve against the plugin root.
const PLUGIN_DIR = join(ROOT, 'plugin');

/**
 * FR4 — the experiment leaves the room it is measuring.
 *
 * `references/adherence-canaries.json` carries the measured instruction VERBATIM,
 * plus the deletion anchors and the reasoning about what the control arm is
 * trying to prove. `references/` is inside the copied tree, so a control agent —
 * the one that is supposed to have never been told to call the function — could
 * read the whole experiment, including the sentence that was deleted from its
 * command file.
 *
 * That is not a hypothetical leak class. It is the same instruction, in the same
 * tree, one directory over.
 *
 * The exclusion is COPY-TIME, not a packaging change (AC4.3). The shipped plugin
 * must still contain the registry: `/sig:ship` instructs running the harness, and
 * a plugin missing its own canary registry cannot run it.
 */

const scratch = [];
afterEach(() => {
  while (scratch.length) rmSync(scratch.pop(), { recursive: true, force: true });
});

async function copy() {
  const c = await createPluginCopy(ROOT);
  scratch.push(c.root);
  return c;
}

describe('the canary registry leaves the plugin copy (FR4)', () => {
  it('AC4.1 — the copied tree does NOT contain the canary registry', async () => {
    const c = await copy();
    expect(existsSync(join(c.root, CANARY_REGISTRY_PATH))).toBe(false);
  });

  it('AC4.1 — the rest of references/ is copied unchanged', async () => {
    const c = await copy();
    const real = readdirSync(join(ROOT, 'plugin', 'references')).filter(f => f !== 'adherence-canaries.json');
    const copied = readdirSync(join(c.root, 'references'));
    expect(copied.sort()).toEqual(real.sort());
    // state-schema.md in particular: an agent stripped of it cannot understand
    // the file it is being asked to update, which is over-deletion.
    expect(existsSync(join(c.root, 'references', 'state-schema.md'))).toBe(true);
  });

  it('AC4.2 — a run still resolves the registry, because it reads the REAL root', async () => {
    await copy();
    const reg = loadCanaryRegistry(PLUGIN_DIR);
    expect(reg.canaries.find(c => c.id === 'B41-phase-entry')).toBeTruthy();
  });

  it('AC4.3 — the SHIPPED plugin still contains the registry: this is copy-time only', () => {
    // commands/ship.md instructs running `node tools/adherence-run.js`. A
    // packaging-level exclusion would break that documented instruction for
    // every user, to solve a problem that only exists inside a measurement.
    expect(existsSync(resolveSignalPath(CANARY_REGISTRY_PATH))).toBe(true);
  });

  it('the exclusion is declared as data, so a reader can see what is withheld', () => {
    expect(PLUGIN_COPY_EXCLUDE).toContain(CANARY_REGISTRY_PATH);
  });

  it('the exclusion stays ONE file — the harness modules are still copied', async () => {
    const c = await copy();
    // Excluding tools/ wholesale was considered and rejected: ship.md orders
    // `node tools/adherence-run.js`, so removing it would break a documented
    // instruction for any future canary measuring ship.md. The apparatus leak
    // that would have covered is handled at source by S1.t7 instead.
    expect(existsSync(join(c.root, 'tools', 'adherence-run.js'))).toBe(true);
    expect(existsSync(join(c.root, 'tools', 'lib', 'adherence-verdict.js'))).toBe(true);
    expect(PLUGIN_COPY_EXCLUDE).toHaveLength(1);
  });
});
