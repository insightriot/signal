// M6.E16.S4.t4.4 — a legacy-closed unit is not evidence (AC8.2, `D-M6E16-15`).
// See .planning/M6.E16-VALIDATION.md row AC8.2.
//
// `/sig:docs-migrate --work-store` proposes a list entry for closing only when
// the entry cites something this repository's history backs up. One kind of
// citation is an Epic. Without unit records that means "the Epic has a
// retrospective". With unit records it means "the Epic's record is closed as
// `shipped`" — a close confirmed against the default branch. A `legacy` close
// (recorded as over, never checked) and a `dropped` one are not evidence.
//
// `M6.E13`'s verification cited a test that a legacy close is refused as
// proof; no such test existed. This is it.
//
// A real git repository in a temp folder. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildEvidenceIndex, planListsToRecords } from '../plugin/tools/lib/work-migrate-lists.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';

const UNITS = '.planning/work/units';
const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';
const SHA = '0123abc';
const DATES = { 'BUGS.md': { first: '2026-01-05', last: '2026-03-09' } };

const opened = { type: 'opened', at: AT, by };
const requested = { type: 'close_requested', at: AT, by, proof: SHA };
const closed = (reason, extra = {}) => ({ type: 'closed', at: AT, by, reason, ...extra });
const UNIT_FIXTURES = {
  'M3.E1': [closed('legacy', { words: 'shipped 2026-01-05, PR #7' })], // recorded as over, never checked
  'M3.E2': [opened, closed('dropped', { words: 'the work moved to M3.E3' })],
  'M3.E3': [opened, requested, closed('shipped', { proof: SHA, pr: '#9' })],
  'M3.E4': [opened],
  'M3.E5': [opened, requested],
  'M3.E6': [opened, requested, closed('shipped', { proof: SHA }), { type: 'held', at: AT, by, reason: 'still read' }],
  'M3.E7': [opened, closed('legacy')],
};
// Every one of them has a retrospective, so the old rule would count them all.
const RETRO_IDS = [...Object.keys(UNIT_FIXTURES), 'M3.E8'];

const git = (cwd, args) => String(execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }));
const bugs = (ids) => ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
  ...ids.map((id, i) => `| B${i + 1} | fixed | P2 | Header lost — shipped with ${id}. |`), ''].join('\n');

let root;
let base;
function put(rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}
function commitAll() {
  git(base, ['add', '-A']);
  git(base, ['commit', '-q', '-m', 'state']);
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'evidence-units-'));
  base = join(root, 'leaf-notes');
  mkdirSync(join(base, '.planning'), { recursive: true });
  git(base, ['init', '-q', '-b', 'main']);
  git(base, ['config', 'user.email', 't@t.co']);
  git(base, ['config', 'user.name', 'T']);
  git(base, ['config', 'commit.gpgsign', 'false']);
  for (const id of RETRO_IDS) put(`.planning/archive/${id}-RETROSPECTIVE.md`, '# Retro\n\nIt shipped.\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function plantUnits() {
  put(`${UNITS}/.keep`, '');
  for (const [id, events] of Object.entries(UNIT_FIXTURES)) put(`${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
}

describe('buildEvidenceIndex with unit records — only a shipped close is evidence (AC8.2)', () => {
  it('a legacy-closed unit is refused as evidence, and a shipped one is accepted', () => {
    plantUnits();
    commitAll();
    const idx = buildEvidenceIndex(base);
    expect(idx.units).toBe(true);
    expect(idx.epics.has('M3.E1'), 'legacy, born closed').toBe(false);
    expect(idx.epics.has('M3.E7'), 'legacy, opened then closed').toBe(false);
    expect(idx.epics.get('M3.E3')).toBe(`${UNITS}/M3.E3.json`);
  });

  it('dropped, open and closing units are not evidence; a shipped unit that is held still is; a retrospective alone is not', () => {
    plantUnits();
    commitAll();
    const idx = buildEvidenceIndex(base);
    expect([...idx.epics.keys()].sort()).toEqual(['M3.E3', 'M3.E6']);
    // M3.E8 has a retrospective and no record: the old rule's evidence, not this one's.
    expect(idx.epics.has('M3.E8')).toBe(false);
  });

  it('the plan proposes a close for the entry citing the shipped unit, and none for the legacy or dropped ones', () => {
    plantUnits();
    commitAll();
    const evidence = buildEvidenceIndex(base);
    const p = planListsToRecords({ 'BUGS.md': bugs(['M3.E1', 'M3.E2', 'M3.E3', 'M3.E7']) }, { key: 'LF', dates: DATES, evidence });
    expect(p.errors).toEqual([]);
    expect(p.proposedCloses.map((c) => c.legacyId)).toEqual(['B3']);
    expect(p.proposedCloses[0].evidence).toEqual([`M3.E3 → ${UNITS}/M3.E3.json`]);
    const flags = Object.fromEntries(p.manifest.items.map((it) => [it.legacy_id, it.flag]));
    expect(flags).toEqual({ B1: 'no-evidence', B2: 'no-evidence', B3: 'looks-finished', B4: 'no-evidence' });
    // The person's yes closes exactly the proposed one: a legacy close backs nothing.
    const yes = planListsToRecords({ 'BUGS.md': bugs(['M3.E1', 'M3.E2', 'M3.E3', 'M3.E7']) }, { key: 'LF', dates: DATES, evidence, confirmCloses: true });
    const closedIds = yes.records.filter((r) => r.record.events.some((e) => e.type === 'closed')).map((r) => r.record.legacy_id);
    expect(closedIds).toEqual(['B3']);
  });

  it('the note on a refused entry says why: no unit record closed as shipped', () => {
    plantUnits();
    commitAll();
    const evidence = buildEvidenceIndex(base);
    const p = planListsToRecords({ 'BUGS.md': bugs(['M3.E1']) }, { key: 'LF', dates: DATES, evidence });
    const note = p.records.find((r) => r.record.legacy_id === 'B1').record.migration_note;
    expect(note).toMatch(/Epic M3\.E1 has no unit record closed as shipped/);
    expect(note).not.toMatch(/no retrospective/);
  });

  it('an empty units folder is on: nothing is evidence, though every Epic has a retrospective', () => {
    put(`${UNITS}/.keep`, '');
    commitAll();
    const idx = buildEvidenceIndex(base);
    expect(idx.units).toBe(true);
    expect(idx.epics.size).toBe(0);
  });

  it('a broken record is not evidence and does not stop the others', () => {
    plantUnits();
    put(`${UNITS}/M3.E9.json`, '{ not json');
    commitAll();
    expect([...buildEvidenceIndex(base).epics.keys()].sort()).toEqual(['M3.E3', 'M3.E6']);
  });
});

describe('buildEvidenceIndex without unit records — the retrospective rule stays (AC6.4)', () => {
  it('no units folder: every Epic with a retrospective is evidence, and the index has no `units` field', () => {
    commitAll();
    const idx = buildEvidenceIndex(base);
    expect(idx.units).toBeUndefined();
    expect([...idx.epics.keys()].sort()).toEqual([...RETRO_IDS].sort());
    expect(idx.epics.get('M3.E1')).toBe('.planning/archive/M3.E1-RETROSPECTIVE.md');
    const p = planListsToRecords({ 'BUGS.md': bugs(['M3.E1']) }, { key: 'LF', dates: DATES, evidence: idx });
    expect(p.proposedCloses.map((c) => c.legacyId)).toEqual(['B1']);
  });

  it('a linked units folder reads as none: the retrospective rule answers, and the linked records are not read', () => {
    const outside = join(root, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'M3.E8.json'), UNIT_KIND.serializeRecord({ id: 'M3.E8', events: [opened, closed('dropped', { words: 'x' })] }));
    mkdirSync(join(base, '.planning/work'), { recursive: true });
    symlinkSync(outside, join(base, UNITS));
    commitAll();
    const idx = buildEvidenceIndex(base);
    expect(idx.units).toBeUndefined();
    expect(idx.epics.has('M3.E8')).toBe(true);
  });
});
