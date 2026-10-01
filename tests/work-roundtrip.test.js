// The round trip over Signal's own records (M6.E11.S2 t2.4).
// See .planning/M6.E11-PLAN.md § S2 and .planning/M6.E11-VALIDATION.md rows AC-7.2, AC-9.4, AC-9.5.
//
//   live files → planMigration (dry run) → item files in a TEMP store →
//   generateAll → each shipped reader over the generated file
//
// ⚠ READ-ONLY ON `.planning/`. Everything is written under os.tmpdir(); the
// test asserts `git status --porcelain .planning/` and the four files' mtimes
// are unchanged afterwards. Readers are called exactly as shipped — if one
// could not round-trip without a code change, that is a finding for the Epic
// (D-M6E11-4 puts reader changes out of scope), not something to patch here.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planMigration, segmentBugs, segmentBacklog, segmentInbox, segmentQuestions, SOURCES } from '../plugin/tools/lib/work-migrate.js';
import { generateAll, GENERATED_MARKER, WATCHLIST_FILE } from '../plugin/tools/lib/work-generate.js';
import { rewriteRelativeLinks } from '../plugin/tools/lib/work-links.js';
import { parseItem, stringifyItem } from '../plugin/tools/lib/work-item.js';
import { checkStore } from '../plugin/tools/lib/work-store.js';
import { walkBugEntries, compareBugTally } from '../plugin/tools/lib/bugs-tally.js';
import { parseBacklogRows } from '../plugin/tools/lib/backlog.js';
import { listDrainCandidates, listStandingEntries, parseTriggerWatchlist } from '../plugin/tools/lib/drain.js';
import { countOpenQuestions, extractTopOpenQuestions } from '../plugin/tools/lib/status.js';
import { archived, preStoreBase, removePreStoreBase } from './helpers/pre-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TODAY = '2026-09-29';

// M6.E11 t7.2: the four live files are generated now. The round trip starts from
// the hand-written originals, which the migration archived verbatim.
const live = (f) => archived(f);

function planningSnapshot() {
  const status = execFileSync('git', ['status', '--porcelain', '.planning/'], { cwd: ROOT, encoding: 'utf-8' });
  const mtimes = SOURCES.map((f) => statSync(join(ROOT, '.planning', f)).mtimeMs);
  return { status, mtimes };
}

let before;
let base;
let plan;
let tmp;
let gen;

beforeAll(async () => {
  before = planningSnapshot();
  base = preStoreBase();
  plan = planMigration(base, { key: 'SIG', today: TODAY });

  tmp = mkdtempSync(join(tmpdir(), 'work-roundtrip-'));
  const planning = join(tmp, '.planning');
  mkdirSync(join(planning, 'work'), { recursive: true });
  writeFileSync(join(planning, 'work', 'WORK.md'), '---\nkey: SIG\nschema_version: 1\n---\n');
  for (const { item, body, dir } of plan.items) {
    mkdirSync(join(planning, dir), { recursive: true });
    writeFileSync(join(planning, dir, `${item.id}.md`), stringifyItem(item, body));
  }
  writeFileSync(join(planning, 'work', WATCHLIST_FILE), plan.watchlist.text);
  await generateAll(tmp);
  gen = Object.fromEntries(SOURCES.map((f) => [f, readFileSync(join(planning, f), 'utf-8')]));
}, 60_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  removePreStoreBase(base);
  expect(planningSnapshot()).toEqual(before);
});

const items = () => plan.items.map((i) => i.item);
const isOpen = (it) => it.status !== 'C';

describe('the temp store itself', () => {
  it('holds one file per planned item and checkStore finds nothing wrong', () => {
    expect(checkStore(tmp)).toEqual([]);
  });

  it('every item file parses back to the same frontmatter and body', () => {
    for (const { item, body, dir } of plan.items) {
      const parsed = parseItem(readFileSync(join(tmp, '.planning', dir, `${item.id}.md`), 'utf-8'));
      expect(parsed.errors, item.id).toEqual([]);
      expect(parsed.item).toEqual(item);
      expect(parsed.body).toBe(body);
    }
  });

  it('every generated file starts with the marker', () => {
    for (const f of SOURCES) expect(gen[f].split('\n')[0]).toBe(GENERATED_MARKER);
  });
});

describe('AC-7.2 — each shipped reader over its generated file agrees with the items', () => {
  it('walkBugEntries: the (B-id, status) set equals the BUG items', () => {
    const word = (it) =>
      it.status === 'N' ? 'needs-triage' : it.status === 'C' ? (it.close.reason === 'fixed' ? 'fixed' : 'dismissed') : 'confirmed';
    const expected = items()
      .filter((it) => it.type === 'BUG')
      .map((it) => `B${it.id.slice(4)} ${word(it)}`)
      .sort();
    const seen = walkBugEntries(gen['BUGS.md']).map((e) => `${e.id} ${e.status}`).sort();
    expect(seen).toEqual(expected);
    expect(compareBugTally(gen['BUGS.md']).ok).toBe(true);
  });

  it('walkBugEntries: every numbered source row keeps its id and status', () => {
    const generated = new Set(walkBugEntries(gen['BUGS.md']).map((e) => `${e.id} ${e.status}`));
    const sourceRows = walkBugEntries(live('BUGS.md')).filter((e) => e.kind === 'row');
    expect(sourceRows).toHaveLength(127);
    for (const e of sourceRows) expect(generated.has(`${e.id} ${e.status}`), e.id).toBe(true);
  });

  it.each([3, 4])('parseBacklogRows (maxDepth %i): the live titles equal the open backlog items', (maxDepth) => {
    const expected = items()
      .filter((it) => ['T', 'Q', 'P'].includes(it.status) && it.type !== 'BUG' && it.type !== 'Q')
      .map((it) => `${it.title.replace(/~~/g, '')} · ${it.id}`)
      .sort();
    const rows = parseBacklogRows(gen['BACKLOG.md'], { maxDepth });
    expect(rows.filter((r) => r.inDetails)).toEqual([]);
    expect(rows.filter((r) => r.discharged)).toEqual([]);
    expect(rows.map((r) => r.text).sort()).toEqual(expected);
  });

  it('parseBacklogRows: every source row that was live is live in the generated file, or is named here', () => {
    const genLegacy = new Set(
      parseBacklogRows(gen['BACKLOG.md'], { maxDepth: 4 }).map((r) => plan.items.find((i) => r.text.endsWith(` · ${i.item.id}`)).item.legacy_id)
    );
    const sourceLive = parseBacklogRows(live('BACKLOG.md'), { maxDepth: 4 }).filter((r) => !r.inDetails && !r.discharged);
    const leftOut = sourceLive
      .filter((r) => !genLegacy.has(`BACKLOG.md:${r.line}`))
      .map((r) => {
        const it = plan.items.find((i) => i.item.legacy_id === `BACKLOG.md:${r.line}`).item;
        return `${it.type} ${it.status}${it.close ? ` ${it.close.reason}` : ''}`;
      })
      .sort();
    // The only live rows that leave BACKLOG.md: the fix-lane row (now a bug in
    // BUGS.md), the product-call row (now in OPEN-QUESTIONS.md), and the three
    // rows whose heading says the work was folded/absorbed elsewhere
    // (D-M6E11-16 → closed dup of the destination item).
    expect(leftOut).toEqual(['BUG T', 'CHORE C dup', 'CHORE C dup', 'FEAT C dup', 'Q T']);
    // And no row that was discharged comes back to life.
    const sourceClosed = new Set(
      parseBacklogRows(live('BACKLOG.md'), { maxDepth: 4 }).filter((r) => !r.inDetails && r.discharged).map((r) => `BACKLOG.md:${r.line}`)
    );
    for (const l of genLegacy) expect(sourceClosed.has(l), l).toBe(false);
  });

  it('listDrainCandidates: (heading, status line) of the open captures; the watchlist is the one standing entry', () => {
    const expected = items()
      .filter((it) => it.status === 'N' && it.type !== 'BUG' && it.type !== 'Q')
      .map((it) => [it.title, `**Status:** untriaged (N) · ${it.id}`]);
    expect(expected).toHaveLength(5);
    expect(listDrainCandidates(gen['ISSUES-INBOX.md']).map((c) => [c.heading, c.statusLine])).toEqual(expected);
    expect(listStandingEntries(gen['ISSUES-INBOX.md'])).toHaveLength(1);
    expect(parseTriggerWatchlist(gen['ISSUES-INBOX.md'])).toEqual(parseTriggerWatchlist(live('ISSUES-INBOX.md')));
  });

  it('countOpenQuestions / extractTopOpenQuestions: the open Q items, in order', () => {
    const open = items().filter((it) => it.type === 'Q' && isOpen(it));
    expect(countOpenQuestions(gen['OPEN-QUESTIONS.md'])).toBe(open.length);
    const expectedTop = extractTopOpenQuestions(open.map((it) => `## ${it.title}`).join('\n'));
    expect(extractTopOpenQuestions(gen['OPEN-QUESTIONS.md'])).toEqual(expectedTop);
  });
});

describe('AC-9.4 — lossless: every source byte is in exactly one row or one named region', () => {
  it('each item body, links rewritten back, is its source row verbatim', () => {
    for (const { item, body, dir, sourceRef } of plan.items) {
      const lines = live(sourceRef.file).split('\n');
      expect(sourceRef.text, item.id).toBe(lines.slice(sourceRef.line - 1, sourceRef.endLine).join('\n'));
      expect(rewriteRelativeLinks(body, dir, ''), item.id).toBe(sourceRef.text);
    }
    expect(rewriteRelativeLinks(plan.watchlist.text, plan.watchlist.dir, '')).toBe(plan.watchlist.sourceRef.text);
  });

  it.each(SOURCES)('%s: rows (from item bodies) + named orphans + separator gaps rebuild the file exactly', (file) => {
    const text = live(file);
    const regions = [
      ...plan.items
        .filter((i) => i.sourceRef.file === file)
        .map((i) => ({ line: i.sourceRef.line, endLine: i.sourceRef.endLine, text: rewriteRelativeLinks(i.body, i.dir, '') })),
      ...plan.orphans.filter((o) => o.source === file),
      ...plan.gaps.filter((g) => g.source === file),
      ...(file === 'ISSUES-INBOX.md'
        ? [{ ...plan.watchlist.sourceRef, text: rewriteRelativeLinks(plan.watchlist.text, plan.watchlist.dir, '') }]
        : []),
    ].sort((a, b) => a.line - b.line);
    let next = 1;
    for (const r of regions) {
      expect(r.line, `${file}: region at ${r.line}`).toBe(next);
      next = r.endLine + 1;
    }
    expect(next - 1).toBe(text.split('\n').length);
    expect(regions.map((r) => r.text).join('\n')).toBe(text);
    for (const g of plan.gaps.filter((x) => x.source === file)) {
      for (const l of g.text.split('\n')) expect(['', '---']).toContain(l.trim());
    }
  });

  it('names every orphan region', () => {
    expect(plan.orphans.map((o) => `${o.source} ${o.name.replace(/(section intro: ).*/, '$1…').replace(/(: \S+ \S+).*/, '$1')}`)).toEqual([
      'BUGS.md preamble',
      'BUGS.md between rows: M5.E4 close-out',
      'BUGS.md footer (tally)',
      'BACKLOG.md preamble',
      ...Array(11).fill('BACKLOG.md section intro: …'),
      'BACKLOG.md stale footer',
      'BACKLOG.md footer',
      'ISSUES-INBOX.md preamble',
      'OPEN-QUESTIONS.md preamble',
      'OPEN-QUESTIONS.md note: (The M4.5.E5',
    ]);
  });
});

describe('AC-9.5 — counts reconcile, from this run', () => {
  it('items created = the sum of the per-source counts, which equal the segmenters', () => {
    const segCounts = {
      'BUGS.md': segmentBugs(live('BUGS.md')).rows.length,
      'BACKLOG.md': segmentBacklog(live('BACKLOG.md')).rows.length,
      'ISSUES-INBOX.md': segmentInbox(live('ISSUES-INBOX.md')).rows.length,
      'OPEN-QUESTIONS.md': segmentQuestions(live('OPEN-QUESTIONS.md')).rows.length,
    };
    expect(plan.counts.bySource).toEqual(segCounts);
    const sum = Object.values(segCounts).reduce((a, b) => a + b, 0);
    expect(plan.items).toHaveLength(sum);
    expect(plan.counts.total).toBe(sum);
    expect(Object.values(plan.counts.byStatus).reduce((a, b) => a + b, 0)).toBe(sum);
  });
});
