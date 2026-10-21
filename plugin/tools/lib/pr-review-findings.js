// Unread pull-request review findings, surfaced before a merge.
//
// WHY THIS EXISTS, AND IT IS MEASURED RATHER THAN ARGUED. Signal has run an
// independent reviewer on every PR since `v0.1.31`
// (`.github/workflows/claude-code-review.yml`). Nobody ever read its output.
// When `analysis/CROSS-MODEL-REVIEW-SCOPE.md` finally looked, on 2026-08-23:
// **7 findings across 11 PRs, 7 of 7 real on inspection** — and four of them had
// been sitting unread while the changes they described were merged.
//
// Two of those findings were holes in a guard that had a green 2886-test suite,
// four mutation tests, and an author who had just written its threat model. The
// next three were in the FIX for those two, written by an author who had just
// read the report. **The scarce resource is not attention on the problem. It is
// a second reader** — and a second reader nobody reads is worth nothing.
//
// `ship.md`'s Exit Criteria already require a pull request. They said nothing
// about its review comments, so a merge could step over known, correct findings
// without anything noticing. That is the gap this closes.
//
// ⚠ IT REPORTS; IT DOES NOT REFUSE. Consistent with the call on `B75`
// (2026-08-22): a step that was skipped is process, and process warns. The
// escalation to a refusal is a product decision that has not been made, and
// making it silently inside a helper would be the kind of quiet contract change
// this repository files bugs about. What it does guarantee is that a merge
// cannot be *unaware*.

import { execFileSync } from 'node:child_process';

import { gitEnv, gitUnusableReason } from './git-env.js';
import { printable } from './printable-text.js';

/** Bounded, so an auth prompt or a dead network cannot wedge a ship run. */
const GH_TIMEOUT_MS = 30000;
// What GitHub allows in an owner or a repository name. Anything else is not
// passed to `gh`: `@file` would be read as a file by `-F`, `--flag` as an option.
// At most 100 characters, and not `.` or `..`, which are folders, not names.
const GITHUB_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const plainGithubName = (name) => typeof name === 'string' && GITHUB_NAME_RE.test(name) && !name.startsWith('-') && name !== '.' && name !== '..';

// Why a `gh` call failed, for a `reason`: the first line `gh` wrote to
// stderr when there is one — "not logged in", "could not resolve host" and
// "rate limit" then read differently — else the first line of the error.
// (Node's own message for a failed command is the whole command line.)
const WHY_MAX = 200;
function whyFailed(err) {
  const lines = String(err?.stderr ?? '').split('\n').map((l) => printable(l).trim()).filter(Boolean);
  const first = lines[0] ?? printable(String(err?.message ?? err).split('\n')[0]);
  return first.length > WHY_MAX ? `${first.slice(0, WHY_MAX - 1)}…` : first;
}

// Why `gh` is not run for this call at all, or null (M6.E16 r6.3).
function ghRefusal({ owner, repo }) {
  if (!plainGithubName(owner)) return 'the owner is not a plain GitHub owner name — nothing was asked';
  if (!plainGithubName(repo)) return 'the repository is not a plain GitHub repository name — nothing was asked';
  // `gh` runs git to learn where it is, with the environment `gitEnv` gives
  // it: its git then refuses a folder that only looks like a repository. On a
  // git too old for that, `gh` is not run.
  const unusable = gitUnusableReason();
  return unusable === null ? null : `${unusable} — nothing was asked`;
}

// How `gh` is run: by the caller's `execFn` when one is given — handed the
// folder and git's environment (`gitEnv`: `gh` runs git) as its third
// argument — and otherwise here, with the same two. Safe with no `execFn`,
// which is how `/sig:ship` is told to call this (r6.3).
function ghRunner(execFn, cwd) {
  if (typeof execFn === 'function') return (args) => String(execFn('gh', args, { cwd, env: gitEnv(cwd) }));
  return (args) => String(execFileSync('gh', args, {
    cwd,
    encoding: 'utf8',
    // stderr is kept: it is where `gh` says why it failed (`whyFailed`).
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GH_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...gitEnv(cwd), GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
  }));
}

/** A thread is "needs a person" when it is unresolved and still applies. */
const NEEDS_A_PERSON = (t) => !t.resolved && !t.outdated;

const GRAPHQL = `query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewThreads(first:100){
        nodes{
          isResolved
          isOutdated
          comments(first:1){nodes{path line originalLine author{login} body}}
        }
      }
    }
  }
}`;

/**
 * Read the review threads on a pull request.
 *
 * @param {{
 *   owner: string, repo: string, pr: number,
 *   execFn?: (cmd: string, args: string[], options?: {cwd: string, env: object}) => string,
 *   cwd?: string,
 * }} opts — `execFn` is optional: without one, `gh` is run here, with git's
 *   own environment (`gitEnv`: `gh` runs git). One that is given is handed the
 *   folder and that environment as its third argument, to pass on to the
 *   process it starts. `cwd` defaults to the current folder. An `owner` or
 *   `repo` that is not a plain GitHub name, or a folder that only looks like a
 *   repository, is `cannot-check` and `gh` is not run.
 * @returns {{
 *   status: 'clean'|'findings'|'cannot-check',
 *   open: Array<{path: string, line: number|null, author: string, excerpt: string}>,
 *   outdated: number,
 *   resolved: number,
 *   reason: string|null,
 * }}
 *
 * **`cannot-check` is a value on the record, not a rendering choice.** No `gh`,
 * no auth, no network, a private repo, a rate limit — each produces it, and each
 * must read differently from "checked and clean". A reviewer that could not be
 * consulted and a reviewer that found nothing look identical otherwise, which is
 * `B39`'s shape and the reason four real findings went unread in the first place.
 */
export function readPrReviewFindings({ owner, repo, pr, execFn, cwd = process.cwd() }) {
  const empty = { status: 'cannot-check', open: [], outdated: 0, resolved: 0, reason: null };
  if (!owner || !repo || !Number.isInteger(pr)) {
    return { ...empty, reason: 'no pull request identified for this branch' };
  }
  const refusal = ghRefusal({ owner, repo });
  if (refusal !== null) return { ...empty, reason: refusal };
  const run = ghRunner(execFn, cwd);

  let raw;
  try {
    // `-f` for text: `-F` reads a FILE when the value starts with `@`. The
    // number keeps `-F`, which is what sends it as a number.
    raw = run([
      'api', 'graphql',
      '-f', `query=${GRAPHQL}`,
      '-f', `owner=${owner}`,
      '-f', `repo=${repo}`,
      '-F', `pr=${pr}`,
    ]);
  } catch (err) {
    return {
      ...empty,
      reason: `could not reach GitHub (${whyFailed(err)}) — the reviewer's findings were NOT checked`,
    };
  }

  let nodes;
  try {
    nodes = JSON.parse(String(raw)).data.repository.pullRequest.reviewThreads.nodes;
  } catch {
    return { ...empty, reason: 'unexpected response from GitHub — the findings were NOT checked' };
  }
  if (!Array.isArray(nodes)) {
    return { ...empty, reason: 'no review threads in the response — the findings were NOT checked' };
  }

  const threads = nodes.map((n) => {
    const c = n?.comments?.nodes?.[0] ?? {};
    return {
      resolved: n?.isResolved === true,
      outdated: n?.isOutdated === true,
      path: c.path ?? '(unknown file)',
      line: c.line ?? c.originalLine ?? null,
      author: c.author?.login ?? '(unknown)',
      excerpt: firstLine(c.body ?? ''),
    };
  });

  const open = threads.filter(NEEDS_A_PERSON);
  return {
    status: open.length > 0 ? 'findings' : 'clean',
    open: open.map(({ path, line, author, excerpt }) => ({ path, line, author, excerpt })),
    outdated: threads.filter((t) => !t.resolved && t.outdated).length,
    resolved: threads.filter((t) => t.resolved).length,
    reason: null,
  };
}

/**
 * The comment's headline, stripped of markdown emphasis and truncated.
 *
 * ⚠ Underscores are NOT stripped. They are markdown emphasis, but in review
 * findings they are far more often part of a code identifier — a first version
 * rendered `ASSIGNMENT_RE` as `ASSIGNMENTRE`, turning the name of the thing the
 * finding is about into a string that appears nowhere in the codebase, in a
 * readout whose whole job is making a finding actionable.
 */
function firstLine(body) {
  const line = String(body).split('\n').find((l) => l.trim().length > 0) ?? '';
  const clean = line.replace(/[*`]/g, '').trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}

/**
 * Render the pre-merge readout.
 *
 * ⚠ **An outdated-but-unresolved thread is counted and named, never dropped.**
 * A later push marks a thread outdated whether or not the finding was addressed
 * — pushing an unrelated commit does it. Treating outdated as "handled" would
 * turn the most common way a finding gets buried into the way it gets cleared.
 * Measured on this repository: after fixing all three findings on `#197`, all
 * three threads were still `isResolved: false`, and one was already outdated.
 *
 * @returns {string|null} null when there is nothing worth saying
 */
export function formatPrReviewFindings(result) {
  if (!result) return null;

  if (result.status === 'cannot-check') {
    return (
      `⚠ PR review findings: COULD NOT CHECK — ${result.reason}.\n` +
      `   This is not "no findings". Open the pull request and read its review comments before merging.`
    );
  }

  const lines = [];
  if (result.status === 'findings') {
    lines.push(
      `⚠ ${result.open.length} unresolved review ${result.open.length === 1 ? 'finding' : 'findings'} on this PR — read each before merging.`
    );
    for (const f of result.open) {
      lines.push(`   • ${f.path}${f.line ? `:${f.line}` : ''} (${f.author}) — ${f.excerpt}`);
    }
    lines.push(
      `   Measured on this repository: 7 of 7 such findings were real. Fix it, or reply on the thread saying why not — then resolve it.`
    );
  } else {
    lines.push(`✓ PR review findings: none unresolved.`);
  }

  if (result.outdated > 0) {
    lines.push(
      `   ${result.outdated} unresolved thread(s) marked OUTDATED by a later push. Outdated ≠ addressed — a push marks threads outdated whether or not the finding was fixed.`
    );
  }
  return lines.join('\n');
}

// ── Did the reviewer actually review? ─────────────────────────────────────────
//
// "No findings" is only worth something if a review happened. From 2026-09-25
// to 2026-10-05 the `claude-review` check passed all 32 PRs while reviewing
// none of them: every run stopped after 2–5 turns for $0.10–$0.17 and reported
// success. Two causes, found one after the other (SIG-281): the allowed tools
// could not launch the review's sub-agents (#283), and once they could, the
// sub-agents ran in the background and the run ended before they returned
// (#288, #290). A real review here is 9–35 turns for $0.85–$2 — sub-agent turns
// are not counted in the total, so cost is the steadier number. The green tick
// and an empty thread list looked exactly like a clean review, and three Epics
// merged under it. The fix is not the guard; reading the run is.
//
// So SHIP reads the reviewer's own turn count and cost from its run log and
// flags a run too small for the change it was given.
//
// Then a second cause (M6.E18, SIG-348): the upstream review command stops at
// its step 1 once Claude has commented on the PR, so only a PR's first push is
// reviewed. On #304 the first push got 9 turns and $1.44 and each of the nine
// later pushes, which carried every REVIEW fix round, stopped there in 2–4
// turns. So every run on the head commit is read, not only the newest (a
// re-push after a real review read as hollow, SIG-285), each run's own
// `REVIEW_OUTCOME=` line (written by the workflow, M6.E18 S1) tells a step-1
// stop from a hollow review, and the PR's commits are walked back to the last
// one that was reviewed. SHIP does not call the PR ready to merge unless the
// head commit was (`readyToMerge`); a person asks for that review with the
// `review-head` label.
//
// M6.E18 REVIEW (I5): a pull_request run uses the PR's own copy of the
// workflow, so a PR that edits it can print any outcome line it likes. Such a
// PR is not read at all. (I6): the outcome line is read one log line at a time
// with an anchored pattern, because the first pattern took 41 s on one 64 KB
// line, and its `head=` must be the commit the run was listed for.

/** At or under maxTurns, or under maxCostUsd, a run did not do a review's worth of work. */
export const HOLLOW_REVIEW = { maxTurns: 5, maxCostUsd: 0.3, minChangedLines: 50 };

const REVIEW_WORKFLOW = 'claude-code-review.yml';
const REVIEW_WORKFLOW_PATH = `.github/workflows/${REVIEW_WORKFLOW}`;
// Runs listed per commit: a label run and re-runs sit beside the push's run.
const RUN_LIST_LIMIT = 30;
// Commits walked back from the head to find the last reviewed one.
const COMMIT_WALK_LIMIT = 50;
// The whole of the workflow's line, from `REVIEW_OUTCOME=` to the end of the log
// line: fixed order, no open-ended wildcard, so it runs in time linear in the line.
const OUTCOME_LINE_RE = /^REVIEW_OUTCOME=(reviewed|stopped-step-1|no-result) head=([0-9a-f]{40}) job=(review|review-head) turns=(\d*) cost=([\d.]*)$/;

/**
 * Did the PR reviewer review the PR's head commit, and if not, which commit
 * was it last asked for and done?
 *
 * @param {{
 *   owner: string, repo: string, pr: number,
 *   execFn?: (cmd: string, args: string[], options?: {cwd: string, env: object}) => string,
 *   cwd?: string,
 * }} opts — `execFn` and `cwd` as `readPrReviewFindings`'
 * @returns {{
 *   status: 'reviewed'|'small-change'|'hollow'|'stopped'|'cannot-check',
 *   turns: number|null, costUsd: number|null, changedLines: number|null,
 *   reason: string|null, head: string|null, readyToMerge: boolean,
 *   fromOutcomeLine: boolean|null, canAskForReview: boolean,
 *   lastReviewed: string|null, commitsAfter: number|null,
 * }}
 *
 * `stopped` is a run that ended at the upstream step 1 because Claude had
 * already commented. `cannot-check` covers no run, a run still going, a run
 * that was skipped, and a log with no result — the reviewer action refuses to
 * run on a PR that edits its own workflow, and that must not read as a review
 * either. `lastReviewed` is the newest commit with a real review (the head when
 * it has one); `commitsAfter` counts the commits after it, and is the PR's
 * commit count when none was reviewed. Both are null when the walk could not
 * be made.
 *
 * A PR that changes `.github/workflows/claude-code-review.yml` is
 * `cannot-check` and no run is read: its runs ran its own copy of the
 * workflow. A run on the head commit from the `review-head` job that did not
 * succeed is `cannot-check` saying so, ranked above a step-1 stop.
 * `canAskForReview` is true when the `review-head` label could help: a stop, a
 * hollow run, a completed run with no usable result, or no run on the head.
 */
export function readReviewerEffort({ owner, repo, pr, execFn, cwd = process.cwd() }) {
  const empty = {
    status: 'cannot-check', turns: null, costUsd: null, changedLines: null, reason: null, head: null,
    readyToMerge: false, fromOutcomeLine: null, lastReviewed: null, commitsAfter: null, canAskForReview: false,
  };
  if (!owner || !repo || !Number.isInteger(pr)) {
    return { ...empty, reason: 'no pull request identified for this branch' };
  }
  const refusal = ghRefusal({ owner, repo });
  if (refusal !== null) return { ...empty, reason: refusal };
  const R = `${owner}/${repo}`;
  const run = ghRunner(execFn, cwd);

  let pull;
  try {
    pull = JSON.parse(run(['pr', 'view', String(pr), '-R', R, '--json', 'additions,deletions,headRefOid,commits,files,changedFiles']));
  } catch (err) {
    return { ...empty, reason: `could not read the PR (${whyFailed(err)})` };
  }
  const changedLines = (Number(pull?.additions) || 0) + (Number(pull?.deletions) || 0);
  const head = pull?.headRefOid;
  if (!head) return { ...empty, changedLines, reason: 'the PR has no head commit in the response' };
  const files = changedFilePaths(run, R, pr, pull);
  if (files.reason) return { ...empty, changedLines, head, reason: files.reason };
  if (files.paths.includes(REVIEW_WORKFLOW_PATH)) {
    return {
      ...empty, changedLines, head,
      reason: `the PR edits the reviewer's own workflow (${REVIEW_WORKFLOW_PATH}), so the reviewer action does not review it and its run logs cannot be trusted; no runs were read`,
    };
  }

  const found = readCommitReview(run, R, head, changedLines);
  const result = { ...empty, ...found, changedLines, head };
  result.readyToMerge = result.status === 'reviewed' || result.status === 'small-change';
  if (result.readyToMerge) return { ...result, lastReviewed: head, commitsAfter: 0 };
  return { ...result, ...findLastReviewed(run, R, pull?.commits, head, changedLines) };
}

// Every path the PR changes. `gh pr view --json files` lists at most 100
// (measured 2026-10-20: #280 listed 100 of 1006), so a longer PR is listed in
// full from the REST API, and a list that is still short is not trusted.
function changedFilePaths(run, R, pr, pull) {
  const shown = Array.isArray(pull?.files) ? pull.files.map((f) => f?.path) : null;
  const count = pull?.changedFiles;
  if (!shown || shown.some((p) => typeof p !== 'string') || !Number.isInteger(count)) {
    return { reason: "the PR's changed files are not in the response" };
  }
  if (shown.length >= count) return { paths: shown };
  let all;
  try {
    all = run(['api', `repos/${R}/pulls/${pr}/files?per_page=100`, '--paginate', '--jq', '.[].filename']).split('\n').filter(Boolean);
  } catch (err) {
    return { reason: `could not list the PR's changed files (${whyFailed(err)})` };
  }
  if (all.length < count) return { reason: `could not list every changed file (${all.length} of ${count})` };
  return { paths: all };
}

// Every reviewer run on one commit, read into one answer: a review on any run
// wins; a run still going beats the rest; then a requested head review that
// failed; a short one beats a stop.
function readCommitReview(run, R, sha, changedLines) {
  let runs;
  try {
    runs = JSON.parse(run([
      'run', 'list', '-R', R, '--workflow', REVIEW_WORKFLOW,
      '--commit', sha, '--json', 'databaseId,status,conclusion', '--limit', String(RUN_LIST_LIMIT),
    ]));
  } catch (err) {
    return { status: 'cannot-check', reason: `could not list reviewer runs (${whyFailed(err)})` };
  }
  if (!Array.isArray(runs) || runs.length === 0) {
    return { status: 'cannot-check', reason: 'no reviewer run found for the PR head commit', canAskForReview: true };
  }
  // A run whose jobs all skipped (any label but review-head starts one) is no
  // run: it neither reviewed nor failed to (REVIEW fix round 1).
  const live = runs.filter((r) => !(r?.status === 'completed' && r.conclusion === 'skipped'));
  if (live.length === 0) {
    return {
      status: 'cannot-check',
      reason: 'no reviewer run found for the PR head commit (only runs that ended "skipped")',
      canAskForReview: true,
    };
  }
  const seen = [];
  for (const r of live) {
    if (r?.status !== 'completed') {
      seen.push({ kind: 'pending', reason: `the reviewer run is still ${r?.status}` });
      continue;
    }
    let log;
    try {
      log = run(['run', 'view', String(r.databaseId), '-R', R, '--log']);
    } catch (err) {
      const reason = r.conclusion === 'success' ? `could not read the reviewer log (${whyFailed(err)})` : `the reviewer run ended "${r.conclusion}"`;
      seen.push({ kind: 'ended', reason });
      continue;
    }
    if (r.conclusion !== 'success') {
      // The outcome step runs even when the review fails, so its `job=` says
      // whether this was the head review a person asked for.
      const line = outcomeLine(log);
      const asked = line?.job === 'review-head' && line.head === String(sha).toLowerCase();
      seen.push(asked
        ? { kind: 'head-failed', reason: `the requested head review (the \`review-head\` run) ran and did not succeed: it ended "${r.conclusion}"` }
        : { kind: 'ended', reason: `the reviewer run ended "${r.conclusion}"` });
      continue;
    }
    seen.push(readRunLog(log, changedLines, sha));
  }
  for (const kind of ['reviewed', 'small-change', 'pending', 'head-failed', 'hollow', 'stopped']) {
    const hit = seen.find((x) => x.kind === kind);
    if (!hit) continue;
    if (kind === 'pending') return { status: 'cannot-check', reason: hit.reason };
    if (kind === 'head-failed') return { status: 'cannot-check', reason: hit.reason, canAskForReview: true };
    return { status: kind, turns: hit.turns, costUsd: hit.costUsd, fromOutcomeLine: hit.fromOutcomeLine, canAskForReview: true };
  }
  return { status: 'cannot-check', reason: seen.at(-1).reason, canAskForReview: true };
}

// The last well-formed outcome line in a log, or null. One log line at a time;
// GitHub prefixes each with `job<TAB>step<TAB>timestamp `.
function outcomeLine(log) {
  let last = null;
  for (const raw of String(log).split('\n')) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const at = text.lastIndexOf('REVIEW_OUTCOME=');
    if (at === -1 || (at > 0 && text[at - 1] !== ' ' && text[at - 1] !== '\t')) continue;
    const m = OUTCOME_LINE_RE.exec(text.slice(at));
    if (m) last = { outcome: m[1], head: m[2], job: m[3], turns: m[4], cost: m[5] };
  }
  return last;
}

// One run's log: its outcome line when the workflow wrote one, and otherwise
// (runs from before M6.E18 S1) the turn count and cost alone, which cannot
// tell a step-1 stop from a hollow review. An outcome line naming another
// commit than the one the run was listed for ends the run's reading: it is
// not this commit's outcome, and the turn count beside it is not either.
function readRunLog(log, changedLines, sha) {
  const outcome = outcomeLine(log);
  let turns;
  let costUsd;
  if (outcome) {
    if (outcome.head !== String(sha).toLowerCase()) {
      return { kind: 'ended', reason: `the reviewer run's outcome line names commit ${outcome.head.slice(0, 8)}, not ${String(sha).slice(0, 8)}, the commit it was listed for` };
    }
    if (outcome.outcome === 'no-result') {
      return { kind: 'ended', reason: 'the reviewer run left no result — it may not have run at all (a skipped run looks like this)' };
    }
    turns = outcome.turns === '' ? null : Number(outcome.turns);
    costUsd = outcome.cost === '' ? null : Number(outcome.cost);
  } else {
    turns = lastNumber(log, /"num_turns":\s*(\d+)/g);
    costUsd = lastNumber(log, /"total_cost_usd":\s*([\d.]+)/g);
  }
  if (turns === null || costUsd === null || !Number.isFinite(turns) || !Number.isFinite(costUsd)) {
    return { kind: 'ended', reason: 'the reviewer log has no turn count or cost — it may not have run at all' };
  }
  const fromOutcomeLine = Boolean(outcome);
  if (outcome?.outcome === 'stopped-step-1') return { kind: 'stopped', turns, costUsd, fromOutcomeLine };
  const small = turns <= HOLLOW_REVIEW.maxTurns || costUsd < HOLLOW_REVIEW.maxCostUsd;
  let kind = 'reviewed';
  if (small) kind = changedLines >= HOLLOW_REVIEW.minChangedLines ? 'hollow' : 'small-change';
  return { kind, turns, costUsd, fromOutcomeLine };
}

// Walk the PR's commits back from the one before the head to the newest with a
// real review. A commit that cannot be read ends the walk: "not reviewed" is
// never inferred past a gap.
function findLastReviewed(run, R, commits, head, changedLines) {
  const shas = Array.isArray(commits) ? commits.map((c) => c?.oid).filter((x) => typeof x === 'string') : null;
  if (!shas || shas.at(-1) !== head) return { lastReviewed: null, commitsAfter: null };
  const stop = Math.max(0, shas.length - 1 - COMMIT_WALK_LIMIT);
  for (let i = shas.length - 2; i >= stop; i -= 1) {
    const r = readCommitReview(run, R, shas[i], changedLines);
    if (r.status === 'reviewed' || r.status === 'small-change') {
      return { lastReviewed: shas[i], commitsAfter: shas.length - 1 - i };
    }
    if (r.status === 'cannot-check' && !/^no reviewer run found/.test(r.reason)) {
      return { lastReviewed: null, commitsAfter: null };
    }
  }
  return stop === 0 ? { lastReviewed: null, commitsAfter: shas.length } : { lastReviewed: null, commitsAfter: null };
}

function lastNumber(text, re) {
  let value = null;
  for (const m of String(text).matchAll(re)) value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

const ASK_FOR_REVIEW =
  'add the `review-head` label to the PR for a full review of the head commit (to ask again, remove it and add it again), then run this check again';

function lastReviewedLine(result) {
  if (result.lastReviewed) {
    const n = result.commitsAfter;
    return `last real review: ${result.lastReviewed.slice(0, 8)}, ${n} commit${n === 1 ? '' : 's'} before the head`;
  }
  if (result.commitsAfter !== null) return 'no commit on this PR has had a real review';
  return 'which commit was last reviewed could not be read';
}

/**
 * Render the reviewer-effort line for SHIP.
 *
 * @returns {string|null}
 */
export function formatReviewerEffort(result) {
  if (!result) return null;
  const effort = `${result.turns} turns, $${result.costUsd?.toFixed(2)}`;
  const fallback = result.fromOutcomeLine === false ? ' — read from turns and cost; the run predates the outcome line' : '';
  // The label advice only where a new review-head run can help (M6.E18 REVIEW S2).
  const ask = result.canAskForReview ? `: ${ASK_FOR_REVIEW}` : '';
  const owed = `   ${lastReviewedLine(result)}.\n   Not ready to merge${ask}.`;
  switch (result.status) {
    case 'reviewed':
      return `✓ PR reviewer: ran a full review (${effort} on ${result.changedLines} changed lines)${fallback}.`;
    case 'small-change':
      return `✓ PR reviewer: short run (${effort}), in line with a ${result.changedLines}-line change${fallback}.`;
    case 'stopped':
      return (
        `⚠ PR reviewer did not review the head commit ${String(result.head).slice(0, 8)}: it stopped at its first step because Claude had already commented on the PR (${effort}).\n` +
        owed
      );
    case 'hollow':
      return (
        `⚠ PR reviewer ran but did NOT review: ${effort} on ${result.changedLines} changed lines (a real review here is 9–35 turns, $0.85–$2)${fallback}.\n` +
        `   Its "no findings" means nothing.\n` +
        owed
      );
    default:
      return (
        `⚠ PR reviewer: COULD NOT CHECK whether it reviewed — ${result.reason}.\n` +
        `   A passing review check is not evidence of a review. Open the run log.\n` +
        owed
      );
  }
}
