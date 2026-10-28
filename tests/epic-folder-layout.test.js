// The Epic's own folder, `.planning/epics/<EpicID>/` (course correction Step 1,
// 2026-10-27).
//
// The rewritten phase commands put every file of an Epic in one folder from
// DISCUSS onward, so closing it is one move. Before any command writes there,
// every reader must find the files there, on any project, store on or off.
// The resolver that does this already existed for the work store's
// `work/epics/<id>/` folder (M6.E11), gated on the store; this re-points it.
//
// Also here: a closed Epic's files where `/sig:docs-archive` files them,
// `archive/<M>/E<n>/`. Before this, `/sig:resume` on a just-archived Epic found
// nothing there.
//
// Real temp dirs and real git; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveArtifactPath, artifactName } from '../plugin/tools/lib/resume.js';
import { isStateStale, stringifyFrontmatter } from '../plugin/tools/lib/state.js';
import { collectPreflight } from '../plugin/tools/lib/drive.js';

const EPIC = 'M7.E2';
const ARTIFACTS = ['REQUIREMENTS', 'PLAN', 'PROGRESS', 'RESEARCH', 'VALIDATION', 'VERIFICATION', 'REVIEW'];

let base;
let P;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-epic-folder-'));
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
const rel = (abs) => (abs === null ? null : abs.slice(P.length + 1).split('\\').join('/'));
const resolveRel = (artifact, currentEpic = EPIC) => rel(resolveArtifactPath(P, artifact, { currentEpic }));
const nameFor = (artifact, currentEpic = EPIC) => artifactName(artifact, { currentEpic, planningDir: P });

describe('the Epic folder is read and written, store off', () => {
  it('a file in the folder is found, and new files are named inside it', async () => {
    await put(`.planning/epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(nameFor('PLAN')).toBe(`epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(nameFor('VERIFICATION')).toBe(`epics/${EPIC}/${EPIC}-VERIFICATION.md`);
  });

  it('a bare PLAN.md in the folder is found, and kept as the name to write', async () => {
    await put(`.planning/epics/${EPIC}/PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`epics/${EPIC}/PLAN.md`);
    expect(nameFor('PLAN')).toBe(`epics/${EPIC}/PLAN.md`);
  });

  it('with the folder present and only a root copy, the root copy is read and the folder is written', async () => {
    await mkdir(join(P, 'epics', EPIC), { recursive: true });
    await put(`.planning/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`${EPIC}-PLAN.md`);
    expect(nameFor('PLAN')).toBe(`epics/${EPIC}/${EPIC}-PLAN.md`);
  });

  it('the folder copy wins over a root copy', async () => {
    await put(`.planning/${EPIC}-PLAN.md`, 'root');
    await put(`.planning/epics/${EPIC}/${EPIC}-PLAN.md`, 'folder');
    expect(resolveRel('PLAN')).toBe(`epics/${EPIC}/${EPIC}-PLAN.md`);
  });

  it('another Epic\'s folder changes nothing for this one', async () => {
    await put(`.planning/epics/M7.E3/M7.E3-PLAN.md`);
    await put(`.planning/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`${EPIC}-PLAN.md`);
    expect(nameFor('PLAN')).toBe(`${EPIC}-PLAN.md`);
  });

  it('without the folder, the names are what they were', async () => {
    expect(nameFor('PLAN')).toBe(`${EPIC}-PLAN.md`);
    expect(artifactName('PLAN', { currentEpic: EPIC })).toBe(`${EPIC}-PLAN.md`);
    expect(nameFor('REQUIREMENTS', null)).toBe('REQUIREMENTS.md');
  });

  it('a non-strict Epic name never reads a folder', async () => {
    await put('.planning/epics/PHASE11/PHASE11-PLAN.md');
    expect(resolveRel('PLAN', 'PHASE11')).toBe(null);
  });
});

describe('the Epic folder, store on', () => {
  beforeEach(() => put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n'));

  it('the Epic folder wins over the store\'s work/epics folder', async () => {
    await put(`.planning/work/epics/${EPIC}/${EPIC}-PLAN.md`, 'store');
    await put(`.planning/epics/${EPIC}/${EPIC}-PLAN.md`, 'own');
    expect(resolveRel('PLAN')).toBe(`epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(nameFor('PROGRESS')).toBe(`epics/${EPIC}/${EPIC}-PROGRESS.md`);
  });

  it('without the Epic folder, the store\'s folder is still read', async () => {
    await put(`.planning/work/epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`work/epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(nameFor('PLAN')).toBe(`work/epics/${EPIC}/${EPIC}-PLAN.md`);
  });
});

describe('a broken WORK.md does not stop the Epic folder being read', () => {
  beforeEach(() => put('.planning/work/WORK.md', 'not a store file\n'));

  it('the store is never consulted for an Epic with its own folder', async () => {
    // Guard: without the folder the broken store throws, so the next line is meaningful.
    expect(() => resolveArtifactPath(P, 'PLAN', { currentEpic: 'M7.E3' })).toThrow();
    await put(`.planning/epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`epics/${EPIC}/${EPIC}-PLAN.md`);
    expect(nameFor('PLAN')).toBe(`epics/${EPIC}/${EPIC}-PLAN.md`);
  });
});

describe('a closed Epic\'s files where /sig:docs-archive filed them (archive/<M>/E<n>/)', () => {
  it('are found, and never named as the place to write', async () => {
    await put(`.planning/archive/M7/E2/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`archive/M7/E2/${EPIC}-PLAN.md`);
    expect(nameFor('PLAN')).toBe(`${EPIC}-PLAN.md`);
  });

  it('a dotted milestone files under its full number', async () => {
    await put('.planning/archive/M3.0/E2/M3.0.E2-REVIEW.md');
    expect(resolveRel('REVIEW', 'M3.0.E2')).toBe('archive/M3.0/E2/M3.0.E2-REVIEW.md');
  });

  it('a root copy still wins over the archived one', async () => {
    await put(`.planning/${EPIC}-PLAN.md`);
    await put(`.planning/archive/M7/E2/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`${EPIC}-PLAN.md`);
  });

  it('the Epic\'s archived file wins over a linear PLAN.md, which may be another unit\'s', async () => {
    await put('.planning/PLAN.md');
    await put(`.planning/archive/M7/E2/${EPIC}-PLAN.md`);
    expect(resolveRel('PLAN')).toBe(`archive/M7/E2/${EPIC}-PLAN.md`);
  });
});

describe('the same project in both layouts gives the same answers', () => {
  // Every artifact at the root, then the same files moved into the folder.
  async function plantRoot() {
    for (const a of ARTIFACTS) await put(`.planning/${EPIC}-${a}.md`, `# ${a}\n\n${a === 'REQUIREMENTS' ? '[FILL IN] the goal\n' : 'done\n'}`);
  }
  async function moveIntoFolder() {
    await mkdir(join(P, 'epics', EPIC), { recursive: true });
    for (const a of ARTIFACTS) await rename(join(P, `${EPIC}-${a}.md`), join(P, 'epics', EPIC, `${EPIC}-${a}.md`));
  }
  const contents = async () => Object.fromEntries(await Promise.all(ARTIFACTS.map(async (a) => {
    const p = resolveArtifactPath(P, a, { currentEpic: EPIC });
    return [a, p === null ? null : await readFile(p, 'utf-8')];
  })));
  // A preflight finding names the file it read; the folder name is the only difference allowed.
  const preflight = async () => JSON.parse(JSON.stringify(await collectPreflight(base, { epic: EPIC }))
    .replaceAll(`epics/${EPIC}/`, ''));

  it('every artifact reads the same content', async () => {
    await plantRoot();
    const before = await contents();
    expect(Object.values(before).every((c) => c !== null)).toBe(true);
    await moveIntoFolder();
    expect(await contents()).toEqual(before);
  });

  it('drive\'s preflight finds the same unfilled marker in the requirements', async () => {
    await plantRoot();
    const before = await preflight();
    expect(JSON.stringify(before)).toMatch(/FILL IN|unfilled/i);
    await moveIntoFolder();
    expect(await preflight()).toEqual(before);
  });
});

describe('a commit to the Epic folder makes the state file out of date', () => {
  const git = (args) => execFileSync('git', args, { cwd: base, stdio: ['ignore', 'pipe', 'ignore'] });
  function repo() {
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 't@t.co']);
    git(['config', 'user.name', 'T']);
    git(['config', 'commit.gpgsign', 'false']);
  }
  async function plantState(lastCommit) {
    await writeFile(join(P, 'STATE.md'), stringifyFrontmatter({
      schema_version: 1, phase: 'EXECUTE', current_epic: EPIC, current_wave: null, current_tasks: [],
      completed_phases: [], blockers: [], last_decision_at: null, last_updated_commit: lastCommit,
      last_updated: '2026-10-27T00:00:00.000Z',
    }, '# body\n'), 'utf-8');
  }

  it('a commit touching only the folder\'s PLAN is stale, as one at the root is', async () => {
    repo();
    await put('app.js', 'v0\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
    const head = String(git(['rev-parse', 'HEAD'])).trim();
    await plantState(head);
    const plan = `.planning/epics/${EPIC}/${EPIC}-PLAN.md`;
    await put(plan, '# plan\n');
    git(['add', plan]);
    git(['commit', '-q', '-m', 'plan in the Epic folder']);
    const result = await isStateStale(base);
    expect(result.stale).toBe(true);
    expect(result.commitCount).toBe(1);
  }, 30_000);
});
