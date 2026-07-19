// SHIP §8 — Curator retired, native INDEX reconcile (M5.E3.S6b.t2 / FR6 / AC6.4).
//
// The old ship.md §8 shelled out to the external Curator CLI to regenerate doc
// indexes. FR3 landed a Signal-native INDEX generator (regeneratePlanningIndex,
// planning-index.js), FR4 the all-docs hygiene guard, and FR2 the inbox sweep —
// together they cover what Curator did. AC6.4: the §8 Curator step is removed, SHIP
// reconciles INDEX natively, and NO Signal command invokes `curator`.
//
// These are prose/grep assertions on the command files (the behavioral correctness
// of regeneratePlanningIndex is S2's coverage; this task only rewires ship.md).
// Nothing here touches Signal's real `.planning/` — no regen is run.

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMMANDS_DIR = join(ROOT, 'commands');

describe('SHIP §8 — Curator retired, native INDEX reconcile (S6b.t2 / FR6 / AC6.4)', () => {
  it('AC6.4: ship.md reconciles INDEX natively via regeneratePlanningIndex', async () => {
    const ship = await readFile(join(COMMANDS_DIR, 'ship.md'), 'utf-8');
    // The native FR3 INDEX generator (planning-index.js). Distinct from §6's
    // regenerateIndex (retro-index.js → RETROSPECTIVES.md) — a different file.
    expect(ship).toMatch(/regeneratePlanningIndex/);
  });

  it('AC6.4: ship.md no longer invokes Curator (case-insensitive — heading, prose, bash, URL)', async () => {
    const ship = await readFile(join(COMMANDS_DIR, 'ship.md'), 'utf-8');
    expect(ship).not.toMatch(/curator/i);
  });

  it('AC6.4: no Signal command file invokes curator', async () => {
    const files = (await readdir(COMMANDS_DIR)).filter((f) => f.endsWith('.md'));
    const offenders = [];
    for (const f of files) {
      const content = await readFile(join(COMMANDS_DIR, f), 'utf-8');
      if (/curator/i.test(content)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
