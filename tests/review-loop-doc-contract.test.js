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
  it.each([
    ['review.md', review, "recordPass(baseDir, 'REVIEW'"],
    ['verify.md', verify, "recordPass(baseDir, 'VERIFY'"],
  ])('%s', (_name, text, call) => {
    const at = text.indexOf(call);
    const loopBack = text.search(/^### Loop Back/m);
    expect(at, `${call} is named`).toBeGreaterThan(-1);
    expect(loopBack).toBeGreaterThan(-1);
    expect(at).toBeLessThan(loopBack);
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
