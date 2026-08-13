// Branch posture gate (B88).
//
// Signal's rules say every change reaches `main` through a branch and a pull
// request. Nothing enforced it. Measured across the corpus before this module
// existed: `grep -rln 'git branch --show-current|rev-parse --abbrev-ref'
// commands/ tools/lib/` returned NOTHING — not one of 20 commands and not one
// library module read the current branch, and none created one. The single
// `rev-parse --abbrev-ref` in `state.js` reads `origin/HEAD` (the remote's
// default branch NAME) for the staleness baseline; it never asks where you are.
//
// So the discipline lived entirely in `CLAUDE.md` and in whoever was driving
// remembering to read it. On a `eval-project-A` slice nobody did: five commits of real
// code reached `main` with no branch and therefore no PR, CI ran AFTER each push
// instead of gating it, and `git push` printed "Bypassed rule violations" and
// succeeded because `enforce_admins=false`.
//
// This is the fourth instance of one family, three of them verified in this
// repo: `B41` (four commands advanced no phase, so eleven releases recorded
// nothing), `B43` (`ship.md` claimed a SHIP close the ledger structurally
// cannot write), `D-M5E17-5` (`ship.md` granting itself the exemption its own
// Exit Criteria forbade). The mechanism exists, nothing reaches for it, and
// correctness depends on the operator already knowing.
//
// Those three are named WITHOUT naming the function they are about, which reads
// as fussy and is not. `adherence-leak.js` walks the whole tree for that token
// and classifies every hit as directive unless its FILE is allowlisted — the
// allowlist has no per-line grain. Earning an entry for two historical asides
// would permanently blind the leak walk to any real directive this module
// acquires later. Rewording costs nothing; widening a guard to fit my own prose
// costs the guard.
//
// ── Why this does NOT reuse state.js's default-branch resolution ─────────────
//
// `isStaleVsOrigin` resolves `origin/HEAD` and, on any failure, FALLS BACK TO
// `main` (AC2.5). That is correct there: it feeds an advisory banner, and a
// wrong guess costs one unnecessary line.
//
// It would be wrong here, in both directions at once. This gate HALTS. Guessing
// `main` when the real default is `master` lets the exact bug through unnoticed;
// guessing `main` when there is no remote at all halts someone whose repo has no
// PR to create. A gate that guesses produces false halts AND false clears from
// the same line of code, so this module resolves the default branch or reports
// that it could not — it never assumes one.
//
// ── Four outcomes, kept distinguishable ─────────────────────────────────────
//
// Same contract as `state-drift.js`, for the same reason (`B39`): a check that
// prints nothing when it could not look reads as a check that looked and found
// nothing. `CANNOT_DETERMINE` is a value on the record, not a rendering choice.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gate outcomes. Exactly one is returned; there is no default bucket.
 *
 *   OK               on a non-default branch — proceed silently
 *   ON_DEFAULT       HEAD is the default branch — HALT
 *   OVERRIDDEN       ON_DEFAULT, but the operator passed the override on purpose
 *   NOT_APPLICABLE   the gate correctly does not apply (tier exempt / no repo /
 *                    no remote — no remote means no PR, so nothing to protect)
 *   CANNOT_DETERMINE the gate could not look, and says why — never a halt
 */
export const BRANCH_GATE = Object.freeze({
  OK: 'ok',
  ON_DEFAULT: 'on-default',
  OVERRIDDEN: 'overridden',
  NOT_APPLICABLE: 'not-applicable',
  CANNOT_DETERMINE: 'cannot-determine',
});

/**
 * Tiers the gate enforces.
 *
 * Derived from `references/tier-definitions.md`, not from taste:
 *   SKETCH — "Gates off"; the tier exists "to stop Signal from over-engineering
 *            throwaway work."
 *   SPIKE  — output is "A findings document summarizing the learning. Not a
 *            PR." Halting a spike for lacking a branch, in a tier whose own
 *            definition says it produces no PR, would be a fresh instance of
 *            `B89` — one instruction contradicting another.
 *
 * FEATURE and FULL both run all 7 phases and both end at a PR.
 */
export const ENFORCED_TIERS = Object.freeze(['FEATURE', 'FULL']);

/** The deliberate way past a halt. Typed on purpose, recorded in the halt copy. */
export const OVERRIDE_FLAG = '--allow-default-branch';

/** Candidates used only to disambiguate an UNSET `origin/HEAD`. Never a guess. */
const DEFAULT_BRANCH_CANDIDATES = Object.freeze(['main', 'master']);

function git(baseDir, args, execFn) {
  return String(
    execFn('git', args, { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] })
  ).trim();
}

/**
 * Is `baseDir` inside a git work tree? A `.git` file (not directory) is a
 * worktree pointer and counts.
 *
 * @returns {boolean}
 */
export function isGitRepo(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  if (!existsSync(join(baseDir, '.git'))) {
    // Not conclusive: baseDir may be a subdirectory of the work tree.
    try {
      return git(baseDir, ['rev-parse', '--is-inside-work-tree'], execFn) === 'true';
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * The branch HEAD currently points at.
 *
 * @returns {string|null} null on detached HEAD (empty output) or any failure.
 */
export function readCurrentBranch(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  try {
    const out = git(baseDir, ['branch', '--show-current'], execFn);
    return out === '' ? null : out;
  } catch {
    return null;
  }
}

/**
 * Whether the repo has any remote at all. No remote → no PR → nothing this
 * gate protects, so the gate reports NOT_APPLICABLE rather than halting.
 *
 * @returns {boolean|null} null if the question itself could not be asked.
 */
export function hasRemote(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  try {
    return git(baseDir, ['remote'], execFn) !== '';
  } catch {
    return null;
  }
}

/**
 * The remote's default branch, resolved or NOT AT ALL.
 *
 * 1. `origin/HEAD` — authoritative. Set by `git clone`.
 * 2. Unset (common: `git remote add` never sets it) → disambiguate against the
 *    remote refs that actually exist. Exactly one of main/master present → that
 *    one. Both or neither → null, because picking either would be a guess.
 *
 * Offline throughout — `for-each-ref` reads local refs, no network.
 *
 * @returns {string|null} null means "could not determine", never "main".
 */
export function resolveDefaultBranch(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  try {
    const ref = git(baseDir, ['rev-parse', '--abbrev-ref', 'origin/HEAD'], execFn);
    // An unset origin/HEAD prints the literal string back and exits 128; some
    // git versions print it and exit 0, so the literal is checked either way.
    if (ref && ref !== 'origin/HEAD') {
      return ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref;
    }
  } catch {
    // fall through to disambiguation
  }

  const present = DEFAULT_BRANCH_CANDIDATES.filter((name) => {
    try {
      return git(baseDir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${name}`], execFn) !== '';
    } catch {
      return false;
    }
  });
  return present.length === 1 ? present[0] : null;
}

/**
 * The gate. Read-only, offline, deterministic; never throws.
 *
 * @param {string} baseDir
 * @param {{tier?: string|null, override?: boolean, execFn?: Function}} opts
 * @returns {{status: string, currentBranch: string|null, defaultBranch: string|null, reason: string|null}}
 */
export function checkBranchPosture(baseDir, opts = {}) {
  const { tier = null, override = false } = opts;
  const execFn = opts.execFn ?? execFileSync;
  const base = (status, extra = {}) => ({
    status,
    currentBranch: null,
    defaultBranch: null,
    reason: null,
    ...extra,
  });

  if (tier && !ENFORCED_TIERS.includes(tier)) {
    return base(BRANCH_GATE.NOT_APPLICABLE, {
      reason: `tier ${tier} does not end at a pull request`,
    });
  }

  if (!isGitRepo(baseDir, { execFn })) {
    return base(BRANCH_GATE.NOT_APPLICABLE, { reason: 'not a git repository' });
  }

  const remote = hasRemote(baseDir, { execFn });
  if (remote === null) {
    return base(BRANCH_GATE.CANNOT_DETERMINE, {
      reason: 'could not list git remotes',
    });
  }
  if (remote === false) {
    return base(BRANCH_GATE.NOT_APPLICABLE, {
      reason: 'no git remote — there is no pull request to open',
    });
  }

  const currentBranch = readCurrentBranch(baseDir, { execFn });
  if (currentBranch === null) {
    return base(BRANCH_GATE.CANNOT_DETERMINE, {
      reason: 'HEAD is detached or the current branch could not be read',
    });
  }

  const defaultBranch = resolveDefaultBranch(baseDir, { execFn });
  if (defaultBranch === null) {
    return base(BRANCH_GATE.CANNOT_DETERMINE, {
      currentBranch,
      reason:
        'origin/HEAD is unset and neither origin/main nor origin/master is unambiguously present',
    });
  }

  if (currentBranch !== defaultBranch) {
    return base(BRANCH_GATE.OK, { currentBranch, defaultBranch });
  }

  return base(override ? BRANCH_GATE.OVERRIDDEN : BRANCH_GATE.ON_DEFAULT, {
    currentBranch,
    defaultBranch,
    reason: `HEAD is the default branch (${defaultBranch})`,
  });
}

/**
 * Copy for a halt. Names the branch, the fix, and the override — a gate that
 * blocks without saying how to proceed teaches people to route around it.
 *
 * @param {{defaultBranch: string|null}} result
 * @param {{command: string, suggestedBranch?: string}} ctx
 * @returns {string}
 */
export function formatBranchHalt(result, ctx) {
  const suggested = ctx.suggestedBranch ?? 'feat/<short-name>';
  return [
    `HALT — you are on ${result.defaultBranch}, the default branch.`,
    '',
    `Signal's rule is that every change reaches ${result.defaultBranch} through a branch and a`,
    'pull request with a green test check. Committing here bypasses both, and once the',
    `commits have landed on ${result.defaultBranch} there is nothing left to open a PR from.`,
    '',
    'Fix — create a branch, then re-run:',
    `    git checkout -b ${suggested}`,
    `    ${ctx.command}`,
    '',
    `Working directly on ${result.defaultBranch} on purpose? Re-run with ${OVERRIDE_FLAG}.`,
  ].join('\n');
}

/**
 * Copy for CANNOT_DETERMINE. Renders as its own outcome — "could not check"
 * must never read the same as "checked and clean" (`B39`).
 *
 * @returns {string}
 */
export function formatBranchUnknown(result) {
  return [
    `⚠ Branch check could not run: ${result.reason}.`,
    '   Proceeding — but confirm yourself that you are not on the default branch.',
  ].join('\n');
}

/** Bounded so a `gh` auth prompt cannot wedge a ship run. */
const GH_TIMEOUT_MS = 5000;

/**
 * Evidence that a pull request actually exists for the current branch.
 *
 * `ship.md`'s Exit Criteria has read `- [ ] PR created with description, test
 * plan` since 2026-05-26. A checkbox is satisfied from the felt sense of having
 * shipped: thirteen releases were ticked against it while exactly ONE pull
 * request existed in that span. That is the `CLAIM-INTEGRITY-ANALYSIS.md` class
 * — a completeness claim written from the shape of the work rather than from
 * the artifact — so the criterion now has to be filled from a URL this function
 * returned, not from memory.
 *
 * Capability-checked and fail-open: no `gh`, not authed, offline, or no PR yet
 * are all distinguishable outcomes, and none of them halt. `NOT FOUND` is a
 * real answer; `CANNOT_DETERMINE` is not the same thing and never renders as one.
 *
 * @returns {{status: 'found'|'none'|'cannot-determine', url: string|null, state: string|null, reason: string|null}}
 */
export function readPullRequestEvidence(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const run = (args) =>
    String(
      execFn('gh', args, {
        cwd: baseDir,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: opts.timeoutMs ?? GH_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
      })
    ).trim();

  try {
    run(['auth', 'status']);
  } catch {
    return {
      status: 'cannot-determine',
      url: null,
      state: null,
      reason: 'gh is not installed or not authenticated',
    };
  }

  let raw;
  try {
    raw = run(['pr', 'view', '--json', 'url,state,number']);
  } catch {
    // `gh pr view` exits non-zero both for "no PR for this branch" and for a
    // genuine failure. They are NOT the same outcome and must not collapse, so
    // the branch posture disambiguates: a PR cannot exist for the default
    // branch, which makes "none" the correct reading rather than a guess.
    const posture = checkBranchPosture(baseDir, { execFn });
    if (posture.status === BRANCH_GATE.ON_DEFAULT || posture.status === BRANCH_GATE.OVERRIDDEN) {
      return {
        status: 'none',
        url: null,
        state: null,
        reason: `HEAD is ${posture.defaultBranch}; a pull request cannot exist for the default branch`,
      };
    }
    return {
      status: 'cannot-determine',
      url: null,
      state: null,
      reason: 'gh pr view failed (no PR for this branch, or the query itself failed)',
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.url !== 'string' || parsed.url === '') {
      return {
        status: 'cannot-determine',
        url: null,
        state: null,
        reason: 'gh returned no url field',
      };
    }
    return {
      status: 'found',
      url: parsed.url,
      state: typeof parsed.state === 'string' ? parsed.state : null,
      reason: null,
    };
  } catch {
    return {
      status: 'cannot-determine',
      url: null,
      state: null,
      reason: 'gh returned unparseable JSON',
    };
  }
}

/**
 * The Exit-Criteria line, rendered from evidence. Never returns a bare ticked
 * box — the whole point is that the criterion carries what satisfied it.
 *
 * @returns {string}
 */
export function formatPrEvidenceLine(evidence) {
  switch (evidence.status) {
    case 'found':
      return `- [x] PR created with description and test plan — ${evidence.url}${
        evidence.state ? ` (${evidence.state})` : ''
      }`;
    case 'none':
      return `- [ ] PR created — NONE EXISTS: ${evidence.reason}`;
    default:
      return `- [ ] PR created — UNVERIFIED: ${evidence.reason}. Paste the PR URL here by hand.`;
  }
}

/**
 * One-line summary for a report. Returns null for OK — a passing gate that
 * announces itself is noise, and OK is the common case.
 *
 * @returns {string|null}
 */
export function formatBranchLine(result) {
  switch (result.status) {
    case BRANCH_GATE.OK:
      return null;
    case BRANCH_GATE.ON_DEFAULT:
      return `Branch: HALT — on ${result.defaultBranch} (the default branch).`;
    case BRANCH_GATE.OVERRIDDEN:
      return `Branch: on ${result.defaultBranch} — allowed by ${OVERRIDE_FLAG}.`;
    case BRANCH_GATE.NOT_APPLICABLE:
      return `Branch: not checked — ${result.reason}.`;
    case BRANCH_GATE.CANNOT_DETERMINE:
      return `Branch: could not check — ${result.reason}.`;
    default:
      return null;
  }
}
