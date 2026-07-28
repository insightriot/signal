import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyCommandCorpus } from '../tools/lib/directive-classifier.js';
import { classifyDocGrowthPolicy } from '../tools/lib/migrate-memory.js';
import {
  ADHERENCE_LOG,
  CEILING_BEGIN,
  CEILING_END,
  RUNS_MARKER,
  renderCeilingSection,
  upsertCeiling,
} from '../tools/lib/adherence-log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_PATH = join(ROOT, '.planning', ADHERENCE_LOG);

/**
 * FR5 / AC5.2 + AC5.3 — the published coverage ceiling.
 *
 * Pinned at RED commit time (M5.E8.S1.t2) before tools/lib/adherence-log.js and
 * .planning/ADHERENCE-LOG.md exist.
 *
 * AC5.3 is a WORDING test, and that is deliberate. The claim it guards —
 * "the unmeasured remainder is unmeasured, not passing" — is a sentence, and
 * sentences erode. A future edit that softens it to "not yet verified" or drops
 * it as redundant fails here, loudly, with this comment attached.
 */

describe('adherence ceiling — rendering (AC5.2)', () => {
  const corpus = classifyCommandCorpus(ROOT);

  it('renders the fraction as both counts and a percentage', () => {
    const section = renderCeilingSection(corpus, { computedAt: '2026-07-28', commit: 'abc1234' });
    const { measurable, directives } = corpus.counts;
    expect(section).toContain(String(measurable));
    expect(section).toContain(String(directives));
    expect(section).toMatch(/\d+\.\d%/);
  });

  it('states plainly that the unmeasured remainder is unmeasured, NOT passing (AC5.3)', () => {
    const section = renderCeilingSection(corpus, { computedAt: '2026-07-28', commit: 'abc1234' });
    expect(section.toLowerCase()).toMatch(/unmeasured,?\s+not\s+passing/);
  });

  it('records how the number was produced so it can be recomputed', () => {
    const section = renderCeilingSection(corpus, { computedAt: '2026-07-28', commit: 'abc1234' });
    expect(section).toContain('abc1234');
    expect(section).toContain('2026-07-28');
  });
});

describe('adherence ceiling — upsert preserves run records (AC4.2 boundary)', () => {
  const corpus = classifyCommandCorpus(ROOT);
  const section = renderCeilingSection(corpus, { computedAt: '2026-07-28', commit: 'abc1234' });

  it('replaces only the marked ceiling block, never anything below the runs marker', () => {
    const existing = [
      '# Adherence Log',
      CEILING_BEGIN,
      'STALE CEILING CONTENT — must be replaced',
      CEILING_END,
      RUNS_MARKER,
      '',
      '## Run 2026-07-28 — the first measurement',
      'a prior run record that must survive verbatim',
    ].join('\n');

    const updated = upsertCeiling(existing, section);
    expect(updated).not.toContain('STALE CEILING CONTENT');
    expect(updated).toContain('a prior run record that must survive verbatim');
    expect(updated).toContain('## Run 2026-07-28 — the first measurement');
  });

  it('is idempotent — upserting the same section twice changes nothing', () => {
    const once = upsertCeiling(`# Adherence Log\n${CEILING_BEGIN}\nx\n${CEILING_END}\n${RUNS_MARKER}\n`, section);
    expect(upsertCeiling(once, section)).toBe(once);
  });
});

describe('adherence ceiling — the published file (AC5.2)', () => {
  it('.planning/ADHERENCE-LOG.md exists and carries the ceiling', () => {
    expect(existsSync(LOG_PATH)).toBe(true);
    const content = readFileSync(LOG_PATH, 'utf-8');
    expect(content).toContain(CEILING_BEGIN);
    expect(content).toContain(RUNS_MARKER);
  });

  it('the published fraction is CURRENT — via the staleness checker itself', () => {
    // Was `expect(content).toContain('91')`, which passes if those digits appear
    // anywhere in the file — a commit sha, another table cell, a future run
    // record. It could not detect a stale ceiling, which is the only thing it
    // was there to detect.
    //
    // `tools/adherence-ceiling.js --check` already does the correct structural
    // comparison against the live corpus, and nothing called it. Now the test IS
    // the caller: one source of truth, and the staleness guard runs on every
    // `npm test`.
    const result = spawnSync('node', [join(ROOT, 'tools/adherence-ceiling.js'), '--check'], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    expect(
      result.status,
      `ceiling is stale — run \`node tools/adherence-ceiling.js\`.\n${result.stderr ?? ''}`
    ).toBe(0);
  });

  it('the published counts are the structural table rows, not stray digits', () => {
    const content = readFileSync(LOG_PATH, 'utf-8');
    const { measurable, directives, unmeasurable } = classifyCommandCorpus(ROOT).counts;
    expect(content).toContain(`| Directive lines | **${directives}** |`);
    expect(content).toContain(`| **Trace-measurable (either)** | **${measurable}** |`);
    expect(content).toContain(`| **No observable trace** | **${unmeasurable}** |`);
  });

  it('the published file states the unmeasured/not-passing clause (AC5.3)', () => {
    const content = readFileSync(LOG_PATH, 'utf-8').toLowerCase();
    expect(content).toMatch(/unmeasured,?\s+not\s+passing/);
  });
});

describe('adherence log — doc-runtime registration', () => {
  it('is classified as an append-log so migrate never relocates its body', () => {
    // A permanently-growing measurement history classified as `other` would be a
    // bloat-relocation candidate. FR4 makes this file append-only; the growth
    // policy has to agree.
    expect(classifyDocGrowthPolicy(ADHERENCE_LOG)).toBe('append-log');
  });
});
