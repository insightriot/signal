// M5.E2.S2.t5a — archive-tree wired into applyMigrate, with the EXTENDED snapshot.
//
// The load-bearing proof-of-fail (the whole reason this task exists): the
// archive-tree step rewrites REFERRER files (not just STATE.md). If a downstream
// gate aborts AFTER the archive rewrite, the surgical rollback must restore ALL
// touched files byte-identical — STATE.md AND every rewritten referrer AND the
// moved scaffold. The un-extended snapshot restores only STATE.md, leaving the
// rewritten referrer mutated on disk = a partial write, the exact data-loss class
// this Epic prevents. This test forces a downstream abort (an injected new
// dangling link → enforceNoDangling) after archive-tree has rewritten a referrer,
// and asserts the referrer is restored byte-identical. Against the un-extended
// snapshot set this assertion goes RED (the referrer stays mutated).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// A CONFORMANT + STAMPED STATE.md (no V1/V2/V3 work) so the migrate's only work is
// the archive-tree move + referrer rewrite — the referrer under test is NOTES.md,
// not STATE.md (STATE.md never links the scaffold, so it is never rewritten here).
const STATE_CONFORMANT =
  `---\nschema_version: 1\ndocs_layout_version: 2\nphase: SHIP\ncurrent_epic: M6.E2\n` +
  `current_tasks: []\ncompleted_phases:\n  - SHIP (2026-07-16)\nblockers: []\n---\n` +
  `# Project State\n\nlive pointer\n`;

const PLAN_BODY = '# M6.E1 plan\n\nContent that must survive verbatim.\n';
// NOTES.md is the REFERRER: it links the scaffold that archive-tree relocates, so
// archive-tree rewrites this file (not STATE.md).
const NOTES_BODY = 'Project notes. See [the plan](M6.E1-PLAN.md) for details.\n';

async function setup(dir) {
  const planning = join(dir, '.planning');
  await mkdir(planning, { recursive: true });
  await writeFile(join(planning, 'STATE.md'), STATE_CONFORMANT, 'utf-8');
  // M6.E1-RETROSPECTIVE.md = the closed-signal; scaffold M6.E1-PLAN.md moves.
  await writeFile(join(planning, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
  await writeFile(join(planning, 'M6.E1-PLAN.md'), PLAN_BODY, 'utf-8');
  await writeFile(join(planning, 'NOTES.md'), NOTES_BODY, 'utf-8');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

const read = (dir, rel) => readFile(join(dir, '.planning', rel), 'utf-8');

async function treeSnapshot(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== '.migrate') await walk(join(d, e.name));
      } else {
        out[join(d, e.name)] = await readFile(join(d, e.name), 'utf-8');
      }
    }
  }
  await walk(join(dir, '.planning'));
  return out;
}

describe('M5.E2.S2.t5a archive-tree wired into applyMigrate', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-arch-apply-'));
    await setup(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // --- THE LOAD-BEARING PROOF-OF-FAIL: extended-snapshot rollback --------------
  it('a downstream abort rolls back the REWRITTEN REFERRER byte-identical (not just STATE.md)', async () => {
    const notesBefore = await read(dir, 'NOTES.md');
    const stateBefore = await read(dir, 'STATE.md');

    // Injected scanner: clean baseline (call 1), then a NEW dangling link after
    // apply (call 2) → enforceNoDangling aborts + surgically rolls back. By this
    // point archive-tree has already MOVED the scaffold and REWRITTEN NOTES.md.
    let calls = 0;
    const scanDangling = async () => {
      calls += 1;
      return calls === 1
        ? []
        : [{ file: '.planning/STATE.md', link: 'GONE.md', target: 'GONE.md' }];
    };

    await expect(
      applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17', scanDangling }),
    ).rejects.toThrow(/dangling/i);

    // THE ASSERTION: the rewritten referrer is restored byte-identical. Against the
    // UN-EXTENDED snapshot (STATE.md only) this stays mutated (the archive link
    // rewrite) → RED. With the extended snapshot it is restored → GREEN.
    expect(await read(dir, 'NOTES.md')).toBe(notesBefore);
    // STATE.md is restored too (it was always snapshotted).
    expect(await read(dir, 'STATE.md')).toBe(stateBefore);
    // The moved scaffold is restored to its flat path; the archive dest is removed.
    expect(existsSync(join(dir, '.planning', 'M6.E1-PLAN.md'))).toBe(true);
    expect(await read(dir, 'M6.E1-PLAN.md')).toBe(PLAN_BODY);
    expect(existsSync(join(dir, '.planning', 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(false);
  });

  // --- clean apply: archive moves wire through the compose sequence -------------
  it('a clean apply moves the closed scaffold to archive/<m>/<e>/ + rewrites the referrer', async () => {
    const result = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(result.applied).toBe(true);
    // archive-tree is recorded as a first-class move.
    expect(result.moves.some((m) => m.vector === 'archive-tree')).toBe(true);

    // Scaffold relocated byte-identical; source gone.
    expect(existsSync(join(dir, '.planning', 'M6.E1-PLAN.md'))).toBe(false);
    expect(await read(dir, 'archive/M6/E1/M6.E1-PLAN.md')).toBe(PLAN_BODY);
    // Referrer link rewritten (POSIX `/`, relative to NOTES.md's dir).
    const notes = await read(dir, 'NOTES.md');
    expect(notes).toContain('[the plan](./archive/M6/E1/M6.E1-PLAN.md)');
    expect(notes).not.toContain('](M6.E1-PLAN.md)');
  });

  // --- idempotency (S1.t8 invariant): a second apply = zero file changes --------
  it('is idempotent — a second apply after archiving is a byte-identical no-op', async () => {
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    // Commit the first apply so the second runs on a clean tree.
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'migrate']);

    const before = await treeSnapshot(dir);
    const r2 = await applyMigrate(dir, { stamp: 'T2', dateStr: '2026-07-17' });
    const after = await treeSnapshot(dir);

    expect(r2.applied).toBe(false); // everything already archived — nothing to do
    expect(after).toEqual(before); // byte-identical: zero file changes
    expect(String(git(dir, ['status', '--porcelain'])).trim()).toBe('');
  });
});
