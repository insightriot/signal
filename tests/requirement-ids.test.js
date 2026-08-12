import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { FR_ID_RE, AC_ID_RE, matchIds } from '../tools/lib/requirement-ids.js';

const LIB_DIR = join(process.cwd(), 'tools', 'lib');

describe('matchIds', () => {
  it('returns distinct matches and never mutates the shared regex lastIndex', () => {
    const text = 'FR1 and FR2b, then FR1 again';
    expect(matchIds(text, FR_ID_RE)).toEqual(['FR1', 'FR2b']);
    // Called twice: a `/g` regex reused without resetting lastIndex silently
    // returns a DIFFERENT answer on the second call. That is the failure mode
    // a shared module makes possible, so it is pinned here.
    expect(matchIds(text, FR_ID_RE)).toEqual(['FR1', 'FR2b']);
  });

  it('returns [] for empty / nullish input', () => {
    expect(matchIds('', FR_ID_RE)).toEqual([]);
    expect(matchIds(null, FR_ID_RE)).toEqual([]);
    expect(matchIds(undefined, AC_ID_RE)).toEqual([]);
  });
});

describe('FR_ID_RE / AC_ID_RE — the shapes evict.js already recognised', () => {
  it('matches FR1, FR2a, FR2b', () => {
    expect(matchIds('FR1 FR2a FR2b', FR_ID_RE)).toEqual(['FR1', 'FR2a', 'FR2b']);
  });

  it('matches AC1 and AC6.4, and excludes AC-seed (needs a digit)', () => {
    expect(matchIds('AC1 AC6.4', AC_ID_RE)).toEqual(['AC1', 'AC6.4']);
    expect(matchIds('AC-seed', AC_ID_RE)).toEqual([]);
  });
});

describe('AC S1.1 — one module is the only place a requirement ID is recognised', () => {
  it('no other tools/lib module defines an FR / NFR / AC id pattern', async () => {
    // Derived, not hard-coded: the check walks the directory rather than
    // asserting against a list a future module could be added outside of.
    const files = (await readdir(LIB_DIR)).filter(
      (f) => f.endsWith('.js') && f !== 'requirement-ids.js'
    );
    const offenders = [];
    for (const f of files) {
      const src = await readFile(join(LIB_DIR, f), 'utf8');
      for (const line of src.split('\n')) {
        // A regex literal that recognises a requirement ID: the token, then a
        // digit matcher. Comments are excluded — prose about FR1 is not a
        // second implementation.
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/\/[^/\n]*\\b(?:N?FR|AC)[^/\n]*\\d[^/\n]*\//.test(line)) {
          offenders.push(`${f}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('evict.js consumes the shared module rather than declaring its own', async () => {
    const src = await readFile(join(LIB_DIR, 'evict.js'), 'utf8');
    expect(src).toMatch(/from '\.\/requirement-ids\.js'/);
  });
});
