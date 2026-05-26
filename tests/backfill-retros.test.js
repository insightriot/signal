// Tests for tools/backfill-retros.js — Epic enumeration + commit-range scan.
// M4.5.E9.S1.t8.
//
// Stub-generation tests (FR4 AC10-13) land in S1.t9, not here.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseEpicStatuses,
  enumerateEpics,
  commitRangeForEpic,
} from '../tools/backfill-retros.js';

// ---- Fixture: a minimal MILESTONE-4.5.md status snapshot table.
// Mirrors the real file's column shape so the parser is exercised against
// the actual convention. Other prose / sections omitted — the parser
// should only match `| E{N} ... |` table rows.
const M45_STATUS_TABLE = `# MILESTONE-4.5 — Release Hardening

(prose...)

### Status snapshot

| **Epic** | Status | Notes |
|---|---|---|
| E1 — Stranger-install path bulletproof | S1 shipped 2026-05-15 (v0.1.1); **S2 Phase A shipped 2026-05-19 (outcome a — Phase B not needed)**; **S3–S5 ⏸ shelved 2026-05-24** | F2 resolved as outcome (a); R1 row of install-verification matrix complete. |
| E2 — \`/sig:add\` capture-and-route | S1 shipped 2026-05-14; S2–S5 pending | Hot path done. |
| **E3 — Public-facing docs rewrite** | **✓ shipped 2026-05-24 (v0.1.3 candidate)** | 2 slices, 10 tasks. |
| E4 — Worked example + comparison page | pending | |
| E5 — External validation + launch | pending | Cannot finish until E1–E4 land |
| **E6 — Resume reliability** | **✓ shipped 2026-05-18 (v0.1.2)** | All 5 slices + S6 REVIEW loop-back. |
| **E7 — Synthesizer prose-quality + install-UX hardening** | **✓ shipped 2026-05-23 (v0.1.3 candidate)** | DISCUSS + PLAN closed; EXECUTE 2026-05-22 → 2026-05-23. |
| **E8 — \`/sig:doctor\` install-state diagnostician + reframe** | **pending — scoped 2026-05-24** | Sequenced before E5 launch. |
| **E9 — Retro Foundations** | DISCUSS + PLAN done 2026-05-25; EXECUTE in flight | Active Epic — own retro from S1.t12. |

### M4.5.E1 — Stranger-install path bulletproof

(more prose, headers, etc.)
`;

describe('parseEpicStatuses (pure function)', () => {
  it('returns correct enumerated set for M4.5, excluding the current Epic', () => {
    const result = parseEpicStatuses(M45_STATUS_TABLE, {
      milestonePrefix: 'M4.5',
      currentEpicId: 'M4.5.E9',
    });

    const ids = result.map((e) => e.epicId);
    expect(ids).toEqual(['M4.5.E1', 'M4.5.E2', 'M4.5.E3', 'M4.5.E6', 'M4.5.E7']);
    // Explicitly excludes the pending ones (E4, E5, E8) and the current one (E9).
    expect(ids).not.toContain('M4.5.E4');
    expect(ids).not.toContain('M4.5.E5');
    expect(ids).not.toContain('M4.5.E8');
    expect(ids).not.toContain('M4.5.E9');
  });

  it('flags partial Epics (some slices shipped, others pending/shelved)', () => {
    const result = parseEpicStatuses(M45_STATUS_TABLE, {
      milestonePrefix: 'M4.5',
      currentEpicId: 'M4.5.E9',
    });
    const byId = Object.fromEntries(result.map((e) => [e.epicId, e]));

    // E1 has shipped slices + shelved slices → partial.
    expect(byId['M4.5.E1'].partial).toBe(true);
    // E2 has S1 shipped + S2-S5 pending → partial.
    expect(byId['M4.5.E2'].partial).toBe(true);
    // E3, E6, E7 are fully shipped → not partial.
    expect(byId['M4.5.E3'].partial).toBe(false);
    expect(byId['M4.5.E6'].partial).toBe(false);
    expect(byId['M4.5.E7'].partial).toBe(false);
  });

  it('throws if milestonePrefix is missing', () => {
    expect(() =>
      parseEpicStatuses(M45_STATUS_TABLE, { currentEpicId: null }),
    ).toThrow(/milestonePrefix/);
  });

  it('returns empty array when no Epic rows match', () => {
    const noEpics = `# MILESTONE-x

| Header | Status |
|---|---|
| Foo | shipped |
| Bar | pending |
`;
    const result = parseEpicStatuses(noEpics, {
      milestonePrefix: 'M4.5',
      currentEpicId: null,
    });
    expect(result).toEqual([]);
  });

  it('includes all shipped Epics when currentEpicId is null', () => {
    const result = parseEpicStatuses(M45_STATUS_TABLE, {
      milestonePrefix: 'M4.5',
      currentEpicId: null,
    });
    // E9 is "in flight" — has "DISCUSS + PLAN done" but no "shipped" marker on
    // any slice → still excluded as having no shipped portion.
    expect(result.map((e) => e.epicId)).not.toContain('M4.5.E9');
  });
});

describe('enumerateEpics (filesystem-backed)', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-backfill-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads MILESTONE-{N}.md from .planning/ and enumerates', async () => {
    await writeFile(
      join(tempDir, '.planning', 'MILESTONE-4.5.md'),
      M45_STATUS_TABLE,
    );
    const result = await enumerateEpics(tempDir, 'M4.5', 'M4.5.E9');
    expect(result.length).toBe(5);
    expect(result[0].epicId).toBe('M4.5.E1');
  });

  it('derives MILESTONE filename from prefix correctly', async () => {
    // Verify "M4.5" → "MILESTONE-4.5.md" (strip leading M)
    const minimalContent = `| **E1 — foo** | shipped | |\n`;
    await writeFile(
      join(tempDir, '.planning', 'MILESTONE-4.5.md'),
      minimalContent,
    );
    const result = await enumerateEpics(tempDir, 'M4.5', null);
    expect(result.length).toBe(1);
    expect(result[0].epicId).toBe('M4.5.E1');
  });
});

describe('commitRangeForEpic (dependency-injected)', () => {
  it('returns first + last + count from grep convention', () => {
    const fakeGit = (args) => {
      // Verify the grep pattern includes escaped Epic ID.
      expect(args).toContain('--grep=^M4\\.5\\.E3');
      // Note: actual git log --reverse returns oldest first.
      return [
        'aaa111 M4.5.E3 DISCUSS: 9 decisions locked',
        'bbb222 M4.5.E3.S1.t1: TDD red',
        'ccc333 M4.5.E3 SHIP: Epic closed',
      ].join('\n') + '\n';
    };

    const result = commitRangeForEpic('M4.5.E3', { runGit: fakeGit });
    expect(result.first).toBe('aaa111');
    expect(result.last).toBe('ccc333');
    expect(result.count).toBe(3);
    expect(result.missing).toBe(false);
  });

  it('returns missing=true when grep finds nothing', () => {
    const fakeGit = () => '';
    const result = commitRangeForEpic('M4.5.E9', { runGit: fakeGit });
    expect(result.first).toBe(null);
    expect(result.last).toBe(null);
    expect(result.count).toBe(0);
    expect(result.missing).toBe(true);
  });

  it('handles a single-commit Epic correctly', () => {
    // Note: hash must be valid hex to satisfy subject-line filter (added in
    // S1.t9 regression). Git always emits hex; this aligns the fixture.
    const fakeGit = () => 'abc1234 M4.5.E5.S1.t1: only commit\n';
    const result = commitRangeForEpic('M4.5.E5', { runGit: fakeGit });
    expect(result.first).toBe('abc1234');
    expect(result.last).toBe('abc1234');
    expect(result.count).toBe(1);
    expect(result.missing).toBe(false);
  });

  it('escapes Epic ID dots in the grep pattern', () => {
    let capturedArgs = null;
    const fakeGit = (args) => {
      capturedArgs = args;
      return '';
    };
    commitRangeForEpic('M4.5.E1', { runGit: fakeGit });
    // The dots must be escaped so the grep doesn't match other Epic IDs
    // (without escapes, `M4.5.E1` would match `M4X5XE1` per regex semantics).
    expect(capturedArgs.some((a) => a === '--grep=^M4\\.5\\.E1')).toBe(true);
  });

  it('runs against actual Signal commit history for M4.5.E3 (smoke)', () => {
    // Integration smoke — uses real git. E3 is fully shipped per CONTEXT.md
    // and should have multiple commits matching the convention.
    const result = commitRangeForEpic('M4.5.E3');
    expect(result.missing).toBe(false);
    expect(result.count).toBeGreaterThan(5);
    // Both first and last should be 7-40 char hex hashes.
    expect(result.first).toMatch(/^[0-9a-f]{7,40}$/);
    expect(result.last).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('filters by subject-line only, not commit body (regression)', () => {
    // git log --grep matches the full message. A commit whose subject
    // starts with M4.5.E7 but whose body mentions "M4.5.E2 precedent..."
    // should NOT be attributed to E2. Surfaced in the M4.5.E9 dry-run.
    const fakeGit = () =>
      [
        'aaa1111 M4.5.E2.S1: real E2 commit',
        'bbb2222 M4.5.E7.S1.t10: subject is E7 but body mentions M4.5.E2',
        'ccc3333 M4.5.E2 SHIP: real E2 close',
      ].join('\n') + '\n';
    const result = commitRangeForEpic('M4.5.E2', { runGit: fakeGit });
    // Only the two E2-subject commits should be counted.
    expect(result.count).toBe(2);
    expect(result.first).toBe('aaa1111');
    expect(result.last).toBe('ccc3333');
  });
});
