// Corpus reading for `/sig:advise` — `M6.E7` S2.
//
// Two tests here are the reason the slice exists rather than being three lines
// inside the advisor:
//
//   t2.7 — the depth test, BOTH directions. `parseBacklogRows` defaults to
//   `maxDepth: 3` and Signal's own promoted rows sit at `####`, so a
//   default-depth read looks like a working command and is blind to them. But
//   widening also moves headings into the container fold, so a row present at
//   depth 3 can DISAPPEAR at depth 4. Both are asserted, on a fixture whose
//   counts are frozen — pinning the live file's numbers would break the suite
//   the next time a row is promoted, which is a test that punishes normal work.
//
//   t2.6 — each source unreadable in turn. The pattern is
//   `tests/pr-review-findings.test.js`'s "cannot-check is a value, never a
//   silent pass", including its double assertion: it is not enough that the
//   status equals cannot-check, it must also NOT equal clean.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADVISOR_SOURCES, readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { walkBugEntries } from '../plugin/tools/lib/bugs-tally.js';
import { parseEpicStatusRows } from '../plugin/tools/lib/milestones.js';
import {
  BUG_DISCHARGE_MEASURED,
  FOLD_MEASURED,
  KEPT_MEASURED,
  declaresBugDischarge,
  declaresNotLiveWork,
  declaresWorkMovedElsewhere,
  parseBacklogRows,
} from '../plugin/tools/lib/backlog.js';

// A backlog shaped like the real one: a `###` row that gained `####` children
// (invisible at depth 3, and a container at depth 4), a struck row, a `<details>`
// block of preserved history, and two plain live rows.
const BACKLOG = `# Backlog

## Sprint one

### R1 — a plain live row

Body of R1.

### R2 — a row that grew children

#### R2a — promoted, and invisible at depth 3

#### R2b — also invisible at depth 3

### ~~R3 — a finished row~~ · **DONE — v0.1.1, 2026-01-01**

## Sprint two

### R4 — another plain live row

<details>
<summary>Original entry</summary>

### R5 — preserved history, never live

</details>
`;

const BUGS = `# Bugs

| ID | Status | Pri | What |
|---|---|---|---|
| B1 | \`confirmed\` | P2 | **An open bug.** Still biting. |
| B2 | \`fixed\` | P3 | **A closed bug.** Shipped in v0.1.1. |
`;

const MILESTONE_6 = `# Milestone 6

| Epic | Status | Summary |
|---|---|---|
| \`M6.E1\` | **shipped** — \`v0.1.26\`, 2026-08-17 | The plugin payload. |
| \`M6.E2\` | **in flight** | The facts Signal publishes. |
`;

// The OTHER published format — bare \`E{N}\`, bold, with the title in cell one.
const MILESTONE_5 = `# Milestone 5

| Epic | Status | Scope |
|---|---|---|
| **E1** | ✅ shipped 2026-07-16 | Doc-runtime hygiene. |
| E2 — Auto-sensing migrate | ✅ shipped 2026-07-18 | Pulled forward. |
`;

const STATE = `---
schema_version: 1
phase: PLAN
current_epic: M6.E2
current_wave: null
current_tasks: []
completed_phases: []
blockers: []
last_updated: 2026-09-05T00:00:00.000Z
---
# Project State
`;

function fixture({ omit = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-advise-corpus-'));
  const p = join(base, '.planning');
  mkdirSync(p, { recursive: true });
  const write = (name, body) => {
    if (omit.includes(name)) return;
    writeFileSync(join(p, name), body);
  };
  write('BACKLOG.md', BACKLOG);
  write('BUGS.md', BUGS);
  write('STATE.md', STATE);
  write('MILESTONE-6.md', MILESTONE_6);
  write('MILESTONE-5.md', MILESTONE_5);
  return base;
}

/** Make a path unreadable in a way that works without root: replace it with a directory. */
function makeUnreadable(base, name) {
  const target = join(base, '.planning', name);
  rmSync(target, { force: true, recursive: true });
  mkdirSync(target, { recursive: true });
}

describe('t2.7 — the depth widening, both directions', () => {
  it('depth 4 gains the #### rows that depth 3 cannot see', () => {
    const at3 = parseBacklogRows(BACKLOG).filter((r) => !r.inDetails && !r.discharged);
    const at4 = parseBacklogRows(BACKLOG, { maxDepth: 4 }).filter((r) => !r.inDetails && !r.discharged);

    expect(at3.map((r) => r.text)).toEqual([
      'R1 — a plain live row',
      'R2 — a row that grew children',
      'R4 — another plain live row',
    ]);
    expect(at4.map((r) => r.text)).toEqual([
      'R1 — a plain live row',
      'R2a — promoted, and invisible at depth 3',
      'R2b — also invisible at depth 3',
      'R4 — another plain live row',
    ]);
  });

  it('and LOSES the row that became a container — which is why widening is not free', () => {
    const at3 = new Set(parseBacklogRows(BACKLOG).filter((r) => !r.inDetails && !r.discharged).map((r) => r.text));
    const at4 = new Set(
      parseBacklogRows(BACKLOG, { maxDepth: 4 }).filter((r) => !r.inDetails && !r.discharged).map((r) => r.text)
    );
    const lost = [...at3].filter((t) => !at4.has(t));
    // Exactly one, and it is the row whose children are now the rows. On a
    // project where a real `###` row has `####` children that are NOT rows, this
    // is a silent drop — `backlog.js` says so in its own source, and this is the
    // assertion that keeps the caveat honest rather than decorative.
    expect(lost).toEqual(['R2 — a row that grew children']);
  });

  it('the live corpus is read at depth 4, and depth 3 would see strictly fewer rows', async () => {
    // Against the REAL file, and deliberately not pinned to a count: a promoted
    // row must not turn this suite red. The invariant is what matters.
    const content = readFileSync(join(process.cwd(), '.planning', 'BACKLOG.md'), 'utf8');
    const live = (d) => parseBacklogRows(content, { maxDepth: d }).filter((r) => !r.inDetails && !r.discharged);
    expect(live(4).length).toBeGreaterThan(live(3).length);

    const corpus = await readCorpus(process.cwd());
    expect(corpus.sources.backlog.rows.length).toBe(live(4).length);
  });
});

describe('t2.1/t2.2 — rows and bugs, with the line numbers a citation needs', () => {
  it('every backlog row carries a resolvable line and a body derived from the next row', async () => {
    const base = fixture();
    const { sources } = await readCorpus(base);
    const rows = sources.backlog.rows;
    expect(sources.backlog.path).toBe('.planning/BACKLOG.md');
    for (const r of rows) expect(r.line).toBeGreaterThan(0);
    const r1 = rows.find((r) => r.text.startsWith('R1'));
    expect(r1.body).toContain('Body of R1.');
    // The body stops at the next row, rather than swallowing the file.
    expect(r1.body).not.toContain('R2a');
  });

  it('a live row does NOT absorb a discharged row that sits between it and the next live row', async () => {
    // ⚠ FOUND BY THE PR REVIEWER, AFTER REVIEW PASS 2 PASSED. The boundary walked
    // the FILTERED list, so it skipped exactly the rows it needed to stop at:
    // `R2b` ran through `R3`'s struck heading and body to reach `R4`. Measured on
    // this repo's own BACKLOG.md before the fix: 22 of 51 live rows absorbed
    // another row's text.
    //
    // Not cosmetic — `rankRows` scans `body` for blocked/trigger tokens and a
    // filed date, so `R2b` inherited `R3`'s 2026-01-01 discharge date and could
    // be ranked on it while citing its own line.
    //
    // Asserted against `readCorpus`'s OWN output, not a local re-derivation. The
    // first version of this test re-implemented the boundary in the test body and
    // failed on object identity — a test can reproduce the bug it is checking for.
    const base = fixture();
    const { sources } = await readCorpus(base);
    const r2b = sources.backlog.rows.find((r) => r.text.startsWith('R2b'));
    expect(r2b.body).not.toContain('R3');
    expect(r2b.body).not.toContain('2026-01-01');
    // Scoped to what the fix guarantees: no body swallows a DISCHARGED row.
    // Container headings still leak — `parseBacklogRows` drops them from its
    // return value so the boundary cannot stop at one — and that residual is
    // pinned by the next test rather than asserted away here.
    for (const r of sources.backlog.rows) expect(r.body).not.toMatch(/^#{2,4} ~~/m);
  });

  it('every live row in the REAL corpus stops at the next row, container headings aside', async () => {
    // ⚠ RESIDUAL, STATED RATHER THAN HIDDEN. `parseBacklogRows` drops container
    // headings from its return value, so the boundary cannot stop at one: 8 of 50
    // live rows still run past a container heading into the prose beneath it. The
    // fix would mean exposing containers from a shared module — a change to
    // `parseBacklogRows` used by three other callers — so it is filed, not
    // patched. This test pins the residual at its measured size so it cannot grow
    // back into the discharged-row leak that was just fixed.
    const corpus = await readCorpus(process.cwd());
    const absorbing = corpus.sources.backlog.rows.filter((r) => /^#{2,4} /m.test(r.body));
    for (const r of absorbing) {
      // Every remaining absorption is a CONTAINER heading, never a live or
      // discharged row — that distinction is the whole content of the fix.
      const swallowed = r.body.match(/^#{2,4} .*/m)[0];
      expect(swallowed).not.toMatch(/~~/); // no struck (discharged) row
    }
    expect(absorbing.length).toBeLessThanOrEqual(10);
  });

  it('walkBugEntries gains `line` additively — deriveBugCounts still works', () => {
    const entries = walkBugEntries(BUGS);
    const lines = BUGS.split('\n');
    expect(entries.map((e) => e.id)).toEqual(['B1', 'B2']);
    for (const e of entries) {
      expect(lines[e.line - 1]).toContain(`| ${e.id} |`);
    }
  });

  it('bug entries reach the corpus with a headline taken from the row itself', async () => {
    const base = fixture();
    const { sources } = await readCorpus(base);
    const b1 = sources.bugs.entries.find((e) => e.id === 'B1');
    expect(b1.status).toBe('confirmed');
    expect(b1.headline).toContain('An open bug.');
    expect(b1.line).toBeGreaterThan(0);
  });
});

describe('t2.5 — one Epic-row reader, covering both published formats', () => {
  it('reads the full-ID form', () => {
    const rows = parseEpicStatusRows(MILESTONE_6, { milestone: '6' });
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['M6.E1', '**shipped** — `v0.1.26`, 2026-08-17'],
      ['M6.E2', '**in flight**'],
    ]);
    expect(rows[0].line).toBeGreaterThan(0);
  });

  it('reads the bare-E form, bold or not, with a title in the same cell', () => {
    const rows = parseEpicStatusRows(MILESTONE_5, { milestone: '5' });
    expect(rows.map((r) => r.id)).toEqual(['M5.E1', 'M5.E2']);
    expect(rows[1].title).toBe('E2 — Auto-sensing migrate');
    expect(rows[0].status).toBe('✅ shipped 2026-07-16');
  });

  it('reads both live milestone files in this repo without inventing an id', async () => {
    const corpus = await readCorpus(process.cwd());
    const all = corpus.sources.milestones.files.flatMap((f) => f.rows);
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) expect(r.id).toMatch(/^M\d+(\.\d+)?\.E\d+$/);
  });

  it('leaves the two existing private call sites alone — this is an export, not a re-point', () => {
    // t2.5 says so explicitly: `findEpicStatusRow` feeds `isEpicCloseShip`, so
    // re-pointing it makes `D-E9-5`'s override live again and changes when the
    // SHIP retro gate fires. That is a real behaviour change and does not belong
    // in an advisory Epic by side effect. Pinned so a later cleanup is a
    // decision rather than a diff nobody noticed.
    const retro = readFileSync(join(process.cwd(), 'plugin/tools/lib/retrospective.js'), 'utf8');
    const facts = readFileSync(join(process.cwd(), 'plugin/tools/lib/published-facts.js'), 'utf8');
    expect(retro).toMatch(/function findEpicStatusRow\(/);
    expect(facts).toMatch(/const EPIC_ROW = /);
  });
});

describe('t2.6 — cannot-check is a value, never a silent pass', () => {
  it('enumerates exactly the four sources it claims to read (M6.E8 FR5 — retrospectives left)', () => {
    // ⚠ AC5.1 — no test may assert five. The retrospective read was 32 files
    // parsed on every run for headings no ranking input ever consulted.
    expect(ADVISOR_SOURCES).toEqual(['BACKLOG.md', 'BUGS.md', 'STATE/closure', 'milestone rows']);
  });

  it('checked + cannotCheck ALWAYS equals the source list — the docblock claim, tested', async () => {
    // ⚠ The module states this invariant and nothing asserted it; I verified it by
    // hand at REVIEW, which is not a test. A reviewer's nit about self-comparing
    // constants pointed at the real gap: pinning ADVISOR_SOURCES against a literal
    // says what the list IS, and says nothing about `readCorpus` honouring it.
    //
    // ⚠ AND IT IS A WEAK INVARIANT ON PURPOSE, stated so nobody reads it as more:
    // the COUNT stays right while a source's CONTENT silently shrinks. That is
    // exactly how an unreadable milestone file would hide if branch 5 skipped
    // it — one file vanishes, four sources still report. This catches a source
    // that goes missing from both lists, not a source that under-reports.
    const mutate = {
      'clean': () => {},
      'no BACKLOG.md': (b) => rmSync(join(b, '.planning', 'BACKLOG.md')),
      'BACKLOG.md is a directory': (b) => makeUnreadable(b, 'BACKLOG.md'),
      'BUGS.md is a directory': (b) => makeUnreadable(b, 'BUGS.md'),
      'MILESTONE-6.md is a directory': (b) => makeUnreadable(b, 'MILESTONE-6.md'),
      'unknown schema_version': (b) =>
        writeFileSync(join(b, '.planning', 'STATE.md'), '---\nschema_version: 99\n---\n'),
      'no .planning/ at all': (b) => rmSync(join(b, '.planning'), { recursive: true, force: true }),
    };
    for (const [label, mut] of Object.entries(mutate)) {
      const base = fixture();
      mut(base);
      const corpus = await readCorpus(base);
      expect(
        corpus.checked.length + corpus.cannotCheck.length,
        `invariant broken for: ${label}`
      ).toBe(ADVISOR_SOURCES.length);
      // No source may appear in both lists, which the sum alone would not catch.
      for (const c of corpus.cannotCheck) expect(corpus.checked).not.toContain(c.source);
    }
  });

  it('a clean corpus checks all four and reports nothing it could not read', async () => {
    const base = fixture();
    const corpus = await readCorpus(base);
    expect(corpus.checked).toEqual([...ADVISOR_SOURCES]);
    expect(corpus.cannotCheck).toEqual([]);
  });

  for (const [name, source] of [
    ['BACKLOG.md', 'BACKLOG.md'],
    ['BUGS.md', 'BUGS.md'],
    ['MILESTONE-6.md', 'milestone rows'],
  ]) {
    it(`an unreadable ${name} reports ${source} as cannot-check, and NOT as clean`, async () => {
      const base = fixture();
      makeUnreadable(base, name);
      const corpus = await readCorpus(base);

      const entry = corpus.cannotCheck.find((c) => c.source === source);
      expect(entry).toBeDefined();
      expect(entry.reason).toBeTruthy();
      // The double assertion. A source that could not be read must not appear in
      // `checked`, and its slot must not be an empty result standing in for one.
      expect(corpus.checked).not.toContain(source);
      expect(corpus.sources[source === 'milestone rows' ? 'milestones' : source === 'BUGS.md' ? 'bugs' : 'backlog']).toBeNull();
    });
  }

  it('an absent BUGS.md is cannot-check, not "no bugs" — silence is the failure being fixed', async () => {
    const base = fixture({ omit: ['BUGS.md'] });
    const corpus = await readCorpus(base);
    const entry = corpus.cannotCheck.find((c) => c.source === 'BUGS.md');
    expect(entry.reason).toMatch(/not present/i);
    expect(corpus.sources.bugs).toBeNull();
    expect(corpus.checked).not.toContain('BUGS.md');
  });

  it('an unreadable STATE.md reports STATE/closure as cannot-check without throwing', async () => {
    const base = fixture();
    writeFileSync(join(base, '.planning', 'STATE.md'), '---\nschema_version: 99\n---\n');
    const corpus = await readCorpus(base);
    const entry = corpus.cannotCheck.find((c) => c.source === 'STATE/closure');
    expect(entry).toBeDefined();
    expect(corpus.sources.closure).toBeNull();
    expect(corpus.checked).not.toContain('STATE/closure');
  });

  it('an ABSENT .planning/ reports milestone rows as cannot-check, not as read-and-empty', async () => {
    // ⚠ The distinction this used to guard on the retrospective read (M6.E7
    // REVIEW): an ABSENT `.planning/` is "could not look", an EMPTY one is
    // "looked, found nothing". The retrospective read is gone (M6.E8 FR5); the
    // milestone read has the same shape and inherits the guard — `readdir` on an
    // absent directory throws ENOENT and must land in cannot-check, never in an
    // empty `files: []` standing in for a read.
    const base = mkdtempSync(join(tmpdir(), 'sig-advise-corpus-absent-'));
    const corpus = await readCorpus(base);
    expect(corpus.checked).toEqual([]);
    expect(corpus.cannotCheck.map((c) => c.source).sort()).toEqual([...ADVISOR_SOURCES].sort());
    expect(corpus.sources.milestones).toBeNull();
    expect(corpus.cannotCheck.find((c) => c.source === 'milestone rows').reason).toMatch(/could not be listed/i);
  });

  it('an EMPTY but existing .planning/ still reads milestone rows — nothing to find is a result', async () => {
    // The other side of the same line. Absent means "could not look"; empty means
    // "looked, found nothing". Collapsing them in either direction is the bug.
    const base = mkdtempSync(join(tmpdir(), 'sig-advise-corpus-empty-'));
    mkdirSync(join(base, '.planning'), { recursive: true });
    const corpus = await readCorpus(base);
    expect(corpus.checked).toContain('milestone rows');
    expect(corpus.sources.milestones.files).toEqual([]);
  });

  it('a .planning/ that is a FILE reports every source as cannot-check', async () => {
    const base = fixture();
    // `.planning` replaced by a file makes every read and readdir throw ENOTDIR;
    // each branch must land that in cannot-check rather than in an empty result.
    rmSync(join(base, '.planning'), { recursive: true, force: true });
    writeFileSync(join(base, '.planning'), 'not a directory\n');
    const corpus = await readCorpus(base);
    expect(corpus.cannotCheck.map((c) => c.source)).toEqual([...ADVISOR_SOURCES]);
    expect(corpus.checked).toEqual([]);
  });
});

describe('t3.1 input 5 — a row that declares itself not live work', () => {
  it('reads the HEADING only, which is the fix for the class rather than the instance', () => {
    // The bug this input exists to fix came from input 2 reading a row's whole
    // BODY, so it matched a trigger belonging to a different item. A
    // self-declaration belongs where a reader sees it — the same rule
    // `readRowDischarge` follows and the same reason `HELD_OPEN_RE` tests the
    // heading.
    expect(declaresNotLiveWork('A perfectly live row').notLive).toBe(false);
    const bodyOnly = declaresNotLiveWork('A perfectly live row');
    expect(bodyOnly.declaration).toBeNull();
  });

  it('recognises the vocabulary measured on the real corpus, and names which word fired', () => {
    const cases = [
      ['Parked — the trigger watchlist *(not sprint material)*', 'parked'],
      ['Context-discipline hooks — **parked, all three, with triggers**', 'parked'],
      ['Since the re-audit — what M5.E7 changed (reconciliation, 2026-07-26)', 'reconciliation'],
      ['Some row — **shelved 2026-05-24**', 'shelved'],
      ['A row that is STILL OPEN on purpose', 'held-open'],
    ];
    for (const [text, kind] of cases) {
      const r = declaresNotLiveWork(text);
      expect(r.notLive, `expected "${text}" to read as not-live`).toBe(true);
      expect(r.kind).toBe(kind);
      expect(r.declaration).toBeTruthy();
    }
  });

  it('does NOT fire on "deferred", which occurs in live-work prose', () => {
    // Excluded deliberately: including it would trade two known false positives
    // for an unknown number of false negatives.
    expect(declaresNotLiveWork('Contribution scaffolding — deferred from E2').notLive).toBe(false);
  });

  it('fires on exactly 4 of the live rows in this repo, and every one is a real record or park', async () => {
    // The measurement that chose the vocabulary, pinned as a floor rather than an
    // equality: promoting a new parked row must not turn the suite red.
    const corpus = await readCorpus(process.cwd());
    const hits = corpus.sources.backlog.rows.filter((r) => declaresNotLiveWork(r.text).notLive);
    expect(hits.length).toBeGreaterThanOrEqual(4);
    for (const h of hits) expect(h.text).toMatch(/parked|reconciliation|shelved|(STILL|KEPT|HELD)\s+OPEN/i);
  });

  it('does not widen HELD_OPEN_RE, whose meaning backlogDischargeStatus depends on', () => {
    // Widening that regex changes a shipped check's behaviour as a side effect —
    // the same refusal t2.5 makes about the milestone parsers, for the same reason.
    const src = readFileSync(join(process.cwd(), 'plugin/tools/lib/backlog.js'), 'utf8');
    expect(src).toMatch(/const HELD_OPEN_RE = \/\\b\(\?:STILL\|KEPT\|HELD\)\\s\+OPEN\\b\/i;/);
  });
});

describe('M6.E8 t2.1 (FR4) — a row whose heading says its work moved elsewhere, and `KEPT` overrides', () => {
  // The five real headings, verbatim, from this repository's BACKLOG.md on
  // 2026-09-14. Named by heading and never by line (`D-M6E8-4`): a line moves
  // the moment a row is inserted above it, a heading survives.
  const FOLDED = "`STATE.md`'s narrative vs. its frontmatter · **hygiene** · small · **FOLDED INTO `M5.E10`**";
  const ABSORBED_1 = 'Re-source the stale external claims → **absorbed into M5.E12**';
  const ABSORBED_2 = '`/sig:docs-update` — GSD port → **absorbed into M5.E12**';
  const KEPT_REHOMED = "Retro *replay* into the next Epic's DISCUSS/PLAN — **KEPT, re-homed**";
  const KEPT_ABSORBED = 'Cross-Epic pattern detection — **KEPT, absorbed into M5.E11**';

  it('reads the HEADING only — a fold phrase in a body is not a declaration', () => {
    // The one live row that mentions a fold phrase in its BODY alone (the
    // obligation-tracker row) is the false positive heading-only avoids.
    expect(declaresWorkMovedElsewhere('M5.E14 — Obligation tracker integration').moved).toBe(false);
    expect(declaresWorkMovedElsewhere('A perfectly live row').declaration).toBeNull();
  });

  it('recognises the three measured phrases and names which fired (AC4.1)', () => {
    for (const [text, kind] of [
      [FOLDED, 'folded-into'],
      [ABSORBED_1, 'absorbed-into'],
      [ABSORBED_2, 'absorbed-into'],
      ['Something — re-homed to the docs plugin', 're-homed'],
    ]) {
      const r = declaresWorkMovedElsewhere(text);
      expect(r.moved, `expected "${text}" to read as moved`).toBe(true);
      expect(r.kind).toBe(kind);
      expect(r.kept).toBe(false);
      expect(r.declaration).toBeTruthy();
    }
  });

  it('`KEPT` is evaluated FIRST and overrides the fold vocabulary (AC4.2)', () => {
    // Both real headings say their work moved AND say KEPT. That is the maintainer
    // saying "do not drop this", and dropping it would be the worst thing the
    // advisor can do. The override returns before the fold vocabulary runs.
    for (const text of [KEPT_REHOMED, KEPT_ABSORBED]) {
      const r = declaresWorkMovedElsewhere(text);
      expect(r.moved, `expected "${text}" to be preserved`).toBe(false);
      expect(r.kept).toBe(true);
      expect(r.declaration).toMatch(/KEPT/);
    }
  });

  it('lowercase "kept" in prose also preserves — preserving is the safe direction', () => {
    const r = declaresWorkMovedElsewhere('A row we kept, re-homed under the docs plugin');
    expect(r.moved).toBe(false);
    expect(r.kept).toBe(true);
  });

  it('records its measurement beside the pattern, frozen, in the shape the live pin reads', () => {
    for (const m of [FOLD_MEASURED, KEPT_MEASURED]) {
      expect(Object.isFrozen(m)).toBe(true);
      expect(m.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(m.rows)).toBe(true);
      expect(Number.isInteger(m.hits)).toBe(true);
    }
  });

  it('does not widen HELD_OPEN_RE — `KEPT` here is a separate override, not a new phrase in it (NFR3)', () => {
    const src = readFileSync(join(process.cwd(), 'plugin/tools/lib/backlog.js'), 'utf8');
    expect(src).toMatch(/const HELD_OPEN_RE = \/\\b\(\?:STILL\|KEPT\|HELD\)\\s\+OPEN\\b\/i;/);
  });
});

describe('M6.E8 t3.1 (FR1) — a heading that says it discharges a bug, verb ADJACENT to the id', () => {
  it('reads the HEADING only and needs the verb next to the id', () => {
    for (const [text, id] of [
      ['Fixes B75 — the two gate settings differ by one boolean', 'B75'],
      ['Close B12 by deleting the dead branch', 'B12'],
      ['`B7` — fixed, with the regression test', 'B7'],
      ['Resolve `B3`: the parser reads depth 4', 'B3'],
      ['A fix for B9 that discharges it', 'B9'],
    ]) {
      const r = declaresBugDischarge(text);
      expect(r.id, `expected "${text}" to declare ${id}`).toBe(id);
      expect(r.declaration).toBeTruthy();
    }
  });

  it('a done-word elsewhere in the heading is ordinary English, not a declaration', () => {
    // The real heading that carries "closed": "single home for open/closed work".
    // The `DONE_WORD_RE` lesson again — a bare verb anywhere in a heading is prose.
    expect(declaresBugDischarge('M5.E14 — Obligation tracker integration (single home for open/closed work)').id).toBeNull();
    // A bug id NAMED is not a bug id DISCHARGED.
    expect(declaresBugDischarge('Re-aim on "the unreached mechanism" — the class behind `B87`–`B90`').id).toBeNull();
    expect(declaresBugDischarge('The entry price for *any* Phase A autonomy work: `B73`–`B76`').id).toBeNull();
  });

  it('a body that cites a confirmed bug is not read at all — the predicate takes a heading', () => {
    // Verbatim body fragment from a real B75-citing row: it MEASURES B75, it does
    // not discharge it. Nine live rows name a confirmed bug in their body today.
    const body = 'when a rule is not followed here, Signal writes the rule more carefully. `B75` measured that ceiling.';
    expect(declaresBugDischarge(body).id).toBeNull();
  });

  it('records its measurement beside the pattern, frozen — zero, declared rather than implied', () => {
    expect(Object.isFrozen(BUG_DISCHARGE_MEASURED)).toBe(true);
    expect(BUG_DISCHARGE_MEASURED.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BUG_DISCHARGE_MEASURED.hits).toBe(0);
  });
});
