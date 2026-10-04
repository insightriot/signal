// AC3.4 — the commands direct store-on work to `/sig:item` and the v2 library
// (M6.E13 t6.1, t6.2). See .planning/M6.E13-VALIDATION.md row AC3.4.
//
// A presence check, with the phase-recording.test.js caveat: it proves the
// files SAY it, not that an agent reading them does it. Three parts:
// - each of the 12 commands names `/sig:item` or `work-records.js`;
// - no command this Epic rewrote names a v1 status folder as where an item goes;
// - every function named on a line that mentions `work-records.js` or
//   `/sig:item` is a real export of `plugin/tools/lib/`.
// `docs-migrate.md` is in the population but is not edited (PLAN Decision 10);
// it already names `/sig:item`.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = join(ROOT, 'plugin', 'commands');
const LIB = join(ROOT, 'plugin', 'tools', 'lib');

const AC34 = [
  'advise', 'add', 'checkpoint', 'plan', 'ship', 'status', 'resume', 'drive',
  'item', 'docs-sweep', 'docs-migrate', 'new-project',
];
const read = (name) => readFileSync(join(COMMANDS, `${name}.md`), 'utf-8');

// Every name a lib module exports, read from source (importing all of them
// would run their module bodies).
const EXPORTS = new Set();
for (const f of readdirSync(LIB).filter((n) => n.endsWith('.js'))) {
  const src = readFileSync(join(LIB, f), 'utf-8');
  for (const m of src.matchAll(/^export (?:async )?(?:function\*? |const |let |class )(\w+)/gm)) EXPORTS.add(m[1]);
  for (const m of src.matchAll(/^export \{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) EXPORTS.add(name);
    }
  }
}

describe('AC3.4 — commands direct store-on work to /sig:item and the library', () => {
  it.each(AC34)('%s.md names /sig:item or work-records.js', (name) => {
    const text = read(name);
    expect(/\/sig:item\b/.test(text) || text.includes('work-records.js'), `${name}.md`).toBe(true);
  });

  it.each(['item', 'plan', 'checkpoint', 'add'])('%s.md names no v1 status folder as where an item lives', (name) => {
    const text = read(name);
    expect(text).not.toMatch(/\.planning\/work\/(inbox|backlog|done)\//);
    expect(text).not.toMatch(/folder is its status/i);
  });

  it.each(AC34.filter((n) => n !== 'docs-migrate'))(
    '%s.md: every function named beside work-records.js or /sig:item is a real lib export',
    (name) => {
      const lines = read(name).split('\n').filter((l) => l.includes('work-records.js') || /\/sig:item\b/.test(l));
      const named = new Set();
      for (const l of lines) {
        for (const m of l.matchAll(/`(\w+)\(/g)) named.add(m[1]);
        // A bare backticked camelCase name is a function reference in these files.
        for (const m of l.matchAll(/`([a-z]+[A-Z]\w*)`/g)) named.add(m[1]);
      }
      for (const fn of named) expect(EXPORTS.has(fn), `${name}.md names ${fn}, exported nowhere in plugin/tools/lib`).toBe(true);
    },
  );

  it('the v1 refusal is named where a store-on write can meet a v1 store', () => {
    for (const name of ['item', 'add', 'checkpoint', 'plan']) {
      expect(read(name), `${name}.md`).toContain('node tools/work-migrate-v2.mjs');
    }
  });
});
