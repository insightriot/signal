// `/sig:advise` — the advisor, the artifact, and the gate. `M6.E7` S3, reshaped by `M6.E12`.
//
// The two tests that carry this slice:
//
//   t3.5 — the RUN BOUNDARY. Not "a bad citation is found" (a unit test proves
//   that, and `citations.test.js` already does) but "the run REFUSES and the file
//   does not appear". A finding that is computed and then ignored is `B39`/`B75`
//   verbatim, and it is the failure this Epic keeps naming.
//
//   The count. `verifyCitations` returns ok over zero citations, so the gate
//   asserts a COUNT: priorities + cited covers + appendix rows (`M6.E12` AC2.4).
//   A renderer that dropped one claim's citation would pass a flag check, and the
//   artifact would claim to be checked while one line was not.
//
// ⚠ `M6.E12` t2.6: the ranked-five shape is gone. `rankRows` became
// `classifyRows` (live in FILE order, dropped with reasons, no age), and the
// advisory leads with 3–5 validated priorities. Tests whose only subject was age
// or rank order were deleted, not ported — there is no order left to pin. Every
// safety test was ported to the new API; see the commit message for the list.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_PREFIX,
  PICK_HEADING,
  formatAdviseSummary,
  FORBIDDEN_VERBS,
  RENDER_LABELS,
  cite,
  classifyRows,
  isValidStamp,
  nextArtifactName,
  prepareAdvise,
  quoteSafe,
  renderArtifact,
  runAdvise,
  writeArtifact,
} from '../plugin/tools/lib/advise.js';
import { validatePriorities } from '../plugin/tools/lib/advise-priorities.js';
import { EVIDENCE_MARKER, extractCitations, verifyCitations } from '../plugin/tools/lib/citations.js';
import { backlogDischargeStatus, parseBacklogRows } from '../plugin/tools/lib/backlog.js';
import { archived } from './helpers/pre-store.js';

const TODAY = '2026-09-05';

// Nine rows: one gated, one with a fired trigger, one quoting unresolvable
// paths, and one self-declared parked. Row lines (measured through readCorpus):
// R1 5 · R2 9 · R3 13 · R4 17 · R5 21 · R6 25 · R7 29 · R8 33 · R9 37.
const BACKLOG = `# Backlog

## Queue

### R1 — an ungated row filed early

Filed 2026-01-02. Nothing gates it.

### R2 — a row whose trigger FIRED

Trigger: met 2026-02-02.

### R3 — a row blocked on something else

Filed 2026-03-03. This one is blocked on the parser landing first.

### R4 — a plain row

Filed 2026-04-04.

### R5 — another plain row

Filed 2026-05-05.

### R6 — a later plain row

Filed 2026-06-06.

### R7 — the newest plain row

Filed 2026-07-07.

### R8 — a row that quotes a path that does not resolve

Filed 2026-08-08. It mentions \`../analysis/NOPE.md\` and \`wiki/AGENTS.md\`, neither of which exists.

### R9 — Parked — the watchlist *(not sprint material)*

Filed 2026-01-01, older than every other row, and its body mentions a Trigger: FIRED belonging to
something else entirely. Both of those would put it FIRST without input 5.
`;

const STATE = `---
schema_version: 1
phase: PLAN
current_epic: M6.E1
current_wave: null
current_tasks: []
completed_phases: []
blockers: []
last_updated: 2026-09-05T00:00:00.000Z
---
# Project State
`;

const BUGS = '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P2 | **Open.** |\n';

// A valid proposal over the fixture: two cited rows, one open bug, one unfiled.
// Evidence `.planning/BACKLOG.md:3` resolves in every fixture below.
const PRIORITIES = [
  { title: 'First', why: 'Because it matters.', covers: ['.planning/BACKLOG.md:5', 'B1'], evidence: ['.planning/BACKLOG.md:3'] },
  { title: 'Second', why: 'Because it is gated.', covers: ['.planning/BACKLOG.md:13'], evidence: ['.planning/BACKLOG.md:3'] },
  { title: 'Third', why: 'Because nobody filed it.', covers: ['new: something unfiled'], evidence: ['.planning/BUGS.md:5'] },
];

// Rows only — for corpora where BUGS.md is unreadable.
const ROW_PRIORITIES = [
  { title: 'First', why: 'One.', covers: ['.planning/BACKLOG.md:5'], evidence: ['.planning/BACKLOG.md:3'] },
  { title: 'Second', why: 'Two.', covers: ['.planning/BACKLOG.md:13'], evidence: ['.planning/BACKLOG.md:3'] },
  { title: 'Third', why: 'Three.', covers: ['new: something unfiled'], evidence: ['.planning/BACKLOG.md:3'] },
];

// No row covers — for corpora whose row lines differ from BACKLOG's.
const NO_ROW_PRIORITIES = [
  { title: 'First', why: 'One.', covers: ['B1'], evidence: ['.planning/BACKLOG.md:3'] },
  { title: 'Second', why: 'Two.', covers: ['new: a second unfiled thing'], evidence: ['.planning/BACKLOG.md:3'] },
  { title: 'Third', why: 'Three.', covers: ['new: a third unfiled thing'], evidence: ['.planning/BACKLOG.md:3'] },
];

function project({ backlog = BACKLOG, omit = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-advise-'));
  const p = join(base, '.planning');
  mkdirSync(p, { recursive: true });
  const write = (n, b) => {
    if (!omit.includes(n)) writeFileSync(join(p, n), b);
  };
  write('BACKLOG.md', backlog);
  write('BUGS.md', BUGS);
  write('STATE.md', STATE);
  write('MILESTONE-6.md', '# M6\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M6.E1` | **in flight** | A thing. |\n');
  return base;
}

const run = (base, extra = {}) => runAdvise(base, { today: TODAY, priorities: PRIORITIES, ...extra });
const artifactsIn = (base) => readdirSync(join(base, '.planning')).filter((f) => f.startsWith(ARTIFACT_PREFIX));
const EMPTY_CORPUS = { checked: ['BACKLOG.md'], cannotCheck: [] };
// The pure renderer with no priorities — for tests whose subject is the appendix.
const renderOnly = (classified, extra = {}) =>
  renderArtifact({ today: TODAY, classified, priorities: [], corpus: EMPTY_CORPUS, ...extra });
const appendixOf = (art) => art.slice(art.indexOf(`## ${RENDER_LABELS.appendix}`));
const lineFor = (art, prefix) => art.split('\n').find((l) => l.startsWith(`- **${prefix}`));
/** The run gate's own count (AC2.4), computed from what the run returned. */
const claimsOf = (r) =>
  r.priorities.length +
  r.priorities.reduce((n, p) => n + p.covers.filter((c) => c.kind !== 'new').length, 0) +
  r.classified.live.length +
  r.classified.dropped.length;

describe('classifyRows — live in file order, dropped with reasons, no age (FR6)', () => {
  it('every row lands in exactly one of live or dropped (the partition AC3.4 depends on)', async () => {
    const base = project();
    const r = await run(base);
    expect(r.status).toBe('written');
    expect(r.classified.live.length + r.classified.dropped.length).toBe(r.corpus.sources.backlog.rows.length);
  });

  it('live rows keep file order whatever order they arrive in', () => {
    const rows = [
      { text: 'B', line: 20, path: 'p', body: '' },
      { text: 'A', line: 10, path: 'p', body: '' },
      { text: 'C', line: 30, path: 'p', body: '' },
    ];
    expect(classifyRows(rows).live.map((s) => s.row.text)).toEqual(['A', 'B', 'C']);
    expect(classifyRows([...rows].reverse()).live.map((s) => s.row.text)).toEqual(['A', 'B', 'C']);
  });

  it('a gated row stays live and is annotated, not demoted', async () => {
    const base = project();
    const r = await run(base);
    const gated = r.classified.live.find((s) => s.row.text.startsWith('R3'));
    expect(gated.blocked).toBe(true);
    expect(lineFor(appendixOf(r.artifact), 'R3')).toMatch(/it names a gate that has not fired/);
    expect(lineFor(appendixOf(r.artifact), 'R2')).toMatch(/its written trigger has fired/);
  });

  it('the partition holds on odd shapes, including no rows at all', () => {
    // Pinned so a future change that silently LOSES a row (in neither list)
    // turns red instead of quietly shrinking the appendix.
    const shapes = [
      [{ text: 'Parked — a row', line: 1, path: 'p', body: '' }],
      [{ text: 'R', line: 1, path: 'p', body: 'blocked on x' }, { text: 'S', line: 2, path: 'p', body: '' }],
      [{ text: 'a reconciliation note', line: 1, path: 'p', body: '' }, { text: 'live', line: 2, path: 'p', body: '' }],
      [],
    ];
    for (const rows of shapes) {
      const r = classifyRows(rows, { stale: [{ id: null, line: 2 }] });
      expect(r.live.length + r.dropped.length).toBe(rows.length);
    }
  });
});

describe('t3.1 input 5 — the wiring, not just the predicate', () => {
  // ⚠ THIS TEST EXISTS BECAUSE ITS ABSENCE WAS MEASURED. With the five predicate
  // tests in place and `declaresNotLiveWork` fully covered, deleting the
  // not-live check from the drop predicate left the ENTIRE SUITE GREEN. A
  // predicate test is not a wiring test.
  it('a self-declared parked row is dropped and appears in the Dropped list with its reason', async () => {
    const base = project();
    const r = await run(base);
    const parked = 'R9 — Parked — the watchlist *(not sprint material)*';

    expect(r.classified.live.map((s) => s.row.text)).not.toContain(parked);
    expect(r.classified.dropped.map((s) => s.row.text)).toContain(parked);

    const body = readFileSync(join(base, r.path), 'utf8');
    const dropped = body.slice(body.indexOf('### Dropped'));
    const line = dropped.split('\n').find((l) => l.includes(parked));
    expect(line).toMatch(/\*\*self-declared\*\*/);
    expect(line).toContain('Parked');
  });
});

describe('M6.E8 t2.2 (FR4) — input 7, fold: a row whose heading says its work moved elsewhere drops', () => {
  const rows = [
    { line: 3, path: 'p', text: 'R1 — a plain live row', body: 'Filed 2026-01-01.' },
    { line: 6, path: 'p', text: 'R2 — Re-source the claims → **absorbed into M5.E12**', body: 'Filed 2026-01-02.' },
    { line: 9, path: 'p', text: 'R3 — Cross-Epic pattern detection — **KEPT, absorbed into M5.E11**', body: 'Filed 2026-01-03.' },
    { line: 12, path: 'p', text: 'R4 — a row that discusses folding', body: 'Filed 2026-01-04. Its body says absorbed into something, in prose.' },
  ];

  it('drops the moved row with the fold flag set (AC4.1)', () => {
    const r = classifyRows(rows);
    const moved = r.dropped.find((s) => s.row.text.startsWith('R2'));
    expect(moved).toBeDefined();
    expect(moved.moved.moved).toBe(true);
    expect(r.live.map((s) => s.row.text.slice(0, 2))).not.toContain('R2');
  });

  it('a KEPT row stays live (AC4.2)', () => {
    const r = classifyRows(rows);
    const kept = r.live.find((s) => s.row.text.startsWith('R3'));
    expect(kept).toBeDefined();
    expect(kept.moved.moved).toBe(false);
    expect(kept.moved.kept).toBe(true);
  });

  it('`KEPT OPEN` is DROPPED by input 5, even though the fold override preserves it', () => {
    // ⚠ The source documents this precedence and no test held it. The two inputs
    // genuinely disagree about what a maintainer's `KEPT OPEN` means, and that is
    // an open design question; this pins the behaviour that actually ships.
    const one = [{ line: 3, path: 'p', text: 'R1 — **KEPT OPEN**, absorbed into M5.E11', body: 'Filed 2026-01-01.' }];
    const r = classifyRows(one);
    expect(r.live).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].notLive.notLive).toBe(true);
    expect(r.dropped[0].moved.kept).toBe(true);
    expect(renderOnly(r)).toMatch(/Dropped by the \*\*self-declared\*\* input/);
  });

  it('a fold phrase in the BODY alone does not drop the row — heading only', () => {
    expect(classifyRows(rows).live.map((s) => s.row.text.slice(0, 2))).toContain('R4');
  });

  it('the rendered drop reason names the fold input and quotes the declaration', () => {
    const line = lineFor(renderOnly(classifyRows(rows)), 'R2');
    expect(line).toMatch(/Dropped by the \*\*fold\*\* input/);
    expect(line).toContain('`absorbed into`');
    expect(line).toMatch(/lives elsewhere/);
  });
});

describe('M6.E8 t3.1 (FR1) — the bug-discharge input annotates a heading that discharges a CONFIRMED bug', () => {
  const twin = (text, line) => ({ line, path: 'p', text, body: 'Filed 2026-01-01.' });

  it('AC1.1 — only the discharging heading is annotated, and only when a confirmed set is given', () => {
    const rows = [twin('R1 — the dial that nothing reads', 3), twin('R2 — Fixes B1: the dial that nothing reads', 6)];
    const r = classifyRows(rows, { confirmedBugs: new Set(['B1']) });
    expect(r.live.map((s) => s.dischargesBug?.id ?? null)).toEqual([null, 'B1']);
    // Without the Set the input cannot fire.
    expect(classifyRows(rows).live.map((s) => s.dischargesBug)).toEqual([null, null]);
  });

  it('a heading that discharges a bug BUGS.md records as fixed is not annotated', () => {
    const r = classifyRows([twin('R2 — Fixes B2 (already shipped)', 6)], { confirmedBugs: new Set(['B1']) });
    expect(r.live[0].dischargesBug).toBeNull();
  });

  it('AC1.2 — a row whose BODY cites a confirmed bug is not annotated', () => {
    // ⚠ THIS BODY MUST MATCH THE PREDICATE WHEN READ, or the test cannot fail —
    // "This fixes B1" yields `B1` if a body-reading implementation reads it.
    const rows = [
      {
        ...twin('R2 — A stated ladder: convention → lint, with a grandfather list', 6),
        body: 'Filed 2026-01-02. This fixes B1 in passing, while measuring the ceiling.',
      },
    ];
    expect(classifyRows(rows, { confirmedBugs: new Set(['B1']) }).live[0].dischargesBug).toBeNull();
  });

  it('the appendix annotation names the bug and says BUGS.md still records it confirmed', () => {
    const r = classifyRows([twin('R1 — Fixes B1: the dial', 3)], { confirmedBugs: new Set(['B1']) });
    expect(appendixOf(renderOnly(r))).toMatch(/its heading says it discharges `B1`, which `BUGS\.md` still records as confirmed/);
  });

  it('runAdvise counts ONLY confirmed bugs — a heading that fixes an already-fixed bug is not annotated', async () => {
    // ⚠ Found by MUTATION: building the Set from every BUGS.md entry regardless
    // of status left the suite green. The artifact would then print "which
    // `BUGS.md` still records as confirmed" about a bug recorded as fixed.
    const base = project({ backlog: `${BACKLOG}### R10 — Fixes B2, which already shipped\nFiled 2026-09-01.\n` });
    writeFileSync(
      join(base, '.planning', 'BUGS.md'),
      '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P2 | **Open.** |\n| B2 | `fixed` | P3 | **Shipped.** |\n'
    );
    const r = await run(base);
    expect(r.status).toBe('written');
    const scored = [...r.classified.live, ...r.classified.dropped].find((s) => s.row.text.startsWith('R10'));
    expect(scored.dischargesBug, 'B2 is fixed — it cannot be discharged').toBeNull();
    expect(r.artifact).not.toMatch(/discharges `B2`/);
  });

  it('runAdvise builds the confirmed set from the corpus, annotates, and consulted says BUGS.md', async () => {
    const base = project({ backlog: `${BACKLOG}### R10 — Fixes B1, the open bug\nFiled 2026-09-01.\n` });
    const r = await run(base);
    const r10 = r.classified.live.find((s) => s.row.text.startsWith('R10'));
    expect(r10.dischargesBug.id).toBe('B1');
    expect(lineFor(appendixOf(r.artifact), 'R10')).toMatch(/discharges `B1`/);
    expect(r.classified.consulted).toContain('BUGS.md');
  });
});

describe('M6.E8 t3.3 (FR3 amended — D-M6E8-8) — the discharge reason names its source; mentions never drop', () => {
  const row = (line, text, body = 'Filed 2026-01-01.') => ({
    line,
    path: 'p',
    text,
    body,
    leadingId: text.match(/^(?:M\d+(?:\.\d+)?\.E\d+|B\d+)/)?.[0] ?? null,
  });

  it('AC3.1′ — a row discharged by unit closure says so, with the evidence', () => {
    const rows = [row(3, 'R1 — a plain row'), row(6, 'M5.E9 — the shipped Epic')];
    const stale = [{ heading: 'M5.E9 — the shipped Epic', line: 6, id: 'M5.E9', evidence: 'M5.E9-VERIFICATION.md states PASS' }];
    const line = lineFor(renderOnly(classifyRows(rows, { stale })), 'M5.E9');
    expect(line).toMatch(
      /Dropped by the \*\*discharge\*\* input — `M5\.E9` reads closed in \*\*unit closure\*\* \(M5\.E9-VERIFICATION\.md states PASS\)/
    );
  });

  it('AC3.1′ — a row discharged by the bug catalog names BUGS.md as the source', () => {
    const rows = [row(3, 'R1 — a plain row'), row(6, 'B52 — the stale plugin cache')];
    const stale = [{ heading: 'B52 — the stale plugin cache', line: 6, id: 'B52', evidence: 'BUGS.md records B52 fixed' }];
    const line = lineFor(renderOnly(classifyRows(rows, { stale })), 'B52');
    expect(line).toMatch(/reads closed in \*\*`BUGS\.md`\*\* \(BUGS\.md records B52 fixed\)/);
  });

  it('AC3.2 — the three real headings, through the REAL parser, lead with no closed id', () => {
    // ⚠ THE LAYER IS THE POINT. The prohibited predicate ("heading mentions a
    // closed unit") would live in the parser's leading-id extraction, not in
    // `classifyRows`, which drops only on an id or line the discharge input
    // already resolved. M6.E11 t7.2: the hand-written BACKLOG.md, archived.
    const rows = parseBacklogRows(archived('BACKLOG.md'), { maxDepth: 4 });
    const find = (re) => rows.find((r) => re.test(r.text));
    const mentions = [
      [/PARTIALLY SHIPPED \(v0\.1\.11, M5\.E6/, null],
      [/renumbered from `M5\.E16/, 'M5.E20'],
      [/ranks on the backlog alone, while reading five sources/, null],
    ];
    for (const [re, expected] of mentions) {
      const r = find(re);
      expect(r, `fixture heading vanished from BACKLOG.md: ${re}`).toBeDefined();
      expect(r.leadingId, `heading must not lead with a unit it merely mentions: ${r.text.slice(0, 60)}`).toBe(expected);
    }
  });

  it('AC3.2 — and classifyRows does not drop them when the mentioned units are closed', () => {
    const rows = [
      row(3, '`/sig:sweep --docs / --code` — periodic hygiene sweep — **⚠ PARTIALLY SHIPPED (v0.1.11, M5.E6, 2026-07-25)**'),
      row(6, 'M5.E20 — The other two shapes of "shipped but never run" *(renumbered from `M5.E16`, 2026-08-09)*'),
      row(9, '`/sig:advise` ranks on the backlog alone, while reading five sources · **hygiene** · small · *filed 2026-09-05 from `M6.E7` REVIEW*'),
    ];
    // Every mentioned unit is closed — on some OTHER row's line, as input 3 would report them.
    const stale = [
      { heading: 'x', line: 900, id: 'M5.E6', evidence: 'closed' },
      { heading: 'y', line: 901, id: 'M5.E16', evidence: 'closed' },
      { heading: 'z', line: 902, id: 'M6.E7', evidence: 'closed' },
    ];
    const r = classifyRows(rows, { stale });
    expect(r.live).toHaveLength(3);
    expect(r.dropped).toEqual([]);
  });

  it('NFR2 — the advisor imports no closure resolver of its own; closure comes through input 3 only', () => {
    // Checks IMPORTS AND CALLS, not mentions: comments are stripped first.
    const src = readFileSync(join(process.cwd(), 'plugin/tools/lib/advise.js'), 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n');
    expect(code, 'the advisor must not import closure.js').not.toMatch(/from '\.\/closure\.js'/);
    expect(code, 'the advisor must not call resolveClosures — closure arrives through input 3').not.toMatch(/resolveClosures\s*\(/);
    expect(code).not.toMatch(/import\s*\{[^}]*resolveClosures/);
  });
});

describe('t3.2 / t3.2b — it proposes, and never selects (FR6 of M6.E7)', () => {
  it('every dropped row carries a reason naming the input that dropped it', async () => {
    const base = project();
    const r = await run(base);
    const dropped = r.artifact.slice(r.artifact.indexOf('### Dropped'));
    expect(r.classified.dropped.length).toBeGreaterThan(0);
    for (const s of r.classified.dropped) {
      const line = lineFor(dropped, s.row.text);
      expect(line).toBeTruthy();
      expect(line).toMatch(/Dropped by the \*\*(discharge|self-declared|fold)\*\* input/);
    }
  });

  it('carries the status line, the Priorities heading, and none of the forbidden verbs', async () => {
    const base = project();
    const r = await run(base);
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain(RENDER_LABELS.status);
    expect(body).toContain(`## ${RENDER_LABELS.priorities}`);
    for (const verb of FORBIDDEN_VERBS) expect(body.toLowerCase()).not.toContain(verb);
  });

  it("the renderer's own labels never claim a decision was made", () => {
    const vocabulary = Object.values(RENDER_LABELS).join(' ').toLowerCase();
    for (const verb of FORBIDDEN_VERBS) expect(vocabulary).not.toContain(verb);
  });

  it('the pick heading is not a renderer label, and the renderer never writes it', async () => {
    const base = project();
    const r = await run(base);
    expect(Object.values(RENDER_LABELS)).not.toContain(PICK_HEADING);
    expect(r.artifact).not.toContain(`## ${PICK_HEADING}`);
  });

  it('never writes "1 rows", and never "which demoted by"', async () => {
    const base = project();
    const r = await run(base);
    expect(r.artifact).not.toMatch(/\b1 rows\b/);
    expect(r.artifact).not.toMatch(/which (demoted|dropped) by/);
  });
});

describe('M6.E12 FR3 — the advisory artifact', () => {
  it('AC3.1 — sections in order: status, judgment, Corpus read, Open on other branches, Citation rule, Priorities, Appendix', async () => {
    // ⚠ The order asserted is the CODE's (Citation rule before Priorities).
    // `M6.E12-REQUIREMENTS.md` AC3.1 lists Priorities before the citation rule;
    // the task brief and the renderer agree with each other and not with it.
    const base = project();
    const { corpus } = await prepareAdvise(base);
    const checked = await validatePriorities(base, PRIORITIES, corpus);
    expect(checked.ok).toBe(true);
    const withBranch = {
      ...corpus,
      sources: {
        ...corpus.sources,
        otherBranches: { open: [{ epic: 'M6.E9', phase: 'VERIFY', branches: ['feat/x'], checkout: 'feat/x' }], unclassified: [], unreadable: [] },
      },
    };
    const art = renderArtifact({
      today: TODAY,
      classified: classifyRows(corpus.sources.backlog.rows),
      priorities: checked.priorities,
      corpus: withBranch,
    });
    const order = [
      RENDER_LABELS.status,
      RENDER_LABELS.judgment,
      `## ${RENDER_LABELS.corpus}`,
      '## Open on other branches',
      `## ${RENDER_LABELS.citationRule}`,
      `## ${RENDER_LABELS.priorities} — 3`,
      `## ${RENDER_LABELS.appendix}`,
    ];
    const at = order.map((s) => art.indexOf(s));
    for (const [i, pos] of at.entries()) expect(pos, `missing: ${order[i]}`).toBeGreaterThanOrEqual(0);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('AC3.1 — with no open branch work, the section is absent and the rest keep their order', async () => {
    const base = project();
    const r = await run(base);
    expect(r.artifact).not.toContain('## Open on other branches');
    const at = [
      `## ${RENDER_LABELS.corpus}`,
      `## ${RENDER_LABELS.citationRule}`,
      `## ${RENDER_LABELS.priorities}`,
      `## ${RENDER_LABELS.appendix}`,
    ].map((s) => r.artifact.indexOf(s));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('AC3.2 — the header states the priorities are a judgment that can differ between runs', async () => {
    const base = project();
    const r = await run(base);
    expect(r.artifact).toContain(RENDER_LABELS.judgment);
    expect(RENDER_LABELS.judgment).toMatch(/\*\*judgment\*\*/);
    expect(RENDER_LABELS.judgment).toMatch(/can propose different ones/);
  });

  it('AC3.3 — no rendered artifact carries an age reason', async () => {
    const base = project();
    const r = await run(base);
    const art = r.artifact;
    expect(art).not.toMatch(/days old/i);
    expect(art).not.toMatch(/\boldest\b/i);
    expect(art).not.toMatch(/\*\*age\*\*/);
    expect(art).not.toMatch(/were filed/);
    expect(art).not.toMatch(/filed \d{4}-\d{2}-\d{2}/i);
    // The rows carry "Filed …" in their bodies, and none of it reaches the artifact.
    expect(art).not.toMatch(/Filed 2026-/);
  });

  it('AC3.4 — every live row appears exactly once in the appendix; dropped rows are listed with reasons', async () => {
    const base = project();
    const r = await run(base);
    const app = appendixOf(r.artifact);
    for (const s of r.classified.live) {
      const token = `\`${s.row.path}:${s.row.line}\``;
      expect(app.split(token).length - 1, `live row ${s.row.text} must appear once`).toBe(1);
    }
    // Covered rows sit under their priority; the rest are in the not-covered list, in file order.
    const under1 = app.slice(app.indexOf('### Under priority 1'), app.indexOf('### Under priority 2'));
    expect(under1).toContain('R1 — an ungated row filed early');
    const rest = app.slice(app.indexOf('### Not covered by a priority'), app.indexOf('### Dropped'));
    const restOrder = rest.split('\n').filter((l) => l.startsWith('- **')).map((l) => l.slice(4, 6));
    expect(restOrder).toEqual(['R2', 'R4', 'R5', 'R6', 'R7', 'R8']);
    const dropped = app.slice(app.indexOf('### Dropped'));
    for (const s of r.classified.dropped) {
      const token = `\`${s.row.path}:${s.row.line}\``;
      expect(dropped.split(token).length - 1).toBe(1);
      expect(lineFor(dropped, s.row.text)).toMatch(/Dropped by the/);
    }
    const bullets = app.split('\n').filter((l) => l.startsWith('- **'));
    expect(bullets).toHaveLength(r.classified.live.length + r.classified.dropped.length);
  });

  it("AC3.4 / AC2.4 — on THIS repository's real BACKLOG.md, composed without writing", async () => {
    // ⚠ READ-ONLY by construction: runAdvise writes, so this composes the same
    // steps runAdvise takes — corpus, discharge, confirmed set, classify,
    // validate, render — and never calls writeArtifact.
    const cwd = process.cwd();
    const { corpus } = await prepareAdvise(cwd);
    expect(corpus.sources.backlog, 'this repository must have a readable BACKLOG.md').not.toBeNull();
    let discharge = null;
    try {
      discharge = await backlogDischargeStatus(cwd);
    } catch {
      discharge = null;
    }
    const confirmedBugs = corpus.sources.bugs
      ? new Set(corpus.sources.bugs.entries.filter((e) => e.status === 'confirmed').map((e) => e.id))
      : null;
    const classified = classifyRows(corpus.sources.backlog.rows, { stale: discharge?.stale ?? [], discharge, confirmedBugs });
    expect(classified.live.length).toBeGreaterThanOrEqual(3);

    const proposal = classified.live.slice(0, 3).map((s, i) => ({
      title: `Real priority ${i + 1}`,
      why: 'Built from a real row for the test.',
      covers: [`${s.row.path}:${s.row.line}`],
      // Two evidence tokens per priority, on purpose: with one, the pre-fix formula
      // (one claim per priority) and the shipped one (one per token) agree, and
      // this test pinned the wrong contract without failing (REVIEW pass 2).
      evidence: [`${s.row.path}:${s.row.line}`, '.planning/BACKLOG.md'],
    }));
    const checked = await validatePriorities(cwd, proposal, corpus, { liveRows: classified.live.map((s) => s.row) });
    expect(checked.reasons).toEqual([]);

    const art = renderArtifact({ today: TODAY, classified, priorities: checked.priorities, corpus });
    const app = appendixOf(art);
    for (const s of classified.live) {
      const token = `\`${s.row.path}:${s.row.line}\``;
      expect(app.split(token).length - 1, `live row at ${token} must appear once`).toBe(1);
    }
    const dropped = classified.dropped.length > 0 ? app.slice(app.indexOf('### Dropped')) : '';
    for (const s of classified.dropped) {
      const token = `\`${s.row.path}:${s.row.line}\``;
      expect(dropped.split(token).length - 1).toBe(1);
      expect(dropped.split('\n').find((l) => l.includes(token))).toMatch(/Dropped by the/);
    }

    const v = await verifyCitations(cwd, art);
    expect(v.unresolved).toEqual([]);
    // The run's own formula: every evidence token + every cited cover + every appendix row.
    const evidenceTokens = checked.priorities.reduce((n, p) => n + p.evidence.length, 0);
    const coveredCited = checked.priorities.reduce((n, p) => n + p.covers.filter((c) => c.kind !== 'new').length, 0);
    const claims = evidenceTokens + coveredCited + classified.live.length + classified.dropped.length;
    expect(v.resolved.length).toBe(claims);
  });

  it('an unfiled `new:` cover renders as unfiled, with no citation', async () => {
    const base = project();
    const r = await run(base);
    const line = r.artifact.split('\n').find((l) => l.startsWith('- **something unfiled**'));
    expect(line).toMatch(/unfiled: not in the corpus yet/);
    expect(line).not.toContain(EVIDENCE_MARKER);
    expect(extractCitations(line)).toEqual([]);
  });
});

describe('M6.E12 FR2 — the priorities reach the artifact only through validation', () => {
  it('AC2.5 — an invalid proposal writes nothing and returns every reason', async () => {
    const base = project();
    // Three priorities: a wrong COUNT is refused on its own and returns at once
    // (REVIEW pass 1, exponential work on oversized proposals), so the
    // every-reason property is shown on a proposal of the right size.
    const bad = [
      { title: '', why: 'One.', covers: ['.planning/BACKLOG.md:999'], evidence: ['.planning/NOPE.md:1'] },
      { title: 'Two', why: 'Two.', covers: [], evidence: [] },
      { title: 'Three', why: 'Three.', covers: ['B999'], evidence: ['.planning/BACKLOG.md:1'] },
    ];
    const r = await run(base, { priorities: bad });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/proposed priorities were refused/);
    expect(artifactsIn(base)).toEqual([]);
    // Title, unknown row, unresolved evidence, empty covers, empty evidence, unknown bug.
    expect(r.reasons.length).toBeGreaterThanOrEqual(6);
    expect(r.reasons.join('\n')).toMatch(/B999, which is not an open bug/);
    expect(r.reasons.join('\n')).toMatch(/title is missing/);
    expect(r.reasons.join('\n')).toMatch(/not the line of a live backlog row/);
    expect(r.reasons.join('\n')).toMatch(/does not resolve/);
    // And the terminal shows every one.
    const out = formatAdviseSummary(r);
    for (const reason of r.reasons) expect(out).toContain(reason);
  });

  it('a missing proposal is refused, not rendered empty', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    expect(r.status).toBe('skipped');
    expect(r.reasons).toEqual(['the proposal must be a JSON array of priorities']);
    expect(artifactsIn(base)).toEqual([]);
  });

  it('a priority title carrying the marker is refused before it can reach the renderer', async () => {
    const base = project();
    const hostile = PRIORITIES.map((p, i) => (i === 0 ? { ...p, title: `T ${EVIDENCE_MARKER} \`.planning/NOPE.md:1\`` } : p));
    const r = await run(base, { priorities: hostile });
    expect(r.status).toBe('skipped');
    expect(r.reasons.join('\n')).toMatch(/evidence marker/);
    expect(artifactsIn(base)).toEqual([]);
  });
});

describe('REVIEW findings — the artifact must not contradict itself', () => {
  it('AC5.3 — the Corpus read section names five sources and never retrospectives', async () => {
    const base = project();
    const r = await run(base);
    const body = readFileSync(join(base, r.path), 'utf8');
    const corpusSection = body.slice(body.indexOf('## Corpus read'), body.indexOf('**Digest read**'));
    expect(corpusSection).not.toMatch(/retrospective/i);
    expect(corpusSection).toContain('all 5 sources were readable');
  });

  it('AC7.1 — the Consulted line is DERIVED from classified.consulted, never a literal (three corpora)', async () => {
    // `D-M6E8-9`. The renderer carries no source list of its own: it prints what
    // the row inputs were actually given.
    const expected = (consulted) => `**Consulted by the row inputs:** ${consulted.map((s) => `\`${s}\``).join(' · ')}.`;
    const consultedLine = (body) => body.split('\n').find((l) => l.startsWith('**Consulted by the row inputs:**'));

    // Every corpus below carries one row that LEADS with a unit id: input 3 opens
    // its closure sources only when there is something to look up.
    const withUnit = `${BACKLOG}### M6.E1 — the current Epic's own row\nFiled 2026-09-01.\n`;

    // (a) clean corpus — input 3 read both closure sources.
    const a = await run(project({ backlog: withUnit }));
    expect(a.status).toBe('written');
    expect(a.classified.consulted).toEqual(['BACKLOG.md', 'BUGS.md', 'STATE/closure']);
    expect(consultedLine(a.artifact)).toBe(expected(a.classified.consulted));

    // (b) BUGS.md unreadable — the discharge OUTCOME reads clean, so keying off it would over-claim.
    const noBugs = project({ backlog: withUnit, omit: ['BUGS.md'] });
    mkdirSync(join(noBugs, '.planning', 'BUGS.md'));
    expect((await backlogDischargeStatus(noBugs)).outcome).toBe('clean');
    const b = await run(noBugs, { priorities: ROW_PRIORITIES });
    expect(b.status).toBe('written');
    expect(b.classified.consulted).toEqual(['BACKLOG.md', 'STATE/closure']);
    expect(consultedLine(b.artifact)).toBe(expected(b.classified.consulted));

    // (c) STATE.md unreadable — unit closure is unknowable, the bug catalog is not.
    const noState = project({ backlog: withUnit });
    writeFileSync(join(noState, '.planning', 'STATE.md'), '---\nschema_version: 99\n---\n');
    const c = await run(noState);
    expect(c.status).toBe('written');
    expect(c.classified.consulted).toEqual(['BACKLOG.md', 'BUGS.md']);
    expect(consultedLine(c.artifact)).toBe(expected(c.classified.consulted));
  });

  it("AC7.1 — milestone rows are named as read-not-consulted, with FR6's reason, on every run", async () => {
    const base = project();
    const r = await run(base);
    const line = r.artifact.split('\n').find((l) => l.startsWith('**Read, not consulted:**'));
    expect(line).toContain('`milestone rows`');
    expect(line).toMatch(/already sequenced/);
    expect(line).toMatch(/no ranking input reads it/);
    expect(r.classified.consulted).not.toContain('milestone rows');
  });

  it('classifyRows reports consulted from what it was GIVEN — the unit contract', () => {
    const rows = [{ line: 1, path: 'p', text: 'R1 — a row', body: '' }];
    expect(classifyRows(rows).consulted).toEqual(['BACKLOG.md']);
    expect(classifyRows(rows, { discharge: { sources: { units: true, bugs: false } } }).consulted).toEqual(['BACKLOG.md', 'STATE/closure']);
    expect(classifyRows(rows, { discharge: { sources: { units: false, bugs: true } } }).consulted).toEqual(['BACKLOG.md', 'BUGS.md']);
    // A confirmed-bug set means BUGS.md was consulted even if input 3 could not read it.
    expect(
      classifyRows(rows, { discharge: { sources: { units: false, bugs: false } }, confirmedBugs: new Set() }).consulted
    ).toEqual(['BACKLOG.md', 'BUGS.md']);
    // Never milestone rows, and always in ADVISOR_SOURCES order, deduplicated.
    const all = classifyRows(rows, { discharge: { sources: { units: true, bugs: true } }, confirmedBugs: new Set(['B1']) }).consulted;
    expect(all).toEqual(['BACKLOG.md', 'BUGS.md', 'STATE/closure']);
  });
});

describe('t3.4 — the producer attribution the outcome oracle depends on', () => {
  it('names itself, because this Epic had to label its own provenance unverified', async () => {
    const base = project();
    const r = await run(base);
    expect(readFileSync(join(base, r.path), 'utf8')).toContain('via /sig:advise');
  });
});

describe('t3.5 — the run boundary: a count, not a flag (AC2.4)', () => {
  it('writes when every claim resolves, and resolves EXACTLY priorities + cited covers + appendix rows', async () => {
    const base = project();
    const r = await run(base);
    expect(r.status).toBe('written');
    expect(r.verification.unresolved).toEqual([]);
    expect(r.verification.resolved.length).toBe(claimsOf(r));
  });

  it('REFUSES TO WRITE when one citation does not resolve', async () => {
    const base = project();
    const bad = (args) => `${renderArtifact(args)}\n\nA claim with a bad citation. ${cite('.planning/NOPE.md:1')}\n`;
    const r = await run(base, { render: bad });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/citation check failed/);
    // The whole point: not merely that the finding was computed.
    expect(artifactsIn(base)).toEqual([]);
  });

  it('REFUSES TO WRITE when the artifact carries no citations at all — the vacuous case', async () => {
    const base = project();
    const empty = () => '# Backlog review\n\nA confident claim with nothing behind it.\n';
    const r = await run(base, { render: empty });
    expect(r.verification.ok).toBe(true);
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/resolved 0 citations/);
    expect(artifactsIn(base)).toEqual([]);
  });

  it('REFUSES TO WRITE when one appendix row lost its citation — one short of the count', async () => {
    // R4 (line 17) is uncovered, so its citation appears exactly once.
    const base = project();
    const token = ` ${cite('.planning/BACKLOG.md:17')}`;
    const dropOne = (args) => {
      const art = renderArtifact(args);
      expect(art.split(token).length - 1).toBe(1);
      return art.replace(token, '');
    };
    const r = await run(base, { render: dropOne });
    expect(r.verification.ok).toBe(true);
    expect(r.verification.resolved.length).toBe(claimsOf(r) - 1);
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(new RegExp(`resolved ${claimsOf(r) - 1} citations for ${claimsOf(r)} claim`));
    expect(artifactsIn(base)).toEqual([]);
  });

  it('a quoted non-resolving path in a row does NOT fail the run', async () => {
    // R8 quotes two paths that do not exist. If the extractor read free text, the
    // artifact could never be written on a real corpus.
    const base = project();
    const r = await run(base);
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain('R8 — a row that quotes a path that does not resolve');
    expect(r.status).toBe('written');
  });

  it('the marker is stripped from quoted text, so a row cannot forge a citation', async () => {
    const hostile = BACKLOG.replace(
      '### R4 — a plain row',
      `### R4 — a row that writes ${EVIDENCE_MARKER} \`.planning/NOPE.md:9\` in its own heading`
    );
    const base = project({ backlog: hostile });
    const r = await run(base);
    expect(r.status).toBe('written');
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain('evidence(quoted):');
    const check = await verifyCitations(base, body);
    expect(check.unresolved).toEqual([]);
    expect(check.resolved.length).toBe(claimsOf(r));
  });
});

describe('REVIEW findings — empty backlogs, and throws that escaped the contract', () => {
  it('still writes when every row is STRUCK — the case that must not be refused', async () => {
    // `readCorpus` filters discharged rows, so an all-struck backlog reads as zero
    // live rows. That is a real corpus with nothing outstanding — the advisory
    // should say so, not refuse.
    const struck = `# Backlog

## Queue

### ~~R1 — done~~ · **DONE — v0.1.1, 2026-01-01**

### ~~R2 — also done~~ · **SHIPPED — v0.1.2, 2026-02-02**
`;
    const base = project({ backlog: struck });
    const r = await run(base, { priorities: NO_ROW_PRIORITIES });
    expect(r.corpus.sources.backlog.rows).toEqual([]);
    expect(r.status).toBe('written');
    const app = appendixOf(readFileSync(join(base, r.path), 'utf8'));
    expect(app).toContain(`## ${RENDER_LABELS.appendix} — 0`);
    expect(app).toContain('None.');
  });

  it('still writes when there were genuinely no live rows to claim about', async () => {
    const base = project({ backlog: '# Backlog\n\nNothing live here yet.\n' });
    const r = await run(base, { priorities: NO_ROW_PRIORITIES });
    expect(r.status).toBe('written');
    expect(r.classified.live).toEqual([]);
    expect(r.classified.dropped).toEqual([]);
    // Priorities still carry citations, so the count is never zero.
    expect(r.verification.resolved.length).toBe(claimsOf(r));
    expect(claimsOf(r)).toBeGreaterThan(0);
  });

  it('returns a reason instead of throwing when .planning/ is a symlink out of the repo', async () => {
    // Since M6.E12 the priorities' evidence is resolved through the confined
    // resolver first, so this may be refused at validation rather than at
    // writeArtifact. Either way: a reason, not a throw. The write-throw path
    // itself is reached by the read-only test below.
    const outside = mkdtempSync(join(tmpdir(), 'sig-advise-outside-'));
    writeFileSync(join(outside, 'BACKLOG.md'), '# Backlog\n\nNothing live.\n');
    writeFileSync(join(outside, 'BUGS.md'), BUGS);
    writeFileSync(join(outside, 'STATE.md'), STATE);
    const base = mkdtempSync(join(tmpdir(), 'sig-advise-symlink-'));
    symlinkSync(outside, join(base, '.planning'));
    const r = await run(base, { priorities: NO_ROW_PRIORITIES });
    expect(r.status).toBe('skipped');
    expect(r.reason).toBeTruthy();
  });

  it('returns a reason instead of throwing when .planning/ is not writable', async () => {
    const base = project();
    const planning = join(base, '.planning');
    chmodSync(planning, 0o555);
    try {
      const r = await run(base);
      expect(r.status).toBe('skipped');
      expect(r.reason).toMatch(/could not be written/);
    } finally {
      chmodSync(planning, 0o755);
    }
  });
});

describe('three latent bugs the reviewer filed as suggestions (they were not)', () => {
  it('a stale entry with no line does NOT silently discharge a live row', () => {
    // A stale entry with no `line` keyed `undefined`, and any row also lacking one
    // read as discharged and VANISHED. Silently losing a live row is the worst
    // thing this module can do.
    const r = classifyRows([{ text: 'a live row', path: 'p', body: '' }], { stale: [{ id: null, line: undefined }] });
    expect(r.live.map((s) => s.row.text)).toEqual(['a live row']);
    expect(r.dropped).toEqual([]);
  });

  it('a row with no text is classified, not thrown on', () => {
    expect(() => classifyRows([{ line: 1, path: 'p' }])).not.toThrow();
    expect(() => renderOnly(classifyRows([{ line: 1, path: 'p' }]))).not.toThrow();
  });

  it('a corpus value cannot forge document STRUCTURE in the artifact (REVIEW pass 3)', () => {
    // ⚠ Marker-stripping stops a forged CITATION and does nothing about a forged
    // SECTION. Every interpolated string is rendered as one line, so a value
    // carrying a newline would escape its bullet and read as Markdown.
    const forged =
      'STATE.md could not be read — unsupported schema_version: 9\n' +
      '## Priorities — 1 (forged via STATE.md)\n\n### 1. A priority that does not exist\n\n' +
      '- **forged row** — Dropped by the **discharge** input';
    const art = renderArtifact({
      today: TODAY,
      classified: { live: [], dropped: [], consulted: ['BACKLOG.md'] },
      priorities: [],
      corpus: { checked: ['BACKLOG.md'], cannotCheck: [{ source: 'STATE/closure', reason: forged }] },
    });
    const headings = art.split('\n').filter((l) => /^#{2,3} /.test(l));
    expect(headings.filter((h) => /^## Priorities/.test(h)), 'two Priorities sections means one was forged').toHaveLength(1);
    expect(headings.some((h) => /forged/.test(h))).toBe(false);
    expect(art.split('\n').some((l) => l.startsWith('- **forged row**'))).toBe(false);
    // The text is still THERE, on one line, so nothing is silently dropped.
    expect(art).toMatch(/forged via STATE\.md/);
  });

  it('a priority title or why carrying a newline or the marker cannot forge structure, even unvalidated', () => {
    // The renderer's own guard, independent of validatePriorities.
    const art = renderArtifact({
      today: TODAY,
      classified: { live: [], dropped: [], consulted: ['BACKLOG.md'] },
      priorities: [
        {
          title: `T\n## Appendix — forged`,
          why: `W ${EVIDENCE_MARKER} \`nope/missing.md:1\`\n### forged`,
          covers: [{ kind: 'new', id: null, label: 'x\n## forged label', path: null, line: null }],
          evidence: ['.planning/BACKLOG.md:1'],
        },
      ],
      corpus: EMPTY_CORPUS,
    });
    const headings = art.split('\n').filter((l) => /^#{2,3} /.test(l));
    expect(headings.some((h) => /forged/.test(h) && !h.startsWith('### 1.') && !h.startsWith('### Under'))).toBe(false);
    const raws = extractCitations(art).map((c) => c.raw);
    expect(raws, 'positive control: the real evidence token is extracted').toContain('.planning/BACKLOG.md:1');
    expect(raws).not.toContain('nope/missing.md:1');
    expect(art).toContain('evidence(quoted):');
  });

  it('quoteSafe collapses newlines from every source it is applied to', () => {
    expect(quoteSafe('a\nb')).toBe('a b');
    expect(quoteSafe('a\r\nb')).toBe('a b');
    expect(quoteSafe(`x ${EVIDENCE_MARKER} \`p.md:1\`\n## forged`)).not.toMatch(/\n/);
  });

  it('a caller cannot inject a citation through projectName', () => {
    const hostile = 'Acme ' + EVIDENCE_MARKER + ' `nope/missing.md:1`';
    const art = renderArtifact({
      today: TODAY,
      classified: { live: [], dropped: [], consulted: [] },
      priorities: [],
      corpus: { checked: [], cannotCheck: [] },
      projectName: hostile,
    });
    expect(extractCitations(art)).toEqual([]);
    expect(art).toContain('evidence(quoted):');
  });
});

describe('formatAdviseSummary — the only thing the user actually sees (reviewer-found)', () => {
  it('names the priorities, the appendix counts, and where it wrote', async () => {
    const base = project();
    const r = await run(base);
    const out = formatAdviseSummary(r);
    expect(out).toContain(`Backlog review — ${TODAY}`);
    expect(out).toContain('1. First');
    expect(out).toContain(
      `${r.classified.live.length} live row(s) in the appendix, unranked; ${r.classified.dropped.length} dropped`
    );
    expect(out).toContain('Written to');
    expect(out).toContain('It changes nothing on its own.');
  });

  it('says "Unchanged at" on an idempotent re-run rather than claiming a write', async () => {
    const base = project();
    await run(base);
    const again = await run(base);
    expect(again.status).toBe('unchanged');
    expect(formatAdviseSummary(again)).toContain('Unchanged at');
    expect(formatAdviseSummary(again)).not.toContain('Written to');
  });

  it('the skipped branch reports the reason and claims nothing else', async () => {
    const base = project({ omit: ['BACKLOG.md'] });
    const r = await run(base);
    const out = formatAdviseSummary(r);
    expect(out).toMatch(/wrote nothing —/);
    expect(out).toContain(r.reason);
    expect(out).not.toContain('Written to');
    expect(out).not.toContain('live row(s) in the appendix');
  });

  it('warns in the terminal about sources it could not read', async () => {
    const base = project({ omit: ['BUGS.md'] });
    const r = await run(base, { priorities: ROW_PRIORITIES });
    expect(r.status).toBe('written');
    expect(formatAdviseSummary(r)).toMatch(/⚠ 1 source\(s\) could not be read: BUGS\.md\./);
  });
});

describe('the stale-read guard (PR reviewer, at SHIP)', () => {
  // ⚠ THE FIRST ARTIFACT THIS COMMAND EVER SHIPPED HAD ~51 CITATIONS OFF BY FIVE
  // LINES. `verifyCitations` checks a line is WITHIN the file, never that it
  // carries the claimed content.

  it('REFUSES to write when the backlog shifted under it after reading', async () => {
    const base = project();
    const backlogPath = join(base, '.planning', 'BACKLOG.md');
    const before = readFileSync(backlogPath, 'utf8').split('\n');
    const shifted = [before[0], '', '> inserted', '> at', '> ship time', ...before.slice(1)].join('\n');
    const render = (args) => {
      writeFileSync(backlogPath, shifted); // the edit lands between read and write
      return renderArtifact(args);
    };
    const r = await run(base, { render });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/no longer carry what they were read for/);
    expect(artifactsIn(base)).toEqual([]);
  });

  it('REFUSES to write when only BUGS.md shifted — a covered bug line is checked too', async () => {
    const base = project();
    const bugsPath = join(base, '.planning', 'BUGS.md');
    const render = (args) => {
      writeFileSync(bugsPath, `> inserted\n> above\n${BUGS}`); // BACKLOG.md is untouched
      return renderArtifact(args);
    };
    const r = await run(base, { render });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/no longer carry what they were read for/);
    expect(r.reason).toContain('.planning/BUGS.md:5');
    expect(artifactsIn(base)).toEqual([]);
  });

  it('writes normally when nothing moved', async () => {
    const base = project();
    expect((await run(base)).status).toBe('written');
  });
});

describe('t3.6 / NFR1 — determinism and idempotence', () => {
  it('renders byte-identical output twice over the same corpus', async () => {
    const base = project();
    const first = await run(base);
    const second = await run(base);
    expect(second.status).toBe('unchanged');
    expect(second.artifact).toBe(first.artifact);
  });

  it('does not rewrite the file when nothing changed', async () => {
    const base = project();
    const r = await run(base);
    const before = statSync(join(base, r.path)).mtimeMs;
    await new Promise((res) => setTimeout(res, 10));
    await run(base);
    expect(statSync(join(base, r.path)).mtimeMs).toBe(before);
  });

  it('refuses, with a reason, when .planning/ is absent', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sig-advise-bare-'));
    const r = await writeArtifact(base, { name: 'BACKLOG-REVIEW-2026-09-05.md', content: '#\n' });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/not present/);
  });
});

describe('t3.7 — the artifact name is constrained, not chosen', () => {
  it('is BACKLOG-REVIEW-YYYY-MM-DD.md, the pattern doc-budgets.json already exempts', async () => {
    const base = project();
    const r = await run(base);
    expect(r.path).toBe(`.planning/${ARTIFACT_PREFIX}${TODAY}.md`);
    const budgets = JSON.parse(readFileSync(join(process.cwd(), 'tools/doc-budgets.json'), 'utf8'));
    expect(JSON.stringify(budgets)).toContain('BACKLOG-REVIEW');
  });
});

describe('AC4.3 — a same-day re-run never overwrites an advisory that holds a pick', () => {
  const baseName = `${ARTIFACT_PREFIX}${TODAY}.md`;

  it('nextArtifactName returns the base name when it is free', () => {
    expect(nextArtifactName(project(), TODAY)).toBe(baseName);
  });

  it('nextArtifactName returns the base name when the existing file holds no pick', () => {
    const base = project();
    writeFileSync(join(base, '.planning', baseName), '# Backlog review\n\nNo pick yet.\n');
    expect(nextArtifactName(base, TODAY)).toBe(baseName);
  });

  it('nextArtifactName returns -2 when the base file holds a pick', () => {
    const base = project();
    writeFileSync(join(base, '.planning', baseName), `# Backlog review\n\n## ${PICK_HEADING}\n\nPriority 1.\n`);
    expect(nextArtifactName(base, TODAY)).toBe(`${ARTIFACT_PREFIX}${TODAY}-2.md`);
  });

  it('runAdvise writes -2 and leaves the picked file byte-identical', async () => {
    const base = project();
    const first = await run(base);
    expect(first.status).toBe('written');
    const pickedPath = join(base, first.path);
    const picked = `${readFileSync(pickedPath, 'utf8')}\n## ${PICK_HEADING}\n\nPriority 1, 2026-09-05.\n`;
    writeFileSync(pickedPath, picked);

    const second = await run(base);
    expect(second.status).toBe('written');
    expect(second.path).toBe(`.planning/${ARTIFACT_PREFIX}${TODAY}-2.md`);
    expect(readFileSync(pickedPath, 'utf8')).toBe(picked);
  });
});

describe('SIG-123 — today is validated before it becomes a filename', () => {
  it('isValidStamp accepts a real date and rejects the rest', () => {
    expect(isValidStamp(TODAY)).toBe(true);
    for (const bad of ['2026-13-01', '../x', '2026-02-30', '', null, undefined, '2026-9-5']) {
      expect(isValidStamp(bad), `accepted ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('runAdvise skips with a reason naming the bad value, and writes nothing', async () => {
    const base = project();
    for (const bad of ['../x', '2026-02-30']) {
      const r = await run(base, { today: bad });
      expect(r.status).toBe('skipped');
      expect(r.reason).toContain(JSON.stringify(bad));
    }
    expect(artifactsIn(base)).toEqual([]);
    expect(readdirSync(base)).toEqual(['.planning']);
  });
});

describe('AC1.4 / AC1.5 — what it says, and what it touches', () => {
  it('an unreadable BUGS.md reaches the ARTIFACT, not just the return value', async () => {
    const base = project({ omit: ['BUGS.md'] });
    const r = await run(base, { priorities: ROW_PRIORITIES });
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain('Could not read:');
    expect(body).toContain('BUGS.md');
    expect(body).toMatch(/not a complete picture/i);
  });

  it('writes its artifact and nothing else', async () => {
    const base = project();
    const planning = join(base, '.planning');
    const before = Object.fromEntries(readdirSync(planning).map((f) => [f, readFileSync(join(planning, f), 'utf8')]));
    await run(base);
    for (const [name, content] of Object.entries(before)) {
      expect(readFileSync(join(planning, name), 'utf8')).toBe(content);
    }
    const after = readdirSync(planning).filter((f) => !(f in before));
    expect(after).toEqual([`${ARTIFACT_PREFIX}${TODAY}.md`]);
    // The inbound BACKLOG.md link and the INDEX.md regeneration are ONE-TIME
    // HUMAN EDITS AT SHIP, not command behaviour.
    expect(existsSync(join(planning, 'INDEX.md'))).toBe(false);
  });

  it('prepareAdvise writes nothing at all', async () => {
    const base = project();
    const planning = join(base, '.planning');
    const before = readdirSync(planning).sort();
    const { digestText } = await prepareAdvise(base);
    expect(typeof digestText).toBe('string');
    expect(readdirSync(planning).sort()).toEqual(before);
  });

  it('skips with a reason when there is no backlog to advise from', async () => {
    const base = project({ omit: ['BACKLOG.md'] });
    const r = await run(base);
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/not present/);
    expect(artifactsIn(base)).toEqual([]);
  });
});

describe('AC1.6 / NFR2 — no dependency on the prose plugin', () => {
  it('nothing this Epic ships imports or shells out to anything under prose', () => {
    // REACH DECLARATION (`B81`): reads these files under plugin/tools/lib as text.
    // It looks for `prose` in any import specifier and inside an
    // execFile/spawn/exec argument. It does NOT follow transitive imports or
    // inspect the command markdown.
    const files = ['citations.js', 'advise-corpus.js', 'advise.js', 'milestones.js', 'advise-digest.js', 'advise-priorities.js'];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), 'plugin/tools/lib', f), 'utf8');
      const imports = [...src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) expect(spec).not.toMatch(/prose/i);
      expect(src).not.toMatch(/(?:execFile|spawn|execSync|exec)\s*\([^)]*prose/i);
    }
  });
});
