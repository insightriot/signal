// The citation verifier — `M6.E7` S1.
//
// This is the property the whole Epic claims, so the load-bearing tests here are
// not the happy paths. They are:
//
//   1. A quoted, non-resolving, path-like token OUTSIDE the evidence marker is
//      IGNORED. Measured on live `BACKLOG.md` rows: 108 backticked path-like
//      tokens, 51 of which do not resolve from repo root. A textual scan would
//      fire on the first quoted row and the artifact would never be written —
//      AC1.1 unsatisfiable while AC1.3 holds. The structural split is what makes
//      both true at once.
//   2. `ok` is FALSE when the scan truncated. A verifier that says "ok" about a
//      set it did not finish reading is the silent pass this repo keeps filing
//      bugs about.

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CITATION_SCAN_CEILING,
  EVIDENCE_MARKER,
  extractCitations,
  verifyCitations,
} from '../plugin/tools/lib/citations.js';

/** A throwaway repo root with a couple of files of known length. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'sig-citations-'));
  mkdirSync(join(base, '.planning'), { recursive: true });
  mkdirSync(join(base, 'plugin', 'tools', 'lib'), { recursive: true });
  // 10 lines, trailing newline. Valid line numbers are 1..10.
  writeFileSync(join(base, '.planning', 'BACKLOG.md'), Array.from({ length: 10 }, (_, i) => `row ${i + 1}`).join('\n') + '\n');
  // 4 lines, NO trailing newline — the off-by-one this is most likely to get wrong.
  writeFileSync(join(base, 'plugin', 'tools', 'lib', 'backlog.js'), 'a\nb\nc\nd');
  return base;
}

const ev = (tail) => `A claim about the corpus. ${EVIDENCE_MARKER} ${tail}`;

describe('extractCitations reads one structural position and nothing else', () => {
  it('ignores a quoted non-resolving path-like token outside the marker', () => {
    // t1.1b's core case, in the shape it actually occurs: the advisor quotes a
    // backlog row, and the row itself is full of backticked paths that are not
    // the advisor's claims.
    const text = ev('`.planning/BACKLOG.md:3`').replace(
      'A claim about the corpus.',
      'Row says `../analysis/LOOP-GOAL-DIRECTION.md` and `wiki/AGENTS.md` and `.landing.lock`.'
    );
    const found = extractCitations(text);
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('.planning/BACKLOG.md');
    expect(found[0].line).toBe(3);
  });

  it('finds nothing at all in a line with no marker, however many paths it quotes', () => {
    const text = 'Row quotes `plugin/tools/lib/backlog.js` and `.planning/BACKLOG.md:3`.';
    expect(extractCitations(text)).toEqual([]);
  });

  it('parses bare path, path:line, and both dash forms of a range', () => {
    const text = ev('`plugin/tools/lib/backlog.js`, `.planning/BACKLOG.md:3`, `.planning/BACKLOG.md:2-4`, `.planning/BACKLOG.md:5–7`');
    const found = extractCitations(text);
    expect(found.map((c) => [c.path, c.line ?? null, c.lineEnd ?? null])).toEqual([
      ['plugin/tools/lib/backlog.js', null, null],
      ['.planning/BACKLOG.md', 3, null],
      ['.planning/BACKLOG.md', 2, 4],
      ['.planning/BACKLOG.md', 5, 7],
    ]);
  });

  it('keeps the raw token and its offset, so a failure can be pointed at', () => {
    const text = ev('`.planning/BACKLOG.md:3`');
    const [c] = extractCitations(text);
    expect(c.raw).toBe('.planning/BACKLOG.md:3');
    expect(text.slice(c.offset, c.offset + c.raw.length)).toBe(c.raw);
  });

  it('collects an unparseable token rather than dropping it', () => {
    // Under-reporting is the failure mode this repo files bugs about. A token in
    // the evidence position that is not a citation must fail loudly downstream,
    // not vanish.
    const found = extractCitations(ev('`not a path at all`'));
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('not a path at all');
  });
});

describe('verifyCitations resolves against disk', () => {
  it('resolves a path with no line, and a path with an in-range line', async () => {
    const base = fixture();
    const r = await verifyCitations(base, ev('`plugin/tools/lib/backlog.js`, `.planning/BACKLOG.md:10`'));
    expect(r.unresolved).toEqual([]);
    expect(r.resolved).toHaveLength(2);
    expect(r.ok).toBe(true);
  });

  it('refuses a missing path', async () => {
    const base = fixture();
    const r = await verifyCitations(base, ev('`.planning/NOPE.md`'));
    expect(r.ok).toBe(false);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0].reason).toMatch(/does not exist/i);
  });

  it('refuses a real path with an out-of-range line', async () => {
    const base = fixture();
    const r = await verifyCitations(base, ev('`.planning/BACKLOG.md:11`'));
    expect(r.ok).toBe(false);
    expect(r.unresolved[0].reason).toMatch(/only 10 lines/);
  });

  it('counts the last line of a file with no trailing newline', async () => {
    // `backlog.js` in the fixture is 'a\nb\nc\nd' — four lines. A naive
    // split('\n').length is right here and wrong on the file that HAS a trailing
    // newline, which is why both are asserted.
    const base = fixture();
    const ok = await verifyCitations(base, ev('`plugin/tools/lib/backlog.js:4`'));
    expect(ok.ok).toBe(true);
    const over = await verifyCitations(base, ev('`plugin/tools/lib/backlog.js:5`'));
    expect(over.ok).toBe(false);
  });

  it('refuses a range with one end out, and a reversed range', async () => {
    const base = fixture();
    const outEnd = await verifyCitations(base, ev('`.planning/BACKLOG.md:8-12`'));
    expect(outEnd.ok).toBe(false);
    expect(outEnd.unresolved[0].reason).toMatch(/only 10 lines/);

    const reversed = await verifyCitations(base, ev('`.planning/BACKLOG.md:7-3`'));
    expect(reversed.ok).toBe(false);
    expect(reversed.unresolved[0].reason).toMatch(/ends before its start|reversed/i);
  });

  it('accepts an en-dash range and a non-.md extension', async () => {
    const base = fixture();
    const r = await verifyCitations(base, ev('`plugin/tools/lib/backlog.js:1–4`'));
    expect(r.ok).toBe(true);
    expect(r.resolved).toHaveLength(1);
  });

  it('refuses a directory, which exists but cannot carry a line', async () => {
    const base = fixture();
    const r = await verifyCitations(base, ev('`.planning`'));
    expect(r.ok).toBe(false);
    expect(r.unresolved[0].reason).toMatch(/directory/i);
  });

  it('returns ok on zero citations — correct here, and VACUOUS at the gate', async () => {
    // Pinned deliberately. t3.5's run boundary asserts a COUNT precisely because
    // this is true: an extractor that missed the renderer's grammar would hand a
    // `ok: true` to a caller that checked only the flag.
    const base = fixture();
    const r = await verifyCitations(base, 'A claim with no evidence marker at all.');
    expect(r.ok).toBe(true);
    expect(r.resolved).toEqual([]);
    expect(r.unresolved).toEqual([]);
  });
});

describe('confinement happens before any disk touch (B22)', () => {
  it('refuses an absolute path', async () => {
    const base = fixture();
    const r = await verifyCitations(base, ev('`/etc/passwd`'));
    expect(r.ok).toBe(false);
    expect(r.unresolved[0].reason).toMatch(/repo-root-relative|outside the repo/i);
  });

  it('refuses a traversal that escapes the repo root', async () => {
    const base = fixture();
    const r = await verifyCitations(base, ev('`../../../etc/passwd`'));
    expect(r.ok).toBe(false);
    expect(r.unresolved[0].reason).toMatch(/outside the repo/i);
  });

  it('refuses a path that escapes through a directory symlink', async () => {
    // The lexical guard normalizes `..` and does not follow symlinks; this is the
    // case that needs the realpath re-assert.
    const base = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'sig-citations-outside-'));
    writeFileSync(join(outside, 'secret.txt'), 'x\n');
    symlinkSync(outside, join(base, 'escape'));
    const r = await verifyCitations(base, ev('`escape/secret.txt`'));
    expect(r.ok).toBe(false);
    expect(r.unresolved[0].reason).toMatch(/outside the repo/i);
  });
});

describe('the scan ceiling reports truncation rather than under-reporting (B15)', () => {
  it('marks truncated and refuses ok when there are more citations than the ceiling', async () => {
    const base = fixture();
    const many = Array.from({ length: CITATION_SCAN_CEILING + 5 }, () => '`.planning/BACKLOG.md:1`').join(', ');
    const r = await verifyCitations(base, ev(many));
    expect(r.truncated).toBeTruthy();
    expect(r.truncated.total).toBe(CITATION_SCAN_CEILING + 5);
    expect(r.truncated.limit).toBe(CITATION_SCAN_CEILING);
    // Every citation it DID look at resolves — and it still is not ok, because
    // it did not look at all of them.
    expect(r.unresolved).toEqual([]);
    expect(r.ok).toBe(false);
  });
});
