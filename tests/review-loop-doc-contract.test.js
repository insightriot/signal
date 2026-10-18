// M6.E17 S4 — the REVIEW/VERIFY loop in the command files names code that
// exists, in the order the loop needs it.
//
// Why: nothing tied a function named in review.md or verify.md to code (only
// drive.md had a symbol contract — tests/drive-doc-contract.test.js). The loop
// this Epic adds lives in prose an agent follows, so a renamed export would
// leave the step pointing at nothing while every test stayed green.
//
// Proof-of-fail: fails before S4 — none of the steps or files exist.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Modules are imported inside the test, not at the top: a missing module then
// fails that test instead of stopping the whole file from loading, so
// parent-run.js can show this file failing on a base without them.
const LIB = '../plugin/tools/lib/';

const ROOT = resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');
const review = read('plugin/commands/review.md');
const verify = read('plugin/commands/verify.md');
const execute = read('plugin/commands/execute.md').replace(/\s+/g, ' ');
const executor = read('plugin/agents/executors/executor.md');
const BRIEF = 'plugin/references/fixer-brief.md';

// The fix-round step: from its heading to the next heading of the same level.
const fixRoundStep = (() => {
  const start = review.search(/^### 4\.6 Fix rounds/m);
  if (start < 0) return '';
  const rest = review.slice(start + 1);
  const next = rest.search(/^### /m);
  // Line wrapping in the markdown is not content: collapse it.
  return (next < 0 ? rest : rest.slice(0, next)).replace(/\s+/g, ' ');
})();

describe('every symbol the loop names is an export', () => {
  it.each([
    ['recordPass', 'state.js'],
    ['loopStatusFor', 'loop-ceiling.js'],
    ['checkFixRounds', 'review-rounds.js'],
    ['runOnBase', 'parent-run.js'],
    ['formatParentRun', 'parent-run.js'],
  ])('%s in %s', async (name, file) => {
    const mod = await import(`${LIB}${file}`).catch(() => ({}));
    expect(typeof mod[name], `${name} is exported by ${file}`).toBe('function');
  });

  it('review.md names each of them, with its module', () => {
    for (const s of ['recordPass', 'state.js', 'loopStatusFor', 'loop-ceiling.js', 'checkFixRounds', 'review-rounds.js', 'parent-run.js']) {
      expect(review, s).toContain(s);
    }
  });
});

describe('AC1.6 — a pass is recorded before the Loop Back ask', () => {
  // Anchored on the step's own section, not the first mention: verify.md's
  // Exit Criteria line names the same call before the Loop Back, so deleting
  // the step passed the first form of this test (M6.E17 REVIEW I7).
  it.each([
    ['review.md', review, /^### Record the pass\b.*$/m, "recordPass(baseDir, 'REVIEW'"],
    ['verify.md', verify, /^### 5a\. Record the pass\b.*$/m, "recordPass(baseDir, 'VERIFY'"],
  ])('%s', (_name, text, heading, call) => {
    const start = text.search(heading);
    expect(start, 'the recording step has its own heading').toBeGreaterThan(-1);
    const rest = text.slice(text.indexOf('\n', start) + 1);
    const step = rest.slice(0, rest.search(/^#{1,3} /m));
    expect(step, `${call} is in the step`).toContain(call);
    const loopBack = text.search(/^### Loop Back/m);
    expect(loopBack).toBeGreaterThan(-1);
    expect(start).toBeLessThan(loopBack);
  });

  it('review.md says the count is the larger of passes and exits', () => {
    expect(review).toMatch(/larger of/);
    expect(review).toContain('phase_passes');
  });
});

describe('AC2.1 / AC2.2 — the fix-round step', () => {
  it('exists as a numbered step before the report is written', () => {
    expect(fixRoundStep).not.toBe('');
    expect(review.search(/^### 4\.6 Fix rounds/m)).toBeLessThan(review.search(/^### 5\. Write Review Report/m));
  });

  it('gives one fresh reviewer only that round\'s diff and the requirements, under § 4.5\'s omissions', () => {
    expect(fixRoundStep).toMatch(/one fresh-context reviewer/i);
    expect(fixRoundStep).toMatch(/only that round's diff/);
    expect(fixRoundStep).toMatch(/same omissions as § 4\.5/);
  });

  it('states the stop rule', () => {
    expect(fixRoundStep).toMatch(/0 Critical and 0 Important/);
    expect(fixRoundStep).toMatch(/loop ceiling/);
    expect(fixRoundStep).toMatch(/whichever comes first/);
  });

  it('names the record lines checkFixRounds reads, and runs it before the verdict', () => {
    expect(fixRoundStep).toContain('**Fresh read:**');
    expect(fixRoundStep).toContain('**Parent run:**');
    expect(fixRoundStep).toContain('checkFixRounds');
    // VERIFY D2: the check is given the recorded passes, or an unwritten round is invisible to it.
    expect(fixRoundStep).toContain('checkFixRounds(reportContent, verdict, { phasePasses })');
  });

  // REVIEW pass 2, P2-I7: rounds were recorded "in the report" before § 5 wrote this
  // pass's heading, so on pass 2+ they landed under the previous pass's section.
  it('P2-I7: writes the pass heading before any round, and checks the report as written', () => {
    const heading = fixRoundStep.search(/append its `## Pass N — \{date\}, at \{sha\}` heading/);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(fixRoundStep).toMatch(/before § 4\.5 is dispatched/);
    expect(heading).toBeLessThan(fixRoundStep.indexOf('For each round'));
    expect(fixRoundStep).toMatch(/run the check\*\* on the report as it is on disk/);
  });
});

describe('AC3.3 / AC3.4 — the parent run and the fixer brief', () => {
  it('fixer-brief.md exists and says to paste the output verbatim and to state a gap', () => {
    expect(existsSync(join(ROOT, BRIEF))).toBe(true);
    const brief = read(BRIEF);
    expect(brief).toContain('parent-run.js');
    expect(brief).toMatch(/verbatim/);
    expect(brief).toMatch(/gap/);
  });

  it('the fix-round step, executor.md and execute.md point at the brief', () => {
    for (const [name, text] of [['review.md fix round', fixRoundStep], ['executor.md', executor], ['execute.md', execute]]) {
      expect(text, name).toContain('fixer-brief.md');
    }
  });

  it('execute.md records the parent run in PROGRESS at each task close, and a missing one as a gap', () => {
    expect(execute).toContain('parent-run.js');
    expect(execute).toMatch(/PROGRESS/);
    expect(execute).toMatch(/stated gap/);
  });
});

// REVIEW pass 3, P3-I5: a linear SHIP appends "## Run ended" to the report and
// checkFixRounds reads only what follows it; the command says so, so a person
// reading a linear report knows where a run begins.
describe('P3-I5 — the report format names the run boundary', () => {
  it('review.md § 5 names the "## Run ended" line and that the check reads only what follows it', () => {
    const step5 = review.slice(review.search(/^### 5\. Write Review Report/m)).replace(/\s+/g, ' ');
    expect(step5).toMatch(/SHIP appends `## Run ended — \{date\}`/);
    expect(step5).toMatch(/reads only what follows the last `## Run ended` line/);
  });
});

// REVIEW pass 4, P4-I1: a "## Run ended" line SHIP could not write was returned and
// read by nothing, and the only way out was the line review.md forbids writing by
// hand. SHIP now says so, and both files name the recovery. A pass whose heading
// was written and whose session ended before its verdict has a recovery too.
describe('P4-I1 — a missing run boundary is reported and has a way out', () => {
  const ship = read('plugin/commands/ship.md').replace(/\s+/g, ' ');
  const flat = review.replace(/\s+/g, ' ');
  it('ship.md § 5 surfaces a failed runEnded and names markRunEnded', () => {
    const s5 = ship.slice(ship.search(/### 5\. Update State/));
    expect(s5).toMatch(/runEnded\?\.ok === false/);
    expect(s5).toMatch(/markRunEnded/);
  });
  it('review.md § 5 names markRunEnded as the one way to write the line SHIP could not', () => {
    const step5 = flat.slice(flat.search(/### 5\. Write Review Report/));
    expect(step5).toMatch(/Never write that line by hand[^.]*markRunEnded/);
  });
  // REVIEW pass 5, P5-I1: the recovery must work after the next run has begun.
  // Fix round 5 claimed a re-invoked SHIP writes the line; on ship.md's own path
  // it returns at completePhase's first guard, so the claim was dropped.
  it('ship.md says re-running SHIP does not write the line, and review.md names keep for a run already begun', () => {
    const s5 = ship.slice(ship.search(/### 5\. Update State/));
    expect(s5).not.toMatch(/re-invoked `\/sig:ship` writes it/);
    expect(s5).toMatch(/re-running `\/sig:ship` does not write it/);
    const step5 = flat.slice(flat.search(/### 5\. Write Review Report/));
    expect(step5).toMatch(/markRunEnded\(baseDir, \{ keep \}\)/);
  });
  it('review.md § 4.6 says a pass heading with no verdict recorded is continued, not appended again', () => {
    const s46 = flat.slice(flat.search(/### 4\.6 Fix rounds/), flat.search(/### 5\. Write Review Report/));
    expect(s46).toMatch(/no verdict recorded[^.]*continue under it/i);
  });
});
