// M6.E13 t1.5 — the first real conversion of every live v1 item, as the
// cutover (t7.3) left it.
//
// Before the cutover this converted the live v1 store in memory with
// `tools/work-convert-dryrun.mjs`. After it the store is v2 and holds no v1
// item to convert, so the same facts are read from what the cutover left: its
// manifest, kept in the repository (`archive/pre-work-store-v2/MANIFEST.json`),
// and the live records. The v1 half and the dry-run tool were removed at
// t7.4 — they could not run again.
//
// Only the specific IDs PLAN Decision 11 and D-M6E13-13 name are pinned.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bodyPath, getRecord, listRecords, RELOCATED_V1_REL } from '../plugin/tools/lib/work-records.js';
import { REPO_ROOT } from './helpers/roots.js';

// PLAN Decision 11: the 6 fixed closes whose proof names a commit.
const CLOSE_REQUESTED = ['SIG-118', 'SIG-121', 'SIG-122', 'SIG-127', 'SIG-135', 'SIG-254'];
// D-M6E13-20: fixed with no commit → legacy, reason and proof text kept.
const NO_COMMIT_LEGACY = ['SIG-123', 'SIG-142', 'SIG-161'];
// D-M6E13-13: bodies that stated a status their item no longer has.
const CONTRADICTIONS = [
  'SIG-118', 'SIG-121', 'SIG-122', 'SIG-123', 'SIG-127', 'SIG-131', 'SIG-135', 'SIG-137', 'SIG-140', // closed
  'SIG-129', 'SIG-130', 'SIG-133', 'SIG-134', 'SIG-139', // triaged
];

describe('t1.5, after the cutover — the manifest the cutover kept, and the live records', () => {
  const STATUS_LINE = /^\*\*Status:\*\*\s*(needs-triage|confirmed|dismissed|fixed|triaged|open|untriaged)\b/m;
  const manifestPath = path.join(REPO_ROOT, RELOCATED_V1_REL, 'MANIFEST.json');
  const manifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'));
  const itemOf = (id) => manifest().items.find((i) => i.id === id);

  it('the cutover converted every v1 item with zero errors, and kept every v1 file', () => {
    expect(existsSync(manifestPath), 'the cutover manifest is kept in the repository').toBe(true);
    const m = manifest();
    expect(m.mode).toBe('apply');
    expect(m.summary.v1Files).toBeGreaterThan(0);
    expect(m.summary.records).toBe(m.summary.v1Files);
    expect(m.summary.errors).toBe(0);
    expect(m.verification.errors).toEqual([]);
    expect(m.items).toHaveLength(m.summary.v1Files);
    for (const i of m.items) {
      expect(i.errors, i.id).toEqual([]);
      expect(existsSync(path.join(REPO_ROOT, i.relocatedTo)), i.relocatedTo).toBe(true);
    }
  });

  it('every record validates and folds', () => {
    expect(listRecords(REPO_ROOT).broken).toEqual([]);
  });

  it('the six commit-proofed fixed closes were close_requested, and the cutover confirmed them', () => {
    const m = manifest();
    expect(m.closes.requested).toEqual(CLOSE_REQUESTED);
    expect(m.closes.confirmed).toEqual(CLOSE_REQUESTED);
    for (const id of CLOSE_REQUESTED) {
      const entry = m.nonLegacyCloses.find((c) => c.id === id);
      expect(entry, id).toMatchObject({ form: 'close_requested', proof: expect.stringMatching(/^[0-9a-f]{7,64}$/) });
      const events = getRecord(REPO_ROOT, id).record.events;
      expect(events.find((e) => e.type === 'close_requested').proof, id).toBe(entry.proof);
      expect(events.find((e) => e.type === 'closed' && e.by === 'confirmCloses'), id).toMatchObject({ reason: 'fixed', proof: entry.proof });
    }
  });

  it('145 legacy closes, the three no-commit ones among them', () => {
    const m = manifest();
    expect(m.summary.legacyCloses).toBe(145);
    expect(m.items.filter((i) => i.closeForm === 'legacy-no-commit').map((i) => i.id).sort()).toEqual([...NO_COMMIT_LEGACY].sort());
    for (const id of NO_COMMIT_LEGACY) expect(getRecord(REPO_ROOT, id).record.events.find((e) => e.type === 'closed').legacy, id).toBe(true);
  });

  it('SIG-137 closes as a dup with dup_of', () => {
    expect(manifest().nonLegacyCloses.find((c) => c.id === 'SIG-137')).toEqual({ id: 'SIG-137', form: 'dup', dup_of: 'SIG-112' });
    expect(getRecord(REPO_ROOT, 'SIG-137').record.events.find((e) => e.type === 'closed')).toMatchObject({ reason: 'dup', dup_of: 'SIG-112' });
  });

  it('no contradiction body still carries a status cell or a status statement', () => {
    for (const id of CONTRADICTIONS) {
      const i = itemOf(id);
      expect(i, id).toBeDefined();
      expect(i.cellsRemoved.length + i.statusLinesRemoved.length, id).toBeGreaterThan(0);
      const { record } = getRecord(REPO_ROOT, id);
      const body = readFileSync(path.join(REPO_ROOT, bodyPath(id)), 'utf8');
      expect(body, id).not.toMatch(new RegExp(`^\\|\\s*${record.legacy_id}\\s*\\|`, 'm'));
      expect(body, id).not.toMatch(STATUS_LINE);
    }
  });

  it('the largest B{n} legacy_id is at most the largest SIG-n', () => {
    const recs = listRecords(REPO_ROOT).records;
    const b = recs.map((r) => /^B(\d+)$/.exec(r.record.legacy_id ?? '')?.[1]).filter(Boolean).map(Number);
    const sig = recs.map((r) => Number(r.id.slice('SIG-'.length)));
    expect(b.length).toBeGreaterThan(0);
    expect(Math.max(...b)).toBeLessThanOrEqual(Math.max(...sig));
  });
});
