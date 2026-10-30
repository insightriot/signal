// Tests for isStaleVsOrigin (M4.5.E10.S1.t2, FR2 origin-drift).
//
// Unlike isStateStale (local last_updated_commit..HEAD), this compares the
// STATE.md commit against the *remote* default branch after a bounded,
// non-interactive fetch. The whole surface is fail-open: every git failure
// mode (offline, no remote, timeout, auth-hang, unset origin/HEAD, diverged
// history, non-git dir) must resolve to {stale:false} and never throw.
//
// The execFn stub dispatches by subcommand (symbolic-ref / show-ref / fetch / rev-list /
// log) because a single run makes up to four distinct git calls with
// different expected outputs — the flat one-value stubs used by
// is-state-stale.test.js can't model that.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { isStaleVsOrigin, stringifyFrontmatter } from '../plugin/tools/lib/state.js';

// Real git-fixture helpers (B6/FR4). The subcommand-dispatch mock above is
// range-agnostic, so it can't prove the HEAD..origin range swap; the
// bookkeeping-+1 origin cases run against real temp repos with a bare remote
// and let isStaleVsOrigin's own hardened fetch refresh the tracking ref.
const git = (cwd, args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}
const headSha = (dir) => String(git(dir, ['rev-parse', 'HEAD'])).trim();
function commitAll(dir, msg) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}
// Stub ONLY the function's bounded 2s fetch — its hardening/anti-hang contract
// is covered by the AD7 mocked test above, and running it for real makes these
// fixtures flaky (a slow spawn under parallel load trips the 2s SIGKILL and
// fails open). Everything else runs against real git, so the HEAD..origin range
// is still computed for real. The fixtures pre-fetch the tracking ref so
// origin/main is current before the stubbed fetch would have refreshed it.
const realGitExceptFetch = (cmd, args, opts) =>
  args.includes('fetch') ? Buffer.from('') : execFileSync(cmd, args, opts);

// Plant a schema-v1 STATE.md with the supplied frontmatter fields.
async function plantState(tempDir, fm) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  const data = {
    schema_version: 1,
    phase: 'EXECUTE',
    current_epic: null,
    current_wave: null,
    current_tasks: [],
    completed_phases: [],
    blockers: [],
    last_decision_at: null,
    last_updated_commit: 'stored123',
    last_updated: '2026-07-01T00:00:00.000Z',
    ...fm,
  };
  await writeFile(
    join(tempDir, '.planning', 'STATE.md'),
    stringifyFrontmatter(data, '# body\n'),
    'utf-8'
  );
}

const buf = (...lines) => Buffer.from(lines.join('\n'));

function timeoutError() {
  // Shape of what execFileSync throws when it SIGKILLs a hung child at the
  // timeout. `code` is ETIMEDOUT under injection we just simulate it.
  return Object.assign(new Error('spawnSync git ETIMEDOUT'), {
    code: 'ETIMEDOUT',
    killed: true,
    signal: 'SIGKILL',
  });
}

// Build a subcommand-dispatching execFn stub. Each response is a string
// (stdout), an Error (thrown), or a fn. `undefined` -> empty stdout.
function makeExec(responses = {}) {
  const calls = [];
  const respond = (r) => {
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r();
    if (r === undefined) return buf('');
    return buf(String(r));
  };
  const fn = (cmd, args) => {
    calls.push(args);
    // The default branch (`resolveDefaultBranch`): `originHead` is what the
    // stored origin/HEAD names (an Error: unset); `present` lists the remote
    // refs that exist (default: whatever is asked for).
    if (args[0] === 'symbolic-ref') return respond(responses.originHead);
    if (args[0] === 'show-ref') {
      if (responses.present && !responses.present.includes(args.at(-1))) throw new Error('no such ref');
      return buf('');
    }
    if (args.includes('fetch')) return respond(responses.fetch);
    if (args[0] === 'rev-list') {
      const isPlanning = args.includes('.planning/');
      return respond(isPlanning ? responses.revListPlanning : responses.revListCount);
    }
    if (args[0] === 'log') return respond(responses.log);
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  fn.calls = calls;
  return fn;
}

describe('isStaleVsOrigin', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-origin-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // AC2.1 — full shape when origin is ahead by N.
  it('reports {stale, aheadCount, commits, touchedPlanning} when ahead by N', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: 'refs/remotes/origin/main',
      fetch: '',
      revListCount: '3',
      log: buf(
        'sha1 M4.5.E10.S1.t2: origin work',
        'sha2 planning: refresh',
        'sha3 fix something'
      ).toString(),
      revListPlanning: '2',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(true);
    expect(result.aheadCount).toBe(3);
    expect(result.commits).toEqual([
      { sha: 'sha1', subject: 'M4.5.E10.S1.t2: origin work' },
      { sha: 'sha2', subject: 'planning: refresh' },
      { sha: 'sha3', subject: 'fix something' },
    ]);
    expect(result.touchedPlanning).toBe(true);
  });

  // AC2.2 — equal HEAD (0 ahead) -> not stale, no throw.
  it('returns {stale:false} when origin is equal (0 ahead)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({ originHead: 'refs/remotes/origin/main', fetch: '', revListCount: '0' });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // AC2.3 — touchedPlanning is false when the ahead commits miss .planning/.
  it('sets touchedPlanning false when no ahead commit touches .planning/', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: 'refs/remotes/origin/main',
      fetch: '',
      revListCount: '1',
      log: 'sha1 chore: src-only change',
      revListPlanning: '0',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(true);
    expect(result.aheadCount).toBe(1);
    expect(result.touchedPlanning).toBe(false);
  });

  // AC2.4 — offline / no-remote / fetch failure -> fail open.
  it('fails open ({stale:false}) when fetch throws (offline/no-remote)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: 'refs/remotes/origin/main',
      fetch: new Error('fatal: unable to access remote'),
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // AC2.5a — non-default branch resolved from origin/HEAD is threaded through.
  it('resolves a non-main default branch from origin/HEAD', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: 'refs/remotes/origin/develop',
      fetch: '',
      revListCount: '1',
      log: 'sha1 x',
      revListPlanning: '0',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(true);
    // fetch refspec + rev-range must use the resolved branch, by its full ref.
    const fetchCall = execFn.calls.find((a) => a.includes('fetch'));
    expect(fetchCall[fetchCall.length - 1]).toBe('refs/heads/develop');
    const revList = execFn.calls.find((a) => a[0] === 'rev-list' && !a.includes('.planning/'));
    expect(revList).toContain('HEAD..refs/remotes/origin/develop');
  });

  // AC2.5b — origin/HEAD unset and neither candidate ref here -> main.
  it('falls back to main when origin/HEAD is unset and no candidate branch is here', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: new Error('fatal: ref refs/remotes/origin/HEAD is not a symbolic ref'),
      present: [],
      fetch: '',
      revListCount: '0',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(false);
    const fetchCall = execFn.calls.find((a) => a.includes('fetch'));
    expect(fetchCall[fetchCall.length - 1]).toBe('refs/heads/main');
  });

  // AC2.5c — origin/HEAD unset, and exactly one of main/master is here -> that one.
  it('takes the one candidate branch present when origin/HEAD is unset', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: new Error('fatal: ref refs/remotes/origin/HEAD is not a symbolic ref'),
      present: ['refs/remotes/origin/master'],
      fetch: '',
      revListCount: '0',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(false);
    const fetchCall = execFn.calls.find((a) => a.includes('fetch'));
    expect(fetchCall[fetchCall.length - 1]).toBe('refs/heads/master');
  });

  // AC2.7 — fetch timeout (SIGKILL) -> drift check skipped, fail open.
  it('fails open when fetch times out (ETIMEDOUT/SIGKILL)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({ originHead: 'refs/remotes/origin/main', fetch: timeoutError() });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // Fail-open: diverged / force-pushed history -> rev-list count throws
  // (fatal: bad revision) -> not stale.
  it('fails open when rev-list count throws (diverged/bad revision)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: 'refs/remotes/origin/main',
      fetch: '',
      revListCount: new Error("fatal: bad revision 'HEAD..origin/main'"),
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // Null baseline: no last_updated_commit -> can't measure, no git calls.
  it('returns {stale:false} without fetching when STATE.md was never committed and last_updated_commit is null', async () => {
    await plantState(tempDir, { last_updated_commit: null });
    const execFn = makeExec({ originHead: 'refs/remotes/origin/main', fetch: '', revListCount: '5' });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
    expect(execFn.calls).toHaveLength(1); // only the baseline lookup
  });

  // No STATE.md at all -> fail open, no throw.
  it('returns {stale:false} when there is no STATE.md', async () => {
    const execFn = makeExec({ originHead: 'refs/remotes/origin/main', fetch: '', revListCount: '5' });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
    expect(execFn.calls).toHaveLength(0);
  });

  // log throwing keeps the count but empties commits[] (degrade, don't fail).
  it('keeps aheadCount but empties commits[] when git log throws', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      originHead: 'refs/remotes/origin/main',
      fetch: '',
      revListCount: '2',
      log: new Error('git log blew up'),
      revListPlanning: '1',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(true);
    expect(result.aheadCount).toBe(2);
    expect(result.commits).toEqual([]);
    expect(result.touchedPlanning).toBe(true);
  });

  // The fetch call must carry the hardened, non-interactive env + bounded
  // timeout (AD7) — the load-bearing NFR1/NFR2 anti-hang detail.
  it('issues a hardened, bounded, non-interactive fetch (AD7)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    let fetchOpts;
    const execFn = (cmd, args, opts) => {
      if (args[0] === 'symbolic-ref') return buf('refs/remotes/origin/main');
      if (args.includes('fetch')) { fetchOpts = opts; return buf(''); }
      if (args[0] === 'rev-list') return buf('0');
      return buf('');
    };
    await isStaleVsOrigin(tempDir, { execFn });
    expect(fetchOpts.timeout).toBeGreaterThan(0);
    expect(fetchOpts.killSignal).toBe('SIGKILL');
    expect(fetchOpts.env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(fetchOpts.env.GIT_ASKPASS).toBe('');
    expect(fetchOpts.env.GIT_SSH_COMMAND).toContain('BatchMode=yes');
  });

  // REVIEW F1 (both agents): readState throws StateSchemaError on an ahead /
  // missing-key schema — exactly the file the schema-drift banner exists to
  // surface. isStaleVsOrigin must fail open, not crash the command.
  it('REVIEW F1: fails open (no throw, no git) on a schema-drifted STATE.md', async () => {
    await plantState(tempDir, { schema_version: 999, last_updated_commit: 'abc123' });
    const execFn = makeExec({ originHead: 'refs/remotes/origin/main', fetch: '', revListCount: '3' });
    let result;
    await expect(
      (async () => { result = await isStaleVsOrigin(tempDir, { execFn }); })()
    ).resolves.not.toThrow();
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
    expect(execFn.calls).toHaveLength(0); // readState threw before any git call
  });

  // REVIEW Sec-2: a crafted last_updated_commit that git would parse as an
  // option (leading `-`, e.g. `--output=…`) must be rejected before it reaches
  // git argv, so it can never become an arbitrary-file-write primitive.
  it('REVIEW Sec-2: rejects an option-like last_updated_commit before any git call', async () => {
    await plantState(tempDir, { last_updated_commit: '--output=/tmp/pwned' });
    const execFn = makeExec({ originHead: 'refs/remotes/origin/main', fetch: '', revListCount: '3', log: 'x', revListPlanning: '1' });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
    expect(execFn.calls).toHaveLength(1); // only the baseline lookup
    expect(JSON.stringify(execFn.calls)).not.toContain('--output');
  });

  // --- B6/FR4: gate on genuine origin drift, not the bookkeeping "+1" (real
  // git fixtures with a bare remote) ---
  //
  // last_updated_commit lags HEAD by exactly the STATE-write commit, so the old
  // stored..origin range counted that local +1 as "origin ahead". The fix
  // measures HEAD..origin instead.

  // AC4.1 (origin): after a clean checkpoint+push HEAD == origin/main (the +1 is
  // a local STATE-only commit) -> NOT stale. RED against current code, which
  // counts stored..origin = the +1 = 1 and fires.
  it('B6/AC4.1: a clean checkpoint+push (HEAD == origin/main) is NOT stale', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'signal-origin-bare-'));
    git(bare, ['init', '--bare', '-q', '-b', 'main']);
    try {
      initRepo(tempDir);
      git(tempDir, ['remote', 'add', 'origin', bare]);
      await writeFile(join(tempDir, 'app.js'), 'v0\n', 'utf-8');
      commitAll(tempDir, 'base: initial work');
      const base = headSha(tempDir);
      await plantState(tempDir, { last_updated_commit: base }); // stored == HEAD~1
      commitAll(tempDir, 'chore: refresh STATE.md'); // STATE-only "+1"
      git(tempDir, ['push', '-q', 'origin', 'main']); // origin/main == HEAD == "+1"
      git(tempDir, ['fetch', '-q', 'origin', 'main']); // tracking ref current
      const result = await isStaleVsOrigin(tempDir, { execFn: realGitExceptFetch });
      expect(result.stale).toBe(false);
      expect(result.aheadCount).toBe(0);
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  }, 30000); // real-git fixture: generous timeout for parallel-suite load

  // AC4.2 (origin): a genuine remote push (local actually behind origin by N),
  // with the local bookkeeping +1 present. Correct aheadCount is N (== 2), NOT
  // N+1. RED against current code, which counts stored..origin = 3 (the +1 plus
  // the 2 real remote commits).
  it('B6/AC4.2: a genuine remote push fires with the correct aheadCount (N, not N+1)', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'signal-origin-bare-'));
    git(bare, ['init', '--bare', '-q', '-b', 'main']);
    const otherParent = await mkdtemp(join(tmpdir(), 'signal-origin-other-'));
    const other = join(otherParent, 'wc');
    try {
      initRepo(tempDir);
      git(tempDir, ['remote', 'add', 'origin', bare]);
      await writeFile(join(tempDir, 'app.js'), 'v0\n', 'utf-8');
      commitAll(tempDir, 'base: initial work');
      const base = headSha(tempDir);
      await plantState(tempDir, { last_updated_commit: base }); // stored == HEAD~1
      commitAll(tempDir, 'chore: refresh STATE.md'); // STATE-only "+1"
      git(tempDir, ['push', '-q', 'origin', 'main']);

      // Another machine pushes 2 genuine commits on top.
      execFileSync('git', ['clone', '-q', bare, other], { stdio: ['ignore', 'pipe', 'ignore'] });
      git(other, ['config', 'user.email', 't@t.co']);
      git(other, ['config', 'user.name', 'T']);
      git(other, ['config', 'commit.gpgsign', 'false']);
      await writeFile(join(other, 'feature.js'), 'a\n', 'utf-8');
      commitAll(other, 'feat: remote one');
      await writeFile(join(other, 'feature.js'), 'b\n', 'utf-8');
      commitAll(other, 'feat: remote two');
      git(other, ['push', '-q', 'origin', 'main']);

      git(tempDir, ['fetch', '-q', 'origin', 'main']); // refresh origin/main to the 2 new commits
      const result = await isStaleVsOrigin(tempDir, { execFn: realGitExceptFetch });
      expect(result.stale).toBe(true);
      expect(result.aheadCount).toBe(2);
    } finally {
      await rm(bare, { recursive: true, force: true });
      await rm(otherParent, { recursive: true, force: true });
    }
  }, 30000); // real-git fixture: generous timeout for parallel-suite load

  // Step 4: a project whose phases commit STATE.md with their work never
  // records last_updated_commit. The committed STATE.md is the baseline, so the
  // origin check still runs. Before step 4 it returned not-stale here, unasked.
  it('step 4: a committed STATE.md with no last_updated_commit still reports a remote push', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'signal-origin-bare-'));
    git(bare, ['init', '--bare', '-q', '-b', 'main']);
    const otherParent = await mkdtemp(join(tmpdir(), 'signal-origin-other-'));
    const other = join(otherParent, 'wc');
    try {
      initRepo(tempDir);
      git(tempDir, ['remote', 'add', 'origin', bare]);
      await plantState(tempDir, { last_updated_commit: null });
      commitAll(tempDir, 'phase: work + STATE');
      git(tempDir, ['push', '-q', 'origin', 'main']);

      execFileSync('git', ['clone', '-q', bare, other], { stdio: ['ignore', 'pipe', 'ignore'] });
      git(other, ['config', 'user.email', 't@t.co']);
      git(other, ['config', 'user.name', 'T']);
      git(other, ['config', 'commit.gpgsign', 'false']);
      await writeFile(join(other, 'feature.js'), 'a\n', 'utf-8');
      commitAll(other, 'feat: remote one');
      git(other, ['push', '-q', 'origin', 'main']);

      git(tempDir, ['fetch', '-q', 'origin', 'main']);
      const result = await isStaleVsOrigin(tempDir, { execFn: realGitExceptFetch });
      expect(result.stale).toBe(true);
      expect(result.aheadCount).toBe(1);
    } finally {
      await rm(bare, { recursive: true, force: true });
      await rm(otherParent, { recursive: true, force: true });
    }
  }, 30000); // real-git fixture: generous timeout for parallel-suite load

  // --- M6.E16 r6: the branch is read by its full ref, never looked up by a
  // short name (real git) ---
  //
  // `origin/main` as a NAME is also what a tag called `origin/main` answers
  // to, and git takes the tag first. Tags arrive with any fetch, so whoever
  // can push one could hide commits the remote really has, or invent some.

  // A clone of a remote whose default branch is `main`, one STATE-write commit
  // made and pushed, then two commits pushed from elsewhere and fetched: the
  // remote is 2 ahead of HEAD.
  async function twoBehind(work) {
    const bare = await mkdtemp(join(tmpdir(), 'signal-origin-bare-'));
    const otherParent = await mkdtemp(join(tmpdir(), 'signal-origin-other-'));
    const other = join(otherParent, 'wc');
    git(bare, ['init', '--bare', '-q', '-b', 'main']);
    initRepo(work);
    git(work, ['remote', 'add', 'origin', bare]);
    await writeFile(join(work, 'app.js'), 'v0\n', 'utf-8');
    commitAll(work, 'base: initial work');
    await plantState(work, { last_updated_commit: headSha(work) });
    commitAll(work, 'chore: refresh STATE.md');
    git(work, ['push', '-q', 'origin', 'main']);
    execFileSync('git', ['clone', '-q', bare, other], { stdio: ['ignore', 'pipe', 'ignore'] });
    git(other, ['config', 'user.email', 't@t.co']);
    git(other, ['config', 'user.name', 'T']);
    git(other, ['config', 'commit.gpgsign', 'false']);
    for (const v of ['a', 'b']) {
      await writeFile(join(other, 'feature.js'), `${v}\n`, 'utf-8');
      commitAll(other, `feat: remote ${v}`);
    }
    git(other, ['push', '-q', 'origin', 'main']);
    return { cleanup: async () => { await rm(bare, { recursive: true, force: true }); await rm(otherParent, { recursive: true, force: true }); } };
  }

  it('a tag named origin/main does not stand in for the remote branch', async () => {
    const { cleanup } = await twoBehind(tempDir);
    try {
      git(tempDir, ['fetch', '-q', 'origin', 'main']);
      git(tempDir, ['remote', 'set-head', 'origin', 'main']);
      git(tempDir, ['tag', 'origin/main', 'HEAD']); // the name now answers "nothing new"
      const result = await isStaleVsOrigin(tempDir, { execFn: realGitExceptFetch });
      expect(result).toMatchObject({ stale: true, aheadCount: 2 });
      expect(result.commits.map((c) => c.subject)).toEqual(['feat: remote b', 'feat: remote a']);
    } finally {
      await cleanup();
    }
  }, 30000);

  it('a tag named origin/HEAD does not change which branch is the default', async () => {
    const { cleanup } = await twoBehind(tempDir);
    try {
      git(tempDir, ['fetch', '-q', 'origin', 'main']);
      git(tempDir, ['remote', 'set-head', 'origin', 'main']);
      git(tempDir, ['tag', 'origin/HEAD', 'HEAD']);
      const calls = [];
      const execFn = (cmd, args, opts) => { calls.push(args); return realGitExceptFetch(cmd, args, opts); };
      expect(await isStaleVsOrigin(tempDir, { execFn })).toMatchObject({ stale: true, aheadCount: 2 });
      expect(calls.find((a) => a.includes('fetch')).at(-1)).toBe('refs/heads/main');
    } finally {
      await cleanup();
    }
  }, 30000);

  // The fetch names the branch by its full ref too, and that still moves the
  // remote-tracking ref the count is read from. The function's own fetch is
  // run here with its arguments and environment, without its 2 s limit.
  it('the fetch it issues (`origin refs/heads/<branch>`) brings the remote branch up to date', async () => {
    const { cleanup } = await twoBehind(tempDir);
    try {
      git(tempDir, ['remote', 'set-head', 'origin', 'main']); // nothing fetched yet: origin/main is where HEAD is
      const unbounded = (cmd, args, opts) => execFileSync(cmd, args, args.includes('fetch') ? { ...opts, timeout: undefined } : opts);
      expect(await isStaleVsOrigin(tempDir, { execFn: unbounded })).toMatchObject({ stale: true, aheadCount: 2 });
    } finally {
      await cleanup();
    }
  }, 30000);
});
