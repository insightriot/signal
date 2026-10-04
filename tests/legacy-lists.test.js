// legacy-lists.js — the one home of every Markdown list parser (M6.E13 t4.1,
// Decision 12), and its test-only throw-on-call flag.
//
// Three properties, each of which t4.7's ban depends on:
//   (a) flag unset — no change: the old modules re-export the SAME function
//       objects, so a store-off caller reaches the guarded export and nothing
//       else (a shadow copy left behind would escape the flag);
//   (b) flag set — every exported function throws when called, naming itself;
//   (c) flag set — importing does not throw, for legacy-lists.js and for every
//       module that re-exports it or calls it (none computes a constant through
//       a parser at import time).
//
// The flag is only ever set in a child process or through `vi.stubEnv`, never
// assigned in-process: the guard reads it at call time, so a leak would fail
// every test that runs after it in this worker.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as legacy from '../plugin/tools/lib/legacy-lists.js';
import * as bugsTally from '../plugin/tools/lib/bugs-tally.js';
import * as backlog from '../plugin/tools/lib/backlog.js';

const LIB = join(process.cwd(), 'plugin', 'tools', 'lib');
const FLAG = 'SIGNAL_FORBID_LIST_PARSERS';

// Every name a former home re-exports, by module. Grows as each module's
// parsers move.
const RELOCATED = [
  [
    'bugs-tally.js',
    bugsTally,
    ['BUG_STATUSES', 'parseStatusCell', 'walkBugEntries', 'deriveBugCounts', 'readPublishedTally', 'compareBugTally'],
  ],
  ['backlog.js', backlog, ['DONE_WORD_RE', 'declaresBugDischarge', 'parseBacklogRows']],
];

// Every module that re-exports legacy-lists.js or calls into it.
const IMPORTERS = ['legacy-lists.js', 'bugs-tally.js', 'backlog.js', 'advise.js', 'advise-priorities.js'];

const functions = Object.entries(legacy).filter(([, v]) => typeof v === 'function');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('legacy-lists — flag unset: nothing changes', () => {
  it('exports at least one function (guards a hollow enumeration below)', () => {
    expect(functions.length).toBeGreaterThan(0);
  });

  for (const [mod, ns, names] of RELOCATED) {
    it(`${mod} re-exports the same objects legacy-lists.js exports, not copies`, () => {
      for (const name of names) {
        expect(legacy[name], `${name} missing from legacy-lists.js`).toBeDefined();
        expect(ns[name], `${mod} no longer re-exports ${name}`).toBe(legacy[name]);
      }
    });
  }

  it('a wrapped export keeps its name and forwards its result', () => {
    expect(legacy.parseStatusCell.name).toBe('parseStatusCell');
    expect(legacy.parseStatusCell('`fixed` (v0.1.13)')).toBe('fixed');
    expect(legacy.deriveBugCounts('| B1 | `confirmed` |\n').confirmed).toBe(1);
  });

  it('the flag must equal "1" exactly — any other value is unset', () => {
    vi.stubEnv(FLAG, 'true');
    expect(legacy.parseStatusCell('fixed')).toBe('fixed');
  });
});

describe('legacy-lists — flag set: every exported function throws when called', () => {
  for (const [name, fn] of functions) {
    it(`${name} throws, naming itself`, () => {
      vi.stubEnv(FLAG, '1');
      expect(() => fn('')).toThrow(new RegExp(`legacy-lists: ${name}\\(\\) was called while ${FLAG}=1`));
    });
  }

  it('the old modules hand out the guarded function, so a call through them throws too', () => {
    vi.stubEnv(FLAG, '1');
    expect(() => bugsTally.walkBugEntries('')).toThrow(/walkBugEntries\(\)/);
  });
});

describe('legacy-lists — flag set: importing does not throw', () => {
  it('every module that re-exports or calls legacy-lists.js imports cleanly', () => {
    const urls = IMPORTERS.map((f) => pathToFileURL(join(LIB, f)).href);
    const script = `for (const u of ${JSON.stringify(urls)}) await import(u); console.log('imported ' + ${urls.length});`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, [FLAG]: '1' },
      encoding: 'utf-8',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(`imported ${urls.length}`);
  });
});
