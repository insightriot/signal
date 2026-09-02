// M6.E4 S1 — spec-internal consistency (FR1.1 / FR1.2).
//
// M4.5.E9 shipped a task whose stated threshold formula could not satisfy the
// acceptance criterion stated in the same task. The 8-dimension pass audits goal
// alignment, completeness, dependency, testability, scope, context, risk and
// vertical slicing — none of which compares a plan's formula against its own
// criterion.
//
// This detector does NOT judge satisfaction. It produces a WORKLIST: tasks
// carrying both a number and an acceptance criterion, which the plan-checker
// prompt must then address by name. Recall matters; precision is deliberately
// not the headline number (a false positive costs a paragraph of attention, a
// false negative lets a contradiction through unexamined).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parsePlanTasks,
  detectQuantitativeTasks,
  PLAN_CONSISTENCY_STATUS as STATUS,
} from '../plugin/tools/lib/plan-consistency.js';
import { REACH, describeReach } from '../plugin/tools/lib/published-facts.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// AC1.1a's fixture: M4.5.E9 S1.t11, COPIED verbatim rather than read live from
// .planning/archive/ — /sig:docs-archive exists to move that file, and a test that
// reads it breaks the moment it does.
const M45E9_S1T11 = `# M4.5.E9 — Plan

## Slices

### S1 — retrospective validation

#### S1.t11 — Tier-specific minimum-byte thresholds (measured + wired)
- **Description:** Measure rendered byte size of each tier template (empty body, headings only). Compute threshold = \`template_floor + 150B × required_section_count\`. Wire into \`validateRetroContent\`. Replace S1.t4's placeholder thresholds.
- **Acceptance criteria:**
  - Threshold values committed in \`tools/lib/retrospective.js\` are derived from measurements documented in PLAN.md or RESEARCH addendum.
  - Tier byte-threshold tests pass at the new values.
  - Empty template (just headings) is rejected; minimally-filled template (one sentence per section) passes.
- **Complexity:** S
`;

const NO_NUMBERS = `# A plan with no quantities

## Slices

### S1 — rename a helper

- **Deliverable:** rename \`foo\` to \`bar\`.
- **Acceptance criteria:** the old name appears nowhere.
`;

const NO_TASK_UNITS = `# A plan with no level-3+ headings

## Phase goal
Do the thing.

## Dependencies
None.
`;

describe('M6.E4 S1 — the plan-task parser (FR1.1)', () => {
  it('parses h4 tasks nested under h3 slices — the older Signal shape', () => {
    const tasks = parsePlanTasks(M45E9_S1T11);
    expect(tasks.some((t) => /S1\.t11/.test(t.heading))).toBe(true);
  });

  it('parses flat h3 slices — the newer Signal shape', () => {
    const tasks = parsePlanTasks(NO_NUMBERS);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].heading).toMatch(/S1 — rename a helper/);
  });

  it('does not treat h1/h2 section headings as task units', () => {
    expect(parsePlanTasks(NO_TASK_UNITS)).toHaveLength(0);
  });

  it('is fence-aware — a ### inside a code fence is not a task', () => {
    const fenced = `# Plan

### S1 — real task

Body.

\`\`\`markdown
### Not a task, this is a sample
\`\`\`
`;
    expect(parsePlanTasks(fenced)).toHaveLength(1);
  });
});

describe('M6.E4 S1 — the detector (FR1.1)', () => {
  it('AC1.1a — returns the M4.5.E9 S1.t11 task', () => {
    const r = detectQuantitativeTasks(M45E9_S1T11);
    expect(r.status).toBe(STATUS.FINDINGS);
    expect(r.tasks.some((t) => /S1\.t11/.test(t.heading))).toBe(true);
  });

  it('AC1.1b — a numberless plan returns empty AND clean', () => {
    const r = detectQuantitativeTasks(NO_NUMBERS);
    expect(r.tasks).toEqual([]);
    expect(r.status).toBe(STATUS.CLEAN);
  });

  it('AC1.1c — a plan with no task units is CANNOT_CHECK, not clean', () => {
    // Measured: 2 of 13 corpus projects are exactly this shape.
    const r = detectQuantitativeTasks(NO_TASK_UNITS);
    expect(r.status).toBe(STATUS.CANNOT_CHECK);
    expect(r.status).not.toBe(STATUS.CLEAN);
  });

  it('AC1.1c — absent/empty input is CANNOT_CHECK, not clean', () => {
    expect(detectQuantitativeTasks(null).status).toBe(STATUS.CANNOT_CHECK);
    expect(detectQuantitativeTasks('').status).toBe(STATUS.CANNOT_CHECK);
  });

  it('NFR3 — a CANNOT_CHECK states WHICH input it could not read', () => {
    const r = detectQuantitativeTasks(NO_TASK_UNITS, { source: '.planning/X-PLAN.md' });
    expect(r.reason).toBeTruthy();
    expect(r.reason).toMatch(/X-PLAN\.md/);
  });

  it('NFR2 — malformed markdown does not throw', () => {
    const malformed = `# Plan

### S1

\`\`\`js
unclosed fence
`;
    expect(() => detectQuantitativeTasks(malformed)).not.toThrow();
  });
});

describe('M6.E4 S1 — QUANTITY_RE precision and recall (PR #200 review)', () => {
  const plan = (body) => `# Plan\n\n### S1 — a task\n\n${body}\n`;

  it('RECALL: a percentage threshold is detected', () => {
    // The \b after the unit alternation could never hold for `%` — a non-word
    // char followed by a space is not a boundary — so "80%" silently never
    // matched. Percentages are one of the commonest ways a plan states a numeric
    // threshold, and missing them directly undercuts the recall-first contract.
    const r = detectQuantitativeTasks(
      plan('- **Acceptance criteria:** coverage must be at least 80% of lines')
    );
    expect(r.status).toBe(STATUS.FINDINGS);
  });

  it('RECALL: a × expression is detected', () => {
    const r = detectQuantitativeTasks(
      plan('- Compute threshold = floor + 150B × sections.\n- **Acceptance criteria:** it passes.')
    );
    expect(r.status).toBe(STATUS.FINDINGS);
  });

  it('PRECISION: an ISO date is not an arithmetic expression', () => {
    const r = detectQuantitativeTasks(
      plan('- Captured 2026-07-04.\n- **Acceptance criteria:** the entry is filed.')
    );
    expect(r.status).toBe(STATUS.CLEAN);
  });

  it('PRECISION: two adjacent list lines are not one expression', () => {
    // `\s` spans newlines, so `- **Wave:** 1` followed by `- 2 new tests` read
    // as "1 - 2". Quantity matching must not cross a line boundary.
    const r = detectQuantitativeTasks(
      plan('- **Wave:** 1\n- 2 new tests\n- **Acceptance criteria:** they pass.')
    );
    expect(r.status).toBe(STATUS.CLEAN);
  });
});

describe('M6.E4 S1 — reach is published, not typed (AC1.1d)', () => {
  it('REACH carries a row for this check', () => {
    expect(REACH['plan-internal-consistency']).toBeDefined();
    expect(REACH['plan-internal-consistency'].evaluable).toBe(10);
    expect(REACH['plan-internal-consistency'].total).toBe(13);
  });

  it('plan-checker.md\'s stated reach MATCHES REACH — derived, then compared', () => {
    // Found at REVIEW. describeReach exists so that "nothing types the numbers",
    // but plan-checker.md is a PROMPT — static text that cannot call a function
    // at render time — so its reach sentence is necessarily hand-written. That
    // makes it a published fact duplicated from REACH and free to drift, which
    // is precisely M6.E2's defect class.
    //
    // The prompt cannot be made dynamic, so the number is DERIVED here and
    // COMPARED against the file. Editing REACH without editing the prompt now
    // turns the suite red.
    const checkerMd = readFileSync(
      join(repoRoot, 'plugin/agents/verifiers/plan-checker.md'),
      'utf8'
    );
    const { evaluable, total } = REACH['plan-internal-consistency'];
    expect(checkerMd).toMatch(new RegExp(`${evaluable} of ${total}`));
  });

  it('the reach sentence comes from describeReach, not a hand-typed string', () => {
    const prose = describeReach(REACH['plan-internal-consistency']);
    expect(prose).toMatch(/10/);
    expect(prose).toMatch(/13/);
  });
});

describe('M6.E4 S1 — the prompt obligation (FR1.2)', () => {
  const checker = () =>
    readFileSync(join(repoRoot, 'plugin/agents/verifiers/plan-checker.md'), 'utf8');

  it('AC1.2a — plan-checker.md names the detector and the per-task obligation', () => {
    const c = checker();
    expect(c).toMatch(/detectQuantitativeTasks/);
    expect(c).toMatch(/by name/i);
  });

  it('AC1.2b — the obligation sits under testability, and the count stays 8', () => {
    const c = checker();
    expect(c).toMatch(/8 dimensions/i);
    expect(c).not.toMatch(/9 dimensions/i);
    const testabilityIdx = c.search(/testability/i);
    const detectorIdx = c.search(/detectQuantitativeTasks/);
    expect(testabilityIdx).toBeGreaterThan(-1);
    expect(detectorIdx).toBeGreaterThan(testabilityIdx);
  });

  it('AC1.2c — the residual is disclosed at the point of use', () => {
    // B75's shape at a smaller radius: nothing FAILS if the prompt ignores the
    // worklist. Verified as documented, never as enforced — claiming a test for
    // the behaviour itself would be the false-coverage class.
    const c = checker();
    // Broadened from the first draft's /nothing fails/ to the vocabulary the
    // disclosure actually uses. Not a weakening: it still fails if the paragraph
    // is deleted, and it additionally pins the B75 cross-reference so the
    // residual stays traceable to the row it belongs to.
    expect(c).toMatch(/checked by nothing|not enforced|no test fails/i);
    expect(c).toMatch(/B75/);
  });
});
