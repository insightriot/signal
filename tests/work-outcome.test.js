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
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { checkBugStatusVsChangelog } from '../plugin/tools/lib/published-facts.js';
import { APPLICABILITY } from '../plugin/tools/lib/state-drift.js';
import { walkBugEntries } from '../plugin/tools/lib/bugs-tally.js';
import { parseBacklogRows } from '../plugin/tools/lib/backlog.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { checkStore, isStoreOn, parseItemFileName, walkFiles } from '../plugin/tools/lib/work-store.js';
import { parseItem } from '../plugin/tools/lib/work-item.js';
import { resolveArtifactPath } from '../plugin/tools/lib/resume.js';
import { REPO_ROOT } from './helpers/roots.js';
import { archived, preStoreBase, removePreStoreBase } from './helpers/pre-store.js';

const ROOT = REPO_ROOT;
const PLANNING = join(ROOT, '.planning');

const snapshot = () => execFileSync('git', ['status', '--porcelain', '.planning/'], { cwd: ROOT, encoding: 'utf-8' });

// Every item file in the store, parsed. `work/` also holds WORK.md, EPICS.md and
// WATCHLIST.md; only `{ID}.md` names are items.
function readItems() {
  return walkFiles(join(PLANNING, 'work'))
    .filter((p) => parseItemFileName(basename(p)))
    .map((p) => {
      const parsed = parseItem(readFileSync(p, 'utf-8'), { path: p });
      return { path: p, folder: p.slice(join(PLANNING, 'work').length + 1).split('/')[0], ...parsed };
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
  items = readItems();
});
afterAll(() => {
  expect(snapshot()).toEqual(before);
});

describe('Outcome — the store itself', () => {
  it('the store is on, checkStore finds nothing, and the item count is the apply report total', () => {
    // Without this, checkStore's `[]` would also mean "store off".
    expect(isStoreOn(ROOT).on).toBe(true);
    expect(checkStore(ROOT)).toEqual([]);

    // The total is read from the dry-run report the apply was checked against,
    // not re-typed here. Resolved through the artifact resolver so it keeps
    // working once t7.5 moves this Epic's artifacts into `work/epics/M6.E11/`.
    const report = resolveArtifactPath(PLANNING, 'MIGRATION-DRYRUN', { currentEpic: 'M6.E11' });
    expect(report, 'the migration dry-run report').toBeTruthy();
    const total = Number(readFileSync(report, 'utf-8').match(/^Items: \*\*(\d+)\*\*/m)?.[1]);
    expect(total).toBeGreaterThan(0);
    expect(items).toHaveLength(total);
    for (const i of items) expect(i.errors, i.path).toEqual([]);
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

  it('after (generated): every B-row status cell is its item file\'s status, so the confirmed set is the open BUG items', () => {
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

    const flagged = checkBugStatusVsChangelog.run(ctx).map((f) => f.message.match(/^(B\d+)/)[1]);
    for (const id of flagged) expect(confirmed, id).toContain(id);
  });
});

describe('Outcome — BACKLOG.md liveness is no longer inferred', () => {
  it('before (archived original): 92 rows have their discharge decided from the heading text, 39 of them struck', () => {
    const rows = parseBacklogRows(archived('BACKLOG.md'), { maxDepth: 4 }).filter((r) => !r.inDetails);
    expect(rows).toHaveLength(92);
    expect(rows.filter((r) => r.discharged)).toHaveLength(39);
  });

  it('after (generated): zero rows are discharged by inference, and the rows are exactly the open non-bug, non-question backlog items', () => {
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
  it("readCorpus's live row set equals the titles of those items", async () => {
    const corpus = await readCorpus(ROOT);
    expect(corpus.sources.backlog, 'BACKLOG.md was readable').not.toBeNull();

    const carried = carriedBy(items);
    expect(new Set(corpus.sources.backlog.rows.map((r) => bare(r.text)))).toEqual(new Set(carried.map((i) => heading(i.item))));
    expect(corpus.sources.backlog.rows).toHaveLength(carried.length);
  });
});
