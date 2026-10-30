// M6.E16.S5.t5.3 — the milestone-row parsers have no caller on the unit-records
// path (AC7.3, `D-M6E16-4`, `-10`, `-12`; `SIG-132`).
// See .planning/M6.E16-VALIDATION.md row AC7.3.
//
// Three parsers read a milestone file's Epic rows, in three formats:
// `findEpicStatusRow` (through `isEpicCloseShip`, `retrospective.js`),
// `EPIC_ROW` (`published-facts.js`) and `parseEpicStatusRows`
// (`milestones.js`). With unit records those rows are GENERATED from the
// records, and no code may read them back.
//
// They are not deleted: a project with no unit records still reads its
// hand-kept table through them (AC6.4). What this test pins is that EVERY call
// site sits behind the switch — `unitRecordsOn(...)`, the "does this project
// have unit records" question — or is listed below with the reason it need
// not. It is a population test over source text:
//
//   1. every call site in the shipped plugin and the repo's own tools is found
//      and must be in ALLOWED, by file and enclosing declaration — a new call
//      site fails until someone lists it and says why;
//   2. every listed site that is not exempt has `unitRecordsOn(` between the
//      start of its enclosing declaration and the call;
//   3. the scanner is run on planted text, so it is known to bite.
//
// The switch was `hasUnitsSafe(…).has` until REVIEW pass 1 (r1.4, C-I4): that
// read a `units/` folder that cannot be trusted as "no unit records" and sent
// the caller on to these parsers. Every caller now asks `unitRecordsOn`, which
// throws on such a folder, so a call of it before the parser means the parser
// is not reached with unit records AND not reached on a faulty folder.
//
// ⚠ What it cannot see: that the `unitRecordsOn(` it finds actually guards the
// call (it checks position, not control flow), and a parser written under a
// new name. The behaviour itself is tested per caller: `ship-fr1` /
// `ship-epic-close-units` (AC4.6), `published-facts-units`, `advise-units`.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));

// What counts as a use of each name. A definition, an import and a comment are not uses.
const PARSERS = {
  findEpicStatusRow: /(?<!function\s)\bfindEpicStatusRow\s*\(/,
  isEpicCloseShip: /(?<!function\s)\bisEpicCloseShip\s*\(/,
  EPIC_ROW: /\bEPIC_ROW\b(?!\s*=)/,
  parseEpicStatusRows: /(?<!function\s)\bparseEpicStatusRows\s*\(/,
};
const SWITCH = 'unitRecordsOn(';

const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);
// The start of a top-level declaration: a function, or an exported const (a `defineCheck({...})` object).
const DECL_RE = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^export\s+const\s+([A-Za-z_$][\w$]*)\s*=/;

/**
 * Every use of a parser name in `source`: `{name, decl, line, guarded}`.
 * `decl` is the enclosing top-level declaration; `guarded` is whether the
 * switch is called between that declaration's first line and the use.
 */
function scan(source) {
  const lines = source.split('\n');
  const out = [];
  let decl = { name: '(top level)', start: 0 };
  lines.forEach((line, i) => {
    const d = line.match(DECL_RE);
    if (d) decl = { name: d[1] ?? d[2], start: i };
    if (isComment(line)) return;
    for (const [name, re] of Object.entries(PARSERS)) {
      if (!re.test(line)) continue;
      const before = lines.slice(decl.start, i + 1).filter((l) => !isComment(l)).join('\n');
      const upTo = before.slice(0, before.lastIndexOf(line) + line.search(re));
      out.push({ name, decl: decl.name, line: i + 1, guarded: upTo.includes(SWITCH) });
    }
  });
  return out;
}

function sourceFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(abs));
    else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(abs);
  }
  return out;
}

// Every call site, with why it is allowed. `exempt` sites carry no switch of
// their own; each says what makes that safe.
const ALLOWED = [
  { file: 'plugin/tools/lib/retrospective.js', decl: 'detectDirtyExecute', name: 'isEpicCloseShip',
    why: 'the no-unit-records trigger of the dirty-EXECUTE warning; with unit records the unit\'s status is the trigger (t4.3)' },
  { file: 'plugin/tools/lib/retrospective.js', decl: 'shipFR1Check', name: 'findEpicStatusRow',
    why: 'the milestone row is read only without unit records; with them STATE.md alone decides (AC4.6, D-M6E16-10)' },
  { file: 'plugin/tools/lib/retrospective.js', decl: 'shipFR1Check', name: 'isEpicCloseShip',
    why: 'behind `!byRecords &&` (AC4.6)' },
  { file: 'plugin/tools/lib/retrospective.js', decl: 'isEpicCloseShip', name: 'findEpicStatusRow', exempt: true,
    why: 'the body of isEpicCloseShip itself; it is reached only through its two callers above, both behind the switch' },
  { file: 'plugin/tools/lib/published-facts.js', decl: 'checkMilestoneStatusVsState', name: 'EPIC_ROW', count: 2,
    why: 'the check answers NOT_APPLICABLE with unit records before either use (t5.3; tests/published-facts-units.test.js)' },
  { file: 'plugin/tools/lib/advise-digest.js', decl: 'gatherBigPicture', name: 'parseEpicStatusRows',
    why: 'the digest\'s milestone lines without unit records; with them the lines are the unit records (t5.3)' },
  { file: 'plugin/tools/lib/advise-corpus.js', decl: 'readCorpus', name: 'parseEpicStatusRows',
    why: 'the `milestone rows` source without unit records; with them it carries the units and opens no milestone file (t5.3)' },
  { file: 'plugin/tools/lib/work-migrate-units.js', decl: 'readMilestoneRows', name: 'parseEpicStatusRows',
    why: 'the migration proposes unit records from the hand-kept rows; it returns no row once the project has unit records (t7.2)' },
  { file: 'plugin/tools/lib/milestones.js', decl: 'plannedEpicNumbers', name: 'parseEpicStatusRows', exempt: true,
    why: 'reads only which Epic numbers the file plans, so the next ID skips them, never a status; a planned Epic can have no record yet, as on the test project (SIG-367), and a number read by mistake only skips one' },
  { file: 'tools/unit-baseline.mjs', decl: 'readMilestoneRows', name: 'parseEpicStatusRows', exempt: true,
    why: 'a development tool, not shipped in the plugin: it snapshots what the hand-kept tables said BEFORE the cutover (S0)' },
];

const found = [];
for (const root of ['plugin', 'tools']) {
  for (const abs of sourceFiles(join(REPO, root))) {
    const file = relative(REPO, abs).split('\\').join('/');
    for (const site of scan(readFileSync(abs, 'utf-8'))) found.push({ file, ...site });
  }
}
const key = (s) => `${s.file} · ${s.decl} · ${s.name}`;

describe('the milestone-row parsers: every call site is listed (AC7.3)', () => {
  it('the scan found the call sites at all', () => {
    expect(found.length).toBeGreaterThanOrEqual(8);
    for (const name of Object.keys(PARSERS)) expect(found.map((s) => s.name), name).toContain(name);
  });

  it('every call site is in ALLOWED, and every ALLOWED entry is a real call site, with its count', () => {
    const counted = {};
    for (const s of found) counted[key(s)] = (counted[key(s)] ?? 0) + 1;
    const expected = Object.fromEntries(ALLOWED.map((a) => [key(a), a.count ?? 1]));
    expect(counted).toEqual(expected);
  });

  it('every entry says why', () => {
    for (const a of ALLOWED) expect(a.why.length, key(a)).toBeGreaterThan(20);
  });
});

describe('every call site that is not exempt sits behind the unit-records switch (AC7.3)', () => {
  const exempt = new Set(ALLOWED.filter((a) => a.exempt).map(key));
  const mustGuard = found.filter((s) => !exempt.has(key(s)));

  it('there are such sites', () => {
    expect(mustGuard.length).toBeGreaterThanOrEqual(6);
  });

  it.each(mustGuard.map((s) => [`${key(s)} (line ${s.line})`, s]))('%s', (_, site) => {
    expect(site.guarded, `${site.file}:${site.line} uses ${site.name} with no ${SWITCH}…) before it in ${site.decl}`).toBe(true);
  });

  it('the exempt sites are the three listed, and no more', () => {
    expect(ALLOWED.filter((a) => a.exempt).map(key)).toEqual([
      'plugin/tools/lib/retrospective.js · isEpicCloseShip · findEpicStatusRow',
      'plugin/tools/lib/milestones.js · plannedEpicNumbers · parseEpicStatusRows',
      'tools/unit-baseline.mjs · readMilestoneRows · parseEpicStatusRows',
    ]);
  });
});

describe('nothing else reaches them', () => {
  it('no command file, hook or reference names a row parser or the row check', () => {
    const names = [...Object.keys(PARSERS), 'checkMilestoneStatusVsState'];
    const docs = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (e.name.endsWith('.md')) docs.push(abs);
      }
    };
    walk(join(REPO, 'plugin'));
    expect(docs.length).toBeGreaterThan(20);
    const hits = [];
    for (const abs of docs) {
      const text = readFileSync(abs, 'utf-8');
      for (const n of names) if (new RegExp(`\\b${n}\\b`).test(text)) hits.push(`${relative(REPO, abs)}: ${n}`);
    }
    expect(hits).toEqual([]);
  });

  it('checkMilestoneStatusVsState is defined and registered in published-facts.js and called nowhere else', () => {
    const users = [];
    for (const root of ['plugin', 'tools']) {
      for (const abs of sourceFiles(join(REPO, root))) {
        if (/\bcheckMilestoneStatusVsState\b/.test(readFileSync(abs, 'utf-8'))) users.push(relative(REPO, abs).split('\\').join('/'));
      }
    }
    expect(users).toEqual(['plugin/tools/lib/published-facts.js']);
  });

  it('the parsers are still there for a project with no unit records (AC6.4): none was deleted', () => {
    const retro = readFileSync(join(REPO, 'plugin/tools/lib/retrospective.js'), 'utf-8');
    expect(retro).toMatch(/^function findEpicStatusRow\(/m);
    expect(retro).toMatch(/^export function isEpicCloseShip\(/m);
    expect(readFileSync(join(REPO, 'plugin/tools/lib/published-facts.js'), 'utf-8')).toMatch(/^const EPIC_ROW = /m);
    expect(readFileSync(join(REPO, 'plugin/tools/lib/milestones.js'), 'utf-8')).toMatch(/^export function parseEpicStatusRows\(/m);
  });
});

describe('the scanner bites', () => {
  const src = (body) => `import { parseEpicStatusRows } from './milestones.js';\n\nexport function reader(baseDir, content) {\n${body}\n}\n`;

  it('an unguarded call is found and reported unguarded', () => {
    expect(scan(src('  return parseEpicStatusRows(content);'))).toEqual([{ name: 'parseEpicStatusRows', decl: 'reader', line: 4, guarded: false }]);
  });

  it('a call after the switch in the same declaration is guarded; the switch after the call does not count', () => {
    expect(scan(src('  if (unitRecordsOn(baseDir)) return [];\n  return parseEpicStatusRows(content);'))[0].guarded).toBe(true);
    expect(scan(src('  const rows = parseEpicStatusRows(content);\n  return unitRecordsOn(baseDir) ? [] : rows;'))[0].guarded).toBe(false);
  });

  it('the switch in ANOTHER declaration above does not count', () => {
    const two = `export function a(baseDir) {\n  return unitRecordsOn(baseDir);\n}\n\nexport function b(content) {\n  return parseEpicStatusRows(content);\n}\n`;
    expect(scan(two)).toEqual([{ name: 'parseEpicStatusRows', decl: 'b', line: 6, guarded: false }]);
  });

  it('the switch named only in a comment does not count', () => {
    expect(scan(src('  // unitRecordsOn(baseDir) would go here\n  return parseEpicStatusRows(content);'))[0].guarded).toBe(false);
  });

  it('a definition, an import and a comment are not call sites; each other shape is', () => {
    expect(scan('function findEpicStatusRow(content, id) {\n  return null;\n}\n')).toEqual([]);
    expect(scan('const EPIC_ROW = /x/;\n')).toEqual([]);
    expect(scan('// isEpicCloseShip(state) is called below\n')).toEqual([]);
    const uses = scan('export function f(l) {\n  if (EPIC_ROW.test(l)) return 1;\n  const m = l.match(EPIC_ROW);\n  return isEpicCloseShip(m) || findEpicStatusRow(m);\n}\n');
    expect(uses.map((u) => u.name)).toEqual(['EPIC_ROW', 'EPIC_ROW', 'findEpicStatusRow', 'isEpicCloseShip']);
  });
});
