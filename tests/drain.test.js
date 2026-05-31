// Tests for tools/lib/drain.js — the /sig:plan FUTURE-IDEAS drain (M4.5.E2.S5).
// See .planning/M4.5.E2-PLAN.md § "2026-05-30 RE-PLAN" Slice 5 and
// .planning/M4.5.E2-VALIDATION.md § "Re-validation" Nyquist mapping (FR7 / Q2 / R1 / R5).
//
// S5.t1 (this file, first block) covers the shared, pure entry parser:
//   parseEntries(content)        — fence-aware top-level `## ` segmentation
//   listDrainCandidates(content) — parseEntries filtered to un-dispositioned (Q2)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEntries, listDrainCandidates } from '../tools/lib/drain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  __dirname,
  'fixtures',
  'add',
  'future-ideas-drain',
  '.planning',
  'FUTURE-IDEAS.md'
);
const content = readFileSync(FIXTURE, 'utf-8');

describe('parseEntries (pure, fence-aware)', () => {
  it('segments exactly the 7 top-level entries (fenced `## ` does not split)', () => {
    const entries = parseEntries(content);
    expect(entries.map((e) => e.heading)).toEqual([
      'Canonical candidate via add',
      'Hand-authored candidate',
      'Candidate with a fenced block and nested heading',
      'Candidate dated in heading (2026-05-19)',
      '✓ SHIPPED — Already-shipped thing',
      'Already-drained candidate',
      'Entry below the orphaned footer',
    ]);
  });

  it('returns [] for content with no top-level entries', () => {
    expect(parseEntries('# Title\n\nJust preamble, no `## ` heading.\n')).toEqual([]);
    expect(parseEntries('')).toEqual([]);
  });

  it('captures the first real Status line per entry, ignoring fenced fakes', () => {
    const fenced = parseEntries(content).find((e) =>
      e.heading.startsWith('Candidate with a fenced block')
    );
    expect(fenced.statusLine).toContain('Logged 2026-05-21');
    // The fenced `**Status:** Deferred 2099 …` must NOT be picked up.
    expect(fenced.statusLine).not.toContain('2099');
  });

  it('keeps a nested `###` and the whole fenced block inside its parent entry', () => {
    const entries = parseEntries(content);
    const fenced = entries.find((e) =>
      e.heading.startsWith('Candidate with a fenced block')
    );
    const block = content.slice(fenced.range.start, fenced.range.end);
    expect(block).toContain('## Not a real heading'); // fenced fake heading
    expect(block).toContain('### A nested h3 subheading'); // real nested h3
    expect(block).toContain('Deferred 2099-01-01'); // fenced fake stamp
  });

  it('parses dateISO from Status when present, else from the heading, else null', () => {
    const entries = parseEntries(content);
    const byHeading = (prefix) =>
      entries.find((e) => e.heading.startsWith(prefix));
    expect(byHeading('Canonical candidate').dateISO).toBe('2026-05-27');
    // Date lives only in the heading; no Status line.
    const dated = byHeading('Candidate dated in heading');
    expect(dated.statusLine).toBeNull();
    expect(dated.dateISO).toBe('2026-05-19');
  });

  it('each entry range is byte-exact: slice starts with its `## ` heading line', () => {
    for (const e of parseEntries(content)) {
      const block = content.slice(e.range.start, e.range.end);
      expect(block.startsWith(`## ${e.heading}`)).toBe(true);
    }
  });

  it('ranges tile the entries gap-free (each end === next start)', () => {
    const entries = parseEntries(content);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].range.start).toBe(entries[i - 1].range.end);
    }
  });
});

describe('listDrainCandidates (Q2 — un-dispositioned only, no date window)', () => {
  it('returns exactly the genuine candidates; ✓SHIPPED + drain-stamped skipped', () => {
    expect(listDrainCandidates(content).map((e) => e.heading)).toEqual([
      'Canonical candidate via add',
      'Hand-authored candidate',
      'Candidate with a fenced block and nested heading',
      'Candidate dated in heading (2026-05-19)',
      'Entry below the orphaned footer',
    ]);
  });

  it('marks the ✓ SHIPPED heading dispositioned (heading-marker rule)', () => {
    const shipped = parseEntries(content).find((e) =>
      e.heading.includes('SHIPPED')
    );
    expect(shipped.dispositioned).toBe(true);
  });

  it('marks the inline drain-stamped Status dispositioned (status-verb rule)', () => {
    const drained = parseEntries(content).find(
      (e) => e.heading === 'Already-drained candidate'
    );
    expect(drained.dispositioned).toBe(true);
  });

  it('does not let a fenced disposition verb flip a real candidate', () => {
    const fenced = parseEntries(content).find((e) =>
      e.heading.startsWith('Candidate with a fenced block')
    );
    expect(fenced.dispositioned).toBe(false);
  });

  it('surfaces the entry below the orphaned mid-file footer', () => {
    const headings = listDrainCandidates(content).map((e) => e.heading);
    expect(headings).toContain('Entry below the orphaned footer');
  });

  it('returns [] when every entry is dispositioned', () => {
    const allDisposed =
      '## ✓ SHIPPED — one\n\n**Status:** done.\n\n---\n\n' +
      '## two\n\n**Status:** Logged 2026-01-01. → Promoted 2026-02-02 (drain).\n\n---\n';
    expect(listDrainCandidates(allDisposed)).toEqual([]);
  });
});
