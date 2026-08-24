/**
 * Spec-internal consistency — a plan that contradicts itself (M6.E4 S1, FR1.1).
 *
 * `M4.5.E9` shipped a task whose stated threshold formula could not satisfy the
 * acceptance criterion stated in the same task: the formula was
 * `template_floor + 150B × required_section_count`, while the AC in the same
 * block said *"minimally-filled template (one sentence per section) passes"* —
 * one sentence being ~50–70B, which 150B per section rejects. Caught during
 * execution by a human noticing, not by any gate.
 *
 * The 8-dimension plan validation audits goal alignment, completeness,
 * dependency, testability, scope, context, risk and vertical slicing. **None of
 * them compares a plan's stated formula against a plan's stated criterion.**
 * That was recommended twice by `M4.5.E9`'s own retrospective (lines 57 and 67)
 * and nothing routed it anywhere for three months.
 *
 * ## What this does NOT do, deliberately
 *
 * It does not judge whether a formula *satisfies* a criterion. That is semantic,
 * and `M5.E10` refused to fake exactly that (`AC0.1`) — shipping token
 * comparison and publishing the limit rather than a judgment it could not make.
 *
 * ## Worklist, not findings — and the precision contract is INVERTED
 *
 * `M6.E2`'s checks assert *a defect exists*, so a false positive is a false
 * alarm; `bug-status-vs-changelog` had to publish a measured 1-in-2 precision.
 * This asserts only *"this task carries a number and a criterion, so the
 * reviewer must speak to it."*
 *
 * A false positive costs the plan-checker one paragraph of attention. A false
 * **negative** lets a contradiction through unexamined. **So this optimises
 * recall, and precision is explicitly not its headline number.** Stated here
 * because the recent, correctly-learned instinct in this repo is to lead with
 * precision — and doing that here would make the check worse.
 *
 * ## Reach (measured 2026-08-23, read-only, across the eval corpus)
 *
 * **10 of 13 projects evaluable.** 1 has no PLAN artifact; 2 have plans built
 * entirely from `##` headings with no level-3+ units. 432 task units seen, **46
 * flagged (10.6%)**. Signal's own tree runs **14.0%** — ~1.3× denser.
 *
 * ⚠ **Re-measured after the PR #200 review.** The first figures (40 / 9.3%;
 * Signal 20.9%) were taken with two regex defects present, and correcting them
 * moved the numbers in BOTH directions: corpus recall rose (percentages became
 * visible) while Signal's own rate FELL by a third, because Signal's date-heavy
 * plan prose was disproportionately hit by the ISO-date false positive. The
 * published "~2.2× denser" claim was therefore an artifact of that bug, not a
 * property of Signal's plans.
 *
 * **There is no `##` fallback, and that is a measurement rather than a taste.**
 * In both non-evaluable projects the h2 headings are predominantly *section*
 * vocabulary (8 of 12 and 10 of 12: phase goal, dependencies, scope, …), not
 * tasks. Parsing them would flag `## Phase goal` as a task — noise dressed as
 * coverage. `cannot-check` with a stated reason is the honest answer.
 */

import { AC_ID_RE, matchIds } from './requirement-ids.js';

/** Detector outcomes. `CANNOT_CHECK` is a value on the record, never rendered as clean (`B39`). */
export const PLAN_CONSISTENCY_STATUS = Object.freeze({
  CLEAN: 'clean',
  FINDINGS: 'findings',
  CANNOT_CHECK: 'cannot-check',
});

const FENCE_RE = /^\s*(```|~~~)/;
/** A task unit is a heading at level 3 or deeper. */
const TASK_HEADING_RE = /^#{3,}\s+(.*)$/;
/** h1/h2 are document sections; they close a task unit rather than opening one. */
const SECTION_HEADING_RE = /^#{1,2}\s/;

/**
 * A quantity worth cross-checking: a number with a unit, an arithmetic
 * expression, or an explicit threshold/coefficient word. A bare year or list
 * index is not a threshold, which is why this is not simply `/\d/`.
 */
const QUANTITY_RE = new RegExp(
  [
    // Word-character units NEED the trailing \b: "2 slices" must not match on `s`.
    '\\b\\d+[ \\t]*(?:KB|MB|GB|ms|B|s|x)\\b',
    // Symbol units must NOT have one. `\b` is a word/non-word transition, so after
    // `%` or `×` followed by a space it can never hold — the first draft used one
    // alternation for both and silently never matched "80%", the commonest way a
    // plan states a numeric threshold. In a recall-first detector that is the
    // worst direction to be wrong in. (PR #200 review.)
    '\\d+[ \\t]*[%×]',
    // Arithmetic. Two deliberate narrowings, both from the same review:
    //   * `[ \t]` not `\s` — `\s` spans newlines, so two adjacent list lines
    //     ("- **Wave:** 1" / "- 2 new tests") read as one expression.
    //   * no `-` — it makes every ISO date an expression (2026-07-04 → "2026-07"),
    //     contradicting this module's own rule that a bare year is not a threshold.
    //     Subtraction does not appear in the plan formulas this detects; the
    //     motivating case is `template_floor + 150B × required_section_count`.
    '\\d+[ \\t]*[+*/×][ \\t]*\\d+',
    '\\bthreshold\\b',
    '\\bcoefficient\\b',
  ].join('|'),
  'i'
);

/**
 * Prose that announces acceptance criteria without citing an ID.
 *
 * **The ID half deliberately is NOT defined here.** `tools/lib/requirement-ids.js`
 * is the single place a requirement ID is recognised, and
 * `tests/requirement-ids.test.js` fails the suite if a second `tools/lib` module
 * defines its own FR / NFR / AC pattern. This module's first draft did exactly
 * that and the guard caught it — the `B82` shape (two implementations of one
 * concept, free to drift), prevented rather than filed.
 */
const CRITERION_PROSE_RE = /acceptance criteri|criteri(?:on|a)\b/i;

/**
 * Split a PLAN artifact into task units.
 *
 * Level 3+ because both shapes are real and both must parse: `M4.5.E9` nests
 * `#### S1.t11` tasks under `### S1` slices, while `M6.E3` and `M5.E19` carry
 * flat `### S1` slices with no `####` at all. An earlier `###`-only draft could
 * not see `S1.t11` — the one task this check exists to catch.
 *
 * @param {string} content
 * @returns {Array<{heading: string, body: string}>}
 */
export function parsePlanTasks(content) {
  if (typeof content !== 'string' || content === '') return [];

  const out = [];
  let current = null;
  let inFence = false;

  for (const line of content.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      if (current) current.body.push(line);
      continue;
    }
    if (inFence) {
      if (current) current.body.push(line);
      continue;
    }
    const task = line.match(TASK_HEADING_RE);
    if (task) {
      if (current) out.push(current);
      current = { heading: task[1].trim(), body: [] };
      continue;
    }
    if (SECTION_HEADING_RE.test(line)) {
      if (current) out.push(current);
      current = null;
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) out.push(current);

  return out.map((t) => ({ heading: t.heading, body: t.body.join('\n') }));
}

/**
 * The worklist: task units carrying BOTH a quantity and an acceptance criterion.
 *
 * @param {string} content — a PLAN artifact's text
 * @param {{source?: string}} [opts] — `source` names the file, so a
 *   `cannot-check` can say WHICH input it could not read (NFR3). Silence about
 *   blindness is the bug the corpus rule exists to prevent.
 * @returns {{status: string, tasks: Array<{heading: string}>, reason: string|null}}
 */
export function detectQuantitativeTasks(content, opts = {}) {
  const source = opts.source ?? 'the plan';

  if (typeof content !== 'string' || content.trim() === '') {
    return {
      status: PLAN_CONSISTENCY_STATUS.CANNOT_CHECK,
      tasks: [],
      reason: `${source} is empty or unreadable — no task units to examine.`,
    };
  }

  const tasks = parsePlanTasks(content);
  if (tasks.length === 0) {
    return {
      status: PLAN_CONSISTENCY_STATUS.CANNOT_CHECK,
      tasks: [],
      reason:
        `${source} has no level-3+ headings, so it carries no task units this check can read. ` +
        `Measured across the eval corpus, 2 of 13 projects are this shape. ` +
        `Reported as unreadable rather than clean: nothing was examined.`,
    };
  }

  const flagged = tasks
    .filter((t) => {
      const whole = `${t.heading}\n${t.body}`;
      const hasCriterion =
        matchIds(whole, AC_ID_RE).length > 0 || CRITERION_PROSE_RE.test(whole);
      return QUANTITY_RE.test(whole) && hasCriterion;
    })
    .map((t) => ({ heading: t.heading }));

  return {
    status: flagged.length > 0 ? PLAN_CONSISTENCY_STATUS.FINDINGS : PLAN_CONSISTENCY_STATUS.CLEAN,
    tasks: flagged,
    reason: null,
  };
}
