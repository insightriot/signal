// Tests for isStaleVsOrigin (M4.5.E10.S1.t2, FR2 origin-drift).
//
// Unlike isStateStale (local last_updated_commit..HEAD), this compares the
// STATE.md commit against the *remote* default branch after a bounded,
// non-interactive fetch. The whole surface is fail-open: every git failure
// mode (offline, no remote, timeout, auth-hang, unset origin/HEAD, diverged
// history, non-git dir) must resolve to {stale:false} and never throw.
//
// The execFn stub dispatches by subcommand (rev-parse / fetch / rev-list /
// log) because a single run makes up to four distinct git calls with
// different expected outputs — the flat one-value stubs used by
// is-state-stale.test.js can't model that.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { isStaleVsOrigin, stringifyFrontmatter } from '../tools/lib/state.js';

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
    if (args[0] === 'rev-parse') return respond(responses.revParse);
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
      revParse: 'origin/main',
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
    const execFn = makeExec({ revParse: 'origin/main', fetch: '', revListCount: '0' });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // AC2.3 — touchedPlanning is false when the ahead commits miss .planning/.
  it('sets touchedPlanning false when no ahead commit touches .planning/', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      revParse: 'origin/main',
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
      revParse: 'origin/main',
      fetch: new Error('fatal: unable to access remote'),
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // AC2.5a — non-default branch resolved from origin/HEAD is threaded through.
  it('resolves a non-main default branch from origin/HEAD', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      revParse: 'origin/develop',
      fetch: '',
      revListCount: '1',
      log: 'sha1 x',
      revListPlanning: '0',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(true);
    // fetch refspec + rev-range must use the resolved branch.
    const fetchCall = execFn.calls.find((a) => a.includes('fetch'));
    expect(fetchCall[fetchCall.length - 1]).toBe('develop');
    const revList = execFn.calls.find((a) => a[0] === 'rev-list' && !a.includes('.planning/'));
    expect(revList).toContain('stored123..origin/develop');
  });

  // AC2.5b — literal 'origin/HEAD' (unset symbolic ref) falls back to main.
  it('falls back to main when origin/HEAD is unset (literal output)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      revParse: 'origin/HEAD',
      fetch: '',
      revListCount: '0',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(false);
    const fetchCall = execFn.calls.find((a) => a.includes('fetch'));
    expect(fetchCall[fetchCall.length - 1]).toBe('main');
  });

  // AC2.5c — rev-parse throwing (unset origin/HEAD exits 128) -> main.
  it('falls back to main when rev-parse origin/HEAD throws (exit 128)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      revParse: new Error('fatal: ref refs/remotes/origin/HEAD is not a symbolic ref'),
      fetch: '',
      revListCount: '0',
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result.stale).toBe(false);
    const fetchCall = execFn.calls.find((a) => a.includes('fetch'));
    expect(fetchCall[fetchCall.length - 1]).toBe('main');
  });

  // AC2.7 — fetch timeout (SIGKILL) -> drift check skipped, fail open.
  it('fails open when fetch times out (ETIMEDOUT/SIGKILL)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({ revParse: 'origin/main', fetch: timeoutError() });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // Fail-open: diverged / force-pushed history -> rev-list count throws
  // (fatal: bad revision) -> not stale.
  it('fails open when rev-list count throws (diverged/bad revision)', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      revParse: 'origin/main',
      fetch: '',
      revListCount: new Error("fatal: bad revision 'stored123..origin/main'"),
    });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
  });

  // Null baseline: no last_updated_commit -> can't measure, no git calls.
  it('returns {stale:false} with no git calls when last_updated_commit is null', async () => {
    await plantState(tempDir, { last_updated_commit: null });
    const execFn = makeExec({ revParse: 'origin/main', fetch: '', revListCount: '5' });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
    expect(execFn.calls).toHaveLength(0);
  });

  // No STATE.md at all -> fail open, no throw.
  it('returns {stale:false} when there is no STATE.md', async () => {
    const execFn = makeExec({ revParse: 'origin/main', fetch: '', revListCount: '5' });
    const result = await isStaleVsOrigin(tempDir, { execFn });
    expect(result).toEqual({ stale: false, aheadCount: 0, commits: [], touchedPlanning: false });
    expect(execFn.calls).toHaveLength(0);
  });

  // log throwing keeps the count but empties commits[] (degrade, don't fail).
  it('keeps aheadCount but empties commits[] when git log throws', async () => {
    await plantState(tempDir, { last_updated_commit: 'stored123' });
    const execFn = makeExec({
      revParse: 'origin/main',
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
      if (args[0] === 'rev-parse') return buf('origin/main');
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
});
