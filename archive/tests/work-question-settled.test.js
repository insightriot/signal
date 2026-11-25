// M6.E11 FR-10 — housekeeping (t7.1), AC-10.1.
// See .planning/M6.E11-REQUIREMENTS.md AC-10.1 and D-M6E11-2.
//
// AC-10.1: the question "a marker in the files, or GitHub Issues" was answered
// by D-BR0928-7. No live document may still present it as open. Struck text
// (`~~…~~`) is how a document records that it was answered, so it is allowed.
// Not live, and so not read: `archive/` (history), `DECISIONS.md` (the
// append-only record of the question and its answer), dated review snapshots,
// retrospectives, and this Epic's REQUIREMENTS, which quotes the phrase as
// the thing to remove.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { walkFiles } from '../plugin/tools/lib/work-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Whitespace-normalised, so a phrase wrapped across lines is still found.
const QUESTION_RE = /marker (?:Signal acts on )?(?:in|inside) the (?:markdown )?files,? or GitHub Issues/gi;

const NOT_LIVE = [
  /^\.planning\/archive\//,
  /^\.planning\/DECISIONS\.md$/,
  /-REVIEW-\d{4}-\d{2}-\d{2}\.md$/,
  /-RETROSPECTIVE\.md$/,
  /(^|\/)M6\.E11-REQUIREMENTS\.md$/, // basename: t7.5 moves it into work/epics/M6.E11/
];

function liveDocs() {
  const docs = walkFiles(join(ROOT, '.planning'))
    .map((abs) => relative(ROOT, abs).split(sep).join('/'))
    .filter((rel) => rel.endsWith('.md') && !NOT_LIVE.some((re) => re.test(rel)));
  return ['CLAUDE.md', ...docs];
}

// Offsets of every `~~…~~` span, on the normalised text.
function struckSpans(text) {
  const spans = [];
  for (const m of text.matchAll(/~~[^~]+~~/g)) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

describe('AC-10.1 — the files-or-Issues question is not presented as open', () => {
  it('no live document carries it unstruck', () => {
    const open = [];
    for (const rel of liveDocs()) {
      const text = readFileSync(join(ROOT, rel), 'utf-8').replace(/\s+/g, ' ');
      const struck = struckSpans(text);
      for (const m of text.matchAll(QUESTION_RE)) {
        if (!struck.some(([a, b]) => m.index >= a && m.index < b)) open.push(`${rel}: …${text.slice(Math.max(0, m.index - 60), m.index + m[0].length)}`);
      }
    }
    expect(open).toEqual([]);
  });

  it('the scan is not vacuous: it reads CLAUDE.md and finds the phrase where it is quoted', () => {
    expect(liveDocs()).toContain('CLAUDE.md');
    expect(liveDocs().length).toBeGreaterThan(20);
    const decisions = readFileSync(join(ROOT, '.planning', 'DECISIONS.md'), 'utf-8').replace(/\s+/g, ' ');
    expect(decisions.match(QUESTION_RE)?.length ?? 0).toBeGreaterThan(0);
  });
});
