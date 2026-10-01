// Work that is open on a branch other than the one checked out — `B118`.
//
// WHY THIS EXISTS. `/sig:drive` and `/sig:advise` both answer "what should I work
// on?", and both read `.planning/` from the working tree — one branch. `M6.E8` sat
// open at DISCUSS on `feat/m6.e8-advisor-ranking-inputs` while a run on `main`
// reported no open Epic and offered 51 backlog rows as the full set of things to
// start. The read succeeded, so nothing landed in `cannotCheck`: the guard ran, and
// its scope was narrower than the guarantee its output implied. "No open Epic" must
// mean no open Epic, never "none on the branch I happen to be standing on".
//
// It lives here, not in `drive.js`, because both callers have the same blindness
// and a fix in one leaves the other (the PR reviewer on `#248` found exactly that).
//
// WHAT COUNTS AS OPEN ELSEWHERE — each rule removes a measured source of noise.
// On this repository, 31 branch tips are not ancestors of `main`: 30 name an Epic
// that has shipped (squash-merged or stale), and 1 names none. So:
//   1. Only tips NOT already contained in HEAD are read (`--no-merged=HEAD`).
//   2. The branch's own STATE.md must name a `current_epic` with no SHIP in
//      `completed_phases`.
//   3. The Epic must not already be finished HERE — no `{epic}-RETROSPECTIVE.md`
//      or `{epic}-SHIP.md` anywhere under `.planning/` on HEAD. This is the check
//      that catches squash merges, which rule 1 cannot see.
//   4. An Epic equal to the local `current_epic` is the local work, not other work.
//   5. The branch's STATE.md must not be a version HEAD's history already holds.
//      An untouched fork carries this project's past; a squash merge lands the
//      branch's final STATE.md here. Either way it is not work in progress. This
//      is the only finished-here check for Epic ids that are not M-shaped, which
//      never get a retrospective file (`deriveRetroPath` refuses them).
//      Known limits: a squash merge whose STATE.md was edited during the merge can
//      still read as open; a branch with code commits that never touched STATE.md,
//      and an open branch whose exact STATE.md reached HEAD by cherry-pick (or by a
//      squash later reverted), are not seen.
// A branch whose STATE.md names no Epic cannot be compared by identity, so it is
// COUNTED and reported rather than dropped — silence about blindness is the defect.
//
// It never checks out, fetches, or writes. Remote refs are as fresh as the last
// fetch, and the result says so through `cannotCheck` when git is unavailable.

import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

import { parseFrontmatter, partitionCompletedPhases } from './state.js';

const GIT_TIMEOUT_MS = 5000;
const STATE_REL = '.planning/STATE.md'; // read as `./${STATE_REL}` — see the cat-file note

function defaultGit(baseDir, args, input) {
  // `cat-file --batch` is parsed as bytes (see parseBatch); everything else is text.
  const binary = args[0] === 'cat-file';
  return execFileSync('git', args, {
    cwd: baseDir,
    ...(binary ? {} : { encoding: 'utf-8' }),
    timeout: GIT_TIMEOUT_MS,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...(input !== undefined ? { input } : {}),
  });
}

/**
 * Parse `git cat-file --batch` output into one `{id, content}` (or null) per requested object,
 * in request order. A missing object prints `<name> missing`. Works on bytes: the
 * header's size is a byte count, so slicing a decoded string would drift on the
 * first multi-byte character.
 */
function parseBatch(out, count) {
  const buf = Buffer.isBuffer(out) ? out : Buffer.from(out, 'utf-8');
  const blobs = [];
  let pos = 0;
  for (let i = 0; i < count; i++) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl === -1) break;
    const header = buf.subarray(pos, nl).toString('utf-8');
    pos = nl + 1;
    const m = header.match(/^([0-9a-f]+) \S+ (\d+)$/);
    if (!m) {
      blobs.push(null);
      continue;
    }
    const size = Number(m[2]);
    blobs.push({ id: m[1], content: buf.subarray(pos, pos + size).toString('utf-8') });
    pos += size + 1; // content, then the trailing newline
  }
  while (blobs.length < count) blobs.push(null);
  return blobs;
}

/** First line of a git error, for a reason string. */
function gitWhy(err) {
  return (err?.stderr?.toString() || err?.message || '').trim().split('\n')[0] || 'unknown error';
}

/** Run a git query whose failure only narrows the answer (no upstream, detached HEAD, …). */
function soft(git, baseDir, args) {
  try {
    return git(baseDir, args).trim();
  } catch {
    return null;
  }
}

/**
 * Find Epics open on branches other than the current one.
 *
 * Each `open` entry says how to reach it, because "another ref" is not always
 * "another branch": `origin/main` ahead of a local `main` is THIS branch with work
 * pushed from another machine (`sameBranch` — pull, don't check out), and a branch
 * checked out in another worktree cannot be checked out here (`worktree`).
 *
 * `failed` is true only when nothing could be scanned. A branch whose STATE.md
 * will not parse is named in `unreadable` (and in `cannotCheck`, for callers that
 * render only that), and every other branch's result still stands.
 *
 * @param {string} baseDir — the project root, which may be a subdirectory of the repository
 * @param {{localEpic?: string|null, git?: Function}} [opts]
 *   `git(baseDir, args, input?)` returns stdout; injectable for tests.
 * @returns {Promise<{open: Array<{epic: string, phase: string|null, branches: string[], checkout: string,
 *   sameBranch: boolean, pull: string|null, worktree: string|null}>, unclassified: string[], unreadable: string[],
 *   failed: boolean, cannotCheck: Array<{source: string, reason: string}>}>}
 */
export async function findWorkOnOtherBranches(baseDir, { localEpic = null, git = defaultGit } = {}) {
  const open = [];
  const unclassified = [];
  const unreadable = [];
  const cannotCheck = [];
  const source = 'STATE.md on other branches';
  const done = (failed = false) => ({ open, unclassified, unreadable, failed, cannotCheck });
  const fail = (reason) => {
    cannotCheck.push({ source, reason });
    return done(true);
  };

  // Not a repository, or a repository with no commits yet: there are no other
  // branches to be blind to, so this is a complete (empty) answer, not a cannot-check.
  try {
    git(baseDir, ['rev-parse', '--is-inside-work-tree']);
  } catch (err) {
    if (/not a git repository/i.test(gitWhy(err))) return done();
    return fail(`git is not usable here — ${gitWhy(err)}`);
  }
  if (soft(git, baseDir, ['rev-parse', '--verify', '--quiet', 'HEAD']) === null) return done();

  let refs;
  try {
    refs = git(baseDir, ['for-each-ref', '--no-merged=HEAD', '--format=%(refname)', 'refs/heads', 'refs/remotes'])
      .split('\n')
      .map((s) => s.trim())
      .filter((r) => r && !r.endsWith('/HEAD'));
  } catch (err) {
    return fail(`git could not list branches — ${gitWhy(err)}`);
  }
  if (refs.length === 0) return done();

  // Rule 3's evidence: every file name tracked under this project's .planning/ on HEAD.
  // `ls-tree` resolves its path from `baseDir`, like the blob paths below.
  let finishedHere;
  try {
    finishedHere = new Set(
      git(baseDir, ['ls-tree', '-r', '--name-only', 'HEAD', '.planning'])
        .split('\n')
        .map((p) => basename(p.trim()))
        .filter(Boolean)
    );
  } catch (err) {
    return fail(`could not list .planning/ on HEAD — ${gitWhy(err)}`);
  }

  let blobs;
  try {
    // ⚠ `./` IS LOAD-BEARING. `<ref>:path` resolves from the REPOSITORY ROOT and
    // `<ref>:./path` from the working directory. Without it, a project in a
    // subdirectory (a monorepo package, Signal's own `examples/sandbox/`) reads
    // the root's STATE.md or none at all — B118's silence, one level down.
    const input = refs.map((r) => `${r}:./${STATE_REL}`).join('\n') + '\n';
    blobs = parseBatch(git(baseDir, ['cat-file', '--batch'], input), refs.length);
  } catch (err) {
    return fail(`could not read STATE.md from ${refs.length} branch(es) — ${gitWhy(err)}`);
  }

  // Rule 5's evidence: every version STATE.md has ever had on HEAD's history, in
  // one process. A branch whose STATE.md is one of them holds nothing this
  // branch has not already seen — a stale fork, or a squash merge (which lands
  // the branch's final STATE.md here). Fail-soft: without it, rule 5 is skipped.
  const seenHere = new Set();
  const history = soft(git, baseDir, ['log', '--full-history', '--raw', '--no-abbrev', '--format=', 'HEAD', '--', `./${STATE_REL}`]);
  for (const line of (history ?? '').split('\n')) {
    const m = line.match(/^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) /);
    if (m) {
      seenHere.add(m[1]);
      seenHere.add(m[2]);
    }
  }

  // How to reach a ref. Remote names come from `git remote`, never a hard-coded
  // `origin`, so `upstream/feat/x` is recognised as remote and not offered as a
  // local name (which would check out a detached HEAD).
  const remotes = (soft(git, baseDir, ['remote']) ?? '').split('\n').map((r) => r.trim()).filter(Boolean);
  const current = soft(git, baseDir, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const upstream = soft(git, baseDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const worktreeOf = new Map();
  const here = soft(git, baseDir, ['rev-parse', '--show-toplevel']);
  let wtPath = null;
  for (const line of (soft(git, baseDir, ['worktree', 'list', '--porcelain']) ?? '').split('\n')) {
    if (line.startsWith('worktree ')) wtPath = line.slice(9);
    else if (line.startsWith('branch refs/heads/') && wtPath && wtPath !== here) {
      worktreeOf.set(line.slice('branch refs/heads/'.length), wtPath);
    }
  }
  const describe = (ref) => {
    if (ref.startsWith('refs/heads/')) {
      const name = ref.slice('refs/heads/'.length);
      return { display: name, branch: name, remote: false };
    }
    const rest = ref.slice('refs/remotes/'.length);
    const remote = remotes.find((r) => rest.startsWith(`${r}/`));
    return { display: rest, branch: remote ? rest.slice(remote.length + 1) : rest, remote: true };
  };

  const byEpic = new Map();
  refs.forEach((ref, i) => {
    const blob = blobs[i];
    const d = describe(ref);
    if (blob === null) return; // no STATE.md on that branch — no Signal work recorded there
    if (seenHere.has(blob.id)) return; // rule 5 — see above
    let data;
    try {
      ({ data } = parseFrontmatter(blob.content));
    } catch {
      unreadable.push(d.display);
      return;
    }
    // Any non-empty id, matching the local open-Epic check in drive.js — a stricter
    // rule here would propose a local Epic and hide the same kind on another branch.
    const epic = typeof data?.current_epic === 'string' ? data.current_epic.trim() : '';
    if (!epic || epic === 'null') {
      unclassified.push(d.display);
      return;
    }
    const { valid } = partitionCompletedPhases(Array.isArray(data.completed_phases) ? data.completed_phases : []);
    if (valid.some((e) => e.startsWith('SHIP '))) return;
    if (finishedHere.has(`${epic}-RETROSPECTIVE.md`) || finishedHere.has(`${epic}-SHIP.md`)) return;
    if (localEpic && epic === localEpic) return;
    const entry = byEpic.get(epic) ?? { epic, phase: null, refs: [] };
    entry.refs.push(d);
    if (!entry.phase && typeof data.phase === 'string') entry.phase = data.phase;
    byEpic.set(epic, entry);
  });

  for (const { epic, phase, refs: found } of [...byEpic.values()].sort((a, b) => a.epic.localeCompare(b.epic))) {
    const local = found.find((r) => !r.remote);
    const checkout = (local ?? found[0]).branch;
    // This branch's own remote copy, ahead of it: the work was pushed from elsewhere.
    // Only the TRACKED upstream gets a bare `git pull`; a same-named branch on any
    // other remote names that remote, because a bare pull would fetch the wrong
    // one (or fail with no upstream configured).
    const sameBranch = Boolean(current) && found.every((r) => r.remote && r.branch === current);
    let pull = null;
    if (sameBranch) {
      const viaUpstream = found.find((r) => r.display === upstream);
      if (viaUpstream) pull = 'git pull';
      else {
        const r = found[0];
        pull = `git pull ${r.display.slice(0, r.display.length - r.branch.length - 1)} ${r.branch}`;
      }
    }
    open.push({
      epic,
      phase,
      branches: found.map((r) => r.display),
      checkout,
      sameBranch,
      pull,
      worktree: sameBranch ? null : (worktreeOf.get(checkout) ?? null),
    });
  }

  if (unreadable.length > 0) {
    cannotCheck.push({
      source,
      reason: `STATE.md on ${unreadable.length} branch(es) could not be parsed: ${unreadable.join(', ')}`,
    });
  }
  return done();
}

/** What a person does to continue an Epic found elsewhere — one sentence, shared by every caller. */
export function nextStepFor(o) {
  if (o.sameBranch) {
    return `it is on ${o.branches.join(', ')}, a remote copy of the branch you are on — run \`${o.pull ?? 'git pull'}\` to continue it`;
  }
  if (o.worktree) return `${o.checkout} is checked out in another worktree (${o.worktree}) — continue it there`;
  return `run \`git checkout ${o.checkout}\` to continue it`;
}

/**
 * One line per finding a report can print. Null when there is nothing to say.
 * Unclassified and unreadable branches are stated, never hidden, so an empty
 * `open` cannot read as "checked every branch and found nothing".
 */
export function formatOtherBranchWork({ open = [], unclassified = [], unreadable = [] } = {}) {
  const lines = [];
  for (const o of open) {
    lines.push(`⚠ ${o.epic} is open at ${o.phase ?? 'an unrecorded phase'} on ${o.branches.join(', ')} — ${nextStepFor(o)}.`);
  }
  const list = (xs) => `${xs.slice(0, 5).join(', ')}${xs.length > 5 ? ', …' : ''}`;
  if (unclassified.length > 0) {
    lines.push(
      `ℹ ${unclassified.length} unmerged branch(es) carry a STATE.md with no Epic id, so they could not be compared: ${list(unclassified)}`
    );
  }
  if (unreadable.length > 0) {
    lines.push(`⚠ ${unreadable.length} branch(es) carry a STATE.md that could not be parsed: ${list(unreadable)}`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}
