// Branch posture gate (B88).
//
// Tested against REAL git repositories, not a stubbed `execFn`, for the reason
// the bug exists at all: every claim here is a claim about git's actual
// behaviour — what `origin/HEAD` prints when unset, what `branch --show-current`
// prints on a detached HEAD — and a stub would only pin what I believed those
// were. The stub-driven tests below are limited to the cases a real repo cannot
// produce on demand (git itself failing).
//
// The load-bearing test is `resolveDefaultBranch` on a `master` repo. `state.js`
// falls back to the literal 'main' when it cannot resolve, which would clear a
// `master`-default project to work directly on `master` — the exact bug, waved
// through by the guard built to catch it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

import {
  BRANCH_GATE,
  ENFORCED_TIERS,
  OVERRIDE_FLAG,
  checkBranchPosture,
  formatBranchHalt,
  formatBranchLine,
  formatBranchUnknown,
  formatPrEvidenceLine,
  hasRemote,
  isGitRepo,
  readCurrentBranch,
  readPullRequestEvidence,
  resolveDefaultBranch,
} from '../plugin/tools/lib/branch-guard.js';

// --- fixture builders -------------------------------------------------------

function g(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r;
}

/**
 * A clone whose `origin/HEAD` is genuinely set by git, plus the bare remote it
 * came from. `defaultBranch` drives the remote's initial branch.
 */
async function plantClone(root, defaultBranch = 'main') {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  await mkdir(seed, { recursive: true });

  g(root, 'init', '--bare', '-b', defaultBranch, remote);
  g(seed, 'init', '-b', defaultBranch);
  g(seed, 'config', 'user.email', 't@example.com');
  g(seed, 'config', 'user.name', 'T');
  g(seed, 'commit', '--allow-empty', '-m', 'seed');
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-u', 'origin', defaultBranch);

  g(root, 'clone', remote, work);
  g(work, 'config', 'user.email', 't@example.com');
  g(work, 'config', 'user.name', 'T');
  return { remote, seed, work };
}

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-branch-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// --- resolveDefaultBranch: resolve or admit it cannot --------------------------

describe('resolveDefaultBranch — never guesses', () => {
  it('reads origin/HEAD when git set it (main)', async () => {
    const { work } = await plantClone(dir, 'main');
    expect(resolveDefaultBranch(work)).toBe('main');
  });

  it('B88 regression — a master-default repo resolves to master, not the literal "main"', async () => {
    const { work } = await plantClone(dir, 'master');
    // state.js's isStaleVsOrigin would answer 'main' here by fallback. If this
    // gate did the same, a project defaulting to master would be told it is on
    // a feature branch while sitting on its default branch.
    expect(resolveDefaultBranch(work)).toBe('master');
    const posture = checkBranchPosture(work, { tier: 'FULL' });
    expect(posture.status).toBe(BRANCH_GATE.ON_DEFAULT);
    expect(posture.defaultBranch).toBe('master');
  });

  it('origin/HEAD unset + exactly one candidate remote ref → that ref', async () => {
    const { work } = await plantClone(dir, 'main');
    g(work, 'remote', 'set-head', 'origin', '--delete');
    expect(resolveDefaultBranch(work)).toBe('main');
  });

  it('origin/HEAD unset + BOTH origin/main and origin/master → null, not a coin flip', async () => {
    const { work, remote } = await plantClone(dir, 'main');
    g(work, 'checkout', '-b', 'master');
    g(work, 'commit', '--allow-empty', '-m', 'x');
    g(work, 'push', '-u', 'origin', 'master');
    g(work, 'remote', 'set-head', 'origin', '--delete');
    expect(remote).toBeTruthy();
    expect(resolveDefaultBranch(work)).toBeNull();
  });

  it('origin/HEAD unset + neither candidate present → null', async () => {
    const { work } = await plantClone(dir, 'trunk');
    g(work, 'remote', 'set-head', 'origin', '--delete');
    expect(resolveDefaultBranch(work)).toBeNull();
  });
});

// --- the gate ---------------------------------------------------------------

describe('checkBranchPosture', () => {
  it('OK on a feature branch', async () => {
    const { work } = await plantClone(dir);
    g(work, 'checkout', '-b', 'feat/thing');
    const r = checkBranchPosture(work, { tier: 'FEATURE' });
    expect(r.status).toBe(BRANCH_GATE.OK);
    expect(r.currentBranch).toBe('feat/thing');
    expect(r.defaultBranch).toBe('main');
  });

  it('ON_DEFAULT on the default branch — this is the halt', async () => {
    const { work } = await plantClone(dir);
    const r = checkBranchPosture(work, { tier: 'FEATURE' });
    expect(r.status).toBe(BRANCH_GATE.ON_DEFAULT);
    expect(r.reason).toContain('main');
  });

  it('OVERRIDDEN when the operator passes the flag on purpose', async () => {
    const { work } = await plantClone(dir);
    const r = checkBranchPosture(work, { tier: 'FEATURE', override: true });
    expect(r.status).toBe(BRANCH_GATE.OVERRIDDEN);
    expect(r.defaultBranch).toBe('main');
  });

  it('NOT_APPLICABLE for SKETCH and SPIKE, enforced for FEATURE and FULL', async () => {
    const { work } = await plantClone(dir);
    for (const tier of ['SKETCH', 'SPIKE']) {
      expect(checkBranchPosture(work, { tier }).status).toBe(BRANCH_GATE.NOT_APPLICABLE);
    }
    for (const tier of ENFORCED_TIERS) {
      expect(checkBranchPosture(work, { tier }).status).toBe(BRANCH_GATE.ON_DEFAULT);
    }
  });

  it('SPIKE is exempt because its own tier definition says it produces no PR', () => {
    // Pinned against references/tier-definitions.md so the exemption cannot be
    // quietly widened: enforcement is exactly the two tiers that end at a PR.
    expect(ENFORCED_TIERS).toEqual(['FEATURE', 'FULL']);
    expect(ENFORCED_TIERS).not.toContain('SPIKE');
    expect(ENFORCED_TIERS).not.toContain('SKETCH');
  });

  it('NOT_APPLICABLE outside a git repo', async () => {
    const plain = join(dir, 'plain');
    await mkdir(plain, { recursive: true });
    const r = checkBranchPosture(plain, { tier: 'FULL' });
    expect(r.status).toBe(BRANCH_GATE.NOT_APPLICABLE);
    expect(r.reason).toContain('not a git repository');
  });

  it('NOT_APPLICABLE with no remote — no remote means no PR to protect', async () => {
    const solo = join(dir, 'solo');
    await mkdir(solo, { recursive: true });
    g(solo, 'init', '-b', 'main');
    g(solo, 'config', 'user.email', 't@example.com');
    g(solo, 'config', 'user.name', 'T');
    g(solo, 'commit', '--allow-empty', '-m', 'x');
    const r = checkBranchPosture(solo, { tier: 'FULL' });
    expect(r.status).toBe(BRANCH_GATE.NOT_APPLICABLE);
    expect(r.reason).toContain('no git remote');
  });

  it('CANNOT_DETERMINE on a detached HEAD — and does not halt', async () => {
    const { work } = await plantClone(dir);
    const sha = g(work, 'rev-parse', 'HEAD').stdout.trim();
    g(work, 'checkout', sha);
    const r = checkBranchPosture(work, { tier: 'FULL' });
    expect(r.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(r.status).not.toBe(BRANCH_GATE.ON_DEFAULT);
  });

  it('CANNOT_DETERMINE when origin/HEAD is unresolvable, rather than assuming main', async () => {
    const { work } = await plantClone(dir, 'trunk');
    g(work, 'remote', 'set-head', 'origin', '--delete');
    const r = checkBranchPosture(work, { tier: 'FULL' });
    expect(r.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(r.reason).toContain('origin/HEAD');
  });

  it('never throws when git itself fails', () => {
    const boom = () => {
      throw new Error('git exploded');
    };
    const r = checkBranchPosture(dir, { tier: 'FULL', execFn: boom });
    expect(r.status).toBe(BRANCH_GATE.NOT_APPLICABLE);
    expect(() => checkBranchPosture(dir, { tier: 'FULL', execFn: boom })).not.toThrow();
  });

  it('a git repo whose remote listing fails reports CANNOT_DETERMINE, not clean', async () => {
    const { work } = await plantClone(dir);
    const execFn = (cmd, args, opts) => {
      if (args[0] === 'remote' && args.length === 1) throw new Error('nope');
      return spawnSync(cmd, args, { ...opts, encoding: 'utf8' }).stdout ?? '';
    };
    const r = checkBranchPosture(work, { tier: 'FULL', execFn });
    expect(r.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
  });
});

// --- helpers report honestly ------------------------------------------------

describe('primitives', () => {
  it('isGitRepo / readCurrentBranch / hasRemote', async () => {
    const { work } = await plantClone(dir);
    expect(isGitRepo(work)).toBe(true);
    expect(readCurrentBranch(work)).toBe('main');
    expect(hasRemote(work)).toBe(true);
  });

  it('readCurrentBranch returns null on detached HEAD rather than a sha', async () => {
    const { work } = await plantClone(dir);
    const sha = g(work, 'rev-parse', 'HEAD').stdout.trim();
    g(work, 'checkout', sha);
    expect(readCurrentBranch(work)).toBeNull();
  });
});

// --- rendering: "could not check" never reads as "checked and clean" (B39) ----

describe('rendering', () => {
  it('OK renders no line; every other outcome renders a distinct one', () => {
    const line = (status, extra = {}) =>
      formatBranchLine({ status, currentBranch: 'x', defaultBranch: 'main', reason: 'r', ...extra });
    expect(line(BRANCH_GATE.OK)).toBeNull();

    const rendered = [
      line(BRANCH_GATE.ON_DEFAULT),
      line(BRANCH_GATE.OVERRIDDEN),
      line(BRANCH_GATE.NOT_APPLICABLE),
      line(BRANCH_GATE.CANNOT_DETERMINE),
    ];
    expect(rendered.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
    expect(new Set(rendered).size).toBe(4);
  });

  it('CANNOT_DETERMINE says "could not check", NOT_APPLICABLE says "not checked"', () => {
    const cannot = formatBranchLine({
      status: BRANCH_GATE.CANNOT_DETERMINE,
      reason: 'detached',
      currentBranch: null,
      defaultBranch: null,
    });
    const na = formatBranchLine({
      status: BRANCH_GATE.NOT_APPLICABLE,
      reason: 'tier SKETCH does not end at a pull request',
      currentBranch: null,
      defaultBranch: null,
    });
    expect(cannot).toMatch(/could not check/);
    expect(na).toMatch(/not checked/);
    expect(cannot).not.toBe(na);
  });

  it('the unknown banner proceeds rather than halting, and says so', () => {
    const copy = formatBranchUnknown({ reason: 'HEAD is detached' });
    expect(copy).toMatch(/could not run/);
    expect(copy).toMatch(/Proceeding/);
  });

  it('the halt names the branch, the fix command, and the override', () => {
    const copy = formatBranchHalt(
      { defaultBranch: 'main' },
      { command: '/sig:execute', suggestedBranch: 'feat/x' }
    );
    expect(copy).toMatch(/^HALT/);
    expect(copy).toContain('main');
    expect(copy).toContain('git checkout -b feat/x');
    expect(copy).toContain('/sig:execute');
    expect(copy).toContain(OVERRIDE_FLAG);
  });
});

// --- the mechanism is REACHED, not merely present ----------------------------
//
// The defect class behind B87, B88 and B90, named in `17e445c`: the capability
// exists, nothing reaches for it, and correctness depends on the operator
// already knowing. A branch-guard module that no command calls would be the
// fourth instance, shipped inside the fix for the third. So the wiring is
// pinned, not assumed — the same discipline as prescribed-cli.test.js checking
// a command file against a manifest rather than against someone's memory.

describe('B88 — the guard is wired into the commands that need it', () => {
  const COMMANDS = join(REPO, 'plugin', 'commands');

  it('execute.md and ship.md both call checkBranchPosture from the module', async () => {
    for (const file of ['execute.md', 'ship.md']) {
      const src = await readFile(join(COMMANDS, file), 'utf8');
      expect(src, `${file} must call the gate`).toContain('checkBranchPosture');
      expect(src, `${file} must name the module`).toContain('branch-guard.js');
    }
  });

  it('every halt site tells the operator how to proceed, including the override', async () => {
    for (const file of ['execute.md', 'ship.md']) {
      const src = await readFile(join(COMMANDS, file), 'utf8');
      expect(src, `${file} must render the halt copy`).toContain('formatBranchHalt');
      expect(src, `${file} must handle the blind case distinctly`).toContain(
        'formatBranchUnknown'
      );
      expect(src, `${file} must name the override`).toContain(OVERRIDE_FLAG);
    }
  });

  it('ship.md fills the PR exit criterion from evidence, with no tickable box left behind', async () => {
    const src = await readFile(join(COMMANDS, 'ship.md'), 'utf8');
    expect(src).toContain('readPullRequestEvidence');
    expect(src).toContain('formatPrEvidenceLine');
    // The old hand-tickable line must be gone, not merely supplemented — a
    // checkbox sitting next to the evidence line is still a checkbox.
    //
    // ANCHORED TO LINE START, and that is the substantive part. The first cut
    // of this assertion was unanchored and failed on the replacement's own
    // inline quotation of the line it retired. An unanchored match cannot tell
    // a live checklist item from copy *about* one — and it is being read as
    // "no tickable box exists", so it has to mean that. A checklist item is
    // live only at line start; anywhere else it is prose.
    expect(src).not.toMatch(/^- \[ \] PR created/m);
  });

  it('execute.md gates before the phase-entry call, so a halt records no phase', async () => {
    const src = await readFile(join(COMMANDS, 'execute.md'), 'utf8');
    const gateAt = src.indexOf('checkBranchPosture');
    const phaseEntryAt = src.indexOf("transitionPhase(baseDir, 'EXECUTE')");
    expect(gateAt).toBeGreaterThan(-1);
    expect(phaseEntryAt).toBeGreaterThan(-1);
    // B48: a halted command must not write a phase entry for work it refused.
    expect(gateAt).toBeLessThan(phaseEntryAt);
  });
});

// --- PR evidence: the checkbox cannot be ticked from memory -------------------

describe('readPullRequestEvidence / formatPrEvidenceLine', () => {
  it('no gh (or not authed) → cannot-determine, and the line is NOT ticked', () => {
    const execFn = () => {
      throw new Error('gh: command not found');
    };
    const ev = readPullRequestEvidence(dir, { execFn });
    expect(ev.status).toBe('cannot-determine');
    const line = formatPrEvidenceLine(ev);
    expect(line).toContain('UNVERIFIED');
    expect(line.startsWith('- [ ]')).toBe(true);
  });

  it('a real PR → ticked, carrying the URL as the evidence', () => {
    const execFn = (_cmd, args) => {
      if (args[0] === 'auth') return '';
      return JSON.stringify({ url: 'https://github.com/o/r/pull/7', state: 'OPEN', number: 7 });
    };
    const ev = readPullRequestEvidence(dir, { execFn });
    expect(ev.status).toBe('found');
    const line = formatPrEvidenceLine(ev);
    expect(line.startsWith('- [x]')).toBe(true);
    expect(line).toContain('https://github.com/o/r/pull/7');
  });

  it('no PR is possible from the default branch → "none", distinct from unverified', async () => {
    const { work } = await plantClone(dir);
    const execFn = (cmd, args, opts) => {
      if (cmd === 'gh' && args[0] === 'auth') return '';
      if (cmd === 'gh') throw new Error('no pull requests found');
      return spawnSync(cmd, args, { ...opts, encoding: 'utf8' }).stdout ?? '';
    };
    const ev = readPullRequestEvidence(work, { execFn });
    expect(ev.status).toBe('none');
    expect(ev.reason).toContain('default branch');
    expect(formatPrEvidenceLine(ev)).toContain('NONE EXISTS');
  });

  it('unparseable gh output is cannot-determine, never a silent tick', () => {
    const execFn = (_cmd, args) => (args[0] === 'auth' ? '' : 'not json');
    const ev = readPullRequestEvidence(dir, { execFn });
    expect(ev.status).toBe('cannot-determine');
    expect(formatPrEvidenceLine(ev).startsWith('- [ ]')).toBe(true);
  });

  it('NO status renders a ticked box without a URL in it', () => {
    for (const ev of [
      { status: 'none', url: null, state: null, reason: 'r' },
      { status: 'cannot-determine', url: null, state: null, reason: 'r' },
      { status: 'found', url: 'https://x/pull/1', state: 'OPEN', reason: null },
    ]) {
      const line = formatPrEvidenceLine(ev);
      if (line.startsWith('- [x]')) expect(line).toContain('http');
    }
  });
});
