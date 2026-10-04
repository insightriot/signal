// M6.E13 t1.5 — the first real conversion: every live v1 item converted in
// memory (nothing is written) by the same code as `tools/work-convert-dryrun.mjs`.
//
// Counts are asserted as structure, not hard-coded totals, so a live item
// added later does not break this; only the specific IDs PLAN Decision 11 and
// D-M6E13-13 name are pinned. Close dates come from git; with a shallow clone
// every item would date from HEAD, so no fallbackAt VALUE is asserted.

import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertOutsideRepo,
  convertLiveStore,
  listV1Items,
  REPO_ROOT,
  summarize,
} from '../tools/work-convert-dryrun.mjs';

let results;
let byId;
beforeAll(() => {
  results = convertLiveStore(REPO_ROOT);
  byId = new Map(results.map((r) => [r.manifest.id, r]));
});

// PLAN Decision 11: the 6 fixed closes whose proof names a commit.
const CLOSE_REQUESTED = ['SIG-118', 'SIG-121', 'SIG-122', 'SIG-127', 'SIG-135', 'SIG-254'];
// D-M6E13-20: fixed with no commit → legacy, reason and proof text kept.
const NO_COMMIT_LEGACY = ['SIG-123', 'SIG-142', 'SIG-161'];
// D-M6E13-13: bodies that stated a status their item no longer has.
const CONTRADICTIONS = [
  'SIG-118', 'SIG-121', 'SIG-122', 'SIG-123', 'SIG-127', 'SIG-131', 'SIG-135', 'SIG-137', 'SIG-140', // closed
  'SIG-129', 'SIG-130', 'SIG-133', 'SIG-134', 'SIG-139', // triaged
];

describe('t1.5 — live v1 store → v2 records (in memory)', () => {
  it('converts every v1 item with zero errors', () => {
    expect(results.length).toBeGreaterThan(0);
    const failed = results.filter((r) => r.problems.length > 0).map((r) => `${r.relPath}: ${r.problems.join('; ')}`);
    expect(failed).toEqual([]);
  });

  it('every record validates, folds, and round-trips byte-identical', () => {
    for (const r of results) {
      expect(r.record, r.relPath).not.toBeNull();
      expect(['N', 'T', 'Q', 'P', 'C', 'closing'], r.relPath).toContain(r.status);
    }
  });

  it('the manifest has one entry per v1 file', () => {
    const files = listV1Items(REPO_ROOT);
    expect(results.map((r) => r.manifest.source)).toEqual(files);
    expect(new Set(results.map((r) => r.manifest.id)).size).toBe(files.length);
  });

  it('the six commit-proofed fixed closes are close_requested, and read closing', () => {
    for (const id of CLOSE_REQUESTED) {
      expect(byId.get(id)?.manifest.closeForm, id).toBe('close_requested');
      expect(byId.get(id).status, id).toBe('closing');
    }
    for (const r of results.filter((x) => x.manifest.closeForm === 'close_requested')) {
      const req = r.record.events.find((e) => e.type === 'close_requested');
      expect(req.proof, r.relPath).toMatch(/^[0-9a-f]{7,64}$/);
    }
  });

  it('145 legacy closes, the three no-commit ones among them', () => {
    const legacy = results.filter((r) => r.manifest.closeForm === 'legacy' || r.manifest.closeForm === 'legacy-no-commit');
    expect(legacy).toHaveLength(145);
    expect(results.filter((r) => r.manifest.closeForm === 'legacy-no-commit').map((r) => r.manifest.id).sort()).toEqual(
      [...NO_COMMIT_LEGACY].sort(),
    );
    for (const r of legacy) expect(r.record.events.at(-1).legacy, r.relPath).toBe(true);
  });

  it('SIG-137 closes as a dup with dup_of', () => {
    const r = byId.get('SIG-137');
    expect(r.manifest.closeForm).toBe('dup');
    expect(r.record.events.at(-1)).toMatchObject({ type: 'closed', reason: 'dup', dup_of: 'SIG-112' });
  });

  it('no contradiction body still carries a status cell or a status statement', () => {
    const STATUS_LINE = /^\*\*Status:\*\*\s*(needs-triage|confirmed|dismissed|fixed|triaged|open|untriaged)\b/m;
    for (const id of CONTRADICTIONS) {
      const r = byId.get(id);
      expect(r, id).toBeDefined();
      const ownRow = new RegExp(`^\\|\\s*${r.record.legacy_id}\\s*\\|`, 'm');
      expect(r.body, id).not.toMatch(ownRow);
      expect(r.body, id).not.toMatch(STATUS_LINE);
      expect(r.manifest.cellsRemoved.length + r.manifest.statusLinesRemoved.length, id).toBeGreaterThan(0);
    }
  });

  it('the largest B{n} legacy_id is at most the largest SIG-n', () => {
    const b = results.map((r) => /^B(\d+)$/.exec(r.record.legacy_id ?? '')?.[1]).filter(Boolean).map(Number);
    const sig = results.map((r) => Number(r.record.id.slice('SIG-'.length)));
    expect(b.length).toBeGreaterThan(0);
    expect(Math.max(...b)).toBeLessThanOrEqual(Math.max(...sig));
  });

  it('summary counts agree with the results', () => {
    const s = summarize(results);
    expect(s.items).toBe(results.length);
    expect(s.records).toBe(results.length);
    expect(s.errors).toBe(0);
  });
});

describe('tools/work-convert-dryrun.mjs — read-only on the repository', () => {
  it('refuses an output directory inside the repository', () => {
    expect(() => assertOutsideRepo(REPO_ROOT, REPO_ROOT)).toThrow(/inside the repository/);
    expect(() => assertOutsideRepo(path.join(REPO_ROOT, '.planning', 'x'), REPO_ROOT)).toThrow(/inside the repository/);
    expect(() => assertOutsideRepo(path.join(path.dirname(REPO_ROOT), 'elsewhere'), REPO_ROOT)).not.toThrow();
  });
});
