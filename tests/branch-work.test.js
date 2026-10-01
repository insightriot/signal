// `B118` — work open on a branch other than the checked-out one.
//
// `/sig:drive` and `/sig:advise` read `.planning/` from the working tree, so an
// Epic open on an unmerged branch was invisible to both, and the read reported
// nothing in `cannotCheck` because nothing failed. These run against REAL git
// repositories: the bug lived in what git was never asked, so a mocked git would
// test the mock.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { findWorkOnOtherBranches, formatOtherBranchWork, nextStepFor } from '../plugin/tools/lib/branch-work.js';
import { proposeEpicCandidates, resolveStartPhase } from '../plugin/tools/lib/drive.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { renderArtifact, formatAdviseSummary } from '../plugin/tools/lib/advise.js';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

const STATE = ({ epic = null, phase = 'DISCUSS', completed = [], extra = '' } = {}) =>
  [
    '---',
    'schema_version: 1',
    `phase: ${phase}`,
    `current_epic: ${epic ?? 'null'}`,
    'current_wave: null',
    'current_tasks: []',
    completed.length ? `completed_phases:\n${completed.map((c) => `  - ${c}`).join('\n')}` : 'completed_phases: []',
    '---',
    '',
    `# State${extra}`,
    '',
  ].join('\n');

function write(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}

/** A repo on `main` whose STATE.md names `localEpic` (shipped by default). */
function repo({ localEpic = 'M1.E1', localShipped = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-branch-work-'));
  dirs.push(base);
  g(base, 'init', '-q', '-b', 'main');
  g(base, 'config', 'user.email', 't@example.com');
  g(base, 'config', 'user.name', 'T');
  g(base, 'config', 'commit.gpgsign', 'false');
  write(base, '.planning/STATE.md', STATE({
    epic: localEpic,
    phase: 'SHIP',
    completed: localShipped ? ['DISCUSS (2026-09-01)', 'SHIP (2026-09-02)'] : ['DISCUSS (2026-09-01)'],
  }));
  write(base, '.planning/BACKLOG.md', '# Backlog\n\n### B200 — a backlog row · **hygiene** · small\nFiled 2026-09-01.\n');
  g(base, 'add', '-A');
  g(base, 'commit', '-q', '-m', 'init');
  return base;
}

/** Commit a STATE.md on a new branch, then return to `main`. */
function branchWith(base, name, stateContent, { files = {} } = {}) {
  g(base, 'checkout', '-q', '-b', name);
  write(base, '.planning/STATE.md', stateContent);
  for (const [rel, c] of Object.entries(files)) write(base, rel, c);
  g(base, 'add', '-A');
  g(base, 'commit', '-q', '-m', `work on ${name}`);
  g(base, 'checkout', '-q', 'main');
}

describe('findWorkOnOtherBranches — what counts as open elsewhere', () => {
  it('surfaces an Epic open on an unmerged branch — the M6.E8 case that was invisible', async () => {
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2', phase: 'DISCUSS' }));
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.cannotCheck).toEqual([]);
    expect(r.open).toEqual([
      { epic: 'M1.E2', phase: 'DISCUSS', branches: ['feat/m1.e2'], checkout: 'feat/m1.e2', sameBranch: false, pull: null, worktree: null },
    ]);
    expect(r.failed).toBe(false);
  });

  it('ignores a branch already merged into HEAD', async () => {
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2' }));
    g(base, 'merge', '-q', '--no-ff', '-m', 'merge', 'feat/m1.e2');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E2' });
    expect(r.open).toEqual([]);
  });

  it('ignores a squash-merged branch whose Epic has a retrospective here — the noise rule 1 cannot see', async () => {
    // Measured on Signal itself: 31 unmerged tips, every one squash-merged or stale.
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2' }));
    write(base, '.planning/M1.E2-RETROSPECTIVE.md', '# Retro\n');
    g(base, 'add', '-A');
    g(base, 'commit', '-q', '-m', 'squash of M1.E2');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open).toEqual([]);
  });

  it('finds the retrospective even when it has been archived into a subfolder', async () => {
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2' }));
    write(base, '.planning/archive/M1/M1.E2-SHIP.md', '# Ship\n');
    g(base, 'add', '-A');
    g(base, 'commit', '-q', '-m', 'archived');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open).toEqual([]);
  });

  it('ignores a branch whose own STATE.md records SHIP for its Epic', async () => {
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2', phase: 'SHIP', completed: ['SHIP (2026-09-03)'] }));
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open).toEqual([]);
  });

  it('ignores the local Epic — that is this branch\'s work, not other work', async () => {
    const base = repo({ localEpic: 'M1.E2', localShipped: false });
    branchWith(base, 'fix/side', STATE({ epic: 'M1.E2', phase: 'PLAN' }));
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E2' });
    expect(r.open).toEqual([]);
  });

  it('COUNTS a branch with no Epic id rather than dropping it — it could not be compared', async () => {
    const base = repo();
    branchWith(base, 'experiment', STATE({ epic: null, phase: 'EXECUTE' }));
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open).toEqual([]);
    expect(r.unclassified).toEqual(['experiment']);
    expect(formatOtherBranchWork(r)).toMatch(/1 unmerged branch\(es\).*no Epic id.*experiment/);
  });

  it('a branch with no STATE.md at all records no Signal work and is neither open nor unclassified', async () => {
    const base = repo();
    g(base, 'checkout', '-q', '-b', 'docs/x');
    g(base, 'rm', '-q', '.planning/STATE.md');
    g(base, 'commit', '-q', '-m', 'no state');
    g(base, 'checkout', '-q', 'main');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r).toEqual({ open: [], unclassified: [], unreadable: [], failed: false, cannotCheck: [] });
  });

  it('a malformed STATE.md on a branch is cannot-check, named — never a silent skip', async () => {
    const base = repo();
    branchWith(base, 'broken', '---\nphase: [unclosed\n---\n');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.cannotCheck).toHaveLength(1);
    expect(r.cannotCheck[0].reason).toMatch(/could not be parsed: broken/);
    expect(r.unreadable).toEqual(['broken']);
    expect(r.failed).toBe(false); // one bad file narrows the answer; it does not void it
  });

  it('reads every branch correctly when STATE.md bodies carry multi-byte characters', async () => {
    // `cat-file --batch` sizes are BYTES. Slicing a decoded string drifts on the
    // first em dash and misreads every blob after it.
    const base = repo();
    branchWith(base, 'a', STATE({ epic: 'M1.E2', extra: ' — ⚠ émoji 🚀'.repeat(40) }));
    branchWith(base, 'b', STATE({ epic: 'M1.E3', phase: 'PLAN', extra: ' — ünïcode'.repeat(40) }));
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.cannotCheck).toEqual([]);
    expect(r.open.map((o) => [o.epic, o.phase])).toEqual([['M1.E2', 'DISCUSS'], ['M1.E3', 'PLAN']]);
  });

  it('groups the local and remote copy of one branch under one Epic', async () => {
    const base = repo();
    const remote = mkdtempSync(join(tmpdir(), 'sig-branch-work-remote-'));
    dirs.push(remote);
    g(remote, 'init', '-q', '--bare');
    g(base, 'remote', 'add', 'origin', remote);
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2' }));
    g(base, 'push', '-q', 'origin', 'main', 'feat/m1.e2');
    g(base, 'fetch', '-q', 'origin');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open).toHaveLength(1);
    expect(r.open[0].branches.sort()).toEqual(['feat/m1.e2', 'origin/feat/m1.e2']);
    expect(r.open[0].checkout).toBe('feat/m1.e2');
  });

  it('outside a git repository there are no other branches — a complete answer, not cannot-check', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sig-branch-work-nogit-'));
    dirs.push(base);
    expect(await findWorkOnOtherBranches(base)).toEqual({ open: [], unclassified: [], unreadable: [], failed: false, cannotCheck: [] });
  });

  it('a git failure after the repository check is cannot-check with the reason', async () => {
    const git = (_b, args) => {
      if (args[0] === 'for-each-ref') throw Object.assign(new Error('boom'), { stderr: 'fatal: refs are broken' });
      return '';
    };
    const r = await findWorkOnOtherBranches('/nowhere', { git });
    expect(r.open).toEqual([]);
    expect(r.failed).toBe(true);
    expect(r.cannotCheck).toEqual([
      { source: 'STATE.md on other branches', reason: 'git could not list branches — fatal: refs are broken' },
    ]);
  });
});

describe('/sig:drive — an Epic open elsewhere is proposed, and never resumed here', () => {
  it('ranks the other-branch Epic after the local open Epic and ahead of every backlog row', async () => {
    const base = repo({ localEpic: 'M1.E1', localShipped: false });
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2', phase: 'PLAN' }));
    const { candidates, cannotCheck } = await proposeEpicCandidates(base);
    expect(cannotCheck).toEqual([]);
    expect(candidates.slice(0, 3).map((c) => c.id)).toEqual(['M1.E1', 'M1.E2', 'B200']);
    expect(candidates[1]).toMatchObject({ branch: 'feat/m1.e2', phase: 'PLAN' });
  });

  it('with the local Epic shipped, the other-branch Epic is the first candidate — the exact B118 run', async () => {
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2' }));
    const { candidates } = await proposeEpicCandidates(base);
    expect(candidates[0]).toMatchObject({ id: 'M1.E2', branch: 'feat/m1.e2' });
  });

  it('resolveStartPhase BLOCKS on an other-branch candidate and names the checkout — it does not switch branches', () => {
    const local = { phase: 'SHIP', current_epic: 'M1.E1' };
    const r = resolveStartPhase(local, {
      id: 'M1.E2',
      source: 'branch feat/m1.e2 (open Epic)',
      branch: 'feat/m1.e2',
      phase: 'PLAN',
    });
    expect(r.blocked).toBe(true);
    expect(r.phase).toBe('PLAN');
    expect(r.why).toContain('git checkout feat/m1.e2');
  });

  it('carries the shared next step through to the block — pull for this branch\'s own remote copy', () => {
    const r = resolveStartPhase({ phase: 'SHIP' }, {
      id: 'M1.E2',
      branch: 'main',
      phase: 'PLAN',
      nextStep: nextStepFor({ sameBranch: true, branches: ['origin/main'], checkout: 'main' }),
    });
    expect(r.blocked).toBe(true);
    expect(r.why).toContain('git pull');
    expect(r.why).not.toContain('git checkout');
  });

  it('even a source string mentioning STATE.md cannot route an other-branch candidate into "resume here"', () => {
    const r = resolveStartPhase(
      { phase: 'DISCUSS' },
      { id: 'M1.E2', source: 'STATE.md on branch x', branch: 'x', phase: 'DISCUSS' }
    );
    expect(r.blocked).toBe(true);
  });

  it('reports unclassified branches alongside the candidates', async () => {
    const base = repo();
    branchWith(base, 'experiment', STATE({ epic: null }));
    const r = await proposeEpicCandidates(base);
    expect(r.unclassifiedBranches).toEqual(['experiment']);
  });
});

describe('/sig:advise — the advisory says what is open elsewhere, above the ranking', () => {
  it('readCorpus carries the other-branch Epics as a checked fifth source', async () => {
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2' }));
    const corpus = await readCorpus(base);
    expect(corpus.checked).toContain('other branches');
    expect(corpus.sources.otherBranches.open.map((o) => o.epic)).toEqual(['M1.E2']);
  });

  it('the artifact lists it in its own section, before the citation rule, and the summary leads with it', async () => {
    const base = repo();
    branchWith(base, 'feat/m1.e2', STATE({ epic: 'M1.E2', phase: 'PLAN' }));
    const corpus = await readCorpus(base);
    const ranked = { recommended: [], declined: [], consulted: ['BACKLOG.md'] };
    const body = renderArtifact({ today: '2026-10-01', ranked, corpus, projectName: 'x' });
    const section = body.slice(body.indexOf('## Open on other branches'), body.indexOf('## Citation rule'));
    expect(section).toContain('**M1.E2** — at PLAN on `feat/m1.e2`; run `git checkout feat/m1.e2` to continue it');
    expect(body.indexOf('## Open on other branches')).toBeLessThan(body.indexOf('## Citation rule'));
    const summary = formatAdviseSummary({ status: 'written', today: '2026-10-01', ranked, corpus, path: 'p' });
    expect(summary).toMatch(/M1\.E2 is open on feat\/m1\.e2 — finish it first: run `git checkout feat\/m1\.e2`/);
  });

  it('with nothing open elsewhere the section does not render', async () => {
    const base = repo();
    const corpus = await readCorpus(base);
    const body = renderArtifact({
      today: '2026-10-01',
      ranked: { recommended: [], declined: [], consulted: [] },
      corpus,
      projectName: 'x',
    });
    expect(body).not.toContain('## Open on other branches');
  });
});

describe('rule 5 — a branch that never touched STATE.md holds no work', () => {
  it('ignores an old branch carrying an untouched copy after the local Epic moved on, with no retrospective', async () => {
    // Projects without retrospectives cannot use rule 3, so a branch forked while
    // M1.E2 was open would surface M1.E2 forever after main moved on to M1.E3.
    const base = repo({ localEpic: 'M1.E2', localShipped: false });
    g(base, 'checkout', '-q', '-b', 'docs/typo');
    write(base, 'README.md', 'typo fix\n');
    g(base, 'add', '-A');
    g(base, 'commit', '-q', '-m', 'typo');
    g(base, 'checkout', '-q', 'main');
    write(base, '.planning/STATE.md', STATE({ epic: 'M1.E3' }));
    g(base, 'commit', '-q', '-am', 'main moves on');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E3' });
    expect(r.open).toEqual([]);
  });
});

describe('PR #265 second review — each reproduced, then fixed', () => {
  it('a squash-merged branch is not open even with a non-M Epic id and no retrospective (finding 2)', async () => {
    const base = repo({ localEpic: 'search', localShipped: false });
    branchWith(base, 'feat/billing', STATE({ epic: 'billing', phase: 'EXECUTE' }), { files: { 'src/b.js': 'x\n' } });
    g(base, 'merge', '-q', '--squash', 'feat/billing');
    g(base, 'commit', '-q', '-m', 'squash billing');
    write(base, '.planning/STATE.md', STATE({ epic: 'search', phase: 'DISCUSS' }));
    g(base, 'commit', '-q', '-am', 'main moves on');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'search' });
    expect(r.open).toEqual([]);
  });

  it('a same-named branch on an untracked remote names that remote in the pull (finding 3)', async () => {
    const base = repo();
    const remote = mkdtempSync(join(tmpdir(), 'sig-branch-work-up-'));
    dirs.push(remote);
    g(remote, 'init', '-q', '--bare');
    g(base, 'remote', 'add', 'upstream', remote);
    write(base, '.planning/STATE.md', STATE({ epic: 'M1.E2' }));
    g(base, 'commit', '-q', '-am', 'elsewhere');
    g(base, 'push', '-q', 'upstream', 'main');
    g(base, 'reset', '-q', '--hard', 'HEAD~1');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open[0]).toMatchObject({ sameBranch: true, pull: 'git pull upstream main' });
    expect(nextStepFor(r.open[0])).toContain('git pull upstream main');
  });

  it('stays one git process per branch set, not per branch — 200 open branches in well under the old cost (finding 1)', async () => {
    const base = repo();
    for (let i = 0; i < 200; i++) {
      g(base, 'checkout', '-q', '-b', `f${i}`, 'main');
      write(base, '.planning/STATE.md', STATE({ epic: `M2.E${i}` }));
      g(base, 'commit', '-q', '-am', `f${i}`);
    }
    g(base, 'checkout', '-q', 'main');
    const calls = [];
    const counting = (b, args, input) => {
      calls.push(args[0]);
      return execFileSync('git', args, { cwd: b, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 26,
        ...(args[0] === 'cat-file' ? {} : { encoding: 'utf-8' }), ...(input !== undefined ? { input } : {}) });
    };
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1', git: counting });
    expect(r.open).toHaveLength(200);
    expect(calls.length).toBeLessThan(15);
  }, 60000);
});

describe('PR #265 review findings — each reproduced, then fixed', () => {
  it('a project in a SUBDIRECTORY of the repository reads its own STATE.md on each branch (finding 1)', async () => {
    // `<ref>:path` resolves from the repository root; `<ref>:./path` from the cwd.
    // Without `./`, a monorepo package read nothing — B118's silence, one level down.
    const root = mkdtempSync(join(tmpdir(), 'sig-branch-work-mono-'));
    dirs.push(root);
    g(root, 'init', '-q', '-b', 'main');
    g(root, 'config', 'user.email', 't@example.com');
    g(root, 'config', 'user.name', 'T');
    g(root, 'config', 'commit.gpgsign', 'false');
    const pkg = join(root, 'pkg');
    write(pkg, '.planning/STATE.md', STATE({ epic: 'M1.E1', phase: 'SHIP', completed: ['SHIP (2026-09-02)'] }));
    // A root-level STATE.md naming a different, unshipped Epic — the decoy the bug read.
    write(root, '.planning/STATE.md', STATE({ epic: 'M9.E9' }));
    g(root, 'add', '-A');
    g(root, 'commit', '-q', '-m', 'init');
    g(root, 'checkout', '-q', '-b', 'feat');
    write(pkg, '.planning/STATE.md', STATE({ epic: 'M1.E2', phase: 'PLAN' }));
    g(root, 'add', '-A');
    g(root, 'commit', '-q', '-m', 'feat');
    g(root, 'checkout', '-q', 'main');
    const r = await findWorkOnOtherBranches(pkg, { localEpic: 'M1.E1' });
    expect(r.open.map((o) => o.epic)).toEqual(['M1.E2']);
  });

  it('advise keeps every open Epic when one unrelated branch has a malformed STATE.md (finding 2)', async () => {
    const base = repo();
    branchWith(base, 'f2', STATE({ epic: 'M1.E2' }));
    branchWith(base, 'f5', '---\nphase: [unclosed\n---\n');
    const corpus = await readCorpus(base);
    expect(corpus.checked).toContain('other branches');
    expect(corpus.sources.otherBranches.open.map((o) => o.epic)).toEqual(['M1.E2']);
    expect(corpus.sources.otherBranches.unreadable).toEqual(['f5']);
    const body = renderArtifact({
      today: '2026-10-01',
      ranked: { recommended: [], declined: [], consulted: [] },
      corpus,
      projectName: 'x',
    });
    expect(body).toContain('**M1.E2**');
    expect(body).toMatch(/1 branch\(es\) carry a `STATE.md` that could not be parsed.*`f5`/);
  });

  it('the remote copy of THIS branch, ahead of it, says pull — never "check out the branch you are on" (finding 3)', async () => {
    const base = repo();
    const remote = mkdtempSync(join(tmpdir(), 'sig-branch-work-remote-'));
    dirs.push(remote);
    g(remote, 'init', '-q', '--bare');
    g(base, 'remote', 'add', 'origin', remote);
    g(base, 'push', '-q', '-u', 'origin', 'main');
    // A second machine starts M1.E2 on main and pushes.
    write(base, '.planning/STATE.md', STATE({ epic: 'M1.E2', phase: 'DISCUSS' }));
    g(base, 'commit', '-q', '-am', 'other machine');
    g(base, 'push', '-q', 'origin', 'main');
    g(base, 'reset', '-q', '--hard', 'HEAD~1');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open).toHaveLength(1);
    expect(r.open[0]).toMatchObject({ epic: 'M1.E2', sameBranch: true, branches: ['origin/main'] });
    expect(nextStepFor(r.open[0])).toContain('git pull');
    const { candidates } = await proposeEpicCandidates(base);
    const block = resolveStartPhase({ phase: 'SHIP' }, candidates[0]);
    expect(block.blocked).toBe(true);
    expect(block.why).toContain('git pull');
  });

  it('a branch seen only on a remote not named origin checks out by its branch name (finding 4)', async () => {
    const base = repo();
    const remote = mkdtempSync(join(tmpdir(), 'sig-branch-work-up-'));
    dirs.push(remote);
    g(remote, 'init', '-q', '--bare');
    g(base, 'remote', 'add', 'upstream', remote);
    branchWith(base, 'feat/u', STATE({ epic: 'M1.E2' }));
    g(base, 'push', '-q', 'upstream', 'feat/u');
    g(base, 'branch', '-q', '-D', 'feat/u');
    g(base, 'fetch', '-q', 'upstream');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open[0]).toMatchObject({ branches: ['upstream/feat/u'], checkout: 'feat/u' });
  });

  it('a branch checked out in another worktree says to continue there (finding 4)', async () => {
    const base = repo();
    branchWith(base, 'feat/w', STATE({ epic: 'M1.E2' }));
    const wt = join(mkdtempSync(join(tmpdir(), 'sig-branch-work-wt-')), 'wt');
    dirs.push(join(wt, '..'));
    g(base, 'worktree', 'add', '-q', wt, 'feat/w');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open[0].worktree).toBeTruthy();
    expect(nextStepFor(r.open[0])).toMatch(/checked out in another worktree/);
  });

  it('an Epic id that is not M-shaped is proposed, matching the local open-Epic check (finding 5)', async () => {
    const base = repo();
    branchWith(base, 'phase-12', STATE({ epic: 'PHASE12' }));
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M1.E1' });
    expect(r.open.map((o) => o.epic)).toEqual(['PHASE12']);
    expect(r.unclassified).toEqual([]);
  });
});
