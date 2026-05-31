// Tests for tools/lib/drain.js — the /sig:plan FUTURE-IDEAS drain (M4.5.E2.S5).
// See .planning/M4.5.E2-PLAN.md § "2026-05-30 RE-PLAN" Slice 5 and
// .planning/M4.5.E2-VALIDATION.md § "Re-validation" Nyquist mapping (FR7 / Q2 / R1 / R5).
//
// S5.t1 (this file, first block) covers the shared, pure entry parser:
//   parseEntries(content)        — fence-aware top-level `## ` segmentation
//   listDrainCandidates(content) — parseEntries filtered to un-dispositioned (Q2)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseEntries,
  listDrainCandidates,
  applyDisposition,
  applyDispositions,
  applyDispositionToFile,
} from '../tools/lib/drain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURE = join(
  __dirname,
  'fixtures',
  'add',
  'future-ideas-drain',
  '.planning',
  'FUTURE-IDEAS.md'
);
const content = readFileSync(FIXTURE, 'utf-8');
const planMd = readFileSync(join(ROOT, 'commands', 'plan.md'), 'utf-8');

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

// --- S5.t2: applyDisposition (pure) + applyDispositionToFile (writer, R5 gate) ---

const DATE = '2026-05-30';
const REASON = 'M4.5.E2 drain';

// Map heading -> exact block text, so neighbor byte-identity can be asserted
// across an edit that shifts offsets (block text is offset-independent).
function blocksByHeading(c) {
  return Object.fromEntries(
    parseEntries(c).map((e) => [e.heading, c.slice(e.range.start, e.range.end)])
  );
}

describe('applyDisposition (pure, byte-range edits)', () => {
  it('defer appends a stamp to the Status line; all other blocks byte-identical', () => {
    const before = blocksByHeading(content);
    const out = applyDisposition(content, 0, 'defer', REASON, DATE); // entry 0
    const after = blocksByHeading(out);

    expect(after['Canonical candidate via add']).toContain(
      '→ Deferred 2026-05-30 (M4.5.E2 drain).'
    );
    // Original status text is preserved (append, not replace).
    expect(after['Canonical candidate via add']).toContain('Logged 2026-05-27 via');

    for (const h of Object.keys(before)) {
      if (h === 'Canonical candidate via add') continue;
      expect(after[h], `neighbor "${h}" must be byte-identical`).toBe(before[h]);
    }
  });

  it('promote stamps with "Promoted" and never removes text', () => {
    const out = applyDisposition(content, 1, 'promote', REASON, DATE); // Hand-authored
    const block = blocksByHeading(out)['Hand-authored candidate'];
    expect(block).toContain('→ Promoted 2026-05-30 (M4.5.E2 drain).');
    expect(block).toContain('Logged 2026-05-20 during a planning conversation.');
  });

  it('a deferred entry stops being a drain candidate (round-trips through Q2)', () => {
    const out = applyDisposition(content, 0, 'defer', REASON, DATE);
    expect(listDrainCandidates(out).map((e) => e.heading)).not.toContain(
      'Canonical candidate via add'
    );
  });

  it('date-in-heading (no Status) defer INSERTS a Status line under the heading', () => {
    const idx = parseEntries(content).findIndex((e) =>
      e.heading.startsWith('Candidate dated in heading')
    );
    const before = blocksByHeading(content);
    const out = applyDisposition(content, idx, 'defer', REASON, DATE);
    const block = blocksByHeading(out)['Candidate dated in heading (2026-05-19)'];
    expect(block).toMatch(
      /^## Candidate dated in heading \(2026-05-19\)\n\n\*\*Status:\*\* Deferred 2026-05-30 \(M4\.5\.E2 drain\)\.\n/
    );
    expect(block).toContain('A genuine candidate whose only date lives in the heading');
    // Now dispositioned.
    expect(listDrainCandidates(out).map((e) => e.heading)).not.toContain(
      'Candidate dated in heading (2026-05-19)'
    );
    // Neighbors untouched.
    for (const h of Object.keys(before)) {
      if (h === 'Candidate dated in heading (2026-05-19)') continue;
      expect(blocksByHeading(out)[h]).toBe(before[h]);
    }
  });

  it('delete removes exactly that block (+ its trailing ---); neighbors byte-identical', () => {
    const before = blocksByHeading(content);
    const out = applyDisposition(content, 0, 'delete', REASON, DATE);
    const after = blocksByHeading(out);
    expect(after['Canonical candidate via add']).toBeUndefined();
    expect(parseEntries(out).length).toBe(parseEntries(content).length - 1);
    for (const h of Object.keys(before)) {
      if (h === 'Canonical candidate via add') continue;
      expect(after[h], `neighbor "${h}" must be byte-identical after delete`).toBe(before[h]);
    }
    // No orphaned `## Canonical` text remains anywhere.
    expect(out).not.toContain('## Canonical candidate via add');
  });

  it('merge removes the block like delete (intent differs; content effect is removal)', () => {
    const out = applyDisposition(content, 1, 'merge', REASON, DATE);
    expect(out).not.toContain('## Hand-authored candidate');
    expect(parseEntries(out).length).toBe(parseEntries(content).length - 1);
  });

  it('shared 6-word-prefix Status lines do not cross-contaminate', () => {
    const twin =
      '## Alpha entry\n\n' +
      '**Status:** Logged 2026-05-01 during a planning conversation here.\n\n' +
      'Body A.\n\n---\n\n' +
      '## Beta entry\n\n' +
      '**Status:** Logged 2026-05-01 during a planning conversation here too.\n\n' +
      'Body B.\n\n---\n';
    const before = blocksByHeading(twin);
    const out = applyDisposition(twin, 0, 'defer', REASON, DATE);
    // Beta's block is byte-identical — the prefix-sharing Status was not touched.
    expect(blocksByHeading(out)['Beta entry']).toBe(before['Beta entry']);
    expect(blocksByHeading(out)['Alpha entry']).toContain('→ Deferred');
  });
});

describe('applyDispositions (batch — "defer all remaining")', () => {
  it('stamps every supplied entry; non-targets untouched; descending-safe', () => {
    const candidates = listDrainCandidates(content);
    const indices = parseEntries(content)
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !e.dispositioned)
      .map(({ i }) => i);
    const out = applyDispositions(
      content,
      indices.map((entryIndex) => ({ entryIndex, verb: 'defer', reason: REASON, date: DATE }))
    );
    // Every former candidate is now dispositioned.
    expect(listDrainCandidates(out)).toEqual([]);
    // The two already-dispositioned blocks are byte-identical.
    const before = blocksByHeading(content);
    const after = blocksByHeading(out);
    expect(after['✓ SHIPPED — Already-shipped thing']).toBe(
      before['✓ SHIPPED — Already-shipped thing']
    );
    expect(after['Already-drained candidate']).toBe(before['Already-drained candidate']);
    // sanity: every candidate got a Deferred stamp
    for (const c of candidates) {
      expect(after[c.heading]).toContain('Deferred 2026-05-30');
    }
  });
});

describe('commands/plan.md drain step (S5.t3 — FR7.1-7.4, R1 hard gate)', () => {
  it('inserts `### 1b.` between Step 1 and Step 2 without renumbering Steps 2-6', () => {
    expect(planMd).toMatch(/^### 1b\. /m);
    // Untouched, numerically-referenced steps still present.
    expect(planMd).toContain('### 2. Research (Parallel Agents)');
    expect(planMd).toContain('### 4. Plan Validation (8 Dimensions)');
    // 1b. sits between Step 1 and Step 2.
    const i1 = planMd.indexOf('### 1. Load Context');
    const i1b = planMd.search(/^### 1b\. /m);
    const i2 = planMd.indexOf('### 2. Research (Parallel Agents)');
    expect(i1).toBeGreaterThan(-1);
    expect(i1b).toBeGreaterThan(i1);
    expect(i2).toBeGreaterThan(i1b);
  });

  it('FR7.1: reads candidates via the drain helper, all un-dispositioned (no window)', () => {
    expect(planMd).toContain('listDrainCandidates');
    expect(planMd).toContain('tools/lib/drain.js');
    expect(planMd).toMatch(/FUTURE-IDEAS\.md/);
  });

  it('FR7.2: advisory + skippable + "defer all remaining" batch', () => {
    expect(planMd.toLowerCase()).toContain('advisory');
    expect(planMd.toLowerCase()).toMatch(/skip the whole step|fully skippable|skippable/);
    expect(planMd).toMatch(/defer all remaining/i);
  });

  it('FR7.2/7.3: per-entry strict-enum offers promote/defer/merge/delete + explicit skip', () => {
    expect(planMd).toMatch(/strict-enum/);
    for (const verb of ['promote', 'defer', 'merge', 'delete']) {
      expect(planMd, `drain step must offer "${verb}"`).toContain(verb);
    }
  });

  it('FR7.3 + R5: delete/merge confirm regardless of gate_strictness; keep preserves', () => {
    expect(planMd).toMatch(/\[confirm, keep\]/);
    expect(planMd).toMatch(/regardless of `?gate_strictness`?/);
  });

  it('R1 HARD GATE: previews the diff before any disposition write', () => {
    expect(planMd).toMatch(/HARD GATE/);
    expect(planMd.toLowerCase()).toContain('preview');
    expect(planMd).toContain('applyDispositionToFile');
  });

  it('FR7.4: empty candidate set emits a one-line note and continues', () => {
    expect(planMd).toContain('(no FUTURE-IDEAS candidates to drain)');
  });
});

describe('applyDispositionToFile (R5 delete/merge confirm gate + atomic write)', () => {
  let tempDir;
  let target;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'drain-write-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    target = join(tempDir, '.planning', 'FUTURE-IDEAS.md');
    await copyFile(FIXTURE, target);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('delete + confirm "keep" leaves the file BYTE-for-byte unchanged, no prompt bypass', async () => {
    const original = await readFile(target, 'utf-8');
    let prompted = false;
    const res = await applyDispositionToFile(tempDir, '.planning/FUTURE-IDEAS.md', {
      entryIndex: 0,
      verb: 'delete',
      reason: REASON,
      date: DATE,
      confirmPrompt: async () => {
        prompted = true;
        return 'keep';
      },
    });
    expect(prompted).toBe(true); // confirm gate fired
    expect(res.written).toBe(false);
    expect(await readFile(target, 'utf-8')).toBe(original);
  });

  it('delete + confirm "confirm" removes exactly that block', async () => {
    const res = await applyDispositionToFile(tempDir, '.planning/FUTURE-IDEAS.md', {
      entryIndex: 0,
      verb: 'delete',
      reason: REASON,
      date: DATE,
      confirmPrompt: async () => 'confirm',
    });
    expect(res.written).toBe(true);
    const after = await readFile(target, 'utf-8');
    expect(after).not.toContain('## Canonical candidate via add');
    expect(parseEntries(after).length).toBe(7 - 1);
  });

  it('defer does NOT invoke the confirm prompt (non-destructive) and stamps the file', async () => {
    let prompted = false;
    const res = await applyDispositionToFile(tempDir, '.planning/FUTURE-IDEAS.md', {
      entryIndex: 0,
      verb: 'defer',
      reason: REASON,
      date: DATE,
      confirmPrompt: async () => {
        prompted = true;
        return 'confirm';
      },
    });
    expect(prompted).toBe(false);
    expect(res.written).toBe(true);
    expect(await readFile(target, 'utf-8')).toContain('→ Deferred 2026-05-30 (M4.5.E2 drain).');
  });

  it('rename failure leaves the file unchanged (atomic-write invariant forwarded)', async () => {
    const original = await readFile(target, 'utf-8');
    const renameFn = async () => {
      throw new Error('simulated rename failure');
    };
    await expect(
      applyDispositionToFile(tempDir, '.planning/FUTURE-IDEAS.md', {
        entryIndex: 0,
        verb: 'defer',
        reason: REASON,
        date: DATE,
        renameFn,
      })
    ).rejects.toThrow(/simulated rename/);
    expect(await readFile(target, 'utf-8')).toBe(original);
  });
});
