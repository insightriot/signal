// Tests for stub generation + backfill orchestration (M4.5.E9.S1.t9).
//
// FR4 / AC10-13.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  access,
  cp,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  enumerateEpicArtifacts,
  composeStub,
  backfillMilestone,
} from '../tools/backfill-retros.js';

const MILESTONE_FIXTURE = `# MILESTONE-4.5

### Status snapshot

| **Epic** | Status | Notes |
|---|---|---|
| E1 — Stranger-install path bulletproof | S1 shipped 2026-05-15; **S3–S5 ⏸ shelved 2026-05-24** | partial |
| E2 — \`/sig:add\` capture-and-route | S1 shipped 2026-05-14; S2–S5 pending | partial |
| **E3 — Public-facing docs rewrite** | **✓ shipped 2026-05-24** | full |
| E4 — Worked example | pending | |
| **E9 — Retro Foundations** | DISCUSS + PLAN done | in flight |
`;

// Helper: create a temp baseDir with a minimal Signal layout that the
// backfill module can operate on. Tests can then writeFile additional
// artifacts as needed.
async function makeTempBase() {
  const base = await mkdtemp(join(tmpdir(), 'signal-backfill-stub-'));
  await mkdir(join(base, '.planning'), { recursive: true });
  await mkdir(join(base, 'references'), { recursive: true });
  // Copy the real template so loadTemplate works.
  await cp(
    join(process.cwd(), 'references', 'retrospective-template.md'),
    join(base, 'references', 'retrospective-template.md'),
  );
  // Write the milestone fixture.
  await writeFile(
    join(base, '.planning', 'MILESTONE-4.5.md'),
    MILESTONE_FIXTURE,
  );
  return base;
}

describe('enumerateEpicArtifacts', () => {
  let base;
  beforeEach(async () => {
    base = await makeTempBase();
    // Seed some artifacts for E3.
    await writeFile(join(base, '.planning', 'M4.5.E3-PLAN.md'), 'plan');
    await writeFile(join(base, '.planning', 'M4.5.E3-REVIEW.md'), 'review');
    await writeFile(join(base, '.planning', 'M4.5.E3-PROGRESS.md'), 'p');
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('returns only artifacts that exist on disk', async () => {
    const result = await enumerateEpicArtifacts(base, 'M4.5.E3');
    const labels = result.map((a) => a.label);
    expect(labels).toContain('Plan');
    expect(labels).toContain('Review');
    expect(labels).toContain('Progress');
    // Doesn't claim VERIFICATION existed.
    expect(labels).not.toContain('Verification');
  });

  it('returns empty when an Epic has no artifacts', async () => {
    const result = await enumerateEpicArtifacts(base, 'M4.5.E99');
    expect(result).toEqual([]);
  });

  it('uses .planning/-relative paths in returned records', async () => {
    const result = await enumerateEpicArtifacts(base, 'M4.5.E3');
    for (const a of result) {
      expect(a.path).toMatch(/^\.planning\/M4\.5\.E3-/);
    }
  });
});

describe('composeStub', () => {
  let base;
  beforeEach(async () => {
    base = await makeTempBase();
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  it('renders a stub with FULL-tier headings and pre-filled Links section', async () => {
    const stub = await composeStub('M4.5.E3', {
      baseDir: base,
      partial: false,
      today: '2026-05-26',
      artifactPaths: [
        { label: 'Plan', path: '.planning/M4.5.E3-PLAN.md' },
        { label: 'Review', path: '.planning/M4.5.E3-REVIEW.md' },
      ],
      commitRange: { first: 'abc1234', last: 'def5678', count: 14, missing: false },
    });
    expect(stub).toContain('# M4.5.E3 Retrospective');
    expect(stub).toContain('Stub generated 2026-05-26');
    // FULL template headings all present.
    expect(stub).toContain('## Timeline');
    expect(stub).toContain('## What changed mid-flight');
    expect(stub).toContain('## Links');
    expect(stub).toContain('## Anti-rationalization moment');
    // Links pre-populated with artifacts + commit range.
    expect(stub).toContain('.planning/M4.5.E3-PLAN.md');
    expect(stub).toContain('.planning/M4.5.E3-REVIEW.md');
    expect(stub).toContain('abc1234..def5678');
    expect(stub).toContain('14 commits');
    // [FILL IN] markers remain in non-Links sections.
    expect(stub).toMatch(/## Timeline\n\n\[FILL IN/);
  });

  it('includes the partial-Epic header when partial=true', async () => {
    const stub = await composeStub('M4.5.E1', {
      baseDir: base,
      partial: true,
      today: '2026-05-26',
      artifactPaths: [],
      commitRange: null,
    });
    expect(stub).toMatch(/Epic incomplete as of backfill date 2026-05-26/);
    expect(stub).toMatch(/covers shipped slices only/);
  });

  it('omits the partial-Epic header when partial=false', async () => {
    const stub = await composeStub('M4.5.E3', {
      baseDir: base,
      partial: false,
      today: '2026-05-26',
      artifactPaths: [],
      commitRange: null,
    });
    expect(stub).not.toMatch(/Epic incomplete/);
  });

  it('passes validateRetroContent for FULL tier', async () => {
    const stub = await composeStub('M4.5.E3', {
      baseDir: base,
      partial: false,
      today: '2026-05-26',
      artifactPaths: [
        { label: 'Plan', path: '.planning/M4.5.E3-PLAN.md' },
        { label: 'Review', path: '.planning/M4.5.E3-REVIEW.md' },
        { label: 'Progress', path: '.planning/M4.5.E3-PROGRESS.md' },
      ],
      commitRange: { first: 'aaa', last: 'bbb', count: 10, missing: false },
    });
    const { validateRetroContent } = await import(
      '../tools/lib/retrospective.js'
    );
    const result = validateRetroContent(stub, 'FULL');
    expect(
      result.valid,
      `errors=${JSON.stringify(result.errors)}`,
    ).toBe(true);
  });
});

describe('backfillMilestone (orchestration + idempotency)', () => {
  let base;
  beforeEach(async () => {
    base = await makeTempBase();
  });
  afterEach(async () => await rm(base, { recursive: true, force: true }));

  // Stub commitRangeForEpic via opts to keep tests fast + git-free.
  const fakeRunGit = (args) => {
    // Always return a small canned log so backfill can compute a range.
    return 'aaa1111 fixture commit one\nbbb2222 fixture commit two\n';
  };

  it('generates stubs for all enumerated Epics (AC10)', async () => {
    const result = await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
    });
    expect(result.map((r) => r.epicId).sort()).toEqual([
      'M4.5.E1',
      'M4.5.E2',
      'M4.5.E3',
    ]); // M4.5.E6/E7 not in our fixture (table only has E1-E4 + E9)
    expect(result.every((r) => r.status === 'written')).toBe(true);

    // Files exist on disk.
    for (const r of result) {
      await access(join(base, r.path));
    }
  });

  it("artifact links in stubs resolve to real files (AC11)", async () => {
    // Seed an artifact for E3.
    await writeFile(join(base, '.planning', 'M4.5.E3-PLAN.md'), 'plan');
    await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
    });
    const stub = await readFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      'utf-8',
    );
    // The stub's Plan link points at .planning/M4.5.E3-PLAN.md (which exists).
    expect(stub).toContain('.planning/M4.5.E3-PLAN.md');
    // And that file exists.
    await access(join(base, '.planning', 'M4.5.E3-PLAN.md'));
  });

  it('is idempotent — re-runs skip files that already exist (AC12)', async () => {
    await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
    });
    const result2 = await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
    });
    expect(result2.every((r) => r.status === 'skipped')).toBe(true);
    expect(result2.every((r) => /exists/.test(r.reason ?? ''))).toBe(true);
  });

  it("preserves edited retro files even on --force (AC13)", async () => {
    // First pass writes stubs.
    await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
    });
    // Simulate a user editing the E3 stub — add lots of content, no [FILL IN].
    const editedRetro = `# M4.5.E3 Retrospective — completed!

## Timeline

Real timeline content here. ${'Lots of substantive prose. '.repeat(40)}

## What changed mid-flight

${'Substantive content. '.repeat(20)}

## What assumptions broke

${'Substantive. '.repeat(20)}

## What surprised us

${'Substantive. '.repeat(20)}

## What we'd do differently

${'Substantive. '.repeat(20)}

## What to feed back into Signal

${'Substantive. '.repeat(20)}

## Anti-rationalization moment

${'Substantive. '.repeat(20)}

## Links

${'Substantive. '.repeat(20)}
`;
    await writeFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      editedRetro,
    );

    // Force re-run.
    const result = await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
      force: true,
    });
    const e3 = result.find((r) => r.epicId === 'M4.5.E3');
    expect(e3.status).toBe('skipped');
    expect(e3.reason).toMatch(/edited|user content/i);

    // Verify edited content survived.
    const onDisk = await readFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      'utf-8',
    );
    expect(onDisk).toContain('completed!');
  });

  it('respects --dry-run by returning planned writes without touching disk', async () => {
    const result = await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
      dryRun: true,
    });
    expect(result.every((r) => r.status === 'planned')).toBe(true);
    expect(result.every((r) => typeof r.content === 'string' && r.content.length > 0)).toBe(true);
    // Files should NOT exist on disk after dry-run.
    for (const r of result) {
      let existed = false;
      try {
        await access(join(base, r.path));
        existed = true;
      } catch {}
      expect(existed).toBe(false);
    }
  });

  it('flags partial Epics in stub header (E1, E2)', async () => {
    await backfillMilestone(base, 'M4.5', {
      currentEpicId: 'M4.5.E9',
      runGit: fakeRunGit,
      today: '2026-05-26',
    });
    const e1 = await readFile(
      join(base, '.planning', 'M4.5.E1-RETROSPECTIVE.md'),
      'utf-8',
    );
    const e2 = await readFile(
      join(base, '.planning', 'M4.5.E2-RETROSPECTIVE.md'),
      'utf-8',
    );
    const e3 = await readFile(
      join(base, '.planning', 'M4.5.E3-RETROSPECTIVE.md'),
      'utf-8',
    );
    expect(e1).toMatch(/Epic incomplete/);
    expect(e2).toMatch(/Epic incomplete/);
    expect(e3).not.toMatch(/Epic incomplete/);
  });
});
