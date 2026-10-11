// M6.E16.S5.t5.3 — `/sig:advise` reads Epics from the unit records (AC7.3).
// See .planning/M6.E16-VALIDATION.md row AC7.3.
//
// With unit records the digest's "milestone" lines and its local "open Epics"
// lines are built from the records — an open or closing unit is open, a closed
// one is not, a hold is shown — and neither the milestone file's Epic rows nor
// "no SHIP entry in STATE.md" decides anything. The corpus's `milestone rows`
// source carries the units and parses no row. Without unit records both read
// exactly what they read before.
//
// Projects are temp folders; unit names are invented.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { gatherBigPicture, formatDigest } from '../plugin/tools/lib/advise-digest.js';
import { verifyCitations } from '../plugin/tools/lib/citations.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';

let savedCeiling;
beforeAll(() => {
  savedCeiling = process.env.GIT_CEILING_DIRECTORIES;
  // The temp project must not find a repository above it (the other-branches scan).
  process.env.GIT_CEILING_DIRECTORIES = tmpdir();
});
afterAll(() => {
  if (savedCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
  else process.env.GIT_CEILING_DIRECTORIES = savedCeiling;
});

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function put(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const by = 'claude';
const AT = '2026-10-01T10:00:00.000Z';
const SHA = '0123abc456789def0123abc456789def01234567';
const UNITS = '.planning/work/units';
const U = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: SHA },
  shipped: { type: 'closed', at: '2026-10-05T09:00:00.000Z', by, reason: 'shipped', proof: SHA, release: 'v9.9.1' },
  held: { type: 'held', at: AT, by, reason: 'still read daily' },
};
const UNIT_RECORDS = [
  { id: 'M7.E1', title: 'The first one', events: [U.opened, U.closing, U.shipped] },
  { id: 'M7.E2', summary: 'The second one, in flight.', events: [U.opened] },
  { id: 'M7.E3', events: [U.opened, U.closing] },
  { id: 'M7.E4', events: [U.opened, U.closing, U.shipped, U.held] },
  { id: 'M6.E1', title: 'Left open in the last milestone', events: [U.opened] },
  { id: 'phase-11', events: [U.opened] },
];
// A hand-kept table whose rows the unit path must never read.
const MILESTONE = '# Milestone 7 — the records\n\nWhat this milestone is for.\n\n## Epic status\n\n| Epic | Status | Summary |\n|---|---|---|\n'
  + '| `M7.E9` | **in flight** | a decoy row nobody recorded |\n| `M7.E2` | **shipped** — stale | a decoy status |\n';
const state = (epic, { phase = 'PLAN', completed = '[]' } = {}) =>
  `---\nschema_version: 1\nphase: ${phase}\ncurrent_epic: ${epic}\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: ${completed}\n---\n\n# State\n`;

function project({ units = UNIT_RECORDS, unitsOn = true, stateText = state('M7.E2'), files = {} } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-advise-units-'));
  dirs.push(base);
  put(base, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  put(base, '.planning/PROJECT.md', '# P\n\n## Vision\n\nShip calibrated rigor to small teams.\n');
  put(base, '.planning/STATE.md', stateText);
  put(base, '.planning/MILESTONE-7.md', MILESTONE);
  if (unitsOn) {
    put(base, `${UNITS}/.keep`, '');
    for (const r of units) put(base, `${UNITS}/${r.id}.json`, UNIT_KIND.serializeRecord(r));
  }
  for (const [rel, content] of Object.entries(files)) put(base, rel, content);
  return base;
}
const texts = (list) => list.map((e) => e.text);

describe('gatherBigPicture with unit records — the milestone lines (AC7.3)', () => {
  it('the heading is the milestone file\'s; the Epic lines are the unit records of that milestone, in order, each citing its record', async () => {
    const g = await gatherBigPicture(project());
    expect(g.checked).toContain('milestone');
    const [heading, ...rows] = g.entries.milestone;
    expect(heading).toMatchObject({ path: '.planning/MILESTONE-7.md', line: 1 });
    expect(heading.text).toContain('Milestone 7 — the records');
    expect(rows).toEqual([
      { path: `${UNITS}/M7.E1.json`, line: 1, text: 'M7.E1 The first one — closed 2026-10-05 (shipped), v9.9.1' },
      { path: `${UNITS}/M7.E2.json`, line: 1, text: 'M7.E2 The second one, in flight. — open' },
      { path: `${UNITS}/M7.E3.json`, line: 1, text: `M7.E3 — closing (close requested with ${SHA.slice(0, 7)})` },
      { path: `${UNITS}/M7.E4.json`, line: 1, text: 'M7.E4 — closed 2026-10-05 (shipped), v9.9.1 · held: still read daily' },
    ]);
  });

  it('no row of the milestone file is read: a hand-written row and a stale status appear nowhere', async () => {
    const g = await gatherBigPicture(project());
    const all = formatDigest(g);
    expect(all).not.toContain('decoy');
    expect(all).not.toContain('M7.E9');
  });

  it('every unit line\'s reference resolves (a record path and line 1)', async () => {
    const base = project();
    const g = await gatherBigPicture(base);
    const unitLines = [...g.entries.milestone, ...g.entries['open Epics']].filter((e) => e.path?.startsWith(UNITS));
    expect(unitLines.length).toBeGreaterThan(4);
    for (const e of unitLines) {
      const v = await verifyCitations(base, `claim — evidence: \`${e.path}:${e.line}\``);
      expect(v.unresolved, `${e.path}:${e.line}`).toEqual([]);
      expect(v.resolved).toHaveLength(1);
    }
    // …and it is what the digest prints.
    expect(formatDigest(g)).toContain(`(${UNITS}/M7.E2.json:1)`);
  });

  it('a milestone with no unit yet: the heading alone', async () => {
    const g = await gatherBigPicture(project({ units: [{ id: 'M6.E1', events: [U.opened] }] }));
    expect(g.entries.milestone).toHaveLength(1);
  });
});

describe('gatherBigPicture with unit records — the open Epics (AC7.3)', () => {
  it('every open or closing unit is open, of any milestone and any name; a closed one is not listed, held or not', async () => {
    const g = await gatherBigPicture(project());
    expect(g.checked).toContain('open Epics');
    expect(g.entries['open Epics']).toEqual([
      { path: `${UNITS}/M6.E1.json`, line: 1, text: 'M6.E1 — open' },
      { path: `${UNITS}/M7.E2.json`, line: 1, text: 'M7.E2 — open here at PLAN' },
      { path: `${UNITS}/M7.E3.json`, line: 1, text: `M7.E3 — closing (close requested with ${SHA.slice(0, 7)})` },
      { path: `${UNITS}/phase-11.json`, line: 1, text: 'phase-11 — open' },
    ]);
  });

  it('the record decides, not STATE.md: a SHIP entry does not close an open unit', async () => {
    const g = await gatherBigPicture(project({ stateText: state('M7.E2', { phase: 'SHIP', completed: '["SHIP 2026-10-06"]' }) }));
    expect(texts(g.entries['open Epics'])).toContain('M7.E2 — open here at SHIP');
  });

  it('the record decides, not STATE.md: a closed unit named as current, with no SHIP entry, is not open', async () => {
    const g = await gatherBigPicture(project({ stateText: state('M7.E1', { phase: 'EXECUTE' }) }));
    expect(texts(g.entries['open Epics']).join('\n')).not.toContain('M7.E1');
    expect(texts(g.entries['open Epics'])).toContain('M7.E2 — open');
  });

  it('a hold on an open unit is shown', async () => {
    const g = await gatherBigPicture(project({ units: [{ id: 'M7.E2', events: [U.opened, U.held] }] }));
    expect(texts(g.entries['open Epics'])).toEqual(['M7.E2 — open here at PLAN · held: still read daily']);
  });

  it('more open units than the cap: the cap is shown and the cut is said', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `M7.E${i + 1}`, events: [U.opened] }));
    const g = await gatherBigPicture(project({ units: many }));
    expect(g.entries['open Epics']).toHaveLength(20);
    expect(g.cut.join('\n')).toMatch(/open Epics: 20 of 25 shown/);
  });

  it('a unit record that does not read: the source is cannot-check, naming it — not a shorter list', async () => {
    const base = project();
    put(base, `${UNITS}/M7.E8.json`, '{ not json\n');
    const g = await gatherBigPicture(base);
    expect(g.checked).not.toContain('open Epics');
    expect(g.cannotCheck.find((c) => c.source === 'open Epics').reason).toMatch(/M7\.E8/);
    expect(g.cannotCheck.find((c) => c.source === 'milestone').reason).toMatch(/M7\.E8/);
  });
});

describe('readCorpus with unit records — the `milestone rows` source (AC7.3)', () => {
  it('carries the units, with their folded state, and parses no row', async () => {
    const corpus = await readCorpus(project());
    expect(corpus.checked).toContain('milestone rows');
    expect(corpus.sources.milestones.files).toEqual([]);
    expect(corpus.sources.milestones.units.map(({ id, path, status, held }) => ({ id, path, status, held }))).toEqual([
      { id: 'M6.E1', path: `${UNITS}/M6.E1.json`, status: 'open', held: false },
      { id: 'M7.E1', path: `${UNITS}/M7.E1.json`, status: 'closed', held: false },
      { id: 'M7.E2', path: `${UNITS}/M7.E2.json`, status: 'open', held: false },
      { id: 'M7.E3', path: `${UNITS}/M7.E3.json`, status: 'closing', held: false },
      { id: 'M7.E4', path: `${UNITS}/M7.E4.json`, status: 'closed', held: true },
      { id: 'phase-11', path: `${UNITS}/phase-11.json`, status: 'open', held: false },
    ]);    expect(corpus.sources.milestones.units.find((u) => u.id === 'M7.E4')).toMatchObject({ hold_reason: 'still read daily', close: { reason: 'shipped', release: 'v9.9.1' } });
  });

  it('a milestone file that cannot be read does not blind the source: it is not opened', async () => {
    const base = project();
    rmSync(join(base, '.planning/MILESTONE-7.md'));
    symlinkSync('/etc/hosts', join(base, '.planning/MILESTONE-7.md'));
    const corpus = await readCorpus(base);
    expect(corpus.checked).toContain('milestone rows');
    expect(corpus.cannotCheck.map((c) => c.source)).not.toContain('milestone rows');
  });

  it('a broken unit record blinds the source, by name', async () => {
    const base = project();
    put(base, `${UNITS}/M7.E8.json`, '{ not json\n');
    const corpus = await readCorpus(base);
    expect(corpus.sources.milestones).toBeNull();
    expect(corpus.cannotCheck.find((c) => c.source === 'milestone rows').reason).toMatch(/M7\.E8/);
  });
});

describe('without unit records both read what they read before (AC6.4)', () => {
  it('the digest reads the milestone file\'s rows and STATE.md\'s open Epic', async () => {
    const g = await gatherBigPicture(project({ unitsOn: false }));
    expect(texts(g.entries.milestone.slice(1))).toEqual([
      'M7.E9 E9 — **in flight**',
      'M7.E2 E2 — **shipped** — stale',
    ]);
    expect(g.entries.milestone[1]).toMatchObject({ path: '.planning/MILESTONE-7.md', line: 9 });
    expect(g.entries['open Epics']).toEqual([{ path: '.planning/STATE.md', line: 4, text: 'M7.E2 — open here at PLAN' }]);
  });

  it('the corpus parses the rows, and has no `units`', async () => {
    const corpus = await readCorpus(project({ unitsOn: false }));
    expect(corpus.sources.milestones.files.map((f) => f.rows.map((r) => r.id))).toEqual([['M7.E9', 'M7.E2']]);
    expect(corpus.sources.milestones.units).toBeUndefined();
  });
});
