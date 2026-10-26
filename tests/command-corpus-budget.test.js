import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'tools/doc-budgets.json'), 'utf-8'));
const BUDGET = MANIFEST.commandCorpus;
const SLACK = MANIFEST.slackBytes;

/**
 * The command files may shrink and never grow (course correction, D-BR1026-3).
 *
 * plugin/commands/*.md is what the model reads on every run. It grew to ~470 KB,
 * carrying 222 references to old bug and decision IDs, because each fix was added
 * as more text. That is the cause of "it forgot something": too many instructions,
 * most of them history. A written rule against it would not hold here (B117 was
 * written down three times and fired three times), so this is a test.
 *
 * Same ratchet as tests/doc-budgets.test.js: today's numbers are the ceiling, and a
 * change that shrinks the files must lower the ceiling so the gain is kept.
 */
const files = readdirSync(join(ROOT, BUDGET.dir)).filter((f) => f.endsWith('.md'));
const texts = files.map((f) => readFileSync(join(ROOT, BUDGET.dir, f), 'utf-8'));
const bytes = texts.reduce((n, t) => n + Buffer.byteLength(t), 0);
const ids = texts.reduce((n, t) => n + (t.match(new RegExp(BUDGET.historyIdPattern, 'g')) || []).length, 0);

describe('command corpus — may shrink, never grow', () => {
  it('reads a non-empty corpus (this check is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(bytes).toBeGreaterThan(0);
  });

  it('adds no command', () => {
    expect(
      files.length,
      `${files.length} command files, over the limit of ${BUDGET.maxFiles}.\n` +
        `New commands need to pass the rule in .planning/COURSE-CORRECTION.md, and the limit ` +
        `in tools/doc-budgets.json is raised in the same change with the reason.`,
    ).toBeLessThanOrEqual(BUDGET.maxFiles);
  });

  it('records a removed command by lowering the limit', () => {
    expect(
      files.length,
      `${files.length} command files, under the limit of ${BUDGET.maxFiles}. ` +
        `Lower commandCorpus.maxFiles in tools/doc-budgets.json to keep the gain.`,
    ).toBeGreaterThanOrEqual(BUDGET.maxFiles);
  });

  it('does not grow in total size', () => {
    expect(
      bytes,
      `The command files total ${bytes} bytes, over the limit of ${BUDGET.maxBytes}.\n` +
        `Say it shorter, or move history to CHANGELOG.md. Raising the limit needs a reason ` +
        `that passes the rule in .planning/COURSE-CORRECTION.md.`,
    ).toBeLessThanOrEqual(BUDGET.maxBytes);
  });

  it('records a shrink by lowering the size limit', () => {
    expect(
      bytes,
      `The command files total ${bytes} bytes, well under the limit of ${BUDGET.maxBytes}. ` +
        `Lower commandCorpus.maxBytes in tools/doc-budgets.json to keep the gain.`,
    ).toBeGreaterThan(BUDGET.maxBytes - SLACK);
  });

  it('adds no references to old bug or decision IDs', () => {
    expect(
      ids,
      `The command files carry ${ids} bug/decision IDs, over the limit of ${BUDGET.maxHistoryIds}.\n` +
        `Instructions say what to do now; why it is that way belongs in CHANGELOG.md and git.`,
    ).toBeLessThanOrEqual(BUDGET.maxHistoryIds);
  });

  it('records removed IDs by lowering the limit', () => {
    expect(
      ids,
      `The command files carry ${ids} bug/decision IDs, under the limit of ${BUDGET.maxHistoryIds}. ` +
        `Lower commandCorpus.maxHistoryIds in tools/doc-budgets.json to keep the gain.`,
    ).toBeGreaterThanOrEqual(BUDGET.maxHistoryIds);
  });
});

describe('the course-correction rule is shown at session start', () => {
  const doc = join(ROOT, '.planning/COURSE-CORRECTION.md');
  const settings = join(ROOT, '.claude/settings.json');

  it('has a rule block for the hook to print', () => {
    const text = readFileSync(doc, 'utf-8');
    const block = text.match(/<!-- rule:begin -->([\s\S]*?)<!-- rule:end -->/);
    expect(block, 'COURSE-CORRECTION.md has no rule:begin / rule:end block').not.toBeNull();
    expect(block[1].trim().length).toBeGreaterThan(0);
  });

  // A hook that points at a moved file prints nothing and fails silently.
  it('has a SessionStart hook that reads that block', () => {
    expect(existsSync(settings), '.claude/settings.json is missing').toBe(true);
    const hooks = JSON.parse(readFileSync(settings, 'utf-8')).hooks?.SessionStart ?? [];
    const commands = hooks.flatMap((h) => (h.hooks ?? []).map((x) => x.command ?? ''));
    expect(commands.some((c) => c.includes('.planning/COURSE-CORRECTION.md'))).toBe(true);
  });
});
