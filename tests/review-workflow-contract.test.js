import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WORKFLOW = join(ROOT, '.github/workflows/claude-code-review.yml');

/**
 * The PR reviewer's on-demand head review (M6.E18 S1, SIG-348, D-M6E18-1 / -7 / -8).
 *
 * The upstream /code-review command stops at its step 1 when Claude has already commented, so only a
 * PR's first push was ever reviewed. These tests read the real workflow: the label-triggered job
 * exists, runs a prompt without that stop, writes one outcome line into the log, and widens no
 * permission. A YAML edit that drops any of these goes red here, not on the next unreviewed PR.
 */

const raw = readFileSync(WORKFLOW, 'utf8');
const wf = parseYaml(raw);
const jobs = wf.jobs ?? {};
const head = jobs['review-head'];
const reviewStep = (job) => job?.steps?.find((s) => String(s.uses ?? '').startsWith('anthropics/claude-code-action'));
const outcomeStep = (job) => job?.steps?.find((s) => s.name === 'Record review outcome');

describe('review-head: a review of the head commit, asked for by a label', () => {
  it('runs on the labeled event, only for the review-head label', () => {
    expect(wf.on.pull_request.types).toContain('labeled');
    expect(head).toBeDefined();
    expect(head.if).toBe("github.event.action == 'labeled' && github.event.label.name == 'review-head'");
  });

  it('keeps ordinary pushes on the existing job, which skips the labeled event (AC1.2)', () => {
    expect(wf.on.pull_request.types).toEqual(
      expect.arrayContaining(['opened', 'synchronize', 'ready_for_review', 'reopened'])
    );
    expect(jobs['claude-review'].if).toBe("github.event.action != 'labeled'");
    expect(reviewStep(jobs['claude-review']).with.prompt).toMatch(/^\/code-review:code-review --comment /);
  });

  it("runs a prompt without the upstream step 1 stop, keeping every review agent (AC1.1)", () => {
    const prompt = reviewStep(head).with.prompt;
    expect(prompt).not.toMatch(/already commented/i);
    expect(prompt).not.toMatch(/\/code-review:code-review/);
    expect(prompt).toContain('${{ github.event.pull_request.head.sha }}');
    expect(prompt).toContain('The --comment argument IS provided');
    for (const agent of ['Agents 1 + 2', 'Agent 3', 'Agent 4']) expect(prompt).toContain(agent);
    expect(prompt).toMatch(/launch parallel subagents to validate the issue/);
    expect(prompt).toContain('mcp__github_inline_comment__create_inline_comment');
  });

  it('says why it exists and where its prompt came from (AC1.5)', () => {
    expect(raw).toMatch(/copied from anthropics\/claude-code at [0-9a-f]{40}/);
    expect(raw).toContain('39346376038');
    expect(raw).toContain('SIG-348');
  });

  it("keeps the GITHUB_TOKEN's permissions: both jobs read pull requests, nothing more (AC1.6)", () => {
    for (const name of ['claude-review', 'review-head']) {
      expect(jobs[name].permissions).toEqual({
        contents: 'read', 'pull-requests': 'read', issues: 'read', 'id-token': 'write',
      });
    }
  });

  // The agent acts through the action's app token, so its tool list is what bounds it (REVIEW pass 1).
  it('gives the agent the same tool list in both jobs, with no shell, API, label or file-writing tool', () => {
    const tools = (job) => /--allowedTools "([^"]*)"/.exec(reviewStep(job).with.claude_args)?.[1];
    expect(tools(head)).toBe(tools(jobs['claude-review']));
    const list = tools(head).split(',');
    for (const banned of ['Bash(*)', 'Bash', 'Write', 'Edit']) expect(list).not.toContain(banned);
    expect(list.filter((t) => /gh api|gh label|gh pr edit|gh pr merge|git push/.test(t))).toEqual([]);
  });

  it('leaves no git credential on disk, and runs one head review per PR at a time', () => {
    for (const name of ['claude-review', 'review-head']) {
      expect(jobs[name].steps.find((s) => String(s.uses ?? '').startsWith('actions/checkout')).with['persist-credentials']).toBe(false);
    }
    expect(head.concurrency).toEqual({ group: 'review-head-${{ github.event.pull_request.number }}', 'cancel-in-progress': true });
  });

  it('names a run review-head only when the review-head label started it', () => {
    expect(wf['run-name']).toContain("github.event.label.name == 'review-head' && format('review-head {0}', github.event.pull_request.head.sha)");
  });
});

describe('the outcome line both jobs write into the log (AC1.6)', () => {
  for (const name of ['claude-review', 'review-head']) {
    it(`${name} records its outcome even when the review step fails`, () => {
      const step = outcomeStep(jobs[name]);
      expect(step).toBeDefined();
      expect(step.if).toBe('always()');
      expect(step.env.JOB).toBe(name === 'claude-review' ? 'review' : 'review-head');
      expect(jobs[name].steps.at(-1)).toBe(step);
    });
  }

  // Run the step's own script against a transcript, the way the runner would. Read inside each test,
  // so a workflow without the step fails the assertion rather than the file's load.
  it('both jobs run the same outcome script (REVIEW pass 1: only one was ever run by a test)', () => {
    expect(outcomeStep(jobs['claude-review']).run).toBe(outcomeStep(head).run);
  });

  const run = (transcript, job = head) => {
    const step = job && outcomeStep(job);
    expect(step?.run).toMatch(/^node - <<'JS'\n/);
    const script = step.run.replace(/^node - <<'JS'\n/, '').replace(/\nJS\n?$/, '\n');
    const dir = mkdtempSync(join(tmpdir(), 'review-outcome-'));
    try {
      const out = join(dir, 'claude-execution-output.json');
      if (transcript !== undefined) writeFileSync(out, typeof transcript === 'string' ? transcript : JSON.stringify(transcript));
      return execFileSync(process.execPath, ['-e', script], {
        env: { ...process.env, OUT: out, HEAD_SHA: 'abc1234', JOB: 'review' },  // JOB as the line shows it
        encoding: 'utf8',
      }).trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('a step-1 stop reads stopped-step-1, as #304 run 39346376038 ended — in both jobs', () => {
    expect(run([{ type: 'result', num_turns: 2, total_cost_usd: 0.106, result: "Claude has already commented on PR #304, so I'm stopping. I did not review it or post anything new." }], jobs['claude-review']))
      .toBe('REVIEW_OUTCOME=stopped-step-1 head=abc1234 job=review turns=2 cost=0.106');
    // Run 39346782991's own words, the other way the stop was put.
    expect(run([{ type: 'result', num_turns: 3, total_cost_usd: 0.111, result: "Claude has already commented on this PR, so step 1 says to stop. I haven't reviewed the diff and I haven't posted anything." }], jobs['claude-review']))
      .toBe('REVIEW_OUTCOME=stopped-step-1 head=abc1234 job=review turns=3 cost=0.111');
    expect(run([{ type: 'system' }, {
      type: 'result', num_turns: 2, total_cost_usd: 0.106,
      result: "Claude has already commented on PR #304, so I'm stopping. I did not review it or post anything new.",
    }])).toBe('REVIEW_OUTCOME=stopped-step-1 head=abc1234 job=review turns=2 cost=0.106');
  });

  it('a full review that mentions "already commented" is a review, not a stop', () => {
    expect(run([{ type: 'result', num_turns: 14, total_cost_usd: 1.6, result: 'I already commented inline on two issues.' }]))
      .toBe('REVIEW_OUTCOME=reviewed head=abc1234 job=review turns=14 cost=1.6');
  });

  // REVIEW fix round 1's fresh read: a turn limit let a 6-turn stop read as reviewed. The stop is
  // known by what it says, whatever it cost.
  it('a step-1 stop that took more turns still reads stopped-step-1', () => {
    expect(run([{ type: 'result', num_turns: 7, total_cost_usd: 0.4, result: 'Claude has already commented on PR #12, so I am stopping. I did not review it.' }]))
      .toBe('REVIEW_OUTCOME=stopped-step-1 head=abc1234 job=review turns=7 cost=0.4');
  });

  it('a review that ran reads reviewed, with its turns and cost', () => {
    expect(run([{ type: 'result', num_turns: 9, total_cost_usd: 1.44, result: 'No issues found.' }]))
      .toBe('REVIEW_OUTCOME=reviewed head=abc1234 job=review turns=9 cost=1.44');
  });

  it('no transcript (a workflow-validation skip) or an unreadable one reads no-result', () => {
    expect(run(undefined)).toBe('REVIEW_OUTCOME=no-result head=abc1234 job=review turns= cost=');
    expect(run('{not json')).toBe('REVIEW_OUTCOME=no-result head=abc1234 job=review turns= cost=');
    expect(run([{ type: 'assistant' }])).toBe('REVIEW_OUTCOME=no-result head=abc1234 job=review turns= cost=');
  });
});
