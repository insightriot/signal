import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REVIEW_MD = join(ROOT, 'plugin/commands/review.md');
const AGENT_MD = join(ROOT, 'plugin/agents/specialists/code-reviewer.md');

/**
 * REVIEW must dispatch a reviewer that does NOT share the authoring session's
 * context, before it declares a verdict.
 *
 * ⚠ THE TRIGGER IS TWO MEASUREMENTS, NOT A PREFERENCE.
 *
 *   M6.E7 — two fresh-context reviews found 9 of 11 Important issues, and
 *           `review.md` asked for neither. `review_depth` describes WHAT to
 *           review and says nothing about WHO.
 *   #243  — a four-file fix. Two external review passes found six issues, two of
 *           them regressions introduced by the fix itself. The authoring
 *           session's own review found NONE of the six.
 *
 * Neither gap is knowledge. Both are assumptions the author could not see
 * because they were the author's — which is why the remedy is a different
 * reader, and why the BRIEF matters as much as the dispatch. Handing the
 * reviewer CONTEXT.md or the plan's reasoning re-supplies exactly the
 * assumptions it was sent to find.
 *
 * `tests/agent-reachability.test.js` already asserts that `code-reviewer` counts
 * as dispatched and carries no un-dispatched marker. This file asserts the three
 * things that make the dispatch worth having: it is REQUIRED, it runs BEFORE the
 * verdict, and it is starved of context on purpose.
 */
describe('REVIEW dispatches a fresh-context reviewer', () => {
  const doc = readFileSync(REVIEW_MD, 'utf8');

  it('names code-reviewer in a dispatch table with subagent_type', () => {
    expect(doc).toMatch(/subagent_type/);
    const row = doc.split('\n').find((l) => /^\s*\|/.test(l) && /`code-reviewer`/.test(l));
    expect(
      row,
      'review.md must name `code-reviewer` in a table row alongside subagent_type — that is the ' +
        'shape agent-reachability.test.js reads as dispatch, and prose naming an agent is not ' +
        'dispatch.',
    ).toBeTruthy();
  });

  it('the dispatch runs BEFORE the verdict is declared', () => {
    // The whole finding was an ORDERING one: these findings used to arrive at
    // PR-open, after REVIEW returned PASS. A step that runs after the verdict
    // reproduces exactly the problem it was added to fix.
    const dispatch = doc.indexOf('### 4.5');
    const report = doc.indexOf('### 5. Write Review Report');
    const verdict = doc.indexOf('## Verdict');
    expect(dispatch, 'review.md has no § 4.5 dispatch step').toBeGreaterThan(-1);
    expect(report, 'review.md has no § 5 report step').toBeGreaterThan(-1);
    expect(verdict, 'review.md has no Verdict section').toBeGreaterThan(-1);
    expect(dispatch).toBeLessThan(report);
    expect(dispatch).toBeLessThan(verdict);
  });

  it('is a required exit criterion, not an optional extra', () => {
    const exit = doc.slice(doc.indexOf('### Exit Criteria'));
    expect(exit, 'review.md has no Exit Criteria section').toBeTruthy();
    expect(
      /4\.5|[Ff]resh-context reviewer/.test(exit),
      'the Exit Criteria must require the § 4.5 dispatch — a step nothing checks is the ' +
        'never-called-guard class this repo already has a name for.',
    ).toBe(true);
  });

  it('an un-dispatchable reviewer is a recorded failure, never a silent pass', () => {
    // Dev-mode checkouts do not auto-register plugin agents (init.md § 2), and
    // Signal-on-Signal IS dev mode. Awkward dispatch is how this agent stayed
    // unwired for four months.
    const step = doc.slice(doc.indexOf('### 4.5'), doc.indexOf('### 5. Write Review Report'));
    expect(step, 'no § 4.5 step body to check').toBeTruthy();
    expect(step).toMatch(/cannot-dispatch/);
    expect(step, 'the step must name the dev-mode fallback, or it fails in this very repo').toMatch(
      /dev-mode|development checkout/i,
    );
  });

  describe('the brief is starved of context ON PURPOSE, in both files', () => {
    const agent = readFileSync(AGENT_MD, 'utf8');
    const step = doc.slice(doc.indexOf('### 4.5'), doc.indexOf('### 5. Write Review Report'));

    // Named individually so a future edit that quietly starts passing one of
    // these fails here rather than degrading the reviewer into a second opinion
    // that already agrees with the author.
    const forbidden = ['CONTEXT.md', 'DECISIONS.md'];

    it.each(forbidden)('review.md § 4.5 explicitly withholds %s', (doc_name) => {
      const re = new RegExp(`\\*\\*[Nn]ot\\*\\*[^\\n]*\`${doc_name}\`|\`${doc_name}\`[^\\n]*`);
      expect(re.test(step), `§ 4.5 must say ${doc_name} is withheld`).toBe(true);
      expect(step).toMatch(/omissions are the mechanism/);
    });

    it('the agent file tells the reviewer not to ask for more context', () => {
      expect(agent).toMatch(/do not ask for more context/i);
      expect(
        agent,
        "the agent must be told a legibility gap is a FINDING, not its own fault — otherwise it " +
          'requests the context that defeats the point.',
      ).toMatch(/that is a finding|report it\s*\n?\s*as one|is a finding/i);
    });

    it('the agent is told to treat comments and commit messages as unverified', () => {
      // The two defects #243's reviewer found that mattered most were both a
      // comment or a claim that did not match the code.
      expect(agent).toMatch(/unverified/i);
    });
  });
});
