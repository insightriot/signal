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
import * as drain from '../plugin/tools/lib/drain.js';
import * as status from '../plugin/tools/lib/status.js';
import * as workMarker from '../plugin/tools/lib/work-marker.js';

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
  [
    'drain.js',
    drain,
    ['parseEntries', 'listDrainCandidates', 'listStandingEntries', 'listDrainCandidatesWithRecovery', 'parseTriggerWatchlist'],
  ],
  ['status.js', status, ['extractTopOpenQuestions', 'countOpenQuestions']],
  ['work-marker.js', workMarker, ['parseInboxStatusLine']],
];

// Every module that re-exports legacy-lists.js or calls into it.
const IMPORTERS = ['legacy-lists.js', 'bugs-tally.js', 'backlog.js', 'advise.js', 'advise-priorities.js', 'drain.js', 'status.js',
  'work-marker.js', 'atomic-write.js', 'drive.js', 'advise-digest.js', 'advise-corpus.js', 'doc-hygiene.js'];

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

describe('legacy-lists — the inline parsers, named: same answers as the expressions they replace', () => {
  it('openQuestionsNaming: `## ` headings naming the Epic, struck ones skipped, trimmed', () => {
    const oq = ['# Q', '## M1.E2 — open one ', '## ~~M1.E2 answered~~', '### M1.E2 nested', '## other', '##M1.E2 no space'].join('\n');
    expect(legacy.openQuestionsNaming(oq, 'M1.E2')).toEqual(['M1.E2 — open one']);
  });

  it('listOpenQuestions: every `## ` heading not struck, with its 1-indexed line', () => {
    const oq = ['# Q', '## first?', '## ~~done~~', 'text', '## should it fail closed?'].join('\n');
    expect(legacy.listOpenQuestions(oq)).toEqual([
      { line: 2, text: 'first?' },
      { line: 5, text: 'should it fail closed?' },
    ]);
  });

  it('countInboxHeadings counts `## ` lines only', () => {
    expect(legacy.countInboxHeadings('# Inbox\n## a\n### b\n## c\n')).toBe(2);
  });

  it('bugRowPriority and bugRowHeadline read the 3rd and 4th cells of a BUGS.md row', () => {
    const row = '| B7 | `confirmed` | P2 | the headline | more |';
    expect(legacy.bugRowPriority(row)).toBe('P2');
    expect(legacy.bugRowPriority(null)).toBe(null);
    expect(legacy.bugRowPriority('| B7 | `confirmed` | — | x |')).toBe(null);
    expect(legacy.bugRowHeadline(row)).toBe('the headline');
    expect(legacy.bugRowHeadline('| B7 |')).toBe('');
  });

  it('hasSectionHeadings: `##`–`######` followed by a space or tab', () => {
    expect(legacy.hasSectionHeadings('# Title\nprose')).toBe(false);
    expect(legacy.hasSectionHeadings('intro\n### Row')).toBe(true);
    expect(legacy.hasSectionHeadings('##\tRow')).toBe(true);
  });

  it('definedBugIds: table-row ids and heading ids, never a mention', () => {
    const bugs = ['| B1 | `fixed` |', '## B22 — a heading capture', 'prose citing B3', '|B4|x|'].join('\n');
    expect([...legacy.definedBugIds(bugs)].sort()).toEqual(['B1', 'B22', 'B4']);
  });

  it('citedBugIds: every word-bounded mention, in order, repeats kept', () => {
    expect(legacy.citedBugIds('B1 and B12, B1 again; AB3 and B12345 are not')).toEqual(['B1', 'B12', 'B1']);
  });

  it('isBugId: a bare bug id only', () => {
    expect(['B1', 'B120'].map(legacy.isBugId)).toEqual([true, true]);
    expect(['b1', 'B', 'M6.E13', ' B1', null].map(legacy.isBugId)).toEqual([false, false, false, false, false]);
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
