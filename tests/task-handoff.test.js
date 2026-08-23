// M6.E4 S3 — task-handoff completeness (FR3.1 / FR3.2).
//
// Signal pays research agents to find the good examples, writes them to
// {phase}-RESEARCH.md, and then hands the executor a task without them. Three
// leaks in one seam, all verified on disk:
//
//   1. executor.md's ## Inputs declares the PLAN task, CONTEXT.md and
//      VALIDATION.md — RESEARCH.md is not among them, and execute.md's dispatch
//      reads PLAN + VALIDATION only.
//   2. The planning skill has a "Files likely touched" field; plan.md's
//      required-contents list omits it. Skill and command disagree.
//   3. No per-task out-of-scope field exists anywhere.
//
// These are cross-DOCUMENT tests (M5.E17's shape). A prompt-layer omission
// cannot be caught any other way — there is no code path to assert against.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

const executorMd = () => read('plugin/agents/executors/executor.md');
const planMd = () => read('plugin/commands/plan.md');
const planSkill = () => read('plugin/skills/plan/planning-and-task-breakdown/SKILL.md');

describe('M6.E4 S3 — the research reaches the builder (FR3.1)', () => {
  it('AC3.1a — executor.md ## Inputs declares RESEARCH.md', () => {
    const inputs = executorMd().split('## Inputs')[1].split('## Process')[0];
    expect(inputs).toMatch(/RESEARCH\.md/);
  });

  it('AC3.1a — the other three declared inputs are still there (no swap)', () => {
    const inputs = executorMd().split('## Inputs')[1].split('## Process')[0];
    expect(inputs).toMatch(/PLAN\.md/);
    expect(inputs).toMatch(/CONTEXT\.md/);
    expect(inputs).toMatch(/VALIDATION\.md/);
  });

  it('AC3.1b — the executor is told to follow a named exemplar, not re-derive it', () => {
    expect(executorMd()).toMatch(/exemplar/i);
  });

  it('AC3.1c — the executor is told it receives a REFERENCE, not the whole document', () => {
    // Context budget is the project's stated highest risk. Bulk-injecting
    // RESEARCH.md into every task context is the failure mode this avoids.
    expect(executorMd()).toMatch(/whole|entire|bulk|in full/i);
  });
});

describe('M6.E4 S3 — the two missing plan fields (FR3.2)', () => {
  it('AC3.2a — plan.md required contents carries "Files likely touched"', () => {
    expect(planMd()).toMatch(/Files likely touched/);
  });

  it('AC3.2a — command and skill AGREE, so leak 2 cannot silently reopen', () => {
    // The defect was not that the field was missing from both — it was that the
    // skill had it and the authoritative command list did not. Asserting both
    // ends is what makes the disagreement itself the failure.
    expect(planSkill()).toMatch(/Files likely touched/);
    expect(planMd()).toMatch(/Files likely touched/);
  });

  it('AC3.2b — a per-task "Out of scope" field is named in plan.md', () => {
    expect(planMd()).toMatch(/Out of scope/i);
  });

  it('AC3.2c — the requirement folds into completeness, not a 9th dimension', () => {
    const checker = read('plugin/agents/verifiers/plan-checker.md');
    expect(checker).toMatch(/8 dimensions/i);
    expect(checker).not.toMatch(/9 dimensions/i);
    const completenessIdx = checker.search(/\*\*Completeness\*\*/);
    expect(completenessIdx).toBeGreaterThan(-1);
  });

  it('AC3.2d — the new fields are ADVISORY: a plan lacking them is reported, not failed', () => {
    // D-M6E4-7. Corpus plans predate the fields and were correct when written;
    // failing them retroactively is the retroactive-guard mistake, not a fix.
    const checker = read('plugin/agents/verifiers/plan-checker.md');
    expect(checker).toMatch(/advisory|report(ed)? (but )?not (a )?fail|do not fail/i);
  });
});
