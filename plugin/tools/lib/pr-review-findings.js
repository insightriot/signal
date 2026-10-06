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
 *   execFn?: (cmd: string, args: string[]) => string,
 * }} opts
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
export function readPrReviewFindings({ owner, repo, pr, execFn }) {
  const empty = { status: 'cannot-check', open: [], outdated: 0, resolved: 0, reason: null };
  if (!owner || !repo || !Number.isInteger(pr)) {
    return { ...empty, reason: 'no pull request identified for this branch' };
  }
  if (typeof execFn !== 'function') {
    return { ...empty, reason: 'no exec function supplied' };
  }

  let raw;
  try {
    raw = execFn('gh', [
      'api', 'graphql',
      '-f', `query=${GRAPHQL}`,
      '-F', `owner=${owner}`,
      '-F', `repo=${repo}`,
      '-F', `pr=${pr}`,
    ]);
  } catch (err) {
    return {
      ...empty,
      reason: `could not reach GitHub (${String(err?.message ?? err).split('\n')[0]}) — the reviewer's findings were NOT checked`,
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
// flags a run too small for the change it was given. Like the findings readout
// above, it REPORTS and does not refuse.

/** At or under maxTurns, or under maxCostUsd, a run did not do a review's worth of work. */
export const HOLLOW_REVIEW = { maxTurns: 5, maxCostUsd: 0.3, minChangedLines: 50 };

const REVIEW_WORKFLOW = 'claude-code-review.yml';

/**
 * Read the turn count and cost of the reviewer run on a PR's head commit.
 *
 * @param {{
 *   owner: string, repo: string, pr: number,
 *   execFn?: (cmd: string, args: string[]) => string,
 * }} opts
 * @returns {{
 *   status: 'reviewed'|'hollow'|'small-change'|'cannot-check',
 *   turns: number|null, costUsd: number|null, changedLines: number|null,
 *   reason: string|null,
 * }}
 *
 * `cannot-check` covers no run, a run still going, a run that was skipped, and
 * a log with no result line — the reviewer action refuses to run on a PR that
 * edits its own workflow, and that must not read as a review either.
 */
export function readReviewerEffort({ owner, repo, pr, execFn }) {
  const empty = { status: 'cannot-check', turns: null, costUsd: null, changedLines: null, reason: null };
  if (!owner || !repo || !Number.isInteger(pr)) {
    return { ...empty, reason: 'no pull request identified for this branch' };
  }
  if (typeof execFn !== 'function') {
    return { ...empty, reason: 'no exec function supplied' };
  }
  const R = `${owner}/${repo}`;
  const run = (args) => String(execFn('gh', args));

  let pull;
  try {
    pull = JSON.parse(run(['pr', 'view', String(pr), '-R', R, '--json', 'additions,deletions,headRefOid']));
  } catch (err) {
    return { ...empty, reason: `could not read the PR (${String(err?.message ?? err).split('\n')[0]})` };
  }
  const changedLines = (Number(pull?.additions) || 0) + (Number(pull?.deletions) || 0);
  if (!pull?.headRefOid) return { ...empty, changedLines, reason: 'the PR has no head commit in the response' };

  let runs;
  try {
    runs = JSON.parse(run([
      'run', 'list', '-R', R, '--workflow', REVIEW_WORKFLOW,
      '--commit', pull.headRefOid, '--json', 'databaseId,status,conclusion', '--limit', '1',
    ]));
  } catch (err) {
    return { ...empty, changedLines, reason: `could not list reviewer runs (${String(err?.message ?? err).split('\n')[0]})` };
  }
  const latest = Array.isArray(runs) ? runs[0] : null;
  if (!latest) return { ...empty, changedLines, reason: 'no reviewer run found for the PR head commit' };
  if (latest.status !== 'completed') return { ...empty, changedLines, reason: `the reviewer run is still ${latest.status}` };
  if (latest.conclusion !== 'success') {
    return { ...empty, changedLines, reason: `the reviewer run ended "${latest.conclusion}"` };
  }

  let log;
  try {
    log = run(['run', 'view', String(latest.databaseId), '-R', R, '--log']);
  } catch (err) {
    return { ...empty, changedLines, reason: `could not read the reviewer log (${String(err?.message ?? err).split('\n')[0]})` };
  }
  const turns = lastNumber(log, /"num_turns":\s*(\d+)/g);
  const costUsd = lastNumber(log, /"total_cost_usd":\s*([\d.]+)/g);
  if (turns === null || costUsd === null) {
    return { ...empty, changedLines, reason: 'the reviewer log has no turn count or cost — it may not have run at all' };
  }

  const small = turns <= HOLLOW_REVIEW.maxTurns || costUsd < HOLLOW_REVIEW.maxCostUsd;
  let status = 'reviewed';
  if (small) status = changedLines >= HOLLOW_REVIEW.minChangedLines ? 'hollow' : 'small-change';
  return { status, turns, costUsd, changedLines, reason: null };
}

function lastNumber(text, re) {
  let value = null;
  for (const m of String(text).matchAll(re)) value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Render the reviewer-effort line for SHIP.
 *
 * @returns {string|null}
 */
export function formatReviewerEffort(result) {
  if (!result) return null;
  const effort = `${result.turns} turns, $${result.costUsd?.toFixed(2)}`;
  switch (result.status) {
    case 'reviewed':
      return `✓ PR reviewer: ran a full review (${effort} on ${result.changedLines} changed lines).`;
    case 'small-change':
      return `✓ PR reviewer: short run (${effort}), in line with a ${result.changedLines}-line change.`;
    case 'hollow':
      return (
        `⚠ PR reviewer ran but did NOT review: ${effort} on ${result.changedLines} changed lines (a real review here is 9–35 turns, $0.85–$2).\n` +
        `   Its "no findings" means nothing. Read the run log for why it stopped, and get the change reviewed before merging.`
      );
    default:
      return (
        `⚠ PR reviewer: COULD NOT CHECK whether it reviewed — ${result.reason}.\n` +
        `   A passing review check is not evidence of a review. Open the run log before merging.`
      );
  }
}
