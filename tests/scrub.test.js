// scrub.js — the sensitive-data detector as a leaf module (M6.E13.S2.t2.2a).
//
// It moved out of add.js so the v2 work library can scrub without reaching
// any Markdown list parser through add.js's imports (PLAN t2.2a, pass 3
// finding 2; Decision 12). add.js re-exports it, so every existing caller is
// unchanged.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { scrubSensitive, SENSITIVE_PATTERNS } from '../plugin/tools/lib/scrub.js';
import { scrubSensitive as fromAdd } from '../plugin/tools/lib/add.js';

const SOURCE = readFileSync(new URL('../plugin/tools/lib/scrub.js', import.meta.url), 'utf-8');

describe('scrub.js', () => {
  it('is a leaf: it imports nothing', () => {
    expect(SOURCE).not.toMatch(/^\s*import\s/m);
    expect(SOURCE).not.toMatch(/\bfrom\s*['"]/);
  });

  it('add.js re-exports the same function, not a copy', () => {
    expect(fromAdd).toBe(scrubSensitive);
  });

  it('keeps the four detectors, in order', () => {
    expect(SENSITIVE_PATTERNS.map((p) => p.type)).toEqual(['aws-key', 'github-token', 'bearer-token', 'hex-blob-40']);
  });

  it('reports every hit with type, match and index, and returns the body verbatim', () => {
    const body = `key AKIAABCDEFGHIJKLMNOP and ${'a'.repeat(40)}`;
    expect(scrubSensitive(body)).toEqual({
      hits: [
        { type: 'aws-key', match: 'AKIAABCDEFGHIJKLMNOP', index: 4 },
        { type: 'hex-blob-40', match: 'a'.repeat(40), index: 29 },
      ],
      body,
    });
  });

  it('gives the same answer on a second call (the g-flag regexes are reset)', () => {
    const body = 'Bearer abcdefghijk';
    expect(scrubSensitive(body).hits).toHaveLength(1);
    expect(scrubSensitive(body).hits).toHaveLength(1);
  });
});
