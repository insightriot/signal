/**
 * tests/anti-rationalization-forms.test.js — FR5 / `B38` (M5.E10 S5.t2, S5.t3).
 *
 * `AC5.1` says EVERY anti-rationalization entry is classified. A page asserting
 * that is a completeness claim written from the shape of the work — the class
 * this Epic exists to kill. So the classification is re-derived from the corpus
 * here, and the page fails when the two disagree.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PAGE = 'plugin/references/anti-rationalization-forms.md';
const HEADER = /^(Temptation|Rationalization|Impostor|Excuse|Shortcut|Claim)$/i;

/** Re-derive both halves of the classification straight from the corpus. */
function collect() {
  const files = [
    ...readdirSync(join(ROOT, 'plugin', 'commands')).map((f) => 'commands/' + f),
    'references/anti-rationalization.md',
    'agents/support/phase-gate-enforcer.md',
  ];
  const seen = new Set();
  const discipline = [];
  const shaping = [];

  for (const f of files) {
    let content;
    try {
      content = readFileSync(join(ROOT, 'plugin', f), 'utf8');
    } catch {
      continue;
    }
    const L = content.split('\n');

    for (let i = 0; i < L.length; i++) {
      if (!/Anti-Rationalization/i.test(L[i])) continue;
      let j = i + 1;
      while (j < L.length && !/^\|/.test(L[j]) && j - i < 12) j++;
      if (j >= L.length || !/^\|/.test(L[j])) continue;
      const head = L[j].split('|').slice(1, -1).map((s) => s.trim());
      if (!HEADER.test(head[0])) continue; // a neighbouring table, not this one
      for (j = j + 1; j < L.length && /^\|/.test(L[j]); j++) {
        if (/^\|[\s:|-]+\|$/.test(L[j])) continue;
        const cells = L[j].split('|').slice(1, -1).map((s) => s.trim());
        if (cells.length < 2) continue;
        const key = `${f}:${j + 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        discipline.push({ file: f, text: cells[0] });
      }
    }

    let inSection = false;
    for (const line of L) {
      if (/^#{2,3} Output contract/.test(line)) {
        inSection = true;
        continue;
      }
      if (inSection && /^#{1,3} /.test(line)) {
        inSection = false;
        continue;
      }
      if (inSection && /^- \*\*/.test(line)) {
        shaping.push({ file: f, text: line.replace(/^- /, '') });
      }
    }
  }
  return { discipline, shaping };
}

let corpus;
let page;

beforeAll(() => {
  corpus = collect();
  page = readFileSync(join(ROOT, PAGE), 'utf8');
});

describe('AC5.1 — every entry is classified, and the count is derived', () => {
  it('the page states the same totals the corpus yields', () => {
    const total = corpus.discipline.length + corpus.shaping.length;
    expect(page).toContain(
      `**${total} entries: ${corpus.discipline.length} discipline, ${corpus.shaping.length} shaping.**`
    );
  });

  it('every discipline entry appears on the page', () => {
    const missing = corpus.discipline.filter((e) => !page.includes(e.text.replace(/\|/g, '\\|')));
    expect(missing.map((m) => `${m.file}: ${m.text}`)).toEqual([]);
  });

  it('every shaping recipe appears on the page', () => {
    const missing = corpus.shaping.filter((e) => !page.includes(e.text));
    expect(missing.map((m) => `${m.file}: ${m.text.slice(0, 60)}`)).toEqual([]);
  });

  it('the page names no entry the corpus does not have', () => {
    // The other direction. Without it the page can carry entries deleted from
    // the corpus and still pass — a classification of work that no longer
    // exists, reading as coverage.
    const known = new Set([
      ...corpus.discipline.map((e) => e.text.replace(/\|/g, '\\|')),
      ...corpus.shaping.map((e) => e.text),
    ]);
    const listed = page
      .split('\n')
      .filter((l) => /^- /.test(l))
      .map((l) => l.replace(/^- /, ''));
    expect(listed.filter((l) => !known.has(l))).toEqual([]);
  });
});

describe('AC5.2 — every shaping entry is a positive recipe', () => {
  it('none of them is phrased as a temptation to resist', () => {
    // A recipe states what the output IS. A temptation is a quoted excuse, and
    // converting the words while keeping the form would miss the entire point
    // of B38 — the form is what the measurement was about.
    for (const entry of corpus.shaping) {
      expect(entry.text, `${entry.file}: recipe must not open with a quoted temptation`).not.toMatch(
        /^\*\*"/
      );
      expect(entry.text, `${entry.file}: recipe must not be a prohibition`).not.toMatch(
        /^\*\*(?:Never|Do not|Don't|No\b)/i
      );
    }
  });

  it('each states the output in the present tense, with its reason', () => {
    for (const entry of corpus.shaping) {
      expect(entry.text.length, `${entry.file}: a recipe needs its reason`).toBeGreaterThan(60);
    }
  });

  it('the converted entries are gone from the prohibition tables they came from', () => {
    // The conversion has to MOVE the entry. Leaving both forms in place would
    // keep the measured-harmful wording live beside its replacement.
    const stale = ['Tidy / smart-quote', 'Make it longer with more sections', 'Just show the version numbers'];
    for (const fragment of stale) {
      expect(
        corpus.discipline.filter((e) => e.text.includes(fragment)),
        `"${fragment}" must no longer be a prohibition entry`
      ).toEqual([]);
    }
  });
});

describe('AC5.3 — the provenance rule is a shaping entry', () => {
  it('exists, and is stated as a recipe rather than a prohibition', () => {
    const provenance = corpus.shaping.find((e) => /provenance/i.test(e.text));
    expect(provenance, 'the provenance rule must be a shaping entry').toBeTruthy();
    expect(provenance.text).toMatch(/only after opening that/i);
  });

  it('covers ESCALATION, not just restatement', () => {
    // Repeating a hedge as a fact is the same defect as inventing one, and
    // harder to catch, because the hedge is gone.
    const src = readFileSync(join(ROOT, 'plugin', 'references', 'anti-rationalization.md'), 'utf8');
    expect(src).toMatch(/never at higher confidence than the source gave it/i);
  });
});
