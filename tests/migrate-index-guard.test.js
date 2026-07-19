// M5.E3 REVIEW — B19: applyMigrate's tail INDEX regen must not clobber a foreign /
// pre-v3-format curated INDEX the new-format parser can't read, and the dry-run must
// enumerate the regen step it performs (release-gating trust parity). The stamp-null
// nullfix makes migrate fire on EVERY external project, so a foreign INDEX is now the
// default-path risk, not an edge.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate, renderDryRun } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// A needsV3 (stamp 1 < CURRENT) but otherwise-conformant STATE — reaches the tail
// INDEX regen. BACKLOG present + no FUTURE-IDEAS + no DECISIONS → the only v3 work is
// the stamp; the tail regeneratePlanningIndex is exactly what we guard.
const STATE_V1 =
  `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
  `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n# Project State\n\nlive pointer\n`;

// A FOREIGN / pre-v3-format curated INDEX: no `**Tier legend:**` block, no Live/Cold/
// ledger sections → parseExistingAnnotations yields zero annotations AND legend null.
// Regenerating would CLOBBER it (B19).
const FOREIGN_INDEX = `# My Planning Index\n\n- Sprint 1 — shipped\n- Sprint 2 — in progress\n- notes: see the wiki\n`;

async function plantRepo({ index = null } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'b19-'));
  const p = join(dir, '.planning');
  await mkdir(p, { recursive: true });
  await writeFile(join(p, 'STATE.md'), STATE_V1, 'utf-8');
  await writeFile(join(p, 'BACKLOG.md'), '# Backlog\n', 'utf-8');
  if (index !== null) await writeFile(join(p, 'INDEX.md'), index, 'utf-8');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

describe('B19 — applyMigrate INDEX regen guard (no foreign clobber)', () => {
  const dirs = [];
  const track = (d) => { dirs.push(d); return d; };
  afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

  it('leaves a non-empty foreign-format INDEX intact and flags it (no clobber)', async () => {
    const dir = track(await plantRepo({ index: FOREIGN_INDEX }));
    const res = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-19' });
    expect(res.applied).toBe(true);
    // The curated foreign INDEX is UNTOUCHED — not overwritten with the new format.
    expect(await readFile(join(dir, '.planning', 'INDEX.md'), 'utf-8')).toBe(FOREIGN_INDEX);
    // …and the skip is surfaced (a warning the user can act on via /sig:index).
    expect(
      res.warnings.some((w) => /INDEX\.md/.test(w) && /foreign|left intact|not regenerated/i.test(w)),
    ).toBe(true);
  });

  it('regenerates INDEX when absent (a portable new-format INDEX is written normally)', async () => {
    const dir = track(await plantRepo({ index: null }));
    const res = await applyMigrate(dir, { stamp: 'T2', dateStr: '2026-07-19' });
    expect(res.applied).toBe(true);
    // With no pre-existing INDEX, the tail regen writes the new-format map.
    const idx = await readFile(join(dir, '.planning', 'INDEX.md'), 'utf-8');
    expect(idx).toContain('Documentation Map'); // Signal HEADER signature
    // No foreign-skip warning on the normal path.
    expect(res.warnings.some((w) => /INDEX\.md/.test(w) && /foreign/i.test(w))).toBe(false);
  });
});

describe('B19 — dry-run parity: needsV3 preview enumerates the INDEX regen step', () => {
  const dirs = [];
  const track = (d) => { dirs.push(d); return d; };
  afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

  it('renderDryRun on a v3-pending project shows the INDEX regen the apply performs', async () => {
    const dir = track(await plantRepo({ index: null }));
    const out = await renderDryRun(dir);
    expect(out).toMatch(/INDEX\.md.*regenerat/i);
  });
});
