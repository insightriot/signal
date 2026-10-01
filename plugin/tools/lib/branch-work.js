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
// On this repository, 31 branch tips are not ancestors of `main`; every one is
// squash-merged or stale, and every one names an Epic that has shipped. So:
//   1. Only tips NOT already contained in HEAD are read (`--no-merged=HEAD`).
//   2. The branch's own STATE.md must name a valid `current_epic` with no SHIP in
//      `completed_phases`.
//   3. The Epic must not already be finished HERE — no `{epic}-RETROSPECTIVE.md`
//      or `{epic}-SHIP.md` anywhere under `.planning/` on HEAD. This is the check
//      that catches squash merges, which rule 1 cannot see.
//   4. An Epic equal to the local `current_epic` is the local work, not other work.
// A branch whose STATE.md names no Epic cannot be compared by identity, so it is
// COUNTED and reported rather than dropped — silence about blindness is the defect.
//
// It never checks out, fetches, or writes. Remote refs are as fresh as the last
// fetch, and the result says so through `cannotCheck` when git is unavailable.

import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

import { parseFrontmatter, partitionCompletedPhases, EPIC_ID_STRICT_RE } from './state.js';

const GIT_TIMEOUT_MS = 5000;
const STATE_REL = '.planning/STATE.md';

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

/** `refs/remotes/origin/feat/x` → `origin/feat/x`; `refs/heads/feat/x` → `feat/x`. */
function shortName(ref) {
  return ref.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
}

/**
 * Parse `git cat-file --batch` output into one blob (or null) per requested object,
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
    const m = header.match(/^[0-9a-f]+ \S+ (\d+)$/);
    if (!m) {
      blobs.push(null);
      continue;
    }
    const size = Number(m[1]);
    blobs.push(buf.subarray(pos, pos + size).toString('utf-8'));
    pos += size + 1; // content, then the trailing newline
  }
  while (blobs.length < count) blobs.push(null);
  return blobs;
}

/**
 * Find Epics open on branches other than the current one.
 *
 * @param {string} baseDir
 * @param {{localEpic?: string|null, git?: Function}} [opts]
 *   `git(baseDir, args, input?)` returns stdout; injectable for tests.
 * @returns {Promise<{open: Array<{epic: string, phase: string|null, branches: string[]}>,
 *   unclassified: string[], cannotCheck: Array<{source: string, reason: string}>}>}
 */
export async function findWorkOnOtherBranches(baseDir, { localEpic = null, git = defaultGit } = {}) {
  const open = [];
  const unclassified = [];
  const cannotCheck = [];
  const source = 'STATE.md on other branches';

  // Not a repository, or a repository with no commits yet: there are no other
  // branches to be blind to, so this is a complete (empty) answer, not a cannot-check.
  try {
    git(baseDir, ['rev-parse', '--is-inside-work-tree']);
  } catch (err) {
    const why = (err.stderr?.toString() || err.message || '').trim();
    if (/not a git repository/i.test(why)) return { open, unclassified, cannotCheck };
    cannotCheck.push({ source, reason: `git is not usable here — ${why.split('\n')[0] || 'unknown error'}` });
    return { open, unclassified, cannotCheck };
  }
  try {
    git(baseDir, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  } catch {
    return { open, unclassified, cannotCheck };
  }

  let refs;
  try {
    refs = git(baseDir, [
      'for-each-ref',
      '--no-merged=HEAD',
      '--format=%(refname)',
      'refs/heads',
      'refs/remotes',
    ])
      .split('\n')
      .map((s) => s.trim())
      .filter((r) => r && !r.endsWith('/HEAD'));
  } catch (err) {
    const why = (err.stderr?.toString() || err.message || '').trim().split('\n')[0];
    cannotCheck.push({ source, reason: `git could not list branches — ${why || 'unknown error'}` });
    return { open, unclassified, cannotCheck };
  }
  if (refs.length === 0) return { open, unclassified, cannotCheck };

  // Rule 3's evidence: every terminal artifact name tracked under .planning/ on HEAD.
  let finishedHere;
  try {
    finishedHere = new Set(
      git(baseDir, ['ls-tree', '-r', '--name-only', 'HEAD', '.planning'])
        .split('\n')
        .map((p) => basename(p.trim()))
        .filter(Boolean)
    );
  } catch (err) {
    cannotCheck.push({ source, reason: `could not list .planning/ on HEAD — ${err.message}` });
    return { open, unclassified, cannotCheck };
  }

  let blobs;
  try {
    const input = refs.map((r) => `${r}:${STATE_REL}`).join('\n') + '\n';
    blobs = parseBatch(git(baseDir, ['cat-file', '--batch'], input), refs.length);
  } catch (err) {
    cannotCheck.push({ source, reason: `could not read STATE.md from ${refs.length} branch(es) — ${err.message}` });
    return { open, unclassified, cannotCheck };
  }

  const byEpic = new Map();
  const unreadable = [];
  refs.forEach((ref, i) => {
    const raw = blobs[i];
    if (raw === null) return; // no STATE.md on that branch — no Signal work recorded there
    let data;
    try {
      ({ data } = parseFrontmatter(raw));
    } catch {
      unreadable.push(shortName(ref));
      return;
    }
    const epic = typeof data?.current_epic === 'string' ? data.current_epic.trim() : null;
    if (!epic || !EPIC_ID_STRICT_RE.test(epic)) {
      unclassified.push(shortName(ref));
      return;
    }
    const { valid } = partitionCompletedPhases(Array.isArray(data.completed_phases) ? data.completed_phases : []);
    if (valid.some((e) => e.startsWith('SHIP '))) return;
    if (finishedHere.has(`${epic}-RETROSPECTIVE.md`) || finishedHere.has(`${epic}-SHIP.md`)) return;
    if (localEpic && epic === localEpic) return;
    const entry = byEpic.get(epic) ?? { epic, phase: null, branches: [] };
    entry.branches.push(shortName(ref));
    if (!entry.phase && typeof data.phase === 'string') entry.phase = data.phase;
    byEpic.set(epic, entry);
  });

  if (unreadable.length > 0) {
    cannotCheck.push({
      source,
      reason: `STATE.md on ${unreadable.length} branch(es) could not be parsed: ${unreadable.join(', ')}`,
    });
  }
  open.push(...[...byEpic.values()].sort((a, b) => a.epic.localeCompare(b.epic)));
  return { open, unclassified, cannotCheck };
}

/**
 * One or two lines a report can print. Null when there is nothing to say.
 * The unclassified count is stated, never hidden, so an empty `open` cannot
 * read as "checked everything and found nothing" when some branches were not compared.
 */
/** The name to hand to `git checkout`: a local branch if one exists, else the remote's short name. */
export function checkoutName(branches = []) {
  const local = branches.find((b) => !b.startsWith('origin/'));
  return local ?? (branches[0] ?? '').replace(/^origin\//, '');
}

export function formatOtherBranchWork({ open = [], unclassified = [] } = {}) {
  const lines = [];
  for (const o of open) {
    lines.push(
      `⚠ ${o.epic} is open on another branch (${o.branches.join(', ')}) at ${o.phase ?? 'an unrecorded phase'} — ` +
        `run \`git checkout ${checkoutName(o.branches)}\` to continue it.`
    );
  }
  if (unclassified.length > 0) {
    lines.push(
      `ℹ ${unclassified.length} unmerged branch(es) carry a STATE.md with no Epic id, so they could not be ` +
        `compared: ${unclassified.slice(0, 5).join(', ')}${unclassified.length > 5 ? ', …' : ''}`
    );
  }
  return lines.length > 0 ? lines.join('\n') : null;
}
