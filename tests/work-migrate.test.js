// Tests for the migration segmenters and mapping (M6.E11.S2 t2.1, t2.2).
// See .planning/M6.E11-PLAN.md § S2 and .planning/M6.E11-VALIDATION.md rows AC-9.1, AC-9.2, AC-9.5.
//
// ⚠ READ-ONLY ON THE LIVE FILES. Every test that reads `.planning/` asserts
// afterwards that `git status --porcelain .planning/` and the four files'
// mtimes are unchanged. S2 is a dry run by design (PLAN "What this Epic does
// for the first time"): if the segmenter breaks, it breaks here, not against
// 248 records.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  segmentBugs,
  segmentBacklog,
  segmentInbox,
  segmentQuestions,
} from '../plugin/tools/lib/work-migrate.js';
import { archived, preStoreBase, removePreStoreBase } from './helpers/pre-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIX = join(__dirname, 'fixtures', 'work-migrate');
const LIVE = ['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md'];

const fixture = (name) => readFileSync(join(FIX, name), 'utf-8');

// Every line of a source belongs to exactly one region, and joining the
// regions in order gives the file back byte-for-byte.
function assertPartition(text, seg) {
  const regions = [
    ...seg.rows.map((r) => ({ ...r, kind: 'row' })),
    ...seg.orphans.map((r) => ({ ...r, kind: 'orphan' })),
    ...seg.gaps.map((r) => ({ ...r, kind: 'gap' })),
    ...(seg.watchlist ? [{ ...seg.watchlist, kind: 'watchlist' }] : []),
  ].sort((a, b) => a.line - b.line);
  const total = text.split('\n').length;
  let next = 1;
  for (const r of regions) {
    expect(r.line, `region at ${r.line} starts where the previous ended`).toBe(next);
    expect(r.endLine).toBeGreaterThanOrEqual(r.line);
    next = r.endLine + 1;
  }
  expect(next - 1).toBe(total);
  expect(regions.map((r) => r.text).join('\n')).toBe(text);
  for (const g of seg.gaps) {
    for (const l of g.text.split('\n')) expect(['', '---']).toContain(l.trim());
  }
}

describe('segmentBugs — hazard fixture cut from the live file', () => {
  const text = fixture('BUGS.md');
  const seg = segmentBugs(text);
  const byId = (id) => seg.rows.find((r) => r.id === id);

  it('finds every table row in file order, not id order', () => {
    const ids = seg.rows.filter((r) => r.kind === 'table').map((r) => r.id);
    expect(ids).toEqual(['B1', 'B51', 'B52', 'B53', 'B63', 'B72', 'B71', 'B87', 'B88', 'B99', 'B97', 'B98', 'B96']);
  });

  it('B52 continues past a blank line to the line that closes the row', () => {
    const b52 = byId('B52');
    expect(b52.endLine - b52.line).toBe(2);
    expect(b52.text.split('\n')[2]).toMatch(/^ {2}\*\*⚠ Related hazard/);
    expect(b52.text.trimEnd().endsWith('|')).toBe(true);
    expect(b52.summary).toContain('Related hazard');
  });

  it('B99 continues over numbered paragraphs to its closing pipe', () => {
    const b99 = byId('B99');
    expect(b99.endLine - b99.line).toBe(14);
    expect(b99.summary).toMatch(/Bottom line/);
  });

  it('a `|` inside a code span never truncates the summary (B63, B72, B88, B96)', () => {
    for (const id of ['B63', 'B72', 'B88', 'B96']) {
      const row = byId(id);
      // The summary is everything after the FOURTH pipe (id, status, pri
      // cells) up to the row's LAST pipe — computed here by position, not by
      // split, so the expectation cannot share the defect.
      let at = -1;
      for (let k = 0; k < 4; k++) at = row.text.indexOf('|', at + 1);
      const expected = row.text.slice(at + 1, row.text.lastIndexOf('|')).trim();
      expect(row.summary).toBe(expected);
      expect(row.text.split('|').length).toBeGreaterThan(6); // really does carry extra pipes
    }
    expect(byId('B96').summary).toContain('(?:^|\\n)');
    expect(byId('B88').summary).toContain("git branch --show-current|rev-parse");
  });

  it('reads status and priority cells, bold stripped by the mapping not here', () => {
    expect(byId('B52').statusRaw).toBe('`fixed` (v0.1.20)');
    expect(byId('B52').priority).toBe('**P1**');
    expect(byId('B1').priority).toBe('—');
  });

  it('un-numbered `##` entries become rows with their status line and stop at `---`', () => {
    const entries = seg.rows.filter((r) => r.kind === 'entry');
    expect(entries.map((e) => e.statusRaw)).toEqual([
      'resolved-not-a-defect',
      'needs-triage',
      'withdrawn (duplicate)',
      'needs-triage',
    ]);
    for (const e of entries) {
      expect(e.text.startsWith('## ')).toBe(true);
      expect(e.text.split('\n').at(-1).trim()).not.toBe('---');
    }
  });

  it('text between rows is a NAMED orphan, not absorbed into a row', () => {
    const names = seg.orphans.map((o) => o.name);
    expect(names[0]).toBe('preamble');
    expect(names.some((n) => /M5\.E4 close-out/.test(n))).toBe(true);
    expect(names.at(-1)).toBe('footer (tally)');
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });

  it('refuses a row that never closes rather than swallowing the next row', () => {
    const broken = '| B1 | `fixed` | P3 | starts here\nno closing pipe\n| B2 | `fixed` | P3 | next |\n';
    expect(() => segmentBugs(broken)).toThrow(/B1.*never closes/);
  });
});

describe('segmentBacklog — hazard fixture', () => {
  const text = fixture('BACKLOG.md');
  const seg = segmentBacklog(text);

  it('uses parseBacklogRows at depth 4 and carries its discharge verdict', () => {
    const b52 = seg.rows.find((r) => /B52/.test(r.heading));
    expect(b52.discharged).toBe(true);
    expect(seg.rows.some((r) => r.heading.startsWith('Jev key and receipt') && !r.discharged)).toBe(true);
    // `####` rows are rows at depth 4.
    expect(seg.rows.some((r) => r.depth === 4)).toBe(true);
  });

  it('folds each <details> block into the row above; its headings are not rows', () => {
    const b52 = seg.rows.find((r) => /B52/.test(r.heading));
    expect(b52.text).toContain('<details>');
    expect(b52.text).toContain('### `B52` — the session binds to a stale plugin cache · **fix lane**');
    expect(b52.text).toContain('</details>');
    expect(seg.rows.filter((r) => /Signal is branch-blind/.test(r.heading))).toHaveLength(1);
  });

  it('struck siblings are two rows (the parser sees two)', () => {
    const twins = seg.rows.filter((r) => r.heading.includes('Cross-references become links'));
    expect(twins.map((t) => t.discharged)).toEqual([true, false]);
  });

  it('section intros, the preamble and the footer are named orphans', () => {
    const names = seg.orphans.map((o) => o.name);
    expect(names[0]).toBe('preamble');
    expect(names).toContain('section intro: Next work — the agreed sequence *(Brett, 2026-08-06, after v0.1.19 shipped)*');
    expect(names.at(-1)).toBe('footer');
    expect(seg.orphans.at(-1).text).toMatch(/\*Last updated: 2026-09-27\*/);
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });
});

describe('segmentInbox — fixture', () => {
  const text = fixture('ISSUES-INBOX.md');
  const seg = segmentInbox(text);

  it('returns the captures as rows and the standing watchlist separately', () => {
    expect(seg.rows).toHaveLength(5);
    expect(seg.rows.every((r) => /Deferred/.test(r.statusLine ?? '') || /Logged/.test(r.statusLine ?? ''))).toBe(true);
    expect(seg.watchlist.text).toMatch(/^## Trigger watchlist/);
    expect(seg.watchlist.text).toContain('<!-- standing -->');
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble']);
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });
});

describe('segmentQuestions — fixture', () => {
  const text = fixture('OPEN-QUESTIONS.md');
  const seg = segmentQuestions(text);

  it('finds 11 entries, 2 answered (struck + ANSWERED)', () => {
    expect(seg.rows).toHaveLength(11);
    expect(seg.rows.filter((r) => r.answered).map((r) => r.line)).toEqual([9, 143]);
  });

  it('the italic note after a `---` belongs to no entry', () => {
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble', expect.stringMatching(/^note: \(The M4\.5\.E5 re-entry/)]);
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });
});

// ── The live files, read-only ────────────────────────────────────────────────

function planningSnapshot() {
  const status = execFileSync('git', ['status', '--porcelain', '.planning/'], { cwd: ROOT, encoding: 'utf-8' });
  const mtimes = LIVE.map((f) => statSync(join(ROOT, '.planning', f)).mtimeMs);
  return { status, mtimes };
}

describe('segmenters over the archived originals (read-only)', () => {
  let before;
  beforeAll(() => {
    before = planningSnapshot();
  });
  afterAll(() => {
    expect(planningSnapshot()).toEqual(before);
  });

  // M6.E11 t7.2: the four live files are generated now; these counts are of the
  // hand-written originals, which the migration archived verbatim.
  const live = (f) => archived(f);

  it('BUGS.md: 127 table rows + 13 un-numbered entries = 140, and the named orphans', () => {
    const text = live('BUGS.md');
    const seg = segmentBugs(text);
    expect(seg.rows.filter((r) => r.kind === 'table')).toHaveLength(127);
    expect(seg.rows.filter((r) => r.kind === 'entry')).toHaveLength(13);
    expect(seg.orphans.map((o) => o.name)).toEqual([
      'preamble',
      expect.stringMatching(/^between rows: M5\.E4 close-out/),
      'footer (tally)',
    ]);
    assertPartition(text, seg);
  });

  it('BACKLOG.md: 92 rows (94 headings at depth 4, minus 2 inside <details>)', () => {
    const text = live('BACKLOG.md');
    const seg = segmentBacklog(text);
    expect(seg.rows).toHaveLength(92);
    const names = seg.orphans.map((o) => o.name);
    expect(names[0]).toBe('preamble');
    expect(names.at(-1)).toBe('footer');
    // Between them: one intro per container heading, and one old footer that
    // rows were later appended below (it belongs to neither neighbour).
    expect(names.filter((n) => n.startsWith('section intro: '))).toHaveLength(11);
    expect(names.slice(1, -1).filter((n) => !n.startsWith('section intro: '))).toEqual(['stale footer']);
    assertPartition(text, seg);
  });

  it('ISSUES-INBOX.md: 5 captures + the standing watchlist', () => {
    const text = live('ISSUES-INBOX.md');
    const seg = segmentInbox(text);
    expect(seg.rows).toHaveLength(5);
    expect(seg.watchlist).not.toBeNull();
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble']);
    assertPartition(text, seg);
  });

  it('OPEN-QUESTIONS.md: 11 entries, 2 answered', () => {
    const text = live('OPEN-QUESTIONS.md');
    const seg = segmentQuestions(text);
    expect(seg.rows).toHaveLength(11);
    expect(seg.rows.filter((r) => r.answered)).toHaveLength(2);
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble', expect.stringMatching(/^note: /)]);
    assertPartition(text, seg);
  });
});

// ── t2.2 mapping (AC-9.2, AC-9.1 numbering, AC-9.5 counts) ───────────────────

import { validateItem } from '../plugin/tools/lib/work-item.js';
import { planMigration, planMigrationFromTexts, MIGRATION_PROOF } from '../plugin/tools/lib/work-migrate.js';
import { rewriteRelativeLinks } from '../plugin/tools/lib/work-links.js';

const TODAY = '2026-09-29';

const BUGS_SAMPLE = [
  '# Bugs',
  '',
  '| ID | Status | Pri | Summary |',
  '|---|---|---|---|',
  '| B1 | `needs-triage` | P3 | **Short title.** Body with a [link](../analysis/X.md). |',
  '| B3 | `confirmed` | **P2** | No bold lead here. Second sentence. |',
  '| B2 | `fixed` (v0.1.13) | — | **⟨STATUS CORRECTED 2026-08-14⟩** **Real title** rest. |',
  '| B4 | `dismissed` | P3 | **FIXED 2026-08-21.** The opening line now says the rule. |',
  '| B6 | `fixed` | P3 | **FIXED — flipped**, verified in source. More. |',
  '| B5 | `fixed` | P2 | **The `a|b` cell** carries a pipe. |',
  '',
  '## Heading capture one',
  '',
  '**Status:** needs-triage',
  '',
  'Body.',
  '',
  '---',
  '',
  '## Not a defect after all',
  '',
  '**Status:** resolved-not-a-defect',
  '',
  '---',
  '',
  '## ⚠ WITHDRAWN as a duplicate of `B3` — same thing',
  '',
  '**Status:** withdrawn (duplicate)',
  '',
  '---',
  '',
  '## Closed by hand',
  '',
  '**Status:** fixed — **root cause closed**',
  '',
  '---',
  '',
  '## Triaged heading',
  '',
  '**Status:** confirmed',
  '',
].join('\n');

const BACKLOG_SAMPLE = [
  '# Backlog',
  '',
  '## Section',
  '',
  '### ~~Struck row~~ · **roadmap** · **DONE 2026-08-01**',
  '',
  '### Open hygiene row · **hygiene** · small',
  '',
  '### Product question row · **product call**',
  '',
  '### Fix row · **fix lane** · small',
  '',
  '### Verify row · **verification** · small',
  '',
  '### Untagged row',
  '',
  '### Body-tagged row',
  '',
  '**Tag:** hygiene',
  '',
  '### ~~Old thing~~ — **✂ ABANDONED (M5.E7)**',
  '',
  '### Cut thing — **✂ CUT by M5.E7**',
  '',
  '### ~~Superseded thing~~ · **SUPERSEDED 2026-09-02 by `dangling-reference`**',
  '',
  '### M5.E10 — Review hardening',
  '',
  '### State narrative · **hygiene** · **FOLDED INTO `M5.E10`**',
  '',
  '### Stale claims → **absorbed into M5.E99**',
  '',
  '### Retro replay — **KEPT, absorbed into M5.E10**',
  '',
  '### ~~Vocabulary sweep~~ — **✅ largely DONE (M5.E7)**',
  '',
].join('\n');

const INBOX_SAMPLE = [
  '# Issues Inbox',
  '',
  '## Trigger watchlist — standing entry',
  '<!-- standing -->',
  '',
  '**Status:** standing.',
  '',
  '| Parked item | Trigger condition | Fired? |',
  '|---|---|---|',
  '| X | Y | no |',
  '',
  '---',
  '',
  '## A capture',
  '',
  '**Status:** Logged 2026-08-18 via `/sig:add`. → Deferred 2026-08-19 (M6.E3 drain).',
  '',
  'Body of the capture.',
  '',
  '---',
].join('\n');

const QUESTIONS_SAMPLE = [
  '# Open Questions',
  '',
  '## ~~Answered one?~~ — **ANSWERED YES, 2026-08-22**',
  '',
  'Answer.',
  '',
  '---',
  '',
  '## Still open?',
  '',
  'Why it matters.',
  '',
].join('\n');

function plan() {
  return planMigrationFromTexts(
    { 'BUGS.md': BUGS_SAMPLE, 'BACKLOG.md': BACKLOG_SAMPLE, 'ISSUES-INBOX.md': INBOX_SAMPLE, 'OPEN-QUESTIONS.md': QUESTIONS_SAMPLE },
    { key: 'SIG', today: TODAY }
  );
}

describe('planMigrationFromTexts — the mapping table (AC-9.2)', () => {
  const p = plan();
  const byLegacy = (legacy) => p.items.find((i) => i.item.legacy_id === legacy);
  const byTitle = (re) => p.items.find((i) => re.test(i.item.title ?? ''));
  const closeOf = (it) => [it.item.status, it.item.close?.reason, it.item.close?.dup_of].filter(Boolean).join(' ');

  it('every item passes validateItem', () => {
    for (const { item } of p.items) expect(validateItem(item), item.id).toEqual([]);
  });

  it('numbered bugs keep their number; un-numbered take max+1… in file order; then backlog, inbox, questions', () => {
    expect(p.items.filter((i) => i.item.source === 'migration:BUGS.md').map((i) => i.item.id)).toEqual([
      'SIG-1', 'SIG-2', 'SIG-3', 'SIG-4', 'SIG-5', 'SIG-6', 'SIG-7', 'SIG-8', 'SIG-9', 'SIG-10', 'SIG-11',
    ]);
    expect(byLegacy('B3').item.id).toBe('SIG-3');
    expect(p.items.find((i) => i.item.title === 'Heading capture one').item.id).toBe('SIG-7');
    const order = p.items.map((i) => i.item.source);
    expect(order.indexOf('migration:BACKLOG.md')).toBe(11);
    expect(order.lastIndexOf('migration:BACKLOG.md') < order.indexOf('migration:ISSUES-INBOX.md')).toBe(true);
    expect(order.lastIndexOf('migration:ISSUES-INBOX.md') < order.indexOf('migration:OPEN-QUESTIONS.md')).toBe(true);
    expect(p.items.map((i) => Number(i.item.id.slice(4)))).toEqual(p.items.map((_, k) => k + 1));
  });

  it('bug statuses map per D-M6E11-14 and -16', () => {
    expect(closeOf(byLegacy('B1'))).toBe('N');
    expect(closeOf(byLegacy('B3'))).toBe('T');
    expect(closeOf(byLegacy('B2'))).toBe('C fixed');
    expect(closeOf(byLegacy('B4'))).toBe('C rejected');
    expect(closeOf(byTitle(/^Heading capture one$/))).toBe('N');
    expect(closeOf(byTitle(/^Not a defect/))).toBe('C rejected');
    expect(closeOf(byTitle(/WITHDRAWN/))).toBe('C dup SIG-3');
    expect(closeOf(byTitle(/^Closed by hand$/))).toBe('C fixed');
    expect(closeOf(byTitle(/^Triaged heading$/))).toBe('T');
  });

  it('an unknown status refuses rather than guessing', () => {
    const bad = BUGS_SAMPLE.replace('**Status:** confirmed', '**Status:** pondering');
    expect(() => planMigrationFromTexts({ 'BUGS.md': bad }, { key: 'SIG', today: TODAY })).toThrow(/pondering/);
  });

  it('every migrated close: by migration, at the run date, legacy proof', () => {
    const closed = p.items.filter((i) => i.item.status === 'C');
    expect(closed.length).toBeGreaterThan(5);
    for (const { item } of closed) {
      expect(item.close.by).toBe('migration');
      expect(item.close.at).toBe(TODAY);
      expect(item.close.proof).toBe(MIGRATION_PROOF);
    }
    expect(MIGRATION_PROOF).toBe('legacy — not re-verified');
  });

  it('backlog statuses: parser verdict, reason from the heading, dup only to a real item', () => {
    expect(closeOf(byTitle(/Struck row/))).toBe('C fixed');
    expect(closeOf(byTitle(/Open hygiene row/))).toBe('T');
    expect(closeOf(byTitle(/Old thing/))).toBe('C wontdo');
    expect(closeOf(byTitle(/Cut thing/))).toBe('C wontdo');
    const m510 = byTitle(/^M5\.E10 — Review hardening$/).item.id;
    expect(closeOf(byTitle(/State narrative/))).toBe(`C dup ${m510}`);
    // Unresolvable target: closed `fixed`, the destination named in the note, never an invented id.
    const sup = byTitle(/Superseded thing/);
    expect(closeOf(sup)).toBe('C fixed');
    expect(sup.item.migration_note).toMatch(/SUPERSEDED.*dangling-reference/);
    const abs = byTitle(/Stale claims/);
    expect(closeOf(abs)).toBe('C fixed');
    expect(abs.item.migration_note).toMatch(/M5\.E99/);
    // KEPT wins over the fold vocabulary.
    const kept = byTitle(/Retro replay/);
    expect(closeOf(kept)).toBe('T');
    expect(kept.item.migration_note).toMatch(/KEPT/);
    // Qualified done-word: today's parser says closed (struck) — adopted, and flagged.
    const partial = byTitle(/Vocabulary sweep/);
    expect(closeOf(partial)).toBe('C fixed');
    expect(partial.item.migration_note).toMatch(/partial/i);
  });

  it('types: bugs BUG; backlog tag → FEAT/CHORE/Q/BUG, untagged FEAT; inbox NEW; questions Q', () => {
    expect(byLegacy('B1').item.type).toBe('BUG');
    expect(byTitle(/Heading capture one/).item.type).toBe('BUG');
    expect(byTitle(/Open hygiene row/).item.type).toBe('CHORE');
    expect(byTitle(/Verify row/).item.type).toBe('CHORE');
    expect(byTitle(/Product question row/).item.type).toBe('Q');
    expect(byTitle(/^Fix row/).item.type).toBe('BUG');
    expect(byTitle(/Untagged row/).item.type).toBe('FEAT');
    expect(byTitle(/Body-tagged row/).item.type).toBe('CHORE');
    expect(byTitle(/Struck row/).item.type).toBe('FEAT');
    expect(byTitle(/^A capture$/).item.type).toBe('NEW');
    expect(byTitle(/Still open/).item.type).toBe('Q');
  });

  it('inbox Deferred → N; open question → T; answered → C fixed', () => {
    expect(closeOf(byTitle(/^A capture$/))).toBe('N');
    expect(closeOf(byTitle(/Still open/))).toBe('T');
    expect(closeOf(byTitle(/Answered one/))).toBe('C fixed');
  });

  it('bug titles: the bold lead, annotations skipped, else the first sentence; ≤120 chars', () => {
    expect(byLegacy('B1').item.title).toBe('Short title.');
    expect(byLegacy('B3').item.title).toBe('No bold lead here.');
    expect(byLegacy('B2').item.title).toBe('Real title');
    expect(byLegacy('B4').item.title).toBe('The opening line now says the rule.');
    expect(byLegacy('B5').item.title).toBe('The `a|b` cell');
    expect(byLegacy('B6').item.title).toBe('verified in source.');
    const long = planMigrationFromTexts(
      { 'BUGS.md': `| B1 | \`fixed\` | P3 | **${'word '.repeat(40)}** |\n` },
      { key: 'SIG', today: TODAY }
    ).items[0].item.title;
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('…')).toBe(true);
  });

  it('priority from the Pri cell with bold stripped; `—` stores nothing', () => {
    expect(byLegacy('B3').item.priority).toBe('P2');
    expect(byLegacy('B2').item.priority).toBeUndefined();
  });

  it('legacy_id, source and source_ref record where each item came from', () => {
    expect(byLegacy('B1').item).toMatchObject({ source: 'migration:BUGS.md', source_ref: 'BUGS.md:5' });
    const cap = byTitle(/^A capture$/);
    expect(cap.item.legacy_id).toBe('ISSUES-INBOX.md:14');
    expect(cap.item.source).toBe('migration:ISSUES-INBOX.md');
    expect(byTitle(/Open hygiene row/).item.legacy_id).toBe('BACKLOG.md:7');
  });

  it('destination folder by status, and the body carries links rewritten for it', () => {
    expect(byLegacy('B1').dir).toBe('work/inbox');
    expect(byLegacy('B3').dir).toBe('work/backlog');
    expect(byLegacy('B2').dir).toBe('work/done/2026-09');
    const b1 = byLegacy('B1');
    expect(b1.body).toContain('](../../../analysis/X.md)');
    expect(rewriteRelativeLinks(b1.body, b1.dir, '')).toBe(b1.sourceRef.text);
  });

  it('the watchlist is returned apart, never as an item (D-M6E11-18)', () => {
    expect(p.watchlist.text).toMatch(/^## Trigger watchlist/);
    expect(p.watchlist.dir).toBe('work');
    expect(p.items.some((i) => /watchlist/i.test(i.item.title ?? ''))).toBe(false);
  });

  it('counts per source and per status add up to the item total (AC-9.5)', () => {
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(p.counts.bySource)).toBe(p.items.length);
    expect(sum(p.counts.byStatus)).toBe(p.items.length);
    expect(p.counts.bySource['BUGS.md']).toBe(11);
    expect(p.counts.total).toBe(p.items.length);
  });
});

describe('planMigration over the archived originals (read-only)', () => {
  let before;
  let base;
  let p;
  beforeAll(() => {
    before = planningSnapshot();
    // M6.E11 t7.2: planned over the archived originals, not the generated files.
    base = preStoreBase();
    p = planMigration(base, { key: 'SIG', today: TODAY });
  });
  afterAll(() => {
    removePreStoreBase(base);
    expect(planningSnapshot()).toEqual(before);
  });

  it('per-source counts equal the segmenters, and the total is their sum', () => {
    const live = (f) => archived(f);
    const expected = {
      'BUGS.md': segmentBugs(live('BUGS.md')).rows.length,
      'BACKLOG.md': segmentBacklog(live('BACKLOG.md')).rows.length,
      'ISSUES-INBOX.md': segmentInbox(live('ISSUES-INBOX.md')).rows.length,
      'OPEN-QUESTIONS.md': segmentQuestions(live('OPEN-QUESTIONS.md')).rows.length,
    };
    expect(p.counts.bySource).toEqual(expected);
    expect(p.counts.total).toBe(Object.values(expected).reduce((a, b) => a + b, 0));
  });

  it('un-numbered bugs are numbered from the highest B-id present', () => {
    const maxB = Math.max(...p.items.filter((i) => /^B\d+$/.test(i.item.legacy_id ?? '')).map((i) => Number(i.item.legacy_id.slice(1))));
    const firstEntry = p.items.find((i) => i.item.source === 'migration:BUGS.md' && !/^B\d+$/.test(i.item.legacy_id));
    expect(firstEntry.item.id).toBe(`SIG-${maxB + 1}`);
    expect(p.items.find((i) => i.item.legacy_id === 'B75').item.id).toBe('SIG-75');
  });

  it('every item validates; every dup_of names an item in the run', () => {
    const ids = new Set(p.items.map((i) => i.item.id));
    for (const { item } of p.items) {
      expect(validateItem(item), item.id).toEqual([]);
      if (item.close?.dup_of) expect(ids.has(item.close.dup_of), item.id).toBe(true);
    }
  });

  it('the withdrawn entry is a dup of SIG-100', () => {
    const w = p.items.find((i) => /WITHDRAWN as a duplicate of `B100`/.test(i.item.title));
    expect(w.item.close).toMatchObject({ reason: 'dup', dup_of: 'SIG-100' });
  });

  it('the ambiguous rows the research listed carry a migration_note (D-M6E11-17)', () => {
    const noted = (re) => p.items.filter((i) => i.item.source === 'migration:BACKLOG.md' && re.test(i.item.title));
    const mustNote = [
      /^Since the snapshot — what shipped \(reconciliation/,
      /^Since the re-audit — what M5\.E7 changed \(reconciliation/,
      /^Parked — the trigger watchlist/,
      /Vocabulary attribution sweep/,
      /Harder TDD \+ `<HARD-GATE>`/,
      /^Multi-runtime adapters/,
      /periodic hygiene sweep — \*\*⚠ PARTIALLY SHIPPED/,
      /Cross-model review at REVIEW/,
      /The entry price for \*any\* Phase A autonomy work/,
      /claims-audit backstop, rebuilt around Jev/,
      /^Retro \*replay\*/,
      /^Cross-Epic pattern detection/,
      /Cross-references become links/,
      /closure-gated archive/i,
      /`M5\.E14`|M5\.E14 —/,
      /`B52`/,
    ];
    for (const re of mustNote) {
      const hits = noted(re);
      expect(hits.length, String(re)).toBeGreaterThan(0);
      for (const h of hits) expect(h.item.migration_note, `${h.item.id} ${h.item.title}`).toBeTruthy();
    }
    const dupBugs = p.items.filter((i) => i.item.source === 'migration:BUGS.md' && i.item.migration_note);
    expect(dupBugs.map((i) => i.item.legacy_id)).toEqual([expect.stringMatching(/^BUGS\.md:/), expect.stringMatching(/^BUGS\.md:/)]);
    expect(dupBugs.map((i) => i.item.migration_note).join('\n')).toMatch(/B112[\s\S]*B117/);
  });

  it('every explicit note key matches the live file (so heading drift is loud)', () => {
    expect(p.unmatchedExplicitNotes).toEqual([]);
  });
});
