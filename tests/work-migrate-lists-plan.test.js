// The lists → records planner (M6.E15 S3; FR3.3, FR4, FR5.1–5.2, FR6.2–6.3,
// FR7.2, NFR security, AC2.3). See .planning/M6.E15-PLAN.md § S3 and
// .planning/M6.E15-VALIDATION.md.
//
// `planListsToRecords` is pure: list texts in, planned records out, nothing
// written (S4 writes). The fixtures under `fixtures/work-migrate-corpus1/` are
// invented text in corpus project 1's shapes; the project is never named.
//
// ⚠ The corpus fixture's BACKLOG.md carries a `<!-- backlog-key: … -->`
// marker — Signal's own 40-hex sha1 dedupe key — which the sensitive-data
// scrubber reads as a `hex-blob-40` hit. So every whole-corpus plan here passes
// `acknowledgeSensitive: true`, exactly as a person would after reading the
// hit. The abort itself is pinned in its own describe block (t3.5).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as lists from '../plugin/tools/lib/work-migrate-lists.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'work-migrate-corpus1');
const SOURCES = ['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md'];
const corpus = () => Object.fromEntries(SOURCES.map((s) => [s, readFileSync(join(FIX, s), 'utf-8')]));

const DATES = {
  'BUGS.md': { first: '2026-01-05', last: '2026-03-09' },
  'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' },
  'ISSUES-INBOX.md': { first: '2026-01-07', last: '2026-01-07' },
  'OPEN-QUESTIONS.md': { first: '2026-01-08', last: '2026-02-16' },
};

const plan = (texts, opts = {}) => lists.planListsToRecords(texts, { key: 'LF', dates: DATES, acknowledgeSensitive: true, ...opts });
const status = (record) => {
  const last = record.events.at(-1).type;
  return { created: 'N', triaged: 'T', closed: 'C' }[last];
};
const byId = (p) => new Map(p.records.map((r) => [r.record.id, r]));

describe('t3.1 — IDs, types, open statuses, old IDs (AC5.1, AC5.2, AC3.3, AC2.3)', () => {
  it('numbers KEY-1… in file order: BUGS, BACKLOG, ISSUES-INBOX, OPEN-QUESTIONS (AC5.1)', () => {
    const p = plan(corpus());
    expect(p.errors).toEqual([]);
    const ids = p.records.map((r) => r.record.id);
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => `LF-${i + 1}`));
    const files = p.records.map((r) => r.sourceRef.file);
    // file order holds across the whole list
    const order = files.map((f) => SOURCES.indexOf(f));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 8 bug rows; 9 backlog rows + the backlog's own non-item text; the inbox's
    // non-item text; 3 questions + the questions file's non-item text
    expect(files.filter((f) => f === 'BUGS.md')).toHaveLength(8);
    expect(files.filter((f) => f === 'BACKLOG.md')).toHaveLength(10);
    expect(files.filter((f) => f === 'ISSUES-INBOX.md')).toHaveLength(1);
    expect(files.filter((f) => f === 'OPEN-QUESTIONS.md')).toHaveLength(4);
  });

  it('types: BUGS → BUG, QUESTIONS → Q, BACKLOG by tag (roadmap → FEAT, hygiene → CHORE, untagged → FEAT) (AC3.3, D-M6E15-22)', () => {
    const p = byId(plan(corpus()));
    for (let n = 1; n <= 8; n++) expect(p.get(`LF-${n}`).record.type).toBe('BUG');
    // backlog rows LF-9 … LF-17, in file order
    expect(['LF-9', 'LF-10', 'LF-11'].map((id) => p.get(id).record.type)).toEqual(['FEAT', 'FEAT', 'FEAT']); // roadmap
    expect(['LF-12', 'LF-13', 'LF-14', 'LF-15'].map((id) => p.get(id).record.type)).toEqual(['CHORE', 'CHORE', 'CHORE', 'CHORE']); // hygiene
    expect(p.get('LF-16').record.title).toBe('Pantry toggle jumps between the top and bottom of the rail');
    expect(p.get('LF-16').record.type).toBe('FEAT'); // untagged
    expect(p.get('LF-17').record.type).toBe('CHORE'); // hygiene, led by a unit ID
    for (const id of ['LF-20', 'LF-21', 'LF-22']) expect(p.get(id).record.type).toBe('Q');
  });

  it('other existing backlog tags map as Signal’s own migration mapped them (product call → Q, fix lane → BUG, verification → CHORE)', () => {
    const backlog = [
      '# Backlog', '',
      '### A decision about plans · **product call** · small', 'Body.', '',
      '### A quick repair · **fix lane** · small', 'Body.', '',
      '### Check the exporter · **verification** · small', 'Body.', '',
    ].join('\n');
    const p = plan({ 'BACKLOG.md': backlog });
    expect(p.errors).toEqual([]);
    expect(p.records.map((r) => r.record.type)).toEqual(['Q', 'BUG', 'CHORE']);
  });

  it('ISSUES-INBOX entries are NEW at N', () => {
    const inbox = ['# Issues Inbox', '', '## A capture about exports', 'Something to look at.', ''].join('\n');
    const p = plan({ 'ISSUES-INBOX.md': inbox });
    expect(p.errors).toEqual([]);
    expect(p.records).toHaveLength(1);
    expect(p.records[0].record.type).toBe('NEW');
    expect(status(p.records[0].record)).toBe('N');
  });

  it('open BUG / FEAT / CHORE / Q are at T, each with a migration_note (D-M6E15-11)', () => {
    const p = byId(plan(corpus()));
    for (const id of ['LF-2', 'LF-3', 'LF-6', 'LF-7', 'LF-8', 'LF-9', 'LF-10', 'LF-14', 'LF-15', 'LF-16', 'LF-17']) {
      const { record } = p.get(id);
      expect(status(record), id).toBe('T');
      expect(record.events.map((e) => e.type), id).toEqual(['created', 'triaged']);
      expect(record.migration_note, id).toMatch(/\S/);
    }
  });

  it('keeps every old ID in legacy_id and prints it as the body’s first line (AC5.2)', () => {
    const p = byId(plan(corpus()));
    const expected = { 'LF-1': 'B1', 'LF-2': 'BUG-7', 'LF-9': '#310', 'LF-10': '#305', 'LF-14': '#244', 'LF-20': 'R3', 'LF-21': 'Issue #45', 'LF-22': 'NFR-04' };
    for (const [id, legacy] of Object.entries(expected)) {
      expect(p.get(id).record.legacy_id, id).toBe(legacy);
      expect(p.get(id).body.split('\n')[0], id).toBe(`Old ID: ${legacy}`);
    }
  });

  it('an entry with no old ID has no legacy_id (never a FILE:line stand-in, which an old-ID lookup would match)', () => {
    const p = byId(plan(corpus()));
    for (const id of ['LF-3', 'LF-4', 'LF-8', 'LF-15', 'LF-16', 'LF-17']) {
      expect(p.get(id).record.legacy_id, id).toBeUndefined();
      expect(p.get(id).body.startsWith('Old ID:'), id).toBe(false);
    }
  });

  it('a body holds its source text, after the old-ID line', () => {
    const p = byId(plan(corpus()));
    expect(p.get('LF-9').body).toBe([
      'Old ID: #310',
      '',
      '### #310 — Strategic: Lanternfly as a shared kitchen platform — household API + per-plan history · **roadmap** · large',
      'https://example.com/lanternfly/issues/310',
      'Move Lanternfly from a single-cook planner to a shared household tool: plans get a history, and other apps read them over an API. Spans several milestones.',
    ].join('\n'));
  });

  it('record and body paths sit under work/items/NN/ by number', () => {
    const p = byId(plan(corpus()));
    expect(p.get('LF-1').recordPath).toBe('.planning/work/items/00/LF-1.json');
    expect(p.get('LF-1').bodyPath).toBe('.planning/work/items/00/LF-1.md');
  });

  it('relative links in a body are rewritten for the body’s folder', () => {
    const backlog = ['# Backlog', '', '### #7 — Read the notes · **roadmap** · small', 'See [the notes](notes/plan.md).', ''].join('\n');
    const p = plan({ 'BACKLOG.md': backlog });
    expect(p.records[0].body).toContain('[the notes](../../../notes/plan.md)');
  });

  it('no key → throws; the migration path has no default key (AC2.3)', () => {
    expect(() => lists.planListsToRecords(corpus(), { dates: DATES })).toThrow(/key/);
    expect(() => lists.planListsToRecords(corpus(), { key: 'sig', dates: DATES })).toThrow(/key/);
  });
});
