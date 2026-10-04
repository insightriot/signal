// M6.E13 t4.7 — the ban (AC3.2, PLAN Decision 12): no store-on code path parses
// a Markdown list. See .planning/M6.E13-VALIDATION.md row AC3.2.
//
// Two of the three checks live here; the third, the static import graph, is in
// `tests/legacy-lists.test.js` beside the walker t4.1 wrote for it.
//
//   1. RUNTIME — one list of EVERY AC3.1 reader entry point, each run over a v2
//      store and a v1 store (read through the converter) with
//      `SIGNAL_FORBID_LIST_PARSERS=1`, under which every `legacy-lists.js`
//      function throws when called. A count assertion pins the list, so a new
//      reader is added here on purpose or the count goes red.
//      ⚠ This is the BROAD check, not the strong one. The per-reader twins
//      (`advise-store-on`, `drive-store-on`, `sweep-store-on`, `facts-store-on`,
//      `work-writers`) assert WHAT was read; this asserts that NOTHING reached a
//      parser. Under the flag every guarded call is also COUNTED
//      (`forbiddenCallCount`), and the count must be 0 after each reader — so a
//      call inside a `try { … } catch {}` that discards the throw still fails.
//      (Searching the result for the flag's message, which this also does, only
//      catches a catch that copies the message into the result.)
//   2. SOURCE TEXT — no list-parsing regex literal (`B\d`, `^##`, `^\|`, a
//      `|`-cell split) in the reader modules outside `legacy-lists.js`, except
//      the reviewed exemptions below, each with its reason. The scanner is a
//      pure function, and a planted violation proves it bites.
//
// The residue, stated in REQUIREMENTS AC3.2: a parser nobody relocated, on a
// path no reader below exercises, written without any of the scanned shapes.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { gatherBigPicture } from '../plugin/tools/lib/advise-digest.js';
import { prepareAdvise, runAdvise } from '../plugin/tools/lib/advise.js';
import { validatePriorities } from '../plugin/tools/lib/advise-priorities.js';
import { proposeEpicCandidates, collectPreflight, resolveFloors } from '../plugin/tools/lib/drive.js';
import { readOpenQuestions } from '../plugin/tools/lib/status.js';
import {
  checkBacklogDischarge,
  checkStaleInbox,
  checkWorkStore,
  checkClosingTooLong,
  confirmClosesInSweep,
  runSweep,
} from '../plugin/tools/lib/sweep.js';
import { checkDanglingReferences } from '../plugin/tools/lib/doc-hygiene.js';
import { checkPublishedBugTally, checkBugStatusVsChangelog } from '../plugin/tools/lib/published-facts.js';
import { makeBugFixedJevCheck } from '../plugin/tools/lib/bug-fixed-jev.js';
import { runDriftChecks } from '../plugin/tools/lib/state-drift.js';
import { backlogDischargeStatus, promoteToBacklog, promoteToBugs } from '../plugin/tools/lib/backlog.js';
import { captureToFutureIdeas, captureToBugs, captureToOpenQuestions } from '../plugin/tools/lib/add.js';
import { captureCheckpointContext } from '../plugin/tools/lib/checkpoint.js';
import { reportCloses, runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
import { parseBacklogRows } from '../plugin/tools/lib/backlog.js';
import { forbiddenCallCount, resetForbiddenCalls } from '../plugin/tools/lib/legacy-lists.js';
import {
  storeProject,
  cleanupStoreProjects,
  put,
  withParserBan,
  NOW,
} from './helpers/work-store-fixture.js';

const LIB = join(process.cwd(), 'plugin', 'tools', 'lib');
const FLAG = 'SIGNAL_FORBID_LIST_PARSERS';

// ── 1. Runtime ───────────────────────────────────────────────────────────────

const TODAY = '2026-10-04';
const keep = async () => 'keep';
const ask = async () => ({ ok: true, noul: 0.05, model: 'jev-test' });
const proposal = (covers) => [
  { title: 'One', why: 'First.', covers, evidence: ['.planning/PROJECT.md:3'] },
  { title: 'Two', why: 'Second.', covers: ['new: something unfiled'], evidence: ['.planning/PROJECT.md:1'] },
  { title: 'Three', why: 'Third.', covers: ['new: another'], evidence: ['.planning/PROJECT.md'] },
];

// Every AC3.1 reader entry point, by REQUIREMENTS AC3.1's groups (advise; drive;
// status/resume open questions; sweep; published-facts; the Jev bug check;
// backlog discharge status; inbox capture/promotion), enumerated from RESEARCH
// § "Readers, by AC3.1 group" and the S4 tasks that moved them (t4.2a–t4.5b),
// plus t4.6's confirmation at resume/SHIP. A capture or promote on a v1 store
// refuses with CONFIG by design (AC4.2) — that is not a parser call.
const READERS = [
  ['advise', 'advise-corpus.js readCorpus', (b) => readCorpus(b)],
  ['advise', 'advise-digest.js gatherBigPicture', (b) => gatherBigPicture(b)],
  ['advise', 'advise.js prepareAdvise (classifyCorpus)', (b) => prepareAdvise(b)],
  ['advise', 'advise-priorities.js validatePriorities', async (b) => {
    const { corpus, classified } = await prepareAdvise(b);
    return validatePriorities(b, proposal(['SIG-2', 'SIG-4']), corpus, { liveRows: classified.live.map((s) => s.row) });
  }],
  ['advise', 'advise.js runAdvise (the stale-read guard by ID)', (b) =>
    runAdvise(b, { today: TODAY, priorities: proposal(['SIG-2', 'SIG-4']), projectName: 'fixture' })],
  ['drive', 'drive.js proposeEpicCandidates', (b) => proposeEpicCandidates(b)],
  ['drive', 'drive.js resolveFloors PLAN (inboxHasDrainableEntries)', (b) => resolveFloors('PLAN', b)],
  ['drive', 'drive.js collectPreflight (open questions)', (b) => collectPreflight(b, { epic: 'M6.E3' })],
  ['status', 'status.js readOpenQuestions', (b) => readOpenQuestions(b)],
  ['sweep', 'sweep.js checkBacklogDischarge', (b) => checkBacklogDischarge(b)],
  ['sweep', 'sweep.js checkStaleInbox', (b) => checkStaleInbox(b)],
  ['sweep', 'doc-hygiene.js checkDanglingReferences', (b) => checkDanglingReferences(b)],
  ['sweep', 'sweep.js checkWorkStore', (b) => checkWorkStore(b)],
  ['sweep', 'sweep.js checkClosingTooLong', (b) => checkClosingTooLong(b, { now: NOW })],
  ['sweep', 'sweep.js confirmClosesInSweep', (b) => confirmClosesInSweep(b, { now: NOW })],
  ['sweep', 'sweep.js runSweep (the whole sweep)', (b) => runSweep(b)],
  ['published-facts', 'published-facts.js published-bug-tally', (b) => runDriftChecks(b, [checkPublishedBugTally])],
  ['published-facts', 'published-facts.js bug-status-vs-changelog', (b) => runDriftChecks(b, [checkBugStatusVsChangelog])],
  ['jev', 'bug-fixed-jev.js makeBugFixedJevCheck', (b) => runDriftChecks(b, [makeBugFixedJevCheck({ ask, key: 'k' })])],
  ['backlog', 'backlog.js backlogDischargeStatus', (b) => backlogDischargeStatus(b)],
  ['capture', 'add.js captureToFutureIdeas', (b) => captureToFutureIdeas(b, { body: 'An idea.', today: TODAY, sensitivePrompt: keep })],
  ['capture', 'add.js captureToBugs', (b) => captureToBugs(b, { body: 'A bug.', today: TODAY, sensitivePrompt: keep })],
  ['capture', 'add.js captureToOpenQuestions', (b) => captureToOpenQuestions(b, { body: 'A question?', today: TODAY, sensitivePrompt: keep })],
  ['capture', 'checkpoint.js captureCheckpointContext', (b) => captureCheckpointContext(b, { decisions: ['D'], questions: ['Q one?'] })],
  ['capture', 'backlog.js promoteToBacklog', (b) => promoteToBacklog(b, { block: '## A row\n\nx\n', tag: 'roadmap', today: TODAY })],
  ['capture', 'backlog.js promoteToBugs', (b) => promoteToBugs(b, { block: '## A bug\n\nx\n' })],
  ['confirm', 'close-confirm.js runConfirmCloses (SHIP, sweep)', (b) => runConfirmCloses(b, { now: NOW })],
  ['confirm', 'close-confirm.js reportCloses (resume)', (b) => reportCloses(b, { now: NOW })],
];

// The message every guarded parser throws names the flag; it is searched for in
// the error AND in the result, so a reader that caught the throw is still caught.
const BAN_MARK = `${FLAG}=1`;
const DECOY_VIEWS = ['BACKLOG.md', 'BUGS.md', 'OPEN-QUESTIONS.md', 'ISSUES-INBOX.md'];

// `writes`: the decoy views are hand-kept (no generated marker), and a v2 write
// refuses to regenerate over a hand-kept view — so a writer's project has none.
function project(version, { writes = false } = {}) {
  const base = storeProject(version);
  if (writes) for (const f of DECOY_VIEWS) rmSync(join(base, '.planning', f));
  put(base, '.planning/PROJECT.md', '# Project\n\nLine two.\nLine three.\n');
  put(base, 'CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n## [0.1.40] — 2026-09-10\n\n- Fixed SIG-4 (B117).\n');
  return base;
}

/**
 * Run one reader under the ban. `null` when nothing reached a parser; else why.
 * A v1 store may refuse a write (`CONFIG`, AC4.2); any other throw is reported,
 * since a reader that dies before reaching its parser proves nothing.
 */
async function banViolation(run, base, version) {
  let result;
  resetForbiddenCalls();
  try {
    result = await run(base);
  } catch (err) {
    if (String(err?.message).includes(BAN_MARK)) return `threw from legacy-lists: ${err.message}`;
    if (forbiddenCallCount() > 0) return `a parser was called ${forbiddenCallCount()} time(s) and the throw was swallowed`;
    if (version === 1 && err?.code === 'CONFIG') return null;
    return `threw (not the ban, but the reader did not run): ${err?.code ?? ''} ${err?.message}`;
  }
  let text;
  try {
    text = JSON.stringify(result, (k, v) => (v instanceof Error ? v.message : v)) ?? '';
  } catch {
    text = String(result);
  }
  if (text.includes(BAN_MARK)) return `a parser was reached and the throw was caught: ${text.slice(0, 300)}`;
  return forbiddenCallCount() > 0 ? `a parser was called ${forbiddenCallCount()} time(s) and the throw was swallowed` : null;
}

describe('the ban at runtime: every AC3.1 reader, flag set (AC3.2)', () => {
  withParserBan({ beforeAll, afterAll });
  afterEach(cleanupStoreProjects);

  it('the reader list is the one reviewed: 28 entry points over the 8 AC3.1 groups, t4.6 and D-M6E13-21', () => {
    // 26 from AC3.1 (5 advise, 3 drive, 1 status, 7 sweep, 2 published-facts,
    // 1 Jev, 1 backlog, 6 capture) + 1 t4.6 (runConfirmCloses) + 1 D-M6E13-21
    // (reportCloses, resume's read-only report). Adding a reader means adding
    // it above and raising this number — on purpose.
    expect(READERS).toHaveLength(28);
    expect(new Set(READERS.map(([, name]) => name)).size).toBe(READERS.length);
    expect(new Set(READERS.map(([group]) => group))).toEqual(
      new Set(['advise', 'drive', 'status', 'sweep', 'published-facts', 'jev', 'backlog', 'capture', 'confirm']),
    );
  });

  it('the flag is on here (guards a run that bans nothing)', () => {
    expect(process.env[FLAG]).toBe('1');
    expect(() => parseBacklogRows('### A row\n')).toThrow(BAN_MARK);
  });

  for (const version of [2, 1]) {
    for (const [group, name, run] of READERS) {
      it(`v${version} store — ${name} reaches no list parser`, async () => {
        expect(await banViolation(run, project(version, { writes: group === 'capture' }), version)).toBeNull();
      });
    }
  }
});

describe('the runtime harness bites (self-test)', () => {
  withParserBan({ beforeAll, afterAll });
  afterEach(cleanupStoreProjects);

  it('a reader that calls a parser is reported', async () => {
    const planted = async () => parseBacklogRows('### A row\n');
    expect(await banViolation(planted, project(2), 2)).toMatch(/^threw from legacy-lists: legacy-lists: parseBacklogRows\(\)/);
  });

  it('a reader that swallows the throw into its result is reported', async () => {
    const planted = async () => {
      try {
        return parseBacklogRows('### A row\n');
      } catch (err) {
        return { cannotCheck: err.message };
      }
    };
    expect(await banViolation(planted, project(2), 2)).toMatch(/^a parser was reached and the throw was caught/);
  });

  it('a reader that swallows the throw in an empty catch is reported (the call is counted)', async () => {
    const planted = async () => {
      try {
        parseBacklogRows('## a');
      } catch {
        // swallowed: nothing of the ban's message survives into the result
      }
      return { rows: [] };
    };
    expect(await banViolation(planted, project(2), 2)).toMatch(/^a parser was called 1 time\(s\) and the throw was swallowed/);
  });

  it('a reader that dies for another reason is reported, not passed', async () => {
    const planted = async () => {
      throw new Error('boom');
    };
    expect(await banViolation(planted, project(2), 2)).toMatch(/did not run/);
  });
});

// ── 2. Source text ───────────────────────────────────────────────────────────

// The modules that host an AC3.1 reader, plus the v2 modules and t4.6's entry.
// `legacy-lists.js` is the one home of the parsers and is not scanned.
// `work-migrate.js` is v1 source (the migration's input side), not a reader,
// and is retired at S7 — out of the set, not exempted.
const READER_MODULES = [
  'advise-corpus.js', 'advise-digest.js', 'advise.js', 'advise-priorities.js',
  'drive.js', 'status.js', 'sweep.js', 'doc-hygiene.js', 'published-facts.js', 'bug-fixed-jev.js',
  'backlog.js', 'bugs-tally.js', 'add.js', 'checkpoint.js', 'drain.js',
  'work-record.js', 'work-records.js', 'work-views.js', 'work-convert.js', 'work-write-guard.js', 'scrub.js',
  'close-confirm.js', 'leading-id.js',
];

// The list-parsing shapes, as they appear in source text.
const SHAPES = [
  ['B\\d', /B\\{1,2}d/], // a B{n} ID matched in a regex literal or a RegExp string
  ['^##', /\^#{2,}/], // a heading-anchored regex
  ['^\\|', /\^\\\|/], // a table-row-anchored regex
  ["split('|')", /\.split\(\s*(['"`])\|\1\s*\)|\.split\(\s*\/\\\|\//], // a |-cell split
  ["startsWith('|' or '##')", /startsWith\(\s*(['"`])(\||##)/],
];

/**
 * Every list-parsing shape in `text`, by line. Comment lines (`//`, `*`, `/*`)
 * are skipped: a regex quoted in a comment parses nothing.
 * @returns {Array<{file: string, line: number, shape: string, text: string}>}
 */
function scanListParsing(file, text) {
  const hits = [];
  text.split('\n').forEach((src, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(src)) return;
    for (const [shape, re] of SHAPES) if (re.test(src)) hits.push({ file, line: i + 1, shape, text: src.trim() });
  });
  return hits;
}

// Reviewed exemptions. Each: the file, the shape, a substring of the line that
// carries it (not a line number, which drifts), and why it is not a work-list
// parse. t4.1's "left for t4.7" list, t4.4's and t4.5's carries, and what the
// scan found beyond them.
const EXEMPTIONS = [
  { file: 'advise-digest.js', shape: '^##', has: 'RETRO_SECTION_RE =',
    reason: 'a retrospective\'s "What to feed back" section heading — a retro, not a work list (t4.1)' },
  { file: 'advise-digest.js', shape: '^##', has: 'Vision|Problem Statement|Problem',
    reason: 'the Vision/Problem heading of PROJECT.md — not a work list' },
  { file: 'advise-digest.js', shape: '^##', has: "l.replace(/^##\\s+/, '')",
    reason: 'strips the retro section heading it found above for the digest line (t4.1)' },
  { file: 'drive.js', shape: '^##', has: 'const re = /^## (\\S+) — (.+)$/gm;',
    reason: '`readQueue`: the decision queue (DECISION-QUEUE.md), not a work list (t4.1)' },
  { file: 'doc-hygiene.js', shape: '^##', has: '/^##\\s+\\[(\\d+\\.\\d+\\.\\d+)\\]/m',
    reason: 'the newest CHANGELOG version heading, for the version-consistency check — not a work list' },
  { file: 'doc-hygiene.js', shape: 'B\\d', has: '/^B\\d{1,4}$/.test(legacy)',
    reason: '`readStoreIds`: a `legacy_id` shape test on a record field — an ID check, not a list parse (t4.4)' },
  { file: 'doc-hygiene.js', shape: 'B\\d', has: '/\\bB\\d{1,4}\\b/g',
    reason: '`checkDanglingWithStore`: finds B-id MENTIONS in prose to resolve against the records — not a list parse (t4.4)' },
  { file: 'published-facts.js', shape: '^##', has: 'const RELEASED_HEADING',
    reason: 'CHANGELOG released-section heading (bug-vs-changelog reads the changelog, not a work list) (t4.1)' },
  { file: 'published-facts.js', shape: '^##', has: 'const UNRELEASED_HEADING',
    reason: 'CHANGELOG [Unreleased] heading — not a work list (t4.1)' },
  { file: 'published-facts.js', shape: '^##', has: "if (!/^##\\s*\\[/.test(lines[i])",
    reason: 'CHANGELOG section walk — not a work list (t4.1)' },
  { file: 'published-facts.js', shape: '^##', has: 'if (/^##\\s/.test(lines[j])) break;',
    reason: 'end of a CHANGELOG section — not a work list (t4.1)' },
  { file: 'published-facts.js', shape: '^\\|', has: 'const EPIC_ROW',
    reason: 'a MILESTONE file\'s Epic-status table row (Epic vs STATE drift) — Epics are out of this Epic\'s store' },
  { file: 'bug-fixed-jev.js', shape: '^##', has: 'const RELEASED_HEADING',
    reason: 'CHANGELOG released-section heading — not a work list (t4.1)' },
  { file: 'bug-fixed-jev.js', shape: '^##', has: 'const ANY_H2',
    reason: 'end of a CHANGELOG section — not a work list (t4.1)' },
  { file: 'backlog.js', shape: '^##', has: "if (!/^##\\s/.test(block)) return block;",
    reason: '`stripLeadingHeading`: ONE inbox block handed to promote, retitled — never a re-parse of a list' },
  { file: 'backlog.js', shape: '^##', has: 'const m = block.match(/^##\\s+(.+)$/m);',
    reason: '`resolveTitle`: the title of ONE block handed to promote — never a list' },
  { file: 'bugs-tally.js', shape: 'B\\d', has: "/^B\\d+$/.test(record.legacy_id ?? '')",
    reason: '`bugRecordIds`: a `legacy_id` shape test on a record field — an ID check (t4.5)' },
  { file: 'add.js', shape: '^##', has: "if (/^## /.test(lines[i]) || MILESTONE_FOOTER_RE",
    reason: 'the store-off section append (`appendToSection`); store-on capture writes records (t4.1, t4.5b)' },
  { file: 'work-convert.js', shape: 'B\\d', has: 'const ROW_RE',
    reason: 'the v1→v2 converter strips the pasted table row from ONE item\'s body (AC8.3); retired with v1 at S7' },
  { file: 'work-convert.js', shape: '^\\|', has: 'const ROW_RE',
    reason: 'the same row as above (the shape matches twice)' },
  { file: 'leading-id.js', shape: 'B\\d', has: '|(?:B\\d+))\\b/',
    reason: '`LEADING_ID_RE`: whether ONE heading or title leads with a unit or bug id — an ID check, not a list parse (M6.E13 R5)' },
];

const isExempt = (hit) => EXEMPTIONS.some((e) => e.file === hit.file && e.shape === hit.shape && hit.text.includes(e.has));

describe('the ban in source text: no list-parsing literal in the reader modules (AC3.2)', () => {
  it('scans the reviewed module set: 23 files, all present, legacy-lists.js not among them', () => {
    expect(READER_MODULES).toHaveLength(23);
    for (const f of READER_MODULES) expect(existsSync(join(LIB, f)), f).toBe(true);
    expect(READER_MODULES).not.toContain('legacy-lists.js');
  });

  const hits = READER_MODULES.flatMap((f) => scanListParsing(f, readFileSync(join(LIB, f), 'utf-8')));

  it('every hit is a reviewed exemption', () => {
    expect(hits.filter((h) => !isExempt(h)).map((h) => `${h.file}:${h.line} [${h.shape}] ${h.text}`)).toEqual([]);
  });

  it('every exemption still matches a line (none is stale)', () => {
    const stale = EXEMPTIONS.filter((e) => !hits.some((h) => h.file === e.file && h.shape === e.shape && h.text.includes(e.has)));
    expect(stale.map((e) => `${e.file} [${e.shape}] ${e.has}`)).toEqual([]);
  });

  it('every exemption carries a reason', () => {
    for (const e of EXEMPTIONS) expect(e.reason.length, `${e.file} ${e.has}`).toBeGreaterThan(20);
  });
});

describe('the source-text scanner bites (self-test)', () => {
  const planted = [
    "const BUG_ROW = /^\\|\\s*B(\\d+)\\s*\\|/;",
    "const cells = line.split('|');",
    "const H = /^##\\s+(.+)$/;",
    "if (line.startsWith('|')) rows.push(line);",
    "const id = new RegExp('B\\\\d+');",
  ].join('\n');

  it('a planted parser in a reader module is found, on every shape', () => {
    const found = scanListParsing('drive.js', planted);
    expect(new Set(found.map((h) => h.shape))).toEqual(new Set(SHAPES.map(([s]) => s)));
    expect(found.filter((h) => !isExempt(h))).toHaveLength(found.length);
  });

  it('an exemption does not travel: the exempt line in another file is a violation', () => {
    const line = "  const m = block.match(/^##\\s+(.+)$/m);";
    expect(isExempt(scanListParsing('backlog.js', line)[0])).toBe(true);
    expect(isExempt(scanListParsing('advise.js', line)[0])).toBe(false);
  });

  it('a regex quoted in a comment is not a parser', () => {
    expect(scanListParsing('drive.js', '// matches /^\\|\\s*B\\d+/\n * and /^##/')).toEqual([]);
  });
});
