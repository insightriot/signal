// M5.E2 REVIEW (security MEDIUM) — realpath path-confinement against a checked-in
// DIRECTORY symlink escape.
//
// The write/move gateways confine with a LEXICAL guard
// (`resolve(destAbs).startsWith(planningRoot + sep)`) that normalizes `..` but
// does NOT follow symlinks. git tracks symlinks (mode 120000), so a hostile repo
// can ship `.planning/archive` (or `.planning` itself) as a directory symlink
// pointing OUT of the tree. The lexical guard passes on the POSIX dest while the
// real `mkdir → atomicWrite → rm(src)` follows the link OUT of the tree: an
// attacker-controlled write lands outside `.planning/` AND the in-tree source is
// deleted (integrity loss). These tests prove the escape RED against the lexical
// guard, then GREEN once the realpath re-assert refuses (fail closed → the Batch 1
// rollback wrap undoes the run).
//
// Carve-out preserved (NOT under test as an escape): a LEAF-file symlink is safe —
// atomicWrite renames a tmp file over the leaf, never following it. Only DIRECTORY
// symlinks (and `.planning` itself) escape; the fix anchors on the dest DIRECTORY.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate, relocateFaithful, BYTE } from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// Conformant + stamped STATE.md (no V1/V2/V3 work) so the migrate's ONLY work is the
// archive-tree move of the closed-Epic scaffold — that isolates the confinement
// gateway under test. Mirrors migrate-archive-apply.test.js.
const STATE_CONFORMANT =
  `---\nschema_version: 1\ndocs_layout_version: 2\nphase: SHIP\ncurrent_epic: M6.E2\n` +
  `current_tasks: []\ncompleted_phases:\n  - SHIP (2026-07-16)\nblockers: []\n---\n` +
  `# Project State\n\nlive pointer\n`;
const PLAN_BODY = '# M6.E1 plan\n\nContent that must survive verbatim.\n';
const NOTES_BODY = 'Project notes. See [the plan](M6.E1-PLAN.md) for details.\n';

// Write the four canonical planning docs (STATE + a CLOSED Epic: retro + scaffold +
// a referrer) into `planning`. M6.E1-RETROSPECTIVE.md = the closed-signal; the
// M6.E1-PLAN.md scaffold is what archive-tree relocates.
async function writePlanningDocs(planning) {
  await writeFile(join(planning, 'STATE.md'), STATE_CONFORMANT, 'utf-8');
  await writeFile(join(planning, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
  await writeFile(join(planning, 'M6.E1-PLAN.md'), PLAN_BODY, 'utf-8');
  await writeFile(join(planning, 'NOTES.md'), NOTES_BODY, 'utf-8');
}

function initGit(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

describe('M5.E2 REVIEW — realpath confinement refuses a directory-symlink escape', () => {
  let dir;
  let outside;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-symlink-confine-'));
    // A real, EMPTY sibling dir OUTSIDE the repo — the attacker's escape target.
    outside = await mkdtemp(join(tmpdir(), 'signal-symlink-escape-target-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  // --- THE PASTE-WORTHY PROOF-OF-FAIL: `.planning/archive` = a dir symlink -------
  it('refuses when .planning/archive is a directory symlink pointing OUT of the repo (no escape, no source deletion)', async () => {
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await writePlanningDocs(planning);
    // The hostile artifact: .planning/archive is a checked-in DIRECTORY symlink to
    // an out-of-repo dir. deriveEpicArchiveDir → .planning/archive/M6/E1/… , so the
    // move's mkdir/atomicWrite/rm all traverse this link.
    await symlink(outside, join(planning, 'archive'));
    initGit(dir);

    const inTreeSource = join(planning, 'M6.E1-PLAN.md');

    let threw = false;
    try {
      await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    } catch {
      threw = true;
    }

    // fs-state assertions FIRST so a RED run surfaces the escape concretely:
    //   - RED (lexical guard): source deleted → existsSync false → this fails.
    expect(existsSync(inTreeSource)).toBe(true); // in-tree source NOT deleted
    //   - RED: the scaffold escaped into the symlink target dir → readdir non-empty.
    expect(await readdir(outside)).toEqual([]); // NOTHING written outside the tree
    //   - RED: the lexical guard let the apply proceed → threw stays false.
    expect(threw).toBe(true); // the apply REFUSED (threw + rolled back)
  });

  // --- `.planning` ITSELF is a symlink to a dir outside the repo -----------------
  // Content already lives at the target, so RED is "no refusal" (the migrate
  // proceeds + moves the scaffold, deleting the source), GREEN is a clean refuse.
  it('refuses when .planning itself is a symlink pointing OUT of the repo', async () => {
    // Full planning content lives in the OUTSIDE dir; the repo only holds the
    // .planning symlink to it.
    await writePlanningDocs(outside);
    await symlink(outside, join(dir, '.planning'));
    initGit(dir);

    const scaffoldAtTarget = join(outside, 'M6.E1-PLAN.md');

    let threw = false;
    try {
      await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    } catch {
      threw = true;
    }

    // RED (lexical guard): the migrate proceeds and MOVES the scaffold into
    // <outside>/archive/… , deleting <outside>/M6.E1-PLAN.md → existsSync false.
    expect(existsSync(scaffoldAtTarget)).toBe(true); // source scaffold intact
    expect(threw).toBe(true); // the apply REFUSED a symlinked planning root
  });

  // --- IMPORTANT-1 (M5.E3 REVIEW): the MINIMAL needsV3 path had NO realpath check ---
  // The .planning-symlink case above is caught only because a closed-Epic scaffold
  // triggers the archive vector, whose relocateFaithful/applyArchiveTree runs
  // assertRealInsidePlanning. A minimal needsV3 run (de-prose/stamp STATE + BACKLOG-
  // create, NO scaffold, empty archiveMoveMap) never touches that gateway → before the
  // fix the tail STATE/BACKLOG/INDEX writes followed the symlink OUT of the repo with
  // no check. The stamp-null nullfix makes migrate fire on every external project, so
  // this is the stranger-adoption symlink case. An UNCONDITIONAL planning-root realpath
  // assert before the first write closes it.
  it('refuses a minimal needsV3 run (no vector) when .planning is a symlink OUT of the repo', async () => {
    // stamp 1 → needsV3; conformant + no scaffold + no BACKLOG → the ONLY work is the
    // de-prose/stamp + BACKLOG-create, which never hits the archive/relocate gateway.
    const STATE_V3_PENDING =
      `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M6.E2\n` +
      `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-16)\nblockers: []\n---\n# Project State\n\nlive pointer\n`;
    await writeFile(join(outside, 'STATE.md'), STATE_V3_PENDING, 'utf-8');
    await symlink(outside, join(dir, '.planning'));
    initGit(dir);

    const stateBefore = await readFile(join(outside, 'STATE.md'), 'utf-8');

    let threw = false;
    try {
      await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    } catch {
      threw = true;
    }

    // RED (no realpath check on the minimal path): the migrate writes BACKLOG.md +
    // INDEX.md into the symlink target and stamps STATE — all three fail.
    expect(threw).toBe(true); // refused before any write
    expect(existsSync(join(outside, 'BACKLOG.md'))).toBe(false); // nothing created outside
    expect(existsSync(join(outside, 'INDEX.md'))).toBe(false);
    expect(await readFile(join(outside, 'STATE.md'), 'utf-8')).toBe(stateBefore); // STATE untouched
  });

  // --- UNIT: relocateFaithful (the migrate-memory.js gateway) refuses directly ---
  it('relocateFaithful refuses a dest whose parent dir escapes via a symlink', async () => {
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await symlink(outside, join(planning, 'archive'));
    const destAbs = join(planning, 'archive', 'M9', 'E1', 'STATE-NARRATIVE.md');

    let threw = false;
    try {
      await relocateFaithful({ sourceText: 'hostile', destAbs, baseDir: dir, mode: BYTE });
    } catch {
      threw = true;
    }

    // RED (lexical guard): the write followed the link → outside gets the file.
    expect(await readdir(outside)).toEqual([]); // nothing escaped
    expect(threw).toBe(true); // refused
  });

  // --- NO FALSE REFUSAL: a normal (non-symlink) apply still archives + is idempotent
  it('a normal apply (no symlink) still moves the scaffold and is idempotent', async () => {
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await writePlanningDocs(planning);
    initGit(dir);

    const r1 = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r1.applied).toBe(true);
    expect(r1.moves.some((m) => m.vector === 'archive-tree')).toBe(true);
    // Scaffold relocated byte-identical into the REAL archive dir; source gone.
    expect(existsSync(join(planning, 'M6.E1-PLAN.md'))).toBe(false);
    expect(await readFile(join(planning, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'), 'utf-8')).toBe(PLAN_BODY);

    // Idempotency: commit the first apply, then a second apply is a no-op.
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'migrate']);
    const r2 = await applyMigrate(dir, { stamp: 'T2', dateStr: '2026-07-17' });
    expect(r2.applied).toBe(false);
    expect(String(git(dir, ['status', '--porcelain'])).trim()).toBe('');
  });
});
