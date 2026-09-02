/**
 * tests/published-facts.test.js — M6.E2 S1.
 *
 * The check must distinguish THREE applicability outcomes, not two. A `BUGS.md`
 * that publishes no tally is an unknown, not an exemption — `compareBugTally`
 * already returns `ok:false, reason:'no-tally'` on the stated grounds that
 * silence must not read as clean. Collapsing that to `NOT_APPLICABLE` would
 * silence the check on all three non-Signal corpus projects that have a
 * `BUGS.md` (none publishes a tally), which is this Epic's own failure mode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  PUBLISHED_FACT_CHECKS,
  checkPublishedBugTally,
  REACH,
  describeReach,
} from '../plugin/tools/lib/published-facts.js';
import { runDriftChecks, STATE_DRIFT_CHECKS, STATUS, HEAL, defineCheck } from '../plugin/tools/lib/state-drift.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const STATE_MD = `---
schema_version: 1
phase: EXECUTE
current_epic: M9.E1
completed_phases: []
---
# State
`;

const TABLE = (rows) =>
  ['| ID | Status | Pri | Summary |', '|---|---|---|---|', ...rows].join('\n');

const TALLY = (t) =>
  `*0 needs-triage · **0 captured-untriaged** · ${t.confirmed} confirmed · 0 dismissed · ${t.fixed} fixed (**${t.total} total**). Last updated: 2026-08-18.*`;

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'm6e2-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), STATE_MD);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const writeBugs = (content) => writeFile(join(dir, '.planning', 'BUGS.md'), content);
const run = () => runDriftChecks(dir, [checkPublishedBugTally]);

describe('AC2.1 / AC2.2 — the registry and how its checks are built', () => {
  it('exports a frozen registry containing the tally check', () => {
    expect(Object.isFrozen(PUBLISHED_FACT_CHECKS)).toBe(true);
    expect(PUBLISHED_FACT_CHECKS).toContain(checkPublishedBugTally);
  });

  it('is NOT appended to STATE_DRIFT_CHECKS — state-drift.js is named for STATE (D-M6E2-3)', () => {
    for (const c of PUBLISHED_FACT_CHECKS) {
      expect(STATE_DRIFT_CHECKS).not.toContain(c);
    }
  });

  it('uses the existing defineCheck harness — no second harness is written', () => {
    expect(checkPublishedBugTally.id).toBe('published-bug-tally');
    expect(Object.values(HEAL)).toContain(checkPublishedBugTally.healCategory);
    expect(Object.isFrozen(checkPublishedBugTally)).toBe(true);
    // The harness is what enforces the contract: a def with no category throws.
    expect(() => defineCheck({ id: 'x', applicability: () => 'EVAL', run: () => [] })).toThrow();
  });
});

describe('AC5.1 — three applicability outcomes, distinguished by fixture', () => {
  it('no BUGS.md at all → NOT_APPLICABLE (the check does not apply here)', async () => {
    const { results } = await run();
    expect(results[0].status).toBe(STATUS.NOT_APPLICABLE);
  });

  it('a BUGS.md that publishes NO tally → CANNOT_EVALUATE, never NOT_APPLICABLE', async () => {
    await writeBugs(TABLE(['| B1 | `confirmed` | P2 | a defect |']));
    const { results } = await run();
    expect(results[0].status).toBe(STATUS.CANNOT_EVALUATE);
    expect(results[0].reason).toMatch(/tally/i);
  });

  it('a BUGS.md whose tally is correct → CLEAN', async () => {
    await writeBugs(
      TABLE(['| B1 | `confirmed` | P2 | a |', '| B2 | `fixed` | P3 | b |']) +
        '\n\n' + TALLY({ confirmed: 1, fixed: 1, total: 2 })
    );
    const { results } = await run();
    expect(results[0].status).toBe(STATUS.CLEAN);
  });
});

describe('AC3.1 — the tally is compared against the file, and the corrected value is offered', () => {
  it('reports findings when the published tally disagrees with the contents', async () => {
    await writeBugs(
      TABLE(['| B1 | `confirmed` | P2 | a |', '| B2 | `fixed` | P3 | b |']) +
        '\n\n' + TALLY({ confirmed: 9, fixed: 1, total: 10 })
    );
    const { results } = await run();
    expect(results[0].status).toBe(STATUS.FINDINGS);
    expect(results[0].findings.length).toBeGreaterThan(0);
    const text = results[0].findings.map((f) => f.message).join('\n');
    expect(text).toMatch(/confirmed/);
    expect(text).toMatch(/re-derive/i);
  });

  it('names BUGS.md as the file so the finding is actionable', async () => {
    await writeBugs(TABLE(['| B1 | `confirmed` | P2 | a |']) + '\n\n' + TALLY({ confirmed: 5, fixed: 0, total: 5 }));
    const { results } = await run();
    expect(results[0].findings[0].file).toMatch(/BUGS\.md$/);
  });
});

describe('NFR2 — fail-open: a check that cannot read degrades, it does not throw', () => {
  it('an unreadable BUGS.md becomes CANNOT_EVALUATE rather than an exception', async () => {
    // A directory where a file is expected: readFileSync throws EISDIR.
    await mkdir(join(dir, '.planning', 'BUGS.md'));
    const { results } = await run();
    expect(results[0].status).toBe(STATUS.CANNOT_EVALUATE);
  });
});

describe('AC4.3 — reach is rendered from one recorded figure, never retyped', () => {
  it('every check in the registry declares a reach', () => {
    for (const c of PUBLISHED_FACT_CHECKS) {
      expect(REACH[c.id]).toBeDefined();
      expect(REACH[c.id].total).toBeGreaterThan(0);
    }
  });

  it("the check's describe is BUILT from REACH — changing REACH changes the text", () => {
    const r = REACH[checkPublishedBugTally.id];
    expect(checkPublishedBugTally.describe).toContain(describeReach(r));
    expect(describeReach({ evaluable: 7, total: 9 })).not.toBe(describeReach(r));
  });

  it('no reach figure is typed as a literal anywhere else in the module', () => {
    const src = readFileSync(join(ROOT, 'plugin/tools/lib/published-facts.js'), 'utf8');
    // The rendered form ("1 of 12") must appear zero times as a literal; it is
    // only ever produced by describeReach(). A transcribed number is exactly
    // the defect this Epic is about, committed inside it.
    const r = REACH[checkPublishedBugTally.id];
    expect(src).not.toContain(`${r.evaluable} of ${r.total}`);
  });
});

describe('AC2.3 / AC2.4 — the check reaches a command, proven behaviourally', () => {
  it('ALL_DRIFT_CHECKS composes both registries and stays frozen', async () => {
    const { ALL_DRIFT_CHECKS } = await import('../plugin/tools/lib/published-facts.js');
    expect(Object.isFrozen(ALL_DRIFT_CHECKS)).toBe(true);
    for (const c of STATE_DRIFT_CHECKS) expect(ALL_DRIFT_CHECKS).toContain(c);
    for (const c of PUBLISHED_FACT_CHECKS) expect(ALL_DRIFT_CHECKS).toContain(c);
    expect(ALL_DRIFT_CHECKS.length).toBe(STATE_DRIFT_CHECKS.length + PUBLISHED_FACT_CHECKS.length);
  });

  // AC2.4 is asserted BEHAVIOURALLY, not by grepping for an import. A grep is
  // B81's shape — it cannot tell one governed thing from all of them, and it
  // passes the day someone imports the symbol without calling it. Running the
  // real command entry point against a wrong tally can only pass if the caller
  // exists AND works.
  it('/sig:docs-sweep surfaces the tally finding — the caller exists and works', async () => {
    await writeBugs(
      TABLE(['| B1 | `confirmed` | P2 | a |']) + '\n\n' + TALLY({ confirmed: 4, fixed: 0, total: 4 })
    );
    const { runSweep } = await import('../plugin/tools/lib/sweep.js');
    const report = await runSweep(dir);
    const hit = report.stateDrift.results.find((r) => r.id === 'published-bug-tally');
    expect(hit).toBeDefined();
    expect(hit.status).toBe(STATUS.FINDINGS);
  });

  it('/sig:docs-sweep reports the check as could-not-check when BUGS.md publishes no tally', async () => {
    await writeBugs(TABLE(['| B1 | `confirmed` | P2 | a |']));
    const { runSweep } = await import('../plugin/tools/lib/sweep.js');
    const report = await runSweep(dir);
    const hit = report.stateDrift.results.find((r) => r.id === 'published-bug-tally');
    expect(hit.status).toBe(STATUS.CANNOT_EVALUATE);
  });

  it('both commands compose the same registry — resume.md names it too', () => {
    const resume = readFileSync(join(ROOT, 'plugin/commands/resume.md'), 'utf8');
    const sweep = readFileSync(join(ROOT, 'plugin/tools/lib/sweep.js'), 'utf8');
    expect(resume).toContain('ALL_DRIFT_CHECKS');
    expect(sweep).toContain('ALL_DRIFT_CHECKS');
  });
});
