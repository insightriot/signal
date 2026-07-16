import { describe, it, expect } from 'vitest';
import {
  extractIds,
  extractDates,
  extractStatusTokens,
  verifyCardCoverage,
  extractEpicSection,
  extractCarryOvers,
  deriveEpicArchiveDir,
} from '../tools/lib/evict.js';

// A realistic closed-Epic narrative (the thing evict-on-close relocates).
const SOURCE = [
  '## M5.E1 — Doc-runtime & memory hygiene',
  '',
  'Shipped 2026-07-16. Decisions D-M5E1-1, D-M5E1-3, D-M5E1-6 locked the model.',
  'FR1 (canonical model) + FR2b (evict-on-close) delivered; AC1 and AC3 verified.',
  'Carry-over: the derived-vs-hand-curated INDEX conflict is deferred to E2 (still open).',
].join('\n');

describe('extractIds / extractDates / extractStatusTokens', () => {
  it('extracts Epic-deep, decision, FR and AC ids', () => {
    const ids = extractIds(SOURCE);
    expect(ids).toContain('M5.E1');
    expect(ids).toContain('D-M5E1-1');
    expect(ids).toContain('D-M5E1-3');
    expect(ids).toContain('D-M5E1-6');
    expect(ids).toContain('FR1');
    expect(ids).toContain('FR2b');
    expect(ids).toContain('AC1');
    expect(ids).toContain('AC3');
  });

  it('does not treat a bare milestone/epic mention like "E2" as an id', () => {
    // E2 (no M-prefix) is not an Epic-deep id — avoids GC'ing forward-reference prose.
    expect(extractIds('deferred to E2')).toEqual([]);
  });

  it('does not confuse M5.E1 with M5.E10 (word boundary)', () => {
    const ids = extractIds('work on M5.E10 continues');
    expect(ids).toContain('M5.E10');
    expect(ids).not.toContain('M5.E1');
  });

  it('extracts ISO dates', () => {
    expect(extractDates(SOURCE)).toEqual(['2026-07-16']);
  });

  it('extracts distinct status-token types', () => {
    const toks = extractStatusTokens(SOURCE);
    expect(toks).toContain('deferred');
    expect(toks).toContain('open');
    expect(toks).toContain('carry-over');
  });
});

describe('verifyCardCoverage — the faithfulness gate (deterministic backstop)', () => {
  it('PASSES a golden card that carries every id/date/token', () => {
    const golden = [
      '# M5.E1 Retrospective',
      'Outcome: doc-runtime model shipped 2026-07-16 (M5.E1).',
      'Decisions D-M5E1-1, D-M5E1-3, D-M5E1-6 locked. FR1 + FR2b done; AC1, AC3 verified.',
      'Open carry-over deferred to E2: derived-vs-hand-curated INDEX.',
    ].join('\n');
    const result = verifyCardCoverage(SOURCE, golden);
    expect(result.pass).toBe(true);
    expect(result.missing.ids).toEqual([]);
    expect(result.missing.dates).toEqual([]);
    expect(result.missing.tokens).toEqual([]);
  });

  it('FAILS a lossy card and names exactly what was dropped', () => {
    // Drops decision D-M5E1-3 and AC3 (ids the backstop checks), the 2026-07-16
    // date, and the whole carry-over/deferred/open line (status tokens).
    const lossy = [
      '# M5.E1 Retrospective',
      'Outcome: doc-runtime model shipped (M5.E1).',
      'Decisions D-M5E1-1, D-M5E1-6 locked. FR1 + FR2b done; AC1 verified.',
    ].join('\n');
    const result = verifyCardCoverage(SOURCE, lossy);
    expect(result.pass).toBe(false);
    expect(result.missing.ids).toContain('D-M5E1-3');
    expect(result.missing.ids).toContain('AC3');
    expect(result.missing.dates).toContain('2026-07-16');
    expect(result.missing.tokens).toContain('deferred');
  });

  it('PASSES when a dropped item is on the explicit dropped-list', () => {
    const card = [
      '# M5.E1 Retrospective',
      'Shipped 2026-07-16 (M5.E1). D-M5E1-1, D-M5E1-6. FR1, FR2b. AC1, AC3.',
      'Deferred, open carry-over to E2.',
    ].join('\n');
    // D-M5E1-3 is intentionally omitted from the card but acknowledged.
    const result = verifyCardCoverage(SOURCE, card, { dropped: ['D-M5E1-3'] });
    expect(result.pass).toBe(true);
    expect(result.missing.ids).toEqual([]);
  });

  it('an empty card fails (everything missing)', () => {
    const result = verifyCardCoverage(SOURCE, '');
    expect(result.pass).toBe(false);
    expect(result.missing.ids.length).toBeGreaterThan(0);
  });

  it('REVIEW fix (I-1): a longer ID does NOT falsely cover a shorter one (bounded, not substring)', () => {
    // A plain `includes` would count source M5.E1/AC1/FR2 as covered by a card
    // that only mentions M5.E10/AC10/FR2b — PASSING a lossy card (wrong way).
    const source = 'Closed M5.E1. AC1 verified. FR2 delivered.';
    const card = 'Work continues on M5.E10; AC10 and AC12 remain. FR2b shipped.';
    const result = verifyCardCoverage(source, card);
    expect(result.pass).toBe(false);
    expect(result.missing.ids).toEqual(expect.arrayContaining(['M5.E1', 'AC1', 'FR2']));
  });

  it('REVIEW fix (I-1): an exact ID mention (even with a trailing period) still counts as covered', () => {
    const result = verifyCardCoverage('Closed M5.E1. AC1. FR2.', 'Shipped M5.E1. AC1 ok, FR2 done.');
    expect(result.pass).toBe(true);
  });
});

describe('extractEpicSection — scope to the closing unit only', () => {
  const BODY = [
    '# Project State',
    '',
    '## In-flight',
    '',
    'Working on things.',
    '',
    '## M4.5.E11 — Epic-native flow',
    '',
    'Closed narrative for E11. D-E11-4 decided.',
    '',
    '## M5.E1 — Doc-runtime',
    '',
    'M5.E1 narrative. FR1 shipped 2026-07-16.',
    '',
    '### S3 detail',
    '',
    'Sub-detail that belongs to the M5.E1 block.',
    '',
    '## Closed work',
    '',
    '- an existing pointer',
    '',
  ].join('\n');

  it('extracts the target Epic block including its subsections', () => {
    const r = extractEpicSection(BODY, 'M5.E1');
    expect(r.found).toBe(true);
    expect(r.section).toContain('## M5.E1 — Doc-runtime');
    expect(r.section).toContain('### S3 detail');
    expect(r.section).toContain('Sub-detail that belongs');
    // stops before the next same-level heading
    expect(r.section).not.toContain('## Closed work');
  });

  it('leaves the other Epic block (M4.5.E11) untouched in `before`', () => {
    const r = extractEpicSection(BODY, 'M5.E1');
    expect(r.before).toContain('## M4.5.E11 — Epic-native flow');
    expect(r.before).toContain('D-E11-4');
    expect(r.section).not.toContain('E11');
  });

  it('partitions the body exactly (before + section + after === body)', () => {
    const r = extractEpicSection(BODY, 'M5.E1');
    expect(r.before + r.section + r.after).toBe(BODY);
  });

  it('does not match M5.E10 when asked for M5.E1', () => {
    const body = '## M5.E10 — later epic\n\nnarrative\n';
    expect(extractEpicSection(body, 'M5.E1').found).toBe(false);
  });

  it('returns {found:false} for a missing epic or malformed id', () => {
    expect(extractEpicSection(BODY, 'M9.E9').found).toBe(false);
    expect(extractEpicSection(BODY, 'not-an-id').found).toBe(false);
    expect(extractEpicSection('', 'M5.E1').found).toBe(false);
  });
});

describe('extractCarryOvers', () => {
  it('lifts only the lines carrying an open/deferred/blocker token', () => {
    const section = [
      '## M5.E1 — Doc-runtime',
      '',
      'Shipped FR1 and FR2b.',
      '- Carry-over: INDEX derived-vs-hand-curated conflict is deferred to E2.',
      '- Blocker: none.',
      'Everything else is done.',
    ].join('\n');
    const carry = extractCarryOvers(section);
    expect(carry).toContain('- Carry-over: INDEX derived-vs-hand-curated conflict is deferred to E2.');
    expect(carry.some((l) => l.includes('Everything else is done'))).toBe(false);
    // headings are never lifted
    expect(carry.some((l) => l.startsWith('#'))).toBe(false);
  });

  it('returns [] for a section with no open items', () => {
    expect(extractCarryOvers('## X\n\nAll done. Shipped.')).toEqual([]);
  });
});

describe('deriveEpicArchiveDir', () => {
  it('maps an epic id to its unit-homed archive dir', () => {
    expect(deriveEpicArchiveDir('M5.E1')).toBe('.planning/archive/M5/E1');
    expect(deriveEpicArchiveDir('M4.5.E10')).toBe('.planning/archive/M4.5/E10');
  });

  it('throws on a malformed epic id', () => {
    expect(() => deriveEpicArchiveDir('E9')).toThrow(/malformed/);
    expect(() => deriveEpicArchiveDir('M5')).toThrow(/malformed/);
  });
});
