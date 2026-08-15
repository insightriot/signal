import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectLibExports,
  classifyLine,
  classifyMarkdown,
  classifyCommandCorpus,
} from '../plugin/tools/lib/directive-classifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURE = join(__dirname, 'fixtures/directive-classifier/hand-labelled.md');

/**
 * FR5 / AC5.1 — the coverage-ceiling classifier.
 *
 * Pinned at RED commit time (M5.E8.S1.t1) before tools/lib/directive-classifier.js
 * exists. The classifier answers ONE question: of the instructions in commands/*.md,
 * how many leave a trace a harness could observe?
 *
 * WHAT THIS TEST PROVES: the split rule is applied consistently and matches a
 * hand-labelled fixture.
 *
 * WHAT IT DOES NOT PROVE: that the split rule is the *right* rule. The rule is a
 * judgement call written down in the module header so a reader can disagree with it
 * line by line. A different defensible rule moves individual rows; the test pins the
 * implementation to the rule as stated, not the rule to the truth.
 */

// Parse the fixture's inline `<!-- label: ... -->` annotations into hand-labels.
function readHandLabels(path) {
  const lines = readFileSync(path, 'utf-8').split('\n');
  return lines.map((line, i) => {
    const m = line.match(/<!--\s*label:\s*([a-z:-]+)\s*-->\s*$/);
    return { lineNo: i + 1, raw: line, label: m ? m[1] : null };
  });
}

describe('directive classifier — split rule (AC5.1)', () => {
  const libExports = collectLibExports(join(ROOT, 'plugin/tools/lib'));

  it('resolves library calls against the REAL tools/lib export set, not the shape', () => {
    expect(libExports.has('readState')).toBe(true);
    expect(libExports.has('transitionPhase')).toBe(true);
    expect(libExports.has('atomicWrite')).toBe(true);
    expect(libExports.has('notARealFunctionName')).toBe(false);
  });

  it('classifies every hand-labelled fixture line exactly as labelled', () => {
    const labelled = readHandLabels(FIXTURE);
    const result = classifyMarkdown(readFileSync(FIXTURE, 'utf-8'), { libExports });
    const byLine = new Map(result.lines.map(l => [l.lineNo, l]));

    const mismatches = [];
    for (const { lineNo, raw, label } of labelled) {
      const got = byLine.get(lineNo);
      const gotLabel = !got || !got.directive
        ? null
        : got.measurable ? `measurable:${got.reason}` : 'unmeasurable';
      if (gotLabel !== label) {
        mismatches.push(`L${lineNo}: expected ${label ?? 'not-a-directive'}, got ${gotLabel ?? 'not-a-directive'}\n    ${raw.trim()}`);
      }
    }
    expect(mismatches.join('\n  ')).toBe('');
  });

  it('strips the trailing label comment before classifying (the label never leaks)', () => {
    const bare = 'Call `readState(baseDir)` to load the current state.';
    const withComment = `${bare} <!-- label: measurable:lib-call -->`;
    const a = classifyLine(bare, { libExports });
    const b = classifyLine(withComment, { libExports });
    expect(b).toEqual(a);
    expect(a.directive).toBe(true);
    expect(a.measurable).toBe(true);
  });

  it('excludes fenced code blocks wholesale', () => {
    const md = ['```js', 'await readState(baseDir);', '```'].join('\n');
    const result = classifyMarkdown(md, { libExports });
    expect(result.counts.directives).toBe(0);
  });

  it('counts an obligation modal as a directive even without a leading imperative', () => {
    const r = classifyLine('You must never rationalize a skipped test.', { libExports });
    expect(r.directive).toBe(true);
    expect(r.measurable).toBe(false);
  });

  it('is deterministic — identical input yields identical output', () => {
    const src = readFileSync(FIXTURE, 'utf-8');
    expect(classifyMarkdown(src, { libExports })).toEqual(classifyMarkdown(src, { libExports }));
  });
});

describe('directive classifier — the corpus ceiling (AC5.1)', () => {
  it('classifies the real commands/*.md corpus with consistent totals', () => {
    const corpus = classifyCommandCorpus(join(ROOT, 'plugin'));
    expect(corpus.files.length).toBeGreaterThanOrEqual(18);
    const { directives, measurable, unmeasurable } = corpus.counts;
    expect(directives).toBeGreaterThan(0);
    expect(measurable + unmeasurable).toBe(directives);
    // The ceiling is a minority of the corpus. This asserts the SHAPE of the
    // finding (most instructions leave no trace), not a pinned percentage —
    // pinning the exact number would make every wording edit a test failure.
    expect(measurable).toBeLessThan(unmeasurable);
  });

  it('reports per-file counts so a reader can audit where the traces are', () => {
    const corpus = classifyCommandCorpus(join(ROOT, 'plugin'));
    const byName = new Map(corpus.files.map(f => [f.file, f]));
    expect(byName.has('ship.md')).toBe(true);
    for (const f of corpus.files) {
      expect(f.counts.measurable + f.counts.unmeasurable).toBe(f.counts.directives);
    }
  });
});
