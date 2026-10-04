// The Outcome measurement on this repository, after the migration (M6.E11 t7.3).
// See .planning/M6.E11-PLAN.md § S7 (t7.2, t7.3) and RESEARCH § 3 "Outcome baseline".
//
// Before the store, two shipped readers decided things by reading prose:
// `bug-status-vs-changelog` took each bug's status from a hand-typed cell, and
// `parseBacklogRows` decided which BACKLOG rows were still live from struck
// headings and done-words. After it, the four lists are generated from item
// files, so the status cell and a row's presence come from frontmatter.
//
// "Before" is measured on the archived originals (`archive/pre-work-store/`),
// "after" on the live generated files. Nothing here pins a number that ordinary
// work moves: the after-side assertions are derived from the item files, so a
// new bug or a closed row keeps them true. The before-side numbers ARE pinned,
// because the archive is frozen by construction.
//
// ⚠ READ-ONLY ON `.planning/`: asserts `git status --porcelain .planning/` is
// unchanged afterwards, like the migration tests.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { checkBugStatusVsChangelog } from '../plugin/tools/lib/published-facts.js';
import { APPLICABILITY } from '../plugin/tools/lib/state-drift.js';
import { walkBugEntries } from '../plugin/tools/lib/bugs-tally.js';
import { parseBacklogRows } from '../plugin/tools/lib/backlog.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { checkStore, isStoreOn, parseItemFileName, walkFiles } from '../plugin/tools/lib/work-store.js';
import { parseItem } from '../plugin/tools/lib/work-item.js';
import { resolveArtifactPath } from '../plugin/tools/lib/resume.js';
import { checkRecords, listRecords, storeVersion } from '../plugin/tools/lib/work-records.js';
import { REPO_ROOT } from './helpers/roots.js';
import { archived, preStoreBase, removePreStoreBase } from './helpers/pre-store.js';

const ROOT = REPO_ROOT;
const PLANNING = join(ROOT, '.planning');

const snapshot = () => execFileSync('git', ['status', '--porcelain', '.planning/'], { cwd: ROOT, encoding: 'utf-8' });

// M6.E13 t7.3 prep: every "after" assertion holds on either store version, so
// the cutover commit needs no edit here. On v1 the items are files with a
// status in their frontmatter; on v2 they are records whose status is folded
// from their events, and the views carry `SIG-n` (`work-views.js`).
const LIVE_V2 = storeVersion(ROOT) === 2;

// The v2 records in the shape `readItems` returns, enough for the checks below:
// `item` with the folded status (closing stays `closing`) and the last close's reason.
function readRecordsAsItems() {
  return listRecords(ROOT).records.map((r) => {
    const close = r.record.events.findLast((e) => e.type === 'closed');
    const item = { ...r.record, status: r.status };
    if (close) item.close = { reason: close.reason };
    return { path: r.path, folder: null, item, errors: [] };
  });
}

// Every item file in the store, parsed. `work/` also holds WORK.md, EPICS.md and
// WATCHLIST.md; only `{ID}.md` names are items.
function readItems(root = join(PLANNING, 'work')) {
  if (!existsSync(root)) return [];
  return walkFiles(root)
    .filter((p) => parseItemFileName(basename(p)))
    .map((p) => {
      const parsed = parseItem(readFileSync(p, 'utf-8'), { path: p });
      return { path: p, folder: p.slice(root.length + 1).split('/')[0], ...parsed };
    });
}

// How the generated BUGS.md renders an item's status (the same mapping
// `work-roundtrip.test.js` checks the generator against).
const bugWord = (it) =>
  it.status === 'N' ? 'needs-triage' : it.status === 'C' ? (it.close.reason === 'fixed' ? 'fixed' : 'dismissed') : 'confirmed';

// The items the generated BACKLOG.md carries, by `generateBacklog`'s own rule:
// an open status (T, Q or P) and a type that is neither BUG nor Q — in ANY
// folder, so an open item under `work/epics/<id>/` (t7.5) still counts. Today
// every such item is in `backlog/`, and the test says so.
const OPEN_ACTIVE = new Set(['T', 'Q', 'P']);
const carriedBy = (list) => list.filter((i) => OPEN_ACTIVE.has(i.item.status) && !['BUG', 'Q'].includes(i.item.type));
// The heading `generateBacklog` writes: the title with `~~` removed (and `**`
// removed when the parser would still read a done-word), then ` · {id}`.
// Compared with both sides' `**` stripped, so the rule is not re-implemented here.
const heading = (it) => `${String(it.title ?? it.id).replace(/~~|\*\*/g, '')} · ${it.id}`;
const bare = (text) => text.replace(/\*\*/g, '');

let before;
let items;
beforeAll(() => {
  before = snapshot();
  items = LIVE_V2 ? readRecordsAsItems() : readItems();
});
afterAll(() => {
  expect(snapshot()).toEqual(before);
});

describe('Outcome — the store itself', () => {
  it('the store is on, checkStore finds nothing, and the item count is the apply report total', () => {
    // Without this, checkStore's `[]` would also mean "store off".
    expect(isStoreOn(ROOT).on).toBe(true);
    // v2: the records' check (`checkRecords`) is the store check.
    expect(LIVE_V2 ? checkRecords(ROOT) : checkStore(ROOT)).toEqual([]);

    // The total is read from the dry-run report the apply was checked against,
    // not re-typed here. Resolved through the artifact resolver so it keeps
    // working once t7.5 moves this Epic's artifacts into `work/epics/M6.E11/`.
    const report = resolveArtifactPath(PLANNING, 'MIGRATION-DRYRUN', { currentEpic: 'M6.E11' });
    expect(report, 'the migration dry-run report').toBeTruthy();
    const total = Number(readFileSync(report, 'utf-8').match(/^Items: \*\*(\d+)\*\*/m)?.[1]);
    expect(total).toBeGreaterThan(0);
    // ≥, not ==: every later capture adds an item (SIG-249 was the first), and
    // SHIP's closeEpic moves this Epic's items to archive/epics/ — so count both
    // roots, and require every migrated ID (SIG-1 … SIG-{total}) to still exist.
    // REVIEW pass 1, C1: the exact count broke on the first ordinary capture.
    const everywhere = LIVE_V2 ? items : [...items, ...readItems(join(PLANNING, 'archive', 'epics'))];
    expect(everywhere.length).toBeGreaterThanOrEqual(total);
    const ids = new Set(everywhere.map((i) => i.item?.id));
    for (let n = 1; n <= total; n += 1) expect(ids.has(`SIG-${n}`), `SIG-${n}`).toBe(true);
    for (const i of everywhere) expect(i.errors, i.path).toEqual([]);
  });
});

describe('Outcome — bug-status-vs-changelog reads statuses from item files', () => {
  const judged = (bugsText) => walkBugEntries(bugsText).filter((e) => e.kind === 'row' && e.status === 'confirmed');

  it('before (archived original): 31 confirmed rows judged, from hand-typed status cells', () => {
    const base = preStoreBase({ extra: ['CHANGELOG.md'] });
    try {
      const ctx = { baseDir: base };
      // Not BLIND: a missing CHANGELOG makes `run` return [] having checked nothing.
      expect(checkBugStatusVsChangelog.applicability(ctx)).toEqual(APPLICABILITY.EVAL);
      expect(judged(archived('BUGS.md'))).toHaveLength(31);
      const flagged = checkBugStatusVsChangelog.run(ctx).map((f) => f.message.match(/^(B\d+)/)[1]);
      // Every flag is one of the judged rows — the check only ever looks at `confirmed`.
      const judgedIds = new Set(judged(archived('BUGS.md')).map((e) => e.id));
      for (const id of flagged) expect(judgedIds.has(id), id).toBe(true);
    } finally {
      removePreStoreBase(base);
    }
  });

  it.skipIf(LIVE_V2)('after (generated): every B-row status cell is its item file\'s status, so the confirmed set is the open BUG items', () => {
    const ctx = { baseDir: ROOT };
    expect(checkBugStatusVsChangelog.applicability(ctx)).toEqual(APPLICABILITY.EVAL);

    const bugsText = readFileSync(join(PLANNING, 'BUGS.md'), 'utf-8');
    const entries = walkBugEntries(bugsText);
    const bugItems = items.filter((i) => i.item.type === 'BUG');
    expect(entries.length).toBe(bugItems.length);
    // No un-numbered prose entries survive: every bug is a table row with an id.
    expect(entries.every((e) => e.kind === 'row')).toBe(true);

    const byB = new Map(bugItems.map((i) => [`B${i.item.id.slice(i.item.id.indexOf('-') + 1)}`, i.item]));
    for (const e of entries) {
      const it = byB.get(e.id);
      expect(it, `${e.id} has an item file`).toBeDefined();
      expect(e.status, e.id).toBe(bugWord(it));
    }

    const confirmed = judged(bugsText).map((e) => e.id).sort();
    const openBugs = bugItems.filter((i) => i.item.status === 'T').map((i) => `B${i.item.id.slice(i.item.id.indexOf('-') + 1)}`).sort();
    expect(confirmed).toEqual(openBugs);

    // M6.E13 t4.5a: with the store on the check reads the records, not this
    // view, and names each flag by its item ID — so every flag is an open bug item.
    const openItems = bugItems.filter((i) => ['T', 'Q', 'P'].includes(i.item.status)).map((i) => i.item.id);
    const flagged = checkBugStatusVsChangelog.run(ctx).map((f) => f.message.match(/^(SIG-\d+) \(/)[1]);
    for (const id of flagged) expect(openItems, id).toContain(id);
  });
});

describe('Outcome — bug-status-vs-changelog reads statuses from records (v2)', () => {
  // The generated BUGS.md row for each bug: `| SIG-n | `word` | …`, the word
  // `work-views.js` prints — needs-triage, confirmed, closing, or the close reason.
  const word = (it) => ({ N: 'needs-triage', T: 'confirmed', Q: 'confirmed', P: 'confirmed', closing: 'closing' }[it.status]
    ?? it.close.reason);

  it.runIf(LIVE_V2)('after (generated): every row\'s status cell is its record\'s status, every open bug has a row, and the check flags only open bugs', () => {
    const ctx = { baseDir: ROOT };
    expect(checkBugStatusVsChangelog.applicability(ctx)).toEqual(APPLICABILITY.EVAL);

    const rows = readFileSync(join(PLANNING, 'BUGS.md'), 'utf-8').split('\n')
      .map((l) => /^\| (SIG-\d+) \| `([^`]+)` \|/.exec(l)).filter(Boolean).map((m) => ({ id: m[1], status: m[2] }));
    const bugItems = items.filter((i) => i.item.type === 'BUG');
    expect(rows.length).toBeGreaterThan(0);
    const byId = new Map(bugItems.map((i) => [i.item.id, i.item]));
    for (const r of rows) {
      expect(byId.get(r.id), `${r.id} is a bug record`).toBeDefined();
      expect(r.status, r.id).toBe(word(byId.get(r.id)));
    }
    // A closed bug may have left for work/history/; an open one never does.
    const listed = new Set(rows.map((r) => r.id));
    for (const it of bugItems.filter((i) => i.item.status !== 'C')) expect(listed.has(it.item.id), it.item.id).toBe(true);

    const openItems = bugItems.filter((i) => ['T', 'Q', 'P'].includes(i.item.status)).map((i) => i.item.id);
    expect(rows.filter((r) => r.status === 'confirmed').map((r) => r.id).sort()).toEqual([...openItems].sort());
    const flagged = checkBugStatusVsChangelog.run(ctx).map((f) => f.message.match(/^(SIG-\d+) \(/)[1]);
    for (const id of flagged) expect(openItems, id).toContain(id);
  });
});

describe('Outcome — BACKLOG.md liveness is no longer inferred', () => {
  it('before (archived original): 92 rows have their discharge decided from the heading text, 39 of them struck', () => {
    const rows = parseBacklogRows(archived('BACKLOG.md'), { maxDepth: 4 }).filter((r) => !r.inDetails);
    expect(rows).toHaveLength(92);
    expect(rows.filter((r) => r.discharged)).toHaveLength(39);
  });

  it.runIf(LIVE_V2)('after (generated, v2): every row is a record with its status stated, and the open rows are exactly the open non-bug, non-question items', () => {
    // v2 BACKLOG.md carries closing and recently closed rows too, each marked
    // in its heading from the record (`work-views.js`), so nothing is inferred
    // from struck text or done-words: the heading says the record's status.
    const HEADING = /^### (.*) · (SIG-\d+)( · closing| · closed \(([^)]+)\))?$/;
    const headings = readFileSync(join(PLANNING, 'BACKLOG.md'), 'utf-8').split('\n').filter((l) => l.startsWith('### '));
    expect(headings.length).toBeGreaterThan(0);
    const byId = new Map(items.map((i) => [i.item.id, i.item]));
    const open = [];
    for (const h of headings) {
      const m = HEADING.exec(h);
      expect(m, h).not.toBeNull();
      const it = byId.get(m[2]);
      expect(it, m[2]).toBeDefined();
      expect(['BUG', 'Q'], m[2]).not.toContain(it.type);
      if (m[3] === undefined) open.push(m[2]);
      else if (m[3] === ' · closing') expect(it.status, m[2]).toBe('closing');
      else expect([it.status, it.close.reason], m[2]).toEqual(['C', m[4]]);
    }
    expect(open.sort()).toEqual(carriedBy(items).map((i) => i.item.id).sort());
  });

  it.skipIf(LIVE_V2)('after (generated): zero rows are discharged by inference, and the rows are exactly the open non-bug, non-question backlog items', () => {
    const rows = parseBacklogRows(readFileSync(join(PLANNING, 'BACKLOG.md'), 'utf-8'), { maxDepth: 4 });
    expect(rows.filter((r) => r.discharged || r.inDetails)).toEqual([]);

    const carried = carriedBy(items);
    expect(carried.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(carried.length);
    expect(rows.map((r) => bare(r.text)).sort()).toEqual(carried.map((i) => heading(i.item)).sort());
    // Before t7.5 moves this Epic's items, the open non-bug, non-question items
    // in `backlog/` are exactly these.
    const inBacklog = items.filter((i) => i.folder === 'backlog' && !['BUG', 'Q'].includes(i.item.type));
    const inEpics = carried.filter((i) => i.folder !== 'backlog');
    expect(carried.length).toBe(inBacklog.length + inEpics.length);
  });
});

describe('AC-7.3 (as corrected in M6.E11-PROGRESS.md) — /sig:advise reads the items the generated BACKLOG.md carries', () => {
  // M6.E13 t4.2a: with the store on, `readCorpus` reads the records (this v1
  // store through the converter), not the generated BACKLOG.md — so a row carries
  // the item's ID and its own title, not the view's `title · ID` heading.
  it("readCorpus's live row set is exactly those items, by ID and title", async () => {
    const corpus = await readCorpus(ROOT);
    expect(corpus.sources.backlog, 'the backlog was readable').not.toBeNull();

    const carried = carriedBy(items);
    expect(corpus.sources.backlog.rows.map((r) => r.id).sort()).toEqual(carried.map((i) => i.item.id).sort());
    const titleOf = new Map(carried.map((i) => [i.item.id, String(i.item.title ?? i.item.id)]));
    for (const r of corpus.sources.backlog.rows) expect(r.text, r.id).toBe(titleOf.get(r.id));
    expect(corpus.sources.backlog.rows).toHaveLength(carried.length);
  });
});
