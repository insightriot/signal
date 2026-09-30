// REVIEW pass 2, P2-I4 / D-M6E11-33 — an Epic's root artifacts move into its
// folder when the folder is created.
//
// Before: an Epic that had `.planning/{EpicID}-*.md` artifacts got a folder
// the first time an item moved in, and from then on "what is in this Epic"
// was two places — and `closeEpic` archived only the folder, leaving the root
// artifacts behind. Now the first `moveItem` into an Epic moves them in with
// it (git mv when tracked), rewrites links in and out, and rewinds all of it
// on failure. `closeEpic` refuses while any are still at the root.
//
// Two root artifacts stay where they are, on purpose: `{EpicID}-RETROSPECTIVE.md`
// (SHIP's retrospective gate, `deriveRetroPath`, reads it at the root BEFORE
// `closeEpic` runs) and `{EpicID}-PROFILE.md` (`readEffectiveProfile` reads
// it at the root). Moving either would break its reader.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { closeEpic, closeItem, moveItem, newItem } from '../plugin/tools/lib/work-ops.js';
import { artifactName, resolveArtifactPath } from '../plugin/tools/lib/resume.js';
import { resolveClosures, CLOSURE } from '../plugin/tools/lib/closure.js';
import { WorkStoreError } from '../plugin/tools/lib/work-item.js';

let base;
let P;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-epic-artifacts-'));
  P = join(base, '.planning');
  await mkdir(P, { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel, content = '# x\n') {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const read = (rel) => readFile(join(base, rel), 'utf-8');
const git = (...args) => String(execFileSync('git', args, { cwd: base, stdio: ['ignore', 'pipe', 'ignore'] }));
function commitAll() {
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t.co', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'seed');
}

// Where a markdown link in `fileRel` (repo-relative) points, repo-relative.
function linkTarget(fileRel, text, label) {
  const m = text.match(new RegExp(`\\[${label}\\]\\(([^)#\\s]+)`));
  if (!m) throw new Error(`no [${label}] link in ${fileRel}`);
  return posix.normalize(posix.join(posix.dirname(fileRel), m[1]));
}

const EPIC = 'M1.E1';
const FOLDER = `.planning/work/epics/${EPIC}`;
const PLAN_ROOT = `# plan\n\n[req](${EPIC}-REQUIREMENTS.md) and [ctx](CONTEXT.md)\n`;
const REQ_ROOT = '# req\n';
const CONTEXT = `# ctx\n\n[plan](${EPIC}-PLAN.md)\n`;
const ARCHIVE_NOTE = `# old\n\n[plan](../${EPIC}-PLAN.md)\n`;

async function seed() {
  await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
  await put(`.planning/${EPIC}-PLAN.md`, PLAN_ROOT);
  await put(`.planning/${EPIC}-REQUIREMENTS.md`, REQ_ROOT);
  // A stub: the Epic is live. A complete retrospective means closed, and a
  // closed Epic's artifacts stay at the root (REVIEW pass 3).
  await put(`.planning/${EPIC}-RETROSPECTIVE.md`, '# retro\n\n[FILL IN]\n');
  await put(`.planning/${EPIC}-PROFILE.md`, '---\ntier: FEATURE\n---\n');
  await put('.planning/M1.E10-PLAN.md', '# another Epic\n');
  await put('.planning/CONTEXT.md', CONTEXT);
  await put('.planning/archive/NOTE.md', ARCHIVE_NOTE);
  await put('.planning/work/backlog/SIG-1.md',
    `---\nid: SIG-1\ntype: FEAT\nstatus: T\ntitle: one\ncreated:\n  at: 2026-09-01T00:00:00.000Z\n  by: b\n---\n[plan](../../${EPIC}-PLAN.md)\n`);
}

describe('moveItem into a new Epic folder moves the Epic\'s root artifacts in (D-M6E11-33)', () => {
  it('moves {EpicID}-*.md into the folder with git mv, and nothing else', async () => {
    await seed();
    commitAll();
    await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC });

    for (const name of [`${EPIC}-PLAN.md`, `${EPIC}-REQUIREMENTS.md`]) {
      expect(existsSync(join(P, name)), name).toBe(false);
      expect(existsSync(join(base, FOLDER, name)), name).toBe(true);
    }
    // Stay at the root: read there by their own readers, or another Epic's.
    for (const name of [`${EPIC}-RETROSPECTIVE.md`, `${EPIC}-PROFILE.md`, 'M1.E10-PLAN.md']) {
      expect(existsSync(join(P, name)), name).toBe(true);
    }
    // History follows the file: git mv stages the rename itself. Read BEFORE
    // any `git add`, which would turn a plain rename into `R` too.
    const status = git('status', '--porcelain');
    expect(status).toMatch(new RegExp(`R  \\.planning/${EPIC}-REQUIREMENTS\\.md -> \\.planning/work/epics/${EPIC}/${EPIC}-REQUIREMENTS\\.md`));
  });

  it('rewrites links in and out; a link that still resolves is left byte-for-byte', async () => {
    await seed();
    await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC });

    const planRel = `${FOLDER}/${EPIC}-PLAN.md`;
    const plan = await read(planRel);
    expect(plan).toContain(`[req](${EPIC}-REQUIREMENTS.md)`); // moved together: unchanged
    expect(linkTarget(planRel, plan, 'ctx')).toBe('.planning/CONTEXT.md');
    expect(linkTarget('.planning/CONTEXT.md', await read('.planning/CONTEXT.md'), 'plan')).toBe(planRel);
    const itemRel = `${FOLDER}/SIG-1.md`;
    expect(linkTarget(itemRel, await read(itemRel), 'plan')).toBe(planRel);
    // archive/ is history: left as written.
    expect(await read('.planning/archive/NOTE.md')).toBe(ARCHIVE_NOTE);
    // The requirements file had no links: byte-identical.
    expect(await read(`${FOLDER}/${EPIC}-REQUIREMENTS.md`)).toBe(REQ_ROOT);
  });

  it('writer and reader agree on the folder copy afterwards', async () => {
    await seed();
    await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC });
    const name = artifactName('REQUIREMENTS', { currentEpic: EPIC, planningDir: P });
    expect(name).toBe(`work/epics/${EPIC}/${EPIC}-REQUIREMENTS.md`);
    expect(resolveArtifactPath(P, 'REQUIREMENTS', { currentEpic: EPIC })).toBe(join(P, name));
  });

  it('a second item moving into the existing folder moves nothing more', async () => {
    await seed();
    await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC });
    await put(`.planning/${EPIC}-LATE.md`, '# written by a store-off command\n');
    const b = await newItem(base, { type: 'FEAT', title: 'two', by: 't' });
    await moveItem(base, b.id, { status: 'Q', epic: EPIC });
    expect(existsSync(join(P, `${EPIC}-LATE.md`))).toBe(true);
  });

  it('the item move fails after the artifacts moved: everything is put back, byte-for-byte', async () => {
    await seed();
    commitAll();
    const execFn = (cmd, args, o) => {
      if (args.includes('mv') && String(args.at(-1)).endsWith('SIG-1.md')) throw new Error('item mv failed');
      return execFileSync(cmd, args, o);
    };
    const err = await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC }, { execFn }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.message).toMatch(/item mv failed/);
    expect(await read(`.planning/${EPIC}-PLAN.md`)).toBe(PLAN_ROOT);
    expect(await read(`.planning/${EPIC}-REQUIREMENTS.md`)).toBe(REQ_ROOT);
    expect(await read('.planning/CONTEXT.md')).toBe(CONTEXT);
    expect(existsSync(join(base, FOLDER))).toBe(false);
    expect(git('status', '--porcelain')).toBe('');
  });

  it('a link rewrite fails part-way: everything is put back, byte-for-byte', async () => {
    await seed();
    const { rename } = await import('node:fs/promises');
    const renameFn = async (from, to) => {
      if (to.endsWith('CONTEXT.md')) throw new Error('disk full');
      return rename(from, to);
    };
    const err = await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC }, { renameFn }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.message).toMatch(/disk full/);
    expect(await read(`.planning/${EPIC}-PLAN.md`)).toBe(PLAN_ROOT);
    expect(await read('.planning/CONTEXT.md')).toBe(CONTEXT);
    expect(existsSync(join(P, 'work/backlog/SIG-1.md'))).toBe(true);
    expect(existsSync(join(base, FOLDER))).toBe(false);
  });
});

describe('closeEpic refuses while the Epic still has artifacts at the root', () => {
  it('CONFLICT naming each; the retrospective and profile at the root do not block', async () => {
    await seed();
    await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC });
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 't', proof: 'x' });
    // A store-off command wrote one at the root after the folder existed.
    await put(`.planning/${EPIC}-VERIFICATION.md`, '# v\n');
    const err = await closeEpic(base, EPIC, { by: 't' }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain(`.planning/${EPIC}-VERIFICATION.md`);
    expect(err.message).not.toContain('RETROSPECTIVE');
    expect(existsSync(join(base, FOLDER))).toBe(true);

    await rm(join(P, `${EPIC}-VERIFICATION.md`));
    const r = await closeEpic(base, EPIC, { by: 't' });
    expect(r.status).toBe('closed');
    expect(existsSync(join(P, `${EPIC}-RETROSPECTIVE.md`))).toBe(true);
  });
});

describe('moveItem reports the artifacts it moved', () => {
  it('artifacts.moved and artifacts.rewritten on the first move; absent afterwards', async () => {
    await seed();
    const r = await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC });
    expect(r.artifacts.moved).toEqual([`${FOLDER}/${EPIC}-PLAN.md`, `${FOLDER}/${EPIC}-REQUIREMENTS.md`]);
    expect(r.artifacts.rewritten).toContain('.planning/CONTEXT.md');
    const b = await newItem(base, { type: 'FEAT', title: 'two', by: 't' });
    expect((await moveItem(base, b.id, { status: 'Q', epic: EPIC })).artifacts).toBeUndefined();
  });
});

// REVIEW pass 3 — only a LIVE Epic's artifacts move in. A closed Epic (a
// complete retrospective) keeps its artifacts at the root: moving old Epics
// is migration, step 5 — and closure reads its verdict there.
describe('moveItem into a CLOSED Epic moves no artifacts (REVIEW pass 3)', () => {
  it('complete retro + PASS verification at the root: nothing moves, and closure still says closed', async () => {
    await seed();
    await put(`.planning/${EPIC}-RETROSPECTIVE.md`, '# retro\n\nWhat went well: it shipped.\n');
    await put(`.planning/${EPIC}-VERIFICATION.md`, '# Verification\n\n**Verdict:** ✅ **PASS**\n');
    await put('.planning/STATE.md', '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M9.E9\n'
      + 'current_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n'
      + 'last_completed_task: null\n---\n# Project State\n');
    const r = await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC });
    expect(r.artifacts).toBeUndefined();
    for (const name of ['PLAN', 'REQUIREMENTS', 'VERIFICATION']) {
      expect(existsSync(join(P, `${EPIC}-${name}.md`)), name).toBe(true);
      expect(existsSync(join(base, FOLDER, `${EPIC}-${name}.md`)), name).toBe(false);
    }
    expect(await read('.planning/CONTEXT.md')).toBe(CONTEXT);
    const { units } = await resolveClosures(base);
    expect(units.find((u) => u.unit === EPIC)?.status).toBe(CLOSURE.CLOSED);
  });
});

describe('moveEpicArtifactsIn never overwrites (REVIEW pass 3, test gap)', () => {
  it('the folder already holds the artifact (no README): CONFLICT, both copies and the item untouched', async () => {
    await seed();
    await put(`${FOLDER}/${EPIC}-PLAN.md`, '# the folder copy\n');
    const err = await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain(`${FOLDER}/${EPIC}-PLAN.md already exists`);
    expect(await read(`${FOLDER}/${EPIC}-PLAN.md`)).toBe('# the folder copy\n');
    expect(await read(`.planning/${EPIC}-PLAN.md`)).toBe(PLAN_ROOT);
    expect(existsSync(join(base, FOLDER, 'README.md'))).toBe(false);
    expect(existsSync(join(P, 'work/backlog/SIG-1.md'))).toBe(true);
  });
});

// REVIEW pass 3 — the item's write into the folder fails AND moving it back
// fails, so it is left in the folder. Undoing the artifact move must then not
// write the item's pre-move text back to backlog/: that is a second SIG-1.
describe('moveItem: item write and its move-back both fail (REVIEW pass 3)', () => {
  it('one SIG-1 on disk, named on err.leftChanged; the artifacts are put back', async () => {
    await seed();
    commitAll();
    const renameFn = async (from, to) => {
      if (to.endsWith(`${EPIC}/SIG-1.md`)) throw new Error('disk full');
      const { rename } = await import('node:fs/promises');
      return rename(from, to);
    };
    const execFn = (cmd, args, o) => {
      if (args.includes('mv') && String(args.at(-1)).endsWith('backlog/SIG-1.md')) throw new Error('move back failed');
      return execFileSync(cmd, args, o);
    };
    const err = await moveItem(base, 'SIG-1', { status: 'Q', epic: EPIC }, { execFn, renameFn }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('IO');
    expect(err.message).toMatch(/disk full/);
    expect(err.leftChanged.map((c) => c.id)).toEqual(['SIG-1']);
    const copies = git('ls-files', '--cached', '--others', '--', '.planning').split('\n').filter((p) => p.endsWith('/SIG-1.md'));
    expect(copies).toEqual([`${FOLDER}/SIG-1.md`]);
    expect(existsSync(join(P, 'work/backlog/SIG-1.md'))).toBe(false);
    expect(await read(`.planning/${EPIC}-PLAN.md`)).toBe(PLAN_ROOT);
    expect(await read('.planning/CONTEXT.md')).toBe(CONTEXT);
  });
});
