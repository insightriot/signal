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
