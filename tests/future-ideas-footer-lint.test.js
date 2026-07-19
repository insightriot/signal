// FUTURE-IDEAS footer lint (M4.5.E10.S3.t3, FR4c, AC4.6).
//
// The complement of S3.t2's repair: repair FIXES a drifted footer on the next
// capture; this lint DETECTS drift so it can't silently accumulate. Housed as a
// dedicated test (not the plugin structure validator — this is project content,
// a Signal-dogfood self-check) that also asserts Signal's own FUTURE-IDEAS.md
// stays clean on every `npm test`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintFutureIdeasFooter } from '../tools/lib/add.js';
import { resolveInboxPath } from '../tools/lib/inbox-path.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

describe('lintFutureIdeasFooter (FR4c, AC4.6)', () => {
  it('AC4.6: fails when non-whitespace content follows the footer', () => {
    const drifted = [
      '# FUTURE-IDEAS',
      '',
      '## Idea',
      '',
      'Body.',
      '',
      '*Last updated: 2026-07-05*',
      '',
      '## Stranded idea',
      '',
      'This is below the footer.',
      '',
    ].join('\n');
    const result = lintFutureIdeasFooter(drifted);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/footer/i);
  });

  it('passes a clean file (footer is the last non-whitespace line)', () => {
    const clean =
      '# FUTURE-IDEAS\n\n## Idea\n\nBody.\n\n---\n\n*Last updated: 2026-07-05*\n';
    expect(lintFutureIdeasFooter(clean).ok).toBe(true);
  });

  it('ignores a fenced *Last updated:* sample (not the real footer)', () => {
    const withSample = [
      '# FUTURE-IDEAS',
      '',
      '## Idea showing footer syntax',
      '',
      '```',
      '*Last updated: 2099-09-09*',
      '```',
      '',
      'More body.',
      '',
      '---',
      '',
      '*Last updated: 2026-07-05*',
      '',
    ].join('\n');
    expect(lintFutureIdeasFooter(withSample).ok).toBe(true);
  });

  it('fails when there is more than one non-fenced footer', () => {
    const twoFooters = [
      '# FUTURE-IDEAS',
      '',
      '## Idea',
      '',
      '*Last updated: 2020-01-01*',
      '',
      '## Later idea',
      '',
      '*Last updated: 2026-07-05*',
      '',
    ].join('\n');
    expect(lintFutureIdeasFooter(twoFooters).ok).toBe(false);
  });

  it('treats a footerless file as out of scope (ok)', () => {
    expect(lintFutureIdeasFooter('# FUTURE-IDEAS\n\n## Idea\n\nBody.\n').ok).toBe(true);
  });

  // The load-bearing dogfood guard: Signal's own capture inbox must stay clean,
  // so a drift regression trips on the next `npm test`. Resolves via the
  // back-compat resolver (ISSUES-INBOX.md post-v3-migrate, FUTURE-IDEAS.md before).
  it("Signal's own capture inbox passes the lint", () => {
    const real = readFileSync(join(ROOT, resolveInboxPath(ROOT)), 'utf-8');
    const result = lintFutureIdeasFooter(real);
    expect(result.ok, result.message).toBe(true);
  });
});
