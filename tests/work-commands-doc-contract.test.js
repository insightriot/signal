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

  // REVIEW I4: ship.md § 6.6 still told a v1 store to move closed items into
  // `done/YYYY-MM/` after the code had started refusing v1 with CONFIG. The v1
  // folder moves are gone everywhere, so no command describes one.
  it('no command describes a v1 folder move (`done/YYYY-MM/`, `work/(inbox|backlog|done)/`)', () => {
    const all = readdirSync(COMMANDS).filter((n) => n.endsWith('.md'));
    expect(all.length).toBeGreaterThanOrEqual(AC34.length);
    const hits = [];
    for (const f of all) {
      readFileSync(join(COMMANDS, f), 'utf-8').split('\n').forEach((l, i) => {
        if (/done\/YYYY-MM\/|work\/(inbox|backlog|done)\//.test(l)) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('the v1 refusal is named where a store-on write can meet a v1 store', () => {
    for (const name of ['item', 'add', 'checkpoint', 'plan']) {
      expect(read(name), `${name}.md`).toContain('node tools/work-migrate-v2.mjs');
    }
  });
});

// M6.E16 AC3.1 (t3.1) — the two commands that open an Epic do it through
// `openEpic` (`work-ops.js`), which creates the unit record and then calls
// `setCurrentEpic`. A presence check, with the caveat at the top of this file.
describe('M6.E16 AC3.1 — the commands that open an Epic name openEpic', () => {
  const section = (text, from, to) => {
    const start = text.indexOf(from);
    expect(start, `no "${from}" heading`).toBeGreaterThan(-1);
    const end = text.indexOf(to, start + from.length);
    return text.slice(start, end === -1 ? undefined : end);
  };
  const OPENERS = [
    ['discuss', '## Epic mode (', '\n## Workflow'],
    ['new-project', '### 1b. Epic mode', '\n### 2'],
  ];

  it('openEpic is a real lib export', () => {
    expect(EXPORTS.has('openEpic')).toBe(true);
  });

  it.each(OPENERS)('%s.md opens the Epic with openEpic, from work-ops.js', (name, from, to) => {
    const text = section(read(name), from, to);
    expect(text).toMatch(/call `openEpic\(baseDir, resolvedId, \{ ?by/);
    expect(text).toContain('tools/lib/work-ops.js');
  });

  it.each(OPENERS)('%s.md no longer tells the reader to call setCurrentEpic directly', (name, from, to) => {
    expect(section(read(name), from, to)).not.toMatch(/call `setCurrentEpic\(/);
  });

  it.each(OPENERS)('%s.md says a closed Epic is refused, and what `force` is for', (name, from, to) => {
    const text = section(read(name), from, to);
    expect(text).toMatch(/closed/);
    expect(text).toMatch(/`force: true`/);
  });
});


// M6.E16 t9.1 — the ten command files this Epic touched, checked against the
// library for the unit-record functions they name. A presence check, with the
// caveat at the top of this file. Two parts that hold whenever the names are
// right (so they pass on a tree whose names are right, and fail when a
// function is renamed, moved to another module, or misspelt in a command
// file), and one part that pins the wording t9.0 and t9.1 corrected.
describe('M6.E16 t9.1 — the command files name real unit-record functions, and say what the library does', () => {
  const UNIT_COMMANDS = [
    'discuss', 'new-project', 'item', 'ship', 'docs-sweep', 'resume', 'docs-archive', 'checkpoint', 'drive', 'docs-migrate',
  ];
  // Exports by module, read from source as EXPORTS is.
  const EXPORTS_BY_MODULE = new Map();
  for (const f of readdirSync(LIB).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(LIB, f), 'utf-8');
    const names = new Set();
    for (const m of src.matchAll(/^export (?:async )?(?:function\*? |const |let |class )(\w+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export \{([^}]+)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop();
        if (name) names.add(name);
      }
    }
    EXPORTS_BY_MODULE.set(f, names);
  }
  // Backticked camelCase names on these lines that are an option or a result
  // field, not a function. Listed, so a new one is a decision and not a pass.
  const NOT_FUNCTIONS = new Set(['closesLine', 'expectedHash', 'inputHash', 'confirmUnitCloses', 'holdReason', 'evictionLine', 'archivePath', 'rerequestedItems']);
  const UNIT_LINE = /unit record|work\/units|unit-records\.js|work-ops\.js/i;

  it.each(UNIT_COMMANDS)('%s.md: every function named on a line about unit records is a real lib export', (name) => {
    const lines = read(name).split('\n').filter((l) => UNIT_LINE.test(l));
    expect(lines.length, `${name}.md says nothing about unit records`).toBeGreaterThan(0);
    const named = new Set();
    for (const l of lines) {
      for (const m of l.matchAll(/`(\w+)\(/g)) named.add(m[1]);
      for (const m of l.matchAll(/`([a-z]+[A-Z]\w*)`/g)) named.add(m[1]);
    }
    for (const fn of named) {
      if (NOT_FUNCTIONS.has(fn)) continue;
      expect(EXPORTS.has(fn), `${name}.md names ${fn}, exported nowhere in plugin/tools/lib`).toBe(true);
    }
  });

  // `fn(…)` or `fn`, then the module it is said to come from:
  // "`fn` from `tools/lib/x.js`", "`fn(…)` (`tools/lib/x.js`", "`fn`, `tools/lib/x.js`".
  const FROM = /`(\w+)(?:\([^`]*\))?`(?: from | \(|, | in )`(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?tools\/lib\/([\w-]+\.js)`/g;

  it.each(UNIT_COMMANDS)('%s.md: a function said to come from a module is exported by that module', (name) => {
    for (const m of read(name).matchAll(FROM)) {
      const [, fn, file] = m;
      expect(EXPORTS_BY_MODULE.has(file), `${name}.md names tools/lib/${file}, which does not exist`).toBe(true);
      expect(EXPORTS_BY_MODULE.get(file).has(fn), `${name}.md says ${fn} is in tools/lib/${file}; it is not exported there`).toBe(true);
    }
  });

  it('the scan above finds the unit functions the command files call, each in its module', () => {
    const found = new Set();
    for (const name of UNIT_COMMANDS) for (const m of read(name).matchAll(FROM)) found.add(`${m[1]}@${m[2]}`);
    for (const pair of [
      'openEpic@work-ops.js', 'closeEpic@work-ops.js', 'isEpicDone@retrospective.js', 'evictEpicNarrative@evict.js',
      'checkUnits@unit-records.js', 'releaseUnit@unit-records.js', 'deriveNextEpicId@milestones.js',
    ]) expect(found.has(pair), `${pair} is no longer named with its module in any of the ten command files`).toBe(true);
  });

  const para = (name, marker) => {
    const hit = read(name).split('\n').filter((l) => l.includes(marker));
    expect(hit.length, `${name}.md: no line with "${marker}"`).toBeGreaterThan(0);
    return hit.join('\n');
  };
  const sectionOf = (name, from, to) => {
    const text = read(name);
    const start = text.indexOf(from);
    expect(start, `${name}.md: no "${from}"`).toBeGreaterThan(-1);
    const end = text.indexOf(to, start + from.length);
    return text.slice(start, end === -1 ? undefined : end);
  };

  // REVIEW pass 1 (r1.4, C-I4): ship.md § 0.5 chose "load the milestone file
  // or not" on `hasUnitsSafe(baseDir).has`, which reads a folder that cannot
  // be trusted as "no unit records".
  it('no command file decides on hasUnitsSafe: ship.md § 0.5 asks unitRecordsOn and says a throw halts', () => {
    for (const name of UNIT_COMMANDS) expect(read(name), `${name}.md`).not.toContain('hasUnitsSafe');
    const line = para('ship', '`unitRecordsOn(baseDir)` from `tools/lib/unit-records.js`');
    expect(line).toMatch(/throws.*print its message and \*\*halt\*\*/s);
    expect(EXPORTS_BY_MODULE.get('unit-records.js').has('unitRecordsOn')).toBe(true);
  });

  it('ship.md § 5.5: with unit records the narrative is not evicted at SHIP, and the file says when it is', () => {
    const text = sectionOf('ship', '### 5.5 Evict-on-close', '\n### 6');
    expect(text).toMatch(/With unit records/);
    expect(text).toMatch(/\/sig:checkpoint/);
    for (const reason of ['not-closed', 'held', 'no-card', 'unit-record-unreadable']) expect(text, reason).toContain(`\`${reason}\``);
  });

  it('ship.md § 6.8 and § 6.9: a unit write changes work/EPICS.md too, and the file says to stage it', () => {
    const close = para('ship', "**`{status: 'close-requested'");
    expect(close).toContain('.planning/work/EPICS.md');
    const confirm = para('ship', 'the same call confirms unit closes too');
    expect(confirm).toContain('.planning/work/EPICS.md');
  });

  it('discuss.md: the Done-Epic guard says a closed unit record is done, and that the retrospective is not read there', () => {
    const text = para('discuss', '**Done-Epic guard.**');
    expect(text).toMatch(/unit record[^.]*closed/);
    expect(text).toMatch(/\*closing\*/);
  });

  it('item.md: reopen says what refuses it on a project with unit records', () => {
    const text = para('item', '`reopenItem(baseDir, id, {by, reason})`');
    expect(text).toMatch(/unit records/);
    expect(text).toMatch(/unit record is closed/);
  });

  it('docs-sweep.md: closes-confirmed names a unit as well as an item', () => {
    const text = para('docs-sweep', '**`closes-confirmed`**');
    expect(text.slice(text.indexOf('**`closes-confirmed`**'))).toMatch(/unit/);
  });

  // M6.E16 S10 (t10.1, `SIG-295`): the narrative leaves STATE.md when the
  // unit's close is confirmed, and the files that confirm say so.
  it('ship.md § 5.5 and § 6.9: the narrative is evicted when the close is confirmed, and the result is printed and staged', () => {
    const evict = sectionOf('ship', '### 5.5 Evict-on-close', '\n### 6');
    expect(evict).toMatch(/when (?:its|the) close is confirmed/);
    expect(evict).not.toMatch(/exist only there/);
    const confirm = sectionOf('ship', '### 6.9 Confirm fixed closes', '\n### 7');
    expect(confirm).toContain('`evictEpicNarrative`');
    expect(confirm).toContain('`evictionLine`');
    expect(confirm).toContain('`evictions`');
    expect(confirm).toMatch(/STATE\.md/);
    expect(confirm).toMatch(/STATE-NARRATIVE\.md/);
  });

  it('docs-sweep.md: closes-confirmed says a confirmed unit\'s narrative is moved out of STATE.md', () => {
    const text = para('docs-sweep', '**`closes-confirmed`**');
    const after = text.slice(text.indexOf('**`closes-confirmed`**'));
    expect(after).toMatch(/narrative/);
    expect(after).toMatch(/STATE\.md/);
  });

  // M6.E16 S10 (t10.2, `SIG-255`): a person can place and release a hold.
  it('docs-archive.md says how to hold a unit and release it, with the library\'s own signatures', () => {
    const text = sectionOf('docs-archive', '## Holding a unit', '\n## ');
    expect(text).toContain('`holdUnit(baseDir, id, {reason, by})` from `tools/lib/unit-records.js`');
    expect(text).toContain('`releaseUnit(baseDir, id, {by})` from `tools/lib/unit-records.js`');
    expect(text).toMatch(/reason[^.]*required/);
    expect(text).toMatch(/\[held\]/);
    expect(text).toMatch(/[Ww]ithout unit records[^.]*no hold/);
    const found = new Set();
    for (const m of read('docs-archive').matchAll(FROM)) found.add(`${m[1]}@${m[2]}`);
    for (const pair of ['holdUnit@unit-records.js', 'releaseUnit@unit-records.js']) expect(found.has(pair), pair).toBe(true);
  });

  // REVIEW pass 1 (r1.5, C-I5): the item writers' refusal for a unit with no
  // record, and for a closing one, points at this section — so it must say how.
  it('docs-archive.md says how to open, drop, reopen and edit a unit by hand, with the library\'s own signatures', () => {
    const text = sectionOf('docs-archive', '## Holding a unit', '\n## ');
    expect(text).toContain('`openUnit(baseDir, id, {title, summary, by})` from `tools/lib/unit-records.js`');
    expect(text).toContain("`closeUnit(baseDir, id, {reason: 'dropped', words, by})` from `tools/lib/unit-records.js`");
    expect(text).toContain('`reopenUnit(baseDir, id, {reason, by})` from `tools/lib/unit-records.js`');
    expect(text).toContain('`editUnit(baseDir, id, {changes, by})` from `tools/lib/unit-records.js`');
    expect(text).toMatch(/only when the user asks/);
    expect(text).toMatch(/\/sig:docs-migrate --work-store/);
    const found = new Set();
    for (const m of read('docs-archive').matchAll(FROM)) found.add(`${m[1]}@${m[2]}`);
    for (const fn of ['openUnit', 'closeUnit', 'reopenUnit', 'editUnit']) {
      expect(found.has(`${fn}@unit-records.js`), fn).toBe(true);
      expect(EXPORTS_BY_MODULE.get('unit-records.js').has(fn), `${fn} is not exported`).toBe(true);
    }
    // The refusals that send a person here name the section by its heading.
    const src = readFileSync(join(LIB, 'work-records.js'), 'utf-8');
    expect(src.match(/\/sig:docs-archive, "Holding a unit"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('docs-migrate.md: adding units to a store says the Epic table is regenerated when the milestone file has the markers', () => {
    const text = sectionOf('docs-migrate', '- **A project already on the store with no `work/units/`:**', '\n- **What is proposed');
    expect(text).toMatch(/Epic table/);
  });

  // M6.E16 r7: the rule for the generated rows, in one sentence where the table is described.
  it('docs-migrate.md: the rows between the markers are Signal\'s; a typed row refuses, an edit inside Signal\'s row is put back and reported as view-stale', () => {
    const text = sectionOf('docs-migrate', '- **A project already on the store with no `work/units/`:**', '\n- **What is proposed');
    expect(text).toMatch(/rows between the `signal:epics` markers belong to Signal/);
    expect(text).toMatch(/put back at the next regeneration and reported as `view-stale`/);
  });

  // M6.E16 r7: SHIP closes the current unit whatever its name; docs-archive no longer says only by hand.
  it('ship.md §6.8 closes a current unit that is not an Epic ID; docs-archive.md no longer says it has no command', () => {
    const ship = sectionOf('ship', '### 6.8', '### 6.9');
    expect(ship).toMatch(/currentUnit\(state\)/);
    expect(ship).toMatch(/not an Epic ID/);
    expect(ship).toMatch(/no retrospective is required/);
    const archive = read('docs-archive');
    expect(archive).not.toMatch(/A unit that is not an Epic ID\s+\(`phase-12`\), and an Epic that will never ship, have no command/);
    expect(archive).toMatch(/\/sig:ship` closes .*whatever its name/s);
  });
});
