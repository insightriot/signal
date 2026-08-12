import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  FR_ID_RE,
  NFR_ID_RE,
  AC_ID_RE,
  matchIds,
  extractRequirementIds,
} from '../tools/lib/requirement-ids.js';

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

describe('AC S1.2 — NFR ids are recognised', () => {
  // The AC's literal example. `\bFR\d+` does not match `NFR1`: the word
  // boundary fails between `N` and `F`, mid-token.
  it('matches NFR1', () => {
    expect(matchIds('NFR1', NFR_ID_RE)).toEqual(['NFR1']);
  });

  // The AC's example is necessary but not sufficient. The field artifact this
  // Epic must read (see tests/fixtures/claim-integrity/) writes NFR-9.2, not NFR1 — a
  // matcher passing the AC and still unable to read the fixture would be this
  // Epic's own defect class.
  it('matches the field spellings: NFR-9 and NFR-9.2', () => {
    expect(matchIds('NFR-9 and NFR-9.2', NFR_ID_RE)).toEqual(['NFR-9', 'NFR-9.2']);
  });

  it('NFR-9 is not double-counted as an FR id', () => {
    // `\bFR` cannot match inside `NFR` — no word boundary between N and F.
    expect(matchIds('NFR-9.2', FR_ID_RE)).toEqual([]);
  });
});

describe('hyphenated spellings — the same concept, written differently', () => {
  it('matches FR-16 and FR-16.2', () => {
    expect(matchIds('FR-16 and FR-16.2', FR_ID_RE)).toEqual(['FR-16', 'FR-16.2']);
  });

  it('matches AC-16.10', () => {
    expect(matchIds('AC-16.10', AC_ID_RE)).toEqual(['AC-16.10']);
  });

  it('still excludes AC-seed — the digit is what makes it an id', () => {
    expect(matchIds('AC-seed', AC_ID_RE)).toEqual([]);
  });
});

describe('extractRequirementIds — FR1’s denominator', () => {
  it('composes FR + NFR + AC, and de-duplicates', () => {
    const text = 'FR1 covers AC1.2 and AC1.2 again; NFR1 is separate.';
    expect(extractRequirementIds(text).sort()).toEqual(['AC1.2', 'FR1', 'NFR1']);
  });

  it('reads a hyphen-scheme artifact — the field case', () => {
    const text = 'FR-16 with AC-16.1, AC-16.10 and NFR-9.2.';
    expect(extractRequirementIds(text).sort()).toEqual([
      'AC-16.1',
      'AC-16.10',
      'FR-16',
      'NFR-9.2',
    ]);
  });

  it('returns [] for empty input rather than throwing', () => {
    expect(extractRequirementIds('')).toEqual([]);
    expect(extractRequirementIds(null)).toEqual([]);
  });

  it('orders by family — FR, then NFR, then AC — because S2 prints this to a person', () => {
    // Not incidental: a family-grouped list reads as a report, an id-sorted one
    // reads as a dump and buries a lone missing NFR among ten ACs.
    const text = 'AC-16.10 comes first in the text, then NFR-9.2, then FR-16.';
    expect(extractRequirementIds(text)).toEqual(['FR-16', 'NFR-9.2', 'AC-16.10']);
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
